import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { AGENTES } from '@/lib/agentes/catalogo';
import { diaBRT, fraseDaRota, resumirAcesso, type ResumoAcesso, type Sinal } from '@/lib/agentes/acessos';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };
const DIA = 86_400_000;

const semNorm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface LinhaTempo { em: string; tipo: Sinal['tipo']; texto: string }
export interface AcessoVendedor extends ResumoAcesso {
    agenteId: string;
    nome: string;
    consultorId: string;
    /** Fontes que não puderam ser lidas (migration não aplicada etc.): a tela avisa em vez de inventar. */
    faltando: string[];
    linhaDoTempo: LinhaTempo[];
}

const FRASE_INTERACAO: Record<string, string> = {
    status_change: 'alterou a etapa de um lead', note: 'anotou num lead', ligacao: 'ligou pela Minha Fila',
    atendimento_iniciado: 'iniciou um atendimento', sale: 'registrou uma venda', loss: 'registrou uma perda',
    lead_transferido: 'transferiu um lead', ai_analysis: 'pediu análise da IA num lead',
};

/**
 * GET /api/agentes/acessos?dias=7 — acesso REAL dos vendedores ao CRM (só admin).
 * Fontes: auth.audit_log_entries (login/logout/renovação), acessos_presenca (batimento e telas),
 * interactions_manos_crm, wa_mensagens (autor vendedor), wa_acessos_log, consultant_active_chats.
 * Sem dado = "não consta". Não devolve nome/telefone de cliente.
 */
export async function GET(req: NextRequest) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    if (ctx.eu.perfil !== 'admin') return NextResponse.json({ success: false, error: 'Só o admin vê os acessos.' }, { status: 403, headers: SEM_CACHE });

    const dias = Math.min(14, Math.max(1, Number(new URL(req.url).searchParams.get('dias')) || 7));
    const agora = Date.now();
    const desde = new Date(new Date(`${diaBRT(agora)}T00:00:00-03:00`).getTime() - (dias - 1) * DIA).toISOString();
    const a = ctx.admin;

    const { data: consultores } = await a.from('consultants_manos_crm').select('id, name, is_active, user_id, auth_id');
    const alvo = AGENTES.filter(x => x.consultor).map(ag => {
        const c = (consultores || []).find((k: any) => k.is_active !== false && semNorm(String(k.name || '')).split(/\s+/)[0] === ag.consultor);
        return c ? { ag, c, uid: (c.user_id || c.auth_id) as string | null } : null;
    }).filter(Boolean) as { ag: (typeof AGENTES)[number]; c: any; uid: string | null }[];

    const ids = alvo.map(x => x.c.id);
    const uids = alvo.map(x => x.uid).filter(Boolean) as string[];
    const faltando = new Set<string>();
    const ler = async <T,>(rotulo: string, q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
        try { const { data, error } = await q; if (error) { faltando.add(rotulo); return []; } return data || []; } catch { faltando.add(rotulo); return []; }
    };

    const [auth, pres, inter, msgs, logs, chats] = await Promise.all([
        uids.length ? ler<any>('login/logout (função acessos_auth_eventos)', a.rpc('acessos_auth_eventos', { p_uids: uids, p_desde: desde }) as any) : Promise.resolve([] as any[]),
        ler<any>('presença (tabela acessos_presenca)', a.from('acessos_presenca').select('consultant_id, evento, rota, em').in('consultant_id', ids).gte('em', desde).order('em', { ascending: true }).limit(20000)),
        ler<any>('interações', a.from('interactions_manos_crm').select('consultant_id, type, old_status, new_status, created_at').in('consultant_id', ids).gte('created_at', desde).limit(5000)),
        ler<any>('mensagens', a.from('wa_mensagens').select('consultant_id, criada_em').eq('autor', 'vendedor').in('consultant_id', ids).gte('criada_em', desde).limit(5000)),
        ler<any>('conversas abertas', a.from('wa_acessos_log').select('consultant_id, acao, em').in('consultant_id', ids).gte('em', desde).limit(5000)),
        ler<any>('atendimentos', a.from('consultant_active_chats').select('consultant_id, opened_at').in('consultant_id', ids).gte('opened_at', desde).limit(2000)),
    ]);

    const vendedores: AcessoVendedor[] = alvo.map(({ ag, c, uid }) => {
        const sinais: Sinal[] = [];
        for (const e of auth as any[]) if (e.uid === uid) sinais.push({ em: e.em, tipo: e.acao === 'login' ? 'login' : e.acao === 'logout' ? 'logout' : 'renovou' });
        let ultimaRota = '';
        for (const p of pres as any[]) {
            if (p.consultant_id !== c.id) continue;
            if (p.evento === 'navegacao') { if (p.rota !== ultimaRota) sinais.push({ em: p.em, tipo: 'navegacao', texto: fraseDaRota(p.rota) }); ultimaRota = p.rota; }
            else sinais.push({ em: p.em, tipo: 'batimento' });
        }
        for (const i of inter as any[]) if (i.consultant_id === c.id) sinais.push({ em: i.created_at, tipo: 'acao', texto: i.type === 'status_change' && i.old_status && i.new_status ? `alterou a etapa de um lead: ${i.old_status} → ${i.new_status}` : FRASE_INTERACAO[i.type] || 'mexeu num lead' });
        for (const m of msgs as any[]) if (m.consultant_id === c.id) sinais.push({ em: m.criada_em, tipo: 'acao', texto: 'respondeu uma conversa pelo CRM' });
        for (const l of logs as any[]) if (l.consultant_id === c.id) sinais.push({ em: l.em, tipo: 'acao', texto: l.acao === 'abriu' ? 'abriu uma conversa' : `acessou mídia de conversa (${l.acao})` });
        for (const k of chats as any[]) if (k.consultant_id === c.id) sinais.push({ em: k.opened_at, tipo: 'acao', texto: 'iniciou atendimento pelo WhatsApp' });

        const resumo = resumirAcesso(sinais, agora, dias);
        const linhaDoTempo: LinhaTempo[] = sinais
            .filter(s => s.tipo !== 'batimento' && s.tipo !== 'renovou')
            .map(s => ({ em: s.em, tipo: s.tipo, texto: s.tipo === 'login' ? 'entrou no CRM' : s.tipo === 'logout' ? 'saiu do CRM' : s.texto || '' }))
            .sort((x, y) => y.em.localeCompare(x.em)).slice(0, 80);
        return { ...resumo, agenteId: ag.id, nome: ag.nome, consultorId: c.id, faltando: [...faltando], linhaDoTempo };
    });

    return NextResponse.json({ success: true, agora, dias, vendedores, faltando: [...faltando] }, { headers: SEM_CACHE });
}
