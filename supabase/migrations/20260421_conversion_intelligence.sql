-- Migração: Inteligência de Conversão (Sprint B)
-- Descrição: Adiciona colunas de marcos, índices e view materializada para BI
-- Data: 2026-04-21

-- 1. Adicionar colunas em leads_manos_crm
ALTER TABLE public.leads_manos_crm 
    ADD COLUMN IF NOT EXISTS first_proposal_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lost_reason TEXT;

-- 2. Adicionar colunas em leads_compra
ALTER TABLE public.leads_compra 
    ADD COLUMN IF NOT EXISTS first_proposal_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lost_reason TEXT;

-- 3. Índices de performance para leads_manos_crm
CREATE INDEX IF NOT EXISTS idx_leads_manos_crm_assigned_created 
    ON public.leads_manos_crm (assigned_consultant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_leads_manos_crm_status_score 
    ON public.leads_manos_crm (status, ai_score);

CREATE INDEX IF NOT EXISTS idx_leads_manos_crm_first_contact 
    ON public.leads_manos_crm (first_contact_at) 
    WHERE first_contact_at IS NOT NULL;

-- 4. Índices de performance para leads_compra
CREATE INDEX IF NOT EXISTS idx_leads_compra_assigned_created 
    ON public.leads_compra (assigned_consultant_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_leads_compra_status_score 
    ON public.leads_compra (status, ai_score);

CREATE INDEX IF NOT EXISTS idx_leads_compra_first_contact 
    ON public.leads_compra (first_contact_at) 
    WHERE first_contact_at IS NOT NULL;

-- 5. Materialized View para o Funil de Conversão
DROP MATERIALIZED VIEW IF EXISTS public.conversion_funnel_daily;

CREATE MATERIALIZED VIEW public.conversion_funnel_daily AS
WITH combined_leads AS (
    -- Vertical Venda
    SELECT 
        id,
        status,
        ai_score,
        'venda'::text as vertical,
        assigned_consultant_id,
        created_at as created_at,
        first_contact_at,
        first_proposal_at,
        won_at
    FROM public.leads_manos_crm
    
    UNION ALL
    
    -- Vertical Compra
    SELECT 
        id,
        status,
        ai_score,
        'compra'::text as vertical,
        assigned_consultant_id,
        criado_em as created_at,
        first_contact_at,
        first_proposal_at,
        won_at
    FROM public.leads_compra
)
SELECT 
    date_trunc('day', created_at)::date as day,
    vertical,
    assigned_consultant_id as consultant_id,
    count(*) as total_leads,
    count(*) FILTER (WHERE first_contact_at IS NOT NULL) as count_contatado,
    count(*) FILTER (WHERE first_proposal_at IS NOT NULL) as count_proposta,
    count(*) FILTER (WHERE status IN ('vendido', 'comprado')) as count_vendido,
    count(*) FILTER (WHERE status IN ('perdido', 'lost', 'abandonado')) as count_perdido,
    -- Velocidade de resposta em minutos
    AVG(EXTRACT(EPOCH FROM (first_contact_at - created_at)) / 60) FILTER (WHERE first_contact_at IS NOT NULL) as avg_speed_minutes,
    -- P95 da velocidade de resposta
    percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_contact_at - created_at)) / 60) FILTER (WHERE first_contact_at IS NOT NULL) as p95_speed_minutes
FROM combined_leads
GROUP BY 1, 2, 3
WITH DATA;

-- Índice único para permitir refresh concorrente
CREATE UNIQUE INDEX idx_conversion_funnel_unique ON public.conversion_funnel_daily (day, vertical, consultant_id);

-- 6. Função para Refresh da View
CREATE OR REPLACE FUNCTION public.refresh_conversion_funnel()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.conversion_funnel_daily;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantir acesso ao service_role
GRANT EXECUTE ON FUNCTION public.refresh_conversion_funnel() TO service_role;
