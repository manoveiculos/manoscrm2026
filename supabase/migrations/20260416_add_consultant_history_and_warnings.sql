-- ════════════════════════════════════════════════════════════════
-- Audit trail de transferências entre vendedores + warning de
-- redistribuição automática.
--
-- Hoje, quando um lead muda de vendedor, o assigned_consultant_id
-- antigo é sobrescrito sem rastro. Sem isso, é impossível auditar
-- "lead passou por João → Maria → João" e quem é responsável pela
-- conversão (ou perda).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.lead_consultant_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL,                    -- referência leads_manos_crm.id
    from_consultant_id UUID,                  -- NULL = lead chegou desatribuído
    to_consultant_id UUID,                    -- NULL = lead foi liberado/perdido
    reason TEXT NOT NULL,                     -- 'manual_transfer' | 'reactivation' | 'auto_redistribution' | 'sla_warning_expired'
    notes TEXT,                               -- justificativa textual livre
    actor_name TEXT,                          -- quem fez a ação (gerente / sistema)
    score_at_change INTEGER,                  -- ai_score no momento (snapshot p/ relatório)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lch_lead_id ON public.lead_consultant_history (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lch_to_consultant ON public.lead_consultant_history (to_consultant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lch_from_consultant ON public.lead_consultant_history (from_consultant_id, created_at DESC);

-- ── Campos para o ciclo de WARNING de redistribuição automática ──
--
-- Mecânica justa em 3 etapas:
--   1. Lead quente parado 24h+ → cron envia push p/ vendedor:
--      "Você tem 12h ou esse lead vai para outro" + grava
--      redistribution_warning_at = NOW().
--   2. Cron seguinte (>= 12h depois): se updated_at não avançou,
--      reatribui automaticamente para o próximo da fila.
--   3. Vendedor original pode fazer "claim back" registrando
--      interação em até 24h após a reatribuição.
--
ALTER TABLE public.leads_manos_crm
    ADD COLUMN IF NOT EXISTS redistribution_warning_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS redistribution_warned_consultant_id UUID,
    ADD COLUMN IF NOT EXISTS redistributed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_redistribution_pending
    ON public.leads_manos_crm (redistribution_warning_at)
    WHERE redistribution_warning_at IS NOT NULL AND redistributed_at IS NULL;
