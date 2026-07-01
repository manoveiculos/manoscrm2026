import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { OWNER_REPASSE, sanitizeLoja } from '@/lib/repasse/compute';

export const dynamic = 'force-dynamic';
const sb = createClient();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const row = sanitizeLoja(body);
        const { data, error } = await sb.from('repasse_lojas').update(row)
            .eq('id', id).eq('owner_email', OWNER_REPASSE).select().single();
        if (error) throw error;
        return NextResponse.json({ success: true, loja: data });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { error } = await sb.from('repasse_lojas').delete().eq('id', id).eq('owner_email', OWNER_REPASSE);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
