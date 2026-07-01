import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { OWNER_REPASSE } from '@/lib/repasse/compute';

export const dynamic = 'force-dynamic';
const sb = createClient();

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { error } = await sb.from('repasse_caixa').delete().eq('id', id).eq('owner_email', OWNER_REPASSE);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
