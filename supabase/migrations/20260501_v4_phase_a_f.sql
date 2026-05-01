-- MANOS CRM V4 - Migrações Corrigidas (Fase A-F)
-- Data: 2026-05-01

-- 1. Garantir tabelas de configuração
CREATE TABLE IF NOT EXISTS public.system_settings (
    id TEXT PRIMARY KEY,
    ai_paused BOOLEAN DEFAULT FALSE,
    value JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir configuração global se não existir
INSERT INTO public.system_settings (id, ai_paused) 
VALUES ('global', false) 
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.system_settings (id, value) 
VALUES ('ai_config', '{"followup_enabled": true, "max_leads_per_day": 100, "start_hour": "08:00", "end_hour": "20:00", "cooldown_hours": 24}'::jsonb) 
ON CONFLICT (id) DO NOTHING;

-- 2. Garantir colunas base para a View Unified
ALTER TABLE public.leads_manos_crm ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.leads_manos_crm ADD COLUMN IF NOT EXISTS first_contact_channel TEXT;
ALTER TABLE public.leads_manos_crm ADD COLUMN IF NOT EXISTS ai_followup_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.leads_manos_crm ADD COLUMN IF NOT EXISTS ai_silence_until TIMESTAMPTZ;

ALTER TABLE public.leads_compra ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.leads_compra ADD COLUMN IF NOT EXISTS first_contact_channel TEXT;
ALTER TABLE public.leads_compra ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.leads_compra ADD COLUMN IF NOT EXISTS ai_reason TEXT;
ALTER TABLE public.leads_compra ADD COLUMN IF NOT EXISTS behavioral_profile TEXT;
ALTER TABLE public.leads_compra ADD COLUMN IF NOT EXISTS next_step TEXT;

ALTER TABLE public.leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS first_contact_channel TEXT;
ALTER TABLE public.leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.consultants_manos_crm ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- 3. Criar a View Unified Master (Cérebro do War Room)
DROP VIEW IF EXISTS public.leads_unified_active CASCADE;
DROP VIEW IF EXISTS public.leads_unified CASCADE;

CREATE OR REPLACE VIEW public.leads_unified 
WITH (security_invoker = true) AS
SELECT
    'leads_manos_crm:' || l.id::text                       AS uid,
    'leads_manos_crm'                                       AS table_name,
    l.id::text                                              AS native_id,
    l.name                                                  AS name,
    l.phone                                                 AS phone,
    l.vehicle_interest                                      AS vehicle_interest,
    l.source                                                AS source,
    l.ai_score                                              AS ai_score,
    l.ai_classification                                     AS ai_classification,
    l.status                                                AS status,
    l.proxima_acao                                          AS proxima_acao,
    l.assigned_consultant_id                                AS assigned_consultant_id,
    l.created_at                                            AS created_at,
    l.updated_at                                            AS updated_at,
    l.first_contact_at                                      AS first_contact_at,
    l.first_contact_channel                                 AS first_contact_channel,
    l.archived_at                                           AS archived_at,
    l.ai_summary                                            AS ai_summary,
    l.ai_reason                                             AS ai_reason,
    l.behavioral_profile                                    AS behavioral_profile,
    l.next_step                                             AS next_step,
    'venda'                                                 AS flow_type
FROM public.leads_manos_crm l

UNION ALL

SELECT
    'leads_compra:' || c.id::text                          AS uid,
    'leads_compra'                                          AS table_name,
    c.id::text                                              AS native_id,
    c.nome                                                  AS name,
    c.telefone                                              AS phone,
    c.veiculo_original                                      AS vehicle_interest,
    c.origem                                                AS source,
    c.ai_score                                              AS ai_score,
    c.ai_classification                                     AS ai_classification,
    c.status                                                AS status,
    c.proxima_acao                                          AS proxima_acao,
    c.assigned_consultant_id                                AS assigned_consultant_id,
    c.created_at                                            AS created_at,
    c.updated_at                                            AS updated_at,
    c.first_contact_at                                      AS first_contact_at,
    c.first_contact_channel                                 AS first_contact_channel,
    c.archived_at                                           AS archived_at,
    c.ai_summary                                            AS ai_summary,
    c.ai_reason                                             AS ai_reason,
    c.behavioral_profile                                    AS behavioral_profile,
    c.next_step                                             AS next_step,
    'compra'                                                AS flow_type
FROM public.leads_compra c

UNION ALL

SELECT
    'leads_distribuicao:' || d.id::text                     AS uid,
    'leads_distribuicao_crm_26'                             AS table_name,
    d.id::text                                              AS native_id,
    d.nome                                                  AS name,
    d.telefone                                              AS phone,
    d.vehicle_interest                                      AS vehicle_interest,
    d.origem                                                AS source,
    d.ai_score                                              AS ai_score,
    d.ai_classification                                     AS ai_classification,
    d.status                                                AS status,
    d.proxima_acao                                          AS proxima_acao,
    d.assigned_consultant_id                                AS assigned_consultant_id,
    d.criado_em                                             AS created_at,
    d.atualizado_em                                         AS updated_at,
    d.first_contact_at                                      AS first_contact_at,
    d.first_contact_channel                                 AS first_contact_channel,
    d.archived_at                                           AS archived_at,
    d.ai_summary                                            AS ai_summary,
    d.ai_reason                                             AS ai_reason,
    d.behavioral_profile                                    AS behavioral_profile,
    d.next_step                                             AS next_step,
    'venda'                                                 AS flow_type
FROM public.leads_distribuicao_crm_26 d;

-- 4. View para Leads Ativos (Inbox/War Room)
CREATE OR REPLACE VIEW public.leads_unified_active 
WITH (security_invoker = true) AS
SELECT * FROM public.leads_unified
WHERE archived_at IS NULL
AND status NOT IN ('vendido', 'closed', 'comprado', 'lost', 'lixo', 'duplicado');

-- 5. Permissões de RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_settings_read" ON public.system_settings;
CREATE POLICY "system_settings_read" ON public.system_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "system_settings_write" ON public.system_settings;
CREATE POLICY "system_settings_write" ON public.system_settings FOR UPDATE TO authenticated USING (true);
