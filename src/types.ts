export type BillingStatus = 'PAGO' | 'PENDENTE' | 'ATRASADO';

export interface BillingRecord {
  id: string;
  clienteFornecedor: string; // Column: "CLIENTE/FORNECEDOR"
  cpfCnpj: string;           // Column: "CPF/CNPJ"
  telefone: string;          // Column: "TELEFONE"
  veiculo: string;           // Column: "VEICULO"
  vencimento: string;        // Column: "VENCIMENTO" (format: YYYY-MM-DD)
  valor: number;             // Column: "VALOR"
  status: BillingStatus;     // Status (PAGO, PENDENTE, ATRASADO)
  dataPagamento?: string;    // Date when marked as paid
  observacoes?: string;      // Metadata
  fase?: 'NORMAL' | 'ENVIO_JURIDICO' | 'JURIDICO_VENDEDORES' | 'ENVIO_FORUM' | 'PAGOS';
  telefone_invalido?: boolean;
  vendedor_id?: string | null;
  quem_vendeu?: string | null;
  vendedor_nome?: string;
  acordos_ativos?: number;
  dias_atraso?: number;
  faixa_atraso?: string;
  ultima_msg_whatsapp?: string;
  ai_classification?: string;
  risk_score?: number;
}

export interface DashboardStats {
  totalAReceber: number;     // Expected total or active pending/paid
  valorRecebido: number;     // Paid total
  inadimplencia: number;     // Overdue/atrasado total
  porcentagemInadimplencia: number; // calculated percentage
}
