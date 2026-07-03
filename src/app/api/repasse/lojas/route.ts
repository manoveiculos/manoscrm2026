import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { sanitizeLoja } from '@/lib/repasse/compute';
import { getRepasseOwner } from '@/lib/repasse/owner';

export const dynamic = 'force-dynamic';
const sb = createClient();

export async function GET() {
    try {
        const owner = await getRepasseOwner();
        if (!owner) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
        const { data, error } = await sb.from('repasse_lojas').select('*')
            .eq('owner_email', owner).order('nome', { ascending: true });
        if (error) throw error;
        return NextResponse.json({ success: true, lojas: data || [] });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const owner = await getRepasseOwner();
        if (!owner) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
        const body = await request.json();
        if (!body.nome) return NextResponse.json({ success: false, error: 'Nome é obrigatório.' }, { status: 400 });
        const row = sanitizeLoja(body);
        row.owner_email = owner;
        const { data, error } = await sb.from('repasse_lojas').insert(row).select().single();
        if (error) throw error;
        return NextResponse.json({ success: true, loja: data });
    } catch (err: any) {
        console.error('[API Repasse lojas POST] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
