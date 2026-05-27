import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

/**
 * GET  /api/billing/ai-daily-briefing/history
 *   → lista todos os briefings salvos (max 60), ordenados do mais recente p/ o mais antigo
 *   query opcional: ?date=YYYY-MM-DD → retorna apenas o briefing daquele dia
 *
 * Briefings são gravados em billing_observacoes_gerais com:
 *   titulo = "ai-daily-briefing-YYYY-MM-DD"
 *   categoria = "ALERTA"
 *   conteudo = JSON.stringify(briefingPayload)
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const date = searchParams.get('date');
        const admin = createClient();

        if (date) {
            const titulo = `ai-daily-briefing-${date}`;
            const { data, error } = await admin
                .from('billing_observacoes_gerais')
                .select('conteudo, created_at')
                .eq('titulo', titulo)
                .eq('categoria', 'ALERTA')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            if (!data) return NextResponse.json({ briefing: null });

            try {
                const parsed = JSON.parse(data.conteudo);
                return NextResponse.json({
                    briefing: { ...parsed, _cached: true, _cached_at: data.created_at, _date: date }
                });
            } catch {
                return NextResponse.json({ briefing: null });
            }
        }

        // Lista todos
        const { data, error } = await admin
            .from('billing_observacoes_gerais')
            .select('titulo, created_at')
            .eq('categoria', 'ALERTA')
            .like('titulo', 'ai-daily-briefing-%')
            .order('created_at', { ascending: false })
            .limit(60);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const list = (data || []).map(r => {
            const date = r.titulo.replace('ai-daily-briefing-', '');
            return { date, created_at: r.created_at };
        });

        return NextResponse.json({ history: list });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
    }
}
