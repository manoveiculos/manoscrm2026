-- V3.7 - Faxina Geral e Ativação
-- Data: 2026-05-18
-- 1) Mata o produtor fantasma da ai_sdr_queue (contato inicial)
-- 2) Whitelist da trigger de reversão inclui lost_by_inactivity
-- 3) Marca itens órfãos da fila como processed (PURGE soft)
-- 4) Cria inactivity_alerts + monitor 8h + auto-lose 24h
-- 5) Recria leads_unified com phone mascarado para Fila Geral

-- =============================================================================
-- 1. KILL GHOST PRODUCER
-- =============================================================================
DROP TRIGGER IF EXISTS trg_enqueue_ai_sdr ON leads_manos_crm;
DROP TRIGGER IF EXISTS trg_enqueue_ai_sdr ON leads_distribuicao_crm_26;
DROP TRIGGER IF EXISTS trg_enqueue_ai_sdr ON leads_compra;
DROP FUNCTION IF EXISTS enqueue_ai_sdr_for_new_lead() CASCADE;

-- =============================================================================
-- 2. REVERSAL WHITELIST: add lost_by_inactivity
-- =============================================================================
CREATE OR REPLACE FUNCTION enqueue_reversal_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_diagnostico     TEXT;
    v_is_credit_issue BOOLEAN;
BEGIN
    IF LOWER(NEW.status) NOT IN ('perdido', 'arquivado', 'lost', 'lost_by_inactivity') THEN
        RETURN NEW;
    END IF;

    v_diagnostico := NEW.diagnostico_atendimento;

    v_is_credit_issue := (
        v_diagnostico ILIKE '%CPF Ruim%' OR
        v_diagnostico ILIKE '%Sem margem%' OR
        v_diagnostico ILIKE '%Score baixo%'
    );

    IF v_is_credit_issue THEN
        NEW.descarte_financeiro := true;
        NEW.archived_at := NOW();
        NEW.archived_reason := 'descarte_financeiro_ia_filter';
        RETURN NEW;
    END IF;

    INSERT INTO ai_sdr_queue (lead_id, lead_table, payload, scheduled_at)
    VALUES (
        NEW.id::text,
        TG_TABLE_NAME,
        jsonb_build_object(
            'leadId',     NEW.id::text,
            'isReversal', true,
            'diagnostico', v_diagnostico,
            'lastStatus', NEW.status
        ),
        NOW() + INTERVAL '30 minutes'
    )
    ON CONFLICT (lead_id, lead_table) WHERE processed_at IS NULL
    DO UPDATE SET
        payload = EXCLUDED.payload,
        scheduled_at = EXCLUDED.scheduled_at;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_reversal ON leads_manos_crm;
CREATE TRIGGER trg_enqueue_reversal
    BEFORE UPDATE OF status ON leads_manos_crm
    FOR EACH ROW
    WHEN (NEW.status IN ('perdido','arquivado','lost','lost_by_inactivity') AND (OLD.status IS DISTINCT FROM NEW.status))
    EXECUTE FUNCTION enqueue_reversal_agent();

DROP TRIGGER IF EXISTS trg_enqueue_reversal ON leads_distribuicao_crm_26;
CREATE TRIGGER trg_enqueue_reversal
    BEFORE UPDATE OF status ON leads_distribuicao_crm_26
    FOR EACH ROW
    WHEN (NEW.status IN ('perdido','arquivado','lost','lost_by_inactivity') AND (OLD.status IS DISTINCT FROM NEW.status))
    EXECUTE FUNCTION enqueue_reversal_agent();

DROP TRIGGER IF EXISTS trg_enqueue_reversal ON leads_compra;
CREATE TRIGGER trg_enqueue_reversal
    BEFORE UPDATE OF status ON leads_compra
    FOR EACH ROW
    WHEN (NEW.status IN ('perdido','arquivado','lost','lost_by_inactivity') AND (OLD.status IS DISTINCT FROM NEW.status))
    EXECUTE FUNCTION enqueue_reversal_agent();

-- =============================================================================
-- 3. PURGE SOFT da ai_sdr_queue: marca tudo que não é reversão como processado.
--    Mantém histórico (não DELETE), apenas tira do "pendente".
-- =============================================================================
UPDATE ai_sdr_queue
   SET processed_at = NOW(),
       last_error   = COALESCE(last_error, '') || ' | v37_purge:non_reversal'
 WHERE processed_at IS NULL
   AND COALESCE((payload->>'isReversal')::boolean, false) = false;

-- =============================================================================
-- 4. INACTIVITY ALERTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS inactivity_alerts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_uid      TEXT NOT NULL,
    lead_table    TEXT NOT NULL,
    lead_id       TEXT NOT NULL,
    consultor_id  UUID,
    kind          TEXT NOT NULL, -- 'warning_8h' | 'auto_lost_24h'
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    UNIQUE (lead_uid, kind)
);
CREATE INDEX IF NOT EXISTS idx_inactivity_alerts_consultor
    ON inactivity_alerts (consultor_id, acknowledged_at);

-- Função: detecta inatividade 8h (warning) e 24h (auto-lose)
CREATE OR REPLACE FUNCTION run_inactivity_monitor()
RETURNS TABLE (warnings INT, auto_lost INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_warn INT := 0;
    v_lost INT := 0;
    v_tmp  INT := 0;
BEGIN
    -- 8h warning (apenas se ainda não existir alerta deste tipo)
    WITH candidates AS (
        SELECT
            'leads_manos_crm:' || id::text AS uid,
            'leads_manos_crm' AS tbl,
            id::text AS lid,
            assigned_consultant_id AS cid
        FROM leads_manos_crm
        WHERE atendimento_iniciado_em IS NOT NULL
          AND ultima_interacao_humana < NOW() - INTERVAL '8 hours'
          AND LOWER(COALESCE(status,'')) NOT IN ('vendido','perdido','lost','lost_by_inactivity','arquivado','comprado')
          AND archived_at IS NULL
        UNION ALL
        SELECT
            'leads_distribuicao_crm_26:' || id::text,
            'leads_distribuicao_crm_26',
            id::text,
            assigned_consultant_id
        FROM leads_distribuicao_crm_26
        WHERE atendimento_iniciado_em IS NOT NULL
          AND ultima_interacao_humana < NOW() - INTERVAL '8 hours'
          AND LOWER(COALESCE(status,'')) NOT IN ('vendido','perdido','lost','lost_by_inactivity','arquivado','comprado')
          AND archived_at IS NULL
        UNION ALL
        SELECT
            'leads_compra:' || id::text,
            'leads_compra',
            id::text,
            assigned_consultant_id
        FROM leads_compra
        WHERE atendimento_iniciado_em IS NOT NULL
          AND ultima_interacao_humana < NOW() - INTERVAL '8 hours'
          AND LOWER(COALESCE(status,'')) NOT IN ('vendido','perdido','lost','lost_by_inactivity','arquivado','comprado')
          AND archived_at IS NULL
    ),
    inserted AS (
        INSERT INTO inactivity_alerts (lead_uid, lead_table, lead_id, consultor_id, kind)
        SELECT uid, tbl, lid, cid, 'warning_8h' FROM candidates
        ON CONFLICT (lead_uid, kind) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_warn FROM inserted;

    -- 24h auto-lose: muda status para lost_by_inactivity
    UPDATE leads_manos_crm
       SET status = 'lost_by_inactivity', updated_at = NOW()
     WHERE atendimento_iniciado_em IS NOT NULL
       AND ultima_interacao_humana < NOW() - INTERVAL '24 hours'
       AND LOWER(COALESCE(status,'')) NOT IN ('vendido','perdido','lost','lost_by_inactivity','arquivado','comprado')
       AND archived_at IS NULL;
    GET DIAGNOSTICS v_lost = ROW_COUNT;

    UPDATE leads_distribuicao_crm_26
       SET status = 'lost_by_inactivity', atualizado_em = NOW()
     WHERE atendimento_iniciado_em IS NOT NULL
       AND ultima_interacao_humana < NOW() - INTERVAL '24 hours'
       AND LOWER(COALESCE(status,'')) NOT IN ('vendido','perdido','lost','lost_by_inactivity','arquivado','comprado')
       AND archived_at IS NULL;
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_lost := v_lost + v_tmp;

    UPDATE leads_compra
       SET status = 'lost_by_inactivity', updated_at = NOW()
     WHERE atendimento_iniciado_em IS NOT NULL
       AND ultima_interacao_humana < NOW() - INTERVAL '24 hours'
       AND LOWER(COALESCE(status,'')) NOT IN ('vendido','perdido','lost','lost_by_inactivity','arquivado','comprado')
       AND archived_at IS NULL;
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_lost := v_lost + v_tmp;

    -- Registra alerta de auto-perda
    INSERT INTO inactivity_alerts (lead_uid, lead_table, lead_id, consultor_id, kind)
    SELECT
        tbl || ':' || lid, tbl, lid, cid, 'auto_lost_24h'
    FROM (
        SELECT 'leads_manos_crm' tbl, id::text lid, assigned_consultant_id cid
          FROM leads_manos_crm WHERE status = 'lost_by_inactivity' AND updated_at > NOW() - INTERVAL '5 minutes'
        UNION ALL
        SELECT 'leads_distribuicao_crm_26', id::text, assigned_consultant_id
          FROM leads_distribuicao_crm_26 WHERE status = 'lost_by_inactivity' AND atualizado_em > NOW() - INTERVAL '5 minutes'
        UNION ALL
        SELECT 'leads_compra', id::text, assigned_consultant_id
          FROM leads_compra WHERE status = 'lost_by_inactivity' AND updated_at > NOW() - INTERVAL '5 minutes'
    ) freshly_lost
    ON CONFLICT (lead_uid, kind) DO NOTHING;

    RETURN QUERY SELECT v_warn, v_lost;
END;
$$;

-- Agendamento pg_cron a cada 15 minutos
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('manos_inactivity_monitor')
        FROM cron.job WHERE jobname = 'manos_inactivity_monitor';
        PERFORM cron.schedule(
            'manos_inactivity_monitor',
            '*/15 * * * *',
            $cron$ SELECT run_inactivity_monitor(); $cron$
        );
    END IF;
END $$;

-- =============================================================================
-- 5. VIEWS UNIFIED com phone mascarado quando NÃO há consultor
-- =============================================================================
-- Helper inline: regex que mantém os 4 primeiros dígitos e os 2-4 últimos
CREATE OR REPLACE FUNCTION mask_phone_for_pesca(p_phone TEXT, p_consultant UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_consultant IS NOT NULL THEN p_phone
        WHEN p_phone IS NULL OR LENGTH(p_phone) < 8 THEN p_phone
        ELSE LEFT(p_phone, 4) || REPEAT('*', GREATEST(LENGTH(p_phone) - 6, 1)) || RIGHT(p_phone, 2)
    END;
$$;

DROP VIEW IF EXISTS leads_unified_active CASCADE;
DROP VIEW IF EXISTS leads_unified CASCADE;

CREATE VIEW leads_unified AS
SELECT
    'leads_manos_crm:' || l.id::text                       AS uid,
    'leads_manos_crm'                                      AS table_name,
    l.id::text                                             AS native_id,
    l.name                                                 AS name,
    mask_phone_for_pesca(l.phone, l.assigned_consultant_id) AS phone,
    l.vehicle_interest                                     AS vehicle_interest,
    l.source                                               AS source,
    l.ai_score                                             AS ai_score,
    l.ai_classification                                    AS ai_classification,
    l.status                                               AS status,
    l.proxima_acao                                         AS proxima_acao,
    l.assigned_consultant_id                               AS assigned_consultant_id,
    l.created_at                                           AS created_at,
    l.updated_at                                           AS updated_at,
    l.first_contact_at                                     AS first_contact_at,
    l.atendimento_iniciado_em                              AS atendimento_iniciado_em,
    l.atendimento_iniciado_por                             AS atendimento_iniciado_por,
    l.flagged_reversao                                     AS flagged_reversao,
    l.ultima_interacao_humana                              AS ultima_interacao_humana,
    l.diagnostico_atendimento                              AS diagnostico_atendimento,
    l.respondeu_follow_up                                  AS respondeu_follow_up,
    l.descarte_financeiro                                  AS descarte_financeiro,
    l.archived_at                                          AS archived_at,
    l.first_contact_channel                                AS first_contact_channel,
    'venda'                                                AS flow_type
FROM leads_manos_crm l
UNION ALL
SELECT
    'leads_compra:' || c.id::text,
    'leads_compra',
    c.id::text,
    c.nome,
    mask_phone_for_pesca(c.telefone, c.assigned_consultant_id),
    c.veiculo_original,
    c.origem,
    c.ai_score,
    c.ai_classification,
    c.status,
    c.proxima_acao,
    c.assigned_consultant_id,
    c.criado_em,
    c.updated_at,
    c.first_contact_at,
    c.atendimento_iniciado_em,
    c.atendimento_iniciado_por,
    c.flagged_reversao,
    c.ultima_interacao_humana,
    c.diagnostico_atendimento,
    c.respondeu_follow_up,
    c.descarte_financeiro,
    c.archived_at,
    c.first_contact_channel,
    'compra'
FROM leads_compra c
UNION ALL
SELECT
    'leads_distribuicao_crm_26:' || d.id::text,
    'leads_distribuicao_crm_26',
    d.id::text,
    d.nome,
    mask_phone_for_pesca(d.telefone, d.assigned_consultant_id),
    NULL,
    d.origem,
    d.ai_score,
    d.ai_classification,
    d.status,
    NULL,
    d.assigned_consultant_id,
    d.criado_em,
    d.atualizado_em,
    d.first_contact_at,
    d.atendimento_iniciado_em,
    d.atendimento_iniciado_por,
    d.flagged_reversao,
    d.ultima_interacao_humana,
    d.diagnostico_atendimento,
    d.respondeu_follow_up,
    d.descarte_financeiro,
    d.archived_at,
    d.first_contact_channel,
    'venda'
FROM leads_distribuicao_crm_26 d;

CREATE VIEW leads_unified_active AS
SELECT * FROM leads_unified
WHERE LOWER(COALESCE(status, '')) NOT IN
    ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity');

-- Recria lead_kpis_daily (foi dropado em CASCADE acima)
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
