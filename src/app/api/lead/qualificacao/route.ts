import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { classificarLead, type QualificacaoCampos } from '@/lib/qualificacao';
import { buscarQualificacao, salvarQualificacao, pisoEstoque, tabelaSuportaQualificacao } from '@/lib/services/qualificacaoService';
import { cadastrarAlertaAbaixoDaFaixa } from '@/lib/services/alertaCarroAbaixoFaixa';

export const dynamic = 'force-dynamic';

const isAdminEmail = (email?: string | null) => (email || '').toLowerCase() === 'alexandre_gorges@hotmail.com';

async function contexto() {
    const auth = await createAuthClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return null;
    const admin = createClient();
    const { data: me } = await admin
        .from('consultants_manos_crm')
        .select('id, name, role')
        .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
        .maybeSingle();
    return { admin, me, isAdmin: me?.role === 'admin' || isAdminEmail(user.email) };
}

/**
 * GET /api/lead/qualificacao?uids=leads_distribuicao_crm_26:123,leads_manos_crm:abc
 * → { piso, items: { [uid]: { campos, ...classificação } } }
 */
export async function GET(req: NextRequest) {
    const ctx = await contexto();
    if (!ctx) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });

    const uids = (new URL(req.url).searchParams.get('uids') || '')
        .split(',').map(s => decodeURIComponent(s.trim())).filter(Boolean).slice(0, 300);

    const [piso, mapa] = await Promise.all([
        pisoEstoque(ctx.admin),
        uids.length ? buscarQualificacao(ctx.admin, uids) : Promise.resolve(new Map<string, QualificacaoCampos>()),
    ]);

    const items: Record<string, any> = {};
    for (const [uid, campos] of mapa) items[uid] = { campos, ...classificarLead(campos, piso) };
    return NextResponse.json({ success: true, piso, items });
}

/**
 * POST /api/lead/qualificacao
 * { uid, vehicle_interest?, valor_investimento?, carro_troca?, prazo_compra? }
 * Grava só o que vier no corpo e devolve a classificação atualizada.
 */
export async function POST(req: NextRequest) {
    const ctx = await contexto();
    if (!ctx) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || '');
    const i = uid.indexOf(':');
    const table = i > 0 ? uid.slice(0, i) : '';
    const id = i > 0 ? uid.slice(i + 1) : '';
    if (!table || !id || !tabelaSuportaQualificacao(table)) {
        return NextResponse.json({ success: false, error: 'uid inválido ou tabela sem qualificação' }, { status: 400 });
    }

    // Vendedor só qualifica lead dele (ou sem dono); admin qualifica qualquer um.
    const { data: lead } = await ctx.admin
        .from(table)
        .select('assigned_consultant_id')
        .eq('id', table === 'leads_distribuicao_crm_26' ? parseInt(id, 10) : id)
        .maybeSingle();
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado' }, { status: 404 });
    if (!ctx.isAdmin && lead.assigned_consultant_id && ctx.me?.id && lead.assigned_consultant_id !== ctx.me.id) {
        return NextResponse.json({ success: false, error: 'Este lead pertence a outro vendedor.' }, { status: 403 });
    }

    const campos: QualificacaoCampos = {};
    for (const k of ['vehicle_interest', 'valor_investimento', 'carro_troca', 'prazo_compra'] as const) {
        if (k in (body || {})) campos[k] = body[k] == null ? null : String(body[k]);
    }

    const r = await salvarQualificacao(ctx.admin, table, id, campos);
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 });

    const [piso, mapa] = await Promise.all([pisoEstoque(ctx.admin), buscarQualificacao(ctx.admin, [uid])]);
    const atual = mapa.get(uid) || campos;
    // Pediu carro abaixo do estoque → alerta na Central de Compras (não descarta).
    const alertaCarro = await cadastrarAlertaAbaixoDaFaixa(ctx.admin, table, id);
    return NextResponse.json({ success: true, piso, ignorados: r.ignorados, campos: atual, alerta_carro: alertaCarro.status, ...classificarLead(atual, piso) });
}
