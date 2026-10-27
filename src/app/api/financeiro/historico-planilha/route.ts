import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceiro } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireFinanceiro(req);
  if (!guard.ok) return guard.res;

  const { adminClient } = guard;
  const url = new URL(req.url);
  const periodoId = url.searchParams.get('periodo_id');
  const query = url.searchParams.get('q')?.trim();

  try {
    // 1. Busca global de texto por descrição, placa ou motivo em todos os 30 períodos
    if (query) {
      const { data: itens, error: itensErr } = await adminClient
        .from('fin_historico_itens')
        .select(`
          id,
          periodo_id,
          tipo,
          data_registro,
          descricao,
          motivo_ou_placa,
          valor,
          ordem_linha,
          fin_historico_periodos (
            numero_ordem,
            titulo
          )
        `)
        .or(`descricao.ilike.%${query}%,motivo_ou_placa.ilike.%${query}%`)
        .order('created_at', { ascending: true })
        .limit(100);

      if (itensErr) throw itensErr;

      return NextResponse.json({
        sucesso: true,
        busca: query,
        totalEncontrado: itens?.length || 0,
        itens: itens || [],
      });
    }

    // 2. Se solicitou um período específico em detalhes
    if (periodoId) {
      const { data: periodo, error: pErr } = await adminClient
        .from('fin_historico_periodos')
        .select('*')
        .eq('id', periodoId)
        .single();

      if (pErr) throw pErr;

      const { data: itens, error: iErr } = await adminClient
        .from('fin_historico_itens')
        .select('*')
        .eq('periodo_id', periodoId)
        .order('ordem_linha', { ascending: true });

      if (iErr) throw iErr;

      const entradas = (itens || []).filter((it) => it.tipo === 'receita');
      const saidas = (itens || []).filter((it) => it.tipo === 'despesa');

      return NextResponse.json({
        sucesso: true,
        periodo,
        entradas,
        saidas,
      });
    }

    // 3. Listagem geral de todos os 30 períodos com resumo
    const { data: periodos, error: pListErr } = await adminClient
      .from('fin_historico_periodos')
      .select('*')
      .order('numero_ordem', { ascending: true });

    if (pListErr) throw pListErr;

    const totalEntradasGeral = (periodos || []).reduce((acc, p) => acc + Number(p.total_recebido || 0), 0);
    const totalSaidasGeral = (periodos || []).reduce((acc, p) => acc + Number(p.total_pago || 0), 0);
    const ultimoSaldo = periodos && periodos.length > 0 ? Number(periodos[periodos.length - 1].saldo_final || 0) : 0;

    return NextResponse.json({
      sucesso: true,
      periodos: periodos || [],
      resumoGeral: {
        totalPeriodos: periodos?.length || 0,
        totalEntradasGeral,
        totalSaidasGeral,
        ultimoSaldo,
      },
    });
  } catch (err: any) {
    console.error('Erro ao buscar histórico da planilha:', err);
    return NextResponse.json({ erro: err?.message || 'Erro ao carregar histórico' }, { status: 500 });
  }
}
