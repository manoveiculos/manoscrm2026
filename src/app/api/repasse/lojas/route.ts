import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { OWNER_REPASSE, sanitizeLoja } from '@/lib/repasse/compute';

export const dynamic = 'force-dynamic';
const sb = createClient();

export async function GET() {
    try {
        const { data, error } = await sb.from('repasse_lojas').select('*')
            .eq('owner_email', OWNER_REPASSE).order('nome', { ascending: true });
        if (error) throw error;
        return NextResponse.json({ success: true, lojas: data || [] });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        if (!body.nome) return NextResponse.json({ success: false, error: 'Nome é obrigatório.' }, { status: 400 });
        const row = sanitizeLoja(body);
        row.owner_email = OWNER_REPASSE;
        const { data, error } = await sb.from('repasse_lojas').insert(row).select().single();
        if (error) throw error;
        return NextResponse.json({ success: true, loja: data });
    } catch (err: any) {
        console.error('[API Repasse lojas POST] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
