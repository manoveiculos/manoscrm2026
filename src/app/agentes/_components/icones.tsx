'use client';

import {
    Bot, BrainCircuit, ClipboardList, Images, Palette, Radar, RefreshCcw, ScanSearch, Send, ShieldCheck,
    Shuffle, Sparkles, TrendingUp, UserRound, type LucideIcon,
} from 'lucide-react';
import type { EstadoAgente } from '@/lib/agentes/estado';
import { rotuloOcioso, ehConsultor } from '@/lib/agentes/ocioso';

export const ICONES: Record<string, LucideIcon> = {
    Bot, BrainCircuit, ClipboardList, Images, Palette, Radar, RefreshCcw, ScanSearch, Send, ShieldCheck,
    Shuffle, Sparkles, TrendingUp, UserRound,
};

export const ROTULO_ESTADO: Record<EstadoAgente, string> = {
    trabalhando: 'trabalhando agora',
    ocioso: 'pesquisando',
    aguardando: 'aguardando você',
    erro: 'erro',
    desligado: 'desligado',
};

/** Cor do chip de estado (vermelho Manos = precisa de você). */
export const COR_ESTADO: Record<EstadoAgente, string> = {
    trabalhando: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
    ocioso: 'bg-white/[0.06] text-white/55 border-white/10',
    aguardando: 'bg-red-600/20 text-red-200 border-red-500/50',
    erro: 'bg-red-900/40 text-red-200 border-red-500/60',
    desligado: 'bg-zinc-800 text-zinc-400 border-zinc-600',
};

export function quandoFoi(iso: string | null | undefined, agora: number): string {
    if (!iso) return 'sem registro';
    const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60_000));
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export function horaBRT(iso: string): string {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export function dolar(v: number | null | undefined): string {
    if (v == null) return '—';
    return `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 3 : 2 })}`;
}

/** Rótulo do chip: sem tarefa = "pesquisando" (consultores: "criando anúncios"). */
export function rotuloEstado(id: string, estado: EstadoAgente): string {
    return estado === 'ocioso' ? rotuloOcioso(id) : ROTULO_ESTADO[estado];
}

/** Cor do chip: consultor sem tarefa ganha um tom âmbar (criando); pesquisando fica azul-claro. */
export function corEstado(id: string, estado: EstadoAgente): string {
    if (estado !== 'ocioso') return COR_ESTADO[estado];
    return ehConsultor(id) ? 'bg-amber-500/10 text-amber-200 border-amber-500/30' : 'bg-sky-500/10 text-sky-200 border-sky-500/30';
}
