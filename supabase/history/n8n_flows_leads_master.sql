-- ===========================================================================
-- N8N FLOWS V2 — Insert/Merge direto em leads_master (fonte única)
-- Regra: ON CONFLICT (phone) → faz MERGE inteligente
-- Nunca sobrescreve: consultor atribuído, status avançado, dados existentes
-- Data: 2026-03-25
-- ===========================================================================


-- ===========================================================================
-- FLUXO FACEBOOK / META ADS
-- ===========================================================================

INSERT INTO public.leads_master (
  phone,
  name,
  email,
  source,
  origem,
  vehicle_interest,
  ai_summary,
  next_step,
  assigned_consultant_id,
  vendedor,
  status,
  source_table,
  created_at,
  updated_at
)
VALUES (
  regexp_replace('{{ $json.telefone }}', '[^0-9]', '', 'g'),
  '{{ ($json.nome || "").replace(/'/g, "''") }}',
  '{{ $json.email || "" }}',
  'Facebook',
  '{{ ($json.origem || "Facebook").replace(/'/g, "''") }}',
  '{{ ($json.vehicle_interest || $json.interesse || "").replace(/'/g, "''") }}',
  '{{ ($json.resumo_consultor || "").replace(/'/g, "''") }}',
  '{{ ($json.proxima_acao || "Contato imediato").replace(/'/g, "''") }}',
  (
    SELECT id FROM public.consultants_manos_crm
    WHERE name ILIKE '%' || split_part(trim('{{ ($json.vendedor || "").replace(/'/g, "''") }}'), ' ', 1) || '%'
      AND is_active = true
    ORDER BY name LIMIT 1
  ),
  '{{ ($json.vendedor || "").replace(/'/g, "''") }}',
  'received',
  'leads_master',
  NOW(),
  NOW()
)
ON CONFLICT (phone) DO UPDATE SET
  -- Preenche campos vazios — nunca apaga informação existente
  name                   = COALESCE(NULLIF(leads_master.name, ''),   NULLIF(EXCLUDED.name, '')),
  email                  = COALESCE(leads_master.email,              EXCLUDED.email),
  vehicle_interest       = COALESCE(NULLIF(leads_master.vehicle_interest, ''), NULLIF(EXCLUDED.vehicle_interest, '')),
  ai_summary             = COALESCE(NULLIF(leads_master.ai_summary, ''),  NULLIF(EXCLUDED.ai_summary, '')),
  next_step              = COALESCE(NULLIF(leads_master.next_step, ''),   NULLIF(EXCLUDED.next_step, '')),
  source                 = COALESCE(NULLIF(leads_master.source, ''),      EXCLUDED.source),
  origem                 = COALESCE(NULLIF(leads_master.origem, ''),      EXCLUDED.origem),
  vendedor               = COALESCE(NULLIF(leads_master.vendedor, ''),    EXCLUDED.vendedor),
  -- CRÍTICO: nunca sobrescreve consultor já atribuído
  assigned_consultant_id = COALESCE(leads_master.assigned_consultant_id,  EXCLUDED.assigned_consultant_id),
  updated_at             = NOW();


-- ===========================================================================
-- FLUXO GOOGLE ADS
-- CTE sorteia consultor uma só vez (nome + UUID consistentes)
-- ===========================================================================

WITH assigned AS (
  SELECT id, name FROM public.consultants_manos_crm
  WHERE name ILIKE ANY(ARRAY['%Wilson%', '%Sergio%', '%Victor%'])
    AND is_active = true
  ORDER BY random() LIMIT 1
)
INSERT INTO public.leads_master (
  phone,
  name,
  source,
  origem,
  vehicle_interest,
  ai_summary,
  next_step,
  assigned_consultant_id,
  vendedor,
  status,
  source_table,
  created_at,
  updated_at
)
SELECT
  regexp_replace('{{ $json.telefone }}', '[^0-9]', '', 'g'),
  '{{ ($json.nome || "").replace(/'/g, "''") }}',
  'Google',
  'Google Ads',
  'Lead Google - Não especificado',
  '{{ ($json.mensagem || "").replace(/'/g, "''") }}',
  'Contato imediato via WhatsApp',
  a.id,
  a.name,
  'received',
  'leads_master',
  NOW(),
  NOW()
FROM assigned a
ON CONFLICT (phone) DO UPDATE SET
  name                   = COALESCE(NULLIF(leads_master.name, ''),   NULLIF(EXCLUDED.name, '')),
  ai_summary             = COALESCE(NULLIF(leads_master.ai_summary, ''), NULLIF(EXCLUDED.ai_summary, '')),
  source                 = COALESCE(NULLIF(leads_master.source, ''),     EXCLUDED.source),
  origem                 = COALESCE(NULLIF(leads_master.origem, ''),     EXCLUDED.origem),
  vendedor               = COALESCE(NULLIF(leads_master.vendedor, ''),   EXCLUDED.vendedor),
  assigned_consultant_id = COALESCE(leads_master.assigned_consultant_id, EXCLUDED.assigned_consultant_id),
  updated_at             = NOW();


-- ===========================================================================
-- FLUXO WHATSAPP
-- Felipe Ledra se interesse menciona "vender", senão Wilson/Sergio/Victor
-- ===========================================================================

WITH assigned AS (
  SELECT id, name FROM public.consultants_manos_crm
  WHERE
    CASE
      WHEN LOWER('{{ ($json.interesse || "").replace(/'/g, "''") }}') LIKE '%vender%'
        THEN name ILIKE '%Felipe%' OR name ILIKE '%Ledra%'
      ELSE name ILIKE ANY(ARRAY['%Wilson%', '%Sergio%', '%Victor%'])
    END
    AND is_active = true
  ORDER BY random() LIMIT 1
)
INSERT INTO public.leads_master (
  phone,
  name,
  source,
  origem,
  vehicle_interest,
  interesse,
  ai_summary,
  next_step,
  assigned_consultant_id,
  vendedor,
  status,
  source_table,
  created_at,
  updated_at
)
SELECT
  regexp_replace('{{ $json.telefone }}', '[^0-9]', '', 'g'),
  '{{ ($json.nome || "").replace(/'/g, "''") }}',
  'WhatsApp',
  '{{ ($json.origem || "WhatsApp").replace(/'/g, "''") }}',
  '{{ ($json.interesse || $json.vehicle_interest || "").replace(/'/g, "''") }}',
  '{{ ($json.interesse || "").replace(/'/g, "''") }}',
  '{{ ($json.resumo_consultor || "").replace(/'/g, "''") }}',
  '{{ ($json.proxima_acao_sugerida || "Contato imediato").replace(/'/g, "''") }}',
  a.id,
  a.name,
  'received',
  'leads_master',
  NOW(),
  NOW()
FROM assigned a
ON CONFLICT (phone) DO UPDATE SET
  name                   = COALESCE(NULLIF(leads_master.name, ''),           NULLIF(EXCLUDED.name, '')),
  vehicle_interest       = COALESCE(NULLIF(leads_master.vehicle_interest,''), NULLIF(EXCLUDED.vehicle_interest, '')),
  interesse              = COALESCE(NULLIF(leads_master.interesse, ''),       NULLIF(EXCLUDED.interesse, '')),
  ai_summary             = COALESCE(NULLIF(leads_master.ai_summary, ''),      NULLIF(EXCLUDED.ai_summary, '')),
  next_step              = COALESCE(NULLIF(leads_master.next_step, ''),       NULLIF(EXCLUDED.next_step, '')),
  source                 = COALESCE(NULLIF(leads_master.source, ''),          EXCLUDED.source),
  origem                 = COALESCE(NULLIF(leads_master.origem, ''),          EXCLUDED.origem),
  vendedor               = COALESCE(NULLIF(leads_master.vendedor, ''),        EXCLUDED.vendedor),
  assigned_consultant_id = COALESCE(leads_master.assigned_consultant_id,      EXCLUDED.assigned_consultant_id),
  updated_at             = NOW();
