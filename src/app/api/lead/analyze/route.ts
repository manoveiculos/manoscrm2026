import { NextRequest, NextResponse } from 'next/server';
import { runEliteCloser } from '@/lib/services/ai-closer-service';
import { createServerClient } from '@supabase/ssr';

export async function POST(req: NextRequest) {
    try {
        const { leadId, table, messages } = await req.json();

        if (!leadId) {
            return NextResponse.json({ success: false, error: 'Lead ID missing' }, { status: 400 });
        }

        // Simula o formato esperado pelo runEliteCloser se necessário
        // O runEliteCloser já busca os dados no banco se não passarmos mensagens
        const result = await runEliteCloser(leadId, messages || [], 'Consultor');

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[API Lead Analyze] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
