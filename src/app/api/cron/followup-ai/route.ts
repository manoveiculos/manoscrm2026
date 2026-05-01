import { createClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { sendWhatsApp, isSenderConfigured } from '@/lib/services/whatsappSender';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { findMatch, getRecentForPrompt, formatVehicle, AltimusVehicle } from '@/lib/services/altimusInventory';

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

    // --- CHECK GLOBAL SETTINGS ---
    const { data: settings } = await admin
        .from('system_settings')
        .select('*');
    
    const globalPause = settings?.find(s => s.id === 'global')?.ai_paused ?? false;
    const aiConfig = settings?.find(s => s.id === 'ai_config')?.value ?? {};
    const followupEnabled = aiConfig.followup_enabled ?? true;

    if (globalPause) {
        return { success: true, message: 'IA pausada globalmente.', log: ['IA pausada globalmente.'] };
    }
    if (!followupEnabled) {
        return { success: true, message: 'Follow-up automático desabilitado.', log: ['Follow-up automático desabilitado nas configurações.'] };
    }

    // Horário de funcionamento check
    const nowObj = new Date();
    const currentStr = nowObj.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const startHour = aiConfig.start_hour || '08:00';
    const endHour = aiConfig.end_hour || '20:00';

    if (currentStr < startHour || currentStr > endHour) {
        log.push(`💤 Fora do horário de funcionamento (${startHour} - ${endHour}). Atual: ${currentStr}`);
        return { success: true, message: 'Fora do horário de funcionamento.', log };
    }

    const { data: leads, error } = await admin
        .from('leads_manos_crm')
        .select('id, name, phone, vehicle_interest, proxima_acao, next_step, status, updated_at, assigned_consultant_id, valor_investimento, carro_troca, source, ai_followup_enabled, ai_classification, behavioral_profile, ai_summary')
        .in('status', activeStatuses)
        .is('archived_at', null)
        .order('updated_at', { ascending: true })
        .limit(30);

    if (error) {
        return { success: false, error: error.message };
    }

    const eligible = (leads || []).filter((l: any) => {
        if (l.ai_followup_enabled === false) return false;
        
        // SLA dinâmico por temperatura
        let slaH = getFollowupHours(l.source, l.status, followupMap);
        if (l.ai_classification === 'hot') slaH = Math.max(1, Math.floor(slaH * 0.5)); // Hot leads = metade do tempo
        if (l.ai_classification === 'cold') slaH = slaH * 2; // Cold leads = dobro do tempo

        const hoursInactive = (now - new Date(l.updated_at || 0).getTime()) / 3_600_000;
        return hoursInactive >= slaH;
    });

    log.push(`🎯 ${eligible.length} leads elegíveis (de ${leads?.length ?? 0} ativos)`);

    const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();

    for (const lead of eligible) {
        try {
            // ... (check existing followups) ...
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

            const firstName = (lead.name || 'Cliente').split(' ')[0];
            const behavior = (lead.behavioral_profile as any) || {};
            const sentiment = behavior.sentiment || 'Curioso';

            // ── ANTI-ALUCINAÇÃO: estoque REAL da Altimus ──────────────────
            const matchedVehicle = await findMatch(lead.vehicle_interest);
            const recentInventory = await getRecentForPrompt(10);
            const altimusOk = recentInventory.length > 0 || matchedVehicle !== null;

            let msg: string;
            let mode: 'matched' | 'similar' | 'generic_safe' = 'generic_safe';

            if (!altimusOk) {
                msg = `${firstName}, ainda estou com seu interesse aqui no ${lead.vehicle_interest || 'carro'}. Faz sentido a gente conversar hoje?`;
                mode = 'generic_safe';
            } else {
                const inventoryBlock = matchedVehicle
                    ? `VEÍCULO DE INTERESSE DO LEAD QUE AINDA ESTÁ NO ESTOQUE:\n- ${formatVehicle(matchedVehicle)}${matchedVehicle.link ? ' · ' + matchedVehicle.link : ''}`
                    : `VEÍCULO DO LEAD NÃO ESTÁ MAIS NO ESTOQUE.\nEstoque atual disponível pra sugerir similar:\n${recentInventory.map(v => `- ${formatVehicle(v)}`).join('\n')}`;

                const sysPrompt = `Você gera mensagem de WhatsApp de reengajamento pra concessionária Manos Veículos (Rio do Sul/SC).
                
REGRAS INEGOCIÁVEIS:
1. PROIBIDO inventar marca, modelo, ano ou preço fora da lista fornecida.
2. Seja humano, direto, sem emojis. Use o tom baseado na temperatura do lead.
3. Se o lead é HOT, seja mais incisivo e convide para a loja.
4. Se o lead é COLD, seja mais leve e pergunte se ainda busca carro.

FORMATO:
- Máximo 220 caracteres.
- Comece pelo nome. Termine com pergunta direta.`;

                const userPrompt = `Cliente: ${firstName}
Temperatura: ${lead.ai_classification || 'warm'} (Ajuste o tom aqui)
Sentimento: ${sentiment}
Resumo anterior: ${lead.ai_summary || 'Sem resumo'}
Interesse: ${lead.vehicle_interest || 'não informado'}

${inventoryBlock}

Gere a mensagem. JSON: { "mensagem": "..." }`;

                const res = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: sysPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.4,
                    max_tokens: 150,
                });

                const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
                msg = (parsed.mensagem || '').trim();
                mode = matchedVehicle ? 'matched' : 'similar';
            }

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

            // Audit trail (best-effort) — registra modo da geração pra debug
            void admin.from('interactions_manos_crm').insert({
                lead_id: lead.id,
                notes: sendResult.ok
                    ? `[IA AUTO ${mode.toUpperCase()} via ${sendResult.provider}] "${msg}"`
                    : `[IA AUTO ${mode.toUpperCase()} sem envio: ${sendResult.error || 'sem provider'}] "${msg}"`,
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
