-- =============================================================================
-- Tracking explícito de atendimento + cobrança automática
-- =============================================================================
--
-- Hoje o sistema só sabe que vendedor "está atendendo" via heartbeat da
-- extensão (consultant_active_chats). Mas se vendedor abriu o lead no
-- /lead/:id sem entrar no chat WhatsApp, sistema não sabe.
--
-- Solução: coluna explícita atendimento_iniciado_em. Vendedor clica
-- "INICIAR ATENDIMENTO" → marca timestamp. SLA Watcher checa e cobra
-- depois de 2h, 4h, 24h se lead ainda não foi finalizado.

-- Adiciona coluna em cada tabela de lead (idempotente)
ALTER TABLE leads_manos_crm
    ADD COLUMN IF NOT EXISTS atendimento_iniciado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS atendimento_iniciado_por UUID;

ALTER TABLE leads_distribuicao_crm_26
    ADD COLUMN IF NOT EXISTS atendimento_iniciado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS atendimento_iniciado_por UUID;

ALTER TABLE leads_compra
    ADD COLUMN IF NOT EXISTS atendimento_iniciado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS atendimento_iniciado_por UUID;

-- Recria leads_unified incluindo a nova coluna
DROP VIEW IF EXISTS leads_unified_active CASCADE;
DROP VIEW IF EXISTS leads_unified CASCADE;
DROP VIEW IF EXISTS lead_kpis_daily CASCADE;

CREATE VIEW leads_unified AS
SELECT
    'leads_manos_crm:' || l.id::text AS uid,
    'leads_manos_crm' AS table_name,
    l.id::text AS native_id,
    l.name, l.phone, l.vehicle_interest, l.source,
    l.ai_score, l.ai_classification, l.status, l.proxima_acao,
    l.ai_summary,
    l.assigned_consultant_id,
    l.created_at, l.updated_at, l.first_contact_at, l.first_contact_channel,
    l.archived_at, l.follow_up_count, l.respondeu_follow_up,
    l.ai_silence_until, l.atendimento_manual_at,
    l.atendimento_iniciado_em, l.atendimento_iniciado_por,
    'venda' AS flow_type
FROM leads_manos_crm l

UNION ALL

SELECT
    'leads_compra:' || c.id::text, 'leads_compra', c.id::text,
    c.nome, c.telefone, c.veiculo_original, c.origem,
    c.ai_score, c.ai_classification, c.status, c.proxima_acao,
    c.ai_summary,
    c.assigned_consultant_id,
    c.criado_em, c.updated_at, c.first_contact_at, c.first_contact_channel,
    c.archived_at, c.follow_up_count, c.respondeu_follow_up,
    c.ai_silence_until, c.atendimento_manual_at,
    c.atendimento_iniciado_em, c.atendimento_iniciado_por,
    'compra'
FROM leads_compra c

UNION ALL

SELECT
    'leads_distribuicao_crm_26:' || d.id::text, 'leads_distribuicao_crm_26', d.id::text,
    d.nome, d.telefone, NULL, d.origem,
    d.ai_score, d.ai_classification, d.status, NULL,
    COALESCE(d.ai_summary, d.resumo),
    d.assigned_consultant_id,
    d.criado_em, d.atualizado_em, d.first_contact_at, d.first_contact_channel,
    d.archived_at, d.follow_up_count, d.respondeu_follow_up,
    d.ai_silence_until, d.atendimento_manual_at,
    d.atendimento_iniciado_em, d.atendimento_iniciado_por,
    'venda'
FROM leads_distribuicao_crm_26 d;

CREATE VIEW leads_unified_active AS
SELECT * FROM leads_unified
WHERE LOWER(COALESCE(status, '')) NOT IN
    ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity', 'frio')
  AND archived_at IS NULL;

-- Recria lead_kpis_daily
CREATE VIEW lead_kpis_daily AS
SELECT
    dia,
    SUM(leads) AS leads,
    SUM(contatados) AS contatados,
    SUM(contatado_5min) AS contatado_5min,
    SUM(vendidos) AS vendidos,
    SUM(perdidos) AS perdidos,
    SUM(frios) AS frios,
    CASE WHEN SUM(leads) > 0 THEN ROUND(100.0 * SUM(vendidos) / SUM(leads), 2) ELSE 0 END AS conversao_pct,
    CASE WHEN SUM(contatados) > 0 THEN ROUND(100.0 * SUM(contatado_5min) / SUM(contatados), 2) ELSE 0 END AS resposta_5min_pct
FROM (
    SELECT
        DATE(l.created_at) AS dia,
        1 AS leads,
        CASE WHEN l.first_contact_at IS NOT NULL THEN 1 ELSE 0 END AS contatados,
        CASE WHEN l.first_contact_at IS NOT NULL
                  AND EXTRACT(EPOCH FROM (l.first_contact_at - l.created_at))/60 <= 5
             THEN 1 ELSE 0 END AS contatado_5min,
        CASE WHEN LOWER(COALESCE(l.status, '')) IN ('vendido', 'comprado')
                  OR EXISTS (SELECT 1 FROM sales_manos_crm s WHERE s.lead_id::text = l.native_id)
             THEN 1 ELSE 0 END AS vendidos,
        CASE WHEN LOWER(COALESCE(l.status, '')) IN ('perdido', 'lost', 'lost_by_inactivity') THEN 1 ELSE 0 END AS perdidos,
        CASE WHEN LOWER(COALESCE(l.status, '')) = 'frio' THEN 1 ELSE 0 END AS frios
    FROM leads_unified l
    WHERE l.created_at >= NOW() - INTERVAL '30 days'
) sub
GROUP BY dia
ORDER BY dia DESC;

-- Índice pro SLA watcher achar leads em atendimento estagnado rápido
CREATE INDEX IF NOT EXISTS idx_leads_manos_crm_atendimento
    ON leads_manos_crm (atendimento_iniciado_em)
    WHERE atendimento_iniciado_em IS NOT NULL AND status NOT IN ('vendido', 'closed', 'lost', 'perdido', 'frio');

CREATE INDEX IF NOT EXISTS idx_leads_dist_atendimento
    ON leads_distribuicao_crm_26 (atendimento_iniciado_em)
    WHERE atendimento_iniciado_em IS NOT NULL AND status NOT IN ('vendido', 'closed', 'lost', 'perdido', 'frio');

CREATE INDEX IF NOT EXISTS idx_leads_compra_atendimento
    ON leads_compra (atendimento_iniciado_em)
    WHERE atendimento_iniciado_em IS NOT NULL AND status NOT IN ('vendido', 'closed', 'lost', 'perdido', 'frio');
