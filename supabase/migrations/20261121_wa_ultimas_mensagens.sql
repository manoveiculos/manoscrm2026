-- ===========================================================================
-- ÚLTIMA MENSAGEM DE CADA CONVERSA (para a nova lista da aba Leads)
-- Data: 2026-11-19   Status: aplicada com a Fase B da aba Leads (aprovada pelo Alexandre)
--
-- A lista de Leads mostra "quem falou por último e há quanto tempo". Buscar isso mensagem por
-- mensagem seria lento: esta função devolve UMA linha por conversa (a mais recente do cliente, da
-- Laura ou do vendedor; mensagens de sistema ficam de fora).
--
-- Só leitura. Executável apenas pelo service_role (o servidor do CRM); anon/authenticated não.
--
-- REVERSÃO: drop function if exists public.wa_ultimas_mensagens(uuid[]);
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.wa_ultimas_mensagens(p_conversas uuid[])
RETURNS TABLE (
    conversa_id uuid, autor text, tipo text, texto text, legenda text,
    transcricao text, midia_nome text, apagada_em timestamptz, criada_em timestamptz
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
    SELECT DISTINCT ON (m.conversa_id)
           m.conversa_id, m.autor::text, m.tipo::text, m.texto::text, m.legenda::text,
           m.transcricao::text, m.midia_nome::text, m.apagada_em::timestamptz, m.criada_em::timestamptz
      FROM public.wa_mensagens m
     WHERE m.conversa_id = ANY (p_conversas)
       AND m.autor::text IN ('cliente', 'laura', 'vendedor')
     ORDER BY m.conversa_id, m.criada_em DESC
$$;

REVOKE ALL ON FUNCTION public.wa_ultimas_mensagens(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_ultimas_mensagens(uuid[]) TO service_role;
