import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { buildLedger } from '@/lib/repasse/compute';
import { getRepasseOwner } from '@/lib/repasse/owner';

export const dynamic = 'force-dynamic';
const sb = createClient();

const CAMPOS = ['tipo', 'categoria', 'descricao', 'valor', 'data', 'forma_pagamento', 'veiculo_id'];
const NOT_NULL = new Set(['tipo', 'categoria', 'valor', 'data']);

function sanitize(body: any) {
    const row: Record<string, any> = {};
    for (const k of CAMPOS) {
        if (body[k] === undefined) continue;
        const v = body[k];
        if (v === '' || v === null) { if (NOT_NULL.has(k)) continue; row[k] = null; }
        else row[k] = v;
    }
    return row;
}

// Extrato unificado: movimentos manuais + os derivados dos carros
export async function GET() {
    try {
        const owner = await getRepasseOwner();
        if (!owner) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
        const [{ data: veiculos }, { data: caixa }] = await Promise.all([
            sb.from('repasse_veiculos').select('*').eq('owner_email', owner),
            sb.from('repasse_caixa').select('*').eq('owner_email', owner),
        ]);
        return NextResponse.json({ success: true, extrato: buildLedger(veiculos || [], caixa || []) });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const owner = await getRepasseOwner();
        if (!owner) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
        const body = await request.json();
        if (!['entrada', 'saida'].includes(body.tipo)) {
            return NextResponse.json({ success: false, error: 'Tipo inválido (entrada/saida).' }, { status: 400 });
        }
        if (!body.valor || Number(body.valor) <= 0) {
            return NextResponse.json({ success: false, error: 'Valor obrigatório.' }, { status: 400 });
        }
        const row = sanitize(body);
        row.owner_email = owner;
        const { data, error } = await sb.from('repasse_caixa').insert(row).select().single();
        if (error) throw error;
        return NextResponse.json({ success: true, mov: data });
    } catch (err: any) {
        console.error('[API Repasse caixa POST] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
