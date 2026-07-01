import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { OWNER_REPASSE, sanitizeVeiculo } from '@/lib/repasse/compute';

export const dynamic = 'force-dynamic';
const sb = createClient();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const row = sanitizeVeiculo(body);
        const hoje = new Date().toISOString().slice(0, 10);
        if (row.status === 'vendido' && body.data_venda === undefined) row.data_venda = hoje;
        if (['comprado', 'anunciado', 'vendido'].includes(row.status) && body.data_compra === undefined) row.data_compra = hoje;
        const { data, error } = await sb.from('repasse_veiculos').update(row)
            .eq('id', id).eq('owner_email', OWNER_REPASSE).select().single();
        if (error) throw error;
        return NextResponse.json({ success: true, veiculo: data });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { error } = await sb.from('repasse_veiculos').delete().eq('id', id).eq('owner_email', OWNER_REPASSE);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
