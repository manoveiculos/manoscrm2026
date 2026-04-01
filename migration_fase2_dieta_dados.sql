-- ============================================================
-- FASE 2: DIETA DE DADOS — RPCs para eliminar sobrecarga
-- Executar no Supabase SQL Editor ANTES do deploy do frontend
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. RPC: get_avg_response_time
--    Substitui as 20+ chamadas sequenciais do frontend por 1 query
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_avg_response_time(
    p_since TIMESTAMPTZ,
    p_consultant_id TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result INTEGER;
BEGIN
    SELECT COALESCE(ROUND(AVG(diff_min))::INTEGER, 0)
    INTO v_result
    FROM (
        SELECT
            EXTRACT(EPOCH FROM (fi.first_interaction_at - l.created_at)) / 60.0 AS diff_min
        FROM leads l
        INNER JOIN LATERAL (
            SELECT MIN(i.created_at) AS first_interaction_at
            FROM interactions_manos_crm i
            WHERE i.lead_id = l.id::TEXT
        ) fi ON fi.first_interaction_at IS NOT NULL
        WHERE l.created_at >= p_since
          AND l.status NOT IN ('perdido', 'lost', 'desqualificado')
          AND (p_consultant_id IS NULL OR l.assigned_consultant_id = p_consultant_id)
    ) sub
    WHERE diff_min > 0.08       -- Ignora bots (< 5s)
      AND diff_min < 21600;     -- Ignora outliers (> 15 dias)

    RETURN v_result;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. RPC: get_analytics_summary
--    Retorna métricas agregadas em 1 query em vez de 3000 leads
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_analytics_summary(
    p_consultant_id TEXT DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH filtered AS (
        SELECT
            l.id,
            l.status,
            l.source,
            l.origem,
            l.ai_score,
            l.ai_classification,
            l.assigned_consultant_id,
            l.response_time_seconds,
            l.created_at
        FROM leads l
        WHERE (p_start_date IS NULL OR l.created_at >= p_start_date)
          AND l.created_at <= p_end_date
          AND (p_consultant_id IS NULL OR l.assigned_consultant_id = p_consultant_id)
    ),
    funnel AS (
        SELECT
            CASE
                WHEN status IN ('new','received','entrada','novo')              THEN 'entrada'
                WHEN status IN ('attempt','contacted','triagem')                THEN 'triagem'
                WHEN status IN ('confirmed','scheduled','visited','ataque')     THEN 'ataque'
                WHEN status IN ('test_drive','proposed','negotiation','fechamento') THEN 'fechamento'
                WHEN status IN ('closed','vendido','post_sale','comprado')      THEN 'vendido'
                WHEN status IN ('lost','perdido','desqualificado','lixo','duplicado','sem contato','perda total','lost_redistributed') THEN 'perdido'
                ELSE 'outro'
            END AS stage,
            COUNT(*) AS cnt
        FROM filtered
        GROUP BY stage
    ),
    sources AS (
        SELECT COALESCE(NULLIF(origem, ''), NULLIF(source, ''), 'direto') AS src, COUNT(*) AS cnt
        FROM filtered
        GROUP BY src
    ),
    scores AS (
        SELECT
            COUNT(*) FILTER (WHERE ai_classification = 'hot')  AS hot,
            COUNT(*) FILTER (WHERE ai_classification = 'warm') AS warm,
            COUNT(*) FILTER (WHERE ai_classification = 'cold' OR ai_classification IS NULL) AS cold
        FROM filtered
    ),
    response AS (
        SELECT
            CASE WHEN COUNT(*) FILTER (WHERE response_time_seconds > 0) > 0
                THEN ROUND(AVG(response_time_seconds) FILTER (WHERE response_time_seconds > 0) / 60.0)::INTEGER
                ELSE 0
            END AS avg_min
        FROM filtered
    )
    SELECT jsonb_build_object(
        'total_leads',     (SELECT COUNT(*) FROM filtered),
        'closed_leads',    COALESCE((SELECT cnt FROM funnel WHERE stage = 'vendido'), 0),
        'lost_leads',      COALESCE((SELECT cnt FROM funnel WHERE stage = 'perdido'), 0),
        'conversion_rate', CASE
            WHEN (SELECT COUNT(*) FROM filtered) > 0
            THEN ROUND(
                COALESCE((SELECT cnt FROM funnel WHERE stage = 'vendido'), 0)::NUMERIC
                / (SELECT COUNT(*) FROM filtered) * 100, 1
            )
            ELSE 0
        END,
        'avg_response_min', (SELECT avg_min FROM response),
        'funnel',          COALESCE((SELECT jsonb_object_agg(stage, cnt) FROM funnel), '{}'),
        'sources',         COALESCE((SELECT jsonb_object_agg(src, cnt) FROM sources ORDER BY cnt DESC), '{}'),
        'score_distribution', (SELECT row_to_json(scores)::JSONB FROM scores)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. Índices para performance das RPCs
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_created_status
    ON leads_manos_crm (created_at, status);

CREATE INDEX IF NOT EXISTS idx_leads_consultant_created
    ON leads_manos_crm (assigned_consultant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_interactions_lead_created
    ON interactions_manos_crm (lead_id, created_at ASC);

-- ──────────────────────────────────────────────────────────────
-- GRANTS
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_avg_response_time TO authenticated;
GRANT EXECUTE ON FUNCTION get_avg_response_time TO service_role;
GRANT EXECUTE ON FUNCTION get_analytics_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_summary TO service_role;
