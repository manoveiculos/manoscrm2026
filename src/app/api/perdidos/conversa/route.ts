import { NextResponse } from 'next/server';
import { requireVendedor, supabaseAdmin } from '../../agenda/_guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/perdidos/conversa?uid=<tabela:id>&tel=<telefone>
 * Histórico completo do WhatsApp do lead perdido (SÓ ADMIN) — o contexto
 * real da perda. Busca pela unified_whatsapp_messages (lead_uid = id nativo)
 * e, se vazio, tenta pelo sufixo do telefone nas 3 tabelas (mesma receita
 * do perfil do lead).
 */
export async function GET(request: Request) {
    const g = await requireVendedor();
    if (!g.ok) return g.res;
    if (!g.isAdmin) return NextResponse.json({ success: false, error: 'apenas admin' }, { status: 403 });

    const sp = new URL(request.url).searchParams;
    const uid = (sp.get('uid') || '').trim();
    const tel = (sp.get('tel') || '').replace(/\D/g, '');
    if (!uid && !tel) return NextResponse.json({ success: false, error: 'uid ou tel obrigatório' }, { status: 400 });

    const nativeId = uid.includes(':') ? uid.slice(uid.indexOf(':') + 1) : uid;

    // 1ª tentativa: pelo id nativo (a view normaliza lead_uid como texto)
    let msgs: any[] = [];
    if (nativeId) {
        const { data } = await supabaseAdmin
            .from('unified_whatsapp_messages')
            .select('id, created_at, direction, message_text, sender_name, media_type')
            .eq('lead_uid', nativeId)
            .order('created_at', { ascending: true })
            .limit(300);
        msgs = data || [];
    }

    // Fallback: cruza por sufixo de telefone (8 dígitos) nas 3 tabelas de lead
    if (msgs.length === 0 && tel.length >= 8) {
        const suffix = tel.slice(-8);
        const ids: string[] = [];
        const lookups = [
            { table: 'leads_manos_crm', col: 'phone' },
            { table: 'leads_distribuicao_crm_26', col: 'telefone' },
            { table: 'leads_compra', col: 'telefone' },
        ];
        for (const l of lookups) {
            try {
                const { data } = await supabaseAdmin.from(l.table).select('id').ilike(l.col, `%${suffix}%`).limit(5);
                for (const r of (data || []) as any[]) ids.push(String(r.id));
            } catch { /* defensivo */ }
        }
        if (ids.length) {
            const { data } = await supabaseAdmin
                .from('unified_whatsapp_messages')
                .select('id, created_at, direction, message_text, sender_name, media_type')
                .in('lead_uid', [...new Set(ids)])
                .order('created_at', { ascending: true })
                .limit(300);
            msgs = data || [];
        }
    }

    return NextResponse.json({ success: true, mensagens: msgs });
}
