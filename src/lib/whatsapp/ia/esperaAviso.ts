// src/lib/whatsapp/ia/esperaAviso.ts — regras PURAS do aviso "o carro que você procurava entrou"

import type { AltimusVehicle } from '@/lib/services/altimusInventory';
import { buscarNoEstoque, carroParaIa, temCriterio } from './estoque';

export interface PedidoDoBanco {
    id: string;
    telefone_key: string;
    lead_uid: string | null;
    conversa_id: string | null;
    consultor_id: string | null;
    nome_cliente: string | null;
    texto_original: string;
    ano_min: number | null;
    preco_max: number | null;
    cambio: string | null;
}

/** Carro novo casa com o pedido? Mesmas regras da busca da Laura (tipo, nome, ano, preço +5%, câmbio). */
export function pedidoCombina(p: PedidoDoBanco, v: AltimusVehicle): boolean {
    if (!temCriterio(p.texto_original)) return false;
    return buscarNoEstoque([v], {
        consulta: p.texto_original,
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
