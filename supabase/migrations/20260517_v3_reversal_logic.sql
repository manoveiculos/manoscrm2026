-- Migração V3 - Reversão, Performance e Inbox
-- Data: 2026-05-14

-- 1. Desativar contato automático para LEADS NOVOS (IA SDR deve focar em reversão)
DROP TRIGGER IF EXISTS trg_enqueue_ai_sdr ON leads_manos_crm;
DROP TRIGGER IF EXISTS trg_enqueue_ai_sdr ON leads_distribuicao_crm_26;
DROP TRIGGER IF EXISTS trg_enqueue_ai_sdr ON leads_compra;

-- 2. Função do Agente de Reversão
-- Enfileira leads com status 'perdido' ou 'arquivado' para tentativa de reversão
CREATE OR REPLACE FUNCTION enqueue_reversal_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_diagnostico  TEXT;
    v_is_credit_issue BOOLEAN;
BEGIN
    -- Só atua se o status mudar para perdido ou arquivado
    IF LOWER(NEW.status) NOT IN ('perdido', 'arquivado', 'lost') THEN
        RETURN NEW;
    END IF;

    v_diagnostico := NEW.diagnostico_atendimento;

    -- FILTRO DE CRÉDITO (Rigoroso V3)
    -- Se o diagnóstico citar CPF Ruim, Sem margem ou Score baixo, o robô está PROIBIDO.
    v_is_credit_issue := (
        v_diagnostico ILIKE '%CPF Ruim%' OR 
        v_diagnostico ILIKE '%Sem margem%' OR 
        v_diagnostico ILIKE '%Score baixo%'
    );

    IF v_is_credit_issue THEN
        -- Marca como descarte financeiro para sumir do Inbox e não ser processado pela IA
        NEW.descarte_financeiro := true;
        -- Garante que está arquivado
        NEW.archived_at := NOW();
        NEW.archived_reason := 'descarte_financeiro_ia_filter';
        RETURN NEW;
    END IF;

    -- Se chegou aqui, enfileira para Reversão
    INSERT INTO ai_sdr_queue (lead_id, lead_table, payload, scheduled_at)
    VALUES (
        NEW.id::text,
        TG_TABLE_NAME,
        jsonb_build_object(
            'leadId', NEW.id::text,
            'isReversal', true,
            'diagnostico', v_diagnostico,
            'lastStatus', NEW.status
        ),
        NOW() + INTERVAL '30 minutes' -- Delay para análise da IA
    )
    ON CONFLICT (lead_id, lead_table) WHERE processed_at IS NULL 
    DO UPDATE SET 
        payload = EXCLUDED.payload,
        scheduled_at = EXCLUDED.scheduled_at;

    RETURN NEW;
END;
$$;

-- 3. Triggers de Reversão (AFTER UPDATE of status)
DROP TRIGGER IF EXISTS trg_enqueue_reversal ON leads_manos_crm;
CREATE TRIGGER trg_enqueue_reversal
    BEFORE UPDATE OF status ON leads_manos_crm
    FOR EACH ROW
    WHEN (NEW.status IN ('perdido', 'arquivado', 'lost') AND (OLD.status IS DISTINCT FROM NEW.status))
    EXECUTE FUNCTION enqueue_reversal_agent();

DROP TRIGGER IF EXISTS trg_enqueue_reversal ON leads_distribuicao_crm_26;
CREATE TRIGGER trg_enqueue_reversal
    BEFORE UPDATE OF status ON leads_distribuicao_crm_26
    FOR EACH ROW
    WHEN (NEW.status IN ('perdido', 'arquivado', 'lost') AND (OLD.status IS DISTINCT FROM NEW.status))
    EXECUTE FUNCTION enqueue_reversal_agent();

DROP TRIGGER IF EXISTS trg_enqueue_reversal ON leads_compra;
CREATE TRIGGER trg_enqueue_reversal
    BEFORE UPDATE OF status ON leads_compra
    FOR EACH ROW
    WHEN (NEW.status IN ('perdido', 'arquivado', 'lost') AND (OLD.status IS DISTINCT FROM NEW.status))
    EXECUTE FUNCTION enqueue_reversal_agent();
