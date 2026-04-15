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
    
    // IA Fields
    ai_score?: number;
    ai_classification?: string;
    ai_reason?: string;
    ai_summary?: string;
    next_step?: string;
    proxima_acao?: string;
    last_scripts_json?: any;
    last_scripts_at?: string;
    ai_last_run_at?: string;
    behavioral_profile?: any;
    churn_probability?: number;
}

export type LeadCompraStatus = 'novo' | 'em_analise' | 'proposta_enviada' | 'agendado' | 'vistoria' | 'fechado' | 'perdido';
