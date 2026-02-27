import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const { leads } = await req.json();

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: 'AI Key not configured' }, { status: 500 });
        }

        if (!leads || !Array.isArray(leads)) {
            return NextResponse.json({ error: 'Invalid leads data' }, { status: 400 });
        }

        const prompt = `Você é um Analista de Vendas Sênior da Manos Veículos. Sua tarefa é classificar leads de arquivos antigos com ALTA PRECISÃO em 'hot', 'warm' ou 'cold'.

CRITÉRIOS DE CLASSIFICAÇÃO:
1. **hot (ALTA PRIORIDADE)**: 
   - Demonstrou intenção clara de compra IMEDIATA.
   - Perguntou sobre financiamento, parcelas ou entrada.
   - Solicitou avaliação de veículo na troca de forma específica.
   - Marcou ou demonstrou forte desejo de visitar a loja.
   - "Quero fechar", "Como faço para comprar", "Aprovo ficha pelo WhatsApp?".

2. **warm (INTERESSE ATIVO)**: 
   - Respondeu às perguntas mas ainda tem dúvidas.
   - Demonstrou interesse em modelos específicos mas não falou de valores/negócio ainda.
   - Está comparando opções ou aguardando algum evento (ex: vender carro próprio por fora).
   - "Ainda está disponível?", "Qual a km?", "Aceita proposta?".

3. **cold (BAIXO INTERESSE / DESCARTADO)**: 
   - Não respondeu a múltiplas tentativas.
   - Disse que já comprou em outro lugar ou desistiu.
   - Apenas curiosos sem continuidade.
   - Resumo indica que o contato foi encerrado sem avanço.

LEADS PARA ANÁLISE:
${leads.map((l, i) => `
ID: ${i}
Interesse: ${l.interesse || 'Não especificado'}
Veículo na Troca: ${l.troca || 'Não informado'}
Resumo do Atendimento: ${l.resumo || 'Sem resumo'}
---`).join('\n')}

INSTRUÇÃO DE SAÍDA:
Retorne EXATAMENTE um objeto JSON no formato:
{ 
  "results": [
    {
      "classification": "hot" | "warm" | "cold",
      "reasoning": "...",
      "nivel_interesse": "alto" | "medio" | "baixo",
      "momento_compra": "imediato" | "breve" | "em pesquisa" | "indefinido",
      "resumo_consultor": "resumo estratégico curto para o consultor",
      "proxima_acao": "ação prática recomendada"
    },
    ...
  ]
}`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: 'Você é um classificador de leads preciso. Responda apenas com o JSON solicitado.'
            }, {
                role: 'user',
                content: prompt
            }],
            response_format: { type: "json_object" },
            temperature: 0.3
        });

        const output = JSON.parse(response.choices[0]?.message?.content || '{}');
        return NextResponse.json(output);

    } catch (error: any) {
        console.error('AI Classification Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
