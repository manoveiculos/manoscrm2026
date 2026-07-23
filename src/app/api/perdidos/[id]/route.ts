import { NextResponse } from 'next/server';
import { requireVendedor, supabaseAdmin } from '../../agenda/_guard';

export const dynamic = 'force-dynamic';

const STATUS = new Set(['pendente', 'contatado', 'sem_resposta', 'resolvido']);

// PATCH /api/perdidos/[id] — salva a pesquisa de satisfação / cobrança (SÓ ADMIN)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const g = await requireVendedor();
    if (!g.ok) return g.res;
    if (!g.isAdmin) return NextResponse.json({ success: false, error: 'apenas admin' }, { status: 403 });

    const { id } = await params;
    const b = await request.json();
    const patch: Record<string, any> = {};

    if (b.status_auditoria !== undefined) {
        if (!STATUS.has(b.status_auditoria)) return NextResponse.json({ success: false, error: 'status inválido' }, { status: 400 });
        patch.status_auditoria = b.status_auditoria;
        if (b.status_auditoria !== 'pendente') patch.contatado_em = new Date().toISOString();
    }
    if (b.bem_atendido !== undefined) patch.bem_atendido = b.bem_atendido === null ? null : !!b.bem_atendido;
    if (b.nota !== undefined) patch.nota = b.nota === null ? null : Math.max(1, Math.min(5, Number(b.nota)));
    if (b.duvidas !== undefined) patch.duvidas = b.duvidas || null;
    if (b.comentario !== undefined) patch.comentario = b.comentario || null;
    if (b.gerar_cobranca !== undefined) patch.gerar_cobranca = !!b.gerar_cobranca;
    if (b.cobranca_texto !== undefined) patch.cobranca_texto = b.cobranca_texto || null;
    if (b.cobranca_resolvida !== undefined) patch.cobranca_resolvida = !!b.cobranca_resolvida;
    if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: 'nada para atualizar' }, { status: 400 });
    patch.auditado_por = g.email;

    const { error } = await supabaseAdmin.from('perdidos_auditoria').update(patch).eq('id', id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
