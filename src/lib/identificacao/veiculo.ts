// src/lib/identificacao/veiculo.ts — reconhece o CARRO DE INTERESSE (PURO)
//
// Fontes, da mais confiável para a menos (spec, seção 3):
//   1. link do carro na mensagem do botão do site (/veiculos/<slug>/ ou /veiculo/<id>)
//   2. anúncio de origem (utm_params.headline/body do Click-to-WhatsApp, E04)
//   3. a Laura confirmou no estoque (ferramenta salvar_ficha com veiculo_id)
//   4. o cliente citou modelo e ano
// NUNCA o carro de troca ("tenho um Gol 2012 pra dar na troca").

import type { AltimusVehicle } from '@/lib/services/altimusInventory';
import { interesseGenerico } from '@/lib/qualificacao';
import { MARCAS, MODELOS } from './nome';

export type OrigemCarro = 'link_site' | 'anuncio' | 'laura_estoque' | 'cliente_citou' | 'anterior';

export interface CarroInteresse {
    /** Como aparece na tela: nome exato do feed (marca, modelo, versão e ano) ou "Modelo Ano". */
    descricao: string;
    /** Modelo normalizado ("onix", "tcross"): chave para não repetir. */
    modeloChave: string;
    ano: number | null;
    /** id do carro no feed da Altimus (id_externo), quando está no estoque. */
    codigoFeed: string | null;
    emEstoque: boolean;
    origem: OrigemCarro;
    trecho: string;
}

const norm = (s: string | null | undefined) =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const chaveModelo = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

/** "Analisar Perfil", "Lead Google - Não especificado", "Não especificado", vazio… */
export function interesseVazio(v: string | null | undefined): boolean {
    return interesseGenerico(v);
}

export function descricaoDoFeed(v: AltimusVehicle): string {
    return [v.marca, v.modelo, v.versao, v.ano].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function modeloDoFeed(v: AltimusVehicle): string {
    // 1ª palavra inteira: "T-Cross" → "tcross", "HR-V" → "hrv", "HB20S" → "hb20s"
    return chaveModelo((v.modelo || '').trim().split(/\s+/)[0] || v.modelo);
}

function doFeed(v: AltimusVehicle, origem: OrigemCarro, trecho: string): CarroInteresse {
    return {
        descricao: descricaoDoFeed(v), modeloChave: modeloDoFeed(v), ano: v.ano ?? null,
        codigoFeed: v.id_externo ? String(v.id_externo) : null, emEstoque: true, origem, trecho: trecho.slice(0, 200),
    };
}

// ---------------------------------------------------------------------------
// 1. Link do site
// ---------------------------------------------------------------------------

const LINK = /manosveiculos\.com\.br\/(veiculos?)\/([a-z0-9-]+)/i;

/** Resolve o link do botão do site no feed. "/veiculo/4422425" pelo id; "/veiculos/<slug>/" pelas palavras. */
export function carroDoLinkDoSite(texto: string | null | undefined, estoque: AltimusVehicle[]): CarroInteresse | null {
    const m = (texto || '').match(LINK);
    if (!m) return null;
    const trecho = m[0];
    if (m[1].toLowerCase() === 'veiculo' && /^\d+$/.test(m[2])) {
        const v = estoque.find(x => String(x.id_externo) === m[2]);
        return v ? doFeed(v, 'link_site', trecho) : null;
    }
    const slug = tokens(m[2]);
    const anosSlug = slug.filter(t => /^(19|20)\d\d$/.test(t)).map(Number);
    let melhor: { v: AltimusVehicle; pontos: number } | null = null;
    for (const v of estoque) {
        const modelo = modeloDoFeed(v);
        if (!slug.some(t => chaveModelo(t) === modelo)) continue;
        if (anosSlug.length && !anosSlug.includes(v.ano ?? -1) && !anosSlug.includes(v.anoFabricacao ?? -1)) continue;
        const doCarro = new Set(tokens(`${v.marca} ${v.modelo} ${v.versao || ''} ${v.cor || ''} ${v.ano ?? ''} ${v.anoFabricacao ?? ''}`));
        const pontos = slug.filter(t => doCarro.has(t)).length;
        if (!melhor || pontos > melhor.pontos) melhor = { v, pontos };
    }
    return melhor ? doFeed(melhor.v, 'link_site', trecho) : null;
}

// ---------------------------------------------------------------------------
// 2 e 4. Modelo e ano citados (mensagem do cliente ou título do anúncio)
// ---------------------------------------------------------------------------

const MODELOS_CHAVE = [...new Set(MODELOS.map(chaveModelo))].filter(m => m.length >= 2);
const MARCAS_CHAVE = new Set(MARCAS.map(chaveModelo));

/** "Corolla" → "Corolla"; "hrv" → "HR-V"; "t-cross" → "T-Cross". */
function nomeBonito(modeloChave: string): string {
    const original = MODELOS.find(m => chaveModelo(m) === modeloChave) || modeloChave;
    if (/^[a-z]{1,3}\d/i.test(original) || original.length <= 3) return original.toUpperCase();
    return original.split(/([- ])/).map(p => (p.length > 1 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join('');
}

// Palavras antes do modelo que indicam carro DO CLIENTE (troca), não interesse.
//   "meu gol", "minha strada 2015", "meu carro é um HB20", "tenho um Gol",
//   "dou meu Uno", "na troca", "vendo o Palio"
const DONO: RegExp[] = [
    /\b(meu|minha)\s+(?:\S+\s+)?$/,
    /\b(meu|minha)\s+(carro|moto|veiculo|caminhonete|atual|usado)\b/,
    /\b(tenho|possuo|tinha)\s+(um|uma|o|a)\b/,
    /\b(na|de|pra|para|em)\s+troca\b/,
    /\b(dar|dou|daria|vender|vendo|venderia)\b/,
];
// "trocar meu Gol NO Onix", "entra na troca DO Cruze": o carro depois é o de interesse
const TROCA_POR = /\b(trocar|troco|troca)\b.*\b(no|na|num|numa|pelo|pela|do|da|por\s+um|por\s+uma)\s+(?:\S+\s+)?$/;

/**
 * Carros citados num texto. Exige modelo; com ano casa com o feed (ou entra como
 * fora do estoque); sem ano, só entra se o feed tiver exatamente um carro daquele
 * modelo. Ignora o que parece carro de troca.
 */
export function carrosCitados(
    texto: string | null | undefined,
    estoque: AltimusVehicle[],
    origem: 'cliente_citou' | 'anuncio' = 'cliente_citou',
): CarroInteresse[] {
    const bruto = (texto || '').slice(0, 1000);
    if (!bruto.trim()) return [];
    const out: CarroInteresse[] = [];
    for (const frase of bruto.split(/[\n.!?;]+/)) {
        const t = norm(frase).replace(/\s+/g, ' ');
        const palavras = t.split(/[^a-z0-9-]+/).filter(Boolean);
        for (let i = 0; i < palavras.length; i++) {
            const k = chaveModelo(palavras[i]);
            const k2 = i + 1 < palavras.length ? chaveModelo(palavras[i] + palavras[i + 1]) : '';
            const modelo = MODELOS_CHAVE.includes(k2) && k2 !== k ? k2 : MODELOS_CHAVE.includes(k) ? k : null;
            if (!modelo || MARCAS_CHAVE.has(modelo) && !MODELOS_CHAVE.includes(modelo)) continue;
            // carro de troca?
            const antes = palavras.slice(Math.max(0, i - 6), i).join(' ') + ' ';
            if (origem === 'cliente_citou' && DONO.some(rx => rx.test(antes)) && !TROCA_POR.test(antes)) continue;
            // ano logo depois (até 4 palavras) ou logo antes (até 2)
            const perto = [...palavras.slice(i + 1, i + 5), ...palavras.slice(Math.max(0, i - 2), i)];
            const anoTxt = perto.find(p => /^(19[89]\d|20[0-3]\d)$/.test(p));
            const ano = anoTxt ? Number(anoTxt) : null;
            const doModelo = estoque.filter(v => v.marca && v.modelo && modeloDoFeed(v) === modelo);
            const trecho = frase.trim().slice(0, 200);
            let achado: CarroInteresse | null = null;
            if (ano != null) {
                const v = doModelo.find(x => x.ano === ano || x.anoFabricacao === ano);
                if (v) achado = doFeed(v, origem, trecho);
                else {
                    const marca = doModelo[0]?.marca;
                    achado = {
                        descricao: [marca, nomeBonito(modelo), ano].filter(Boolean).join(' '),
                        modeloChave: modelo, ano, codigoFeed: null, emEstoque: false, origem, trecho,
                    };
                }
            } else if (doModelo.length === 1) {
                achado = doFeed(doModelo[0], origem, trecho);
            }
            if (achado && !out.some(c => c.modeloChave === achado!.modeloChave && c.ano === achado!.ano)) out.push(achado);
        }
    }
    return out;
}

/** Título e texto do anúncio que trouxe o lead (utm_params do E04). */
export function carroDoAnuncio(utm: Record<string, unknown> | null | undefined, estoque: AltimusVehicle[]): CarroInteresse | null {
    if (!utm || typeof utm !== 'object') return null;
    const texto = [utm.headline, utm.body, utm.ad_name, utm.utm_content].filter(x => typeof x === 'string').join('\n');
    return carrosCitados(texto, estoque, 'anuncio')[0] ?? null;
}

// ---------------------------------------------------------------------------
// Como o interesse aparece na tela (mesma regra da função do banco)
// ---------------------------------------------------------------------------

export interface ItemInteresse {
    descricao: string;
    origem: OrigemCarro;
    /** ISO; mais recente primeiro */
    quando: string;
    oculto?: boolean;
}

/** Até 3 carros, o mais recente primeiro; o que já estava no lead ("anterior") nunca sai. */
export function comporInteresse(itens: ItemInteresse[]): string {
    const visiveis = itens.filter(i => !i.oculto).sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));
    const anteriores = visiveis.filter(i => i.origem === 'anterior');
    const doCrm = visiveis.filter(i => i.origem !== 'anterior').slice(0, Math.max(0, 3 - anteriores.length));
    const escolhidos = new Set([...anteriores, ...doCrm]);
    return visiveis.filter(i => escolhidos.has(i)).map(i => i.descricao).join(' · ');
}

/** Mesmo carro? Todas as palavras do texto menor estão no maior ("Onix 2018" ⊂ "Chevrolet Onix LTZ 2018"). */
export function mesmoCarro(a: string, b: string): boolean {
    const ta = tokens(a).filter(t => t.length >= 2), tb = tokens(b).filter(t => t.length >= 2);
    if (!ta.length || !tb.length) return false;
    const [menor, maior] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
    return menor.every(t => maior.has(t));
}
