import { createClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * GET /api/cron/churn-predict
 * Executa diariamente às 06:00 UTC (03:00 BRT).
 * - Leads com ai_score >= 50: churn analisado por GPT-4o-mini (comportamental)
 * - Leads com ai_score < 50: heurístico rápido (sem custo de API)
 * Notifica admin quando consultor está sobrecarregado (> 15 leads ativos).
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const admin = createClient();
    const now = Date.now();
    const log: string[] = [];
    let updated = 0;
    let aiAnalyzed = 0;

    const ACTIVE_STATUSES = ['new', 'received', 'attempt', 'contacted', 'triagem', 'ataque',
        'confirmed', 'scheduled', 'negotiation', 'proposed', 'fechamento'];

    const { data: leads, error } = await admin
        .from('leads_manos_crm')
        .select('id, name, status, updated_at, created_at, ai_score, ai_classification, assigned_consultant_id, ai_summary, next_step, vehicle_interest, source')
        .in('status', ACTIVE_STATUSES)
        .limit(500);

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const allLeads = leads || [];

    // Separa leads quentes (ai_score >= 50) dos frios
    const hotLeads = allLeads.filter(l => (Number(l.ai_score) || 0) >= 50);
    const coldLeads = allLeads.filter(l => (Number(l.ai_score) || 0) < 50);

    // Cold leads: heurístico puro (sem custo de API)
    for (const lead of coldLeads) {
        const churn = calcChurn(lead, now);
        await admin
            .from('leads_manos_crm')
            .update({ churn_probability: churn })
            .eq('id', lead.id);
        updated++;
    }

    // Hot leads: análise comportamental via GPT-4o-mini em lotes de 8
    const BATCH_SIZE = 8;
    for (let i = 0; i < hotLeads.length; i += BATCH_SIZE) {
        const batch = hotLeads.slice(i, i + BATCH_SIZE);

        const analysisPromises = batch.map(async (lead) => {
            const hoursInactive = Math.round(
                (now - new Date(lead.updated_at || lead.created_at).getTime()) / 3_600_000
            );
            const heuristicScore = calcChurn(lead, now);

            try {
                const res = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    temperature: 0.2,
                    response_format: { type: 'json_object' },
                    messages: [
                        {
                            role: 'system',
                            content: 'Você é um especialista em predição de churn de leads automotivos. Analise o perfil do lead e retorne APENAS um JSON com "churn_probability" (0-99) e "churn_reason" (string curta em pt-BR, máx 120 chars).'
                        },
                        {
                            role: 'user',
                            content: `Lead: ${lead.nome || 'Sem nome'}
Status atual: ${lead.status}
Horas sem interação: ${hoursInactive}h
Score IA: ${lead.ai_score}%
Classificação: ${lead.ai_classification || 'warm'}
Interesse: ${lead.interesse || 'Não informado'}
Origem: ${lead.origem || 'Não informada'}
Resumo IA: ${lead.ai_summary || 'Sem resumo'}
Próximo passo sugerido: ${lead.next_step || 'Não definido'}
Score heurístico base: ${heuristicScore}

Avalie o risco real de churn considerando o contexto comportamental. Retorne JSON: {"churn_probability": number, "churn_reason": "string"}`
                        }
                    ],
                    max_tokens: 120,
                }, { timeout: 15000 });

                const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
                return {
                    id: lead.id,
                    churn_probability: Math.max(0, Math.min(99, Math.round(Number(parsed.churn_probability) || heuristicScore))),
                    churn_reason: String(parsed.churn_reason || '').slice(0, 120) || null,
                };
            } catch {
                // Fallback para heurístico se a IA falhar
                return { id: lead.id, churn_probability: heuristicScore, churn_reason: null };
            }
        });

        const results = await Promise.all(analysisPromises);

        for (const r of results) {
            await admin
                .from('leads_manos_crm')
                .update({ churn_probability: r.churn_probability, churn_reason: r.churn_reason })
                .eq('id', r.id);
            updated++;
            if (r.churn_reason) aiAnalyzed++;
        }
    }

    log.push(`📊 ${updated} leads atualizados (${aiAnalyzed} com análise IA, ${updated - aiAnalyzed} heurístico)`);

    // 3.3 — DETECÇÃO DE CONSULTOR SOBRECARREGADO
    const OVERLOAD_THRESHOLD = 15;
    const loadMap: Record<string, number> = {};
    for (const lead of allLeads) {
        const cid = lead.assigned_consultant_id;
        if (cid) loadMap[cid] = (loadMap[cid] || 0) + 1;
    }

    for (const [consultantId, count] of Object.entries(loadMap)) {
        if (count > OVERLOAD_THRESHOLD) {
            // Dedup: não cria se já existe alerta hoje
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const { data: existing } = await admin
                .from('follow_ups')
                .select('id')
                .eq('user_id', consultantId)
                .eq('type', 'admin_overload')
                .gte('created_at', todayStart.toISOString())
                .maybeSingle();

            if (!existing) {
                await admin.from('follow_ups').insert({
                    lead_id: null,
                    user_id: 'admin',
                    scheduled_at: new Date().toISOString(),
                    type: 'admin_overload',
                    note: `⚠️ Consultor ${consultantId} está com ${count} leads ativos (limite: ${OVERLOAD_THRESHOLD}). Redistribuição recomendada.`,
                    priority: 'high',
                    status: 'pending',
                    metadata: JSON.stringify({ consultant_id: consultantId, lead_count: count }),
                });
                log.push(`⚠️ Overload: consultor ${consultantId} → ${count} leads ativos`);
            }
        }
    }

    // Resumo de leads em risco crítico (churn > 70)
    const { count: highChurnCount } = await admin
        .from('leads_manos_crm')
        .select('id', { count: 'exact', head: true })
        .gt('churn_probability', 70)
        .in('status', ACTIVE_STATUSES);

    log.push(`🔴 ${highChurnCount ?? 0} leads com churn > 70%`);

    return NextResponse.json({ success: true, updated, log });
}

function calcChurn(lead: {
    updated_at?: string | null;
    created_at: string;
    ai_score?: number | null;
    ai_classification?: string | null;
    status: string;
    [key: string]: unknown;
}, now: number): number {
    let score = 30;

    const hoursInactive = (now - new Date(lead.updated_at || lead.created_at).getTime()) / 3_600_000;

    // Penalidade por inatividade
    if (hoursInactive > 72)      score += 40;
    else if (hoursInactive > 48) score += 25;
    else if (hoursInactive > 24) score += 15;
    else if (hoursInactive > 12) score += 5;
    else                          score -= 10;

    // Influência do ai_score
    const aiScore = Number(lead.ai_score) || 0;
    if (aiScore >= 70)      score -= 20;
    else if (aiScore >= 40) score -= 5;
    else if (aiScore > 0)   score += 15;

    // Classificação IA
    if (lead.ai_classification === 'hot')  score -= 15;
    else if (lead.ai_classification === 'cold') score += 15;

    // Estágios de fechamento com inatividade são críticos
    const closingStages = ['fechamento', 'negotiation', 'proposed'];
    if (closingStages.includes(lead.status) && hoursInactive > 6) score += 10;

    return Math.max(0, Math.min(99, Math.round(score)));
}
