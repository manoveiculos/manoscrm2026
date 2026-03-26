-- ===========================================================================
-- FIX: Leads V1 não aparecem no V2
-- Data: 2026-03-25
-- Problema raiz: VIEW 'leads' não inclui leads_distribuicao_crm_26 (n8n)
--                e crm26 não tem assigned_consultant_id (UUID), só vendedor (nome)
--
-- EXECUTE ESTE SCRIPT NO SUPABASE SQL EDITOR — NESTA ORDEM
-- Seguro: tudo é idempotente (IF NOT EXISTS / CREATE OR REPLACE)
-- Não quebra a V1 — apenas ADICIONA a coluna faltante e SUBSTITUI a VIEW
-- ===========================================================================


-- ===========================================================================
-- PASSO 1: Garantir coluna assigned_consultant_id na tabela crm26
-- (provavelmente já existe do update_assignment_lead.sql anterior,
--  mas o IF NOT EXISTS garante segurança)
-- ===========================================================================
ALTER TABLE public.leads_distribuicao_crm_26
ADD COLUMN IF NOT EXISTS assigned_consultant_id UUID REFERENCES public.consultants_manos_crm(id);

-- Garantir também response_time_seconds (usado pela analytics)
ALTER TABLE public.leads_distribuicao_crm_26
ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;

-- Garantir proxima_acao (usado pela IA)
ALTER TABLE public.leads_distribuicao_crm_26
ADD COLUMN IF NOT EXISTS proxima_acao TEXT;

-- Garantir resumo_consultor (usado pela IA)
ALTER TABLE public.leads_distribuicao_crm_26
ADD COLUMN IF NOT EXISTS resumo_consultor TEXT;


-- ===========================================================================
-- PASSO 2: Backfill assigned_consultant_id em TODOS os leads crm26 existentes
-- Cruza o campo 'vendedor' (nome texto) com consultants_manos_crm.name (UUID)
-- Apenas preenche onde ainda está NULL — não sobrescreve atribuições manuais
-- ===========================================================================
UPDATE public.leads_distribuicao_crm_26 AS l
SET assigned_consultant_id = c.id
FROM public.consultants_manos_crm AS c
WHERE l.vendedor IS NOT NULL
  AND trim(l.vendedor) != ''
  AND l.assigned_consultant_id IS NULL
  AND c.name ILIKE '%' || split_part(trim(l.vendedor), ' ', 1) || '%'
  AND c.is_active = true;

-- Log do resultado
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'PASSO 2 concluído: % leads crm26 receberam assigned_consultant_id', updated_count;
END $$;


-- ===========================================================================
-- PASSO 3: Substituir a VIEW 'leads' para incluir TODAS as fontes
--
-- A VIEW unifica:
--   1. leads_manos_crm    (CRM principal, prefixo: 'main_')
--   2. leads_distribuicao_crm_26 (n8n automations, prefixo: 'crm26_')
--
-- IMPORTANTE: A VIEW é somente leitura. Writes continuam indo direto
--             para leads_manos_crm ou leads_distribuicao_crm_26.
-- ===========================================================================
CREATE OR REPLACE VIEW public.leads AS

-- ── Fonte 1: leads_manos_crm (CRM principal) ──────────────────────────────
SELECT
    -- ID prefixado para o código saber a origem
    'main_' || m.id::text                       AS id,
    m.name                                       AS name,
    m.phone                                      AS phone,
    m.email                                      AS email,
    m.source                                     AS source,
    m.source                                     AS origem,
    m.vehicle_interest                           AS vehicle_interest,
    m.vehicle_interest                           AS interesse,
    m.ai_score                                   AS ai_score,
    m.ai_classification                          AS ai_classification,
    m.ai_summary                                 AS ai_summary,
    m.ai_reason                                  AS ai_reason,
    m.status                                     AS status,
    m.assigned_consultant_id                     AS assigned_consultant_id,
    m.created_at                                 AS created_at,
    m.updated_at                                 AS updated_at,
    m.valor_investimento                         AS valor_investimento,
    m.metodo_compra                              AS metodo_compra,
    m.carro_troca                                AS carro_troca,
    m.region                                     AS region,
    m.response_time_seconds                      AS response_time_seconds,
    m.scheduled_at                               AS scheduled_at,
    m.observacoes                                AS observacoes,
    NULL::text                                   AS vendedor,
    NULL::text                                   AS resumo_consultor,
    NULL::text                                   AS proxima_acao,
    'leads_manos_crm'                            AS source_table,
    1                                            AS priority

FROM public.leads_manos_crm m

UNION ALL

-- ── Fonte 2: leads_distribuicao_crm_26 (n8n automations) ──────────────────
SELECT
    -- ID prefixado para o código saber a origem
    'crm26_' || d.id::text                       AS id,
    d.nome                                       AS name,
    d.telefone                                   AS phone,
    NULL::text                                   AS email,
    COALESCE(d.origem, 'Meta Ads')               AS source,
    d.origem                                     AS origem,
    COALESCE(d.vehicle_interest, d.interesse)    AS vehicle_interest,
    d.interesse                                  AS interesse,
    COALESCE(d.ai_score, 0)                      AS ai_score,
    d.ai_classification                          AS ai_classification,
    -- resumo_consultor é o campo de histórico principal no crm26
    d.resumo_consultor                           AS ai_summary,
    d.ai_reason                                  AS ai_reason,
    -- Normalizar status: NOVO → received
    CASE
        WHEN UPPER(d.status) = 'NOVO'  THEN 'received'
        WHEN d.status IS NULL          THEN 'received'
        ELSE d.status
    END                                          AS status,
    -- assigned_consultant_id foi preenchido pelo PASSO 2 acima
    d.assigned_consultant_id                     AS assigned_consultant_id,
    d.criado_em                                  AS created_at,
    d.atualizado_em                              AS updated_at,
    d.valor_investimento                         AS valor_investimento,
    d.metodo_compra                              AS metodo_compra,
    d.carro_troca                                AS carro_troca,
    d.cidade                                     AS region,
    d.response_time_seconds                      AS response_time_seconds,
    NULL::timestamptz                            AS scheduled_at,
    NULL::text                                   AS observacoes,
    d.vendedor                                   AS vendedor,
    d.resumo_consultor                           AS resumo_consultor,
    d.proxima_acao                               AS proxima_acao,
    'leads_distribuicao_crm_26'                  AS source_table,
    2                                            AS priority

FROM public.leads_distribuicao_crm_26 d
-- Filtrar registros inválidos (sem nome ou telefone)
WHERE d.nome IS NOT NULL
  AND trim(d.nome) != ''
  AND d.telefone IS NOT NULL
  AND trim(d.telefone) != ''
  -- Excluir redistribuídos (já foram tratados)
  AND COALESCE(d.status, '') != 'lost_redistributed';


-- ===========================================================================
-- PASSO 4: Verificação — quantos leads cada fonte está retornando
-- Rode este SELECT separadamente para confirmar que a VIEW está funcionando
-- ===========================================================================
-- SELECT source_table, COUNT(*) as total
-- FROM public.leads
-- GROUP BY source_table
-- ORDER BY source_table;


-- ===========================================================================
-- PASSO 5: Índices para performance na busca por assigned_consultant_id no crm26
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_crm26_assigned_consultant
    ON public.leads_distribuicao_crm_26(assigned_consultant_id);

CREATE INDEX IF NOT EXISTS idx_crm26_vendedor
    ON public.leads_distribuicao_crm_26(vendedor);

CREATE INDEX IF NOT EXISTS idx_crm26_status
    ON public.leads_distribuicao_crm_26(status);

CREATE INDEX IF NOT EXISTS idx_crm26_criado_em
    ON public.leads_distribuicao_crm_26(criado_em DESC);


-- ===========================================================================
-- CONCLUÍDO
-- ===========================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Script executado com sucesso!';
  RAISE NOTICE 'Verifique: SELECT source_table, COUNT(*) FROM public.leads GROUP BY source_table;';
END $$;
