import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

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

        const openai = getOpenAI();
        if (!openai) throw new Error("Falha ao inicializar OpenAI.");

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Você é um Especialista em Gestão de Tráfego de Alta Performance focado em Concessionárias de Veículos. Suas ordens são exatas, táticas e sem enrolação.'
                },
                {
                    role: 'user',
                    content: `Analise esta campanha de forma fria e estratégica. Seja direto.
            
            DADOS DA CAMPANHA:
            - Nome: ${campaign.name}
            - Plataforma: ${campaign.platform}
            - Status Atual: ${campaign.status === 'active' ? 'ATIVA' : 'PAUSADA'}
            - Investimento: R$ ${campaign.total_spend}
            - Visualizações (Impressões): ${campaign.impressions}
            - Cliques: ${campaign.link_clicks}
            - CTR: ${campaign.ctr}%
            - CPC: R$ ${campaign.cpc}
            - CPL (Custo Por Lead Estimado): R$ ${leadsSummary.total > 0 ? (campaign.total_spend / leadsSummary.total).toFixed(2) : campaign.total_spend}
            
            RESULTADO NO CRM:
            - Leads Totais: ${leadsSummary.total}
            
            DIRETRIZES TÁTICAS:
            1. Seja "preto no branco". Se a campanha for ruim, mande PAUSAR. Se for ótima, mande ESCALAR e aumentar a verba.
            2. "gargalo_identificado" deve expor o problema exato em UMA FRASE (ex: "Criativo não gera clique" ou "Lead muito caro para fechar negócio").
            3. "proximos_passos" devem ser EXATAMENTE 3 passos. Comece cada passo com verbos de ação imperativos (ex: "Pausar anúncio X", "Aumentar orçamento em 20%", "Alterar público para segmentação aberta"). Sem explicações longas, seja clínico.
            4. "saude_campanha" deve ser APENAS UM DOS SEGUINTES: EXCELENTE | BOA | REGULAR | CRÍTICA.
            
            RESPONDA APENAS NESTE FORMATO JSON EXATO:
            {
              "analise_critica": "Um parágrafo de 3 linhas com o veredito técnico (ROI e viabilidade).",
              "saude_campanha": "EXCELENTE | BOA | REGULAR | CRÍTICA",
              "gargalo_identificado": "Onde está vazando dinheiro/oportunidade?",
              "proximos_passos": ["Ação Tática 1", "Ação Tática 2", "Ação Tática 3"],
              "score_potencial": number (0-100)
            }`
                }
            ],
            response_format: { type: "json_object" }
        });

        const output = response.choices[0]?.message?.content;
        if (!output) throw new Error("Resposta da IA vazia");

        return NextResponse.json({
            success: true,
            ...JSON.parse(output)
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
