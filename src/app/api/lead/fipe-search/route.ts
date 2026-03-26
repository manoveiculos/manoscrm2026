import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function POST(req: NextRequest) {
    try {
        const { brand, model: vehicleModel, year, query, fullQuery } = await req.json();
        const searchTarget = fullQuery || query || `${brand} ${vehicleModel} ${year}`;

        if (!searchTarget || searchTarget.length < 3) {
            return NextResponse.json({ error: 'Dados insuficientes para pesquisa' }, { status: 400 });
        }

        const genModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Você é um especialista em avaliação de veículos para o mercado brasileiro.
        ESTAMOS EM: Março de 2026.
        DADOS DO VEÍCULO: ${searchTarget} (Marca: ${brand}, Modelo: ${vehicleModel}, Ano: ${year}).

        Sua tarefa é fornecer uma estimativa REALISTA de valores de mercado e Tabela FIPE para este período (2026).
        Considere a inflação e a valorização de seminovos no Brasil nos últimos anos.

        REGRAS:
        1. Valor FIPE: O valor oficial aproximado para 2026.
        2. Valor de Mercado: O valor médio de venda em portais (normalmente 10-15% acima da FIPE para carros bem conservados).
        3. Base de Pagamento: O valor que uma loja pagaria (geralmente 80% da FIPE).
        4. Observação: Comentário curto sobre a facilidade de revenda (liquidez).

        RETORNE EXCLUSIVAMENTE UM JSON VÁLIDO (SEM MARKDOWN, SEM TEXTO EXTRA):
        {
          "fipe": "R$ 00.000",
          "mercado": "R$ 00.000",
          "base_pagamento": "R$ 00.000",
          "observacao": "Sua análise aqui"
        }`;

        const result = await genModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log("Gemini Raw Response:", text);

        let data;
        try {
            // Parser robusto: tenta extrair o primeiro { até o último }
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : text;
            const cleanJson = jsonString.replace(/```json|```/g, "").trim();
            data = JSON.parse(cleanJson);
        } catch (parseError) {
            console.error("JSON Parse Error. Raw text:", text);
            // Fallback em caso de erro de formato
            data = {
                fipe: "Sob consulta",
                mercado: "Sob consulta",
                base_pagamento: "Sob consulta",
                observacao: "Não foi possível processar os valores automaticamente. Verifique manualmente."
            };
        }

        return NextResponse.json(data);

    } catch (err: any) {
        console.error("FIPE Search Error:", err);
        return NextResponse.json({ 
            fipe: "Erro", 
            mercado: "Erro", 
            base_pagamento: "Erro", 
            observacao: "Falha na conexão com o serviço de inteligência: " + err.message 
        }, { status: 200 }); // Retornar 200 com erro estruturado para não quebrar o front
    }
}
