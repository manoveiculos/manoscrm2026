import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceiro } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const guard = await requireFinanceiro(req);
    if (!guard.ok) return guard.res;

    const { adminClient, effectiveOwner } = guard;

    try {
        // Itens de patrimônio
        const { data: itens, error } = await adminClient
            .from('fin_patrimonio')
            .select('*')
            .eq('owner_email', effectiveOwner)
            .order('ativo', { ascending: false })
            .order('valor_atual', { ascending: false });

        if (error) throw error;

        // Saldos das contas para compor patrimônio líquido total
        const { data: contas } = await adminClient
            .from('fin_contas')
            .select('id, saldo_inicial')
            .eq('owner_email', effectiveOwner);

        const { data: lancs } = await adminClient
            .from('fin_lancamentos')
            .select('tipo, valor, conta_id, conta_destino_id')
            .eq('owner_email', effectiveOwner)
            .eq('status', 'pago');

        let totalCaixa = (contas || []).reduce((acc, c) => acc + Number(c.saldo_inicial || 0), 0);
        for (const l of lancs || []) {
            const v = Number(l.valor || 0);
            if (l.tipo === 'entrada') totalCaixa += v;
            else if (l.tipo === 'saida') totalCaixa -= v;
        }

        const ativos = (itens || []).filter(i => i.tipo === 'ativo' && i.ativo);
        const passivos = (itens || []).filter(i => i.tipo === 'passivo' && i.ativo);

        const totalAtivosBens = ativos.reduce((acc, i) => acc + Number(i.valor_atual || 0), 0);
        const totalPassivos = passivos.reduce((acc, i) => acc + Number(i.valor_atual || 0), 0);
        const totalAtivosGeral = totalCaixa + totalAtivosBens;
        const patrimonioLiquido = totalAtivosGeral - totalPassivos;

        // Snapshots históricos para gráfico de evolução
        const { data: snapshots } = await adminClient
            .from('fin_snapshots')
            .select('*')
            .eq('owner_email', effectiveOwner)
            .order('data', { ascending: true })
            .limit(60);

        return NextResponse.json({
            success: true,
            itens: itens || [],
            totais: {
                totalCaixa: Math.round(totalCaixa * 100) / 100,
                totalAtivosBens: Math.round(totalAtivosBens * 100) / 100,
                totalAtivosGeral: Math.round(totalAtivosGeral * 100) / 100,
                totalPassivos: Math.round(totalPassivos * 100) / 100,
                patrimonioLiquido: Math.round(patrimonioLiquido * 100) / 100,
            },
            snapshots: snapshots || [],
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
        const { nome, tipo, grupo, escopo, valor_atual, valor_aquisicao, placa, observacao } = body;

        if (!nome?.trim()) {
            return NextResponse.json({ success: false, error: 'Nome é obrigatório' }, { status: 400 });
        }

        const val = Number(valor_atual || 0);

        const { data, error } = await adminClient
            .from('fin_patrimonio')
            .insert({
                owner_email: effectiveOwner,
                nome: nome.trim(),
                tipo: tipo || 'ativo',
                grupo: grupo || 'outro',
                escopo: escopo || 'PF',
                valor_atual: Math.round(val * 100) / 100,
                valor_aquisicao: valor_aquisicao ? Number(valor_aquisicao) : val,
                placa: placa ? placa.toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
                ativo: true,
                observacao: observacao || null,
            })
            .select()
            .single();

        if (error) throw error;

        // Histórico de valor inicial
        await adminClient.from('fin_patrimonio_hist').insert({
            item_id: data.id,
            owner_email: effectiveOwner,
            valor: data.valor_atual,
            data: new Date().toISOString().slice(0, 10),
        });

        return NextResponse.json({ success: true, item: data });
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
        const { id, nome, tipo, grupo, escopo, valor_atual, placa, ativo, observacao } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'ID é obrigatório' }, { status: 400 });
        }

        const updates: any = { updated_at: new Date().toISOString() };
        if (nome !== undefined) updates.nome = String(nome).trim();
        if (tipo !== undefined) updates.tipo = tipo;
        if (grupo !== undefined) updates.grupo = grupo;
        if (escopo !== undefined) updates.escopo = escopo;
        if (placa !== undefined) updates.placa = placa ? placa.toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
        if (ativo !== undefined) {
            updates.ativo = ativo;
            if (!ativo) updates.baixado_em = new Date().toISOString().slice(0, 10);
            else updates.baixado_em = null;
        }
        if (observacao !== undefined) updates.observacao = observacao;

        if (valor_atual !== undefined) {
            const novoValor = Math.round(Number(valor_atual) * 100) / 100;
            updates.valor_atual = novoValor;

            // Grava histórico
            await adminClient.from('fin_patrimonio_hist').insert({
                item_id: id,
                owner_email: effectiveOwner,
                valor: novoValor,
                data: new Date().toISOString().slice(0, 10),
            });
        }

        const { data, error } = await adminClient
            .from('fin_patrimonio')
            .update(updates)
            .eq('id', id)
            .eq('owner_email', effectiveOwner)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, item: data });
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
        const { error } = await adminClient
            .from('fin_patrimonio')
            .delete()
            .eq('id', id)
            .eq('owner_email', effectiveOwner);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}
