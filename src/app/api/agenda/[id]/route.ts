import { NextResponse } from 'next/server';
import { requireVendedor, supabaseAdmin } from '../_guard';

export const dynamic = 'force-dynamic';

const STATUS = new Set(['agendado', 'confirmado', 'compareceu', 'nao_compareceu', 'remarcado', 'cancelado']);
const EDITAVEIS = ['cliente_nome', 'cliente_telefone', 'cliente_whatsapp', 'veiculo_interesse', 'tipo', 'endereco', 'observacoes'];

// PATCH /api/agenda/[id] — status, remarcar (data_hora) ou editar cadastro
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireVendedor();
    if (!g.ok) return g.res;
    const { id } = await params;
    const b = await request.json();

    const patch: Record<string, any> = {};
    if (b.status !== undefined) {
        if (!STATUS.has(b.status)) return NextResponse.json({ success: false, error: 'status inválido' }, { status: 400 });
        patch.status = b.status;
    }
    // Remarcar: nova data reabre os lembretes (pra dispararem de novo)
    if (b.data_hora !== undefined) {
        if (new Date(b.data_hora).getTime() < Date.now() - 120_000) return NextResponse.json({ success: false, error: 'Não dá pra remarcar pro passado' }, { status: 400 });
        patch.data_hora = b.data_hora;
        patch.lembrete_1d_enviado_em = null;
        patch.lembrete_dia_enviado_em = null;
        if (b.status === undefined) patch.status = 'agendado';
    }
    for (const k of EDITAVEIS) if (b[k] !== undefined) patch[k] = b[k] === '' ? null : b[k];
    if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: 'nada para atualizar' }, { status: 400 });

    let q = supabaseAdmin.from('agendamentos').update(patch).eq('id', id);
    if (!g.isAdmin) q = q.eq('vendedor_id', g.authId); // vendedor só mexe na dele
    const { error } = await q;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

// DELETE /api/agenda/[id]
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireVendedor();
    if (!g.ok) return g.res;
    const { id } = await params;
    let q = supabaseAdmin.from('agendamentos').delete().eq('id', id);
    if (!g.isAdmin) q = q.eq('vendedor_id', g.authId);
    const { error } = await q;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
