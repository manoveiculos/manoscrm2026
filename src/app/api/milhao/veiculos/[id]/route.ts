import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient();

const CAMPOS = [
    'estoque_id_externo', 'marca', 'modelo', 'versao', 'ano', 'placa', 'km', 'cor',
    'valor_compra', 'custos_reconto', 'valor_fipe', 'valor_anuncio', 'valor_venda',
    'data_compra', 'data_venda', 'status', 'consultor', 'obs',
];

function sanitize(body: any) {
    const row: Record<string, any> = {};
    for (const k of CAMPOS) {
        if (body[k] !== undefined) row[k] = body[k] === '' ? null : body[k];
    }
    return row;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const row = sanitize(body);
        if (row.status === 'vendido' && !row.data_venda) {
            row.data_venda = new Date().toISOString().slice(0, 10);
        }
        const { data, error } = await supabaseAdmin
            .from('milhao_veiculos')
            .update(row)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return NextResponse.json({ success: true, veiculo: data });
    } catch (err: any) {
        console.error('[API Milhão veículos PATCH] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { error } = await supabaseAdmin.from('milhao_veiculos').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[API Milhão veículos DELETE] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
