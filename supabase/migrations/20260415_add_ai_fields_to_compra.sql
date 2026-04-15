-- Adicionar campos de IA para a tabela leads_compra
ALTER TABLE public.leads_compra 
ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_classification TEXT,
ADD COLUMN IF NOT EXISTS ai_reason TEXT,
ADD COLUMN IF NOT EXISTS ai_summary TEXT,
ADD COLUMN IF NOT EXISTS next_step TEXT,
ADD COLUMN IF NOT EXISTS proxima_acao TEXT,
ADD COLUMN IF NOT EXISTS last_scripts_json JSONB,
ADD COLUMN IF NOT EXISTS last_scripts_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ai_last_run_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS behavioral_profile JSONB,
ADD COLUMN IF NOT EXISTS churn_probability INTEGER DEFAULT 0;

-- Adicionar chave estrangeira na tabela de mensagens
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS lead_compra_id UUID REFERENCES public.leads_compra(id) ON DELETE CASCADE;
