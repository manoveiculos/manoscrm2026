-- cron_heartbeats — telemetria leve de cada cron
--
-- Sem isso, um cron pode parar em silêncio e ninguém percebe até 600 leads
-- terem sido perdidos. /admin/health lê esta tabela e mostra "última run há X min".

CREATE TABLE IF NOT EXISTS cron_heartbeats (
    id BIGSERIAL PRIMARY KEY,
    cron_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    duration_ms INT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    metrics JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_heartbeats_name_time
    ON cron_heartbeats (cron_name, started_at DESC);

-- View: última execução de cada cron (com a flag de "atrasado")
CREATE OR REPLACE VIEW cron_status AS
SELECT DISTINCT ON (cron_name)
    cron_name,
    started_at,
    finished_at,
    duration_ms,
    success,
    error_message,
    metrics,
    EXTRACT(EPOCH FROM (NOW() - started_at))::INT AS seconds_since_run
FROM cron_heartbeats
ORDER BY cron_name, started_at DESC;

-- Realtime no /inbox precisa que as tabelas-fonte estejam na publicação
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE leads_manos_crm;
        EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE leads_compra;
        EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE leads_distribuicao_crm_26;
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
END $$;
