import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/aiProviders';
import { createClient } from '@/lib/supabase/admin';

const supabaseAdmin = createClient();

// POST /api/ai/semantic-search
// body: { query: string, limit?: number, threshold?: number }
export async function POST(req: NextRequest) {
    try {
        const { query, limit = 20, threshold = 0.2 } = await req.json();

        if (!query?.trim()) {
            return NextResponse.json({ error: 'Query obrigatória' }, { status: 400 });
        }

        // Gera embedding da query
        const embRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: query.trim(),
        });
        const queryEmbedding = embRes.data[0].embedding;

        // Busca por similaridade via função SQL match_leads_semantic
        const { data, error } = await supabaseAdmin.rpc('match_leads_semantic', {
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: limit,
        });

        if (error) {
            // Se a função não existir ainda, retorna lista vazia com flag
            if (error.message.includes('match_leads_semantic')) {
                return NextResponse.json({ success: true, results: [], needs_indexing: true });
            }
            throw error;
        }

        // Verifica se há leads sem embedding (precisa indexar)
        const { count } = await supabaseAdmin
            .from('leads_master')
            .select('id', { count: 'exact', head: true })
            .is('embedding', null);

        return NextResponse.json({
            success: true,
            results: data || [],        // [{ id: uuid, similarity: float }]
            unindexed_count: count ?? 0,
        });
    } catch (err: any) {
        console.error('[semantic-search]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
