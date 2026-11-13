-- ===========================================================================
-- SITUAÇÃO DA CONVERSA (Analista de contexto) — Fase 1 do time de agentes
-- Data: 2026-11-11   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- O Analista de contexto lê a conversa do WhatsApp da loja quando ela para e grava
-- aqui em que pé ela está (ex.: "consultor levou para o particular", "visita marcada",
-- "cliente pediu tempo"). Quem usa: o briefing da ficha e, na Fase 2, o follow-up.
--
--   situacao     jsonb  { situacao, resumo, proximaAcao, quando, confianca, modelo, analisadaEm }
--   situacao_em  quando a conversa foi analisada pela última vez
--
-- Acesso: igual ao resto da conversa (as políticas de wa_conversas já decidem quem lê).
-- Escrita só pelo servidor (service_role).
-- Risco: baixo. Duas colunas novas, vazias, numa tabela pequena. Nada existente muda.
--
-- REVERSÃO:
--   alter table public.wa_conversas drop column if exists situacao, drop column if exists situacao_em;
-- ===========================================================================

SET lock_timeout = '5s';

ALTER TABLE public.wa_conversas
    ADD COLUMN IF NOT EXISTS situacao    jsonb,
    ADD COLUMN IF NOT EXISTS situacao_em timestamptz;

COMMENT ON COLUMN public.wa_conversas.situacao IS 'Situação lida pelo Analista de contexto (IA). Só leitura para a tela; escrita pelo servidor.';
