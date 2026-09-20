-- ==============================================================================
-- MIGRATION: TIME DE MARKETING — LOG DE EXECUÇÃO DO SQUAD DE AGENTES DE IA
-- Data: 2026-09-20
-- Squads: Perito, Vitrine, Sentinela, Captador, Recepção
-- (playbook: pasta local "Agentes de marketing" / .claude/agents/*.md)
--
-- Cada skill/agente do squad (rodando via Claude Code/Cowork, sem n8n — decisão
-- de arquitetura de set/2026) grava aqui um registro por execução, via
-- POST /api/marketing/runs (autenticado por secret de header, não por sessão).
-- O painel /admin/marketing lê e permite aprovar/rejeitar o que precisar de
-- decisão humana (ex.: proposta de compra do Perito).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.marketing_agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad TEXT NOT NULL CHECK (squad IN ('perito', 'vitrine', 'sentinela', 'captador', 'recepcao')),
    skill_name TEXT,
    run_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'pending_approval', 'approved', 'rejected')),
    title TEXT NOT NULL,
    summary TEXT,
    input_ref TEXT,
    output_ref TEXT,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    rejected_reason TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    source TEXT NOT NULL DEFAULT 'claude_cowork' CHECK (source IN ('claude_cowork', 'n8n', 'manual')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garantia de colunas caso a tabela já exista de uma tentativa anterior
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS skill_name TEXT;
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS input_ref TEXT;
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS output_ref TEXT;
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS metrics JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE public.marketing_agent_runs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'claude_cowork';

COMMENT ON TABLE public.marketing_agent_runs IS 'Log de execução do squad de agentes de IA de marketing (Perito/Vitrine/Sentinela/Captador/Recepção) — alimenta /admin/marketing';
COMMENT ON COLUMN public.marketing_agent_runs.squad IS 'Qual squad do playbook executou: perito | vitrine | sentinela | captador | recepcao';
COMMENT ON COLUMN public.marketing_agent_runs.metrics IS 'Métricas livres por tipo de run — ex.: {"nota_compra": 8, "valor_proposta": 45000, "fipe": 52000}';

CREATE INDEX IF NOT EXISTS idx_marketing_runs_squad ON public.marketing_agent_runs (squad);
CREATE INDEX IF NOT EXISTS idx_marketing_runs_created_at ON public.marketing_agent_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_runs_status ON public.marketing_agent_runs (status);
CREATE INDEX IF NOT EXISTS idx_marketing_runs_pending
    ON public.marketing_agent_runs (created_at DESC)
    WHERE requires_approval = true AND approved_at IS NULL;

-- ==============================================================================
-- RLS GUARD — admin (consultants_manos_crm.role = 'admin') ou o login do Alexandre
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_admin_or_alexandre()
RETURNS BOOLEAN AS $$
DECLARE
    user_email TEXT;
    uid UUID;
    is_valid BOOLEAN := false;
BEGIN
    uid := auth.uid();
    user_email := lower(auth.jwt() ->> 'email');

    IF uid IS NULL AND user_email IS NULL THEN
        -- service_role (chamada interna do servidor) — RLS nem se aplica, mas por segurança:
        RETURN true;
    END IF;

    IF user_email = 'alexandre_gorges@hotmail.com' THEN
        RETURN true;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.consultants_manos_crm
        WHERE (user_id = uid OR auth_id = uid)
        AND role = 'admin'
    ) INTO is_valid;

    RETURN is_valid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.marketing_agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Marketing Runs Admin Policy" ON public.marketing_agent_runs;
CREATE POLICY "Marketing Runs Admin Policy" ON public.marketing_agent_runs
    FOR ALL USING (public.is_admin_or_alexandre())
    WITH CHECK (public.is_admin_or_alexandre());

-- ==============================================================================
-- VIEW — KPIs consolidados por squad (últimos 7 dias + acumulado + pendências)
-- ==============================================================================
DROP VIEW IF EXISTS public.vw_marketing_squad_kpis CASCADE;
CREATE OR REPLACE VIEW public.vw_marketing_squad_kpis AS
SELECT
    squad,
    COUNT(*) AS total_runs,
    COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '7 days') AS runs_7d,
    COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '24 hours') AS runs_24h,
    COUNT(*) FILTER (WHERE status = 'error' AND created_at >= now() - INTERVAL '7 days') AS errors_7d,
    COUNT(*) FILTER (WHERE requires_approval = true AND approved_at IS NULL) AS pending_approvals,
    MAX(created_at) AS last_run_at
FROM public.marketing_agent_runs
GROUP BY squad;
