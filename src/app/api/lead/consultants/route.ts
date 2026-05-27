import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/lead/consultants
 *
 * Retorna todos os consultores ativos do CRM.
 * Usado pelo frontend para listar possíveis destinatários de transferência de leads,
 * contornando restrições de RLS (Row Level Security) no Supabase Client.
 */
export async function GET(req: NextRequest) {
    try {
        // Valida se o usuário está autenticado
        const cookieStore = await cookies();
        const supabaseSSR = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll: () => cookieStore.getAll(),
                    setAll: () => {},
                },
            }
        );
        const { data: { user } } = await supabaseSSR.auth.getUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
        }

        const admin = createClient();
        const { data: consultants, error } = await admin
            .from('consultants_manos_crm')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ success: true, consultants });

    } catch (err: any) {
        console.error("GET /api/lead/consultants error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
