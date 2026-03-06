import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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
                    content: `Você é o MELHOR Consultor de Marketing Digital do Brasil, especializado em Tráfego Pago para Concessionárias e Revendas de Veículos. Você tem 15+ anos de experiência otimizando campanhas no Facebook Ads e Google Ads para o setor automotivo.

SEU PAPEL: Você é um MENTOR que ensina o dono da loja a entender marketing digital de forma SIMPLES e PRÁTICA. Imagine que está falando com alguém que não é da área de marketing. Use linguagem clara, exemplos do dia a dia e analogias simples.

REGRAS FUNDAMENTAIS:
- NUNCA invente dados. Use APENAS os números fornecidos.
- Sempre responda em Português Brasileiro.
- Seja DIRETO e PRÁTICO. Nada de teoria, apenas o que FAZER.
- Explique o PORQUÊ de cada métrica (o que significa para o dono da loja).
- Compare com benchmarks do mercado automotivo brasileiro.
- Dê dicas que qualquer pessoa consiga executar, mesmo sem experiência em marketing.

BENCHMARKS DO MERCADO AUTOMOTIVO (referências para comparação):
- CPL ideal para veículos seminovos: R$ 8-25 por lead
- CPL ideal para veículos novos: R$ 15-50 por lead
- CTR médio do setor: 0.8% a 1.5%
- CTR bom: acima de 1.5%
- CTR excelente: acima de 2.5%
- Frequência ideal: 1.5 a 3.0 (acima de 3 = público saturado)
- CPC médio automotivo: R$ 0.30 a R$ 1.50
- Taxa de conversão clique→lead ideal: 5% a 15%`
                },
                {
                    role: 'user',
                    content: `Analise esta campanha e me oriente como um MENTOR de marketing. Preciso de orientações que eu consiga executar HOJE, mesmo sendo leigo em marketing.

DADOS REAIS DA CAMPANHA:
- Nome: ${campaign.name}
- Plataforma: ${campaign.platform}
- Status: ${campaign.status === 'active' ? 'ATIVA' : 'PAUSADA'}
- Investimento Total: R$ ${campaign.total_spend}
- Investimento Diário Médio: R$ ${campaign.total_spend ? (campaign.total_spend / Math.max(1, Math.ceil((Date.now() - new Date(campaign.created_at).getTime()) / 86400000))).toFixed(2) : '0'}
- Visualizações (Impressões): ${campaign.impressions || 0}
- Alcance (Pessoas Únicas): ${campaign.reach || 0}
- Cliques no Link: ${campaign.link_clicks || 0}
- Frequência: ${campaign.frequency || 0}x
- CTR: ${campaign.ctr || 0}%
- CPC: R$ ${campaign.cpc || 0}
- CPM: R$ ${campaign.cpm || 0}
- Leads Reais no CRM: ${leadsSummary.total}
- CPL (Custo Por Lead): R$ ${leadsSummary.total > 0 ? (campaign.total_spend / leadsSummary.total).toFixed(2) : 'infinito - sem leads'}
- Taxa Conversão Clique→Lead: ${campaign.link_clicks > 0 ? ((leadsSummary.total / campaign.link_clicks) * 100).toFixed(1) : '0'}%
- Dias rodando: ${Math.max(1, Math.ceil((Date.now() - new Date(campaign.created_at).getTime()) / 86400000))}

${historyPromptInfo}

RESPONDA APENAS NESTE FORMATO JSON (TODOS os campos são obrigatórios):
{
  "analise_critica": "Parágrafo detalhado explicando o desempenho da campanha em linguagem SIMPLES, como se estivesse explicando para o dono da loja. Explique o que cada métrica SIGNIFICA na prática (ex: 'Seu anúncio foi visto 15.000 vezes, isso significa que...'). Identifique onde o dinheiro está sendo bem gasto e onde está sendo desperdiçado.",
  
  "saude_campanha": "EXCELENTE | BOA | REGULAR | CRÍTICA",
  
  "gargalo_identificado": "O maior problema ou o maior ponto forte da campanha, explicado de forma simples. Ex: 'As pessoas estão vendo seu anúncio mas não estão clicando - isso significa que a imagem ou o texto não está atraindo atenção suficiente.'",
  
  "proximos_passos": ["1. Ação específica com passo a passo detalhado...", "2. Segunda ação...", "3. Terceira ação...", "4. Quarta ação...", "5. Quinta ação..."],
  
  "dica_do_dia": "Uma dica PRÁTICA e SIMPLES que o dono da loja pode aplicar HOJE em 5 minutos. Algo como: 'Abra o Gerenciador de Anúncios, vá em Anúncios, ordene por CTR e pause todos que estão abaixo de 0.8%'. Ou: 'Tire uma foto de um veículo com preço atrativo e teste como novo criativo'. Sempre comece com um verbo de ação.",
  
  "o_que_fazer_hoje": "Orientação clara e direta do que fazer AGORA MESMO para melhorar os resultados. Máximo 2 frases. Ex: 'Hoje aumente a verba diária em R$ 10 e crie um vídeo curto mostrando o interior de um veículo popular.' ou 'Hoje revise os leads que chegaram ontem e ligue para todos em até 30 minutos.'",
  
  "alerta_de_verba": "Recomendação sobre o orçamento: aumentar, manter ou reduzir? E POR QUÊ em linguagem simples. Ex: 'Com CPL de R$10, cada lead está saindo barato. Recomendo AUMENTAR a verba para R$100/dia porque quanto mais leads a esse preço, mais vendas potenciais.'",
  
  "comparativo_mercado": "Compare os números da campanha com a média do mercado automotivo. Ex: 'Seu CPL de R$10 está ABAIXO da média do mercado (R$15-25), ou seja, você está pagando menos que a maioria das concessionárias por cada cliente interessado. Seu CTR de 2% está ACIMA da média (0.8-1.5%), o que mostra que seus criativos são bons.'",
  
  "score_potencial": 0
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

        // Salvar localmente no Supabase usando Admin Client (bypassing RLS)
        const { error: updateError } = await supabaseAdmin
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
