-- 1. Adicionar colunas de marcos temporais e motivos
ALTER TABLE leads_manos_crm 
ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS first_proposal_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS motivo_perda TEXT;

-- 2. Criar View Materializada para Funil de Conversão
DROP MATERIALIZED VIEW IF EXISTS conversion_funnel_daily;

CREATE MATERIALIZED VIEW conversion_funnel_daily AS
SELECT 
    date_trunc('day', created_at) as date,
    source,
    assigned_consultant_id,
    COUNT(*) as total_leads,
    COUNT(first_contact_at) as contacted_leads,
    COUNT(first_proposal_at) as leads_with_proposals,
    COUNT(won_at) as won_leads,
    COUNT(lost_at) as lost_leads,
    AVG(EXTRACT(EPOCH FROM (first_contact_at - created_at))/3600) as avg_hours_to_contact,
    AVG(EXTRACT(EPOCH FROM (won_at - created_at))/86400) as avg_days_to_win
FROM leads_manos_crm
GROUP BY 1, 2, 3;

-- 3. Função para atualizar a view
CREATE OR REPLACE FUNCTION refresh_conversion_funnel()
RETURNS trigger AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY conversion_funnel_daily;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger para atualização automática (opcional, pode ser pesado se houver muitos updates)
-- Recomenda-se rodar REFRESH via Cron se a tabela for muito ativa.
-- Por enquanto, deixaremos apenas a função disponível.
