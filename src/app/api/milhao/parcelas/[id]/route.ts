import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient();

// Marca/desmarca uma parcela como paga
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const paga = !!body.paga;
        const { data, error } = await supabaseAdmin
            .from('milhao_parcelas')
            .update({ paga, data_pagamento: paga ? new Date().toISOString().slice(0, 10) : null })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return NextResponse.json({ success: true, parcela: data });
    } catch (err: any) {
        console.error('[API Milhão parcelas PATCH] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
