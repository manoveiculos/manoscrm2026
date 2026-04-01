-- ============================================================
-- FASE 4: VIEW COMPLETA — Adicionar colunas faltantes
-- Data: 2026-04-01
--
-- Problema: A VIEW 'leads' nao expoe colunas que o frontend precisa:
--   - churn_probability (SniperPanel, LeadCard)
--   - next_step (TacticalAction)
--   - plataforma_meta (SourceIcon)
--   - primeiro_vendedor (LeadCard vendor display)
--   - consultant_name (filtros admin)
--
-- INCLUI TAMBEM: RPCs da Fase 2 (get_avg_response_time)
--
-- Executar no Supabase SQL Editor
-- Seguro: tudo e idempotente (CREATE OR REPLACE)
-- ============================================================


-- ===========================================================================
-- PASSO 1: Garantir colunas necessarias nas tabelas fonte
-- ===========================================================================

-- leads_manos_crm: garantir churn_probability e plataforma_meta
ALTER TABLE public.leads_manos_crm
ADD COLUMN IF NOT EXISTS churn_probability INTEGER;

ALTER TABLE public.leads_manos_crm
ADD COLUMN IF NOT EXISTS plataforma_meta TEXT;

ALTER TABLE public.leads_manos_crm
ADD COLUMN IF NOT EXISTS next_step TEXT;

ALTER TABLE public.leads_manos_crm
ADD COLUMN IF NOT EXISTS primeiro_vendedor TEXT;

-- leads_master: garantir churn_probability
ALTER TABLE public.leads_master
ADD COLUMN IF NOT EXISTS churn_probability INTEGER;

ALTER TABLE public.leads_master
ADD COLUMN IF NOT EXISTS plataforma_meta TEXT;

-- leads_manos_crm: garantir response_time_seconds (pode não existir)
ALTER TABLE public.leads_manos_crm
ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;

-- leads_distribuicao_crm_26: garantir churn_probability e next_step
ALTER TABLE public.leads_distribuicao_crm_26
ADD COLUMN IF NOT EXISTS churn_probability INTEGER;

ALTER TABLE public.leads_distribuicao_crm_26
ADD COLUMN IF NOT EXISTS next_step TEXT;

ALTER TABLE public.leads_distribuicao_crm_26
ADD COLUMN IF NOT EXISTS plataforma_meta TEXT;


-- ===========================================================================
-- PASSO 2: Recriar VIEW com colunas completas
-- DROP necessario porque CREATE OR REPLACE nao permite mudar colunas
-- ===========================================================================

DROP VIEW IF EXISTS public.leads;

CREATE VIEW public.leads AS

WITH all_sources AS (

  -- Fonte 1: leads_master (prioridade 1)
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
    NULL::text                                     AS observacoes,
    m.primeiro_vendedor                            AS vendedor,
    m.primeiro_vendedor                            AS primeiro_vendedor,
    m.ai_summary                                   AS resumo_consultor,
    m.next_step                                    AS proxima_acao,
    m.next_step                                    AS next_step,
    COALESCE(m.churn_probability, 0)               AS churn_probability,
    'leads_master'                                 AS source_table,
    1                                              AS priority

  FROM public.leads_master m
  WHERE m.phone IS NOT NULL
    AND trim(m.phone) != ''

  UNION ALL

  -- Fonte 2: leads_manos_crm (prioridade 2)
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

  -- Fonte 3: leads_distribuicao_crm_26 (prioridade 3)
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

ORDER BY phone, priority ASC, created_at DESC;


-- ===========================================================================
-- PASSO 3: RPC get_avg_response_time (da Fase 2)
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_avg_response_time(
    p_since TIMESTAMPTZ,
    p_consultant_id TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result INTEGER;
BEGIN
    SELECT COALESCE(ROUND(AVG(diff_min))::INTEGER, 0)
    INTO v_result
    FROM (
        SELECT
            EXTRACT(EPOCH FROM (fi.first_interaction_at - l.created_at)) / 60.0 AS diff_min
        FROM leads l
        INNER JOIN LATERAL (
            SELECT MIN(i.created_at) AS first_interaction_at
            FROM interactions_manos_crm i
            WHERE i.lead_id = l.id::TEXT
        ) fi ON fi.first_interaction_at IS NOT NULL
        WHERE l.created_at >= p_since
          AND l.status NOT IN ('perdido', 'lost', 'desqualificado')
          AND (p_consultant_id IS NULL OR l.assigned_consultant_id = p_consultant_id)
    ) sub
    WHERE diff_min > 0.08
      AND diff_min < 21600;

    RETURN v_result;
END;
$$;


-- ===========================================================================
-- PASSO 4: Indices para performance
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_leads_created_status
    ON leads_manos_crm (created_at, status);

CREATE INDEX IF NOT EXISTS idx_leads_consultant_created
    ON leads_manos_crm (assigned_consultant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_interactions_lead_created
    ON interactions_manos_crm (lead_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_master_phone
    ON leads_master (phone);

CREATE INDEX IF NOT EXISTS idx_master_consultant_created
    ON leads_master (assigned_consultant_id, created_at);


-- ===========================================================================
-- PASSO 5: Grants
-- ===========================================================================

GRANT EXECUTE ON FUNCTION get_avg_response_time TO authenticated;
GRANT EXECUTE ON FUNCTION get_avg_response_time TO service_role;


-- ===========================================================================
-- VERIFICACAO
-- ===========================================================================
-- SELECT source_table, COUNT(*) FROM public.leads GROUP BY source_table ORDER BY 1;
-- SELECT COUNT(*) total, COUNT(DISTINCT phone) unicos FROM public.leads;
-- SELECT churn_probability, COUNT(*) FROM leads WHERE churn_probability > 0 GROUP BY 1 ORDER BY 1 DESC LIMIT 10;

DO $$
BEGIN
  RAISE NOTICE 'Migration Fase 4 concluida com sucesso!';
  RAISE NOTICE 'VIEW leads atualizada com: plataforma_meta, primeiro_vendedor, next_step, churn_probability';
  RAISE NOTICE 'RPC get_avg_response_time criada';
END $$;
