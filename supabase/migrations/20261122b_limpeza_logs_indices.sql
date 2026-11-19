-- ===========================================================================
-- LIMPEZA DE LOGS E ÍNDICES DUPLICADOS — ESCRITA, **NÃO APLICADA** (precisa do "aprovado" do Alexandre)
-- Data: 2026-11-19. É a parte DESTRUTIVA da auditoria (20261122_otimizacao_banco_aditiva.sql é a parte já aplicada).
--
--   a) apaga histórico do pg_cron com mais de 7 dias (~570 mil linhas, ~128 MB) e heartbeats de cron com mais de
--      14 dias (~168 mil linhas, ~65 MB), e agenda a limpeza diária às 06:20 UTC. São só logs de execução.
--   b) remove 9 índices IDÊNTICOS a outros que ficam (nenhum sustenta constraint): menos custo em cada escrita.
--
-- REVERSÃO: os logs não voltam; os índices voltam com CREATE INDEX igual ao que ficou.
-- ===========================================================================

-- b) índices idênticos (fica um de cada grupo)
DROP INDEX IF EXISTS public.idx_ai_feedback_lead;                    -- fica idx_ai_feedback_lead_id
DROP INDEX IF EXISTS public.idx_leads_compra_performance;            -- fica idx_leads_compra_assigned_created
DROP INDEX IF EXISTS public.idx_leads_consultant_manos;              -- fica idx_leads_consultant
DROP INDEX IF EXISTS public.idx_leads_manos_crm_assigned_consultant;
DROP INDEX IF EXISTS public.idx_leads_manos_crm_assigned_created;    -- fica idx_leads_consultant_created
DROP INDEX IF EXISTS public.idx_leads_manos_performance;
DROP INDEX IF EXISTS public.idx_leads_manos_status_score;            -- fica idx_leads_manos_crm_status_score
DROP INDEX IF EXISTS public.idx_wam_lead_created;                    -- fica idx_whatsapp_messages_lead_created (o que o app usa)
DROP INDEX IF EXISTS public.idx_whatsapp_messages_lead_id_created_at;

-- a) logs com prazo: histórico do pg_cron 7 dias, heartbeats 14 dias (limpeza agora e todo dia às 06:20 UTC)
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
DELETE FROM public.cron_heartbeats WHERE started_at < now() - interval '14 days';
SELECT cron.schedule(
    'limpeza-logs', '20 6 * * *',
    $cron$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
           DELETE FROM public.cron_heartbeats WHERE started_at < now() - interval '14 days' $cron$
);
