-- ===========================================================================
-- FIX N8N: Adicionar assigned_consultant_id no INSERT do leads_distribuicao_crm_26
--
-- PROBLEMA: O n8n só salva o campo 'vendedor' como texto (ex: "Wilson").
--           O V2 filtra por 'assigned_consultant_id' (UUID).
--           Resultado: leads do n8n são invisíveis no pipeline V2.
--
-- SOLUÇÃO: No INSERT do n8n, usar uma subquery para resolver o UUID
--           a partir do nome do vendedor.
--
-- COMO USAR:
--   1. Abra seus workflows no n8n
--   2. Encontre o nó "Execute Query" ou "Postgres" que faz o INSERT
--   3. Substitua o SQL pelo modelo abaixo (ajuste os campos conforme seu workflow)
-- ===========================================================================


-- ===========================================================================
-- MODELO 1: INSERT com assigned_consultant_id (Meta/Facebook Leads)
-- Substitua os {{ }} pelas expressões do seu n8n
-- ===========================================================================
INSERT INTO public.leads_distribuicao_crm_26 (
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
    assigned_consultant_id,   -- ← NOVO CAMPO ADICIONADO
    lead_id,
    id_meta,
    criado_em,
    atualizado_em
)
VALUES (
    '{{ $json.nome }}',
    '{{ $json.telefone }}',
    '{{ $json.cidade }}',
    '{{ $json.interesse }}',
    '{{ $json.troca }}',
    '{{ $json.vehicle_interest }}',
    '{{ $json.nivel_interesse }}',
    '{{ $json.resumo_consultor }}',
    '{{ $json.proxima_acao }}',
    '{{ $json.origem }}',
    'received',
    '{{ $json.vendedor }}',
    -- ← Subquery que resolve o UUID a partir do primeiro nome do vendedor
    (
        SELECT id
        FROM public.consultants_manos_crm
        WHERE name ILIKE '%' || split_part(trim('{{ $json.vendedor }}'), ' ', 1) || '%'
          AND is_active = true
        LIMIT 1
    ),
    '{{ $json.lead_id }}',
    '{{ $json.id_meta }}',
    NOW(),
    NOW()
)
ON CONFLICT (telefone) DO UPDATE SET
    nome             = EXCLUDED.nome,
    interesse        = EXCLUDED.interesse,
    vehicle_interest = EXCLUDED.vehicle_interest,
    origem           = EXCLUDED.origem,
    vendedor         = EXCLUDED.vendedor,
    -- Atualiza o UUID também no conflito
    assigned_consultant_id = EXCLUDED.assigned_consultant_id,
    atualizado_em    = NOW();


-- ===========================================================================
-- MODELO 2: Se você usa variáveis diferentes no n8n (ex: $node["Form"].json)
-- Apenas o trecho do assigned_consultant_id muda — o resto é igual ao seu SQL atual
-- ===========================================================================

-- Adicione esta linha nos campos do INSERT:
--   assigned_consultant_id,

-- E este valor na posição correspondente do VALUES:
--   (SELECT id FROM public.consultants_manos_crm
--    WHERE name ILIKE '%' || split_part(trim(vendedor_variavel_aqui), ' ', 1) || '%'
--    AND is_active = true LIMIT 1),


-- ===========================================================================
-- VERIFICAÇÃO: Rode no Supabase SQL Editor para confirmar que está funcionando
-- ===========================================================================
-- SELECT
--     d.nome,
--     d.vendedor,
--     d.assigned_consultant_id,
--     c.name AS consultant_name_resolved
-- FROM public.leads_distribuicao_crm_26 d
-- LEFT JOIN public.consultants_manos_crm c ON c.id = d.assigned_consultant_id
-- ORDER BY d.criado_em DESC
-- LIMIT 20;


-- ===========================================================================
-- CONSULTORES ATIVOS (referência para os nomes no n8n)
-- ===========================================================================
-- SELECT id, name FROM public.consultants_manos_crm WHERE is_active = true ORDER BY name;
