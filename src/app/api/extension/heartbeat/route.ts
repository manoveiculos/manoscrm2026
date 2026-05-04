import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { verifyExtensionToken } from '@/lib/extensionAuth';

export const dynamic = 'force-dynamic';

const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://web.whatsapp.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
};

export async function OPTIONS() {
    return new Response(null, { status: 200, headers: corsHeaders });
}

/**
 * POST /api/extension/heartbeat
 *
 * Body: {
 *   consultant_id?:    UUID (resolvido por consultant_email/name se não vier)
 *   consultant_email?: usado pra resolver consultant_id se não veio
 *   consultant_name?:  fallback final pra resolver consultant_id
 *   lead_phone:        telefone do contato aberto no WhatsApp Web
 *   lead_id?:          UUID/int do lead (se já localizado pela extensão)
 *   lead_table?:       'leads_manos_crm' | 'leads_compra' | 'leads_distribuicao_crm_26'
 *   lead_name?:        nome do contato exibido no WhatsApp
 *   action:            'opened' | 'heartbeat' | 'closed'
 *   reason?:           'switched_chat' | 'tab_closed' | 'manual' (só pra closed)
 * }
 */
export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        const {
            consultant_id, consultant_email, consultant_name,
            lead_phone, lead_id, lead_table, lead_name,
            action = 'heartbeat', reason,
        } = body;

        if (!lead_phone) {
            return NextResponse.json({ error: 'lead_phone obrigatório' }, { status: 400, headers: corsHeaders });
        }

        const cleanPhone = String(lead_phone).replace(/\D/g, '');
        const admin = createClient();

        // Resolve consultant_id se não veio
        let consId: string | null = consultant_id || null;
        let consName: string | null = consultant_name || null;
        if (!consId && (consultant_email || consultant_name)) {
            let q = admin.from('consultants_manos_crm').select('id, name').eq('is_active', true);
            if (consultant_email) q = q.eq('email', consultant_email);
            else if (consultant_name) q = q.ilike('name', `%${consultant_name}%`);
            const { data: c } = await q.limit(1).maybeSingle();
            if (c?.id) {
                consId = c.id;
                consName = consName || c.name;
            }
        }
        if (!consId) {
            return NextResponse.json({ error: 'consultant_id não pôde ser resolvido' }, { status: 400, headers: corsHeaders });
        }

        const now = new Date().toISOString();

        if (action === 'closed') {
            // Fecha o registro aberto deste consultor pra esse phone
            const { error } = await admin
                .from('consultant_active_chats')
                .update({ closed_at: now, closed_reason: reason || 'manual' })
                .eq('consultant_id', consId)
                .eq('lead_phone', cleanPhone)
                .is('closed_at', null);
            if (error) throw error;
            return NextResponse.json({ ok: true, action: 'closed' }, { headers: corsHeaders });
        }

        // 'opened' OU 'heartbeat' — upsert
        // Se já tem registro aberto pro mesmo (consultor, phone) → atualiza heartbeat
        // Senão → cria novo
        const { data: existing } = await admin
            .from('consultant_active_chats')
            .select('id, opened_at')
            .eq('consultant_id', consId)
            .eq('lead_phone', cleanPhone)
            .is('closed_at', null)
            .order('opened_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existing?.id) {
            await admin
                .from('consultant_active_chats')
                .update({
                    last_heartbeat_at: now,
                    // Atualiza nome/lead_id se vieram (extensão pode resolver depois)
                    ...(consName ? { consultant_name: consName } : {}),
                    ...(lead_id ? { lead_id: String(lead_id) } : {}),
                    ...(lead_table ? { lead_table } : {}),
                    ...(lead_name ? { lead_name } : {}),
                })
                .eq('id', existing.id);
            return NextResponse.json({ ok: true, action: 'heartbeat', id: existing.id }, { headers: corsHeaders });
        }

        // Cria novo registro (action='opened' implícito)
        // Se vendedor estava em outro chat, fecha o anterior
        await admin
            .from('consultant_active_chats')
            .update({ closed_at: now, closed_reason: 'switched_chat' })
            .eq('consultant_id', consId)
            .is('closed_at', null);

        const { data: created, error } = await admin
            .from('consultant_active_chats')
            .insert({
                consultant_id: consId,
                consultant_name: consName,
                lead_phone: cleanPhone,
                lead_id: lead_id ? String(lead_id) : null,
                lead_table: lead_table || null,
                lead_name: lead_name || null,
                opened_at: now,
                last_heartbeat_at: now,
            })
            .select('id')
            .single();
        if (error) throw error;

        return NextResponse.json({ ok: true, action: 'opened', id: created.id }, { headers: corsHeaders });
    } catch (e: any) {
        console.error('[heartbeat]', e?.message);
        return NextResponse.json({ error: e?.message || 'erro interno' }, { status: 500, headers: corsHeaders });
    }
}
