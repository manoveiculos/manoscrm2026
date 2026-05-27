-- =====================================================================
-- V3.80 — Sprint de produção (2026-05-27)
-- FASE 1: índices anti-table-scan no Inbox/Kanban
-- FASE 2: sync_key polimórfica em whatsapp_messages (escudo retry-storm)
-- Nota: aplicado sem CONCURRENTLY porque o SQL Editor do Supabase
-- envelopa o bloco em transação. Tabelas moderadas, locks de segundos.
-- =====================================================================

-- ─── FASE 1: leads_manos_crm ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_manos_consultor_atendimento
    ON public.leads_manos_crm (assigned_consultant_id, atendimento_iniciado_em);

CREATE INDEX IF NOT EXISTS idx_leads_manos_atendimento_iniciado
    ON public.leads_manos_crm (atendimento_iniciado_em);

-- ─── FASE 1: leads_compra ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_compra_consultor_atendimento
    ON public.leads_compra (assigned_consultant_id, atendimento_iniciado_em);

CREATE INDEX IF NOT EXISTS idx_leads_compra_atendimento_iniciado
    ON public.leads_compra (atendimento_iniciado_em);

-- ─── FASE 1: leads_distribuicao_crm_26 ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_dist_consultor_atendimento
    ON public.leads_distribuicao_crm_26 (assigned_consultant_id, atendimento_iniciado_em);

CREATE INDEX IF NOT EXISTS idx_leads_dist_atendimento_iniciado
    ON public.leads_distribuicao_crm_26 (atendimento_iniciado_em);

-- Cleanup de duplicado real (ambos indexavam criado_em DESC)
DROP INDEX IF EXISTS public.idx_leads_distribuicao_crm_26_created_at;

-- ─── FASE 2: sync_key polimórfica em whatsapp_messages ───────────────
ALTER TABLE public.whatsapp_messages
    ADD COLUMN IF NOT EXISTS sync_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_messages_sync_key
    ON public.whatsapp_messages (sync_key)
    WHERE sync_key IS NOT NULL;

-- ─── ANALYZE p/ planner usar índices novos imediatamente ─────────────
ANALYZE public.leads_manos_crm;
ANALYZE public.leads_compra;
ANALYZE public.leads_distribuicao_crm_26;
ANALYZE public.whatsapp_messages;
