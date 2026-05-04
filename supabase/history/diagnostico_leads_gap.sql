-- ===========================================================================
-- DIAGNÓSTICO CIRÚRGICO — Por que Central de Leads (390) ≠ Visão Geral (616)?
-- Data: 2026-03-25
-- Execute cada bloco separadamente no Supabase SQL Editor
-- ===========================================================================


-- ===========================================================================
-- BLOCO 1: INVENTÁRIO REAL DAS TABELAS FONTE
-- Responde: quantos leads existem em cada tabela bruta?
-- ===========================================================================
SELECT 'leads_manos_crm'           AS tabela, COUNT(*) AS total FROM public.leads_manos_crm
UNION ALL
SELECT 'leads_distribuicao_crm_26' AS tabela, COUNT(*) AS total FROM public.leads_distribuicao_crm_26
UNION ALL
SELECT 'leads_master'              AS tabela, COUNT(*) AS total FROM public.leads_master;


-- ===========================================================================
-- BLOCO 2: O QUE A VIEW 'leads' RETORNA HOJE
-- Responde: a VIEW está atualizada com ambas as fontes?
-- ===========================================================================
SELECT source_table, COUNT(*) AS total
FROM public.leads
GROUP BY source_table
ORDER BY source_table;

-- Total bruto da VIEW (sem dedup):
SELECT COUNT(*) AS total_na_view FROM public.leads;


-- ===========================================================================
-- BLOCO 3: DEFINIÇÃO ATUAL DA VIEW
-- Responde: o script fix_leads_view_dedup.sql já foi aplicado?
-- ===========================================================================
SELECT view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'leads';


-- ===========================================================================
-- BLOCO 4: DUPLICATAS POR TELEFONE NA VIEW
-- Responde: a deduplicação está funcionando?
-- ===========================================================================
SELECT
    COUNT(*)                    AS total_linhas,
    COUNT(DISTINCT phone)       AS telefones_unicos,
    COUNT(*) - COUNT(DISTINCT phone) AS duplicatas
FROM public.leads;

-- Ver quais telefones estão duplicados:
SELECT phone, COUNT(*) AS cnt, array_agg(source_table) AS fontes
FROM public.leads
GROUP BY phone
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 20;


-- ===========================================================================
-- BLOCO 5: LEADS SEM TELEFONE
-- Responde: leads com phone NULL estão sendo perdidos?
-- ===========================================================================
SELECT
    source_table,
    COUNT(*) AS total,
    COUNT(CASE WHEN phone IS NULL OR trim(phone) = '' THEN 1 END) AS sem_telefone,
    COUNT(CASE WHEN phone IS NOT NULL AND trim(phone) != '' THEN 1 END) AS com_telefone
FROM public.leads
GROUP BY source_table;

-- Na tabela bruta crm26, quantos têm telefone nulo/vazio?
SELECT
    COUNT(*) AS total,
    COUNT(CASE WHEN telefone IS NULL OR trim(telefone) = '' THEN 1 END) AS sem_telefone,
    COUNT(CASE WHEN nome IS NULL OR trim(nome) = '' THEN 1 END) AS sem_nome
FROM public.leads_distribuicao_crm_26;


-- ===========================================================================
-- BLOCO 6: DISTRIBUIÇÃO POR DATA DE CRIAÇÃO
-- Responde: por que "Mês" mostra mais leads do que "Todos"?
-- Procura leads com created_at nulo ou datas incorretas
-- ===========================================================================
SELECT
    CASE
        WHEN created_at IS NULL                              THEN '⛔ NULL'
        WHEN created_at > NOW()                              THEN '⚠️ FUTURO'
        WHEN created_at >= NOW() - INTERVAL '30 days'       THEN '✅ Últimos 30 dias'
        WHEN created_at >= NOW() - INTERVAL '90 days'       THEN '📅 30-90 dias'
        WHEN created_at >= NOW() - INTERVAL '365 days'      THEN '📅 90-365 dias'
        ELSE                                                      '📅 Mais de 1 ano'
    END AS periodo,
    source_table,
    COUNT(*) AS total
FROM public.leads
GROUP BY 1, 2
ORDER BY 1, 2;


-- ===========================================================================
-- BLOCO 7: LEADS SEM CONSULTOR ATRIBUÍDO
-- Responde: quantos leads ficam "órfãos" (invisíveis para consultores)?
-- ===========================================================================
SELECT
    source_table,
    COUNT(*)                                                           AS total,
    COUNT(CASE WHEN assigned_consultant_id IS NULL THEN 1 END)         AS sem_consultor,
    COUNT(CASE WHEN assigned_consultant_id IS NOT NULL THEN 1 END)     AS com_consultor
FROM public.leads
GROUP BY source_table;

-- Ver consultores inválidos (UUID que não existe em consultants_manos_crm):
SELECT
    l.source_table,
    l.assigned_consultant_id,
    COUNT(*) AS leads
FROM public.leads l
LEFT JOIN public.consultants_manos_crm c ON c.id = l.assigned_consultant_id
WHERE l.assigned_consultant_id IS NOT NULL
  AND c.id IS NULL
GROUP BY 1, 2
ORDER BY 3 DESC
LIMIT 20;


-- ===========================================================================
-- BLOCO 8: STATUS — VALORES ÚNICOS NA VIEW
-- Responde: que valores de status existem? São inglês ou português?
-- ===========================================================================
SELECT status, COUNT(*) AS total
FROM public.leads
GROUP BY status
ORDER BY total DESC;


-- ===========================================================================
-- BLOCO 9: CONTAGEM POR PERÍODO (REPLICANDO A LÓGICA DO ANALYTICS V2)
-- Responde: como a VIEW se comporta com os filtros do Analytics?
-- ===========================================================================
SELECT
    COUNT(*)                                                                    AS total_geral,
    COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END)       AS ultimo_mes,
    COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days'  THEN 1 END)       AS ultima_semana,
    COUNT(CASE WHEN created_at >= CURRENT_DATE               THEN 1 END)       AS hoje
FROM public.leads;


-- ===========================================================================
-- BLOCO 10: VERIFICAÇÃO DAS POLÍTICAS RLS NA VIEW 'leads'
-- Responde: RLS está filtrando e escondendo leads de alguém?
-- ===========================================================================
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('leads', 'leads_manos_crm', 'leads_distribuicao_crm_26', 'leads_master')
ORDER BY tablename, policyname;

-- Verifica se a VIEW tem RLS habilitado (VIEWs não têm RLS direto, mas as tabelas base têm):
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('leads', 'leads_manos_crm', 'leads_distribuicao_crm_26', 'leads_master')
  AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');


-- ===========================================================================
-- RESUMO ESPERADO APÓS RODAR TUDO:
-- BLOCO 1: mostra totais reais por tabela fonte
-- BLOCO 2: mostra o que a VIEW entrega hoje
-- BLOCO 3: confirma se o fix foi aplicado (deve conter WITH all_sources AS)
-- BLOCO 4: mostra duplicatas — se duplicatas > 0, dedup não está aplicado
-- BLOCO 5: mostra leads com telefone nulo sendo silenciados
-- BLOCO 6: CRÍTICO — explica diferença 390 vs 616 (datas incorretas/futuras?)
-- BLOCO 7: mostra leads órfãos invisíveis por consultor
-- BLOCO 8: mostra se status estão em inglês ou português
-- BLOCO 9: replicação exata da lógica do Analytics — comparar com o que aparece na tela
-- BLOCO 10: verifica RLS — se houver policy filtrando, pode esconder leads
-- ===========================================================================
