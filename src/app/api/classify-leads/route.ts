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

        const prompt = `Classifique os seguintes leads de vendas de veículos em 'hot', 'warm' ou 'cold' baseando-se no resumo do atendimento.
        
REGRAS:
- 'hot': Cliente muito interessado, quer ver o carro, perguntou sobre financiamento/parcela, ou marcou visita.
- 'warm': Cliente interessado mas com dúvidas, respondeu mas não avançou muito, ou está comparando.
- 'cold': Cliente não respondeu, disse que não quer mais, ou resumo indica falta de interesse claro.

LEADS:
${leads.map((l, i) => `${i}. [Resumo]: ${l.resumo || 'Sem resumo'}`).join('\n')}

Retorne um JSON com uma lista de classificações no mesmo formato:
{ "classifications": ["hot", "cold", "warm", ...] }`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: "json_object" }
        });

        const output = JSON.parse(response.choices[0]?.message?.content || '{}');
        return NextResponse.json(output);

    } catch (error: any) {
        console.error('AI Classification Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
