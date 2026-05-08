-- =============================================================================
-- Trigger universal: TODO lead novo (qualquer origem) entra na fila de IA SDR
-- =============================================================================
--
-- Por que? Auditoria revelou que 17 leads/24h entram em leads_distribuicao_crm_26
-- BYPASSING nossos webhooks (provável: n8n grava direto). Resultado: scheduleFirstContact
-- nunca é chamado, ai_sdr_queue fica vazia, IA dorme, leads morrem órfãos.
--
-- Solução: trigger AFTER INSERT em cada tabela de leads que enfileira automaticamente.
-- Funciona pra QUALQUER origem (webhook, n8n, script, dashboard, importação).
--
-- Idempotência: ai_sdr_queue tem unique index em (lead_id, lead_table) WHERE NOT processed.
-- Se webhook + trigger inserirem o mesmo lead, o segundo é ignorado.

-- =============================================================================
-- 1. Função única que enfileira o lead
-- =============================================================================
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
BEGIN
    -- Pula se lead já tem first_contact_at (foi importado já contactado)
    IF NEW.first_contact_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Mapeia campos por tabela (cada uma tem nomes diferentes)
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
        -- Tabela não suportada
        RETURN NEW;
    END IF;

    -- Telefone obrigatório (sem ele, IA SDR não envia)
    IF v_lead_phone IS NULL OR LENGTH(TRIM(v_lead_phone)) < 8 THEN
        RETURN NEW;
    END IF;

    -- Monta payload no mesmo formato que scheduleFirstContact espera
    v_payload := jsonb_build_object(
        'leadId',          v_lead_id,
        'leadName',        v_lead_name,
        'leadPhone',       v_lead_phone,
        'vehicleInterest', v_vehicle,
        'source',          v_source,
        'consultantName',  NULL,
        'flow',            v_flow
    );

    -- Enfileira (idempotente: unique index ignora duplicatas pendentes)
    BEGIN
        INSERT INTO ai_sdr_queue (lead_id, lead_table, payload, scheduled_at)
        VALUES (
            v_lead_id,
            v_table_name,
            v_payload,
            NOW() + INTERVAL '30 seconds'  -- delay humano (mesmo da app)
        );
    EXCEPTION WHEN unique_violation THEN
        -- Webhook já enfileirou — tudo certo, segue
        NULL;
    END;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. Triggers nas 3 tabelas de leads
-- =============================================================================

-- leads_manos_crm
DROP TRIGGER IF EXISTS trg_enqueue_ai_sdr ON leads_manos_crm;
CREATE TRIGGER trg_enqueue_ai_sdr
    AFTER INSERT ON leads_manos_crm
    FOR EACH ROW
    EXECUTE FUNCTION enqueue_ai_sdr_for_new_lead();

-- leads_distribuicao_crm_26 (o caminho que estava vazando)
DROP TRIGGER IF EXISTS trg_enqueue_ai_sdr ON leads_distribuicao_crm_26;
CREATE TRIGGER trg_enqueue_ai_sdr
    AFTER INSERT ON leads_distribuicao_crm_26
    FOR EACH ROW
    EXECUTE FUNCTION enqueue_ai_sdr_for_new_lead();

-- leads_compra
DROP TRIGGER IF EXISTS trg_enqueue_ai_sdr ON leads_compra;
CREATE TRIGGER trg_enqueue_ai_sdr
    AFTER INSERT ON leads_compra
    FOR EACH ROW
    EXECUTE FUNCTION enqueue_ai_sdr_for_new_lead();

-- =============================================================================
-- 3. BACKFILL: ressuscita os 17 leads órfãos das últimas 24h
-- =============================================================================
-- Pega leads sem first_contact_at criados nas últimas 24h e enfileira agora.
-- Idempotente: unique index não deixa duplicar.

INSERT INTO ai_sdr_queue (lead_id, lead_table, payload, scheduled_at)
SELECT
    id::text,
    'leads_distribuicao_crm_26',
    jsonb_build_object(
        'leadId',          id::text,
        'leadName',        nome,
        'leadPhone',       telefone,
        'vehicleInterest', interesse,
        'source',          COALESCE(origem, 'unknown'),
        'consultantName',  NULL,
        'flow',            'venda'
    ),
    NOW() + (random() * INTERVAL '5 minutes')  -- distribui em 5min pra não floodar
FROM leads_distribuicao_crm_26
WHERE criado_em > NOW() - INTERVAL '24 hours'
  AND first_contact_at IS NULL
  AND telefone IS NOT NULL
  AND LENGTH(TRIM(telefone)) >= 8
ON CONFLICT (lead_id, lead_table) WHERE processed_at IS NULL DO NOTHING;

-- Mesmo backfill pras outras 2 tabelas (zero impacto se não houver órfãos)
INSERT INTO ai_sdr_queue (lead_id, lead_table, payload, scheduled_at)
SELECT
    id::text,
    'leads_manos_crm',
    jsonb_build_object(
        'leadId',          id::text,
        'leadName',        name,
        'leadPhone',       phone,
        'vehicleInterest', vehicle_interest,
        'source',          COALESCE(source, 'unknown'),
        'consultantName',  NULL,
        'flow',            'venda'
    ),
    NOW() + (random() * INTERVAL '5 minutes')
FROM leads_manos_crm
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND first_contact_at IS NULL
  AND phone IS NOT NULL
  AND LENGTH(TRIM(phone)) >= 8
ON CONFLICT (lead_id, lead_table) WHERE processed_at IS NULL DO NOTHING;

INSERT INTO ai_sdr_queue (lead_id, lead_table, payload, scheduled_at)
SELECT
    id::text,
    'leads_compra',
    jsonb_build_object(
        'leadId',          id::text,
        'leadName',        nome,
        'leadPhone',       telefone,
        'vehicleInterest', veiculo_original,
        'source',          COALESCE(origem, 'unknown'),
        'consultantName',  NULL,
        'flow',            'compra'
    ),
    NOW() + (random() * INTERVAL '5 minutes')
FROM leads_compra
WHERE criado_em > NOW() - INTERVAL '24 hours'
  AND first_contact_at IS NULL
  AND telefone IS NOT NULL
  AND LENGTH(TRIM(telefone)) >= 8
ON CONFLICT (lead_id, lead_table) WHERE processed_at IS NULL DO NOTHING;
