// src/lib/leads/urgencia.ts — quem o vendedor deve atender primeiro (PURO)
//
// A lista de Leads deixa de ser "por data de criação" e passa a ser por urgência.
// A ordem é: cliente esperando a loja → visita marcada → retorno vencido → novo de hoje →
// sem contato há 3 dias → o resto → encerrados.

import { normalizeStatus } from '@/constants/status';
import type { CodigoSituacao } from '@/lib/whatsapp/ia/analista';

export type GrupoUrgencia = 'esperando_loja' | 'visita' | 'retorno' | 'novo_hoje' | 'sem_contato' | 'normal' | 'encerrado';

export const ROTULO_GRUPO: Record<GrupoUrgencia, string> = {
    esperando_loja: 'Esperando você',
    visita: 'Visita marcada',
    retorno: 'Retorno vencido',
    novo_hoje: 'Novo hoje',
    sem_contato: 'Sem contato',
    normal: '',
    encerrado: 'Encerrado',
};

const ORDEM: GrupoUrgencia[] = ['esperando_loja', 'visita', 'retorno', 'novo_hoje', 'sem_contato', 'normal', 'encerrado'];

/** O que o servidor sabe da conversa do lead (GET /api/leads/situacoes). */
export interface Enriquecimento {
    conversaId: string;
    situacao: CodigoSituacao | null;
    rotuloSituacao: string | null;
    /** AAAA-MM-DD que o cliente citou para voltar / da visita. */
    quando: string | null;
    ultimaDe: 'cliente' | 'laura' | 'vendedor' | null;
    ultimaEm: string | null;
    ultimaTexto: string | null;
}

export interface LeadParaOrdenar {
    id: string;
    status?: string | null;
    created_at?: string | null;
}

export const DIAS_SEM_CONTATO = 3;
const DIA_MS = 86_400_000;

export function grupoDoLead(lead: LeadParaOrdenar, e: Enriquecimento | undefined, agora: Date = new Date()): GrupoUrgencia {
    const etapa = normalizeStatus(lead.status as never);
    if (etapa === 'vendido' || etapa === 'perdido') return 'encerrado';
    if (e?.situacao === 'cliente_comprou' || e?.situacao === 'cliente_recusou') return 'encerrado';
    if (e?.ultimaDe === 'cliente') return 'esperando_loja';
    if (e?.situacao === 'visita_marcada') return 'visita';
    if (e?.situacao === 'cliente_pediu_tempo' && e.quando && e.quando <= agora.toISOString().slice(0, 10)) return 'retorno';
    const criado = lead.created_at ? new Date(lead.created_at).getTime() : NaN;
    if (!e && Number.isFinite(criado) && agora.getTime() - criado < DIA_MS) return 'novo_hoje';
    const ref = e?.ultimaEm ? new Date(e.ultimaEm).getTime() : criado;
    if (Number.isFinite(ref) && agora.getTime() - ref >= DIAS_SEM_CONTATO * DIA_MS) return 'sem_contato';
    return 'normal';
}

const ms = (iso: string | null | undefined) => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isFinite(t) ? t : 0; };

/** Ordena por urgência; dentro do grupo, quem espera há mais tempo vem primeiro (os demais: mais novos primeiro). */
export function ordenarPorUrgencia<T extends LeadParaOrdenar>(
    leads: T[], enriq: (lead: T) => Enriquecimento | undefined, agora: Date = new Date(),
): { lead: T; grupo: GrupoUrgencia }[] {
    const linhas = leads.map(lead => ({ lead, grupo: grupoDoLead(lead, enriq(lead), agora), e: enriq(lead) }));
    linhas.sort((a, b) => {
        const g = ORDEM.indexOf(a.grupo) - ORDEM.indexOf(b.grupo);
        if (g !== 0) return g;
        if (a.grupo === 'esperando_loja') return ms(a.e?.ultimaEm) - ms(b.e?.ultimaEm);
        if (a.grupo === 'visita' || a.grupo === 'retorno') return (a.e?.quando || '').localeCompare(b.e?.quando || '');
        return ms(b.lead.created_at) - ms(a.lead.created_at);
    });
    return linhas.map(({ lead, grupo }) => ({ lead, grupo }));
}
