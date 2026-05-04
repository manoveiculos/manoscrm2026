-- Fix do bug 400 no /lead/[id]
--
-- Bug: view leads_unified não expunha ai_summary, mas o frontend pedia.
-- Resultado: toda tela de lead retornava 400 Bad Request → "Lead não encontrado".
--
-- Esta migration:
--   1. Adiciona ai_summary nas tabelas que ainda não têm (idempotente)
--   2. Recria a view leads_unified incluindo ai_summary
--   3. Recria leads_unified_active dependente

ALTER TABLE leads_compra
    ADD COLUMN IF NOT EXISTS ai_summary TEXT;

ALTER TABLE leads_distribuicao_crm_26
    ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- DROP CASCADE antes (necessário pra evitar erro 42P16)
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
    'compra'
FROM leads_compra c

UNION ALL

SELECT
    'leads_distribuicao_crm_26:' || d.id::text, 'leads_distribuicao_crm_26', d.id::text,
    d.nome, d.telefone, NULL, d.origem,
    d.ai_score, d.ai_classification, d.status, NULL,
    -- prefere ai_summary mas cai pro resumo legado se não tiver
    COALESCE(d.ai_summary, d.resumo),
    d.assigned_consultant_id,
    d.criado_em, d.atualizado_em, d.first_contact_at, d.first_contact_channel,
    d.archived_at, d.follow_up_count, d.respondeu_follow_up,
    d.ai_silence_until, d.atendimento_manual_at,
    'venda'
FROM leads_distribuicao_crm_26 d;

CREATE VIEW leads_unified_active AS
SELECT * FROM leads_unified
WHERE LOWER(COALESCE(status, '')) NOT IN
    ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity', 'frio')
  AND archived_at IS NULL;

-- Recria também lead_kpis_daily (depende da unified)
CREATE VIEW lead_kpis_daily AS
SELECT
    dia,
    SUM(leads) AS leads,
    SUM(contatados) AS contatados,
    SUM(contatado_5min) AS contatado_5min,
    SUM(vendidos) AS vendidos,
    SUM(perdidos) AS perdidos,
    SUM(frios) AS frios,
    CASE WHEN SUM(leads) > 0
         THEN ROUND(100.0 * SUM(vendidos) / SUM(leads), 2)
         ELSE 0 END AS conversao_pct,
    CASE WHEN SUM(contatados) > 0
         THEN ROUND(100.0 * SUM(contatado_5min) / SUM(contatados), 2)
         ELSE 0 END AS resposta_5min_pct
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
        CASE WHEN LOWER(COALESCE(l.status, '')) IN ('perdido', 'lost', 'lost_by_inactivity')
             THEN 1 ELSE 0 END AS perdidos,
        CASE WHEN LOWER(COALESCE(l.status, '')) = 'frio'
             THEN 1 ELSE 0 END AS frios
    FROM leads_unified l
    WHERE l.created_at >= NOW() - INTERVAL '30 days'
) sub
GROUP BY dia
ORDER BY dia DESC;

-- Validação
DO $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM leads_unified WHERE ai_summary IS NOT NULL;
    RAISE NOTICE 'leads_unified com ai_summary preenchido: %', v_count;
END $$;
