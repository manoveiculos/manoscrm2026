-- Adds new columns to natively persist AI analysis and finalization reasons in the CRM26 table
ALTER TABLE leads_distribuicao_crm_26 
ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_classification VARCHAR(50),
ADD COLUMN IF NOT EXISTS ai_reason TEXT,
ADD COLUMN IF NOT EXISTS motivo_perda VARCHAR(255),
ADD COLUMN IF NOT EXISTS resumo_fechamento TEXT;
