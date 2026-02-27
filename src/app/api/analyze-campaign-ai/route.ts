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
                    content: 'Você é um Especialista em Gestão de Tráfego e Marketing Digital para Concessionárias de Veículos.'
                },
                {
                    role: 'user',
                    content: `Realize uma análise técnica profunda desta campanha de marketing e forneça o PRÓXIMOS PASSOS para melhoria.
            
            DADOS DA CAMPANHA:
            - Nome: ${campaign.name}
            - Plataforma: ${campaign.platform}
            - Investimento: R$ ${campaign.total_spend}
            - Visualizações (Impressões): ${campaign.impressions}
            - Cliques: ${campaign.link_clicks}
            - CTR: ${campaign.ctr}%
            - CPC: R$ ${campaign.cpc}
            
            RESULTADO NO CRM:
            - Leads Totais Capturados: ${leadsSummary.total}
            - Leads Qualificados (HOT/WARM): ${leadsSummary.qualified}
            - Status dos Leads: ${JSON.stringify(leadsSummary.statusCounts)}
            
            DIRETRIZES DA ANÁLISE:
            1. Avalie a eficiência do criativo (CTR vs Cliques).
            2. Analise a qualidade dos leads (Leads vs Qualificação).
            3. Identifique gargalos (ex: muitos cliques mas poucos leads, ou muitos leads mas baixa qualidade).
            4. Forneça 3 passos práticos e "diretos ao ponto" para o gestor melhorar o ROI.
            
            RESPONDA EM JSON:
            {
              "analise_critica": "string (resumo técnico)",
              "saude_campanha": "EXCELENTE | BOA | REGULAR | CRÍTICA",
              "gargalo_identificado": "string",
              "proximos_passos": ["string", "string", "string"],
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
