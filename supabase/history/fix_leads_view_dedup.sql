-- ===========================================================================
-- FIX: Duplicatas na VIEW 'leads' + STATUS normalizados
-- Problema: mesmo telefone aparece 2x (leads_manos_crm + leads_distribuicao_crm_26)
-- Solução: DISTINCT ON (phone) com prioridade — manos_crm ganha sobre crm26
-- Data: 2026-03-25
-- ===========================================================================

-- DIAGNÓSTICO — rode isso primeiro para confirmar o estado atual:
-- SELECT source_table, COUNT(*) FROM public.leads GROUP BY source_table ORDER BY source_table;
-- SELECT phone, COUNT(*) cnt FROM public.leads GROUP BY phone HAVING COUNT(*) > 1 LIMIT 10;


-- ===========================================================================
-- VIEW ATUALIZADA COM DEDUPLICAÇÃO E STATUS NORMALIZADO
-- ===========================================================================
CREATE OR REPLACE VIEW public.leads AS

-- CTE para garantir DISTINCT ON com prioridade correta
WITH all_sources AS (

  -- ── Fonte 1: leads_manos_crm (prioridade 1 — CRM principal) ──────────────
  SELECT
    'main_' || m.id::text                        AS id,
    m.name                                        AS name,
    m.phone                                       AS phone,
    m.email                                       AS email,
    m.source                                      AS source,
    m.source                                      AS origem,
    m.vehicle_interest                            AS vehicle_interest,
    m.vehicle_interest                            AS interesse,
    COALESCE(m.ai_score, 0)                       AS ai_score,
    m.ai_classification                           AS ai_classification,
    m.ai_summary                                  AS ai_summary,
    m.ai_reason                                   AS ai_reason,
    -- Normalizar status inglês → português V2
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
    END                                           AS status,
    m.assigned_consultant_id                      AS assigned_consultant_id,
    m.created_at                                  AS created_at,
    m.updated_at                                  AS updated_at,
    m.valor_investimento                          AS valor_investimento,
    m.metodo_compra                               AS metodo_compra,
    m.carro_troca                                 AS carro_troca,
    m.region                                      AS region,
    m.response_time_seconds                       AS response_time_seconds,
    m.scheduled_at                                AS scheduled_at,
    m.observacoes                                 AS observacoes,
    NULL::text                                    AS vendedor,
    NULL::text                                    AS resumo_consultor,
    NULL::text                                    AS proxima_acao,
    'leads_manos_crm'                             AS source_table,
    1                                             AS priority

  FROM public.leads_manos_crm m

  UNION ALL

  -- ── Fonte 2: leads_distribuicao_crm_26 (prioridade 2 — n8n automations) ──
  SELECT
    'crm26_' || d.id::text                        AS id,
    d.nome                                        AS name,
    d.telefone                                    AS phone,
    NULL::text                                    AS email,
    COALESCE(d.origem, 'Meta Ads')                AS source,
    d.origem                                      AS origem,
    COALESCE(d.vehicle_interest, d.interesse)     AS vehicle_interest,
    d.interesse                                   AS interesse,
    COALESCE(d.ai_score, 0)                       AS ai_score,
    d.ai_classification                           AS ai_classification,
    d.resumo_consultor                            AS ai_summary,
    d.ai_reason                                   AS ai_reason,
    -- Normalizar status do crm26 (pode ser NOVO, aguardando, perda total, etc.)
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
      WHEN 'negociação'              THEN 'negotiation'
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
    END                                           AS status,
    d.assigned_consultant_id                      AS assigned_consultant_id,
    d.criado_em                                   AS created_at,
    d.atualizado_em                               AS updated_at,
    d.valor_investimento                          AS valor_investimento,
    d.metodo_compra                               AS metodo_compra,
    d.carro_troca                                 AS carro_troca,
    d.cidade                                      AS region,
    d.response_time_seconds                       AS response_time_seconds,
    NULL::timestamptz                             AS scheduled_at,
    NULL::text                                    AS observacoes,
    d.vendedor                                    AS vendedor,
    d.resumo_consultor                            AS resumo_consultor,
    d.proxima_acao                                AS proxima_acao,
    'leads_distribuicao_crm_26'                   AS source_table,
    2                                             AS priority

  FROM public.leads_distribuicao_crm_26 d
  WHERE d.nome IS NOT NULL
    AND trim(d.nome) != ''
    AND d.telefone IS NOT NULL
    AND trim(d.telefone) != ''
    -- Remover redistribuídos e definitivamente perdidos do pipe ativo
    AND LOWER(COALESCE(d.status, '')) != 'lost_redistributed'
)

-- DISTINCT ON (phone): mantém apenas 1 registro por telefone
-- Prefere manos_crm (priority=1) sobre crm26 (priority=2)
-- Entre iguais, pega o mais recente (created_at DESC)
SELECT DISTINCT ON (phone)
  id, name, phone, email, source, origem, vehicle_interest, interesse,
  ai_score, ai_classification, ai_summary, ai_reason, status,
  assigned_consultant_id, created_at, updated_at, valor_investimento,
  metodo_compra, carro_troca, region, response_time_seconds,
  scheduled_at, observacoes, vendedor, resumo_consultor, proxima_acao,
  source_table, priority

FROM all_sources

ORDER BY phone, priority ASC, created_at DESC;


-- ===========================================================================
-- VERIFICAÇÃO — rode após o script:
-- ===========================================================================
-- 1. Ver totais por fonte (deve mostrar SEM duplicatas):
-- SELECT source_table, COUNT(*) FROM public.leads GROUP BY source_table;

-- 2. Confirmar que não há duplicatas de telefone:
-- SELECT COUNT(*) total, COUNT(DISTINCT phone) unicos FROM public.leads;
-- Se total = unicos → sem duplicatas ✅

-- 3. Ver leads do Wilson sem duplicatas:
-- SELECT name, phone, status, source_table
-- FROM public.leads
-- WHERE assigned_consultant_id = (
--   SELECT id FROM consultants_manos_crm WHERE name ILIKE '%Wilson%' LIMIT 1
-- )
-- ORDER BY created_at DESC LIMIT 20;
