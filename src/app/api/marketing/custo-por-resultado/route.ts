import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '../_guard';

export const dynamic = 'force-dynamic';

const META_EVENTOS_SEMANA = 50;

function dataValida(s: string | null): string | null {
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}

/**
 * GET /api/marketing/custo-por-resultado?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
 *
 * Custo por lead, lead qualificado, visita agendada e venda por campanha
 * (fn_custo_por_resultado). Coorte: leads criados no período e o que
 * aconteceu com eles depois; gasto do período (meta_ad_spend_daily).
 *
 * Também devolve o termômetro da troca de otimização: eventos de lead
 * qualificado + visita nos últimos 7 dias. Com ~50/semana dá para mudar as
 * campanhas de "conversa iniciada" para o evento mais fundo.
 */
export async function GET(req: NextRequest) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.res;

    const { searchParams } = new URL(req.url);
    const hoje = new Date();
    const fim = dataValida(searchParams.get('fim')) || hoje.toISOString().slice(0, 10);
    const inicio = dataValida(searchParams.get('inicio')) || new Date(hoje.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);

    const admin = createAdminClient();
    const seteDias = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [custo, semana] = await Promise.all([
        admin.rpc('fn_custo_por_resultado', { p_inicio: inicio, p_fim: fim }),
        admin.from('meta_capi_queue')
            .select('event_name, status, canal')
            .gte('event_time', seteDias)
            .in('event_name', ['QualifiedLead', 'Schedule', 'Purchase']),
    ]);

    if (custo.error) {
        return NextResponse.json({ success: false, error: custo.error.message }, { status: 500 });
    }

    const eventos = semana.data || [];
    const contar = (fn: (e: any) => boolean) => eventos.filter(fn).length;
    const profundos = contar(e => e.event_name === 'QualifiedLead' || e.event_name === 'Schedule');

    return NextResponse.json({
        success: true,
        periodo: { inicio, fim },
        campanhas: custo.data,
        ultimos_7_dias: {
            qualificados: contar(e => e.event_name === 'QualifiedLead'),
            agendados: contar(e => e.event_name === 'Schedule'),
            vendas: contar(e => e.event_name === 'Purchase'),
            enviados_meta: contar(e => e.status === 'sent'),
            via_mensagens_ctwa: contar(e => e.status === 'sent' && e.canal === 'business_messaging'),
            meta_semanal: META_EVENTOS_SEMANA,
            pronto_para_trocar_otimizacao: profundos >= META_EVENTOS_SEMANA,
        },
    });
}
