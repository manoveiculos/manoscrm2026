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
}

export interface DashboardStats {
  totalAReceber: number;     // Expected total or active pending/paid
  valorRecebido: number;     // Paid total
  inadimplencia: number;     // Overdue/atrasado total
  porcentagemInadimplencia: number; // calculated percentage
}
