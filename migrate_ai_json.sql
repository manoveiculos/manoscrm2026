-- Cria a coluna ai_analysis_result caso não exista
ALTER TABLE campaigns_manos_crm ADD COLUMN IF NOT EXISTS ai_analysis_result JSONB;
