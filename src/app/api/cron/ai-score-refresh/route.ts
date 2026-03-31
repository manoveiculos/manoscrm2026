import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getGlobalFeedbackContext } from '@/lib/services/aiFeedbackService';

export const maxDuration = 300; // 5 minutos para processar batch de 100 leads

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FINAL_STATUSES = '("vendido","perdido","lost","comprado","lixo","duplicado","desqualificado")';
// Leads sem score OU com score antigo (> 3 dias sem atualizar) e que têm contexto comportamental
const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
const ONE_DAY_AGO    = new Date(Date.now() - 1 * 24 * 3_600_000).toISOString();

/**
 * Monta o prompt de reclassificação com o contexto COMPLETO do lead.
 * Regra central: stage é apenas localização no funil — NÃO é o determinante do score.
 * Score reflete probabilidade real de conversão baseada em comportamento + contexto.
 */
function buildScorePrompt(lead: {
    name?: string; nome?: string;
    status?: string;
    vehicle_interest?: string; interesse?: string;
    source?: string; origem?: string;
    valor_investimento?: string;
    carro_troca?: string;
    ai_summary?: string;
    next_step?: string; proxima_acao?: string;
    behavioral_profile?: any;
    updated_at?: string; created_at?: string;
}, now: number): string {
    const name        = lead.name || lead.nome || 'Desconhecido';
    const vehicle     = lead.vehicle_interest || lead.interesse || 'Não informado';
    const origem      = lead.source || lead.origem || 'Não informada';
    const investimento = lead.valor_investimento || 'Não informado';
    const troca       = lead.carro_troca || 'Sem troca';
    const stage       = lead.status || 'entrada';
    const summary     = lead.ai_summary || '';
    const nextAction  = lead.next_step || lead.proxima_acao || '';

    const lastTouch   = lead.updated_at || lead.created_at || new Date().toISOString();
    const hoursInactive = Math.round((now - new Date(lastTouch).getTime()) / 3_600_000);

    const profile = lead.behavioral_profile as any;
    const sentiment        = profile?.sentiment || null;
    const urgency          = profile?.urgency || null;
    const intentions       = Array.isArray(profile?.intentions) ? (profile.intentions as string[]).join(', ') : null;
    const closingProb      = profile?.closing_probability ?? null;

    const hasContext = !!(summary || sentiment || urgency || intentions);

    const contextBlock = hasContext ? `
PERFIL COMPORTAMENTAL (fator PRINCIPAL do score):
- Sentimento detectado: ${sentiment || 'não analisado'}
- Urgência: ${urgency || 'não analisada'}
- Intenções mapeadas: ${intentions || 'não mapeadas'}
- Prob. de fechamento anterior: ${closingProb !== null ? closingProb + '%' : 'não calculada'}
- Horas sem interação: ${hoursInactive}h

HISTÓRICO DA NEGOCIAÇÃO:
- Resumo IA: ${summary || 'sem análise prévia'}
- Próxima ação recomendada: ${nextAction || 'não definida'}` : `
AVISO: lead sem análise comportamental prévia — baseie-se nos dados cadastrais.
- Horas no sistema: ${hoursInactive}h`;

    return `Lead da Manos Veículos (concessionária multimarcas, Rio do Sul/SC):
- Nome: ${name}
- Interesse: ${vehicle}
- Investimento: ${investimento}
- Troca: ${troca}
- Origem: ${origem}
- Estágio no funil: ${stage} (contexto de localização apenas)
${contextBlock}

REGRA CRÍTICA — LEIA ANTES DE CALCULAR:
O score de 0-99 representa probabilidade REAL de conversão em venda, NÃO reflete onde o lead está no funil.
Exemplos obrigatórios de calibração:
• Lead em "fechamento" parado há 5+ dias com sentimento "Frustrado" → score BAIXO (20-35)
• Lead em "entrada" com sentimento "Decidido", urgência "high", pedindo disponibilidade → score ALTO (75-90)
• Lead em "ataque" sem histórico de análise, apenas 2h inativo → score MÉDIO (40-55)
NÃO ancore o score ao estágio. Ancore ao comportamento, contexto e sinais de intenção de compra.

JSON: { "ai_score": 0-99, "ai_classification": "hot"|"warm"|"cold", "vehicle_interest_normalized": "Marca Modelo Ano ou vazio", "proxima_acao": "Script exato 1-2 frases WhatsApp sem listas" }`;
}

/**
 * GET /api/cron/ai-score-refresh
 * Executa diariamente às 07:00 UTC (04:00 BRT).
 *
 * Pool A — Leads sem score (nunca analisados): score inicial com dados cadastrais
 * Pool B — Leads com score desatualizado (> 3 dias) E com contexto comportamental:
 *          reclassificação completa usando behavioral_profile + ai_summary
 *
 * REGRA CENTRAL: estágio é contexto, não determinante. Score = probabilidade real de venda.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const log: string[] = [];
    let processed = 0;
    let skipped = 0;
    const now = Date.now();

    try {
        // Pool A: nunca analisados
        const { data: poolA, error: errA } = await supabase
            .from('leads_manos_crm')
            .select('id, name, status, vehicle_interest, source, origem, valor_investimento, carro_troca, ai_summary, next_step, proxima_acao, behavioral_profile, updated_at, created_at')
            .not('status', 'in', FINAL_STATUSES)
            .or('ai_score.is.null,ai_score.eq.0')
            .order('created_at', { ascending: false })
            .limit(60);

        if (errA) throw errA;

        // Pool B: score existente mas defasado (> 3 dias) com análise comportamental disponível
        const { data: poolB } = await supabase
            .from('leads_manos_crm')
            .select('id, name, status, vehicle_interest, source, origem, valor_investimento, carro_troca, ai_summary, next_step, proxima_acao, behavioral_profile, updated_at, created_at')
            .not('status', 'in', FINAL_STATUSES)
            .gt('ai_score', 0)
            .not('behavioral_profile', 'is', null)
            .or(`updated_at.lt.${THREE_DAYS_AGO},updated_at.gt.${ONE_DAY_AGO}`)
            .order('updated_at', { ascending: true })
            .limit(40);

        const allLeads = [...(poolA || []), ...(poolB || [])];
        // Deduplica por id (lead pode aparecer nos dois pools raramente)
        const leadsMap = new Map(allLeads.map(l => [l.id, l]));
        const leads = Array.from(leadsMap.values());

        if (!leads.length) {
            return NextResponse.json({ success: true, message: 'Nenhum lead elegível.', processed: 0 });
        }

        log.push(`📋 Pool A: ${poolA?.length || 0} sem score | Pool B: ${poolB?.length || 0} com score defasado → ${leads.length} únicos`);

        // Busca padrões globais de feedback UMA vez
        const globalFeedbackContext = await getGlobalFeedbackContext().catch(() => '');
        const systemPrompt = `Você é o motor de scoring da Manos Veículos. Analise leads de concessionária automotiva e retorne APENAS JSON válido.
PRINCÍPIO FUNDAMENTAL: score reflete probabilidade real de conversão, não posição no funil.${globalFeedbackContext}`;

        const BATCH_SIZE = 5;
        for (let i = 0; i < leads.length; i += BATCH_SIZE) {
            const batch = leads.slice(i, i + BATCH_SIZE);

            await Promise.allSettled(batch.map(async (lead) => {
                try {
                    const res = await openai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: buildScorePrompt(lead, now) },
                        ],
                        response_format: { type: 'json_object' },
                        temperature: 0.2,
                        max_tokens: 220,
                    });

                    const result = JSON.parse(res.choices[0]?.message?.content || '{}');

                    const updatePayload: Record<string, any> = {
                        ai_score: Math.min(99, Math.max(1, Number(result.ai_score) || 40)),
                        ai_classification: ['hot', 'warm', 'cold'].includes(result.ai_classification) ? result.ai_classification : 'warm',
                        next_step: result.proxima_acao || '',
                        proxima_acao: result.proxima_acao || '',
                        atualizado_em: new Date().toISOString(),
                    };

                    const normalized = (result.vehicle_interest_normalized || '').trim();
                    if (normalized.length > 3 && normalized.toLowerCase() !== 'vazio') {
                        updatePayload.vehicle_interest = normalized;
                    }

                    await supabase.from('leads_manos_crm').update(updatePayload).eq('id', lead.id);
                    processed++;
                    log.push(`✅ ${lead.name} [${lead.status}] → ${result.ai_score}% (${result.ai_classification})`);
                } catch (e: any) {
                    skipped++;
                    log.push(`❌ ${lead.name} → ${e.message}`);
                }
            }));

            if (i + BATCH_SIZE < leads.length) {
                await new Promise(r => setTimeout(r, 600));
            }
        }

        // ── Pool crm26 — mesma lógica, campos adaptados ────────────────────────
        const { data: leadsCrm26 } = await supabase
            .from('leads_distribuicao_crm_26')
            .select('id, nome, status, interesse, origem, valor_investimento, carro_troca, ai_summary, next_step, behavioral_profile, updated_at, criado_em')
            .not('status', 'in', FINAL_STATUSES)
            .or('ai_score.is.null,ai_score.eq.0')
            .order('criado_em', { ascending: false })
            .limit(50);

        if (leadsCrm26?.length) {
            log.push(`📋 ${leadsCrm26.length} leads crm26 elegíveis`);

            for (let i = 0; i < leadsCrm26.length; i += BATCH_SIZE) {
                const batch = leadsCrm26.slice(i, i + BATCH_SIZE);

                await Promise.allSettled(batch.map(async (lead) => {
                    try {
                        const adaptedLead = {
                            name: lead.nome,
                            status: lead.status,
                            vehicle_interest: lead.interesse,
                            origem: lead.origem,
                            valor_investimento: lead.valor_investimento,
                            carro_troca: lead.carro_troca,
                            ai_summary: lead.ai_summary,
                            next_step: lead.next_step,
                            behavioral_profile: lead.behavioral_profile,
                            updated_at: lead.updated_at,
                            created_at: lead.criado_em,
                        };

                        const res = await openai.chat.completions.create({
                            model: 'gpt-4o-mini',
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: buildScorePrompt(adaptedLead, now) },
                            ],
                            response_format: { type: 'json_object' },
                            temperature: 0.2,
                            max_tokens: 220,
                        });

                        const result = JSON.parse(res.choices[0]?.message?.content || '{}');

                        const updatePayload: Record<string, any> = {
                            ai_score: Math.min(99, Math.max(1, Number(result.ai_score) || 40)),
                            ai_classification: ['hot', 'warm', 'cold'].includes(result.ai_classification) ? result.ai_classification : 'warm',
                            next_step: result.proxima_acao || '',
                        };

                        const normalized = (result.vehicle_interest_normalized || '').trim();
                        if (normalized.length > 3 && normalized.toLowerCase() !== 'vazio') {
                            updatePayload.interesse = normalized;
                        }

                        await supabase.from('leads_distribuicao_crm_26').update(updatePayload).eq('id', lead.id);
                        processed++;
                        log.push(`✅ [crm26] ${lead.nome} [${lead.status}] → ${result.ai_score}% (${result.ai_classification})`);
                    } catch (e: any) {
                        skipped++;
                        log.push(`❌ [crm26] ${lead.nome} → ${e.message}`);
                    }
                }));

                if (i + BATCH_SIZE < leadsCrm26.length) {
                    await new Promise(r => setTimeout(r, 600));
                }
            }
        }

        return NextResponse.json({
            success: true,
            processed,
            skipped,
            leadsScanned: leads.length + (leadsCrm26?.length || 0),
            log,
        });
    } catch (err: any) {
        console.error('[ai-score-refresh]', err);
        return NextResponse.json({ success: false, error: err.message, log }, { status: 500 });
    }
}
