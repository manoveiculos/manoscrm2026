-- Sprint LEAD-ARRIVAL-PUSH & Forensic Performance Fixes

-- 1. Atualizar leads_manos_crm com colunas de performance em falta
ALTER TABLE leads_manos_crm 
ADD COLUMN IF NOT EXISTS ai_score_at_loss INTEGER,
ADD COLUMN IF NOT EXISTS loss_attribution TEXT,
ADD COLUMN IF NOT EXISTS consultant_response_score INTEGER,
ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMP WITH TIME ZONE;

-- 2. Atualizar leads_compra com colunas de atribuição e performance
ALTER TABLE leads_compra 
ADD COLUMN IF NOT EXISTS assigned_consultant_id UUID REFERENCES consultants_manos_crm(id),
ADD COLUMN IF NOT EXISTS ai_score_at_loss INTEGER,
ADD COLUMN IF NOT EXISTS loss_attribution TEXT,
ADD COLUMN IF NOT EXISTS consultant_response_score INTEGER,
ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMP WITH TIME ZONE;

-- 3. Índices para performance das queries de dashboard e atribuição
CREATE INDEX IF NOT EXISTS idx_leads_manos_crm_assigned_consultant ON leads_manos_crm(assigned_consultant_id);
CREATE INDEX IF NOT EXISTS idx_leads_compra_assigned_consultant ON leads_compra(assigned_consultant_id);
CREATE INDEX IF NOT EXISTS idx_leads_manos_crm_created_at ON leads_manos_crm(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_compra_criado_em ON leads_compra(criado_em);

-- 4. Comentários para documentação (Introspecção)
COMMENT ON COLUMN leads_manos_crm.loss_attribution IS 'Atribuição da perda: consultant_abandoned, customer_choice, etc';
COMMENT ON COLUMN leads_compra.assigned_consultant_id IS 'ID do consultor responsável pelo lead de compra';
