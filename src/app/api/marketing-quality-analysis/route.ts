import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Service Role client to bypass RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export const maxDuration = 300; // Allow 5 minutes for deep analysis of many leads

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: 'OpenAI API Key não configurada.' }, { status: 500 });
        }

        const { period = 'last_30_days' } = await req.json();

        // 1. GATHER DATA SOURCES
        // Fetch all leads from the distribution table (most relevant for marketing quality)
        let query = supabaseAdmin
            .from('leads_distribuicao_crm_26')
            .select('*')
            .order('criado_em', { ascending: false });

        if (period === 'last_7_days') {
            const date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            query = query.gte('criado_em', date);
        } else if (period === 'last_30_days') {
            const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            query = query.gte('criado_em', date);
        }

        const { data: leads, error: leadsError } = await query;
        if (leadsError || !leads) throw new Error("Falha ao carregar leads: " + leadsError?.message);

        if (leads.length === 0) {
            return NextResponse.json({ success: true, message: "Nenhum lead encontrado no período." });
        }

        // Fetch messages for these leads (bulk)
        const leadIds = leads.map(l => l.id);
        const { data: messages, error: messagesError } = await supabaseAdmin
            .from('whatsapp_messages')
            .select('lead_id, direction, message_text, created_at')
            .in('lead_id', leadIds)
            .order('created_at', { ascending: true });

        if (messagesError) console.warn("Erro ao buscar mensagens:", messagesError);

        // Group messages by lead
        const messagesByLead: Record<string, any[]> = {};
        messages?.forEach(m => {
            if (!messagesByLead[m.lead_id]) messagesByLead[m.lead_id] = [];
            messagesByLead[m.lead_id].push(m);
        });

        // 2. PREPARE PROMPT DATA
        const leadsDataForAI = leads.map(l => {
            const msgs = messagesByLead[l.id] || [];
            const chatLog = msgs.slice(-20).map(m => `[${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}] ${m.message_text}`).join('\n');

            return {
                id: l.id,
                nome: l.nome,
                telefone: l.telefone,
                origem: l.origem || 'Facebook Ads',
                status_crm: l.status || 'received',
                vendedor: l.vendedor || 'Não atribuído',
                interesse: l.interesse || 'Aguardando Perfil',
                troca: l.troca || 'Não informou',
                resumo_anterior: l.resumo || '',
                comentario_vendedor: l.resumo_fechamento || '',
                chat_log: chatLog || 'Sem conversa registrada.'
            };
        });

        // 3. AI PROMPT (Individual & Global)
        const prompt = `Você é o Diretor Sênior de Inteligência de Marketing e Performance da Manos Veículos.
Sua missão é realizar um diagnóstico PROFUNDO da qualidade dos leads gerados por nossas campanhas de Facebook Ads e avaliar se o atendimento está à altura.

--- OBJETIVO 1: ANÁLISE INDIVIDUAL ---
Para cada lead abaixo, você deve classificar rigorosamente o perfil.

Dados dos leads:
${JSON.stringify(leadsDataForAI.slice(0, 30))} (Analisando os 30 mais recentes para diagnóstico qualitativo)

REGRAS DE CLASSIFICAÇÃO:
- LEAD QUENTE: Respostas rápidas, perguntou preço, financiamento ou avaliação DE FORMA ENGANJADA. Tem urgência.
- LEAD MORNO: Respondeu, mas está pesquisando. Quer saber mais mas sem pressa.
- LEAD FRIO: Engajamento mínimo (ex: mandou apenas um "Oi" e sumiu).
- LEAD DESQUALIFICADO: Não responde após várias tentativas, ou perfil financeiro nitidamente incompatível.
- LEAD PERDA TOTAL: Número errado, lead inválido ou o lead afirma nunca ter pedido contato.

Para cada lead, gere:
1. Score (0-100)
2. Classificação (Exatamente um dos 5 termos acima)
3. Motivo (Análise técnica curta)
4. Probabilidade de Venda (0-100)
5. Recomendação de Abordagem Commercial (Sugestão de script ou next step)

--- OBJETIVO 2: ANÁLISE GLOBAL DA CAMPANHA ---
Baseado na amostra, gere um relatório executivo de marketing:
- Quantos em cada categoria.
- Qualidade MÉDIA da campanha (0-100).
- Score Geral da Campanha (0-10).
- Insights Críticos: O Facebook está entregando o público certo? O criativo atraiu curiosos ou compradores? O formulário está filtrando bem? O problema é a velocidade do atendimento? Analise o 'comentario_vendedor' para entender por que os leads estão sendo descartados.
- Recomendações Estratégicas: Ajustes em segmentação, criativos, formulários ou processos internos.

IMPORTANTE: Responda APENAS em Português do Brasil.
NUNCA use termos técnicos em inglês nas análises textuais. Use "Contatado" em vez de "contacted", etc.

FORMATO DO JSON DE SAÍDA:
{
  "individual_results": [
    { "id": number, "score": number, "classification": string, "reason": string, "probability": number, "recommendation": string }
  ],
  "global_report": {
    "total_leads": number,
    "counts": { "quentes": number, "mornos": number, "frios": number, "desqualificados": number, "perda_total": number },
    "quality_average": number,
    "overall_score": number, 
    "insights": [ string ],
    "strategic_recommendations": [ string ]
  }
}`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: 'Você é um Analista de Marketing Sênior e Estrategista Comercial. Responda apenas com JSON.' },
                { role: 'user', content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
        });

        const result = JSON.parse(response.choices[0]?.message?.content || '{}');

        // 4. PERSIST RESULTS
        // Update Individual Leads in DB
        if (result.individual_results) {
            await Promise.all(result.individual_results.map(async (item: any) => {
                const statusMap: Record<string, string> = {
                    'LEAD QUENTE': 'quente',
                    'LEAD MORNO': 'morno',
                    'LEAD FRIO': 'frio',
                    'LEAD DESQUALIFICADO': 'desqualificado',
                    'LEAD PERDA TOTAL': 'perda_total'
                };

                await supabaseAdmin
                    .from('leads_distribuicao_crm_26')
                    .update({
                        ai_score: item.score,
                        ai_classification: item.classification,
                        ai_reason: item.reason,
                        probability_of_sale: item.probability,
                        recommended_approach: item.recommendation,
                        atualizado_em: new Date().toISOString()
                    })
                    .eq('id', item.id);
            }));
        }

        // Save Global Report
        const { data: reportRecord, error: reportError } = await supabaseAdmin
            .from('marketing_quality_reports')
            .insert([{
                total_leads: result.global_report.total_leads,
                quentes: result.global_report.counts.quentes,
                mornos: result.global_report.counts.mornos,
                frios: result.global_report.counts.frios,
                desqualificados: result.global_report.counts.desqualificados,
                perda_total: result.global_report.counts.perda_total,
                quality_average: result.global_report.quality_average,
                overall_score: result.global_report.overall_score,
                insights: result.global_report.insights,
                recommendations: result.global_report.strategic_recommendations,
                report_date: new Date().toISOString()
            }])
            .select()
            .single();

        if (reportError) console.error("Erro ao salvar relatório global:", reportError);

        return NextResponse.json({
            success: true,
            report: reportRecord || result.global_report,
            leadsAnalyzed: result.individual_results?.length || 0
        });

    } catch (error: any) {
        console.error('Marketing Intelligence Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
