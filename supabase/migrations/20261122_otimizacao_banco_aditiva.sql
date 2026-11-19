-- ===========================================================================
-- OTIMIZAÇÃO DO BANCO, PARTE ADITIVA (auditoria de 19/11/2026) — APLICADA
--
-- O que a auditoria achou (pg_stat_statements / pg_stat_user_tables / advisors):
--   1. atualizar_nome_lead / registrar_interesse_lead (a cada mensagem da Laura) filtram por
--      wa_telefone_key(coluna) e NÃO havia índice dessa função (só de fn_phone_key): varredura
--      completa de leads_master e leads_distribuicao_crm_26 -> ~800 ms por chamada.
--   2. concessionaria_mensagens: 7.759 varreduras completas (480 milhões de linhas lidas) por
--      "WHERE session_id = ? ORDER BY id" sem índice.
--   (itens 3 e 4: ver 20261122b_limpeza_logs_indices.sql, NÃO aplicada)
--   3. cron.job_run_details (570 mil linhas antigas, 128 MB) e cron_heartbeats (168 mil linhas
--      com mais de 14 dias, 65 MB) cresciam sem limite.
--   4. Índices idênticos duplicados em tabelas do CRM (custo de escrita à toa).
--   5. A lista de Leads lia a view `leads` (6.156 linhas largas, ~35 ms) até 7 vezes por abertura:
--      leads_lista_min devolve as colunas leves em UMA leitura, sem o teto de 1.000 linhas do PostgREST.
--
-- NÃO mexido de propósito (são de outros sistemas que dividem este banco: bolão, beach tennis,
-- sorteio, DGAUTOS...): políticas RLS, índices sem uso, chaves estrangeiras sem índice, Realtime.
--
-- REVERSÃO:
--   drop index if exists idx_crm26_wa_telefone_key, idx_master_wa_telefone_key, idx_concessionaria_mensagens_sessao;
--   drop function if exists public.leads_lista_min(uuid, timestamptz, text, integer);
--   select cron.unschedule('limpeza-logs');
--   (os índices duplicados removidos eram idênticos aos que ficaram; os registros apagados eram só logs)
-- ===========================================================================

-- 1/2. índices que faltavam
CREATE INDEX IF NOT EXISTS idx_crm26_wa_telefone_key ON public.leads_distribuicao_crm_26 (public.wa_telefone_key(telefone));
CREATE INDEX IF NOT EXISTS idx_master_wa_telefone_key ON public.leads_master (public.wa_telefone_key(phone));
CREATE INDEX IF NOT EXISTS idx_concessionaria_mensagens_sessao ON public.concessionaria_mensagens (session_id, id);

-- 5. lista de Leads em uma leitura só (colunas leves; total antes do limite)
CREATE OR REPLACE FUNCTION public.leads_lista_min(
    p_consultor uuid DEFAULT NULL, p_desde timestamptz DEFAULT NULL, p_termo text DEFAULT NULL, p_limite integer DEFAULT 5000
) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
    WITH f AS (
        SELECT l.id, l.status, l.created_at, l.assigned_consultant_id, l.source, l.origem, l.vehicle_interest,
               l.ai_score, l.valor_investimento, count(*) OVER () AS total
          FROM public.leads l
         WHERE (p_consultor IS NULL OR l.assigned_consultant_id = p_consultor)
           AND (p_desde IS NULL OR l.created_at >= p_desde)
           AND (coalesce(p_termo, '') = ''
                OR l.name ILIKE '%' || p_termo || '%' OR l.phone ILIKE '%' || p_termo || '%'
                OR l.vehicle_interest ILIKE '%' || p_termo || '%' OR l.id ILIKE '%' || p_termo || '%')
         ORDER BY l.created_at DESC
         LIMIT greatest(1, least(coalesce(p_limite, 5000), 10000))
    )
    SELECT jsonb_build_object(
        'total', coalesce(max(total), 0),
        'linhas', coalesce(jsonb_agg(to_jsonb(f) - 'total'), '[]'::jsonb)
    ) FROM f
$$;

-- devolve leads de todos os consultores: só o servidor do CRM (service_role) chama; o filtro por consultor vem da rota
REVOKE ALL ON FUNCTION public.leads_lista_min(uuid, timestamptz, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leads_lista_min(uuid, timestamptz, text, integer) TO service_role;
