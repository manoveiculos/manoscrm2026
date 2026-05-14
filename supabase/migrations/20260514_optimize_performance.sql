-- Otimização de Performance Inbox V3
-- Data: 2026-05-14

-- 1. Índices para busca por consultor (essencial para Inbox Individual)
CREATE INDEX IF NOT EXISTS idx_leads_manos_consultant_active 
ON leads_manos_crm (assigned_consultant_id) 
WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_dist_consultant_active 
ON leads_distribuicao_crm_26 (assigned_consultant_id) 
WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_compra_consultant_active 
ON leads_compra (assigned_consultant_id) 
WHERE archived_at IS NULL;

-- 2. Índices para ordenação temporal (Inbox 'Hoje' e 'Urgente')
CREATE INDEX IF NOT EXISTS idx_leads_manos_created_at ON leads_manos_crm (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_dist_created_at ON leads_distribuicao_crm_26 (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_compra_created_at ON leads_compra (criado_em DESC);

-- 3. Índices para a Flag de Reversão
CREATE INDEX IF NOT EXISTS idx_leads_manos_reversao ON leads_manos_crm (flagged_reversao) WHERE flagged_reversao = true;
CREATE INDEX IF NOT EXISTS idx_leads_dist_reversao ON leads_distribuicao_crm_26 (flagged_reversao) WHERE flagged_reversao = true;

-- 4. Otimização de mensagens (Preview do Card)
-- Índice para buscar as últimas mensagens de um lead rapidamente
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead_created 
ON whatsapp_messages (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead_compra_created 
ON whatsapp_messages (lead_compra_id, created_at DESC);
