-- ===========================================================================
-- N8N FLOWS CORRIGIDOS — Manos Veículos CRM V2
-- Data: 2026-03-25
-- Fix: Adiciona assigned_consultant_id (UUID) para leads aparecerem no pipeline V2
--
-- IMPORTANTE: Execute primeiro o script fix_leads_visibility_v2.sql no Supabase
-- para garantir que a coluna assigned_consultant_id existe na tabela.
-- ===========================================================================


-- ===========================================================================
-- FLUXO 1: FACEBOOK / META ADS
-- Estratégia: vendedor já vem como nome do $json — subquery simples resolve UUID
-- ===========================================================================

INSERT INTO public.leads_distribuicao_crm_26
(
  nome,
  telefone,
  cidade,
  interesse,
  troca,
  vehicle_interest,
  nivel_interesse,
  resumo_consultor,
  proxima_acao,
  origem,
  status,
  vendedor,
  assigned_consultant_id,
  lead_id,
  id_meta,
  criado_em,
  atualizado_em
)
VALUES
(
  '{{ ($json.nome || "").replace(/'/g, "''") }}',
  '{{ $json.telefone || "" }}',
  '{{ ($json.cidade || "").replace(/'/g, "''") }}',
  '{{ ($json.interesse || "").replace(/'/g, "''") }}',
  '{{ ($json.troca || "").replace(/'/g, "''") }}',
  '{{ ($json.vehicle_interest || "").replace(/'/g, "''") }}',
  '{{ $json.nivel_interesse || "medio" }}',
  '{{ ($json.resumo_consultor || "").replace(/'/g, "''") }}',
  '{{ ($json.proxima_acao || "").replace(/'/g, "''") }}',
  '{{ ($json.origem || "Facebook").replace(/'/g, "''") }}',
  'received',
  '{{ ($json.vendedor || "").replace(/'/g, "''") }}',
  -- Resolve UUID do consultor pelo primeiro nome (Wilson → UUID do Wilson)
  (
    SELECT id
    FROM public.consultants_manos_crm
    WHERE name ILIKE '%' || split_part(trim('{{ ($json.vendedor || "").replace(/'/g, "''") }}'), ' ', 1) || '%'
      AND is_active = true
    ORDER BY name
    LIMIT 1
  ),
  '{{ $json.lead_id || "" }}',
  '{{ $json.id_meta || $json.lead_id || "" }}',
  NOW(),
  NOW()
)

ON CONFLICT (telefone)
DO UPDATE SET
  nome             = COALESCE(NULLIF(EXCLUDED.nome, ''), leads_distribuicao_crm_26.nome),
  cidade           = COALESCE(NULLIF(EXCLUDED.cidade, ''), leads_distribuicao_crm_26.cidade),
  interesse        = COALESCE(NULLIF(EXCLUDED.interesse, ''), leads_distribuicao_crm_26.interesse),
  troca            = COALESCE(NULLIF(EXCLUDED.troca, ''), leads_distribuicao_crm_26.troca),
  vehicle_interest = COALESCE(NULLIF(EXCLUDED.vehicle_interest, ''), leads_distribuicao_crm_26.vehicle_interest),
  nivel_interesse  = EXCLUDED.nivel_interesse,
  resumo_consultor = EXCLUDED.resumo_consultor,
  proxima_acao     = EXCLUDED.proxima_acao,
  origem           = EXCLUDED.origem,
  -- Não sobrescreve consultor se já foi atribuído manualmente
  vendedor           = COALESCE(NULLIF(leads_distribuicao_crm_26.vendedor, ''), EXCLUDED.vendedor),
  assigned_consultant_id = COALESCE(leads_distribuicao_crm_26.assigned_consultant_id, EXCLUDED.assigned_consultant_id),
  lead_id          = COALESCE(NULLIF(EXCLUDED.lead_id, ''), leads_distribuicao_crm_26.lead_id),
  id_meta          = COALESCE(NULLIF(EXCLUDED.id_meta, ''), leads_distribuicao_crm_26.id_meta),
  atualizado_em    = NOW();


-- ===========================================================================
-- FLUXO 2: GOOGLE ADS
-- Estratégia: CTE sorteia um consultor (Wilson/Sergio/Victor) e retorna
--             AMBOS nome e UUID de uma só vez — evita sortear dois diferentes
-- ===========================================================================

WITH assigned AS (
  SELECT id, name
  FROM public.consultants_manos_crm
  WHERE name ILIKE ANY(ARRAY['%Wilson%', '%Sergio%', '%Victor%'])
    AND is_active = true
  ORDER BY random()
  LIMIT 1
)
INSERT INTO public.leads_distribuicao_crm_26
(
  telefone,
  nome,
  cidade,
  interesse,
  troca,
  nivel_interesse,
  momento_compra,
  resumo_consultor,
  proxima_acao,
  vendedor,
  assigned_consultant_id,
  origem,
  status,
  criado_em,
  atualizado_em
)
SELECT
  '{{ $json.telefone }}',
  '{{ ($json.nome || "").replace(/'/g, "''") }}',
  '{{ ($json.cidade || "").replace(/'/g, "''") }}',
  'Lead Google - Não especificado',
  '',
  'Quente',
  'Imediato',
  '{{ ($json.mensagem || "").replace(/'/g, "''") }}',
  'Contato imediato via WhatsApp',
  a.name,    -- nome do consultor sorteado
  a.id,      -- UUID do mesmo consultor sorteado (garante consistência)
  'Google',
  'received',
  NOW(),
  NOW()
FROM assigned a

ON CONFLICT (telefone)
DO UPDATE SET
  nome             = EXCLUDED.nome,
  cidade           = EXCLUDED.cidade,
  resumo_consultor = EXCLUDED.resumo_consultor,
  origem           = EXCLUDED.origem,
  -- Não sobrescreve consultor se já foi atribuído manualmente
  vendedor               = COALESCE(NULLIF(leads_distribuicao_crm_26.vendedor, ''), EXCLUDED.vendedor),
  assigned_consultant_id = COALESCE(leads_distribuicao_crm_26.assigned_consultant_id, EXCLUDED.assigned_consultant_id),
  atualizado_em    = NOW();


-- ===========================================================================
-- FLUXO 3: WHATSAPP
-- Estratégia: CTE replica o CASE (Felipe Ledra se interesse for venda,
--             senão aleatório Wilson/Sergio/Victor) e retorna nome + UUID juntos
-- ===========================================================================

WITH assigned AS (
  SELECT id, name
  FROM public.consultants_manos_crm
  WHERE
    CASE
      -- Se o interesse menciona "vender" → Felipe Ledra
      WHEN LOWER('{{ ($json.interesse || "").replace(/'/g, "''") }}') LIKE '%vender%'
        THEN name ILIKE '%Felipe%' OR name ILIKE '%Ledra%'
      -- Caso contrário → sorteia entre Wilson, Sergio ou Victor
      ELSE name ILIKE ANY(ARRAY['%Wilson%', '%Sergio%', '%Victor%'])
    END
    AND is_active = true
  ORDER BY random()
  LIMIT 1
)
INSERT INTO public.leads_distribuicao_crm_26
(
  telefone,
  nome,
  cidade,
  interesse,
  troca,
  nivel_interesse,
  momento_compra,
  resumo_consultor,
  proxima_acao,
  vendedor,
  assigned_consultant_id,
  origem,
  status,
  criado_em,
  atualizado_em
)
SELECT
  '{{ $json.telefone }}',
  '{{ ($json.nome || "").replace(/'/g, "''") }}',
  '{{ ($json.cidade || "").replace(/'/g, "''") }}',
  '{{ ($json.interesse || "").replace(/'/g, "''") }}',
  '{{ ($json.troca || "").replace(/'/g, "''") }}',
  '{{ ($json.nivel_interesse || "").replace(/'/g, "''") }}',
  '{{ ($json.momento_compra || "").replace(/'/g, "''") }}',
  '{{ ($json.resumo_consultor || "").replace(/'/g, "''") }}',
  '{{ ($json.proxima_acao_sugerida || "").replace(/'/g, "''") }}',
  a.name,    -- nome do consultor selecionado pela regra
  a.id,      -- UUID do mesmo consultor (consistência garantida)
  '{{ ($json.origem || "").replace(/'/g, "''") }}',
  'received',
  NOW(),
  NOW()
FROM assigned a

ON CONFLICT (telefone)
DO UPDATE SET
  nome             = EXCLUDED.nome,
  cidade           = EXCLUDED.cidade,
  interesse        = EXCLUDED.interesse,
  troca            = EXCLUDED.troca,
  nivel_interesse  = EXCLUDED.nivel_interesse,
  momento_compra   = EXCLUDED.momento_compra,
  resumo_consultor = EXCLUDED.resumo_consultor,
  proxima_acao     = EXCLUDED.proxima_acao,
  origem           = EXCLUDED.origem,
  -- Não sobrescreve consultor se já foi atribuído manualmente
  vendedor               = COALESCE(NULLIF(leads_distribuicao_crm_26.vendedor, ''), EXCLUDED.vendedor),
  assigned_consultant_id = COALESCE(leads_distribuicao_crm_26.assigned_consultant_id, EXCLUDED.assigned_consultant_id),
  atualizado_em    = NOW();
