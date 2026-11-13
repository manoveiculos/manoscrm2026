-- ===========================================================================
-- TELEFONE DO CONSULTOR CONFIRMADO POR CÓDIGO NO WHATSAPP
-- Data: 2026-11-11   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- Decisão do Alexandre (11/11/2026): todo login confirma o próprio WhatsApp ao entrar.
-- O CRM manda um código de 6 dígitos pelo número da loja; quando o consultor digita o
-- código certo, o número é salvo em consultants_manos_crm.phone no formato 55+DDD+número
-- (ex.: 5547988467855) e phone_verified_at recebe a data. É esse número que vai ao
-- webhook de avisos (chamadavendedorcrm).
--
--   consultants_manos_crm.phone_verified_at   quando o número foi confirmado (NULL = ainda não)
--   consultor_telefone_codigos                códigos enviados (só o resumo sha256, nunca o código)
--
-- Acesso: consultor_telefone_codigos só pelo servidor (service_role); RLS ligada, sem política.
-- Risco: baixo. Uma coluna nova (vazia) e uma tabela nova. Ninguém perde o telefone que já tem.
--
-- REVERSÃO:
--   drop table if exists public.consultor_telefone_codigos;
--   alter table public.consultants_manos_crm drop column if exists phone_verified_at;
-- ===========================================================================

SET lock_timeout = '5s';

ALTER TABLE public.consultants_manos_crm
    ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.consultor_telefone_codigos (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id  uuid NOT NULL REFERENCES public.consultants_manos_crm(id) ON DELETE CASCADE,
    telefone       text NOT NULL CHECK (telefone ~ '^55[0-9]{10,11}$'),
    codigo_hash    text NOT NULL,
    expira_em      timestamptz NOT NULL,
    tentativas     smallint NOT NULL DEFAULT 0,
    usado_em       timestamptz,
    criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultor_telefone_codigos_consultor
    ON public.consultor_telefone_codigos (consultant_id, criado_em DESC);

ALTER TABLE public.consultor_telefone_codigos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.consultor_telefone_codigos IS 'Códigos de confirmação do WhatsApp do consultor (só resumo). Escrita e leitura só pelo servidor.';
