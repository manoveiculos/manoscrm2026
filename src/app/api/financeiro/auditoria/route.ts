import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceiro } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireFinanceiro(req);
  if (!guard.ok) return guard.res;

  const { adminClient } = guard;
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 300);

  try {
    const { data: logs, error } = await adminClient
      .from('fin_lancamentos_audit')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      logs: logs || [],
    });
  } catch (err: any) {
    console.error('Erro ao buscar logs de auditoria:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireFinanceiro(req);
  if (!guard.ok) return guard.res;

  const { adminClient, userEmail, effectiveOwner } = guard;

  try {
    const body = await req.json();
    const { id, motivo } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID do lançamento é obrigatório' }, { status: 400 });
    }

    // Busca registro soft-deleted
    const { data: item, error: errBusca } = await adminClient
      .from('fin_lancamentos')
      .select('*')
      .eq('id', id)
      .single();

    if (errBusca || !item) {
      return NextResponse.json({ success: false, error: 'Lançamento não encontrado' }, { status: 404 });
    }

    // Restaura no banco
    const { data: restaurado, error: errRestaurar } = await adminClient
      .from('fin_lancamentos')
      .update({
        deleted_at: null,
        deleted_by: null,
        motivo_exclusao: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (errRestaurar) throw errRestaurar;

    // Registra auditoria da restauração
    await adminClient.from('fin_lancamentos_audit').insert({
      lancamento_id: id,
      acao: 'restauracao',
      executado_por: userEmail,
      owner_email: item.owner_email || effectiveOwner,
      motivo: motivo || 'Lançamento restaurado pelo usuário',
      dados_snapshot: { itemRestaurado: restaurado },
    });

    return NextResponse.json({
      success: true,
      mensagem: 'Lançamento restaurado com sucesso.',
      lancamento: restaurado,
    });
  } catch (err: any) {
    console.error('Erro ao restaurar lançamento:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
