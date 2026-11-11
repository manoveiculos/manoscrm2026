// src/lib/estoque/index.ts — FUNÇÃO ÚNICA DE ESTOQUE (SÓ SERVIDOR)
//
// Decisão do Alexandre (06/11/2026): o estoque é sempre puxado pela API de
// integração (feed da Altimus). A tabela `estoque` do CRM está OBSOLETA — em 06/11
// tinha 3 preços errados, 6 carros que já saíram e faltavam 14 carros da loja.
//
// Regras:
//  - cache de 10 min (altimusInventory);
//  - Altimus fora do ar → última cópia boa, marcada "desatualizado";
//  - NUNCA cai de volta na tabela `estoque`;
//  - nenhum outro arquivo deve fazer from('estoque'): use isto.
// Especificação: docs/growth360/estoque-via-api.md (pasta do Growth 360).

import { getInventoryInfo, type AltimusVehicle } from '@/lib/services/altimusInventory';
import { ehMoto } from '@/lib/qualificacao';

export interface CarroEstoque {
    /** id do carro no feed (id_externo). */
    id: string;
    /** Descrição exata para falar com o cliente: marca, modelo, versão e ano. */
    descricao: string;
    marca: string;
    modelo: string;
    versao: string | null;
    ano: number | null;
    km: number | null;
    cor: string | null;
    cambio: string | null;
    combustivel: string | null;
    preco: number | null;
    opcionais: string[];
    fotos: string[];
    link: string | null;
}

export interface EstadoEstoque {
    carros: CarroEstoque[];
    /** A Altimus não respondeu: a lista é a última cópia boa (ou vazia se nunca houve). */
    desatualizado: boolean;
    /** ISO de quando a lista foi lida da Altimus; null = nunca. */
    atualizadoEm: string | null;
}

export function paraCarroEstoque(v: AltimusVehicle): CarroEstoque {
    const id = v.id_externo ? String(v.id_externo) : `${v.marca}-${v.modelo}-${v.ano ?? ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return {
        id,
        descricao: [v.marca, v.modelo, v.versao, v.ano].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
        marca: v.marca,
        modelo: v.modelo,
        versao: v.versao ?? null,
        ano: v.ano ?? null,
        km: v.km ?? null,
        cor: v.cor ?? null,
        cambio: v.cambio ?? null,
        combustivel: v.combustivel ?? null,
        preco: v.preco ?? null,
        opcionais: v.opcionais ?? [],
        fotos: v.fotos ?? [],
        link: v.link ?? null,
    };
}

/** Estoque atual com o aviso de "desatualizado". */
export async function estoqueAtual(forceRefresh = false): Promise<EstadoEstoque> {
    const e = await getInventoryInfo(forceRefresh);
    return {
        carros: e.vehicles.map(paraCarroEstoque),
        desatualizado: e.desatualizado,
        atualizadoEm: e.copiaDe ? new Date(e.copiaDe).toISOString() : null,
    };
}

/** Só os veículos no formato do feed (para quem já usa AltimusVehicle). */
export async function veiculosDoEstoque(): Promise<AltimusVehicle[]> {
    return (await getInventoryInfo()).vehicles;
}

/** Preços anunciados (R$), para o filtro de "preço diferente do anunciado". */
export async function precosAnunciadosDoEstoque(): Promise<number[]> {
    return (await veiculosDoEstoque()).map(v => v.preco).filter((n): n is number => typeof n === 'number' && n > 0);
}

/** Preço do carro mais barato à venda. Motos ficam de fora (uma Biz não é piso de quem quer carro). */
export async function pisoDoEstoque(): Promise<number | null> {
    const precos = (await veiculosDoEstoque())
        .filter(v => !ehMoto(`${v.marca || ''} ${v.modelo || ''}`))
        .map(v => v.preco)
        .filter((n): n is number => typeof n === 'number' && n >= 5000);
    return precos.length ? Math.min(...precos) : null;
}

const norm = (s: string | null | undefined) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Busca no estoque: `id` exato, ou `busca` em texto livre (todas as palavras úteis
 * precisam aparecer em marca + modelo + versão + ano + cor). Sem `busca` nem `id`
 * devolve o estoque todo, até `limite`. Nada encontrado = lista vazia (nunca inventa).
 */
export function filtrarEstoque(carros: CarroEstoque[], p: { busca?: string | null; id?: string | null; limite?: number | null }): CarroEstoque[] {
    const limite = Math.min(Math.max(Math.floor(Number(p.limite) || 10), 1), 50);
    const id = (p.id || '').trim();
    if (id) return carros.filter(c => c.id === id).slice(0, limite);
    const palavras = norm(p.busca).split(' ').filter(t => t.length >= 2 && !PARADAS.has(t));
    if (!palavras.length) return carros.slice(0, limite);
    return carros
        .map(c => {
            const texto = ` ${norm(`${c.marca} ${c.modelo} ${c.versao || ''} ${c.ano ?? ''} ${c.cor || ''} ${c.cambio || ''} ${c.combustivel || ''}`)} `;
            const achadas = palavras.filter(t => texto.includes(` ${t}`)).length;
            return { c, achadas };
        })
        .filter(x => x.achadas === palavras.length)
        .sort((a, b) => (b.c.ano || 0) - (a.c.ano || 0))
        .slice(0, limite)
        .map(x => x.c);
}

const PARADAS = new Set(['um', 'uma', 'o', 'a', 'os', 'as', 'de', 'da', 'do', 'com', 'tem', 'temos', 'quero', 'carro', 'veiculo', 'moto', 'ainda', 'voces', 'vcs']);
