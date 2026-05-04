-- KPI HARDENING — corrige 4 bugs descobertos em 04/05/2026
--
-- 1. Garante que view leads_unified projeta first_contact_at consistentemente
-- 2. Cria view lead_kpis_daily que junta vendas REAIS (sales_manos_crm + status)
-- 3. Backfill: marca first_contact_at em leads que IA já enviou msg mas timestamp ficou nulo
-- 4. Backfill: leads_master herda first_contact_at de leads_manos_crm via match de telefone (best-effort)

-- ─── 1. VIEW leads_unified — garantir first_contact_at + first_contact_channel ────────
CREATE OR REPLACE VIEW leads_unified AS
SELECT
    'leads_manos_crm:' || l.id::text AS uid,
    'leads_manos_crm' AS table_name,
    l.id::text AS native_id,
    l.name, l.phone, l.vehicle_interest, l.source,
    l.ai_score, l.ai_classification, l.status, l.proxima_acao,
    l.assigned_consultant_id, l.created_at, l.updated_at,
    l.first_contact_at, l.first_contact_channel, l.archived_at,
    'venda' AS flow_type
FROM leads_manos_crm l

UNION ALL

SELECT
    'leads_compra:' || c.id::text, 'leads_compra', c.id::text,
    c.nome, c.telefone, c.veiculo_original, c.origem,
    c.ai_score, c.ai_classification, c.status, c.proxima_acao,
    c.assigned_consultant_id, c.criado_em, c.updated_at,
    c.first_contact_at, c.first_contact_channel, c.archived_at,
    'compra'
FROM leads_compra c

UNION ALL

SELECT
    'leads_distribuicao_crm_26:' || d.id::text, 'leads_distribuicao_crm_26', d.id::text,
    d.nome, d.telefone, NULL, d.origem,
    d.ai_score, d.ai_classification, d.status, NULL,
    d.assigned_consultant_id, d.criado_em, d.atualizado_em,
    d.first_contact_at, d.first_contact_channel, d.archived_at,
    'venda'
FROM leads_distribuicao_crm_26 d;

-- View "ativos" mantida (já filtra arquivados + status final)
CREATE OR REPLACE VIEW leads_unified_active AS
SELECT * FROM leads_unified
WHERE LOWER(COALESCE(status, '')) NOT IN
    ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity', 'lost_redistributed')
  AND archived_at IS NULL;

-- ─── 2. VIEW lead_kpis_daily — métricas REAIS por dia ─────────────────────────────────
-- Junta:
--   - leads recebidos (de leads_unified)
--   - 1ºs contatos (first_contact_at)
--   - velocidade de resposta (<5min)
--   - vendas: status='vendido'/'comprado' OU sales_manos_crm.lead_id correspondente

CREATE OR REPLACE VIEW lead_kpis_daily AS
WITH unified_with_sales AS (
    SELECT
        u.uid,
        u.table_name,
        u.native_id,
        u.created_at,
        u.first_contact_at,
        u.status,
        u.archived_at,
        -- Lead é considerado VENDIDO se:
        --   (a) status já está marcado, OU
        --   (b) tem sales_manos_crm correspondente
        CASE
            WHEN LOWER(COALESCE(u.status, '')) IN ('vendido', 'comprado', 'venda', 'closed', 'fechado', 'ganho') THEN TRUE
            WHEN EXISTS (SELECT 1 FROM sales_manos_crm s WHERE s.lead_id::text = u.native_id) THEN TRUE
            ELSE FALSE
        END AS is_sold,
        CASE
            WHEN LOWER(COALESCE(u.status, '')) IN ('perdido', 'lost', 'lost_by_inactivity', 'lost_redistributed') THEN TRUE
            ELSE FALSE
        END AS is_lost,
        EXTRACT(EPOCH FROM (u.first_contact_at - u.created_at))/60 AS contact_minutes
    FROM leads_unified u
    WHERE u.archived_at IS NULL
)
SELECT
    DATE(created_at) AS dia,
    COUNT(*) AS leads,
    COUNT(first_contact_at) AS contatados,
    COUNT(*) FILTER (WHERE first_contact_at IS NOT NULL AND contact_minutes <= 5) AS contatado_5min,
    COUNT(*) FILTER (WHERE first_contact_at IS NOT NULL AND contact_minutes <= 30) AS contatado_30min,
    COUNT(*) FILTER (WHERE is_sold) AS vendidos,
    COUNT(*) FILTER (WHERE is_lost) AS perdidos,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_sold)
          / NULLIF(COUNT(*), 0), 2) AS conversao_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE first_contact_at IS NOT NULL AND contact_minutes <= 5)
          / NULLIF(COUNT(*), 0), 2) AS resposta_5min_pct
FROM unified_with_sales
GROUP BY DATE(created_at)
ORDER BY dia DESC;

COMMENT ON VIEW lead_kpis_daily IS
    'KPIs diários REAIS: junta leads_unified + sales_manos_crm + first_contact_at. Use sempre essa view pra relatórios de conversão.';

-- ─── 3. BACKFILL: first_contact_at via whatsapp_send_log ───────────────────────────────
-- Pra leads onde a IA enviou ai_first_contact mas timestamp ficou NULL
-- (cenário do bug que existia até hoje em algumas tabelas).

UPDATE leads_manos_crm l
SET
    first_contact_at = COALESCE(l.first_contact_at, sub.first_sent),
    first_contact_channel = COALESCE(l.first_contact_channel, 'ai_sdr')
FROM (
    SELECT lead_id::text AS lid, MIN(sent_at) AS first_sent
    FROM whatsapp_send_log
    WHERE kind = 'ai_first_contact'
    GROUP BY lead_id
) sub
WHERE l.id::text = sub.lid
  AND l.first_contact_at IS NULL;

UPDATE leads_compra l
SET
    first_contact_at = COALESCE(l.first_contact_at, sub.first_sent),
    first_contact_channel = COALESCE(l.first_contact_channel, 'ai_sdr')
FROM (
    SELECT lead_id::text AS lid, MIN(sent_at) AS first_sent
    FROM whatsapp_send_log
    WHERE kind = 'ai_first_contact'
    GROUP BY lead_id
) sub
WHERE l.id::text = sub.lid
  AND l.first_contact_at IS NULL;

UPDATE leads_distribuicao_crm_26 l
SET
    first_contact_at = COALESCE(l.first_contact_at, sub.first_sent),
    first_contact_channel = COALESCE(l.first_contact_channel, 'ai_sdr')
FROM (
    SELECT lead_id::text AS lid, MIN(sent_at) AS first_sent
    FROM whatsapp_send_log
    WHERE kind = 'ai_first_contact'
    GROUP BY lead_id
) sub
WHERE l.id::text = sub.lid
  AND l.first_contact_at IS NULL;

-- ─── 4. BACKFILL: status='vendido' onde existe sales_manos_crm órfão ──────────────────
-- Se um lead foi vendido mas o status não foi atualizado (bug histórico antes do /finish
-- centralizado), reflete a venda no lead pra KPIs ficarem consistentes.

UPDATE leads_manos_crm l
SET
    status = 'vendido',
    won_at = COALESCE(l.won_at, s.sale_date, s.created_at, NOW()),
    updated_at = NOW()
FROM sales_manos_crm s
WHERE l.id::text = s.lead_id::text
  AND LOWER(COALESCE(l.status, '')) NOT IN ('vendido', 'comprado');
