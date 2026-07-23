import { NextResponse } from 'next/server';
import { requireVendedor, supabaseAdmin } from '../agenda/_guard';

export const dynamic = 'force-dynamic';

const LOST = ['perdido', 'lost', 'lost_by_inactivity'];
const JANELA_DIAS = 90;

// Slug do motivo_perda_estruturado → rótulo legível
const MOTIVO_LABEL: Record<string, string> = {
    preco: 'Preço', parcela: 'Parcela alta', modelo: 'Queria outro modelo',
    concorrente: 'Comprou no concorrente', credito_negado: 'Crédito negado',
    cpf_ruim: 'CPF com restrição', score_baixo: 'Score baixo',
    sumiu: 'Sumiu / não respondeu', sem_interesse: 'Sem interesse',
    ja_comprou: 'Já comprou', inatividade: 'Perdido por inatividade', outro: 'Outro',
};
const labelDe = (slug?: string | null) => {
    const s = (slug || '').trim().toLowerCase();
    if (!s) return null;
    return MOTIVO_LABEL[s] || (s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '));
};
// motivo final = "[Rótulo] diagnóstico do vendedor"
const compor = (label: string | null, diag: string | null) =>
    [label ? `[${label}]` : null, (diag || '').trim() || null].filter(Boolean).join(' ') || null;

/**
 * GET /api/perdidos — fila de auditoria (SÓ ADMIN).
 * Sync: perdidos (view) + spam (tabelas-base) dos últimos 90d. Busca o
 * motivo_perda_estruturado nas tabelas-base (a view não expõe) e faz
 * BACKFILL do rótulo nos registros antigos que ainda não têm.
 */
export async function GET() {
    const g = await requireVendedor();
    if (!g.ok) return g.res;
    if (!g.isAdmin) return NextResponse.json({ success: false, error: 'apenas admin' }, { status: 403 });

    const desde = new Date(Date.now() - JANELA_DIAS * 86400_000).toISOString();

    // ── 1. Perdidos (view unificada) ──
    const { data: perdidos } = await supabaseAdmin
        .from('leads_unified')
        .select('uid, name, phone, vehicle_interest, assigned_consultant_id, diagnostico_atendimento, status, updated_at')
        .in('status', LOST)
        .gte('updated_at', desde)
        .limit(1000);

    type Cand = { lead_uid: string; categoria: string; cliente_nome: string | null; cliente_telefone: string | null; veiculo_interesse: string | null; vendedor_consultant_id: string | null; motivo: string | null; perdido_em: string | null; diag: string | null };
    const candidatos: Cand[] = (perdidos || []).map((l) => ({
        lead_uid: l.uid,
        categoria: 'perdido',
        cliente_nome: l.name || null,
        cliente_telefone: l.phone && !String(l.phone).includes('*') ? l.phone : null,
        veiculo_interesse: l.vehicle_interest || null,
        vendedor_consultant_id: l.assigned_consultant_id || null,
        motivo: null, // composto abaixo com o estruturado
        perdido_em: l.updated_at || null,
        diag: l.diagnostico_atendimento || null,
    }));

    // ── 2. Motivo estruturado das tabelas-base (por tabela, em lote) ──
    const labelByUid = new Map<string, string | null>();
    const porTabela = new Map<string, string[]>();
    for (const c of candidatos) {
        const i = c.lead_uid.indexOf(':');
        const t = c.lead_uid.slice(0, i);
        (porTabela.get(t) || porTabela.set(t, []).get(t)!).push(c.lead_uid.slice(i + 1));
    }
    for (const [table, ids] of porTabela) {
        if (!['leads_manos_crm', 'leads_distribuicao_crm_26'].includes(table)) continue;
        try {
            const realIds = table === 'leads_distribuicao_crm_26' ? ids.map((i) => parseInt(i)) : ids;
            const { data } = await supabaseAdmin.from(table).select('id, motivo_perda_estruturado').in('id', realIds);
            for (const r of (data || []) as any[]) labelByUid.set(`${table}:${r.id}`, labelDe(r.motivo_perda_estruturado));
        } catch { /* defensivo */ }
    }
    for (const c of candidatos) c.motivo = compor(labelByUid.get(c.lead_uid) || null, c.diag);

    // ── 3. Spam (archived_reason nas tabelas-base; defensivo) ──
    const spamSrc = [
        { table: 'leads_manos_crm', nome: 'name', tel: 'phone', interesse: 'vehicle_interest' },
        { table: 'leads_distribuicao_crm_26', nome: 'nome', tel: 'telefone', interesse: 'interesse' },
    ];
    for (const s of spamSrc) {
        try {
            const { data } = await supabaseAdmin
                .from(s.table)
                .select(`id, ${s.nome}, ${s.tel}, ${s.interesse}, assigned_consultant_id, archived_at, archived_reason`)
                .not('archived_at', 'is', null)
                .ilike('archived_reason', '%spam%')
                .gte('archived_at', desde)
                .limit(300);
            for (const r of (data || []) as any[]) {
                candidatos.push({
                    lead_uid: `${s.table}:${r.id}`, categoria: 'spam',
                    cliente_nome: r[s.nome] || null, cliente_telefone: r[s.tel] || null,
                    veiculo_interesse: r[s.interesse] || null,
                    vendedor_consultant_id: r.assigned_consultant_id || null,
                    motivo: compor('Spam', r.archived_reason), perdido_em: r.archived_at || null, diag: null,
                });
            }
        } catch { /* coluna pode não existir — segue */ }
    }

    // ── 4. Insere novos + BACKFILL do motivo nos antigos sem rótulo ──
    const { data: existentes } = await supabaseAdmin.from('perdidos_auditoria').select('id, lead_uid, motivo');
    const porUid = new Map((existentes || []).map((e) => [e.lead_uid, e]));

    const novos = candidatos.filter((c) => !porUid.has(c.lead_uid));
    if (novos.length) {
        const ids = [...new Set(novos.map((n) => n.vendedor_consultant_id).filter(Boolean))] as string[];
        const nomeById = new Map<string, string>();
        if (ids.length) {
            const { data: cons } = await supabaseAdmin.from('consultants_manos_crm').select('id, name').in('id', ids);
            for (const c of cons || []) nomeById.set(c.id, c.name);
        }
        await supabaseAdmin.from('perdidos_auditoria').insert(novos.map(({ diag: _d, ...n }) => ({
            ...n,
            vendedor_nome: n.vendedor_consultant_id ? (nomeById.get(n.vendedor_consultant_id) || null) : null,
        })));
    }

    let backfilled = 0;
    for (const c of candidatos) {
        if (backfilled >= 200) break; // teto por chamada
        const ex = porUid.get(c.lead_uid);
        if (!ex || !c.motivo) continue;
        const atual = ex.motivo || '';
        if (atual !== c.motivo && !atual.startsWith('[')) {
            await supabaseAdmin.from('perdidos_auditoria').update({ motivo: c.motivo }).eq('id', ex.id);
            backfilled++;
        }
    }

    // ── 5. Lista ──
    const { data: fila, error } = await supabaseAdmin
        .from('perdidos_auditoria')
        .select('*')
        .order('perdido_em', { ascending: false })
        .limit(500);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, perdidos: fila || [], backfilled });
}
