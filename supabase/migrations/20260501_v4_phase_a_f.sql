-- MANOS CRM V4 - Migrações Iniciais (Fase A e F)
-- Data: 2026-05-01

-- Fase F.2: Cooldown de 24h após perda
ALTER TABLE public.leads_manos_crm ADD COLUMN IF NOT EXISTS ai_silence_until TIMESTAMPTZ;

-- Fase A.3: Onboarding visual
ALTER TABLE public.consultants_manos_crm ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- Fase F.4: Pause global de IA
CREATE TABLE IF NOT EXISTS public.system_settings (
    id TEXT PRIMARY KEY,
    ai_paused BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir configuração global se não existir
INSERT INTO public.system_settings (id, ai_paused) 
VALUES ('global', false) 
ON CONFLICT (id) DO NOTHING;

-- Habilitar RLS para system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Política para leitura (todos autenticados podem ver se a IA está pausada)
CREATE POLICY "system_settings_read" ON public.system_settings
FOR SELECT TO authenticated
USING (true);

-- Política para update (apenas admins podem pausar/despausar)
-- Assumindo que a função is_crm_admin() existe conforme visto em outras migrações
CREATE POLICY "system_settings_admin_update" ON public.system_settings
FOR UPDATE TO authenticated
USING (is_crm_admin())
WITH CHECK (is_crm_admin());

-- Atualizar view leads_unified para incluir first_contact_channel
DROP VIEW IF EXISTS public.leads_unified_active;
DROP VIEW IF EXISTS public.leads_unified;

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
    'venda'                                                 AS flow_type
FROM public.leads_manos_crm l

UNION ALL

SELECT
    'leads_compra:' || c.id::text                           AS uid,
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
    c.criado_em                                             AS created_at,
    c.updated_at                                            AS updated_at,
    c.first_contact_at                                      AS first_contact_at,
    c.first_contact_channel                                 AS first_contact_channel,
    c.archived_at                                           AS archived_at,
    'compra'                                                AS flow_type
FROM public.leads_compra c

UNION ALL

SELECT
    'leads_distribuicao_crm_26:' || d.id::text              AS uid,
    'leads_distribuicao_crm_26'                             AS table_name,
    d.id::text                                              AS native_id,
    d.nome                                                  AS name,
    d.telefone                                              AS phone,
    NULL                                                    AS vehicle_interest,
    d.origem                                                AS source,
    d.ai_score                                              AS ai_score,
    d.ai_classification                                     AS ai_classification,
    d.status                                                AS status,
    NULL                                                    AS proxima_acao,
    d.assigned_consultant_id                                AS assigned_consultant_id,
    d.criado_em                                             AS created_at,
    d.atualizado_em                                         AS updated_at,
    d.first_contact_at                                      AS first_contact_at,
    d.first_contact_channel                                 AS first_contact_channel,
    d.archived_at                                           AS archived_at,
    'venda'                                                 AS flow_type
FROM public.leads_distribuicao_crm_26 d;

CREATE OR REPLACE VIEW public.leads_unified_active 
WITH (security_invoker = true) AS
SELECT * FROM public.leads_unified
WHERE LOWER(COALESCE(status, '')) NOT IN
    ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity')
AND archived_at IS NULL;
