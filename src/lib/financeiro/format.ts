// Utilitários de data/valor do Financeiro. Datas sempre como 'YYYY-MM-DD' no fuso local (BRT).

export function hojeISO(): string {
    return toISO(new Date());
}

export function toISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function fromISO(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

export function addDias(iso: string, dias: number): string {
    const d = fromISO(iso);
    d.setDate(d.getDate() + dias);
    return toISO(d);
}

export function inicioSemana(iso: string): string {
    // semana começa na segunda
    const d = fromISO(iso);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return toISO(d);
}

export function inicioMes(iso: string): string {
    return iso.slice(0, 8) + '01';
}

export function fimMes(iso: string): string {
    const d = fromISO(inicioMes(iso));
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return toISO(d);
}

export function diasEntre(a: string, b: string): number {
    return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

export type Preset = 'hoje' | 'ontem' | 'semana' | 'semana_passada' | 'mes' | 'mes_passado' | 'ano' | '30d' | '90d';

export const PRESET_LABEL: Record<Preset, string> = {
    hoje: 'Hoje',
    ontem: 'Ontem',
    semana: 'Esta semana',
    semana_passada: 'Semana passada',
    mes: 'Este mês',
    mes_passado: 'Mês passado',
    '30d': 'Últimos 30 dias',
    '90d': 'Últimos 90 dias',
    ano: 'Este ano',
};

export function rangePreset(p: Preset, base = hojeISO()): { inicio: string; fim: string } {
    switch (p) {
        case 'hoje': return { inicio: base, fim: base };
        case 'ontem': { const o = addDias(base, -1); return { inicio: o, fim: o }; }
        case 'semana': return { inicio: inicioSemana(base), fim: base };
        case 'semana_passada': { const s = addDias(inicioSemana(base), -7); return { inicio: s, fim: addDias(s, 6) }; }
        case 'mes': return { inicio: inicioMes(base), fim: base };
        case 'mes_passado': { const m = inicioMes(addDias(inicioMes(base), -1)); return { inicio: m, fim: fimMes(m) }; }
        case '30d': return { inicio: addDias(base, -29), fim: base };
        case '90d': return { inicio: addDias(base, -89), fim: base };
        case 'ano': return { inicio: base.slice(0, 4) + '-01-01', fim: base };
    }
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function brl(v: number | null | undefined): string {
    return BRL.format(Number(v || 0));
}

export function brlSinal(v: number): string {
    return (v > 0 ? '+' : v < 0 ? '−' : '') + BRL.format(Math.abs(v));
}

export function dataBR(iso: string | null | undefined): string {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
}

export function dataCurta(iso: string): string {
    const [, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}`;
}

export function normalizar(s: string): string {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
