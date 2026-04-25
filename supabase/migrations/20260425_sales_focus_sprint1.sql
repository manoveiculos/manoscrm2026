-- Sprint 1 — Foco em Vendas
-- Acrescenta:
--   1. consultants.personal_whatsapp (cobrança via celular pessoal)
--   2. first_contact_channel nas tabelas de lead (rastrear se IA SDR ou humano)
--   3. whatsapp_send_log (dedup + auditoria de envios)
--   4. sla_escalations (controla nível de escalonamento por lead)

-- 1. Consultor: telefone pessoal pra receber pressão da IA
ALTER TABLE consultants_manos_crm
    ADD COLUMN IF NOT EXISTS personal_whatsapp TEXT;

COMMENT ON COLUMN consultants_manos_crm.personal_whatsapp IS
    'Número pessoal do vendedor para receber alertas de SLA. Fallback: phone.';

-- 2. Canal do primeiro contato — distinguir lead que IA respondeu vs humano
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads_compra') THEN
        ALTER TABLE leads_compra ADD COLUMN IF NOT EXISTS first_contact_channel TEXT;
        ALTER TABLE leads_compra ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads_manos_crm') THEN
        ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS first_contact_channel TEXT;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads_master') THEN
        ALTER TABLE leads_master ADD COLUMN IF NOT EXISTS first_contact_channel TEXT;
        ALTER TABLE leads_master ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads_distribuicao_crm_26') THEN
        ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS first_contact_channel TEXT;
        ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ;
    END IF;
END $$;

-- 3. Log de envios WhatsApp (dedup + auditoria)
CREATE TABLE IF NOT EXISTS whatsapp_send_log (
    id BIGSERIAL PRIMARY KEY,
    to_phone TEXT NOT NULL,
    msg_hash TEXT NOT NULL,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    lead_id TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_send_log_dedup
    ON whatsapp_send_log (to_phone, msg_hash, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_send_log_lead
    ON whatsapp_send_log (lead_id, sent_at DESC);

-- 4. Escalonamento SLA — controla qual nível já foi disparado pra cada lead
CREATE TABLE IF NOT EXISTS sla_escalations (
    id BIGSERIAL PRIMARY KEY,
    lead_id TEXT NOT NULL,
    lead_table TEXT NOT NULL,
    consultant_id UUID,
    level INT NOT NULL,                      -- 1=push, 2=modal, 3=reassign, 4=auto-finish
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_sla_escalations_lead
    ON sla_escalations (lead_id, level DESC);

CREATE INDEX IF NOT EXISTS idx_sla_escalations_open
    ON sla_escalations (resolved_at) WHERE resolved_at IS NULL;

-- 5. Sinal pro front: cowork_alerts já existe, só garantimos os campos críticos
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cowork_alerts') THEN
        ALTER TABLE cowork_alerts ADD COLUMN IF NOT EXISTS blocking BOOLEAN DEFAULT FALSE;
        ALTER TABLE cowork_alerts ADD COLUMN IF NOT EXISTS auto_resolve_at TIMESTAMPTZ;
    END IF;
END $$;
