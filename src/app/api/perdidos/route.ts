import { NextResponse } from 'next/server';
import { requireVendedor, supabaseAdmin } from '../agenda/_guard';

export const dynamic = 'force-dynamic';

const LOST = ['perdido', 'lost', 'lost_by_inactivity'];
const JANELA_DIAS = 90;

/**
 * GET /api/perdidos — fila de auditoria de perdidos (SÓ ADMIN).
 * A cada chamada, sincroniza: leads perdidos (view) + arquivados como spam
 * (tabelas-base, defensivo) dos últimos 90d entram como 'pendente'.
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

    type Cand = { lead_uid: string; categoria: string; cliente_nome: string | null; cliente_telefone: string | null; veiculo_interesse: string | null; vendedor_consultant_id: string | null; motivo: string | null; perdido_em: string | null };
    const candidatos: Cand[] = (perdidos || []).map((l) => ({
        lead_uid: l.uid,
        categoria: 'perdido',
        cliente_nome: l.name || null,
        cliente_telefone: l.phone && !String(l.phone).includes('*') ? l.phone : null,
        veiculo_interesse: l.vehicle_interest || null,
        vendedor_consultant_id: l.assigned_consultant_id || null,
        motivo: l.diagnostico_atendimento || null,
        perdido_em: l.updated_at || null,
    }));

    // ── 2. Spam (archived_reason nas tabelas-base; defensivo se coluna faltar) ──
    const spamSrc: { table: string; nome: string; tel: string; interesse: string }[] = [
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
                    lead_uid: `${s.table}:${r.id}`,
                    categoria: 'spam',
                    cliente_nome: r[s.nome] || null,
                    cliente_telefone: r[s.tel] || null,
                    veiculo_interesse: r[s.interesse] || null,
                    vendedor_consultant_id: r.assigned_consultant_id || null,
                    motivo: r.archived_reason || 'spam',
                    perdido_em: r.archived_at || null,
                });
            }
        } catch { /* coluna pode não existir nessa tabela — segue */ }
    }

    // ── 3. Upsert dos novos (não sobrescreve auditoria já feita) ──
    if (candidatos.length) {
        const { data: existentes } = await supabaseAdmin.from('perdidos_auditoria').select('lead_uid');
        const jaTem = new Set((existentes || []).map((e) => e.lead_uid));
        const novos = candidatos.filter((c) => !jaTem.has(c.lead_uid));
        if (novos.length) {
            // Resolve nome do vendedor no snapshot
            const ids = [...new Set(novos.map((n) => n.vendedor_consultant_id).filter(Boolean))] as string[];
            const nomeById = new Map<string, string>();
            if (ids.length) {
                const { data: cons } = await supabaseAdmin.from('consultants_manos_crm').select('id, name').in('id', ids);
                for (const c of cons || []) nomeById.set(c.id, c.name);
            }
            await supabaseAdmin.from('perdidos_auditoria').insert(novos.map((n) => ({
                ...n,
                vendedor_nome: n.vendedor_consultant_id ? (nomeById.get(n.vendedor_consultant_id) || null) : null,
            })));
        }
    }

    // ── 4. Lista completa pra aba ──
    const { data: fila, error } = await supabaseAdmin
        .from('perdidos_auditoria')
        .select('*')
        .order('perdido_em', { ascending: false })
        .limit(500);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, perdidos: fila || [] });
}
