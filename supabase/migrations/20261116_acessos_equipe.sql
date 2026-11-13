-- ===========================================================================
-- ACESSO REAL DA EQUIPE AO CRM (Central dos Agentes -> "Acesso da equipe")
-- Data: 2026-11-13   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- O que faz:
--   1. acessos_presenca: um registro a cada ~60 s enquanto o vendedor está com o CRM aberto E a
--      aba visível (evento 'heartbeat') e um registro a cada troca de tela (evento 'navegacao').
--      Guarda SÓ o caminho da tela (ex.: /fila, /lead/123) — nunca query string, texto digitado,
--      conteúdo de conversa ou IP. É o que permite "tempo online" e "o que estava fazendo".
--   2. acessos_auth_eventos(): leitura de login / logout / renovação de sessão que o próprio
--      Supabase Auth já registra em auth.audit_log_entries (histórico desde mar/2026), exposta por
--      função SECURITY DEFINER só para o service_role (o servidor do CRM). Nada novo é coletado aqui.
--
-- Acesso: RLS ligada e SEM política (só o servidor, via service_role, lê/grava). A função não
-- é executável por anon/authenticated.
-- Risco: baixo. Uma tabela nova, uma função nova; nada existente é alterado.
-- Privacidade: o aviso de transparência aparece no CRM e na Central (LGPD — monitoramento de
-- funcionário deve ser informado). Retenção sugerida: 90 dias (purge no fim do arquivo, manual).
--
-- REVERSÃO:
--   drop function if exists public.acessos_auth_eventos(uuid[], timestamptz);
--   drop table if exists public.acessos_presenca;
-- ===========================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.acessos_presenca (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    consultant_id uuid REFERENCES public.consultants_manos_crm(id) ON DELETE CASCADE,
    auth_uid      uuid NOT NULL,
    evento        text NOT NULL CHECK (evento IN ('heartbeat', 'navegacao')),
    rota          text,
    em            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acessos_presenca_consultor_em
    ON public.acessos_presenca (consultant_id, em DESC);

ALTER TABLE public.acessos_presenca ENABLE ROW LEVEL SECURITY;
-- sem política: nenhum papel de cliente enxerga; o service_role ignora a RLS.

CREATE OR REPLACE FUNCTION public.acessos_auth_eventos(p_uids uuid[], p_desde timestamptz)
RETURNS TABLE (uid uuid, acao text, em timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT (a.payload->>'actor_id')::uuid AS uid,
           a.payload->>'action'            AS acao,
           a.created_at                    AS em
      FROM auth.audit_log_entries a
     WHERE (a.payload->>'actor_id')::uuid = ANY (p_uids)
       AND a.payload->>'action' IN ('login', 'logout', 'token_refreshed')
       AND a.created_at >= p_desde
     ORDER BY a.created_at;
$$;

REVOKE ALL ON FUNCTION public.acessos_auth_eventos(uuid[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acessos_auth_eventos(uuid[], timestamptz) TO service_role;

-- Retenção (rodar à mão de vez em quando, ou agendar):
--   delete from public.acessos_presenca where em < now() - interval '90 days';
