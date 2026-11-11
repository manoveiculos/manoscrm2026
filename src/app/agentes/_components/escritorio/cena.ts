// Escritório animado da Central dos Agentes — tipos e layout da cena (palco 1600×900).
//
// O palco tem tamanho fixo e é escalado para caber na tela (ver EscritorioView).
// Os EVENTOS são o que faz a cena se mexer: cada um vem de um registro real
// (na tela de verdade) ou da simulação (só na prévia /dev/escritorio).

export const W = 1600;
export const H = 900;

export interface Caixa { x: number; y: number; w: number; h: number }

export type { EventoCena } from '@/lib/agentes/eventos';

/** Números do telão que não vêm do estado dos agentes (na tela real viram um bloco `painel` da API). */
export interface PainelTelao {
    leads: { quente: number; morno: number; frio: number };
    vendasHoje: number;
    vendasMes: number;
    funil: { rotulo: string; n: number }[];
}

const DESK = { w: 232, h: 108 };
const COL = { atendimento: [36, 288], marketing: [1082, 1334] };
const LINHAS = [352, 470, 588, 706];

const ATENDIMENTO = ['laura', 'distribuidor', 'reengajamento', 'supervisor', 'copiloto', 'consultor_wilson', 'consultor_victor', 'consultor_sergio'];
const MARKETING = ['vitrine', 'diretor_arte', 'publisher', 'trafego', 'sentinela', 'perito', 'recepcao'];

export const MESAS: Record<string, Caixa> = {};
ATENDIMENTO.forEach((id, i) => { MESAS[id] = { x: COL.atendimento[Math.floor(i / 4)], y: LINHAS[i % 4], ...DESK }; });
MARKETING.forEach((id, i) => { MESAS[id] = { x: COL.marketing[Math.floor(i / 4)], y: LINHAS[i % 4], ...DESK }; });
MESAS.growth = { x: 1288, y: 128, ...DESK };

export const TELAO: Caixa = { x: 424, y: 22, w: 752, h: 292 };
export const SALA_DIRECAO: Caixa = { x: 1236, y: 28, w: 330, h: 262 };
export const ENTRADA: Caixa = { x: 36, y: 28, w: 340, h: 262 };
export const ANEL = { cx: 800, cy: 628, rx: 222, ry: 138 };
export const HUB = { x: ANEL.cx, y: ANEL.cy };
export const PORTA = { x: 206, y: 150 };

export const centro = (id: string): { x: number; y: number } => {
    const m = MESAS[id];
    return m ? { x: m.x + m.w / 2, y: m.y + m.h / 2 } : HUB;
};

export const humano = (id: string) => id.startsWith('consultor_');
