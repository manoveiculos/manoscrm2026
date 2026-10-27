import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceiro } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const guard = await requireFinanceiro(req);
    if (!guard.ok) return guard.res;

    const { adminClient, effectiveOwner } = guard;
    const url = new URL(req.url);
    const contaId = url.searchParams.get('conta_id');

    try {
        let query = adminClient
            .from('fin_fechamentos')
            .select(`
                *,
                conta:fin_contas(id, nome, tipo, escopo, cor)
            `)
            .eq('owner_email', effectiveOwner)
            .order('data_inicio', { ascending: false });

        if (contaId) {
            query = query.eq('conta_id', contaId);
        }

        const { data: fechamentos, error } = await query;
        if (error) throw error;

        return NextResponse.json({ success: true, fechamentos: fechamentos || [] });
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
        const { data_inicio, data_fim, titulo, observacao, conta_id } = body;

        if (!data_inicio || !data_fim) {
            return NextResponse.json({ success: false, error: 'Data de início e fim são obrigatórias' }, { status: 400 });
        }

        // Lançamentos no período
        let queryLancs = adminClient
            .from('fin_lancamentos')
            .select('id, tipo, valor, conta_id, conta_destino_id, categoria:fin_categorias(natureza)')
            .eq('owner_email', effectiveOwner)
            .gte('data', data_inicio)
            .lte('data', data_fim)
            .eq('status', 'pago');

        if (conta_id) {
            queryLancs = queryLancs.or(`conta_id.eq.${conta_id},conta_destino_id.eq.${conta_id}`);
        }

        const { data: lancs, error: errLancs } = await queryLancs;
        if (errLancs) throw errLancs;

        let totalEntradas = 0;
        let totalSaidas = 0;
        let totalOperacional = 0;

        for (const l of lancs || []) {
            const val = Number(l.valor || 0);
            const isPatrimonial = (l as any)?.categoria?.natureza === 'patrimonial';

            if (conta_id) {
                // Cálculo focado na conta específica
                if (l.tipo === 'entrada' && l.conta_id === conta_id) {
                    totalEntradas += val;
                    if (!isPatrimonial) totalOperacional += val;
                } else if (l.tipo === 'saida' && l.conta_id === conta_id) {
                    totalSaidas += val;
                    if (!isPatrimonial) totalOperacional -= val;
                } else if (l.tipo === 'transferencia') {
                    if (l.conta_destino_id === conta_id) {
                        totalEntradas += val; // Entrou nesta conta
                    }
                    if (l.conta_id === conta_id) {
                        totalSaidas += val; // Saiu desta conta
                    }
                }
            } else {
                // Fechamento global de todas as contas
                if (l.tipo === 'entrada') {
                    totalEntradas += val;
                    if (!isPatrimonial) totalOperacional += val;
                } else if (l.tipo === 'saida') {
                    totalSaidas += val;
                    if (!isPatrimonial) totalOperacional -= val;
                }
            }
        }

        // Busca fechamento anterior da mesma conta (ou global)
        let queryAnterior = adminClient
            .from('fin_fechamentos')
            .select('caixa_final, patrimonio_final')
            .eq('owner_email', effectiveOwner)
            .lt('data_fim', data_inicio)
            .order('data_fim', { ascending: false })
            .limit(1);

        if (conta_id) {
            queryAnterior = queryAnterior.eq('conta_id', conta_id);
        } else {
            queryAnterior = queryAnterior.is('conta_id', null);
        }

        const { data: anterior } = await queryAnterior.maybeSingle();

        let caixaInicial = 0;
        if (anterior?.caixa_final !== undefined && anterior?.caixa_final !== null) {
            caixaInicial = Number(anterior.caixa_final);
        } else if (conta_id) {
            const { data: conta } = await adminClient
                .from('fin_contas')
                .select('saldo_inicial')
                .eq('id', conta_id)
                .single();
            caixaInicial = Number(conta?.saldo_inicial || 0);
        }

        const caixaFinal = caixaInicial + totalEntradas - totalSaidas;

        // Se tem conta_id, busca o nome da conta para compor título caso não informado
        let nomeConta = '';
        if (conta_id) {
            const { data: contaObj } = await adminClient.from('fin_contas').select('nome').eq('id', conta_id).single();
            nomeConta = contaObj?.nome || '';
        }

        const tituloFinal = titulo?.trim() || (conta_id ? `Fechamento ${nomeConta} (${data_inicio} a ${data_fim})` : `Fechamento Geral (${data_inicio} a ${data_fim})`);

        // Cria o registro de fechamento
        const { data: novoFechamento, error: errIns } = await adminClient
            .from('fin_fechamentos')
            .insert({
                owner_email: effectiveOwner,
                conta_id: conta_id || null,
                titulo: tituloFinal,
                data_inicio,
                data_fim,
                caixa_inicial: Math.round(caixaInicial * 100) / 100,
                entradas: Math.round(totalEntradas * 100) / 100,
                saidas: Math.round(totalSaidas * 100) / 100,
                resultado_operacional: Math.round(totalOperacional * 100) / 100,
                caixa_final: Math.round(caixaFinal * 100) / 100,
                patrimonio_inicial: anterior?.patrimonio_final || null,
                observacao: observacao || null,
            })
            .select(`
                *,
                conta:fin_contas(id, nome, tipo, escopo, cor)
            `)
            .single();

        if (errIns) throw errIns;

        // Trava os lançamentos deste período apontando fechamento_id
        const ids = (lancs || []).map(l => l.id);
        if (ids.length > 0) {
            await adminClient
                .from('fin_lancamentos')
                .update({ fechamento_id: novoFechamento.id })
                .in('id', ids);
        }

        return NextResponse.json({ success: true, fechamento: novoFechamento });
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
        // Destrava os lançamentos
        await adminClient
            .from('fin_lancamentos')
            .update({ fechamento_id: null })
            .eq('fechamento_id', id)
            .eq('owner_email', effectiveOwner);

        // Deleta o registro de fechamento
        const { error } = await adminClient
            .from('fin_fechamentos')
            .delete()
            .eq('id', id)
            .eq('owner_email', effectiveOwner);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}
