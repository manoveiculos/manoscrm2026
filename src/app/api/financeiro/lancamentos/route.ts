import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceiro } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const guard = await requireFinanceiro(req);
    if (!guard.ok) return guard.res;

    const { adminClient, effectiveOwner } = guard;
    const url = new URL(req.url);

    const dataInicio = url.searchParams.get('inicio');
    const dataFim = url.searchParams.get('fim');
    const tipo = url.searchParams.get('tipo'); // entrada | saida | transferencia
    const escopo = url.searchParams.get('escopo'); // PF | PJ
    const status = url.searchParams.get('status'); // pago | previsto
    const contaId = url.searchParams.get('conta_id');
    const categoriaId = url.searchParams.get('categoria_id');
    const q = url.searchParams.get('q');
    const placa = url.searchParams.get('placa');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '300', 10), 1000);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    try {
        let query = adminClient
            .from('fin_lancamentos')
            .select(`
                *,
                conta:fin_contas!fin_lancamentos_conta_id_fkey(id, nome, tipo, cor),
                conta_destino:fin_contas!fin_lancamentos_conta_destino_id_fkey(id, nome, tipo, cor),
                categoria:fin_categorias(id, nome, tipo, natureza, acao_patrimonio, cor)
            `, { count: 'exact' })
            .eq('owner_email', effectiveOwner)
            .order('data', { ascending: false })
            .order('created_at', { ascending: false });

        if (dataInicio) query = query.gte('data', dataInicio);
        if (dataFim) query = query.lte('data', dataFim);
        if (tipo && tipo !== 'todos') query = query.eq('tipo', tipo);
        if (escopo && escopo !== 'todos') query = query.eq('escopo', escopo);
        if (status && status !== 'todos') query = query.eq('status', status);
        if (contaId) query = query.or(`conta_id.eq.${contaId},conta_destino_id.eq.${contaId}`);
        if (categoriaId) query = query.eq('categoria_id', categoriaId);
        if (placa) query = query.ilike('placa', `%${placa.trim()}%`);
        if (q) {
            query = query.or(`descricao.ilike.%${q.trim()}%,placa.ilike.%${q.trim()}%,texto_original.ilike.%${q.trim()}%`);
        }

        query = query.range(offset, offset + limit - 1);

        const { data, count, error } = await query;
        if (error) throw error;

        return NextResponse.json({
            success: true,
            lancamentos: data || [],
            total: count || 0,
            limit,
            offset,
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
        const {
            tipo,
            valor,
            data,
            descricao,
            conta_id,
            conta_destino_id,
            categoria_id,
            escopo,
            placa,
            status,
            texto_original,
            criar_patrimonio, // flag opcional
        } = body;

        const val = Number(valor);
        if (isNaN(val) || val <= 0) {
            return NextResponse.json({ success: false, error: 'Valor inválido' }, { status: 400 });
        }
        if (!descricao?.trim()) {
            return NextResponse.json({ success: false, error: 'Descrição é obrigatória' }, { status: 400 });
        }

        const payload: any = {
            owner_email: effectiveOwner,
            tipo: tipo || 'saida',
            valor: Math.round(val * 100) / 100,
            data: data || new Date().toISOString().slice(0, 10),
            descricao: descricao.trim(),
            conta_id: conta_id || null,
            conta_destino_id: conta_destino_id || null,
            categoria_id: categoria_id || null,
            escopo: escopo || 'PF',
            placa: placa ? placa.toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
            status: status || 'pago',
            texto_original: texto_original || null,
        };

        const { data: lanc, error } = await adminClient
            .from('fin_lancamentos')
            .insert(payload)
            .select(`
                *,
                conta:fin_contas!fin_lancamentos_conta_id_fkey(id, nome, tipo, cor),
                conta_destino:fin_contas!fin_lancamentos_conta_destino_id_fkey(id, nome, tipo, cor),
                categoria:fin_categorias(id, nome, tipo, natureza, acao_patrimonio, cor)
            `)
            .single();

        if (error) throw error;

        // Se a categoria for de compra de veículo (ou criar_patrimonio marcado), cadastra no patrimônio como ativo
        if (criar_patrimonio || lanc?.categoria?.acao_patrimonio === 'compra_veiculo') {
            const nomeAtivo = lanc.placa ? `Veículo ${lanc.placa} (${lanc.descricao})` : lanc.descricao;
            await adminClient.from('fin_patrimonio').insert({
                owner_email: effectiveOwner,
                nome: nomeAtivo,
                tipo: 'ativo',
                grupo: 'veiculo',
                escopo: lanc.escopo,
                valor_atual: lanc.valor,
                valor_aquisicao: lanc.valor,
                placa: lanc.placa,
                ativo: true,
                origem_lancamento_id: lanc.id,
                observacao: `Adicionado automaticamente via compra em ${lanc.data}`,
            });
        }

        // Se a categoria for venda de veículo e tiver placa, baixa o ativo do patrimônio
        if (lanc?.categoria?.acao_patrimonio === 'venda_veiculo' && lanc.placa) {
            await adminClient
                .from('fin_patrimonio')
                .update({
                    ativo: false,
                    baixado_em: lanc.data,
                    observacao: `Vendido em ${lanc.data} por R$ ${lanc.valor}`,
                    updated_at: new Date().toISOString(),
                })
                .eq('owner_email', effectiveOwner)
                .eq('placa', lanc.placa)
                .eq('ativo', true);
        }

        return NextResponse.json({ success: true, lancamento: lanc });
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
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'ID é obrigatório' }, { status: 400 });
        }

        // Verifica se lançamento pertence a um período fechado
        const { data: atual } = await adminClient
            .from('fin_lancamentos')
            .select('fechamento_id')
            .eq('id', id)
            .eq('owner_email', effectiveOwner)
            .single();

        if (atual?.fechamento_id) {
            return NextResponse.json({
                success: false,
                error: 'Este lançamento pertence a um fechamento encerrado e não pode ser editado',
            }, { status: 403 });
        }

        const cleanUpdates: any = { updated_at: new Date().toISOString() };
        if (updates.tipo !== undefined) cleanUpdates.tipo = updates.tipo;
        if (updates.valor !== undefined) cleanUpdates.valor = Math.round(Number(updates.valor) * 100) / 100;
        if (updates.data !== undefined) cleanUpdates.data = updates.data;
        if (updates.descricao !== undefined) cleanUpdates.descricao = String(updates.descricao).trim();
        if (updates.conta_id !== undefined) cleanUpdates.conta_id = updates.conta_id || null;
        if (updates.conta_destino_id !== undefined) cleanUpdates.conta_destino_id = updates.conta_destino_id || null;
        if (updates.categoria_id !== undefined) cleanUpdates.categoria_id = updates.categoria_id || null;
        if (updates.escopo !== undefined) cleanUpdates.escopo = updates.escopo;
        if (updates.placa !== undefined) cleanUpdates.placa = updates.placa ? updates.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
        if (updates.status !== undefined) cleanUpdates.status = updates.status;

        const { data, error } = await adminClient
            .from('fin_lancamentos')
            .update(cleanUpdates)
            .eq('id', id)
            .eq('owner_email', effectiveOwner)
            .select(`
                *,
                conta:fin_contas!fin_lancamentos_conta_id_fkey(id, nome, tipo, cor),
                conta_destino:fin_contas!fin_lancamentos_conta_destino_id_fkey(id, nome, tipo, cor),
                categoria:fin_categorias(id, nome, tipo, natureza, acao_patrimonio, cor)
            `)
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, lancamento: data });
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
        const { data: atual } = await adminClient
            .from('fin_lancamentos')
            .select('fechamento_id')
            .eq('id', id)
            .eq('owner_email', effectiveOwner)
            .single();

        if (atual?.fechamento_id) {
            return NextResponse.json({
                success: false,
                error: 'Este lançamento pertence a um fechamento encerrado e não pode ser excluído',
            }, { status: 403 });
        }

        const { error } = await adminClient
            .from('fin_lancamentos')
            .delete()
            .eq('id', id)
            .eq('owner_email', effectiveOwner);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}
