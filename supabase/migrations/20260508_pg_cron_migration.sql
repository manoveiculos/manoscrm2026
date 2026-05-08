-- =============================================================================
-- Migra crons do EasyCron pra pg_cron nativo do Supabase
-- =============================================================================
--
-- Por que? Plano free do EasyCron limita a 200 EPDs/dia. SLA Watcher sozinho
-- gasta 288/dia. AI SDR Runner (1/min) precisaria 1440/dia. Não cabe nem no
-- plano pago básico.
--
-- pg_cron do Supabase é grátis, ilimitado, roda dentro do banco (zero latência),
-- e tem audit completo via cron.job_run_details.
--
-- PRÉ-REQUISITO: habilitar `pg_cron` e `pg_net` no Dashboard:
--   Database → Extensions → procurar "pg_cron" e "pg_net" → toggle ON
-- (Se já estiverem ON, esta migration é idempotente.)
--
-- DEPOIS DESTA MIGRATION: você precisa popular cron_config com seu CRON_SECRET
-- (instruções no fim do arquivo).

-- 1. Habilita extensões (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Tabela de config segura (RLS bloqueia leitura externa)
CREATE TABLE IF NOT EXISTS cron_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: ninguém lê. Só service_role acessa.
ALTER TABLE cron_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON cron_config;
CREATE POLICY "service_role only" ON cron_config
    FOR ALL TO authenticated
    USING (false);

-- 3. Função wrapper que faz HTTP GET com Bearer no header
CREATE OR REPLACE FUNCTION call_cron_endpoint(endpoint TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
    v_base_url     TEXT;
    v_cron_secret  TEXT;
    v_request_id   BIGINT;
BEGIN
    SELECT value INTO v_base_url FROM cron_config WHERE key = 'base_url';
    SELECT value INTO v_cron_secret FROM cron_config WHERE key = 'cron_secret';

    IF v_base_url IS NULL OR v_cron_secret IS NULL THEN
        RAISE WARNING 'cron_config faltando base_url ou cron_secret';
        RETURN NULL;
    END IF;

    SELECT net.http_get(
        url := v_base_url || endpoint,
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_cron_secret,
            'Content-Type', 'application/json'
        ),
        timeout_milliseconds := 60000
    ) INTO v_request_id;

    RETURN v_request_id;
END;
$$;

-- 4. Limpa schedules antigos (idempotente — se rodar 2x não duplica)
DO $$
DECLARE
    job_name TEXT;
BEGIN
    FOR job_name IN SELECT jobname FROM cron.job WHERE jobname IN (
        'ai-sdr-runner',
        'sla-watcher',
        'followup-ai',
        'morning-summary',
        'morning-push',
        'daily-batch',
        'fifteen-min-scheduler'
    ) LOOP
        PERFORM cron.unschedule(job_name);
    END LOOP;
END $$;

-- 5. Agenda os crons (todas as URLs do CRM Manos)

-- AI SDR Runner: drena fila de primeiro contato a cada 1min (NOVO — substitui setTimeout)
SELECT cron.schedule(
    'ai-sdr-runner',
    '* * * * *',
    $cron$ SELECT public.call_cron_endpoint('/api/cron/ai-sdr-runner') $cron$
);

-- SLA Watcher: cobra vendedor a cada 5min (push WhatsApp + modal + reatribuição)
SELECT cron.schedule(
    'sla-watcher',
    '*/5 * * * *',
    $cron$ SELECT public.call_cron_endpoint('/api/cron/sla-watcher') $cron$
);

-- Follow-up IA: V3 blindado, 1x/dia às 11h UTC (8h BRT)
SELECT cron.schedule(
    'followup-ai',
    '0 11 * * *',
    $cron$ SELECT public.call_cron_endpoint('/api/cron/followup-ai') $cron$
);

-- Morning Summary (gestor): 9h UTC (6h BRT)
SELECT cron.schedule(
    'morning-summary',
    '0 9 * * *',
    $cron$ SELECT public.call_cron_endpoint('/api/cron/morning-summary') $cron$
);

-- Morning Push (vendedor): 10h UTC (7h BRT)
SELECT cron.schedule(
    'morning-push',
    '0 10 * * *',
    $cron$ SELECT public.call_cron_endpoint('/api/cron/morning-push') $cron$
);

-- Daily Batch: 7h UTC
SELECT cron.schedule(
    'daily-batch',
    '0 7 * * *',
    $cron$ SELECT public.call_cron_endpoint('/api/cron/daily-batch') $cron$
);

-- =============================================================================
-- DEPOIS DE RODAR ESTA MIGRATION:
--
-- 1. Insere o CRON_SECRET (o mesmo que você usa hoje no EasyCron):
--
--    INSERT INTO cron_config (key, value) VALUES
--      ('base_url',     'https://manoscrm.com.br'),
--      ('cron_secret',  'COLE_AQUI_SEU_CRON_SECRET')
--    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
--
-- 2. Verifica que jobs estão agendados:
--    SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
--
-- 3. Aguarda 2-3min, depois verifica execuções:
--    SELECT jobname, status, return_message, start_time
--    FROM cron.job_run_details
--    JOIN cron.job USING (jobid)
--    ORDER BY start_time DESC LIMIT 20;
--
-- 4. Se status = 'succeeded' nas linhas → pode desligar/excluir EasyCron.
-- =============================================================================
