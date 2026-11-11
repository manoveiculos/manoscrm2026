// src/lib/agentes/eventos.ts — DE REGISTROS REAIS PARA EVENTOS DA CENA (função pura)
//
// O escritório só anima o que ACABOU de acontecer: na primeira leitura os ids já
// existentes são marcados como vistos (nada do passado é reproduzido); nas
// leituras seguintes, cada registro novo com `evento` vira um EventoCena.
// Nada é inventado: sem registro novo, a cena fica parada (só respira).

import type { CentralAgentes, RegistroAgente } from './estado';

export type EventoCena =
    | { id: string; tipo: 'lead_distribuido'; de: string; para: string; nome?: string; carro?: string }
    | { id: string; tipo: 'fala'; agenteId: string; texto: string }
    | { id: string; tipo: 'lead_quente'; nome?: string; carro?: string; texto?: string }
    | { id: string; tipo: 'venda'; agenteId: string; nome?: string; carro?: string }
    | { id: string; tipo: 'aprovacao'; agenteId: string; titulo: string }
    | { id: string; tipo: 'erro'; agenteId: string; texto: string };

const MIN = 60_000;
/** Falas (rotina) mais velhas que isto não são animadas — ex.: aba que ficou oculta. */
export const JANELA_FALA_MS = 5 * MIN;
export const JANELA_ESPECIAL_MS = 30 * MIN;
export const MAX_FALAS_POR_LEITURA = 4;

function paraEvento(r: RegistroAgente): EventoCena | null {
    const ev = r.evento;
    if (!r.id || !ev) return null;
    const id = r.id;
    switch (ev.tipo) {
        case 'lead_distribuido':
            return ev.para
                ? { id, tipo: 'lead_distribuido', de: r.agenteId, para: ev.para, nome: ev.nome, carro: ev.carro }
                : { id, tipo: 'fala', agenteId: r.agenteId, texto: r.frase };
        case 'fala': return { id, tipo: 'fala', agenteId: r.agenteId, texto: r.frase };
        case 'lead_quente': return { id, tipo: 'lead_quente', texto: ev.texto };
        case 'venda': return { id, tipo: 'venda', agenteId: r.agenteId };
        case 'aprovacao': return { id, tipo: 'aprovacao', agenteId: r.agenteId, titulo: r.frase };
        case 'erro': return { id, tipo: 'erro', agenteId: r.agenteId, texto: r.frase };
    }
}

const ESPECIAIS = new Set(['lead_quente', 'venda', 'aprovacao', 'erro', 'lead_distribuido']);

/**
 * `vistos` é alterado: recebe todos os ids que apareceram em `dados`.
 * `primeira` = primeira leitura da tela → só marca, não emite.
 */
export function novosEventos(dados: CentralAgentes, vistos: Set<string>, primeira: boolean, agora: number = Date.now()): EventoCena[] {
    const novos: RegistroAgente[] = [];
    for (const a of dados.agentes) {
        for (const r of a.acoes) {
            if (!r.id || vistos.has(r.id)) continue;
            vistos.add(r.id);
            novos.push(r);
        }
    }
    if (primeira) return [];
    novos.sort((x, y) => new Date(x.em).getTime() - new Date(y.em).getTime());

    const especiais: EventoCena[] = [];
    const falas: EventoCena[] = [];
    for (const r of novos) {
        const idade = agora - new Date(r.em).getTime();
        const e = paraEvento(r);
        if (!e) continue;
        if (ESPECIAIS.has(e.tipo)) { if (idade <= JANELA_ESPECIAL_MS) especiais.push(e); }
        else if (idade <= JANELA_FALA_MS) falas.push(e);
    }
    const ordem = new Map(novos.map((r, i) => [r.id!, i]));
    return [...especiais, ...falas.slice(-MAX_FALAS_POR_LEITURA)].sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0));
}
