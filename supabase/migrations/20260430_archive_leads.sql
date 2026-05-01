-- Arquivamento de leads
--
-- Objetivo: vendedor pode "esconder" lead da fila sem deletar.
-- Lead arquivado:
--   - Some do /inbox (mesmo no filtro Tudo, exceto aba "Arquivados")
--   - Não é alvo de rescue-stale, follow-up-ai nem sla-watcher
--   - Pode ser desarquivado a qualquer momento
--   - Mantém histórico (auditoria preservada)

-- 1. Adiciona colunas em todas as tabelas de lead
ALTER TABLE leads_manos_crm
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_reason TEXT,
    ADD COLUMN IF NOT EXISTS archived_by UUID;

ALTER TABLE leads_compra
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_reason TEXT,
    ADD COLUMN IF NOT EXISTS archived_by UUID;

ALTER TABLE leads_distribuicao_crm_26
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_reason TEXT,
    ADD COLUMN IF NOT EXISTS archived_by UUID;

-- 2. View leads_unified expõe archived_at
CREATE OR REPLACE VIEW leads_unified AS
SELECT
    'leads_manos_crm:' || l.id::text AS uid,
    'leads_manos_crm' AS table_name,
    l.id::text AS native_id,
    l.name, l.phone, l.vehicle_interest, l.source,
    l.ai_score, l.ai_classification, l.status, l.proxima_acao,
    l.assigned_consultant_id, l.created_at, l.updated_at,
    l.first_contact_at, l.archived_at,
    'venda' AS flow_type
FROM leads_manos_crm l

UNION ALL

SELECT
    'leads_compra:' || c.id::text, 'leads_compra', c.id::text,
    c.nome, c.telefone, c.veiculo_original, c.origem,
    c.ai_score, c.ai_classification, c.status, c.proxima_acao,
    c.assigned_consultant_id, c.criado_em, c.updated_at,
    c.first_contact_at, c.archived_at,
    'compra'
FROM leads_compra c

UNION ALL

SELECT
    'leads_distribuicao_crm_26:' || d.id::text, 'leads_distribuicao_crm_26', d.id::text,
    d.nome, d.telefone, NULL, d.origem,
    d.ai_score, d.ai_classification, d.status, NULL,
    d.assigned_consultant_id, d.criado_em, d.atualizado_em,
    d.first_contact_at, d.archived_at,
    'venda'
FROM leads_distribuicao_crm_26 d;

-- 3. View "ativos" agora também exclui arquivados
CREATE OR REPLACE VIEW leads_unified_active AS
SELECT * FROM leads_unified
WHERE LOWER(COALESCE(status, '')) NOT IN
    ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity')
  AND archived_at IS NULL;

-- 4. Index pra acelerar filtros futuros
CREATE INDEX IF NOT EXISTS idx_leads_manos_archived ON leads_manos_crm (archived_at)
    WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_compra_archived ON leads_compra (archived_at)
    WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_dist_archived ON leads_distribuicao_crm_26 (archived_at)
    WHERE archived_at IS NOT NULL;
