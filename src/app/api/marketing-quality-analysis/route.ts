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

        // 1. PASSO 1 — EXTRAÇÃO DOS LEADS DA CAMPANHA (MULTI-TABELA)
        const dateRange = period === 'last_7_days' ? 7 : 30;
        const startDate = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000).toISOString();

        // Query 1: Leads da Tabela Principal (Tem UTMs e Campaign_ID)
        const { data: mainLeads, error: mainError } = await supabaseAdmin
            .from('leads_manos_crm')
            .select('*')
            .gte('created_at', startDate)
            .not('status', 'in', '("lost","no_contact","reactivation","junk","duplicate")')
            .or('utm_campaign.neq.null,campaign_id.neq.null,id_meta.neq.null,source.ilike.%Ads%,source.ilike.%Campanha%,source.ilike.%facebook%,source.ilike.%instagram%,source.ilike.%google%,source.ilike.%meta%')
            .order('created_at', { ascending: false })
            .limit(500);

        // Query 2: Leads da Tabela de Distribuição CRM26 (WhatsApp Direto)
        // Nota: Esta tabela NÃO tem utm_campaign, usamos id_meta e origem
        const { data: crm26Leads, error: crm26Error } = await supabaseAdmin
            .from('leads_distribuicao_crm_26')
            .select('*')
            .gte('criado_em', startDate)
            .not('status', 'in', '("lost","no_contact","reactivation","junk","duplicate")')
            .or('id_meta.neq.null,origem.ilike.%Ads%,origem.ilike.%Campanha%,origem.ilike.%facebook%,origem.ilike.%instagram%,origem.ilike.%google%,origem.ilike.%meta%,interesse.ilike.%Ads%,interesse.ilike.%facebook%,interesse.ilike.%instagram%')
            .order('criado_em', { ascending: false })
            .limit(500);

        if (mainError) console.error("Erro na leads_manos_crm:", mainError);
        if (crm26Error) console.error("Erro na leads_distribuicao_crm_26:", crm26Error);

        // Unificar e normalizar os leads
        const allCampaignLeads = [
            ...(mainLeads || []).map(l => ({ ...l, _source_table: 'leads_manos_crm', _display_id: l.id })),
            ...(crm26Leads || []).map(l => ({
                ...l,
                id: l.id, // Integer ID
                _source_table: 'leads_distribuicao_crm_26',
                _display_id: `crm26_${l.id}`,
                created_at: l.criado_em,
                nome: l.nome,
                origem: l.origem || l.interesse,
                status: l.status || 'received'
            }))
        ];

        if (allCampaignLeads.length === 0) {
            return NextResponse.json({
                success: true,
                message: "Nenhum lead de campanha identificado no período em nenhuma das bases."
            });
        }



        // Fetch messages for these leads (bulk) - Handling both UUID and Integer IDs
        const mainLeadIds = allCampaignLeads.filter(l => l._source_table === 'leads_manos_crm').map(l => l.id);
        const crm26LeadIds = allCampaignLeads.filter(l => l._source_table === 'leads_distribuicao_crm_26').map(l => l.id);

        let messagesQuery = supabaseAdmin
            .from('whatsapp_messages')
            .select('lead_id, direction, message_text, created_at')

        const filters: string[] = [];
        if (mainLeadIds.length > 0) {
            // UUIDs need to be in quotes for the .in() filter inside .or()
            filters.push(`lead_id.in.("${mainLeadIds.join('","')}")`);
        }
        if (crm26LeadIds.length > 0) {
            filters.push(`lead_id.in.(${crm26LeadIds.join(',')})`);
        }

        if (filters.length > 0) {
            messagesQuery = messagesQuery.or(filters.join(','));
        } else {
            // No leads to fetch messages for (shouldn't happen given the check above)
        }

        const { data: messages, error: messagesError } = await messagesQuery.order('created_at', { ascending: true });



        if (messagesError) console.warn("Erro ao buscar mensagens:", messagesError);

        // Group messages by lead and calculate response metrics
        const leadMetrics: Record<string, {
            firstResponseTime?: number,
            sellerResponded: boolean,
            messages: any[]
        }> = {};

        messages?.forEach(m => {
            if (!leadMetrics[m.lead_id]) {
                leadMetrics[m.lead_id] = { sellerResponded: false, messages: [] };
            }
            leadMetrics[m.lead_id].messages.push(m);
            if (m.direction === 'outbound' && !leadMetrics[m.lead_id].sellerResponded) {
                const inboundMessages = leadMetrics[m.lead_id].messages.filter(msg => msg.direction === 'inbound');
                if (inboundMessages.length > 0) {
                    const firstInbound = new Date(inboundMessages[0].created_at).getTime();
                    const firstOutbound = new Date(m.created_at).getTime();
                    leadMetrics[m.lead_id].firstResponseTime = Math.round((firstOutbound - firstInbound) / 60000); // minutes
                }
                leadMetrics[m.lead_id].sellerResponded = true;
            }
        });

        // 2. PASSO 2 — CRUZAMENTO COM O CRM (Vendas e Status)
        // Vendas em ambas as tabelas (sales_manos_crm referencia UUID)
        const { data: sales } = await supabaseAdmin
            .from('sales_manos_crm')
            .select('lead_id')
            .in('lead_id', mainLeadIds);

        const soldLeadIds = new Set(sales?.map(s => s.lead_id) || []);

        // 2. PREPARE PROMPT DATA
        const leadsDataForAI = allCampaignLeads.map(l => {
            const metrics = leadMetrics[l.id] || { sellerResponded: false, messages: [] };
            const chatLog = metrics.messages.slice(-15).map(m => `[${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}] ${m.message_text}`).join('\n');

            return {
                id: l._display_id,
                base: l._source_table === 'leads_manos_crm' ? 'CRM_MAIN' : 'CRM_WHATSAPP',
                nome: l.nome,
                origem: l.origem || l.source || l.utm_source || 'Campanha Digital',
                campanha: l.utm_campaign || l.campaign_id || l.meta_id_campanha || 'Não identificada',
                status_crm: l.status || 'received',
                vendedor_atribuido: l.vendedor || 'Não atribuído',
                seller_responded: metrics.sellerResponded ? 'SIM' : 'NÃO',
                tempo_primeira_resposta_minutos: metrics.firstResponseTime || 'Não respondeu',
                interesse: l.interesse || l.vehicle_interest || 'Aguardando Perfil',
                conversao_venda: soldLeadIds.has(l.id) ? 'FECHAMENTO CONFIRMADO' : 'Em aberto',
                resumo_vendedor: l.resumo_fechamento || '',
                chat_log: chatLog || 'Sem conversa registrada no WhatsApp.'
            };
        });



        // 2. PASSO 2 — CRUZAMENTO COM O CRM (Vendas e Status)
        // 3. PASSO 3, 4 e 5 — ANÁLISE IA
        const prompt = `Sua missão é ser um ANALISTA CIRÚRGICO DE PROBABILIDADE e AUDITOR DE VENDAS. Você está avaliando o motivo de uma taxa de 0% de conversão (200 leads = 0 vendas).

DIRETRIZES DE ANÁLISE CIRÚRGICA (FOCO ZERO CONVERSÕES):
1. RASTREIO DA ORIGEM VS COMPORTAMENTO:
   - Identifique quais campanhas e anúncios trouxeram leads que travam nas mesmas etapas (ex: ignoram o vendedor após o preço).
   - Verifique se anúncios específicos atraem perfis idênticos que não convertem.

2. QUALIFICAÇÃO E TEMPO DE RESPOSTA:
   - Avalie o 'tempo_primeira_resposta_minutos'. O lead está esfriando porque a equipe demora? (Demora > 15 minutos é crítico).
   - Analise os motivos reais de perda ('Loss Reasons') ocultos no chat. O que o lead alega? "Muito caro", "Só estava olhando", "Desaparece"?

3. AUDITORIA DO PERFIL DO LEAD:
   - Os anúncios estão atraindo compradores ou apenas curiosos sem capacidade de pagamento?
   - Procure padrões demográficos/comportamentais (ex: perguntas básicas que indicam que não leram o anúncio).
   - O vendedor é passivo demais ou tenta forçar compromisso muito cedo?

DADOS PARA ANÁLISE:
${JSON.stringify(leadsDataForAI.slice(0, 80))}

FORMATO DO JSON DE SAÍDA:
{
  "individual_results": [
    { 
      "id": "string", 
      "score": 0, 
      "classification": "LEAD QUENTE | MORNO | FRIO | DESQUALIFICADO",
      "reason": "Evidência real no chat / Motivo real da perda", 
      "probability": 0, 
      "recommendation": "Ação direta para o lead individual",
      "time_to_respond_mins": 0
    }
  ],
  "global_report": {
    "total_leads": ${allCampaignLeads.length},
    "counts": { "quentes": 0, "mornos": 0, "frios": 0, "desqualificados": 0, "perda_total": 0 },
    "quality_average": 0,
    "overall_score": 0, 
    "insights": ["insight 1 auditando campanhas vs travamentos"],
    "strategic_recommendations": [ 
      { "title": "⚠️ TÍTULO", "action": "AÇÃO", "reason": "MOTIVO" }
    ],
    "diagnosis": {
      "marketing_issue": "O que há de errado nas campanhas",
      "sales_issue": "O que há de errado no atendimento",
      "creative_issue": "Por que o criativo atrai curiosos"
    },
    "audit_findings": {
      "response_time_impact": "Análise do impacto do tempo de resposta nas 0 vendas",
      "common_loss_reasons": ["Motivo oculto 1", "Motivo oculto 2"],
      "ad_stage_correlation": "Como os anúncios se relacionam com as etapas onde os leads travam",
      "lead_profile_analysis": "Padrão de curioso vs comprador identificado"
    }
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

        // Garantir que a contagem total seja cirurgicamente correta baseada na extração real
        if (result.global_report) {
            result.global_report.total_leads = allCampaignLeads.length;
        }

        // 4. PERSIST RESULTS
        // Update Individual Leads in DB
        if (result.individual_results) {
            await Promise.all(result.individual_results.map(async (item: any) => {
                const targetTable = item.id.toString().startsWith('crm26_')
                    ? 'leads_distribuicao_crm_26'
                    : 'leads_manos_crm';
                const realId = item.id.toString().replace('crm26_', '');

                await supabaseAdmin
                    .from(targetTable)
                    .update({
                        ai_score: item.score,
                        ai_classification: item.classification,
                        ai_reason: item.reason,
                        probability_of_sale: item.probability,
                        recommended_approach: item.recommendation,
                        atualizado_em: new Date().toISOString()
                    })
                    .eq('id', realId);

            }));
        }

        // Save Global Report
        const { data: reportRecord, error: reportError } = await supabaseAdmin
            .from('marketing_daily_reports_manos_crm')
            .insert([{
                report_date: new Date().toISOString().split('T')[0],
                summary: result.global_report.insights.join('\n'),
                recommendations: result.global_report.strategic_recommendations,
                performance_metrics: {
                    total_leads: result.global_report.total_leads,
                    counts: result.global_report.counts,
                    quality_average: result.global_report.quality_average,
                    overall_score: result.global_report.overall_score,
                    diagnosis: result.global_report.diagnosis,
                    audit_findings: result.global_report.audit_findings
                },
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (reportError) {
            console.error("Erro ao salvar relatório global na tabela principal:", reportError);
            // Fallback attempt to the legacy table if unified one fails
            try {
                await supabaseAdmin.from('marketing_quality_reports').insert([{
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
                }]);
            } catch (fallbackError) {
                console.error("Fallback save also failed:", fallbackError);
            }
        }



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
