-- Sprint 3 — Modal bloqueante + follow-up IA com envio + atribuição inteligente

-- 1. cowork_alerts: campos consumidos pelo modal e pelo acknowledge endpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cowork_alerts') THEN
        ALTER TABLE cowork_alerts ADD COLUMN IF NOT EXISTS title TEXT;
        ALTER TABLE cowork_alerts ADD COLUMN IF NOT EXISTS message TEXT;
        ALTER TABLE cowork_alerts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
        ALTER TABLE cowork_alerts ADD COLUMN IF NOT EXISTS acknowledged_action TEXT;
    END IF;
END $$;

-- 2. leads_manos_crm: flag para vendedor desligar follow-up IA em negociações delicadas
ALTER TABLE leads_manos_crm
    ADD COLUMN IF NOT EXISTS ai_followup_enabled BOOLEAN DEFAULT TRUE;

-- 3. consultants_manos_crm: user_id usado pelo modal pra resolver consultor logado
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'consultants_manos_crm' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE consultants_manos_crm ADD COLUMN user_id UUID;
        CREATE INDEX IF NOT EXISTS idx_consultants_user_id ON consultants_manos_crm (user_id);
    END IF;
END $$;

-- 4. Garantir Realtime ligado em cowork_alerts (necessário pro BlockingAlertModal)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'cowork_alerts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE cowork_alerts;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Silencia erro se a publicação não existir nesta instância
    NULL;
END $$;
