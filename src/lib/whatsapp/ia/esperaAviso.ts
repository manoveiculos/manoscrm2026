// src/lib/whatsapp/ia/esperaAviso.ts — regras PURAS do aviso "o carro que você procurava entrou"

import type { AltimusVehicle } from '@/lib/services/altimusInventory';
import { MARCAS, MODELOS } from '@/lib/identificacao/nome';
import { buscarNoEstoque, carroParaIa, temCriterio } from './estoque';

export interface PedidoDoBanco {
    id: string;
    telefone_key: string;
    lead_uid: string | null;
    conversa_id: string | null;
    consultor_id: string | null;
    nome_cliente: string | null;
    texto_original: string;
    marca?: string | null;
    modelo?: string | null;
    carroceria?: string | null;
    ano_min: number | null;
    preco_max: number | null;
    cambio: string | null;
}

const norm = (s: string | null | undefined) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const chave = (s: string | null | undefined) => norm(s).replace(/[^a-z0-9]/g, '');
const CHAVES_MODELO = new Set(MODELOS.map(chave));
const CHAVES_MARCA = new Set(MARCAS.map(chave));

/** Modelo do carro do feed pela 1ª palavra ("T-Cross" → "tcross", "Soul" → "soul"). */
const modeloDoCarro = (v: AltimusVehicle) => chave((v.modelo || '').trim().split(/\s+/)[0]);

/** Modelos que o pedido cita: a coluna modelo e os modelos conhecidos no texto ("Gol, Celta ou Corsa" → 3). */
export function modelosDoPedido(p: Pick<PedidoDoBanco, 'texto_original' | 'modelo'>): string[] {
    const out = new Set<string>();
    if (p.modelo?.trim()) out.add(chave(p.modelo.trim().split(/\s+/)[0]));
    const ws = norm(p.texto_original).split(/[^a-z0-9-]+/).filter(Boolean);
    for (let i = 0; i < ws.length; i++) {
        const duas = i + 1 < ws.length ? chave(ws[i] + ws[i + 1]) : '';   // "t cross", "hr v"
        if (duas && CHAVES_MODELO.has(duas)) { out.add(duas); i++; continue; }
        const uma = chave(ws[i]);
        // "Onix 2008" é ano, não o Peugeot 2008 (só vale como modelo logo depois de "peugeot")
        if (/^(19|20)\d\d$/.test(uma) && ws[i - 1] !== 'peugeot') continue;
        if (CHAVES_MODELO.has(uma) && !CHAVES_MARCA.has(uma)) out.add(uma);
    }
    return [...out];
}

function marcaDoPedido(p: Pick<PedidoDoBanco, 'texto_original' | 'marca'>): string | null {
    if (p.marca?.trim()) return chave(p.marca);
    return norm(p.texto_original).split(/[^a-z0-9-]+/).map(chave).find(w => CHAVES_MARCA.has(w)) ?? null;
}

/**
 * Carro novo casa com o pedido?
 *  - pedido que cita modelo (Soul, Gol, Cruze…): só o MESMO modelo serve;
 *  - só marca ("um Jeep"): só a mesma marca;
 *  - só tipo/faixa ("SUV até 80 mil"): regras da busca da Laura.
 * Depois valem ano, preço (+5%) e câmbio. Antes bastava UMA palavra em comum: em 25/11/2026 cinco
 * clientes do Kia Soul ("1.6 16V Flex Aut.") receberam aviso de uma Fiat Toro ("2.2 16V ... Aut.") por causa do "16V".
 */
export function pedidoCombina(p: PedidoDoBanco, v: AltimusVehicle): boolean {
    const modelos = modelosDoPedido(p);
    const marca = modelos.length ? null : marcaDoPedido(p);
    if (!modelos.length && !marca && !p.carroceria && !temCriterio(p.texto_original)) return false;
    if (modelos.length && !modelos.includes(modeloDoCarro(v))) return false;
    if (marca && chave(v.marca) !== marca) return false;
    const consulta = modelos.length ? v.modelo : marca ? v.marca : [p.carroceria, p.texto_original].filter(Boolean).join(' ');
    return buscarNoEstoque([v], {
        consulta,
        precoMax: p.preco_max && p.preco_max > 0 ? Number(p.preco_max) : null,
        anoMin: p.ano_min && p.ano_min > 1950 ? p.ano_min : null,
        cambio: p.cambio,
    }, 1).encontrados.length > 0;
}

/** Texto fixo (sem IA): só repete o que o feed diz, na forma que a Laura usa. */
export function mensagemDeAviso(p: PedidoDoBanco, v: AltimusVehicle): string {
    const c = carroParaIa(v);
    const primeiro = (p.nome_cliente || '').trim().split(/\s+/)[0];
    const oi = primeiro ? `Oi, ${primeiro}!` : 'Oi!';
    const dados = [c.ano ? String(c.ano) : null, c.km, c.preco].filter(Boolean).join(' · ');
    return `${oi} Aqui é a Laura, da Manos Veículos. Lembra que você procurava ${p.texto_original.trim()}? `
        + `Acabou de entrar um aqui na loja: ${c.carro}${dados ? ` (${dados})` : ''}. `
        + `Quer que eu te mande as fotos ou já marcamos uma visita?`;
}
