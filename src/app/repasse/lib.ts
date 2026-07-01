// Helpers e constantes de UI do módulo Repasse (Paulo). Módulo puro (não é rota).

export const brl = (n: number | null | undefined) =>
    (n == null ? 0 : n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const dateBR = (s?: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');

export const PERMITIDOS = ['paulo@manoscrm.com', 'alexandre_gorges@hotmail.com'];

export const STATUS_CFG: Record<string, { label: string; cls: string }> = {
    negociando: { label: 'Negociando', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    comprado: { label: 'Comprado', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    anunciado: { label: 'Anunciado', cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    vendido: { label: 'Vendido', cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
    cancelado: { label: 'Cancelado', cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
};

export const STATUS_OPCOES = ['negociando', 'comprado', 'anunciado', 'vendido', 'cancelado'];

export const TIPO_OP: Record<string, string> = {
    compra_venda: 'Compra e venda',
    intermediacao: 'Intermediação',
};

export const LOJA_TIPO: Record<string, string> = {
    loja: 'Loja',
    repassador: 'Repassador',
    particular: 'Particular',
    outro: 'Outro',
};

export const CATEGORIA_LABEL: Record<string, string> = {
    aporte: 'Aporte', retirada: 'Retirada', despesa: 'Despesa', comissao: 'Comissão',
    outros: 'Outros', compra: 'Compra', venda: 'Venda',
};
