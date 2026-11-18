// src/lib/espera/ranking.ts — ranking de demanda não atendida (PURO)
//
// "12 pessoas querem SUV automático": agrupa os pedidos que seguem aguardando pela mesma chave
// (marca+modelo+tipo) e ordena por número de pessoas. É o que o time de compras precisa ver.

export interface PedidoLinha {
    id: string;
    chave: string;
    texto_original: string;
    telefone_key: string;
    preco_max: number | null;
    criado_em: string;
    status: string;
}

export interface DemandaLinha {
    chave: string;
    carro: string;
    pessoas: number;
    maisAntigoDias: number;
    /** Média do teto de preço dos que disseram; null se ninguém disse. */
    precoMedio: number | null;
}

export function rankingDeDemanda(pedidos: PedidoLinha[], agora: Date = new Date()): DemandaLinha[] {
    const grupos = new Map<string, PedidoLinha[]>();
    for (const p of pedidos) {
        if (p.status !== 'aguardando') continue;
        const g = grupos.get(p.chave);
        if (g) g.push(p); else grupos.set(p.chave, [p]);
    }
    const linhas: DemandaLinha[] = [];
    for (const [chave, g] of grupos) {
        const pessoas = new Set(g.map(p => p.telefone_key)).size;
        const antigo = Math.min(...g.map(p => new Date(p.criado_em).getTime()));
        const precos = g.map(p => Number(p.preco_max)).filter(n => n > 0);
        linhas.push({
            chave,
            carro: g[0].texto_original,
            pessoas,
            maisAntigoDias: Math.max(0, Math.floor((agora.getTime() - antigo) / 86_400_000)),
            precoMedio: precos.length ? Math.round(precos.reduce((a, b) => a + b, 0) / precos.length) : null,
        });
    }
    return linhas.sort((a, b) => b.pessoas - a.pessoas || b.maisAntigoDias - a.maisAntigoDias);
}
