-- Tracking em tempo real: quem está atendendo qual lead AGORA
--
-- Fluxo:
--   1. Vendedor abre conversa no WhatsApp Web
--      → extensão detecta via watchChatChange
--      → POST /api/extension/heartbeat { action: 'opened' }
--   2. Enquanto a conversa estiver aberta, extensão envia heartbeat a cada 30s
--   3. Vendedor troca de chat OU fecha aba → action: 'closed'
--   4. Cleanup automático no sla-watcher fecha registros com last_heartbeat > 2min

CREATE TABLE IF NOT EXISTS consultant_active_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id UUID NOT NULL,
    consultant_name TEXT,
    lead_phone TEXT NOT NULL,
    lead_id TEXT,
    lead_table TEXT,
    lead_name TEXT,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    closed_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_active_chats_open
    ON consultant_active_chats (consultant_id, lead_phone)
    WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_active_chats_heartbeat
    ON consultant_active_chats (last_heartbeat_at DESC)
    WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_active_chats_lead
    ON consultant_active_chats (lead_phone, opened_at DESC);

-- View: quem está atendendo AGORA (heartbeat há <2min)
CREATE OR REPLACE VIEW active_chats_now AS
SELECT
    ac.id,
    ac.consultant_id,
    ac.consultant_name,
    ac.lead_phone,
    ac.lead_id,
    ac.lead_table,
    ac.lead_name,
    ac.opened_at,
    ac.last_heartbeat_at,
    EXTRACT(EPOCH FROM (NOW() - ac.opened_at))::INT AS atendendo_ha_segundos,
    EXTRACT(EPOCH FROM (NOW() - ac.last_heartbeat_at))::INT AS sec_desde_heartbeat
FROM consultant_active_chats ac
WHERE ac.closed_at IS NULL
  AND ac.last_heartbeat_at >= NOW() - INTERVAL '2 minutes'
ORDER BY ac.opened_at DESC;

-- Realtime pra /admin/live
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE consultant_active_chats;
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
END $$;
