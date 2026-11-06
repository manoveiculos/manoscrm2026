-- ===========================================================================
-- NOTIFICAÇÃO NO CELULAR (web push) — app instalável, 2ª etapa
-- Data: 2026-11-06 · Programa Growth 360 · NÃO APLICAR sem o "aprovado" do Alexandre
--
-- O que cria (só objetos NOVOS; nenhuma definição existente é alterada):
--   tabela push_inscricoes — um registro por celular/navegador que aceitou
--          receber avisos (endpoint + chaves de criptografia do navegador).
--
-- Acesso:
--   anon          → nada
--   authenticated → só SELECT das PRÓPRIAS inscrições (consultant_id =
--                   wa_meu_consultant_id(), a mesma função da Fase 2:
--                   auth_id = auth.uid() e consultor ativo)
--   escrita       → só o servidor (service_role), nas rotas /api/push/*,
--                   depois de conferir a sessão
--
-- Depende de: public.wa_meu_consultant_id() (migration 20261104, aplicada
-- em 05/11/2026).
--
-- Risco: baixo. Tabela nova e vazia; nenhum gatilho, nenhuma tabela antiga
-- alterada. A FK para consultants_manos_crm trava a tabela de consultores só
-- no instante da criação.
--
-- REVERSÃO:
--   drop table if exists public.push_inscricoes;
--   (os celulares inscritos param de receber aviso; nada mais muda)
--
-- Teste de RLS: supabase/tests/push_rls.test.sql (bloco DO que termina em
-- raise exception — tudo é desfeito).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.push_inscricoes (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id    uuid NOT NULL REFERENCES public.consultants_manos_crm(id) ON DELETE CASCADE,
    endpoint         text NOT NULL UNIQUE,
    p256dh           text NOT NULL,
    auth             text NOT NULL,
    user_agent       text,
    ativo            boolean NOT NULL DEFAULT true,
    falhas           integer NOT NULL DEFAULT 0,
    criado_em        timestamptz NOT NULL DEFAULT now(),
    atualizado_em    timestamptz NOT NULL DEFAULT now(),
    ultimo_envio_em  timestamptz,
    CONSTRAINT ck_push_endpoint_https CHECK (endpoint LIKE 'https://%')
);

COMMENT ON TABLE public.push_inscricoes IS
    'Celulares que aceitaram aviso do Manos CRM (web push). Escrita só pelo servidor.';

CREATE INDEX IF NOT EXISTS idx_push_inscricoes_consultor_ativo
    ON public.push_inscricoes (consultant_id) WHERE ativo;

ALTER TABLE public.push_inscricoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_inscricoes_select_proprias ON public.push_inscricoes;
CREATE POLICY push_inscricoes_select_proprias ON public.push_inscricoes
    FOR SELECT TO authenticated
    USING (consultant_id = (SELECT public.wa_meu_consultant_id()));

-- Sem INSERT/UPDATE/DELETE para o navegador: tudo passa pelo servidor.
REVOKE ALL ON public.push_inscricoes FROM anon, public;
REVOKE ALL ON public.push_inscricoes FROM authenticated;
GRANT SELECT ON public.push_inscricoes TO authenticated;
GRANT ALL ON public.push_inscricoes TO service_role;
