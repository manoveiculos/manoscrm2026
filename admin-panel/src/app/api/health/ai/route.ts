import { NextResponse } from 'next/server';

export async function GET() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return NextResponse.json({
            status: 'error',
            message: 'Chave de API OpenAI não configurada no ambiente.'
        }, { status: 400 });
    }

    try {
        // Simple validation call to OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: "Diga 'ok'" }],
                max_tokens: 5
            })
        });

        const data = await response.json();

        if (response.ok && data.choices) {
            return NextResponse.json({
                status: 'ok',
                message: 'IA OpenAI conectada e validada.',
                model: 'gpt-4o-mini'
            });
        } else {
            return NextResponse.json({
                status: 'invalid',
                message: 'A chave da OpenAI existe, mas não é válida ou está expirada.',
                details: data.error?.message || 'Erro desconhecido'
            }, { status: 401 });
        }
    } catch (error: unknown) {
        const err = error as Error;
        return NextResponse.json({
            status: 'error',
            message: 'Falha na comunicação com o servidor da OpenAI.',
            details: err.message
        }, { status: 500 });
    }
}
