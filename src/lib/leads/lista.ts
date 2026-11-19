// src/lib/leads/lista.ts — filtra, ordena e pagina a lista de Leads NO SERVIDOR (PURO)
//
// O navegador deixa de baixar milhares de leads: o servidor recebe os filtros, aplica as mesmas
// regras que a tela aplicava, ordena por urgência e devolve só a página pedida + contadores.

import { normalizeStatus } from '@/constants/status';
import { calculateLeadScore } from '@/utils/calculateScore';
import { grupoDoLead, ordenarPorUrgencia, type Enriquecimento, type GrupoUrgencia } from './urgencia';

export type Ordem = 'data' | 'urgencia';

export type Chip = 'todos' | 'esperando' | 'sem_contato' | 'visita' | 'novos' | 'sem_dono';
export const CHIPS: Chip[] = ['todos', 'esperando', 'sem_contato', 'visita', 'novos', 'sem_dono'];

/** Só o que os filtros e a urgência precisam: a linha completa vem depois, só para a página. */
export interface LeadMin {
    id: string;
    status?: string | null;
    created_at?: string | null;
    assigned_consultant_id?: string | null;
    source?: string | null;
    origem?: string | null;
    vehicle_interest?: string | null;
    ai_score?: number | null;
    valor_investimento?: string | null;
}

export interface FiltrosLista {
    /** 'all' | 'none' | id do consultor (só o admin escolhe; os outros já vêm limitados no banco). */
    consultor: string;
    status: string;
    interesse: string;
    origem: string;
    score: string;
    chip: Chip;
}

export const FILTROS_VAZIOS: FiltrosLista = { consultor: 'all', status: 'all', interesse: 'all', origem: 'all', score: 'all', chip: 'todos' };

const DIA_MS = 86_400_000;

/** ai_score do banco quando existe; senão o cálculo por etapa/tempo (mesma regra que a tela já usava). */
export function scoreDoLead(l: LeadMin, agora: Date): number {
    const etapa = normalizeStatus(l.status as never);
    const horas = Math.max(0, (agora.getTime() - new Date(l.created_at || '').getTime()) / 3_600_000);
    const calculado = calculateLeadScore({
        status: etapa, tempoFunilHoras: Number.isFinite(horas) ? horas : 0, totalInteracoes: 0,
        ultimaInteracaoH: Number.isFinite(horas) ? horas : 0,
        temValorDefinido: !!l.valor_investimento && l.valor_investimento !== '0',
        temVeiculoInteresse: !!l.vehicle_interest && l.vehicle_interest !== '---',
    });
    const ai = Number(l.ai_score);
    return ai > 0 ? ai : calculado;
}

/** Filtros da barra de cima (tudo menos o chip). */
export function passaFiltros(l: LeadMin, f: FiltrosLista, agora: Date): boolean {
    if (f.consultor === 'none' && l.assigned_consultant_id) return false;
    if (f.consultor !== 'all' && f.consultor !== 'none' && l.assigned_consultant_id !== f.consultor) return false;
    if (f.status !== 'all' && normalizeStatus(l.status as never) !== f.status) return false;
    if (f.origem !== 'all' && l.source !== f.origem && l.origem !== f.origem) return false;
    if (f.interesse !== 'all' && l.vehicle_interest !== f.interesse) return false;
    if (f.score !== 'all') {
        const s = scoreDoLead(l, agora);
        const ok = f.score === 'quente' ? s >= 80 : f.score === 'morno' ? s >= 60 && s < 80 : f.score === 'frio' ? s >= 30 && s < 60 : f.score === 'gelado' ? s < 30 : true;
        if (!ok) return false;
    }
    return true;
}

export function passaChip(chip: Chip, l: LeadMin, grupo: GrupoUrgencia, e: Enriquecimento | undefined): boolean {
    switch (chip) {
        case 'todos': return true;
        case 'esperando': return grupo === 'esperando_loja';
        case 'sem_contato': return grupo === 'sem_contato';
        case 'visita': return e?.situacao === 'visita_marcada';
        case 'novos': return grupo === 'novo_hoje';
        case 'sem_dono': return !l.assigned_consultant_id;
    }
}

export interface PaginaLista {
    /** Ids (da lista) da página pedida, já na ordem de urgência. */
    ids: string[];
    /** Quantos leads passam em tudo (filtros + chip). */
    total: number;
    /** Quantos haveria em cada chip, com os filtros de cima aplicados. */
    contagens: Record<Chip, number>;
    /** Próximo offset, ou null quando acabou. */
    proximo: number | null;
}

export function montarPagina<T extends LeadMin>(
    linhas: T[], f: FiltrosLista, enriqDe: (l: T) => Enriquecimento | undefined,
    opts: { offset: number; limite: number; agora?: Date; ordem?: Ordem },
): PaginaLista {
    const agora = opts.agora ?? new Date();
    const base = linhas.filter(l => passaFiltros(l, f, agora));
    // Padrão: do mais novo para o mais antigo, por data e horário de entrada. "urgencia" fica disponível.
    const ordenadas = opts.ordem === 'urgencia'
        ? ordenarPorUrgencia(base, enriqDe, agora)
        : [...base]
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .map(lead => ({ lead, grupo: grupoDoLead(lead, enriqDe(lead), agora) }));

    const contagens = Object.fromEntries(CHIPS.map(c => [c, 0])) as Record<Chip, number>;
    for (const { lead, grupo } of ordenadas) {
        const e = enriqDe(lead);
        for (const c of CHIPS) if (passaChip(c, lead, grupo, e)) contagens[c]++;
    }
    const doChip = ordenadas.filter(({ lead, grupo }) => passaChip(f.chip, lead, grupo, enriqDe(lead)));
    const fim = opts.offset + opts.limite;
    return {
        ids: doChip.slice(opts.offset, fim).map(x => x.lead.id),
        total: doChip.length,
        contagens,
        proximo: fim < doChip.length ? fim : null,
    };
}

const GENERICOS = ['COMPRA', 'VENDA', 'TROCA', 'DUVIDA', 'FALAR COM CONSULTOR', '---', 'INTERESSE'];

/** Opções dos selects "Interesse" e "Origem" (as mais frequentes, sem textos genéricos). */
export function opcoesDosFiltros(linhas: LeadMin[], max = 80): { interesses: string[]; origens: string[] } {
    const conta = new Map<string, number>();
    const origens = new Set<string>();
    for (const l of linhas) {
        const i = l.vehicle_interest;
        if (i) {
            const up = i.toUpperCase();
            if (up.length > 2 && !GENERICOS.some(g => up.includes(g)) && !/NÃO ESPECIFICADO|ANALISAR PERFIL/.test(up)) conta.set(i, (conta.get(i) || 0) + 1);
        }
        if (l.source) origens.add(l.source);
    }
    const interesses = [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([i]) => i).sort();
    return { interesses, origens: [...origens].sort() };
}

/** Termo de busca seguro para entrar num filtro .or() do PostgREST (sem vírgula, parêntese, curinga). */
export function termoDeBusca(q: string | null | undefined): string {
    return (q || '').replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Início do período em ISO (dia de São Paulo para "hoje"); null = sem corte. */
export function inicioDoPeriodo(periodo: string | null | undefined, agora: Date): string | null {
    if (periodo === 'today') {
        const sp = new Date(agora.getTime() - 3 * 3_600_000);
        return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3, 0, 0)).toISOString();
    }
    if (periodo === '7days') return new Date(agora.getTime() - 7 * DIA_MS).toISOString();
    if (periodo === '30days') return new Date(agora.getTime() - 30 * DIA_MS).toISOString();
    return null;
}

export { grupoDoLead };
