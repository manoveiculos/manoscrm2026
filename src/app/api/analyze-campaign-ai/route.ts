import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

let openaiInstance: OpenAI | null = null;

function getOpenAI() {
    if (!openaiInstance && process.env.OPENAI_API_KEY) {
        openaiInstance = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiInstance;
}

export async function POST(req: Request) {
    try {
        const { campaign, leadsSummary } = await req.json();

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { success: false, error: 'Chave OpenAI não configurada.' },
                { status: 500 }
            );
        }

        // Extrai a última análise e o histórico se existir
        let aiHistory: any[] = [];
        let lastAnalysis = null;

        if (campaign.ai_analysis_result) {
            if (campaign.ai_analysis_result.history) {
                aiHistory = campaign.ai_analysis_result.history;
                lastAnalysis = campaign.ai_analysis_result.current_analysis;
            } else {
                // Backward compatibility: is a flat old analysis
                aiHistory = [campaign.ai_analysis_result];
                lastAnalysis = campaign.ai_analysis_result;
            }
        }

        const openai = getOpenAI();
        if (!openai) throw new Error("Falha ao inicializar OpenAI.");

        const historyPromptInfo = lastAnalysis ? `
            CONTEXTO HISTÓRICO (ÚLTIMA ANÁLISE):
            - Saúde anterior: ${lastAnalysis.saude_campanha}
            - Gargalo anterior: ${lastAnalysis.gargalo_identificado}
            - Passos recomendados ontem/antes: ${lastAnalysis.proximos_passos?.join(' | ')}
            
            **INSTRUCÃO EXTRA**: Compare a situação atual com a última análise. Os passos que você sugeriu antes deram resultado? Se não, mude a estratégia radicalmente. Cite no "analise_critica" os aprendizados com o contexto anterior.` : '';

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Você é um Especialista Sênior em Tráfego Pago e Análise de Dados focado em campanhas do Facebook Ads e Google Ads para Concessionárias de Veículos. Suas recomendações devem ser táticas, detalhadas (passo a passo) e altamente aplicáveis. Você deve ensinar e orientar a equipe no dia a dia para otimizar marketing, criar estratégias de remarketing e aumentar a conversão. Nunca invente dados; baseie-se estritamente nos números e datas fornecidos.'
                },
                {
                    role: 'user',
                    content: `Analise o desempenho atual desta campanha e nos oriente sobre os próximos passos.
            
            DADOS REAIS DA CAMPANHA:
            - Nome: ${campaign.name}
            - Plataforma: ${campaign.platform}
            - Status: ${campaign.status === 'active' ? 'ATIVA' : 'PAUSADA'}
            - Investimento: R$ ${campaign.total_spend}
            - Visualizações (Impressões): ${campaign.impressions}
            - Alcançados (Pessoas Únicas): ${campaign.reach || 0}
            - Cliques no Link: ${campaign.link_clicks}
            - Frequência: ${campaign.frequency || 0}x
            - CTR: ${campaign.ctr}%
            - CPC: R$ ${campaign.cpc}
            - CPM: R$ ${campaign.cpm || 0}
            - CPL (Custo Por Lead): R$ ${leadsSummary.total > 0 ? (campaign.total_spend / leadsSummary.total).toFixed(2) : campaign.total_spend}
            
            RESULTADO NO CRM:
            - Leads Reais Gerados: ${leadsSummary.total}
            ${historyPromptInfo}
            
            DIRETRIZES TÁTICAS PARA SUA RESPOSTA:
            1. "analise_critica": Crie um parágrafo robusto analisando o funil da campanha. Se houver "Contexto Histórico" acima, mencione o que mudou e se a ação anterior funcionou.
            2. "gargalo_identificado": Qual o maior problema atual (ex: criativo saturado pela alta frequência, cliques mas sem conversões no site, CPC muito caro, etc)?
            3. "proximos_passos": Forneça EXATAMENTE 3 passos. Estes devem ser um GUIA DETALHADO. Exemplo: "1. Criar novo público de Remarketing (Pessoas que engajaram nos últimos 15 dias)", "2. Pausar os criativos com CTR abaixo de 1% e testar novos vídeos", "3. Aumentar R$ 50/dia na verba se o CPL estiver abaixo de R$ 30".
            4. "saude_campanha": APENAS usar "EXCELENTE", "BOA", "REGULAR" ou "CRÍTICA".
            
            RESPONDA APENAS NESTE FORMATO JSON:
            {
              "analise_critica": "Seu parágrafo detalhado de diagnóstico...",
              "saude_campanha": "EXCELENTE | BOA | REGULAR | CRÍTICA",
              "gargalo_identificado": "A causa raiz do problema ou o impulsionador do sucesso",
              "proximos_passos": ["Ação 1 detalhada", "Ação 2 detalhada", "Ação 3 detalhada"],
              "score_potencial": number (0-100)
            }`
                }
            ],
            response_format: { type: "json_object" }
        });

        const output = response.choices[0]?.message?.content;
        if (!output) throw new Error("Resposta da IA vazia");

        const newAnalysis = JSON.parse(output);
        const newHistoryRecord = { ...newAnalysis, analyzed_at: new Date().toISOString() };

        // Append to history, keeping max 10 to avoid bloat
        const updatedHistory = [...aiHistory, newHistoryRecord].slice(-10);

        const aiResultPayload = {
            current_analysis: newAnalysis,
            history: updatedHistory
        };

        // Salvar localmente no Supabase
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { error: updateError } = await supabase
            .from('campaigns_manos_crm')
            .update({ ai_analysis_result: aiResultPayload })
            .eq('id', campaign.id);

        if (updateError) {
            console.error("Erro ao salvar análise no Supabase:", updateError);
        }

        return NextResponse.json({
            success: true,
            current_analysis: newAnalysis,
            history: updatedHistory
        });

    } catch (error: any) {
        console.error('Campaign Analysis AI Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Falha na análise da IA',
            details: error.message
        }, { status: 500 });
    }
}
