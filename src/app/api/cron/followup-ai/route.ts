import { createClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { sendWhatsApp, isSenderConfigured } from '@/lib/services/whatsappSender';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_FOLLOWUP_SLA: Record<string, number> = {
    ataque: 6,
    triagem: 6,
    fechamento: 3,
    confirmed: 6,
    scheduled: 6,
    negotiation: 3,
    proposed: 3,
};

type SlaRow = { origem: string; stage: string; followup_hours: number | null };
type FollowupMap = Map<string, number>;

async function loadFollowupMap(admin: ReturnType<typeof createClient>): Promise<FollowupMap> {
    const { data } = await admin
        .from('sla_config')
        .select('origem, stage, followup_hours')
        .not('followup_hours', 'is', null);
    const map: FollowupMap = new Map();
    for (const row of (data as SlaRow[] || [])) {
        if (row.followup_hours !== null) {
            map.set(`${row.origem}|${row.stage}`, row.followup_hours);
        }
    }
    return map;
}

function getFollowupHours(origem: string | null | undefined, status: string, map: FollowupMap): number {
    const stageMap: Record<string, string> = {
        confirmed: 'ataque', scheduled: 'ataque',
        negotiation: 'fechamento', proposed: 'fechamento',
    };
    const stage = stageMap[status] || status;
    const key = `${origem || ''}|${stage}`;
    if (map.has(key)) return map.get(key)!;
    const defKey = `default|${stage}`;
    if (map.has(defKey)) return map.get(defKey)!;
    return DEFAULT_FOLLOWUP_SLA[status] ?? 6;
}

/**
 * GET /api/cron/followup-ai
 *
 * Roda a cada 1h via daily-batch. Para leads parados além do SLA da origem,
 * gera mensagem com GPT-4o-mini e ENVIA direto ao cliente via whatsappSender.
 * Registra em follow_ups (status='sent' se enviou, 'pending' se falhou),
 * e em interactions_manos_crm (audit trail).
 *
 * Idempotência: pula leads com follow-up ai_auto pendente OU enviado nas
 * últimas 24h, e respeita flag ai_followup_enabled (default true).
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    return await withHeartbeat('followup-ai', async () => {
        const out = await runFollowupAi();
        return { result: NextResponse.json(out), metrics: out };
    });
}

async function runFollowupAi() {
    const admin = createClient();
    const now = Date.now();
    const log: string[] = [];
    let generated = 0, sent = 0, skipped = 0, failed = 0;

    if (!isSenderConfigured()) {
        log.push('⚠️ Sender não configurado — gerando msgs mas sem enviar.');
    }

    const followupMap = await loadFollowupMap(admin);
    const activeStatuses = Object.keys(DEFAULT_FOLLOWUP_SLA);

    const { data: leads, error } = await admin
        .from('leads_manos_crm')
        .select('id, name, phone, vehicle_interest, proxima_acao, next_step, status, updated_at, assigned_consultant_id, valor_investimento, carro_troca, source, ai_followup_enabled')
        .in('status', activeStatuses)
        .is('archived_at', null)
        .order('updated_at', { ascending: true })
        .limit(30);

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const eligible = (leads || []).filter((l: any) => {
        if (l.ai_followup_enabled === false) return false;
        const slaH = getFollowupHours(l.source, l.status, followupMap);
        const hoursInactive = (now - new Date(l.updated_at || 0).getTime()) / 3_600_000;
        return hoursInactive >= slaH;
    });

    log.push(`🎯 ${eligible.length} leads elegíveis (de ${leads?.length ?? 0} ativos)`);

    const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();

    for (const lead of eligible) {
        try {
            const { data: existing } = await admin
                .from('follow_ups')
                .select('id, status, scheduled_at')
                .eq('lead_id', lead.id)
                .eq('type', 'ai_auto')
                .gte('scheduled_at', dayAgo)
                .order('scheduled_at', { ascending: false })
                .limit(1);

            if (existing && existing.length > 0) {
                skipped++;
                continue;
            }

            const res = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: `Lead da Manos Veículos (Rio do Sul/SC):
- Nome: ${lead.name}
- Interesse: ${lead.vehicle_interest || 'não informado'}
- Investimento: ${lead.valor_investimento || 'não informado'}
- Estágio: ${lead.status}
- Última ação sugerida: "${lead.proxima_acao || lead.next_step || 'sem ação prévia'}"

Gere UMA mensagem de reengajamento curta (1-2 frases, máx 220 chars) para WhatsApp. Sem "tudo bem?", sem gerundismo. Comece pelo primeiro nome. Termine com pergunta direta. Crie urgência real (ex: condição limitada, agenda apertada).

JSON: { "mensagem": "..." }`,
                }],
                response_format: { type: 'json_object' },
                temperature: 0.45,
                max_tokens: 150,
            });

            const result = JSON.parse(res.choices[0]?.message?.content || '{}');
            const firstName = (lead.name || 'Cliente').split(' ')[0];
            const msg = (result.mensagem || '').trim() ||
                `${firstName}, ainda tenho condição reservada no ${lead.vehicle_interest || 'veículo de interesse'}. Posso te chamar agora?`;

            const priority = ['fechamento', 'negotiation', 'proposed'].includes(lead.status) ? 'high' : 'medium';
            generated++;

            // Tenta enviar de fato ao cliente
            let sendResult: { ok: boolean; provider: string; error?: string } = { ok: false, provider: 'none' };
            if (lead.phone && isSenderConfigured()) {
                sendResult = await sendWhatsApp({
                    toPhone: lead.phone,
                    message: msg,
                    kind: 'ai_followup',
                    leadId: lead.id,
                });
                if (sendResult.ok) sent++;
                else failed++;
            }

            await admin.from('follow_ups').insert({
                lead_id: lead.id,
                user_id: lead.assigned_consultant_id || 'system',
                scheduled_at: new Date().toISOString(),
                type: 'ai_auto',
                note: msg,
                priority,
                status: sendResult.ok ? 'sent' : 'pending',
            });

            // Audit trail (best-effort)
            void admin.from('interactions_manos_crm').insert({
                lead_id: lead.id,
                notes: sendResult.ok
                    ? `[IA AUTO ENVIADO via ${sendResult.provider}] "${msg}"`
                    : `[IA AUTO GERADO sem envio: ${sendResult.error || 'sem provider'}] "${msg}"`,
                new_status: lead.status,
                type: 'ai_followup',
                created_at: new Date().toISOString(),
            }).then(null, () => {});

            // Atualiza lead pra evitar reenvio em loop + insere bolha no chat
            if (sendResult.ok) {
                await admin.from('leads_manos_crm')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', lead.id);

                // Bolha 'outbound' no chat — vendedor vê em tempo real
                await admin.from('whatsapp_messages').insert({
                    lead_id: lead.id,
                    direction: 'outbound',
                    message_text: msg,
                    message_id: `ai_followup_${Date.now()}`,
                }).then(null, () => {});
            }

            log.push(`${sendResult.ok ? '📤' : '📝'} ${lead.name} (${lead.status}) → "${msg.slice(0, 60)}..."`);
        } catch (e: any) {
            failed++;
            log.push(`❌ ${lead.name} → ${e?.message}`);
        }
    }

    return { success: true, generated, sent, skipped, failed, log };
}
