-- =============================================================================
-- Anti-ban WhatsApp: throttling de 2-5min entre msgs da IA SDR
-- =============================================================================
--
-- Problema real (2026-05-11): Manos levou bloqueio do WhatsApp por padrão
-- de spam — várias mensagens em rajada (limit 20 do runner + trigger
-- agendava todas com mesmo delay 30s, então saíam quase juntas).
--
-- Fix em 3 camadas:
--   1. Trigger Postgres calcula scheduled_at baseado em MAX(scheduled_at)
--      dos pendentes + jitter random 2-5min. Garante que cada novo lead
--      sai 2-5min DEPOIS do último agendado.
--   2. Runner pega 1 job por execução (não 20) — duplo defesa.
--   3. scheduleFirstContact JS faz o mesmo cálculo.
--
-- Resultado: máximo 12-30 msgs/hora por instância Evolution. Ritmo humano.

CREATE OR REPLACE FUNCTION enqueue_ai_sdr_for_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lead_id          TEXT;
    v_lead_name        TEXT;
    v_lead_phone       TEXT;
    v_vehicle          TEXT;
    v_source           TEXT;
    v_flow             TEXT;
    v_table_name       TEXT := TG_TABLE_NAME;
    v_payload          JSONB;
    v_clean_phone      TEXT;
    v_last_pending     TIMESTAMPTZ;
    v_jitter_seconds   INT;
    v_scheduled_at     TIMESTAMPTZ;
BEGIN
    -- Pula se lead já foi contatado
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

    -- Blocklist (lead excluído antes)
    v_clean_phone := regexp_replace(v_lead_phone, '\D', '', 'g');
    IF EXISTS (SELECT 1 FROM lead_blocklist WHERE phone = v_clean_phone) THEN
        RAISE NOTICE 'Phone % na blocklist — não enfileira', v_clean_phone;
        RETURN NEW;
    END IF;

    -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    -- ANTI-BAN: calcula scheduled_at espaçado dos pendentes
    -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SELECT MAX(scheduled_at) INTO v_last_pending
    FROM ai_sdr_queue
    WHERE processed_at IS NULL;

    -- Jitter random 120-300s (2-5min)
    v_jitter_seconds := 120 + FLOOR(RANDOM() * 180)::int;

    -- Próximo envio: max(NOW+30s, último pendente + jitter)
    v_scheduled_at := GREATEST(
        NOW() + INTERVAL '30 seconds',
        COALESCE(v_last_pending, NOW()) + (v_jitter_seconds * INTERVAL '1 second')
    );

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
        VALUES (v_lead_id, v_table_name, v_payload, v_scheduled_at);
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    RETURN NEW;
END;
$$;

-- Validação: mostra quantos jobs estão na fila e o espaçamento médio
DO $$
DECLARE v_count INT; v_first TIMESTAMPTZ; v_last TIMESTAMPTZ;
BEGIN
    SELECT COUNT(*), MIN(scheduled_at), MAX(scheduled_at)
    INTO v_count, v_first, v_last
    FROM ai_sdr_queue WHERE processed_at IS NULL;
    RAISE NOTICE 'Fila atual: % jobs pendentes (de % a %)', v_count, v_first, v_last;
END $$;
