
-- Add AI columns to leads_distribuicao_crm_26 for rigorous scoring
ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 0;
ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS ai_classification TEXT;
ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS ai_reason TEXT;
ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS behavioral_profile JSONB;
ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS next_step TEXT;
ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS ai_summary TEXT;
