-- Migration: Add leadsfacebook support to permanently_delete_lead function
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
    -- Captura telefone e nome antes de deletar
    IF p_lead_table = 'leads_manos_crm' THEN
        SELECT phone, name INTO v_phone, v_name FROM leads_manos_crm WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_distribuicao_crm_26' THEN
        SELECT telefone, nome INTO v_phone, v_name FROM leads_distribuicao_crm_26 WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_compra' THEN
        SELECT telefone, nome INTO v_phone, v_name FROM leads_compra WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_master' THEN
        SELECT phone, name INTO v_phone, v_name FROM leads_master WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leadsfacebook' THEN
        SELECT phone, name INTO v_phone, v_name FROM leadsfacebook WHERE id::text = p_lead_id;
    ELSE
        RAISE EXCEPTION 'Tabela inválida: %', p_lead_table;
    END IF;

    -- Normaliza telefone (só dígitos)
    v_phone := regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g');

    -- Sem telefone? lead já não existe — retorna noop
    IF v_phone IS NULL OR v_phone = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found_or_no_phone');
    END IF;

    -- Cascata: deleta registros relacionados em 9 tabelas
    DELETE FROM ai_sdr_queue WHERE lead_id = p_lead_id AND lead_table = p_lead_table;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_count_log := v_count_log || jsonb_build_object('ai_sdr_queue', v_deleted);

    BEGIN
        DELETE FROM whatsapp_messages WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('whatsapp_messages', v_deleted);
    EXCEPTION WHEN OTHERS THEN v_count_log := v_count_log || jsonb_build_object('whatsapp_messages_err', SQLERRM);
    END;

    BEGIN
        DELETE FROM whatsapp_send_log WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('whatsapp_send_log', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM interactions_manos_crm WHERE lead_id::text = p_lead_id OR lead_id_v1 = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('interactions', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM follow_ups WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('follow_ups', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM historico_followup WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('historico_followup', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM cowork_alerts WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('cowork_alerts', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM sla_escalations WHERE lead_id::text = p_lead_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('sla_escalations', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DELETE FROM consultant_active_chats WHERE lead_phone = v_phone;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_count_log := v_count_log || jsonb_build_object('active_chats', v_deleted);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Deleta o lead em si
    IF p_lead_table = 'leads_manos_crm' THEN
        DELETE FROM leads_manos_crm WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_distribuicao_crm_26' THEN
        DELETE FROM leads_distribuicao_crm_26 WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_compra' THEN
        DELETE FROM leads_compra WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leads_master' THEN
        DELETE FROM leads_master WHERE id::text = p_lead_id;
    ELSIF p_lead_table = 'leadsfacebook' THEN
        DELETE FROM leadsfacebook WHERE id::text = p_lead_id;
    END IF;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_count_log := v_count_log || jsonb_build_object('lead_row', v_deleted);

    -- Adiciona telefone à blocklist
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
