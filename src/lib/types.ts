export type LeadStatus = 'new' | 'received' | 'attempt' | 'contacted' | 'confirmed' | 'scheduled' | 'visited' | 'test_drive' | 'proposed' | 'negotiation' | 'closed' | 'post_sale' | 'lost';
export type AIClassification = 'hot' | 'warm' | 'cold';
export type Platform = 'facebook' | 'google' | 'instagram' | 'whatsapp' | 'site';

export interface Campaign {
  id: string;
  platform: string;
  name: string;
  status: string;
  total_spend: number;
  created_at: string;
  link_clicks?: number;
  reach?: number;
  impressions?: number;
  cpc?: number;
  ctr?: number;
  cpm?: number;
  frequency?: number;
  updated_at?: string;
  leads_manos_crm?: { count: number }[];
  ai_analysis_result?: {
    current_analysis?: {
      analise_critica: string;
      saude_campanha: string;
      gargalo_identificado: string;
      proximos_passos: string[];
      score_potencial: number;
      analyzed_at?: string;
    };
    history?: any[];
    // Fallbacks for older records
    analise_critica?: string;
    saude_campanha?: string;
    gargalo_identificado?: string;
    proximos_passos?: string[];
    score_potencial?: number;
  };
}

export interface Consultant {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  performance_score: number;
  is_active: boolean;
  on_duty: boolean;
  last_lead_assigned_at: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  origem?: string;
  campaign_id?: string;
  creative_id?: string;
  vehicle_interest: string;
  region: string;
  estimated_ticket: number;
  ai_score: number;
  ai_classification: AIClassification;
  status: LeadStatus;
  assigned_consultant_id?: string;
  assigned_at?: string;
  first_contact_at?: string;
  response_time_seconds?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  duplicate_id?: string;
  created_at: string;
  updated_at: string;

  // Meta Leads PT-BR
  id_meta?: string;
  id_formulario?: string;
  id_anuncio_meta?: string;
  id_conjunto_anuncio_meta?: string;
  id_campanha_meta?: string;
  plataforma_meta?: string;
  data_criacao_meta?: string;
  dados_brutos?: Record<string, unknown>;
  observacoes?: string;
  valor_investimento?: string;
  metodo_compra?: string;
  carro_troca?: string;
  prazo_troca?: string;
  scheduled_at?: string;
  ai_summary?: string;
  ai_reason?: string;
  behavioral_profile?: {
    urgency: 'high' | 'medium' | 'low';
    sentiment: string;
    intentions: string[];
    funnel_stage?: string;
    closing_probability?: number;
  };
  next_step?: string;
  consultants_manos_crm?: { name: string };

  // New AI analysis fields
  nivel_interesse?: string;
  momento_compra?: string;
  resumo_consultor?: string;
  proxima_acao?: string;
}

export interface InventoryItem {
  id: number;
  marca: string;
  modelo: string;
  ano: string | number;
  cor: string;
  preco: number | string | null;
  drive_id?: string;
  km: number | string | null;
  cambio?: string;
  combustivel?: string;
  status?: string;
  created_at?: string;
  descricao?: string;
  imagem_url?: string;
}

export interface Sale {
  id: string;
  lead_id: string;
  inventory_id: string;
  consultant_id: string;
  sale_value: number;
  profit_margin: number;
  sale_date: string;
}

export interface FinancialMetrics {
  totalSpend: number;
  totalRevenue: number;
  totalProfit: number;
  salesCount: number;
  cac: number;
  cpl: number;
  roi: number;
  leadCount: number;
}

export interface Recommendation {
  title: string;
  action: string;
  reason: string;
}

export interface MarketingReport {
  summary: string;
  recommendations: Recommendation[];
}
export interface DistributedLead {
  id: number;
  telefone: string;
  nome: string;
  cidade: string;
  interesse: string;
  troca: string;
  resumo: string;
  vendedor: string;
  enviado: boolean;
  criado_em: string;
  ai_classification?: AIClassification;
  ai_reason?: string;
  nivel_interesse?: string;
  momento_compra?: string;
  resumo_consultor?: string;
  proxima_acao?: string;
  atualizado_em?: string;
}
