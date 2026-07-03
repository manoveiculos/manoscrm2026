import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { deriveVeiculo, sanitizeVeiculo } from '@/lib/repasse/compute';
import { getRepasseOwner } from '@/lib/repasse/owner';

export const dynamic = 'force-dynamic';
const sb = createClient();

function autodatas(row: Record<string, any>) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (row.status === 'vendido' && !row.data_venda) row.data_venda = hoje;
    if (['comprado', 'anunciado', 'vendido'].includes(row.status) && !row.data_compra) row.data_compra = hoje;
}

export async function GET() {
    try {
        const owner = await getRepasseOwner();
        if (!owner) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
        const { data, error } = await sb.from('repasse_veiculos').select('*')
            .eq('owner_email', owner).order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, veiculos: (data || []).map((v) => deriveVeiculo(v)) });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const owner = await getRepasseOwner();
        if (!owner) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
        const body = await request.json();
        if (!body.marca || !body.modelo) {
            return NextResponse.json({ success: false, error: 'Marca e modelo são obrigatórios.' }, { status: 400 });
        }
        const row = sanitizeVeiculo(body);
        row.owner_email = owner;
        autodatas(row);
        const { data, error } = await sb.from('repasse_veiculos').insert(row).select().single();
        if (error) throw error;
        return NextResponse.json({ success: true, veiculo: data });
    } catch (err: any) {
        console.error('[API Repasse veículos POST] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
