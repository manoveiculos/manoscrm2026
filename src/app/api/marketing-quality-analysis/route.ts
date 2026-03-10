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
            if (m.direction === 'outbound') {
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
                interesse: l.interesse || l.vehicle_interest || 'Aguardando Perfil',
                conversao_venda: soldLeadIds.has(l.id) ? 'FECHAMENTO CONFIRMADO' : 'Em aberto',
                resumo_vendedor: l.resumo_fechamento || '',
                chat_log: chatLog || 'Sem conversa registrada no WhatsApp.'
            };
        });



        // 2. PASSO 2 — CRUZAMENTO COM O CRM (Vendas e Status)
        // 3. PASSO 3, 4 e 5 — ANÁLISE IA
        const prompt = `Sua missão é ser um ANALISTA CIRÚRGICO DE PROBABILIDADE. Você não dá "notas bonitas", você avalia a chance REAL de fechamento baseando-se em evidências frias.

DIRETRIZES DE ANÁLISE RIGOROSA:
1. QUALIDADE DO LEAD (0-100):
   - 90-100: Lead agendou visita, enviou dados de troca ou pediu simulação.
   - 60-89: Lead responde rápido, faz perguntas técnicas sobre o carro (KM, pneus, opcionais).
   - 30-59: Lead "curioso", pergunta preço (mesmo estando no anúncio) ou demora 24h+ para responder.
   - 0-29: Lead frio, ignora o vendedor após a primeira resposta ou não tem perfil de compra.

2. PROBABILIDADE DE VENDA (CRÍTICA):
   - Seja pessimista por padrão. Só aumente a probabilidade se houver GATILHOS (Troca, Visita, Ficha).
   - Leads que apenas "deram oi" e sumiram = Probabilidade < 5%.

3. CLASSIFICAÇÃO CIRÚRGICA:
   - "LEAD QUENTE": Somente com intenção de fechamento clara.
   - "LEAD MORNO": Em conversação ativa sobre detalhes técnicos.
   - "LEAD FRIO": Respostas monossilábicas ou vácuo.
   - "LEAD DESQUALIFICADO": Perfil errado, mora muito longe sem intenção de vir, ou sem margem.
   - "FASE INICIAL": Lead acabou de chegar, aguardando primeira resposta significativa.

4. DIAGNÓSTICO ESTRATÉGICO:
   - Aponte sem filtros se o criativo está atraindo "gente sem dinheiro" ou "curioso de preço".
   - Identifique se o vendedor está sendo passivo demais no chat (não faz chamadas para ação).

DADOS PARA ANÁLISE:
${JSON.stringify(leadsDataForAI.slice(0, 80))}

FORMATO DO JSON DE SAÍDA:
{
  "individual_results": [
    { 
      "id": "string", 
      "score": 0, 
      "classification": "LEAD QUENTE", 
      "reason": "Explicar evidência real encontrada no chat", 
      "probability": 0, 
      "recommendation": "Ação direta" 
    }
  ],
  "global_report": {
    "total_leads": ${allCampaignLeads.length},
    "counts": { "quentes": 0, "mornos": 0, "frios": 0, "desqualificados": 0, "perda_total": 0 },
    "quality_average": 0,
    "overall_score": 0, 
    "insights": ["insight 1"],
    "strategic_recommendations": [ 
      { "title": "⚠️ TÍTULO", "action": "AÇÃO", "reason": "MOTIVO" }
    ],
    "diagnosis": {
      "marketing_issue": "string",
      "sales_issue": "string",
      "creative_issue": "string"
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
                    diagnosis: result.global_report.diagnosis
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
