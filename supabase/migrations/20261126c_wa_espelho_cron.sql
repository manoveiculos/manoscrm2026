-- Cron do espelho do WhatsApp (Gestão → WhatsApp).
-- Aplicar SÓ DEPOIS do deploy da rota /api/cron/wa-espelho e das envs
-- WA_ESPELHO_INSTANCIA / WA_ESPELHO_TOKEN na Hostinger. Antes disso o job
-- chamaria uma rota que não existe a cada minuto.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('wa-espelho') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-espelho');
        PERFORM cron.schedule('wa-espelho', '* * * * *', $cron$ SELECT public.call_cron_endpoint('/api/cron/wa-espelho') $cron$);
    END IF;
END $$;
