import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { enriquecer, lerConversasDeLeads } from '@/lib/leads/enriquecimento';
import { uidDoIdDaLista } from '@/lib/leads/resumo';
import {
    CHIPS, FILTROS_VAZIOS, inicioDoPeriodo, montarPagina, opcoesDosFiltros, termoDeBusca, type Chip, type FiltrosLista, type LeadMin,
} from '@/lib/leads/lista';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const headers = { 'Cache-Control': 'no-store' };
const erro = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers });

/** Colunas da linha completa, só das 30 da página (as que existem na view 'leads'). */
const COLS_PAGINA = 'id,name,phone,email,source,origem,status,ai_score,ai_classification,ai_summary,vehicle_interest,assigned_consultant_id,created_at,updated_at,proxima_acao,valor_investimento,observacoes,carro_troca,region,source_table';
const LIMITE_LINHAS = 5000;

/**
 * GET /api/leads/lista — a lista de Leads da aba, filtrada, ordenada por urgência e paginada no servidor.
 * Params: q, consultor, status, interesse, origem, score, periodo, chip, offset, limite (padrão 30, máx. 50).
 * Vendedor/gestor só recebem os leads do próprio consultor; só o admin vê (e filtra) todos.
 */
export async function GET(request: Request) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;
    const sp = new URL(request.url).searchParams;
    const agora = new Date();
    const ehAdmin = eu.perfil === 'admin';

    if (!ehAdmin && !eu.consultorId) {
        return NextResponse.json({ success: true, leads: [], enriq: {}, total: 0, totalBanco: 0, contagens: Object.fromEntries(CHIPS.map(c => [c, 0])), opcoes: { interesses: [], origens: [] }, proximo: null }, { headers });
    }

    const chip = (CHIPS as string[]).includes(sp.get('chip') || '') ? (sp.get('chip') as Chip) : 'todos';
    const f: FiltrosLista = {
        ...FILTROS_VAZIOS,
        // quem não é admin não escolhe consultor: o escopo já é o dele
        consultor: ehAdmin ? (sp.get('consultor') || 'all') : 'all',
        status: sp.get('status') || 'all',
        interesse: sp.get('interesse') || 'all',
        origem: sp.get('origem') || 'all',
        score: sp.get('score') || 'all',
        chip: !ehAdmin && chip === 'sem_dono' ? 'todos' : chip,
    };
    const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0);
    const limite = Math.min(50, Math.max(1, parseInt(sp.get('limite') || '30', 10) || 30));

    // 1. linhas leves do banco (escopo, período e busca por texto ficam no SQL)
    const desde = inicioDoPeriodo(sp.get('periodo'), agora);
    const termo = termoDeBusca(sp.get('q'));
    // Uma leitura só no banco (função leads_lista_min): a view `leads` é pesada e antes era lida várias vezes por abertura.
    // Junto, a situação das conversas do WhatsApp (as duas leituras andam em paralelo).
    const [rpc, conversas] = await Promise.all([
        admin.rpc('leads_lista_min', {
            p_consultor: ehAdmin ? null : eu.consultorId, p_desde: desde, p_termo: termo || null, p_limite: LIMITE_LINHAS,
        }),
        lerConversasDeLeads(admin).catch(() => []),
    ]);
    if (rpc.error) return erro(500, rpc.error.message);
    const resp = (rpc.data || {}) as { total?: number; linhas?: LeadMin[] };
    const todas: LeadMin[] = resp.linhas || [];
    const count: number | null = resp.total ?? null;

    // 2. situação/última mensagem e página (ordem: data e horário, do mais novo ao mais antigo)
    let enriq: Awaited<ReturnType<typeof enriquecer>> = {};
    try { enriq = await enriquecer(admin, conversas); } catch { /* a lista funciona sem a conversa */ }
    const enriqDe = (l: LeadMin) => { const uid = uidDoIdDaLista(l.id); return uid ? enriq[uid] : undefined; };
    const pagina = montarPagina(todas, f, enriqDe, { offset, limite, agora });

    // 3. linha completa só das que vão aparecer
    let leads: Record<string, unknown>[] = [];
    if (pagina.ids.length) {
        let r = await admin.from('leads').select(COLS_PAGINA).in('id', pagina.ids);
        if (r.error) r = await admin.from('leads').select('*').in('id', pagina.ids);
        if (r.error) return erro(500, r.error.message);
        const porId = new Map((r.data || []).map((l: Record<string, unknown>) => [String(l.id), l]));
        leads = pagina.ids.map(id => porId.get(id)).filter(Boolean).map(l => ({ ...l, cidade: (l as { cidade?: string; region?: string }).cidade || (l as { region?: string }).region || null }));
    }
    const enriqPagina: typeof enriq = {};
    for (const l of leads) { const uid = uidDoIdDaLista(String(l.id)); if (uid && enriq[uid]) enriqPagina[uid] = enriq[uid]; }

    return NextResponse.json({
        success: true, leads, enriq: enriqPagina,
        total: pagina.total, totalBanco: count ?? todas.length, truncado: todas.length >= LIMITE_LINHAS,
        contagens: pagina.contagens, opcoes: opcoesDosFiltros(todas), proximo: pagina.proximo,
    }, { headers });
}
