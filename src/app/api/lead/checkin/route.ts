import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { hojeSP } from '@/lib/services/slaEngine';

export const dynamic = 'force-dynamic';

// Resolve o consultor logado a partir do cookie de sessão.
async function getConsultant() {
    const cookieStore = await cookies();
    const ssr = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return null;
    const admin = createClient();
    const { data } = await admin.from('consultants_manos_crm').select('id, name, disponivel_em').or(`user_id.eq.${user.id},auth_id.eq.${user.id}`).maybeSingle();
    return data ? { admin, ...data } : null;
}

// GET — estou disponível hoje?
export async function GET() {
    const c = await getConsultant();
    if (!c) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
    return NextResponse.json({ success: true, disponivel: c.disponivel_em === hojeSP(), hoje: hojeSP() });
}

// POST — check-in / check-out do dia. body: { disponivel: boolean }
export async function POST(req: NextRequest) {
    const c = await getConsultant();
    if (!c) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const disponivel = body?.disponivel !== false; // default = check-in
    const { error } = await (c as any).admin
        .from('consultants_manos_crm')
        .update({ disponivel_em: disponivel ? hojeSP() : null })
        .eq('id', (c as any).id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, disponivel });
}
