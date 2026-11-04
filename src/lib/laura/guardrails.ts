// src/lib/laura/guardrails.ts — REGRAS INEGOCIÁVEIS DA IA (checagem determinística)
//
// O prompt pede, este filtro garante. Toda mensagem da IA passa aqui antes de
// sair: se violar uma regra, troca pela resposta segura. Melhor uma resposta
// sem graça do que um preço inventado ou uma parcela que o banco não aprova.

import { parseValorBR } from '@/lib/qualificacao';
import { FRASE_CREDITO } from './playbook';

export type Violacao = 'simulou_parcela' | 'avaliou_carro' | 'fechou_negocio' | 'preco_fora_do_anuncio' | 'pediu_documento';

export const RESPOSTA_SEGURA =
    'Essa parte o consultor passa certinho pra você aqui na loja 😊 Posso já deixar sua visita agendada pra ele te mostrar tudo pessoalmente?';

const REGRAS: { tipo: Violacao; rx: RegExp }[] = [
    // "48x de R$ 1.200", "parcela de 900", "parcelas ficam em R$ 1.100", "prestação de..."
    { tipo: 'simulou_parcela', rx: /\b\d{1,3}\s*x\s*(de\s*)?(r\$\s*)?\d/i },
    { tipo: 'simulou_parcela', rx: /\b(parcela|presta[cç][aã]o|mensalidade)s?\s+(de|fica\w*|sai\w*|seria\w*|em|por|a partir de)(\s+(em|de|por|uns?|umas?|tipo|mais ou menos))*\s+(r\$\s*)?\d/i },
    { tipo: 'simulou_parcela', rx: /\btaxa\s+(de\s+)?\d+([.,]\d+)?\s*%/i },
    // "seu carro vale R$ 30 mil", "pagamos 25 mil no seu", "avaliação em R$..."
    { tipo: 'avaliou_carro', rx: /\b(seu|teu|o)\s+(carro|ve[ií]culo|usado)\s+(vale|fica|sai|entra|[eé] avaliado)\b/i },
    { tipo: 'avaliou_carro', rx: /\b(avalia\w*|pagamos|pago|pagaria|consigo pagar|oferecemos|ofere[cç]o)\s+(\w+\s+){0,4}(r\$\s*)?\d+([.,]\d+)?\s*(mil|k)?\b.*\b(troca|seu|teu|usado)/i },
    { tipo: 'avaliou_carro', rx: /\b(troca|usado)\b.*\b(vale|avaliad\w*|pegamos por|entra por)\s+(r\$\s*)?\d/i },
    // fechamento / reserva / promessa
    { tipo: 'fechou_negocio', rx: /\b(neg[oó]cio fechado|est[aá] fechado|fechamos|pode considerar fechado|reservad[oa] (pra|para) (voc[eê]|vc|o senhor|a senhora)|separei o carro|seguro o carro pra)\b/i },
    { tipo: 'fechou_negocio', rx: /\b(cr[eé]dito|financiamento|ficha)\s+(j[aá]\s+)?(est[aá]\s+)?(aprovad[oa]|garantid[oa])\b/i },
    { tipo: 'fechou_negocio', rx: /\b(garanto|garantimos)\s+(a\s+)?(aprova[cç][aã]o|desconto|o pre[cç]o)\b/i },
    { tipo: 'fechou_negocio', rx: /\b(te dou|dou|fa[cç]o)\s+(um\s+)?desconto\b/i },
    // dados sensíveis
    { tipo: 'pediu_documento', rx: /\b(me (passa|manda|envia|informa)|qual [eé]|qual|informe)\s+(o\s+|seu\s+|teu\s+|o seu\s+)?(cpf|rg|renda|holerite|senha|conta banc)/i },
];

export interface ResultadoRevisao {
    ok: boolean;
    violacoes: Violacao[];
    texto_seguro: string;
}

/**
 * @param texto      mensagem que a IA pretende mandar
 * @param precosAnunciados preços do estoque (R$) — qualquer outro valor de carro é proibido
 * @param valoresDoCliente números que o próprio cliente disse (faixa, entrada) — podem ser repetidos
 */
export function revisarResposta(texto: string, precosAnunciados: number[], valoresDoCliente: number[] = []): ResultadoRevisao {
    const t = (texto || '').trim();
    const violacoes = new Set<Violacao>();
    for (const r of REGRAS) if (r.rx.test(t)) violacoes.add(r.tipo);

    // Todo valor em R$ precisa ser preço anunciado (±1%) ou número do próprio cliente.
    const permitido = (v: number) =>
        precosAnunciados.some(p => Math.abs(p - v) <= p * 0.01) ||
        valoresDoCliente.some(c => Math.abs(c - v) <= Math.max(1, c * 0.01));
    const valores = t.match(/r\$\s*[\d.,]+(\s*(mil|k)\b)?|\b\d+([.,]\d+)?\s*(mil|k)\b/gi) || [];
    for (const bruto of valores) {
        const v = parseValorBR(bruto);
        if (v != null && v >= 1000 && !permitido(v)) { violacoes.add('preco_fora_do_anuncio'); break; }
    }

    if (violacoes.size > 0) return { ok: false, violacoes: [...violacoes], texto_seguro: RESPOSTA_SEGURA };

    // Falou de financiamento? A frase de crédito é obrigatória.
    let seguro = t;
    if (/\b(financ\w*|cr[eé]dito|parcel\w*|cdc)\b/i.test(t) && !/an[aá]lise de cr[eé]dito/i.test(t)) {
        seguro = `${t.replace(/[.!\s]*$/, '')} (${FRASE_CREDITO}).`;
    }
    return { ok: true, violacoes: [], texto_seguro: seguro };
}
