export interface LeadCompra {
    id: string;
    nome: string;
    primeiro_nome?: string;
    telefone: string;
    veiculo_original?: string;
    marca?: string;
    modelo?: string;
    ano?: number;
    km?: number;
    valor_cliente?: number;
    aceita_abaixo_fipe: boolean;
    valor_fipe?: number;
    origem?: string;
    status: string;
    pipeline: string;
    criado_em: string;
    updated_at: string;
}

export type LeadCompraStatus = 'novo' | 'em_analise' | 'proposta_enviada' | 'agendado' | 'vistoria' | 'fechado' | 'perdido';
