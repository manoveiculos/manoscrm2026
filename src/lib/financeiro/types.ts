// Tipos e constantes do módulo Financeiro (Caixa Livre + Patrimônio).
// Arquivo isomórfico: usado no cliente e no servidor.

export const FINANCEIRO_EMAILS = ['alexandre_gorges@hotmail.com', 'hgledra@hotmail.com'];

export function isFinanceiroAutorizado(email?: string | null): boolean {
    return !!email && FINANCEIRO_EMAILS.includes(email.trim().toLowerCase());
}

export type TipoLancamento = 'entrada' | 'saida' | 'transferencia';
export type Escopo = 'PF' | 'PJ';
export type StatusLancamento = 'pago' | 'previsto';
export type DestinacaoGasto = 'particular' | 'loja_100' | 'loja_50';

export interface FinConta {
    id: string;
    nome: string;
    tipo: 'banco' | 'dinheiro' | 'cartao' | 'investimento';
    escopo: Escopo;
    saldo_inicial: number;
    data_saldo_inicial: string;
    cor: string | null;
    ordem: number;
    ativa: boolean;
    saldo?: number; // calculado
}

export interface FinCategoria {
    id: string;
    nome: string;
    tipo: 'entrada' | 'saida';
    natureza: 'operacional' | 'patrimonial';
    acao_patrimonio: 'compra_veiculo' | 'venda_veiculo' | null;
    cor: string | null;
    palavras_chave: string[];
    ativa: boolean;
}

export interface FinLancamento {
    id: string;
    tipo: TipoLancamento;
    valor: number;
    data: string; // YYYY-MM-DD
    data_vencimento?: string | null;
    data_pagamento?: string | null;
    descricao: string;
    conta_id: string | null;
    conta_destino_id: string | null;
    categoria_id: string | null;
    escopo: Escopo;
    placa: string | null;
    status: StatusLancamento;
    texto_original: string | null;
    destinacao?: DestinacaoGasto;
    reembolso_status?: 'nenhum' | 'pendente' | 'pago';
    reembolso_valor?: number;
    reembolso_de?: string | null;
    reembolso_para?: string | null;
    reembolso_liquidado_em?: string | null;
    fechamento_id: string | null;
    deleted_at?: string | null;
    deleted_by?: string | null;
    motivo_exclusao?: string | null;
    created_at: string;
}

export interface FinLancamentoAudit {
    id: string;
    lancamento_id: string;
    acao: 'exclusao' | 'restauracao' | 'baixa';
    executado_por: string;
    owner_email: string;
    motivo: string;
    dados_snapshot: any;
    created_at: string;
}

export type GrupoPatrimonio =
    | 'veiculo' | 'imovel' | 'a_receber' | 'investimento'
    | 'financiamento' | 'emprestimo' | 'divida' | 'outro';

export interface FinPatrimonio {
    id: string;
    nome: string;
    tipo: 'ativo' | 'passivo';
    grupo: GrupoPatrimonio;
    escopo: Escopo;
    valor_atual: number;
    valor_aquisicao: number | null;
    placa: string | null;
    ativo: boolean;
    baixado_em: string | null;
    observacao: string | null;
    updated_at: string;
}

export interface FinFechamento {
    id: string;
    conta_id?: string | null;
    conta?: FinConta | null;
    titulo: string | null;
    data_inicio: string;
    data_fim: string;
    caixa_inicial: number;
    entradas: number;
    saidas: number;
    resultado_operacional: number;
    caixa_final: number;
    patrimonio_inicial: number | null;
    patrimonio_final: number | null;
    observacao: string | null;
    fechado_em: string;
}

export interface FinHistoricoPeriodo {
    id: string;
    numero_ordem: number;
    titulo: string;
    saldo_inicial: number;
    total_recebido: number;
    total_pago: number;
    saldo_final: number;
    qtd_entradas: number;
    qtd_saidas: number;
    created_at: string;
}

export interface FinHistoricoItem {
    id: string;
    periodo_id: string;
    tipo: 'receita' | 'despesa';
    data_registro: string | null;
    descricao: string;
    motivo_ou_placa: string | null;
    valor: number;
    ordem_linha: number;
    fin_historico_periodos?: {
        numero_ordem: number;
        titulo: string;
    } | null;
}

export const GRUPO_LABEL: Record<GrupoPatrimonio, string> = {
    veiculo: 'Veículo',
    imovel: 'Imóvel',
    a_receber: 'A receber',
    investimento: 'Investimento',
    financiamento: 'Financiamento',
    emprestimo: 'Empréstimo',
    divida: 'Dívida',
    outro: 'Outro',
};

export const GRUPOS_ATIVO: GrupoPatrimonio[] = ['veiculo', 'imovel', 'a_receber', 'investimento', 'outro'];
export const GRUPOS_PASSIVO: GrupoPatrimonio[] = ['financiamento', 'emprestimo', 'divida', 'outro'];

// Categorias criadas no primeiro acesso de cada usuário.
export const CATEGORIAS_PADRAO: Array<Omit<FinCategoria, 'id' | 'ativa'>> = [
    // Entradas
    { nome: 'Venda de Veículo', tipo: 'entrada', natureza: 'patrimonial', acao_patrimonio: 'venda_veiculo', cor: '#10b981', palavras_chave: ['venda', 'vendi', 'vendido'] },
    { nome: 'Comissão Recebida', tipo: 'entrada', natureza: 'operacional', acao_patrimonio: null, cor: '#22c55e', palavras_chave: ['comissao', 'comissão'] },
    { nome: 'Lucro / Divisão', tipo: 'entrada', natureza: 'operacional', acao_patrimonio: null, cor: '#84cc16', palavras_chave: ['divisao', 'divisão', 'lucro', 'metade'] },
    { nome: 'Cobranças / Promissórias', tipo: 'entrada', natureza: 'operacional', acao_patrimonio: null, cor: '#14b8a6', palavras_chave: ['cobranca', 'cobrança', 'promissoria', 'parcela'] },
    { nome: 'PIX / Depósito', tipo: 'entrada', natureza: 'operacional', acao_patrimonio: null, cor: '#06b6d4', palavras_chave: ['pix', 'deposito', 'depósito', 'transferencia'] },
    { nome: 'Salário / Pró-labore', tipo: 'entrada', natureza: 'operacional', acao_patrimonio: null, cor: '#0ea5e9', palavras_chave: ['salario', 'salário', 'prolabore'] },
    { nome: 'Outras Entradas', tipo: 'entrada', natureza: 'operacional', acao_patrimonio: null, cor: '#64748b', palavras_chave: [] },
    // Saídas
    { nome: 'Compra de Veículo', tipo: 'saida', natureza: 'patrimonial', acao_patrimonio: 'compra_veiculo', cor: '#3b82f6', palavras_chave: ['compra', 'comprei', 'sinal', 'quitacao', 'quitação'] },
    { nome: 'Oficina / Peças', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#f97316', palavras_chave: ['oficina', 'peca', 'peça', 'pecas', 'peças', 'mecanica', 'mecânica', 'pneu', 'pneus', 'motor', 'chave', 'chaveiro', 'fechadura', 'bateria', 'eletrica', 'elétrica', 'funilaria', 'pintura', 'garantia', 'revisao', 'revisão', 'oleo', 'óleo', 'vidro', 'para-brisa', 'roda', 'rodas', 'suspensao'] },
    { nome: 'Preparação / Lavação', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#fb923c', palavras_chave: ['lavacao', 'lavação', 'lavagem', 'polimento', 'preparacao', 'preparação', 'higienizacao'] },
    { nome: 'Combustível', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#eab308', palavras_chave: ['gasolina', 'combustivel', 'combustível', 'diesel', 'etanol', 'posto'] },
    { nome: 'Despachante / Documentos', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#a855f7', palavras_chave: ['despachante', 'documento', 'doc', 'docs', 'vistoria', 'transferencia', 'licenciamento', 'ipva', 'multa', 'multas', 'cartorio', 'cartório', 'procuracao', 'procuração', 'consulta'] },
    { nome: 'Comissões Pagas', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#ec4899', palavras_chave: ['comissao', 'comissão', 'indicacao', 'indicação'] },
    { nome: 'Aluguel / Loja', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#ef4444', palavras_chave: ['aluguel', 'loja', 'luz', 'agua', 'água', 'internet', 'limpeza'] },
    { nome: 'Salários / Funcionários', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#f43f5e', palavras_chave: ['salario', 'salário', 'vale', 'funcionario'] },
    { nome: 'Parcelas / Financiamentos', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#dc2626', palavras_chave: ['parcela', 'boleto', 'financiamento', 'juros', 'emprestimo', 'empréstimo'] },
    { nome: 'Impostos / Taxas', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#b91c1c', palavras_chave: ['imposto', 'impostos', 'taxa', 'iptu', 'das', 'nota'] },
    { nome: 'Casa / Família', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#8b5cf6', palavras_chave: ['casa', 'mercado', 'farmacia', 'farmácia', 'escola', 'carne'] },
    { nome: 'Alimentação', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#d946ef', palavras_chave: ['almoco', 'almoço', 'janta', 'lanche', 'restaurante', 'churrasco', 'ifood'] },
    { nome: 'Pessoal / Lazer', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#c026d3', palavras_chave: ['lazer', 'praia', 'viagem', 'academia', 'tatuagem', 'tattoo', 'perfume', 'celular', 'uber', 'roupa'] },
    { nome: 'Outras Saídas', tipo: 'saida', natureza: 'operacional', acao_patrimonio: null, cor: '#64748b', palavras_chave: [] },
];

export const CONTAS_PADRAO: Array<Pick<FinConta, 'nome' | 'tipo' | 'escopo' | 'ordem'>> = [
    { nome: 'Dinheiro', tipo: 'dinheiro', escopo: 'PF', ordem: 0 },
    { nome: 'Conta Pessoal', tipo: 'banco', escopo: 'PF', ordem: 1 },
    { nome: 'Conta Empresa', tipo: 'banco', escopo: 'PJ', ordem: 2 },
];
