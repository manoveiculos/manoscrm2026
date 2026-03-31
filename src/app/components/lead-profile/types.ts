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
  vendedor?: string;
  consultant_name?: string;
  primeiro_vendedor?: string;
  last_proposal_json?: {
    titulo: string;
    pitch: string;
    cenarios: { label: string; entrada: string; parcela: string; obs: string }[];
    cta: string;
  } | null;
  last_proposal_at?: string | null;
  handoff_summary?: string | null;
  handoff_at?: string | null;
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
