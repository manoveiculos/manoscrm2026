import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { openai } from '@/lib/aiProviders';
import { logAiCall } from '@/lib/services/observability';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('query') || '';
        const limitStr = searchParams.get('limit') || '5';
        const thresholdStr = searchParams.get('threshold') || '0.25';

        if (!query) {
            return NextResponse.json({ success: false, error: 'O parâmetro query é obrigatório' }, { status: 400 });
        }

        const limit = parseInt(limitStr, 10);
        const threshold = parseFloat(thresholdStr);

        console.log(`[SemanticSearch] Buscando por: "${query}" (limit=${limit}, threshold=${threshold})...`);

        const startTime = performance.now();
        let queryEmbedding: number[] | null = null;
        let embeddingResponse: any = null;

        try {
            // 1. Gera o embedding da query usando a OpenAI
            embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: query,
            });
            queryEmbedding = embeddingResponse.data?.[0]?.embedding;
        } catch (embError: any) {
            const latencyMs = Math.round(performance.now() - startTime);
            logAiCall({
                model: 'text-embedding-3-small',
                latencyMs,
                callerApi: 'semantic-search',
                status: 'error',
                errorMessage: embError?.message || 'Erro ao gerar embedding'
            });
            throw embError;
        }

        const latencyMs = Math.round(performance.now() - startTime);
        const promptTokens = embeddingResponse?.usage?.prompt_tokens || 0;
        const totalTokens = embeddingResponse?.usage?.total_tokens || promptTokens;

        logAiCall({
            model: 'text-embedding-3-small',
            promptTokens,
            completionTokens: 0,
            totalTokens,
            latencyMs,
            callerApi: 'semantic-search',
            status: 'success'
        });

        if (!queryEmbedding) {
            throw new Error('Falha ao gerar o embedding da busca.');
        }

        // 2. Chama a RPC match_estoque no Supabase
        const admin = createClient();
        const { data: matches, error: rpcError } = await admin.rpc('match_estoque', {
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: limit
        });

        if (rpcError) {
            console.error('[SemanticSearch] Erro ao executar RPC match_estoque:', rpcError);
            return NextResponse.json({ success: false, error: rpcError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            query,
            results: matches || []
        });
    } catch (e: any) {
        console.error('[SemanticSearch] Critical error:', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal Server Error' }, { status: 500 });
    }
}

