import {
    Megaphone, FileSearch, Camera, Radar, Repeat, MessageCircle,
    TrendingUp, Send, Eye,
} from 'lucide-react';

/**
 * Tipos e helpers compartilhados do painel /admin/marketing — usados pela
 * página principal e pelo drill-down por squad (SquadDetailModal).
 */

export type SquadKey =
    | 'perito' | 'vitrine' | 'sentinela' | 'captador' | 'recepcao'
    | 'trafego' | 'publisher' | 'diretor_arte';

export const SQUAD_INFO: Record<SquadKey, { label: string; missao: string; icon: any; color: string }> = {
    vitrine: { label: 'Vitrine', missao: 'Gera o carrossel/arte do dia', icon: Camera, color: '#ec4899' },
    diretor_arte: { label: 'Diretor de Arte', missao: 'Revisão visual antes de liberar', icon: Eye, color: '#c084fc' },
    publisher: { label: 'Publisher', missao: 'Agenda e audita no Instagram', icon: Send, color: '#fb923c' },
    perito: { label: 'Perito', missao: 'Laudo cautelar → proposta de compra', icon: FileSearch, color: '#f59e0b' },
    captador: { label: 'Captador', missao: 'Qualificação de lead de troca por 0km', icon: Repeat, color: '#a3e635' },
    recepcao: { label: 'Recepção', missao: 'Fichas dos leads do dia e cliente antigo que voltou', icon: MessageCircle, color: '#818cf8' },
    sentinela: { label: 'Sentinela', missao: 'Inteligência de concorrência regional', icon: Radar, color: '#22d3ee' },
    trafego: { label: 'Tráfego', missao: 'Vigilante Meta Ads 24h', icon: TrendingUp, color: '#f87171' },
};
// Captador fica fora da tela: nunca rodou (0 execuções) e está pausado por falta de fonte de dados.
// A chave segue em SquadKey/SQUAD_INFO só para a API aceitar registros antigos.
export const SQUAD_ORDER: SquadKey[] = ['vitrine', 'diretor_arte', 'publisher', 'perito', 'recepcao', 'sentinela', 'trafego'];

// Dashboard "separado por pipeline": squads que trabalham juntos ficam
// agrupados visualmente em vez de uma grade única.
export const SQUAD_GROUPS: Array<{ title: string; note: string; squads: SquadKey[] }> = [
    { title: 'Conteúdo & Publicação (Instagram)', note: 'Vitrine gera → Diretor de Arte revisa → você aprova → Publisher posta', squads: ['vitrine', 'diretor_arte', 'publisher'] },
    { title: 'Aquisição & Atendimento', note: 'Perito (laudo → proposta) e Recepção (fichas dos leads)', squads: ['perito', 'recepcao'] },
    { title: 'Inteligência & Tráfego pago', note: 'Sentinela (concorrência) e Tráfego (Meta Ads 24h)', squads: ['sentinela', 'trafego'] },
];

// Abas do Time de Marketing: cada uma reúne os agentes que trabalham juntos.
export type AbaId = 'resumo' | 'instagram' | 'leads' | 'mercado' | 'trafego' | 'campanhas' | 'conexoes';
export const ABAS: Array<{ id: AbaId; label: string; href: string; descricao: string; squads: SquadKey[] }> = [
    { id: 'resumo', label: 'Resumo', href: '/admin/marketing', descricao: 'O que precisa de você agora e como estão os squads.', squads: [] },
    { id: 'instagram', label: 'Instagram', href: '/admin/marketing/instagram', descricao: 'Vitrine gera → Diretor de Arte revisa → você aprova → Publisher agenda.', squads: ['vitrine', 'diretor_arte', 'publisher'] },
    { id: 'leads', label: 'Leads e compras', href: '/admin/marketing/leads', descricao: 'Recepção monta a ficha dos leads; Perito analisa laudo e propõe compra.', squads: ['recepcao', 'perito'] },
    { id: 'mercado', label: 'Mercado e anúncios', href: '/admin/marketing/mercado', descricao: 'Sentinela vigia a concorrência; Tráfego vigia o Meta Ads e o Google Ads.', squads: ['sentinela', 'trafego'] },
    { id: 'trafego', label: 'Tráfego Pago', href: '/admin/marketing/trafego', descricao: 'A campanha do site novo: quem chegou pelos anúncios, o que olhou e quem virou lead.', squads: [] },
    { id: 'campanhas', label: 'Campanhas', href: '/admin/marketing/campanhas', descricao: 'Facebook/Instagram e Google ao vivo, separados: gasto, resultados e o que realmente chegou no CRM.', squads: [] },
    { id: 'conexoes', label: 'Conexões', href: '/admin/marketing/conexoes', descricao: 'O que está funcionando, o que falhou e onde o caminho bloqueou.', squads: [] },
];

export interface KpiRow { squad: SquadKey; total_runs: number; runs_7d: number; runs_24h: number; errors_7d: number; pending_approvals: number; last_run_at: string | null; }
export interface RunRow {
    id: string; squad: SquadKey; skill_name: string | null; run_type: string; status: string;
    title: string; summary: string | null; input_ref: string | null; output_ref: string | null;
    metrics: Record<string, any>; requires_approval: boolean; approved_by: string | null;
    approved_at: string | null; rejected_by?: string | null; rejected_at?: string | null; rejected_reason: string | null; error_message: string | null; created_at: string;
}
export interface IntegrationRow { id: string; provider: string; status: string; details: Record<string, any>; checked_at: string; checked_by: string | null; }
export interface RotinaRow {
    id: string; nome: string; squad: string; funcao: string | null; agenda: string | null; ativo: boolean;
    motivo_pausa: string | null; ultimo_inicio: string | null; ultimo_fim: string | null;
    ultimo_status: 'ok' | 'erro' | 'bloqueado' | null; ultimo_erro: string | null; bloqueio: string | null; atualizado_em: string;
}
export interface FeedData { kpis: KpiRow[]; recentRuns: RunRow[]; pendingApprovals: RunRow[]; integrations: IntegrationRow[]; rotinas?: RotinaRow[]; daily: Array<Record<string, any>>; generated_at: string; }

/** "Aprovado por X · 2d atrás" / "Reprovado por X · …". Linhas antigas reprovadas
 *  guardavam quem decidiu em approved_by — aparecem como "Decidido". */
export function decisaoTexto(run: Pick<RunRow, 'status' | 'approved_by' | 'approved_at' | 'rejected_by' | 'rejected_at'>): string | null {
    if (run.rejected_by) return `Reprovado por ${run.rejected_by} · ${timeAgo(run.rejected_at ?? null)}`;
    if (!run.approved_by) return null;
    return `${run.status === 'approved' ? 'Aprovado' : 'Decidido'} por ${run.approved_by} · ${timeAgo(run.approved_at)}`;
}

export function timeAgo(iso: string | null): string {
    if (!iso) return '—';
    const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return `${sec}s atrás`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}min atrás`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h atrás`;
    return `${Math.floor(h / 24)}d atrás`;
}

export function formatBRL(v: any): string | null {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (isNaN(n)) return null;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function metricLabel(key: string): string {
    const map: Record<string, string> = {
        valor_proposta: 'Proposta', fipe: 'FIPE', nota_compra: 'Nota', execution_id: 'Execução n8n',
        http_status: 'HTTP', leads_qualificados: 'Leads qualificados',
    };
    return map[key] || key.replace(/_/g, ' ');
}

export function parseRefUrl(ref: string | null | undefined): { isUrl: boolean; href: string; text: string } {
    if (!ref) return { isUrl: false, href: '', text: '' };
    const trimmed = ref.trim();
    if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
        return { isUrl: true, href: trimmed, text: trimmed };
    }
    if (/^www\./i.test(trimmed)) {
        return { isUrl: true, href: `https://${trimmed}`, text: trimmed };
    }
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(trimmed)) {
        return { isUrl: true, href: `https://${trimmed}`, text: trimmed };
    }
    return { isUrl: false, href: '', text: trimmed };
}

export const STATUS_STYLE: Record<string, { dot: string; label: string; text: string }> = {
    success: { dot: 'bg-emerald-500', label: 'ok', text: 'text-emerald-400' },
    error: { dot: 'bg-red-500', label: 'erro', text: 'text-red-400' },
    pending_approval: { dot: 'bg-amber-500', label: 'aguardando aprovação', text: 'text-amber-400' },
    approved: { dot: 'bg-blue-500', label: 'aprovado', text: 'text-blue-400' },
    rejected: { dot: 'bg-zinc-500', label: 'rejeitado', text: 'text-zinc-400' },
};

export const DEFAULT_SQUAD_INFO = {
    label: 'Geral',
    missao: 'Agente de marketing',
    icon: Megaphone,
    color: '#a1a1aa',
};

export function getSquadInfo(squad?: string | null) {
    if (!squad) return DEFAULT_SQUAD_INFO;
    const key = squad.toLowerCase() as SquadKey;
    if (SQUAD_INFO[key]) return SQUAD_INFO[key];
    return {
        ...DEFAULT_SQUAD_INFO,
        label: squad.charAt(0).toUpperCase() + squad.slice(1),
    };
}
