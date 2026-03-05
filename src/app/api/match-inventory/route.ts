import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { dataService } from '@/lib/dataService';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const { lead } = await req.json();

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: 'AI Key not configured' }, { status: 500 });
        }

        if (!lead) {
            return NextResponse.json({ error: 'Invalid lead data' }, { status: 400 });
        }

        // Get current inventory to match
        const inventory = await dataService.getInventory();
        const activeInventory = inventory.filter(i => i.status === 'in_stock' || !i.status);

        if (activeInventory.length === 0) {
            return NextResponse.json({ matches: [], reasoning: "Nenhum veículo em estoque no momento." });
        }

        const prompt = `Você é um Estrategista de Vendas da Manos Veículos. 
Sua missão é cruzar os interesses de um lead antigo com nosso ESTOQUE ATUAL para sugerir uma reativação de contato matadora.

DADOS DO LEAD:
- Nome: ${lead.nome}
- Interesse Anterior: ${lead.interesse || 'Não especificado'}
- Veículo na Troca: ${lead.troca || 'Não informado'}
- Resumo do Histórico: ${lead.resumo || 'Sem histórico detalhado'}

ESTOQUE DISPONÍVEL (Top 20 veículos):
${activeInventory.slice(0, 20).map(i => `- ${i.marca} ${i.modelo} (${i.ano}) - R$ ${i.preco}`).join('\n')}

INSTRUÇÕES:
1. Encontre até 2 veículos que mais se aproximam do que o cliente buscava ou que seriam um "upgrade" natural.
2. Explique brevemente POR QUE esses carros são boas opções para este cliente específico.
3. Crie uma sugestão de mensagem para o WhatsApp que seja amigável, não invasiva e muito persuasiva.

SAÍDA ESPERADA (JSON):
{
  "matches": [
    {
      "veiculo": "Marca Modelo Ano",
      "motivo": "Explicação estratégica",
      "preco": "Valor"
    }
  ],
  "sugestao_mensagem": "Olá [Nome]! Tudo bem? Aqui é o [Consultor] da Manos Veículos..."
}`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: 'Você é um especialista em reativação de vendas de carros. Responda apenas com o JSON solicitado.'
            }, {
                role: 'user',
                content: prompt
            }],
            response_format: { type: "json_object" },
            temperature: 0.4
        });

        const output = JSON.parse(response.choices[0]?.message?.content || '{}');
        return NextResponse.json(output);

    } catch (error: any) {
        console.error('Inventory Matching Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
