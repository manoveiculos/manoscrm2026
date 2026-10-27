import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceiro } from '../../_guard';

export const dynamic = 'force-dynamic';

interface ItemImportacao {
  tipo: 'receita' | 'despesa';
  descricao: string;
  valor: number;
  data_competencia: string;
  categoria_id?: string | null;
  destinacao?: 'particular' | 'loja_100' | 'loja_50';
  observacoes?: string;
}

export async function POST(req: NextRequest) {
  const guard = await requireFinanceiro(req);
  if (!guard.ok) return guard.res;

  const { adminClient, effectiveOwner } = guard;

  try {
    const body = await req.json();
    const { conta_id, lancamentos } = body;

    if (!conta_id) {
      return NextResponse.json({ erro: 'Conta de destino é obrigatória' }, { status: 400 });
    }

    if (!Array.isArray(lancamentos) || lancamentos.length === 0) {
      return NextResponse.json({ erro: 'Nenhum lançamento fornecido para importação' }, { status: 400 });
    }

    // Verificar se a conta existe
    const { data: conta, error: contaErr } = await adminClient
      .from('fin_contas')
      .select('id, nome, user_email, tipo_escopo')
      .eq('id', conta_id)
      .single();

    if (contaErr || !conta) {
      return NextResponse.json({ erro: 'Conta bancária informada não encontrada' }, { status: 404 });
    }

    // Identificar parceiro para acerto mútuo
    const outroSocio = effectiveOwner === 'hgledra@hotmail.com'
      ? 'alexandre_gorges@hotmail.com'
      : 'hgledra@hotmail.com';

    const registrosParaInserir: any[] = [];
    let totalEntradas = 0;
    let totalSaidas = 0;

    for (const item of lancamentos as ItemImportacao[]) {
      const valor = Math.abs(Number(item.valor) || 0);
      if (valor <= 0 || !item.descricao?.trim()) continue;

      const tipo = item.tipo === 'receita' ? 'receita' : 'despesa';
      const destinacao = item.destinacao || (conta.tipo_escopo === 'PJ' ? 'loja_100' : 'particular');

      if (tipo === 'receita') {
        totalEntradas += valor;
      } else {
        totalSaidas += valor;
      }

      // Cálculo de reembolso de sócios
      let reembolsoStatus = 'nenhum';
      let reembolsoValor = 0;
      let reembolsoDe: string | null = null;
      let reembolsoPara: string | null = null;

      if (tipo === 'despesa') {
        if (destinacao === 'loja_100') {
          reembolsoStatus = 'pendente';
          reembolsoValor = valor;
          reembolsoDe = outroSocio;
          reembolsoPara = effectiveOwner;
        } else if (destinacao === 'loja_50') {
          reembolsoStatus = 'pendente';
          reembolsoValor = Math.round((valor / 2) * 100) / 100;
          reembolsoDe = outroSocio;
          reembolsoPara = effectiveOwner;
        }
      }

      registrosParaInserir.push({
        user_email: effectiveOwner,
        conta_id: conta.id,
        tipo,
        descricao: item.descricao.trim(),
        valor,
        data_competencia: item.data_competencia || new Date().toISOString().slice(0, 10),
        status_pagamento: 'pago',
        categoria_id: item.categoria_id || null,
        destinacao,
        reembolso_status: reembolsoStatus,
        reembolso_valor: reembolsoValor,
        reembolso_de: reembolsoDe,
        reembolso_para: reembolsoPara,
        observacoes: item.observacoes ? item.observacoes.trim() : 'Importado via Extrato Bancário',
      });
    }

    if (registrosParaInserir.length === 0) {
      return NextResponse.json({ erro: 'Nenhum item válido para importar (verifique valores e descrições)' }, { status: 400 });
    }

    // Inserir registros em lote
    const { data: inseridos, error: insErr } = await adminClient
      .from('fin_lancamentos')
      .insert(registrosParaInserir)
      .select('id');

    if (insErr) throw insErr;

    return NextResponse.json({
      sucesso: true,
      importados: inseridos?.length || 0,
      totalEntradas,
      totalSaidas,
      contaNome: conta.nome,
    });
  } catch (err: any) {
    console.error('Erro ao importar lote de lançamentos:', err);
    return NextResponse.json({ erro: err?.message || 'Falha ao processar importação' }, { status: 500 });
  }
}
