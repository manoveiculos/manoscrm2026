-- ===========================================================================
-- LAURA DENTRO DO CRM — etapa B (ENSAIO: escreve a resposta, não envia)
-- Data: 2026-11-06 · Growth 360 · NÃO APLICAR sem o "aprovado" do Alexandre
-- Especificação: docs/growth360/time-atendimento-crm.md
--
-- O que cria:
--   wa_conversas  + nome_cliente, nome_cliente_origem, nome_ia_no_lead, cidade, ficha
--                   (o nome que o cliente disse fica separado do nome do perfil do
--                    WhatsApp, que a ingestão atualiza a cada mensagem)
--   wa_ia_config     1 linha: modo da IA (desligada | ensaio | envia). Nasce DESLIGADA.
--   wa_ia_execucoes  1 linha por rodada da Laura: rascunho, ferramentas chamadas,
--                    tokens, custo, tempo, violações barradas pelo filtro.
--                    Índice único parcial = trava por conversa (1 rodada por vez).
--
-- Acesso: leitura só gestor/admin (wa_ve_todas); escrita só o servidor
-- (service_role). Sem nada para anon.
--
-- Risco: baixo. Só objetos novos e colunas novas (vazias/padrão) em wa_conversas,
-- que tem poucas linhas. Nenhuma tabela de lead muda de estrutura.
--
-- REVERSÃO:
--   drop table if exists public.wa_ia_execucoes, public.wa_ia_config;
--   alter table public.wa_conversas drop column if exists ficha,
--     drop column if exists cidade, drop column if exists nome_ia_no_lead,
--     drop column if exists nome_cliente_origem, drop column if exists nome_cliente;
--
-- Teste de acesso: supabase/tests/wa_ia_rls.test.sql (bloco DO que sempre termina
-- em erro de propósito, para desfazer tudo).
--
-- ENSAIADA em produção em 06/11/2026 ~06:15 (Brasília), dentro de
-- BEGIN … ROLLBACK junto com o teste: "WA_IA PASSOU — 22 verificações ok".
-- Conferido em seguida: 0 tabelas wa_ia_*, 0 colunas novas, 0 dados de teste.
--
-- APLICADA em produção em 06/11/2026 ~08:45 (Brasília), com o "aprovado" do
-- Alexandre (versão no histórico do Supabase: 20261106114138 wa_ia_ensaio).
-- Teste de acesso rodado no banco real logo depois: 22/22 ok. Botão nasceu
-- "desligada"; 5 conversas e 55 mensagens intactas; ingestão sem erro.
-- ===========================================================================

SET lock_timeout = '5s';

-- 1. Conversa: nome e cidade que o cliente informou + ficha preparada pela Laura
ALTER TABLE public.wa_conversas
    ADD COLUMN IF NOT EXISTS nome_cliente        text,
    ADD COLUMN IF NOT EXISTS nome_cliente_origem text CHECK (nome_cliente_origem IN ('ia', 'manual')),
    ADD COLUMN IF NOT EXISTS nome_ia_no_lead     text,
    ADD COLUMN IF NOT EXISTS cidade              text,
    ADD COLUMN IF NOT EXISTS ficha               jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.wa_conversas.nome_ia_no_lead IS
    'Último nome que a IA gravou no lead. Se o nome do lead mudou depois, foi um consultor: a IA não sobrescreve.';

-- 2. Botão geral da IA (1 linha só)
CREATE TABLE IF NOT EXISTS public.wa_ia_config (
    id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    modo           text NOT NULL DEFAULT 'desligada' CHECK (modo IN ('desligada', 'ensaio', 'envia')),
    atualizado_por uuid,
    atualizado_em  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.wa_ia_config (id, modo) VALUES (1, 'desligada') ON CONFLICT (id) DO NOTHING;

-- 3. Cada rodada da Laura
CREATE TABLE IF NOT EXISTS public.wa_ia_execucoes (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id           uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
    gatilho_mensagem_id   uuid REFERENCES public.wa_mensagens(id) ON DELETE SET NULL,
    modo                  text NOT NULL CHECK (modo IN ('ensaio', 'envia')),
    status                text NOT NULL DEFAULT 'rodando'
                              CHECK (status IN ('rodando', 'ok', 'erro', 'pulada', 'abandonada')),
    motivo                text,
    modelo                text,
    texto_original        text,
    texto_final           text,
    violacoes             text[] NOT NULL DEFAULT '{}',
    ferramentas           jsonb NOT NULL DEFAULT '[]'::jsonb,
    fotos                 jsonb,
    agendamento           jsonb,
    passagem              jsonb,
    ficha                 jsonb,
    tokens_entrada        integer,
    tokens_saida          integer,
    tokens_cache_leitura  integer,
    tokens_cache_escrita  integer,
    custo_usd             numeric(10, 6),
    tempo_ms              integer,
    iteracoes             smallint,
    enviada               boolean NOT NULL DEFAULT false,
    provider_message_id   text,
    iniciada_em           timestamptz NOT NULL DEFAULT now(),
    terminada_em          timestamptz
);

-- Trava por conversa: no máximo 1 rodada 'rodando' por vez
CREATE UNIQUE INDEX IF NOT EXISTS wa_ia_execucoes_uma_rodando
    ON public.wa_ia_execucoes (conversa_id) WHERE status = 'rodando';
CREATE INDEX IF NOT EXISTS idx_wa_ia_execucoes_conversa ON public.wa_ia_execucoes (conversa_id, iniciada_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_ia_execucoes_dia ON public.wa_ia_execucoes (iniciada_em DESC);

COMMENT ON TABLE public.wa_ia_execucoes IS
    'Rodadas da Laura no CRM. No ensaio, texto_final é o rascunho que ela mandaria (nada vai ao cliente).';

-- 4. Acesso
ALTER TABLE public.wa_ia_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_ia_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_ia_config_select ON public.wa_ia_config;
CREATE POLICY wa_ia_config_select ON public.wa_ia_config
    FOR SELECT TO authenticated USING ((SELECT public.wa_ve_todas()));

DROP POLICY IF EXISTS wa_ia_execucoes_select ON public.wa_ia_execucoes;
CREATE POLICY wa_ia_execucoes_select ON public.wa_ia_execucoes
    FOR SELECT TO authenticated USING ((SELECT public.wa_ve_todas()));

REVOKE ALL ON public.wa_ia_config, public.wa_ia_execucoes FROM anon, public;
REVOKE ALL ON public.wa_ia_config, public.wa_ia_execucoes FROM authenticated;
GRANT SELECT ON public.wa_ia_config, public.wa_ia_execucoes TO authenticated;
GRANT ALL ON public.wa_ia_config, public.wa_ia_execucoes TO service_role;
