'use client';

import React from 'react';

// ── Formatação ───────────────────────────────────────────────────────
export const brl = (n: number | null | undefined) =>
    (n == null ? 0 : n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const brlK = (n: number | null | undefined) => {
    const v = n || 0;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`;
    return String(v);
};
export const pct = (n: number | null | undefined) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);
export const dateBR = (s?: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');

// ── Tipos ────────────────────────────────────────────────────────────
export interface Veiculo {
    id: string; marca: string; modelo: string; versao?: string; ano?: number; placa?: string; km?: number; cor?: string;
    valor_compra: number; custos_reconto: number; valor_fipe?: number; valor_anuncio?: number;
    valor_venda?: number; data_compra?: string; data_venda?: string; status: string;
    consultor?: string; obs?: string;
    custo_total: number; lucro: number | null; margem: number | null; dias_estoque: number;
    valor_ref: number; lucro_potencial: number | null;
}

export interface Atencao {
    tipo: string; severidade: 'critico' | 'aviso' | 'info'; titulo: string; detalhe: string; veiculo_id?: string;
}

export interface MensalRow {
    ym: string; label: string; comprados: number; vendidos: number;
    custo_comprado: number; receita_vendida: number; lucro: number; giro_medio_dias: number | null;
}

export interface Dados {
    config: any; capital: any; giro: any; emprestimo: any; veredito: any;
    veiculos: Veiculo[]; parcelas: any[]; mensal: MensalRow[]; atencao: Atencao[];
}

// ── Cores de gráfico ─────────────────────────────────────────────────
export const CHART = {
    green: '#22c55e', red: '#ef4444', blue: '#3b82f6', amber: '#f59e0b',
    purple: '#a855f7', grid: '#27272a', axis: '#71717a', tipBg: '#18181b', tipBorder: '#3f3f46',
};

// ── UI ───────────────────────────────────────────────────────────────
export function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
    return (
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">{label}</div>
                {icon}
            </div>
            <div className={`text-2xl font-bold mt-1 ${accent || 'text-white'}`}>{value}</div>
            {sub && <div className="text-[11px] text-gray-500 mt-1">{sub}</div>}
        </div>
    );
}

export function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        estoque: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        reservado: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        vendido: 'bg-green-500/10 text-green-400 border-green-500/20',
        devolvido: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    };
    return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${map[status] || map.estoque}`}>{status}</span>;
}

export const SEV: Record<Atencao['severidade'], { dot: string; cls: string; label: string }> = {
    critico: { dot: 'bg-red-500', cls: 'border-red-500/30 bg-red-500/5', label: 'Crítico' },
    aviso: { dot: 'bg-yellow-500', cls: 'border-yellow-500/30 bg-yellow-500/5', label: 'Atenção' },
    info: { dot: 'bg-blue-500', cls: 'border-blue-500/30 bg-blue-500/5', label: 'Info' },
};

export function Card({ title, right, children, className = '' }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-zinc-900 rounded-lg border border-zinc-800 ${className}`}>
            {title && (
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
                    {right}
                </div>
            )}
            {children}
        </div>
    );
}
