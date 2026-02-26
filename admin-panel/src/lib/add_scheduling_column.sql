-- Adicionar coluna de agendamento na Central de Leads
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Garantir que as colunas operacional existem (caso não tenham sido migradas antes)
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS carro_troca TEXT;
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS valor_investimento TEXT;
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS prazo_troca TEXT;

COMMENT ON COLUMN leads_manos_crm.scheduled_at IS 'Data e hora agendada para visita ou test-drive';
