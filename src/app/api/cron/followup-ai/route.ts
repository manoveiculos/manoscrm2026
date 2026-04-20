import { createClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// SLA padrão de follow-up por estágio (fallback quando sla_config não tem registro)
const DEFAULT_FOLLOWUP_SLA: Record<string, number> = {
    ataque:      6,
    triagem:     6,
    fechamento:  3,
    confirmed:   6,
    scheduled:   6,
    negotiation: 3,
    proposed:    3,
};

type SlaRow = { origem: string; stage: string; followup_hours: number | null };
type FollowupMap = Map<string, number>; // key: "origem|stage"

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
    // Normaliza o status para o stage canônico
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
 * Executa a cada 3 horas.
 * Para leads em estágios decisivos sem contato recente, gera mensagem de
 * reengajamento personalizada com GPT-4o mini e cria follow_up com type='ai_auto'.
 * Janela de inatividade é dinâmica por origem (tabela sla_config).
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const admin = createClient();
    const now = Date.now();
    const log: string[] = [];
    let generated = 0;
    let skipped = 0;

    const followupMap = await loadFollowupMap(admin);
    const activeStatuses = Object.keys(DEFAULT_FOLLOWUP_SLA);

    const { data: leads, error } = await admin
        .from('leads_manos_crm')
        .select('id, name, vehicle_interest, proxima_acao, next_step, status, updated_at, assigned_consultant_id, valor_investimento, carro_troca, source')
        .in('status', activeStatuses)
        .order('updated_at', { ascending: true })
        .limit(30);

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Filtra apenas leads que ultrapassaram o SLA de inatividade (dinâmico por origem)
    const eligible = (leads || []).filter(l => {
        const leadOrigem = l.origem || l.source || null;
        const slaH = getFollowupHours(leadOrigem, l.status, followupMap);
        const hoursInactive = (now - new Date(l.updated_at || 0).getTime()) / 3_600_000;
        return hoursInactive >= slaH;
    });

    log.push(`🎯 ${eligible.length} leads elegíveis (de ${leads?.length ?? 0} ativos)`);

    for (const lead of eligible) {
        try {
            // Evita duplicata: não cria se já existe ai_auto pendente
            const { data: existing } = await admin
                .from('follow_ups')
                .select('id')
                .eq('lead_id', lead.id)
                .eq('type', 'ai_auto')
                .eq('status', 'pending')
                .maybeSingle();

            if (existing) {
                skipped++;
                continue;
            }

            // Gera mensagem de reengajamento com GPT-4o mini
            const res = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: `Lead da Manos Veículos (concessionária, Rio Do Sul/SC):\n- Nome: ${lead.name}\n- Interesse: ${lead.vehicle_interest || 'não informado'}\n- Investimento: ${lead.valor_investimento || 'não informado'}\n- Troca: ${lead.carro_troca || 'sem troca'}\n- Estágio: ${lead.status}\n- Última ação sugerida: "${lead.proxima_acao || lead.next_step || 'sem ação prévia'}"\n\nGere UMA mensagem de reengajamento curta (1-2 frases) para WhatsApp. Sem gerundismo. Sem "tudo bem?". Comece pelo primeiro nome. Seja direto e crie urgência real.\n\nJSON: { "mensagem": "..." }`,
                }],
                response_format: { type: 'json_object' },
                temperature: 0.45,
                max_tokens: 150,
            });

            const result = JSON.parse(res.choices[0]?.message?.content || '{}');
            const msg = result.mensagem?.trim() || `${lead.name.split(' ')[0]}, ainda tenho uma condição especial reservada no ${lead.vehicle_interest || 'veículo de seu interesse'}. Podemos fechar hoje?`;

            const priority = ['fechamento', 'negotiation', 'proposed'].includes(lead.status) ? 'high' : 'medium';

            // Cria follow-up IA (safety gate — vendedor aprova antes de enviar)
            await admin.from('follow_ups').insert({
                lead_id: lead.id,
                user_id: lead.assigned_consultant_id || 'system',
                scheduled_at: new Date().toISOString(),
                type: 'ai_auto',
                note: msg,
                priority,
                status: 'pending',
            });

            // Registra na timeline (fire-and-forget)
            void admin.from('interactions_manos_crm').insert({
                lead_id: lead.id,
                notes: `[IA AUTO] Follow-up gerado: "${msg}"`,
                new_status: lead.status,
                type: 'ai_followup',
                created_at: new Date().toISOString(),
            }).then(null, () => {});

            generated++;
            log.push(`✅ ${lead.name} (${lead.status}) → "${msg.slice(0, 60)}..."`);
        } catch (e: any) {
            skipped++;
            log.push(`❌ ${lead.name} → ${e.message}`);
        }
    }

    return NextResponse.json({ success: true, generated, skipped, log });
}
