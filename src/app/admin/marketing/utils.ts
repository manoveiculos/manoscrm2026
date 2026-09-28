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
    recepcao: { label: 'Recepção', missao: 'Captação 24h no Instagram (DM/comentário)', icon: MessageCircle, color: '#818cf8' },
    sentinela: { label: 'Sentinela', missao: 'Inteligência de concorrência regional', icon: Radar, color: '#22d3ee' },
    trafego: { label: 'Tráfego', missao: 'Vigilante Meta Ads 24h', icon: TrendingUp, color: '#f87171' },
};
export const SQUAD_ORDER: SquadKey[] = ['vitrine', 'diretor_arte', 'publisher', 'perito', 'captador', 'recepcao', 'sentinela', 'trafego'];

// Dashboard "separado por pipeline": squads que trabalham juntos ficam
// agrupados visualmente em vez de uma grade única.
export const SQUAD_GROUPS: Array<{ title: string; note: string; squads: SquadKey[] }> = [
    { title: 'Conteúdo & Publicação (Instagram)', note: 'Vitrine gera → Diretor de Arte revisa → você aprova → Publisher posta', squads: ['vitrine', 'diretor_arte', 'publisher'] },
    { title: 'Aquisição & Atendimento', note: 'Perito (laudo → proposta), Captador e Recepção', squads: ['perito', 'captador', 'recepcao'] },
    { title: 'Inteligência & Tráfego pago', note: 'Sentinela (concorrência) e Tráfego (Meta Ads 24h)', squads: ['sentinela', 'trafego'] },
];

export interface KpiRow { squad: SquadKey; total_runs: number; runs_7d: number; runs_24h: number; errors_7d: number; pending_approvals: number; last_run_at: string | null; }
export interface RunRow {
    id: string; squad: SquadKey; skill_name: string | null; run_type: string; status: string;
    title: string; summary: string | null; input_ref: string | null; output_ref: string | null;
    metrics: Record<string, any>; requires_approval: boolean; approved_by: string | null;
    approved_at: string | null; rejected_reason: string | null; error_message: string | null; created_at: string;
}
export interface IntegrationRow { id: string; provider: string; status: string; details: Record<string, any>; checked_at: string; checked_by: string | null; }
export interface FeedData { kpis: KpiRow[]; recentRuns: RunRow[]; pendingApprovals: RunRow[]; integrations: IntegrationRow[]; daily: Array<Record<string, any>>; generated_at: string; }

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
