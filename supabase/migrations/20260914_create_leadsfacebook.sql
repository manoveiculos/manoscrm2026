-- Migração: Criar tabela leadsfacebook e atualizar as VIEWs public.leads, leads_unified e leads_unified_active
-- Data: 2026-09-14

-- =============================================================================
-- 1. CRIAÇÃO DA TABELA `leadsfacebook`
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.leadsfacebook (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fb_lead_id              TEXT UNIQUE NOT NULL,
    nome                    TEXT,
    phone                   TEXT NOT NULL,
    cidade                  TEXT,
    momento_compra          TEXT,
    vehicle_interest        TEXT,
    forma_pagamento         TEXT,
    source                  TEXT DEFAULT 'Facebook Ads',
    status                  TEXT DEFAULT 'received',
    assigned_consultant_id  UUID REFERENCES public.consultants_manos_crm(id) ON DELETE SET NULL,
    primeiro_vendedor       TEXT,
    observacoes             TEXT,
    ai_score                INTEGER,
    ai_classification       TEXT,
    ai_summary              TEXT,
    proxima_acao            TEXT,
    raw_payload             JSONB,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    archived_at             TIMESTAMPTZ,
    archived_reason         TEXT,
    first_contact_at        TIMESTAMPTZ,
    atendimento_iniciado_em TIMESTAMPTZ,
    atendimento_iniciado_por UUID,
    flagged_reversao        BOOLEAN DEFAULT FALSE,
    ultima_interacao_humana TIMESTAMPTZ,
    diagnostico_atendimento TEXT,
    respondeu_follow_up     BOOLEAN DEFAULT FALSE,
    descarte_financeiro     BOOLEAN DEFAULT FALSE,
    first_contact_channel   TEXT
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_leadsfacebook_phone ON public.leadsfacebook (phone);
CREATE INDEX IF NOT EXISTS idx_leadsfacebook_status ON public.leadsfacebook (status);
CREATE INDEX IF NOT EXISTS idx_leadsfacebook_consultant ON public.leadsfacebook (assigned_consultant_id);
CREATE INDEX IF NOT EXISTS idx_leadsfacebook_created ON public.leadsfacebook (created_at DESC);

-- Habilitar RLS
ALTER TABLE public.leadsfacebook ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total para service_role e admins" ON public.leadsfacebook;
CREATE POLICY "Acesso total para service_role e admins" ON public.leadsfacebook
    FOR ALL USING (true) WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_leadsfacebook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leadsfacebook_updated_at ON public.leadsfacebook;
CREATE TRIGGER trg_leadsfacebook_updated_at
BEFORE UPDATE ON public.leadsfacebook
FOR EACH ROW EXECUTE FUNCTION update_leadsfacebook_updated_at();

-- =============================================================================
-- 2. FUNÇÃO SQL PARA PROCESSAR E SALVAR O PAYLOAD DO FACEBOOK
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ingest_facebook_lead(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_field JSONB;
    v_fb_id TEXT;
    v_created_time TIMESTAMPTZ;
    v_nome TEXT := 'Sem Nome';
    v_phone_raw TEXT := '';
    v_phone TEXT := '';
    v_cidade TEXT := '';
    v_momento TEXT := '';
    v_veiculo TEXT := '';
    v_pagamento TEXT := '';
    v_obs TEXT := '';
    v_lead_id UUID;
BEGIN
    -- Trata caso venha como array [ {...} ] ou objeto direto
    IF jsonb_typeof(p_payload) = 'array' THEN
        v_item := p_payload->0;
    ELSE
        v_item := p_payload;
    END IF;

    v_fb_id := v_item->>'id';
    v_created_time := COALESCE((v_item->>'created_time')::TIMESTAMPTZ, NOW());

    -- Iterar sobre os campos do array field_data
    FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'field_data', '[]'::jsonb))
    LOOP
        CASE (v_field->>'name')
            WHEN 'nome_completo' THEN
                v_nome := v_field->'values'->>0;
            WHEN 'phone_number' THEN
                v_phone_raw := v_field->'values'->>0;
            WHEN 'cidade' THEN
                v_cidade := v_field->'values'->>0;
            WHEN 'quando_você_pretende_comprar?' THEN
                v_momento := v_field->'values'->>0;
            WHEN 'qual_tipo_de_veículo_você_procura?' THEN
                v_veiculo := v_field->'values'->>0;
            WHEN 'como_pretende_pagar?' THEN
                v_pagamento := v_field->'values'->>0;
            ELSE
                NULL;
        END CASE;
    END LOOP;

    -- Normalização do Telefone no padrão CRM (remove +55 se houver)
    v_phone := regexp_replace(v_phone_raw, '\D', '', 'g');
    IF v_phone LIKE '55%' AND length(v_phone) >= 12 THEN
        v_phone := substring(v_phone from 3);
    END IF;

    -- Monta resumo formatado para o Consultor
    v_obs := '📘 **Lead do Facebook Ads**' || CHR(10) ||
             '📍 **Cidade:** ' || COALESCE(NULLIF(v_cidade, ''), 'Não informada') || CHR(10) ||
             '🚘 **Interesse:** ' || COALESCE(NULLIF(v_veiculo, ''), 'Não informado') || CHR(10) ||
             '⏱️ **Comprar:** ' || COALESCE(NULLIF(v_momento, ''), 'Não informado') || CHR(10) ||
             '💳 **Pagamento:** ' || COALESCE(NULLIF(v_pagamento, ''), 'Não informado');

    -- Insert com Upsert para prevenir duplicidade de envio do mesmo FB Lead ID
    INSERT INTO public.leadsfacebook (
        fb_lead_id,
        nome,
        phone,
        cidade,
        momento_compra,
        vehicle_interest,
        forma_pagamento,
        source,
        status,
        observacoes,
        ai_summary,
        raw_payload,
        created_at,
        updated_at
    )
    VALUES (
        v_fb_id,
        v_nome,
        v_phone,
        v_cidade,
        v_momento,
        v_veiculo,
        v_pagamento,
        'Facebook Ads',
        'received',
        v_obs,
        v_obs,
        v_item,
        v_created_time,
        NOW()
    )
    ON CONFLICT (fb_lead_id) DO UPDATE SET
        nome = EXCLUDED.nome,
        phone = EXCLUDED.phone,
        cidade = EXCLUDED.cidade,
        momento_compra = EXCLUDED.momento_compra,
        vehicle_interest = EXCLUDED.vehicle_interest,
        forma_pagamento = EXCLUDED.forma_pagamento,
        observacoes = EXCLUDED.observacoes,
        ai_summary = EXCLUDED.ai_summary,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
    RETURNING id INTO v_lead_id;

    RETURN v_lead_id;
END;
$$;

-- =============================================================================
-- 3. ATUALIZAÇÃO DA VIEW COMPLETA `public.leads` (USADA NA CENTRAL DE LEADS)
-- =============================================================================
DROP VIEW IF EXISTS public.leads CASCADE;

CREATE VIEW public.leads AS
WITH all_sources AS (
  SELECT
    'master_' || m.id::text                       AS id,
    COALESCE(m.name, '')                           AS name,
    m.phone                                        AS phone,
    m.email                                        AS email,
    COALESCE(m.source, 'Meta Ads')                 AS source,
    COALESCE(m.source, 'Meta Ads')                 AS origem,
    m.plataforma_meta                              AS plataforma_meta,
    m.vehicle_interest                             AS vehicle_interest,
    m.vehicle_interest                             AS interesse,
    COALESCE(m.ai_score, 0)                        AS ai_score,
    m.ai_classification                            AS ai_classification,
    m.ai_summary                                   AS ai_summary,
    m.ai_reason                                    AS ai_reason,
    CASE LOWER(TRIM(COALESCE(m.status, 'received')))
      WHEN 'novo'                    THEN 'received'
      WHEN 'nova'                    THEN 'received'
      WHEN 'new'                     THEN 'received'
      WHEN 'received'                THEN 'received'
      WHEN 'aguardando'              THEN 'received'
      WHEN 'sem contato'             THEN 'received'
      WHEN 'em atendimento'          THEN 'attempt'
      WHEN 'attempt'                 THEN 'attempt'
      WHEN 'contatado'               THEN 'contacted'
      WHEN 'contacted'               THEN 'contacted'
      WHEN 'agendado'                THEN 'scheduled'
      WHEN 'scheduled'               THEN 'scheduled'
      WHEN 'visitou'                 THEN 'visited'
      WHEN 'visited'                 THEN 'visited'
      WHEN 'negociando'              THEN 'negotiation'
      WHEN 'negotiation'             THEN 'negotiation'
      WHEN 'venda realizada'         THEN 'closed'
      WHEN 'vendido'                 THEN 'closed'
      WHEN 'fechado'                 THEN 'closed'
      WHEN 'closed'                  THEN 'closed'
      WHEN 'perda total'             THEN 'lost'
      WHEN 'perdido'                 THEN 'lost'
      WHEN 'lost'                    THEN 'lost'
      WHEN 'desistiu'                THEN 'lost'
      WHEN 'sem interesse'           THEN 'lost'
      WHEN 'inativo'                 THEN 'lost'
      WHEN 'lixo'                    THEN 'lost'
      WHEN 'duplicado'               THEN 'lost'
      ELSE COALESCE(m.status, 'received')
    END                                            AS status,
    m.assigned_consultant_id                       AS assigned_consultant_id,
    COALESCE(m.created_at, NOW())                  AS created_at,
    COALESCE(m.updated_at, NOW())                  AS updated_at,
    m.valor_investimento                           AS valor_investimento,
    NULL::text                                     AS metodo_compra,
    NULL::text                                     AS carro_troca,
    m.city                                         AS region,
    NULL::integer                                  AS response_time_seconds,
    NULL::timestamptz                              AS scheduled_at,
    m.observacoes                                  AS observacoes,
    m.primeiro_vendedor                            AS vendedor,
    m.primeiro_vendedor                            AS primeiro_vendedor,
    m.ai_summary                                   AS resumo_consultor,
    m.next_step                                    AS proxima_acao,
    m.next_step                                    AS next_step,
    COALESCE(m.churn_probability, 0)               AS churn_probability,
    'leads_master'                                 AS source_table,
    1                                              AS priority
  FROM public.leads_master m
  WHERE m.phone IS NOT NULL AND trim(m.phone) != ''

  UNION ALL

  SELECT
    'main_' || m.id::text                          AS id,
    m.name                                         AS name,
    m.phone                                        AS phone,
    m.email                                        AS email,
    m.source                                       AS source,
    m.source                                       AS origem,
    m.plataforma_meta                              AS plataforma_meta,
    m.vehicle_interest                             AS vehicle_interest,
    m.vehicle_interest                             AS interesse,
    COALESCE(m.ai_score, 0)                        AS ai_score,
    m.ai_classification                            AS ai_classification,
    m.ai_summary                                   AS ai_summary,
    m.ai_reason                                    AS ai_reason,
    CASE LOWER(COALESCE(m.status, 'received'))
      WHEN 'new'         THEN 'received'
      WHEN 'received'    THEN 'received'
      WHEN 'attempt'     THEN 'attempt'
      WHEN 'contacted'   THEN 'contacted'
      WHEN 'scheduled'   THEN 'scheduled'
      WHEN 'visited'     THEN 'visited'
      WHEN 'negotiation' THEN 'negotiation'
      WHEN 'proposed'    THEN 'negotiation'
      WHEN 'closed'      THEN 'closed'
      WHEN 'lost'        THEN 'lost'
      ELSE m.status
    END                                            AS status,
    m.assigned_consultant_id                       AS assigned_consultant_id,
    m.created_at                                   AS created_at,
    m.updated_at                                   AS updated_at,
    m.valor_investimento                           AS valor_investimento,
    m.metodo_compra                                AS metodo_compra,
    m.carro_troca                                  AS carro_troca,
    m.region                                       AS region,
    m.response_time_seconds                        AS response_time_seconds,
    m.scheduled_at                                 AS scheduled_at,
    m.observacoes                                  AS observacoes,
    NULL::text                                     AS vendedor,
    m.primeiro_vendedor                            AS primeiro_vendedor,
    NULL::text                                     AS resumo_consultor,
    m.next_step                                    AS proxima_acao,
    m.next_step                                    AS next_step,
    COALESCE(m.churn_probability, 0)               AS churn_probability,
    'leads_manos_crm'                              AS source_table,
    2                                              AS priority
  FROM public.leads_manos_crm m

  UNION ALL

  SELECT
    'crm26_' || d.id::text                         AS id,
    d.nome                                         AS name,
    d.telefone                                     AS phone,
    NULL::text                                     AS email,
    COALESCE(d.origem, 'Meta Ads')                 AS source,
    d.origem                                       AS origem,
    d.plataforma_meta                              AS plataforma_meta,
    COALESCE(d.vehicle_interest, d.interesse)      AS vehicle_interest,
    d.interesse                                    AS interesse,
    COALESCE(d.ai_score, 0)                        AS ai_score,
    d.ai_classification                            AS ai_classification,
    d.resumo_consultor                             AS ai_summary,
    d.ai_reason                                    AS ai_reason,
    CASE LOWER(TRIM(COALESCE(d.status, 'received')))
      WHEN 'novo'                    THEN 'received'
      WHEN 'nova'                    THEN 'received'
      WHEN 'new'                     THEN 'received'
      WHEN 'received'                THEN 'received'
      WHEN 'aguardando'              THEN 'received'
      WHEN 'aguardando atendimento'  THEN 'received'
      WHEN 'sem contato'             THEN 'received'
      WHEN 'em atendimento'          THEN 'attempt'
      WHEN 'contatado'               THEN 'contacted'
      WHEN 'attempt'                 THEN 'attempt'
      WHEN 'contacted'               THEN 'contacted'
      WHEN 'agendado'                THEN 'scheduled'
      WHEN 'agendamento'             THEN 'scheduled'
      WHEN 'scheduled'               THEN 'scheduled'
      WHEN 'visitou'                 THEN 'visited'
      WHEN 'visita realizada'        THEN 'visited'
      WHEN 'visited'                 THEN 'visited'
      WHEN 'negociando'              THEN 'negotiation'
      WHEN 'negociacao'              THEN 'negotiation'
      WHEN 'negotiation'             THEN 'negotiation'
      WHEN 'proposed'                THEN 'negotiation'
      WHEN 'venda realizada'         THEN 'closed'
      WHEN 'vendido'                 THEN 'closed'
      WHEN 'fechado'                 THEN 'closed'
      WHEN 'closed'                  THEN 'closed'
      WHEN 'perda total'             THEN 'lost'
      WHEN 'perda_total'             THEN 'lost'
      WHEN 'perdido'                 THEN 'lost'
      WHEN 'lost'                    THEN 'lost'
      WHEN 'desistiu'                THEN 'lost'
      WHEN 'sem interesse'           THEN 'lost'
      WHEN 'inativo'                 THEN 'lost'
      WHEN 'lixo'                    THEN 'lost'
      WHEN 'duplicado'               THEN 'lost'
      WHEN 'lost_redistributed'      THEN 'lost'
      ELSE COALESCE(d.status, 'received')
    END                                            AS status,
    d.assigned_consultant_id                       AS assigned_consultant_id,
    d.criado_em                                    AS created_at,
    COALESCE(d.atualizado_em, d.criado_em)         AS updated_at,
    d.valor_investimento                           AS valor_investimento,
    d.metodo_compra                                AS metodo_compra,
    d.carro_troca                                  AS carro_troca,
    d.cidade                                       AS region,
    d.response_time_seconds                        AS response_time_seconds,
    NULL::timestamptz                              AS scheduled_at,
    NULL::text                                     AS observacoes,
    d.vendedor                                     AS vendedor,
    d.vendedor                                     AS primeiro_vendedor,
    d.resumo_consultor                             AS resumo_consultor,
    d.proxima_acao                                 AS proxima_acao,
    d.next_step                                    AS next_step,
    COALESCE(d.churn_probability, 0)               AS churn_probability,
    'leads_distribuicao_crm_26'                    AS source_table,
    3                                              AS priority
  FROM public.leads_distribuicao_crm_26 d
  WHERE d.nome IS NOT NULL
    AND trim(d.nome) != ''
    AND d.telefone IS NOT NULL
    AND trim(d.telefone) != ''
    AND LOWER(COALESCE(d.status, '')) != 'lost_redistributed'

  UNION ALL

  SELECT
    'fb_' || f.id::text                            AS id,
    COALESCE(f.nome, 'Sem Nome')                   AS name,
    f.phone                                        AS phone,
    NULL::text                                     AS email,
    COALESCE(f.source, 'Facebook Ads')             AS source,
    COALESCE(f.source, 'Facebook Ads')             AS origem,
    'Facebook Ads'                                 AS plataforma_meta,
    f.vehicle_interest                             AS vehicle_interest,
    f.vehicle_interest                             AS interesse,
    COALESCE(f.ai_score, 0)                        AS ai_score,
    f.ai_classification                            AS ai_classification,
    f.observacoes                                  AS ai_summary,
    f.ai_summary                                   AS ai_reason,
    CASE LOWER(TRIM(COALESCE(f.status, 'received')))
      WHEN 'novo'       THEN 'received'
      WHEN 'received'   THEN 'received'
      WHEN 'perdido'    THEN 'lost'
      WHEN 'lost'       THEN 'lost'
      WHEN 'vendido'    THEN 'closed'
      WHEN 'closed'     THEN 'closed'
      ELSE COALESCE(f.status, 'received')
    END                                            AS status,
    f.assigned_consultant_id                       AS assigned_consultant_id,
    COALESCE(f.created_at, NOW())                  AS created_at,
    COALESCE(f.updated_at, NOW())                  AS updated_at,
    NULL::text                                     AS valor_investimento,
    f.forma_pagamento                              AS metodo_compra,
    NULL::text                                     AS carro_troca,
    f.cidade                                       AS region,
    NULL::integer                                  AS response_time_seconds,
    NULL::timestamptz                              AS scheduled_at,
    f.observacoes                                  AS observacoes,
    f.primeiro_vendedor                            AS vendedor,
    f.primeiro_vendedor                            AS primeiro_vendedor,
    f.observacoes                                  AS resumo_consultor,
    f.proxima_acao                                 AS proxima_acao,
    f.proxima_acao                                 AS next_step,
    0                                              AS churn_probability,
    'leadsfacebook'                                AS source_table,
    0                                              AS priority
  FROM public.leadsfacebook f
  WHERE f.phone IS NOT NULL AND trim(f.phone) != ''
)

SELECT DISTINCT ON (phone)
  id, name, phone, email, source, origem, plataforma_meta,
  vehicle_interest, interesse,
  ai_score, ai_classification, ai_summary, ai_reason, status,
  assigned_consultant_id, created_at, updated_at, valor_investimento,
  metodo_compra, carro_troca, region, response_time_seconds,
  scheduled_at, observacoes, vendedor, primeiro_vendedor,
  resumo_consultor, proxima_acao, next_step, churn_probability,
  source_table, priority
FROM all_sources
ORDER BY phone, created_at DESC, priority ASC;

-- =============================================================================
-- 4. ATUALIZAÇÃO DA VIEW UNIFICADA `leads_unified` E `leads_unified_active`
-- =============================================================================
CREATE OR REPLACE VIEW leads_unified AS
SELECT
    'leads_manos_crm:' || l.id::text                       AS uid,
    'leads_manos_crm'                                      AS table_name,
    l.id::text                                             AS native_id,
    l.name                                                 AS name,
    mask_phone_for_pesca(l.phone, l.assigned_consultant_id) AS phone,
    l.vehicle_interest                                     AS vehicle_interest,
    l.source                                               AS source,
    l.ai_score                                             AS ai_score,
    l.ai_classification                                    AS ai_classification,
    l.status                                               AS status,
    l.proxima_acao                                         AS proxima_acao,
    l.assigned_consultant_id                               AS assigned_consultant_id,
    l.created_at                                           AS created_at,
    l.updated_at                                           AS updated_at,
    l.first_contact_at                                     AS first_contact_at,
    l.atendimento_iniciado_em                              AS atendimento_iniciado_em,
    l.atendimento_iniciado_por                             AS atendimento_iniciado_por,
    l.flagged_reversao                                     AS flagged_reversao,
    l.ultima_interacao_humana                              AS ultima_interacao_humana,
    l.diagnostico_atendimento                              AS diagnostico_atendimento,
    l.respondeu_follow_up                                  AS respondeu_follow_up,
    l.descarte_financeiro                                  AS descarte_financeiro,
    l.archived_at                                          AS archived_at,
    l.first_contact_channel                                AS first_contact_channel,
    'venda'                                                AS flow_type
FROM leads_manos_crm l
UNION ALL
SELECT
    'leads_compra:' || c.id::text,
    'leads_compra',
    c.id::text,
    c.nome,
    mask_phone_for_pesca(c.telefone, c.assigned_consultant_id),
    c.veiculo_original,
    c.origem,
    c.ai_score,
    c.ai_classification,
    c.status,
    c.proxima_acao,
    c.assigned_consultant_id,
    c.criado_em,
    c.updated_at,
    c.first_contact_at,
    c.atendimento_iniciado_em,
    c.atendimento_iniciado_por,
    c.flagged_reversao,
    c.ultima_interacao_humana,
    c.diagnostico_atendimento,
    c.respondeu_follow_up,
    c.descarte_financeiro,
    c.archived_at,
    c.first_contact_channel,
    'compra'
FROM leads_compra c
UNION ALL
SELECT
    'leads_distribuicao_crm_26:' || d.id::text,
    'leads_distribuicao_crm_26',
    d.id::text,
    d.nome,
    mask_phone_for_pesca(d.telefone, d.assigned_consultant_id),
    NULL,
    d.origem,
    d.ai_score,
    d.ai_classification,
    d.status,
    NULL,
    d.assigned_consultant_id,
    d.criado_em,
    d.atualizado_em,
    d.first_contact_at,
    d.atendimento_iniciado_em,
    d.atendimento_iniciado_por,
    d.flagged_reversao,
    d.ultima_interacao_humana,
    d.diagnostico_atendimento,
    d.respondeu_follow_up,
    d.descarte_financeiro,
    d.archived_at,
    d.first_contact_channel,
    'venda'
FROM leads_distribuicao_crm_26 d
UNION ALL
SELECT
    'leadsfacebook:' || f.id::text,
    'leadsfacebook',
    f.id::text,
    f.nome,
    mask_phone_for_pesca(f.phone, f.assigned_consultant_id),
    f.vehicle_interest,
    f.source,
    f.ai_score,
    f.ai_classification,
    f.status,
    f.proxima_acao,
    f.assigned_consultant_id,
    f.created_at,
    f.updated_at,
    f.first_contact_at,
    f.atendimento_iniciado_em,
    f.atendimento_iniciado_por,
    f.flagged_reversao,
    f.ultima_interacao_humana,
    f.diagnostico_atendimento,
    f.respondeu_follow_up,
    f.descarte_financeiro,
    f.archived_at,
    f.first_contact_channel,
    'venda'
FROM leadsfacebook f;

-- Atualizar View de Leads Ativos
CREATE OR REPLACE VIEW leads_unified_active AS
 SELECT uid,
    table_name,
    native_id,
    name,
    phone,
    vehicle_interest,
    source,
    ai_score,
    ai_classification,
    status,
    proxima_acao,
    assigned_consultant_id,
    created_at,
    updated_at,
    first_contact_at,
    atendimento_iniciado_em,
    atendimento_iniciado_por,
    flagged_reversao,
    ultima_interacao_humana,
    diagnostico_atendimento,
    respondeu_follow_up,
    descarte_financeiro,
    archived_at,
    first_contact_channel,
    flow_type
   FROM leads_unified
  WHERE lower(COALESCE(status, ''::character varying)::text) <> ALL (
            ARRAY['vendido'::text, 'perdido'::text, 'comprado'::text,
                  'finalizado'::text, 'lost'::text, 'lost_by_inactivity'::text])
    AND archived_at IS NULL
    AND lower(COALESCE(status, ''::character varying)::text) <> 'frio';
