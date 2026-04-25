import { Lead as BaseLead, LeadStatus as BaseStatus, AIClassification as BaseAI } from '@/lib/types';

export interface Lead extends Partial<BaseLead> {
  id: string;
  name: string;
  phone: string;
  status: any; // Mantido any para compatibilidade com fluxos legados
  created_at: string;
  // Campos estendidos específicos do V2
  last_proposal_json?: {
    titulo: string;
    pitch: string;
    cenarios: { label: string; entrada: string; parcela: string; obs: string }[];
    cta: string;
  } | null;
  last_proposal_at?: string | null;
  last_scripts_json?: { tipo: string; label: string; mensagem: string }[] | null;
  last_scripts_at?: string | null;
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

export type TabId = 'dashboard' | 'timeline' | 'followup' | 'arsenal' | 'troca' | 'financiamento' | 'proposta' | 'whatsapp';

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
