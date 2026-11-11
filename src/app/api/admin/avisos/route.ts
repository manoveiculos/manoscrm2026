import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { inicioDaSemanaBR, paraCsv, resumirSemana, type AvisoRegistro } from '@/lib/avisos/historico';

/**
 * GET /api/admin/avisos?semana=AAAA-MM-DD&consultor=&tipo=&status=&formato=csv
 * Histórico dos avisos e cobranças enviados aos consultores (só admin e gestor).
 *   semana   qualquer data da semana desejada (padrão: esta semana, de segunda a domingo)
 *   formato  csv = baixa a planilha da semana filtrada (para a reunião)
 * Sempre devolve também o resumo da semana e as 8 semanas anteriores (para comparar).
 */
export const dynamic = 'force-dynamic';
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };

export async function GET(req: NextRequest) {
    const c = await consultorLogado();
    if (!c.ok) return c.res;
    if (c.eu.perfil === 'vendedor') return NextResponse.json({ success: false, error: 'Só para admin e gestor.' }, { status: 403, headers: SEM_CACHE });

    const u = new URL(req.url).searchParams;
    const ref = u.get('semana') && Number.isFinite(Date.parse(u.get('semana')!)) ? new Date(`${u.get('semana')}T12:00:00-03:00`) : new Date();
    const inicio = inicioDaSemanaBR(ref);
    const fim = new Date(inicio.getTime() + 7 * 86_400_000);
    const desdeComparativo = new Date(inicio.getTime() - 8 * 7 * 86_400_000);

    const { data, error } = await c.admin.from('avisos_enviados')
        .select('id, criado_em, tipo, consultor_nome, telefone, mensagem, status, erro, lead_ref, origem')
        .gte('criado_em', desdeComparativo.toISOString()).lt('criado_em', fim.toISOString())
        .order('criado_em', { ascending: false }).limit(5000);
    if (error) {
        return NextResponse.json({ success: false, error: 'Histórico indisponível (a tabela ainda não foi criada?).' }, { status: 503, headers: SEM_CACHE });
    }
    const todos: AvisoRegistro[] = (data || []).map(r => ({
        id: r.id, criadoEm: r.criado_em, tipo: r.tipo, consultorNome: r.consultor_nome, telefone: r.telefone,
        mensagem: r.mensagem, status: r.status, erro: r.erro, leadRef: r.lead_ref, origem: r.origem,
    }));

    const semana = resumirSemana(todos, inicio);
    const consultor = (u.get('consultor') || '').trim();
    const tipo = (u.get('tipo') || '').trim();
    const status = (u.get('status') || '').trim();
    const daSemana = todos.filter(a => {
        const t = Date.parse(a.criadoEm);
        return t >= inicio.getTime() && t < fim.getTime()
            && (!consultor || a.consultorNome === consultor) && (!tipo || a.tipo === tipo) && (!status || a.status === status);
    });

    if (u.get('formato') === 'csv') {
        const nome = `avisos-manos-${inicio.toISOString().slice(0, 10)}.csv`;
        return new NextResponse(paraCsv(daSemana), {
            headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"`, ...SEM_CACHE },
        });
    }

    const anteriores = Array.from({ length: 8 }, (_, i) => {
        const ini = new Date(inicio.getTime() - (i + 1) * 7 * 86_400_000);
        const r = resumirSemana(todos, ini);
        return { inicio: r.inicio, total: r.total, falhas: r.falhas, cobrancas: r.cobrancas };
    });
    return NextResponse.json({ success: true, semana, anteriores, avisos: daSemana.slice(0, 500), totalFiltrado: daSemana.length }, { headers: SEM_CACHE });
}
