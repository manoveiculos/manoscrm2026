import { NextResponse } from 'next/server';
import { requireScooterAccess, supabaseAdmin, OWNER } from './_guard';

export const dynamic = 'force-dynamic';

// GET /api/scooters — todos os dados do RG Scooters (formato do app original)
export async function GET() {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;

    const [models, vendas, clientes, despesas, config] = await Promise.all([
        supabaseAdmin.from('scooters_models').select('*').eq('owner_email', OWNER).order('created_at', { ascending: true }),
        supabaseAdmin.from('scooters_vendas').select('*').eq('owner_email', OWNER).order('data', { ascending: false }),
        supabaseAdmin.from('scooters_clientes').select('*').eq('owner_email', OWNER).order('created_at', { ascending: true }),
        supabaseAdmin.from('scooters_despesas').select('*').eq('owner_email', OWNER).order('data', { ascending: false }),
        supabaseAdmin.from('scooters_config').select('meta').eq('owner_email', OWNER).maybeSingle(),
    ]);

    return NextResponse.json({
        success: true,
        isAdmin: g.isAdmin,
        scooters: (models.data || []).map((m) => ({ id: m.id, modelo: m.modelo, custo: Number(m.custo), preco: Number(m.preco), qtd: m.qtd })),
        vendas: (vendas.data || []).map((v) => ({ id: v.id, modelo: v.modelo, custo: Number(v.custo), cliente: v.cliente, valor: Number(v.valor), pagamento: v.pagamento, data: v.data })),
        clientes: (clientes.data || []).map((c) => ({ id: c.id, nome: c.nome, whats: c.whats, interesse: c.interesse, status: c.status })),
        despesas: (despesas.data || []).map((d) => ({ id: d.id, desc: d.descricao, valor: Number(d.valor), data: d.data })),
        meta: Number(config.data?.meta ?? 3000),
    });
}

// DELETE /api/scooters — reset total (zona de perigo, só admin)
export async function DELETE() {
    const g = await requireScooterAccess();
    if (!g.ok) return g.res;
    if (!g.isAdmin) return NextResponse.json({ success: false, error: 'apenas admin' }, { status: 403 });

    await Promise.all([
        supabaseAdmin.from('scooters_vendas').delete().eq('owner_email', OWNER),
        supabaseAdmin.from('scooters_despesas').delete().eq('owner_email', OWNER),
        supabaseAdmin.from('scooters_clientes').delete().eq('owner_email', OWNER),
        supabaseAdmin.from('scooters_models').delete().eq('owner_email', OWNER),
    ]);
    return NextResponse.json({ success: true });
}
