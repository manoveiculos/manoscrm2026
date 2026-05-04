-- View vendas_por_dia
--
-- Mede CONVERSÃO pelo dia em que a venda fechou (won_at), não pelo dia em
-- que o lead foi criado. No setor automotivo, lead chega hoje e fecha em
-- 30-60 dias — medir por created_at esconde quem está vendendo bem agora.

CREATE OR REPLACE VIEW vendas_por_dia AS
WITH all_sales AS (
    -- 1. Vendas via lead.status='vendido'/'comprado'
    SELECT
        DATE(COALESCE(l.won_at, l.updated_at)) AS dia,
        l.id::text AS lead_id,
        l.assigned_consultant_id AS consultant_id,
        l.name AS lead_name,
        l.vehicle_interest AS veiculo,
        NULL::DECIMAL AS sale_value,
        l.created_at AS lead_created_at,
        EXTRACT(DAYS FROM (COALESCE(l.won_at, l.updated_at) - l.created_at)) AS dias_ate_vender
    FROM leads_manos_crm l
    WHERE LOWER(COALESCE(l.status, '')) IN ('vendido', 'comprado')

    UNION ALL

    SELECT
        DATE(c.updated_at) AS dia,
        c.id::text,
        c.assigned_consultant_id,
        c.nome,
        c.veiculo_original,
        NULL::DECIMAL,
        c.criado_em,
        EXTRACT(DAYS FROM (c.updated_at - c.criado_em))
    FROM leads_compra c
    WHERE LOWER(COALESCE(c.status, '')) IN ('vendido', 'comprado')

    UNION ALL

    -- 2. Vendas em sales_manos_crm (caso lead.status não tenha sido atualizado)
    SELECT
        DATE(s.sale_date) AS dia,
        s.lead_id::text,
        s.consultant_id,
        s.consultant_name AS lead_name,
        s.vehicle_name AS veiculo,
        s.sale_value::DECIMAL,
        s.sale_date AS lead_created_at,
        0 AS dias_ate_vender
    FROM sales_manos_crm s
    WHERE NOT EXISTS (
        -- evita duplicar quando o lead já apareceu acima
        SELECT 1 FROM leads_manos_crm lm
        WHERE lm.id::text = s.lead_id::text
          AND LOWER(COALESCE(lm.status, '')) IN ('vendido', 'comprado')
    )
)
SELECT
    dia,
    COUNT(DISTINCT lead_id) AS vendas,
    COUNT(DISTINCT consultant_id) FILTER (WHERE consultant_id IS NOT NULL) AS vendedores_ativos,
    SUM(COALESCE(sale_value, 0))::DECIMAL AS valor_total,
    AVG(NULLIF(dias_ate_vender, 0))::DECIMAL(10,1) AS dias_medio_ate_vender
FROM all_sales
WHERE dia IS NOT NULL
GROUP BY dia
ORDER BY dia DESC;

-- View resumo: KPIs por janela (7d / 30d / 90d) por vendedor
CREATE OR REPLACE VIEW vendas_por_vendedor_7d AS
SELECT
    c.id AS consultant_id,
    c.name AS consultant_name,
    COUNT(DISTINCT v.lead_id) AS vendas_7d,
    SUM(COALESCE(v.sale_value, 0))::DECIMAL AS faturamento_7d
FROM consultants_manos_crm c
LEFT JOIN (
    SELECT
        l.assigned_consultant_id AS consultant_id,
        l.id::text AS lead_id,
        NULL::DECIMAL AS sale_value
    FROM leads_manos_crm l
    WHERE LOWER(COALESCE(l.status, '')) IN ('vendido', 'comprado')
      AND COALESCE(l.won_at, l.updated_at) >= NOW() - INTERVAL '7 days'

    UNION ALL

    SELECT s.consultant_id, s.lead_id::text, s.sale_value::DECIMAL
    FROM sales_manos_crm s
    WHERE s.sale_date >= NOW() - INTERVAL '7 days'
) v ON v.consultant_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.name
ORDER BY vendas_7d DESC;
