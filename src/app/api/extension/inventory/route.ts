import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const { data, error } = await supabaseAdmin
            .from('estoque')
            .select('id, marca, modelo, ano, preco, km, combustivel, cambio, cor, status, imagem_url, drive_id')
            .not('status', 'eq', 'sold')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        return NextResponse.json({ success: true, inventory: data || [] });
    } catch (err: any) {
        console.error('[Extension Inventory API]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
