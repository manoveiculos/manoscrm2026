// Lógica de cálculo do módulo Repasse (Paulo). Usada pelas rotas de API.
// Regra de ouro: o dinheiro dos CARROS é derivado de repasse_veiculos; a tabela
// repasse_caixa só guarda movimentações manuais (aporte/retirada/despesa) — sem
// contar dinheiro duas vezes.

export const OWNER_REPASSE = 'paulo@manoscrm.com';

// Campos aceitos no cadastro/edição de um veículo e as colunas NOT NULL do banco
export const CAMPOS_VEICULO = [
    'estoque_id_externo', 'marca', 'modelo', 'versao', 'ano', 'placa', 'km', 'cor',
    'tipo_operacao', 'status', 'fornecedor_id', 'comprador_id',
    'valor_compra', 'custos', 'valor_anuncio', 'valor_venda', 'comissao',
    'compra_paga', 'venda_recebida', 'data_compra', 'data_venda', 'obs',
];
const NOT_NULL_VEICULO = new Set(['marca', 'modelo', 'tipo_operacao', 'status', 'valor_compra', 'custos', 'comissao', 'compra_paga', 'venda_recebida']);

// Vazio em coluna NOT NULL → omite (deixa o DEFAULT do banco valer); nuláveis → null
export function sanitizeVeiculo(body: any) {
    const row: Record<string, any> = {};
    for (const k of CAMPOS_VEICULO) {
        if (body[k] === undefined) continue;
        const v = body[k];
        if (v === '' || v === null) { if (NOT_NULL_VEICULO.has(k)) continue; row[k] = null; }
        else row[k] = v;
    }
    return row;
}

// Campos aceitos no cadastro/edição de uma loja/contato
export const CAMPOS_LOJA = ['nome', 'tipo', 'telefone', 'cidade', 'obs'];
const NOT_NULL_LOJA = new Set(['nome', 'tipo']);

export function sanitizeLoja(body: any) {
    const row: Record<string, any> = {};
    for (const k of CAMPOS_LOJA) {
        if (body[k] === undefined) continue;
        const v = body[k];
        if (v === '' || v === null) { if (NOT_NULL_LOJA.has(k)) continue; row[k] = null; }
        else row[k] = v;
    }
    return row;
}

export const num = (v: any) => (v == null || isNaN(Number(v)) ? 0 : Number(v));
export const daysBetween = (a: Date, b: Date) =>
    Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));

const COMPROU_STATUS = ['comprado', 'anunciado', 'vendido'];

export function deriveVeiculo(v: any, hoje = new Date()) {
    const custoTotal = num(v.valor_compra) + num(v.custos);
    const comprou = v.tipo_operacao === 'compra_venda' && COMPROU_STATUS.includes(v.status);
    const vendeu = v.status === 'vendido';
    const lucro = vendeu
        ? (v.tipo_operacao === 'intermediacao'
            ? num(v.comissao)
            : num(v.valor_venda) - num(v.valor_compra) - num(v.custos))
        : null;
    const base = v.data_compra ? new Date(v.data_compra) : (v.created_at ? new Date(v.created_at) : hoje);
    const fim = v.data_venda ? new Date(v.data_venda) : hoje;
    const dias = Math.max(0, daysBetween(base, fim));
    const margem = vendeu && custoTotal > 0 && v.tipo_operacao === 'compra_venda' ? (lucro as number) / custoTotal : null;
    return { ...v, custo_total: custoTotal, comprou, vendeu, lucro, dias, margem };
}

const inMonth = (d: string | null | undefined, hoje: Date) => {
    if (!d) return false;
    const dt = new Date(d);
    return dt.getFullYear() === hoje.getFullYear() && dt.getMonth() === hoje.getMonth();
};

export function computeOverview(veiculos: any[], caixa: any[], hoje = new Date()) {
    const vs = veiculos.map((v) => deriveVeiculo(v, hoje));

    let saidaCarros = 0, entradaCarros = 0, aReceber = 0, aPagar = 0, capitalEmCarros = 0;
    for (const v of vs) {
        if (v.comprou) {
            saidaCarros += (v.compra_paga ? num(v.valor_compra) : 0) + num(v.custos);
            if (!v.compra_paga) aPagar += num(v.valor_compra);
            if (!v.vendeu) capitalEmCarros += v.custo_total;
        }
        if (v.vendeu) {
            const receita = v.tipo_operacao === 'intermediacao' ? num(v.comissao) : num(v.valor_venda);
            if (v.venda_recebida) entradaCarros += receita; else aReceber += receita;
        }
    }

    let entradasManuais = 0, saidasManuais = 0, despesasMes = 0;
    for (const c of caixa) {
        if (c.tipo === 'entrada') entradasManuais += num(c.valor);
        else {
            saidasManuais += num(c.valor);
            if (c.categoria === 'despesa' && inMonth(c.data, hoje)) despesasMes += num(c.valor);
        }
    }

    const saldo = entradaCarros - saidaCarros + entradasManuais - saidasManuais;
    const vendidosMes = vs.filter((v) => v.vendeu && inMonth(v.data_venda, hoje));
    const lucroMesNegocios = vendidosMes.reduce((s, v) => s + (v.lucro || 0), 0);
    const resultadoMes = lucroMesNegocios - despesasMes;

    const emEstoque = vs.filter((v) => v.comprou && !v.vendeu);
    const negociando = vs.filter((v) => v.status === 'negociando');
    const parados = emEstoque.filter((v) => v.dias >= 30);

    return {
        saldo,
        capital_em_carros: capitalEmCarros,
        a_receber: aReceber,
        a_pagar: aPagar,
        mes: {
            lucro_negocios: lucroMesNegocios,
            despesas: despesasMes,
            resultado: resultadoMes,
            negocios: vendidosMes.length,
        },
        carros: {
            total: vs.length,
            estoque: emEstoque.length,
            negociando: negociando.length,
            parados: parados.length,
            vendidos: vs.filter((v) => v.vendeu).length,
        },
        parados: parados
            .sort((a, b) => b.dias - a.dias)
            .map((v) => ({ id: v.id, marca: v.marca, modelo: v.modelo, ano: v.ano, dias: v.dias, custo_total: v.custo_total })),
        totais: {
            entrada_carros: entradaCarros,
            saida_carros: saidaCarros,
            entradas_manuais: entradasManuais,
            saidas_manuais: saidasManuais,
        },
    };
}

// Extrato unificado: movimentos derivados dos carros + movimentos manuais do caixa
export function buildLedger(veiculos: any[], caixa: any[]) {
    const mov: any[] = [];
    for (const v of veiculos) {
        const nome = `${v.marca} ${v.modelo}`.trim();
        const comprou = v.tipo_operacao === 'compra_venda' && COMPROU_STATUS.includes(v.status);
        if (comprou && (num(v.valor_compra) > 0 || num(v.custos) > 0)) {
            mov.push({
                tipo: 'saida', origem: 'carro', categoria: 'compra',
                descricao: `Compra ${nome}`, valor: num(v.valor_compra) + num(v.custos),
                data: v.data_compra || v.created_at, veiculo_id: v.id, pendente: !v.compra_paga,
            });
        }
        if (v.status === 'vendido') {
            const interm = v.tipo_operacao === 'intermediacao';
            mov.push({
                tipo: 'entrada', origem: 'carro', categoria: interm ? 'comissao' : 'venda',
                descricao: `${interm ? 'Comissão' : 'Venda'} ${nome}`,
                valor: interm ? num(v.comissao) : num(v.valor_venda),
                data: v.data_venda || v.created_at, veiculo_id: v.id, pendente: !v.venda_recebida,
            });
        }
    }
    for (const c of caixa) {
        mov.push({
            id: c.id, tipo: c.tipo, origem: 'manual', categoria: c.categoria,
            descricao: c.descricao || c.categoria, valor: num(c.valor),
            data: c.data, veiculo_id: c.veiculo_id, forma_pagamento: c.forma_pagamento,
        });
    }
    mov.sort((a, b) => new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime());
    return mov;
}
