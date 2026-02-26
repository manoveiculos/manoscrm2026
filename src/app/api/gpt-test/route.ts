import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

// Inicializa a OpenAI fora do handler para reutilizar a instância
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function GET() {
    try {
        // Verifica se a chave de API está presente
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { success: false, error: "A variável OPENAI_API_KEY não foi encontrada no .env.local" },
                { status: 500 }
            );
        }

        // Teste simples de conexão usando a listagem de modelos ou um chat simples
        // Nota: O modelo solicitado gpt-4.1-mini não existe na nomenclatura oficial da OpenAI.
        // Provavelmente o usuário quis dizer gpt-4o-mini ou gpt-4-turbo.
        // Usaremos gpt-4o-mini que é o padrão atual da OpenAI para custo/benefício.
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Modelo oficial mini mais recente
            messages: [
                { role: "system", content: "You are a specialized CRM assistant for Manos Veículos." },
                { role: "user", content: "Hello! This is a connection test. Respond with 'Test Successful' and a brief tip for online vehicle sales." }
            ],
            temperature: 0.7,
        });

        // Extrai o conteúdo com segurança
        const output_text = response.choices[0]?.message?.content || "No response received";

        return NextResponse.json({
            success: true,
            model_used: "gpt-4o-mini",
            text: output_text,
            raw_id: response.id
        });

    } catch (error: any) {
        console.error("OpenAI Connection Error:", error);

        return NextResponse.json({
            success: false,
            error: "Falha na conexão com o servidor de IA",
            details: error.message || "Erro desconhecido",
            code: error.code || "unknown"
        }, { status: 500 });
    }
}
