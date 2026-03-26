import { Lead as BaseLead } from '@/lib/types';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source?: string;
  origem?: string;
  vehicle_interest?: string;
  valor_investimento?: string;
  ai_score?: number;
  ai_classification?: string | any;
  status: any;
  assigned_consultant_id?: string;
  created_at: string;
  updated_at?: string;
  ai_summary?: string;
  next_step?: string;
  proxima_acao?: string;
  ai_reason?: string;
  carro_troca?: string;
  troca?: string;
  interesse?: string;
  observacoes?: string;
  resumo?: string;
  followups?: any[];
}

export interface TimelineEvent {
  id: string;
  type: string;
  notes: string;
  created_at: string;
  user_name?: string;
  user_id?: string;
  operator_name?: string;
  feedType?: 'interaction' | 'message' | 'ai_lab';
}

export type TabId = 'dashboard' | 'timeline' | 'followup' | 'arsenal' | 'troca' | 'financiamento';

export interface InventoryItem {
  marca: string;
  modelo: string;
  preco: any;
  km: any;
  ano: any;
  combustivel: string;
  cambio: string;
  cor: string;
  status: string;
}
