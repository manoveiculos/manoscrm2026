// src/lib/whatsapp/ia/estoque.ts — busca no estoque para a Laura (PURO)
//
// Recebe a lista do feed da Altimus (getInventory) e devolve no máximo 5 carros,
// com preço e km já escritos do jeito que a Laura tem de repetir.

import type { AltimusVehicle } from '@/lib/services/altimusInventory';
import { ROTULO_CARROCERIA, carroceriaDoModelo, carroceriasPedidas, semPalavrasDeCarroceria, type Carroceria } from '@/lib/vocabulario/carros';

export interface CarroParaIa {
    id: string;
    carro: string;
    ano: number | null;
    preco: string | null;
    km: string | null;
    cambio: string | null;
    cor: string | null;
    fotos: number;
    /** Tipo de carroceria (SUV, sedã, hatch, picape…). null = não reconhecido: a Laura não afirma o tipo. */
    tipo: string | null;
}

const PARADAS = new Set([
    'um', 'uma', 'o', 'a', 'os', 'as', 'de', 'da', 'do', 'e', 'ou', 'tem', 'tenho', 'quero', 'procuro',
    'qualquer', 'algum', 'meu', 'pra', 'para', 'por', 'com', 'ate', 'mil', 'reais', 'ano',
    'novo', 'usado', 'seminovo', 'carro', 'veiculo', 'auto', 'modelo', 'esse', 'este', 'aquele',
]);

const norm = (s: string | null | undefined) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ');

function palavras(s: string): string[] {
    return norm(s).split(/\s+/).filter(t => t.length >= 2 && !PARADAS.has(t) && !/^\d+$/.test(t));
}

export function idDoCarro(v: AltimusVehicle): string {
    if (v.id_externo) return String(v.id_externo);
    return norm(`${v.marca} ${v.modelo} ${v.ano ?? ''} ${v.preco ?? ''}`).trim().replace(/\s+/g, '-');
}

export function carroParaIa(v: AltimusVehicle): CarroParaIa {
    return {
        id: idDoCarro(v),
        carro: [v.marca, v.modelo, v.versao].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
        ano: v.ano ?? null,
        preco: v.preco ? `R$ ${v.preco.toLocaleString('pt-BR')}` : null,
        km: v.km != null ? `${v.km.toLocaleString('pt-BR')} km` : null,
        cambio: v.cambio || null,
        cor: v.cor || null,
        fotos: v.fotos?.length || 0,
        tipo: (() => { const c = carroceriaDoModelo(v.marca, v.modelo, v.versao); return c ? ROTULO_CARROCERIA[c] : null; })(),
    };
}

export interface FiltroEstoque {
    consulta?: string | null;
    precoMax?: number | null;
    anoMin?: number | null;
    cambio?: string | null;
}

export interface ResultadoEstoque {
    encontrados: CarroParaIa[];
    /** Quando nada bate: até 5 opções na faixa de preço (ou as mais recentes). */
    parecidos: CarroParaIa[];
    /** Tipo(s) que o cliente pediu (ex.: ["SUV"]). */
    tiposPedidos?: string[];
    /** O cliente pediu um tipo e a loja não tem nenhum agora. */
    semNoTipo?: boolean;
}

/** Só carro com marca, modelo e preço entra (o resto a Laura não pode oferecer). */
export function buscarNoEstoque(estoque: AltimusVehicle[], f: FiltroEstoque, limite = 5): ResultadoEstoque {
    const validos = estoque.filter(v => v.marca && v.modelo && v.preco);
    // "quero um SUV automático": o tipo filtra, o resto (marca, modelo, ano) pontua
    const tipos: Carroceria[] = carroceriasPedidas(f.consulta);
    const tokens = palavras(tipos.length ? semPalavrasDeCarroceria(f.consulta) : (f.consulta || ''));
    const tiposPedidos = tipos.map(c => ROTULO_CARROCERIA[c]);
    const cambio = norm(f.cambio).trim();
    const passaFiltro = (v: AltimusVehicle) =>
        (!tipos.length || tipos.includes(carroceriaDoModelo(v.marca, v.modelo, v.versao) as Carroceria))
        && (!f.precoMax || (v.preco || 0) <= f.precoMax * 1.05)
        && (!f.anoMin || (v.ano || 0) >= f.anoMin)
        && (!cambio || norm(v.cambio).includes(cambio.slice(0, 4)));

    const pontuados = validos
        .filter(passaFiltro)
        .map(v => {
            const texto = norm(`${v.marca} ${v.modelo} ${v.versao || ''}`);
            const acertos = tokens.filter(t => texto.split(/\s+/).some(p => p === t || p.startsWith(t))).length;
            return { v, acertos };
        });

    const encontrados = tokens.length
        ? pontuados.filter(x => x.acertos > 0)
            .sort((a, b) => b.acertos - a.acertos || (b.v.ano || 0) - (a.v.ano || 0))
            .slice(0, limite).map(x => carroParaIa(x.v))
        : pontuados.slice(0, limite).map(x => carroParaIa(x.v));

    if (encontrados.length) return { encontrados, parecidos: [], tiposPedidos };

    // Nada bateu: oferece opções na mesma faixa de preço (ou as primeiras do feed).
    const alvo = f.precoMax || null;
    const parecidos = (alvo
        ? validos.filter(v => (v.preco || 0) <= alvo * 1.1).sort((a, b) => (b.preco || 0) - (a.preco || 0))
        : validos
    ).slice(0, limite).map(carroParaIa);
    return { encontrados: [], parecidos, tiposPedidos, semNoTipo: tipos.length > 0 };
}

export function acharCarro(estoque: AltimusVehicle[], id: string): AltimusVehicle | null {
    const alvo = (id || '').trim();
    if (!alvo) return null;
    return estoque.find(v => idDoCarro(v) === alvo) || null;
}
