-- =============================================================================
-- Exclusão DEFINITIVA de lead — à prova de retorno do n8n
-- =============================================================================
--
-- Problema: hoje DELETE FROM leads_X só remove o lead, mas:
--   1. Deixa órfãos em 9 tabelas relacionadas (whatsapp_messages, interactions,
--      follow_ups, ai_sdr_queue, historico_followup, cowork_alerts, sla_escalations,
--      consultant_active_chats, whatsapp_send_log).
--   2. N8N re-cria o mesmo lead em segundos quando cliente entra pelo Google de
--      novo. Trigger AFTER INSERT re-enfileira IA SDR. Lead "volta zumbi".
--
-- Solução em 2 partes:
--   A) lead_blocklist por telefone — entrada bloqueia INSERT futuro.
--   B) permanently_delete_lead() — função SQL que faz cascade em 9 tabelas e
--      adiciona telefone à blocklist em uma única transação.

-- =============================================================================
-- 1. Tabela de bloqueio
-- =============================================================================
CREATE TABLE IF NOT EXISTS lead_blocklist (
    phone        TEXT PRIMARY KEY,
    reason       TEXT,
    deleted_by   TEXT,           -- email ou nome do consultor que excluiu
    deleted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lead_name    TEXT,
    last_table   TEXT
);

ALTER TABLE lead_blocklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON lead_blocklist;
CREATE POLICY "service_role only" ON lead_blocklist
    FOR ALL TO authenticated
    USING (false);

CREATE INDEX IF NOT EXISTS idx_blocklist_deleted_at ON lead_blocklist (deleted_at DESC);

-- =============================================================================
-- 2. Função principal — exclusão atômica em 9 tabelas + blocklist
-- =============================================================================
CREATE OR REPLACE FUNCTION permanently_delete_lead(
    p_lead_id    TEXT,
    p_lead_table TEXT,
    p_reason     TEXT DEFAULT 'manual',
    p_deleted_by TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_phone     TEXT;
    v_name      TEXT;
    v_count_log JSONB := '{}'::jsonb;
    v_deleted   INT;
BEGIN
    -- Captura telefone e nome antes de deletar (pra registrar na blocklist)
    IF p_lead_table = 'leads_manos_crm' THEN
        SELECT phone, name INTO v_phone, v_name FROM leads_manos_crm WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_distribuicao_crm_26' THEN
        SELECT telefone, nome INTO v_phone, v_name FROM leads_distribuicao_crm_26 WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_compra' THEN
        SELECT telefone, nome INTO v_phone, v_name FROM leads_compra WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_master' THEN
        SELECT phone, name INTO v_phone, v_name FROM leads_master WHERE id::text = p_lead_id;
    ELSE
        RAISE EXCEPTION 'Tabela inválida: %', p_lead_table;
    END IF;

    -- Normaliza telefone (só dígitos)
    v_phone := regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g');

    -- Sem telefone? lead já não existe — retorna noop
    IF v_phone IS NULL OR v_phone = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found_or_no_phone');
    END IF;

    -- ─────────────────────────────────────────────────────
    -- Cascata: deleta registros relacionados em 9 tabelas
    -- ─────────────────────────────────────────────────────

    -- 1. ai_sdr_queue (pendente impede que IA SDR continue tentando)
    DELETE FROM ai_sdr_queue WHERE lead_id = p_lead_id AND lead_table = p_lead_table;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_count_log := v_count_log || jsonb_build_object('ai_sdr_queue', v_deleted);

    -- 2. whatsapp_messages (filtra por lead_id text e int)
    BEGIN
        DELETE FROM whatsapp_messages WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('whatsapp_messages', v_deleted);
    EXCEPTION WHEN OTHERS THEN v_count_log := v_count_log || jsonb_build_object('whatsapp_messages_err', SQLERRM);
    END;

    -- 3. whatsapp_send_log
    BEGIN
        DELETE FROM whatsapp_send_log WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('whatsapp_send_log', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 4. interactions_manos_crm
    BEGIN
        DELETE FROM interactions_manos_crm WHERE lead_id::text = p_lead_id OR lead_id_v1 = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('interactions', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 5. follow_ups
    BEGIN
        DELETE FROM follow_ups WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('follow_ups', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 6. historico_followup
    BEGIN
        DELETE FROM historico_followup WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('historico_followup', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 7. cowork_alerts
    BEGIN
        DELETE FROM cowork_alerts WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('cowork_alerts', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 8. sla_escalations
    BEGIN
        DELETE FROM sla_escalations WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('sla_escalations', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 9. consultant_active_chats (via phone)
    BEGIN
        DELETE FROM consultant_active_chats WHERE lead_phone = v_phone;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('active_chats', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- ─────────────────────────────────────────────────────
    -- Deleta o lead em si
    -- ─────────────────────────────────────────────────────
    IF p_lead_table = 'leads_manos_crm' THEN
        DELETE FROM leads_manos_crm WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_distribuicao_crm_26' THEN
        DELETE FROM leads_distribuicao_crm_26 WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_compra' THEN
        DELETE FROM leads_compra WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_master' THEN
        DELETE FROM leads_master WHERE id::text = p_lead_id;
    END IF;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_count_log := v_count_log || jsonb_build_object('lead_row', v_deleted);

    -- ─────────────────────────────────────────────────────
    -- Adiciona telefone à blocklist (idempotente)
    -- ─────────────────────────────────────────────────────
    INSERT INTO lead_blocklist (phone, reason, deleted_by, lead_name, last_table)
    VALUES (v_phone, COALESCE(p_reason, 'manual'), p_deleted_by, v_name, p_lead_table)
    ON CONFLICT (phone) DO UPDATE SET
        reason     = EXCLUDED.reason,
        deleted_by = EXCLUDED.deleted_by,
        deleted_at = NOW(),
        lead_name  = COALESCE(EXCLUDED.lead_name, lead_blocklist.lead_name);

    RETURN jsonb_build_object(
        'ok', true,
        'phone', v_phone,
        'deleted', v_count_log
    );
END;
$$;

-- =============================================================================
-- 3. Atualiza trigger enqueue_ai_sdr_for_new_lead pra respeitar blocklist
-- =============================================================================
-- (Mantém o resto da lógica; só adiciona check de blocklist no início.)
CREATE OR REPLACE FUNCTION enqueue_ai_sdr_for_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lead_id      TEXT;
    v_lead_name    TEXT;
    v_lead_phone   TEXT;
    v_vehicle      TEXT;
    v_source       TEXT;
    v_flow         TEXT;
    v_table_name   TEXT := TG_TABLE_NAME;
    v_payload      JSONB;
    v_clean_phone  TEXT;
BEGIN
    -- Pula se lead já tem first_contact_at
    IF NEW.first_contact_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Mapeia campos por tabela
    IF v_table_name = 'leads_manos_crm' THEN
        v_lead_id := NEW.id::text;
        v_lead_name := NEW.name;
        v_lead_phone := NEW.phone;
        v_vehicle := NEW.vehicle_interest;
        v_source := COALESCE(NEW.source, 'unknown');
        v_flow := 'venda';
    ELSIF v_table_name = 'leads_distribuicao_crm_26' THEN
        v_lead_id := NEW.id::text;
        v_lead_name := NEW.nome;
        v_lead_phone := NEW.telefone;
        v_vehicle := NEW.interesse;
        v_source := COALESCE(NEW.origem, 'unknown');
        v_flow := 'venda';
    ELSIF v_table_name = 'leads_compra' THEN
        v_lead_id := NEW.id::text;
        v_lead_name := NEW.nome;
        v_lead_phone := NEW.telefone;
        v_vehicle := NEW.veiculo_original;
        v_source := COALESCE(NEW.origem, 'unknown');
        v_flow := 'compra';
    ELSE
        RETURN NEW;
    END IF;

    -- Telefone obrigatório
    IF v_lead_phone IS NULL OR LENGTH(TRIM(v_lead_phone)) < 8 THEN
        RETURN NEW;
    END IF;

    -- ⛔ NOVO: telefone na blocklist? Lead foi excluído antes — não enfileira.
    v_clean_phone := regexp_replace(v_lead_phone, '\D', '', 'g');
    IF EXISTS (SELECT 1 FROM lead_blocklist WHERE phone = v_clean_phone) THEN
        RAISE NOTICE 'Lead com phone % na blocklist — não enfileira AI SDR', v_clean_phone;
        RETURN NEW;
    END IF;

    -- Monta payload
    v_payload := jsonb_build_object(
        'leadId',          v_lead_id,
        'leadName',        v_lead_name,
        'leadPhone',       v_lead_phone,
        'vehicleInterest', v_vehicle,
        'source',          v_source,
        'consultantName',  NULL,
        'flow',            v_flow
    );

    BEGIN
        INSERT INTO ai_sdr_queue (lead_id, lead_table, payload, scheduled_at)
        VALUES (
            v_lead_id,
            v_table_name,
            v_payload,
            NOW() + INTERVAL '30 seconds'
        );
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    RETURN NEW;
END;
$$;
