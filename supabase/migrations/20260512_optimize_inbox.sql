-- Optimização de queries do Inbox para resolver a lentidão e travamentos

-- 1. Criação de índices parciais nas tabelas base para otimizar a view leads_unified_active
-- Isso permite que o Postgres ordene por ai_score DESC sem precisar varrer toda a tabela
CREATE INDEX IF NOT EXISTS idx_leads_manos_crm_active_inbox 
ON leads_manos_crm (ai_score DESC) 
WHERE archived_at IS NULL 
AND LOWER(COALESCE(status, '')) NOT IN ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity', 'lost_redistributed');

CREATE INDEX IF NOT EXISTS idx_leads_compra_active_inbox 
ON leads_compra (ai_score DESC) 
WHERE archived_at IS NULL 
AND LOWER(COALESCE(status, '')) NOT IN ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity', 'lost_redistributed');

CREATE INDEX IF NOT EXISTS idx_leads_distribuicao_crm_26_active_inbox 
ON leads_distribuicao_crm_26 (ai_score DESC) 
WHERE archived_at IS NULL 
AND LOWER(COALESCE(status, '')) NOT IN ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity', 'lost_redistributed');

-- 2. Otimizar a ordenação por created_at e updated_at (usada nas abas 'hoje' e 'arquivados')
CREATE INDEX IF NOT EXISTS idx_leads_manos_crm_created_at ON leads_manos_crm (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_compra_created_at ON leads_compra (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_leads_distribuicao_crm_26_created_at ON leads_distribuicao_crm_26 (criado_em DESC);

-- 3. Otimizar a busca das últimas mensagens do WhatsApp
-- O Inbox busca mensagens agrupadas por lead_id ordenadas por created_at DESC
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead_id_created_at 
ON whatsapp_messages (lead_id, created_at DESC);
