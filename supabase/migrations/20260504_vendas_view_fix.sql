-- Fix da view vendas_por_dia
--
-- Bugs identificados na versão anterior:
--   1. CTE com EXTRACT(DAYS FROM ...) quebra quando colunas são NULL
--   2. Cast `lead_id::text = id::text` falha em casos de tipo misto
--   3. Filtro NOT EXISTS pode estar perdendo vendas legítimas

DROP VIEW IF EXISTS vendas_por_vendedor_7d CASCADE;
DROP VIEW IF EXISTS vendas_por_dia CASCADE;

CREATE OR REPLACE VIEW vendas_por_dia AS
WITH all_sales AS (
    -- 1. Vendas marcadas como status='vendido'/'comprado' em leads_manos_crm
    SELECT
        DATE(COALESCE(l.won_at, l.updated_at, l.created_at)) AS dia,
        l.id::text AS lead_id,
        l.assigned_consultant_id AS consultant_id,
        COALESCE(l.name, 'Sem nome') AS lead_name,
        l.vehicle_interest AS veiculo,
        0::DECIMAL AS sale_value,
        'leads_manos_crm' AS fonte
    FROM leads_manos_crm l
    WHERE LOWER(COALESCE(l.status, '')) IN ('vendido', 'comprado', 'venda', 'closed', 'fechado', 'ganho')

    UNION ALL

    -- 2. Vendas marcadas em leads_compra
    SELECT
        DATE(COALESCE(c.updated_at, c.criado_em)),
        c.id::text,
        c.assigned_consultant_id,
        COALESCE(c.nome, 'Sem nome'),
        c.veiculo_original,
        0::DECIMAL,
        'leads_compra'
    FROM leads_compra c
    WHERE LOWER(COALESCE(c.status, '')) IN ('vendido', 'comprado')

    UNION ALL

    -- 3. Vendas em sales_manos_crm (Prioritária para valor e nome)
    SELECT
        DATE(COALESCE(s.sale_date, s.created_at)) AS dia,
        COALESCE(s.lead_id::text, 'sale_' || s.id::text) AS lead_id,
        s.consultant_id,
        COALESCE(l.name, s.consultant_name, 'Venda Registrada') AS lead_name,
        s.vehicle_name,
        COALESCE(s.sale_value, 0)::DECIMAL,
        'sales_manos_crm'
    FROM sales_manos_crm s
    LEFT JOIN leads_manos_crm l ON l.id::text = s.lead_id::text
    WHERE NOT EXISTS (
        -- Evita duplicar se já contamos via status 'vendido' no mesmo dia
        SELECT 1 FROM leads_manos_crm l2 
        WHERE l2.id::text = s.lead_id::text 
        AND LOWER(COALESCE(l2.status, '')) IN ('vendido', 'comprado', 'venda', 'closed', 'fechado', 'ganho')
        AND DATE(COALESCE(l2.won_at, l2.updated_at, l2.created_at)) = DATE(COALESCE(s.sale_date, s.created_at))
    )
)
SELECT
    dia,
    COUNT(*) AS vendas,
    COUNT(DISTINCT consultant_id) FILTER (WHERE consultant_id IS NOT NULL) AS vendedores_ativos,
    COALESCE(SUM(sale_value), 0)::DECIMAL AS valor_total,
    -- Detalhe por fonte (debug)
    COUNT(*) FILTER (WHERE fonte = 'leads_manos_crm') AS via_status_lead,
    COUNT(*) FILTER (WHERE fonte = 'sales_manos_crm') AS via_sales_table,
    COUNT(*) FILTER (WHERE fonte = 'leads_compra') AS via_compra
FROM all_sales
WHERE dia IS NOT NULL
GROUP BY dia
ORDER BY dia DESC;

-- View resumo: vendas por vendedor por janela
CREATE OR REPLACE VIEW vendas_por_vendedor_7d AS
WITH all_recent_sales AS (
    SELECT
        l.assigned_consultant_id AS consultant_id,
        l.id::text AS lead_id,
        0::DECIMAL AS sale_value
    FROM leads_manos_crm l
    WHERE LOWER(COALESCE(l.status, '')) IN ('vendido', 'comprado', 'venda', 'closed', 'fechado', 'ganho')
      AND DATE(COALESCE(l.won_at, l.updated_at, l.created_at)) >= DATE(NOW() - INTERVAL '7 days')

    UNION ALL

    SELECT
        s.consultant_id,
        COALESCE(s.lead_id::text, 'sale_' || s.id::text),
        COALESCE(s.sale_value, 0)::DECIMAL
    FROM sales_manos_crm s
    WHERE DATE(COALESCE(s.sale_date, s.created_at)) >= DATE(NOW() - INTERVAL '7 days')
      AND NOT EXISTS (
        SELECT 1 FROM leads_manos_crm l2 
        WHERE l2.id::text = s.lead_id::text 
        AND LOWER(COALESCE(l2.status, '')) IN ('vendido', 'comprado', 'venda', 'closed', 'fechado', 'ganho')
        AND DATE(COALESCE(l2.won_at, l2.updated_at, l2.created_at)) = DATE(COALESCE(s.sale_date, s.created_at))
      )
)
SELECT
    c.id AS consultant_id,
    c.name AS consultant_name,
    COUNT(v.lead_id) AS vendas_7d,
    COALESCE(SUM(v.sale_value), 0)::DECIMAL AS faturamento_7d
FROM consultants_manos_crm c
LEFT JOIN all_recent_sales v ON v.consultant_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.name
ORDER BY vendas_7d DESC, faturamento_7d DESC;

-- View 30d (mais útil pra ciclo automotivo)
CREATE OR REPLACE VIEW vendas_por_vendedor_30d AS
WITH all_recent_sales AS (
    SELECT
        l.assigned_consultant_id AS consultant_id,
        l.id::text AS lead_id,
        0::DECIMAL AS sale_value
    FROM leads_manos_crm l
    WHERE LOWER(COALESCE(l.status, '')) IN ('vendido', 'comprado', 'venda', 'closed', 'fechado', 'ganho')
      AND DATE(COALESCE(l.won_at, l.updated_at, l.created_at)) >= DATE(NOW() - INTERVAL '30 days')

    UNION ALL

    SELECT
        s.consultant_id,
        COALESCE(s.lead_id::text, 'sale_' || s.id::text),
        COALESCE(s.sale_value, 0)::DECIMAL
    FROM sales_manos_crm s
    WHERE DATE(COALESCE(s.sale_date, s.created_at)) >= DATE(NOW() - INTERVAL '30 days')
      AND NOT EXISTS (
        SELECT 1 FROM leads_manos_crm l2 
        WHERE l2.id::text = s.lead_id::text 
        AND LOWER(COALESCE(l2.status, '')) IN ('vendido', 'comprado', 'venda', 'closed', 'fechado', 'ganho')
        AND DATE(COALESCE(l2.won_at, l2.updated_at, l2.created_at)) = DATE(COALESCE(s.sale_date, s.created_at))
      )
)
SELECT
    c.id AS consultant_id,
    c.name AS consultant_name,
    COUNT(v.lead_id) AS vendas_30d,
    COALESCE(SUM(v.sale_value), 0)::DECIMAL AS faturamento_30d,
    ROUND(COUNT(v.lead_id)::DECIMAL / 30, 2) AS vendas_por_dia_media
FROM consultants_manos_crm c
LEFT JOIN all_recent_sales v ON v.consultant_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.name
ORDER BY vendas_30d DESC, faturamento_30d DESC;

-- Validação final
DO $$
DECLARE
    v_total_dias INT;
    v_total_vendas INT;
BEGIN
    SELECT COUNT(*) INTO v_total_dias FROM vendas_por_dia;
    RAISE NOTICE 'vendas_por_dia: % linhas (cada uma é um dia com venda)', v_total_dias;

    SELECT COUNT(*) INTO v_total_dias FROM vendas_por_dia WHERE dia >= DATE(NOW() - INTERVAL '30 days');
    RAISE NOTICE 'vendas últimos 30 dias: % dias', v_total_dias;

    SELECT SUM(vendas) INTO v_total_vendas FROM vendas_por_dia WHERE dia >= DATE(NOW() - INTERVAL '30 days');
    RAISE NOTICE 'TOTAL DE VENDAS últimos 30 dias: %', COALESCE(v_total_vendas, 0);
END $$;
