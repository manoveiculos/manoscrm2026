-- Agenda zombie-triage no pg_cron — 1x/dia às 9h UTC (6h BRT).
--
-- Antes de produção: rode manualmente em modo dry-run pra ver classificação:
--   curl -H "Authorization: Bearer $CRON_SECRET" \
--     "https://manoscrm.com.br/api/cron/zombie-triage?dryRun=true"

-- Remove agendamento anterior se existir (idempotente)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zombie-triage') THEN
        PERFORM cron.unschedule('zombie-triage');
    END IF;
END $$;

-- 9h UTC = 6h BRT — antes do horário comercial pra inbox estar limpo
SELECT cron.schedule(
    'zombie-triage',
    '0 9 * * *',
    $cron$ SELECT public.call_cron_endpoint('/api/cron/zombie-triage') $cron$
);
