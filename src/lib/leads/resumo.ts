// src/lib/leads/resumo.ts — monta o RESUMO do lead para a gaveta da aba Leads (PURO)
//
// Junta o que o CRM já sabe e hoje está espalhado: a situação escrita pelo analista de IA
// (wa_conversas.situacao), a ficha que a Laura preencheu (wa_conversas.ficha) e as últimas
// mensagens (wa_mensagens). Nada aqui chama banco nem IA.

import { ROTULO_SITUACAO, SITUACOES, type CodigoSituacao } from '@/lib/whatsapp/ia/analista';
import { faltandoNaFicha, textoParaIa, type CampoFicha, type FichaLaura, type MensagemParaIa } from '@/lib/whatsapp/ia/regras';

export interface SituacaoView {
    codigo: CodigoSituacao;
    rotulo: string;
    resumo: string;
    /** null quando o analista disse "nada" ou não disse. */
    proximaAcao: string | null;
    quando: string | null;
    analisadaEm: string | null;
    confianca: 'alta' | 'media' | 'baixa' | null;
}

const texto = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** wa_conversas.situacao pode vir como objeto (jsonb) ou como texto JSON. */
export function situacaoDoBanco(bruto: unknown): SituacaoView | null {
    let o: unknown = bruto;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return null; } }
    if (!o || typeof o !== 'object') return null;
    const s = o as Record<string, unknown>;
    const codigo = (SITUACOES as readonly string[]).includes(String(s.situacao)) ? (s.situacao as CodigoSituacao) : null;
    if (!codigo) return null;
    const resumo = texto(s.resumo, 220);
    const prox = texto(s.proximaAcao ?? s.proxima_acao, 260);
    const conf = s.confianca;
    return {
        codigo,
        rotulo: ROTULO_SITUACAO[codigo],
        resumo,
        proximaAcao: prox && prox.toLowerCase() !== 'nada' ? prox : null,
        quando: texto(s.quando, 20) || null,
        analisadaEm: texto(s.analisadaEm, 40) || null,
        confianca: conf === 'alta' || conf === 'media' || conf === 'baixa' ? conf : null,
    };
}

export interface LinhaFicha { rotulo: string; valor: string }

const PAGAMENTO: Record<string, string> = { a_vista: 'À vista', financiado: 'Financiado', troca: 'Troca', nao_sabe: 'Ainda não sabe' };

/** O que o cliente já disse, em linhas curtas para a tela. */
export function fichaEmLinhas(f: FichaLaura | null | undefined): LinhaFicha[] {
    if (!f) return [];
    const out: LinhaFicha[] = [];
    const add = (rotulo: string, valor: unknown) => { const v = texto(valor, 120); if (v) out.push({ rotulo, valor: v }); };
    add('Quer', f.carro_interesse);
    add('Pagamento', f.forma_pagamento ? PAGAMENTO[f.forma_pagamento] || f.forma_pagamento : '');
    add('Entrada', f.entrada);
    if (f.tem_troca === false) add('Troca', 'Não tem carro na troca');
    else if (f.troca) {
        const t = f.troca;
        add('Troca', [t.marca, t.modelo, t.ano, t.km, t.cor].map(x => texto(x, 40)).filter(Boolean).join(' · '));
    }
    add('Prazo', f.prazo);
    add('Cidade', f.cidade);
    return out;
}

const CURTO: Record<CampoFicha, string> = {
    nome: 'nome', carro_interesse: 'carro', forma_pagamento: 'pagamento', entrada: 'entrada', troca: 'troca', prazo: 'prazo', cidade: 'cidade',
};

/** O que a Laura ainda não descobriu. */
export function faltaPerguntar(f: FichaLaura | null | undefined): string[] {
    return faltandoNaFicha(f || {}).map(c => CURTO[c]);
}

export interface MsgBanco {
    autor: string; tipo: string; texto: string | null; legenda: string | null; transcricao: string | null;
    midia_nome: string | null; apagada_em: string | null; criada_em: string;
}
export interface MensagemView { de: 'cliente' | 'laura' | 'vendedor'; texto: string; quando: string }

/** Últimas mensagens em ordem de leitura (a mais antiga primeiro). Aceita as linhas em qualquer ordem. */
export function mensagensRecentes(linhas: MsgBanco[], limite = 5): MensagemView[] {
    const lidas: MensagemView[] = [];
    for (const m of linhas) {
        if (m.autor !== 'cliente' && m.autor !== 'laura' && m.autor !== 'vendedor') continue;
        const t = textoParaIa({
            autor: m.autor, tipo: m.tipo, texto: m.texto, legenda: m.legenda, transcricao: m.transcricao,
            midiaNome: m.midia_nome, apagadaEm: m.apagada_em, criadaEm: m.criada_em,
        } as MensagemParaIa);
        if (t) lidas.push({ de: m.autor, texto: t.slice(0, 280), quando: m.criada_em });
    }
    return lidas.sort((a, b) => a.quando.localeCompare(b.quando)).slice(-limite);
}

/** Id usado na lista ("crm26_4232", "main_<uuid>") → uid da view ("tabela:id"). null = não reconhecido. */
export function uidDoIdDaLista(id: string): string | null {
    const s = decodeURIComponent(id || '').trim();
    if (!s) return null;
    if (s.includes(':')) return s;
    if (s.startsWith('crm26_')) return `leads_distribuicao_crm_26:${s.slice(6)}`;
    if (s.startsWith('main_')) return `leads_manos_crm:${s.slice(5)}`;
    if (s.startsWith('master_')) return `leads_master:${s.slice(7)}`;
    return null;
}
