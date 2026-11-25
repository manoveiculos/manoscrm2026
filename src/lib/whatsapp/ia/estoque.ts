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
    /**
     * O MESMO modelo que o cliente pediu existe, mas fora do filtro (câmbio, ano ou preço).
     * Ex.: pediu "Civic até 50 mil" e há Civic por 65.900. A Laura tem de contar isso, não dizer "não temos".
     */
    foraDoFiltro?: (CarroParaIa & { diferenca: string })[];
}

/** "automático", "Aut.", "CVT" → 'auto'; "manual", "Mec." → 'manual'; o resto → null (desconhecido). */
export function tipoDeCambio(s: string | null | undefined): 'auto' | 'manual' | null {
    const t = norm(s).trim();
    if (!t) return null;
    if (/\b(manual|mec|mecanico)\b/.test(t)) return 'manual';
    if (/auto|cvt|dct|dsg|tiptronic|\bat\b/.test(t)) return 'auto';
    return null;
}

/** Palavras da versão que muitos carros têm: nunca bastam para dizer que um carro "bate" com o pedido. */
const GENERICAS = /^(automatic|automatico|automatica|manual|aut|cvt|mec|mecanico|\d+v|\d+p|\d+x\d+|flex|flexone|tflex|gasolina|alcool|etanol|diesel|turbo|tb|tsi|tdi|tfsi|hibrido|eletrico|cd|cs|ce|cab|cabine|dupla|simples|portas?|completo|basico|vermelh[oa]|pret[oa]|branc[oa]|prata|cinza|azul|verde|amarel[oa]|marrom|bege|dourad[oa]|vinho|laranja|grafite|chumbo|cor|unico|dono|km|motor|versao|sedan|seda|hatch)$/;

/** A consulta diz algo concreto (marca, modelo ou tipo)? "carro", "um", "automático", "flex", cor etc. não contam. */
export function temCriterio(consulta: string | null | undefined): boolean {
    return carroceriasPedidas(consulta).length > 0 || palavras(semPalavrasDeCarroceria(consulta)).some(t => !GENERICAS.test(t));
}

/** Só carro com marca, modelo e preço entra (o resto a Laura não pode oferecer). */
export function buscarNoEstoque(estoque: AltimusVehicle[], f: FiltroEstoque, limite = 5): ResultadoEstoque {
    const validos = estoque.filter(v => v.marca && v.modelo && v.preco);
    // "quero um SUV automático": o tipo filtra, o resto (marca, modelo, ano) pontua
    const tipos: Carroceria[] = carroceriasPedidas(f.consulta);
    const tokens = palavras(tipos.length ? semPalavrasDeCarroceria(f.consulta) : (f.consulta || ''));
    const tiposPedidos = tipos.map(c => ROTULO_CARROCERIA[c]);
    // Câmbio: compara por tipo (auto × manual). Carro com câmbio desconhecido NÃO é descartado.
    const cambio = tipoDeCambio(f.cambio);
    const cambioDo = (v: AltimusVehicle) => tipoDeCambio(v.cambio) ?? tipoDeCambio(v.versao);
    const motivoFora = (v: AltimusVehicle): string | null => {
        if (tipos.length && !tipos.includes(carroceriaDoModelo(v.marca, v.modelo, v.versao) as Carroceria)) return 'carroceria diferente da pedida';
        if (f.precoMax && (v.preco || 0) > f.precoMax * 1.05) return 'preço acima do que o cliente disse';
        if (f.anoMin && (v.ano || 0) < f.anoMin) return 'ano abaixo do que o cliente pediu';
        const c = cambioDo(v);
        if (cambio && c && c !== cambio) return c === 'manual' ? 'câmbio manual' : 'câmbio automático';
        return null;
    };
    const passaFiltro = (v: AltimusVehicle) => motivoFora(v) === null;
    // Câmbio, motor, combustível, cor, portas: não identificam carro. "16V" casava Kia Soul com Fiat Toro (25/11/2026).
    // O câmbio continua valendo pelo filtro; o resto só não conta como "acerto".
    const tokensModelo = tokens.filter(t => !GENERICAS.test(t));
    const acertosDe = (v: AltimusVehicle) => {
        const texto = norm(`${v.marca} ${v.modelo} ${v.versao || ''}`).split(/\s+/);
        return tokensModelo.filter(t => texto.some(p => p === t || p.startsWith(t))).length;
    };

    // Frase do anúncio ("Kia Soul 1.6 16V Flex automático vermelho"): "flex", "16v", a cor batem em meio pátio.
    // Se algum carro bate no MODELO pedido, só ele conta; senão, a marca; senão, qualquer palavra.
    const bateEm = (campo: string, v: AltimusVehicle) => {
        const ws = norm(campo === 'modelo' ? v.modelo : v.marca).split(/\s+/).filter(Boolean);
        return tokensModelo.some(t => ws.some(w => w === t || (t.length >= 3 && w.startsWith(t))));
    };
    const focar = <T extends { v: AltimusVehicle; acertos: number }>(lista: T[]): T[] => {
        const com = lista.filter(x => x.acertos > 0);
        const porModelo = com.filter(x => bateEm('modelo', x.v));
        if (porModelo.length) return porModelo;
        const porMarca = com.filter(x => bateEm('marca', x.v));
        return porMarca.length ? porMarca : com;
    };

    const pontuados = validos
        .filter(passaFiltro)
        .map(v => ({ v, acertos: acertosDe(v) }));

    const encontrados = tokensModelo.length
        ? focar(pontuados)
            .sort((a, b) => b.acertos - a.acertos || (b.v.ano || 0) - (a.v.ano || 0))
            .slice(0, limite).map(x => carroParaIa(x.v))
        : pontuados.slice(0, limite).map(x => carroParaIa(x.v));

    if (encontrados.length) return { encontrados, parecidos: [], tiposPedidos };

    // O modelo pedido existe, só não passa no filtro (câmbio, ano, preço): a Laura precisa saber.
    const foraDoFiltro = tokensModelo.length
        ? focar(validos.map(v => ({ v, acertos: acertosDe(v), motivo: motivoFora(v) })))
            .filter(x => x.motivo)
            .sort((a, b) => b.acertos - a.acertos || (b.v.ano || 0) - (a.v.ano || 0))
            .slice(0, 3).map(x => ({ ...carroParaIa(x.v), diferenca: x.motivo as string }))
        : [];

    // Nada bateu: oferece opções na mesma faixa de preço (ou as primeiras do feed).
    const alvo = f.precoMax || null;
    const parecidos = (alvo
        ? validos.filter(v => (v.preco || 0) <= alvo * 1.1).sort((a, b) => (b.preco || 0) - (a.preco || 0))
        : validos
    ).slice(0, limite).map(carroParaIa);
    // "Sem nenhum desse tipo" só quando a loja não tem MESMO nenhum (e não quando o ano/preço/câmbio é que barrou):
    // antes, "Cruze sedã 2022" virava "nenhum sedã no estoque" com Civic e Fusion no pátio.
    const semNoTipo = tipos.length > 0 && !validos.some(v => tipos.includes(carroceriaDoModelo(v.marca, v.modelo, v.versao) as Carroceria));
    return { encontrados: [], parecidos, tiposPedidos, semNoTipo, ...(foraDoFiltro.length ? { foraDoFiltro } : {}) };
}

export function acharCarro(estoque: AltimusVehicle[], id: string): AltimusVehicle | null {
    const alvo = (id || '').trim();
    if (!alvo) return null;
    return estoque.find(v => idDoCarro(v) === alvo) || null;
}
