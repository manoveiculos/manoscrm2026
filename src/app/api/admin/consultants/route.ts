import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * /api/admin/consultants
 *
 * GET  → lista consultores + sinaliza configuração faltando
 *        (sem personal_whatsapp, sem user_id, sem phone)
 * POST → upsert dos campos editáveis: name, phone, personal_whatsapp,
 *        is_active, role, user_id, email
 *
 * Auth: header `x-admin-secret` === CRON_SECRET. Simples e suficiente
 * pra uma tela administrativa interna.
 */

const EDITABLE = ['name', 'phone', 'personal_whatsapp', 'is_active', 'role', 'user_id', 'email'] as const;

function ensureAuth(req: NextRequest): NextResponse | null {
    const secret = req.headers.get('x-admin-secret');
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return null;
}

export async function GET(req: NextRequest) {
    const fail = ensureAuth(req);
    if (fail) return fail;

    const admin = createClient();
    const { data, error } = await admin
        .from('consultants_manos_crm')
        .select('id, name, email, phone, personal_whatsapp, user_id, is_active, role, last_lead_assigned_at')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const consultants = (data || []).map((c: any) => ({
        ...c,
        missing: {
            personal_whatsapp: !c.personal_whatsapp,
            user_id: !c.user_id,
            phone: !c.phone,
        },
    }));

    return NextResponse.json({ ok: true, consultants });
}

export async function POST(req: NextRequest) {
    const fail = ensureAuth(req);
    if (fail) return fail;

    const body = await req.json().catch(() => ({}));
    const id = body?.id;
    if (!id || typeof id !== 'string') {
        return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    for (const k of EDITABLE) {
        if (k in body) updates[k] = body[k];
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });
    }

    const admin = createClient();
    const { error } = await admin
        .from('consultants_manos_crm')
        .update(updates)
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: Object.keys(updates) });
}
