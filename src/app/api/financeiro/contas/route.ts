import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceiro } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const guard = await requireFinanceiro(req);
    if (!guard.ok) return guard.res;

    const { adminClient, effectiveOwner } = guard;

    try {
        const { data: contas, error: errContas } = await adminClient
            .from('fin_contas')
            .select('*')
            .eq('owner_email', effectiveOwner)
            .order('ordem', { ascending: true });

        if (errContas) throw errContas;

        // Puxa todos os lançamentos pagos para computar saldo atual de cada conta
        const { data: lancs, error: errLancs } = await adminClient
            .from('fin_lancamentos')
            .select('tipo, valor, conta_id, conta_destino_id')
            .eq('owner_email', effectiveOwner)
            .eq('status', 'pago')
            .is('deleted_at', null);

        if (errLancs) throw errLancs;

        const saldosMap = new Map<string, number>();
        for (const c of contas || []) {
            saldosMap.set(c.id, Number(c.saldo_inicial || 0));
        }

        for (const l of lancs || []) {
            const val = Number(l.valor || 0);
            if (l.tipo === 'entrada' && l.conta_id && saldosMap.has(l.conta_id)) {
                saldosMap.set(l.conta_id, (saldosMap.get(l.conta_id) || 0) + val);
            } else if (l.tipo === 'saida' && l.conta_id && saldosMap.has(l.conta_id)) {
                saldosMap.set(l.conta_id, (saldosMap.get(l.conta_id) || 0) - val);
            } else if (l.tipo === 'transferencia') {
                if (l.conta_id && saldosMap.has(l.conta_id)) {
                    saldosMap.set(l.conta_id, (saldosMap.get(l.conta_id) || 0) - val);
                }
                if (l.conta_destino_id && saldosMap.has(l.conta_destino_id)) {
                    saldosMap.set(l.conta_destino_id, (saldosMap.get(l.conta_destino_id) || 0) + val);
                }
            }
        }

        const contasComSaldo = (contas || []).map(c => ({
            ...c,
            saldo: Math.round((saldosMap.get(c.id) || 0) * 100) / 100,
        }));

        const totalCaixa = contasComSaldo.reduce((acc, c) => acc + (c.saldo || 0), 0);

        return NextResponse.json({
            success: true,
            contas: contasComSaldo,
            totalCaixa: Math.round(totalCaixa * 100) / 100,
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const guard = await requireFinanceiro(req);
    if (!guard.ok) return guard.res;

    const { adminClient, effectiveOwner } = guard;

    try {
        const body = await req.json();
        const { nome, tipo, escopo, saldo_inicial, cor } = body;

        if (!nome) {
            return NextResponse.json({ success: false, error: 'Nome é obrigatório' }, { status: 400 });
        }

        const { data, error } = await adminClient
            .from('fin_contas')
            .insert({
                owner_email: effectiveOwner,
                nome: String(nome).trim(),
                tipo: tipo || 'banco',
                escopo: escopo || 'PF',
                saldo_inicial: Number(saldo_inicial || 0),
                cor: cor || null,
                ativa: true,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, conta: data });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const guard = await requireFinanceiro(req);
    if (!guard.ok) return guard.res;

    const { adminClient, effectiveOwner } = guard;

    try {
        const body = await req.json();
        const { id, nome, tipo, escopo, saldo_inicial, cor, ativa } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'ID é obrigatório' }, { status: 400 });
        }

        const updates: any = { updated_at: new Date().toISOString() };
        if (nome !== undefined) updates.nome = String(nome).trim();
        if (tipo !== undefined) updates.tipo = tipo;
        if (escopo !== undefined) updates.escopo = escopo;
        if (saldo_inicial !== undefined) updates.saldo_inicial = Number(saldo_inicial);
        if (cor !== undefined) updates.cor = cor;
        if (ativa !== undefined) updates.ativa = ativa;

        const { data, error } = await adminClient
            .from('fin_contas')
            .update(updates)
            .eq('id', id)
            .eq('owner_email', effectiveOwner)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, conta: data });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const guard = await requireFinanceiro(req);
    if (!guard.ok) return guard.res;

    const { adminClient, effectiveOwner } = guard;
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) {
        return NextResponse.json({ success: false, error: 'ID é obrigatório' }, { status: 400 });
    }

    try {
        // Verifica se há lançamentos vinculados
        const { count } = await adminClient
            .from('fin_lancamentos')
            .select('id', { count: 'exact', head: true })
            .or(`conta_id.eq.${id},conta_destino_id.eq.${id}`)
            .eq('owner_email', effectiveOwner);

        if (count && count > 0) {
            // Se houver lançamentos, desativa a conta em vez de excluir pra não quebrar histórico
            await adminClient
                .from('fin_contas')
                .update({ ativa: false, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('owner_email', effectiveOwner);

            return NextResponse.json({ success: true, desativada: true });
        }

        const { error } = await adminClient
            .from('fin_contas')
            .delete()
            .eq('id', id)
            .eq('owner_email', effectiveOwner);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}
