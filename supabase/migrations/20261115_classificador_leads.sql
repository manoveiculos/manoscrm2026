-- ===========================================================================
-- CLASSIFICADOR DE LEADS (agente do time de atendimento)
-- Data: 2026-11-13   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- O Classificador lê a conversa da Laura com o cliente e extrai as 4 respostas de qualificação
-- (carro, entrada, troca, prazo), cada uma com a frase do cliente que a prova. Preenche no lead
-- SÓ o que estava vazio, e a regra oficial do CRM (classificarLead) dá o selo.
--
--   wa_ia_config.classificador   'desligado' (padrão) | 'ensaio' (só registra) | 'grava' (grava no lead)
--   wa_conversas.classificado_em quando a conversa foi classificada pela última vez
--   lead_classificacoes          histórico de cada classificação: o que a IA achou, as provas, o que
--                                foi gravado no lead (para auditar e desfazer) e o custo
--
-- Esta migration NÃO muda nada hoje: a chave nasce 'desligado'.
-- Acesso: lead_classificacoes só pelo servidor (service_role); RLS ligada, sem política.
-- Risco: baixo. Uma coluna com padrão, uma coluna vazia e uma tabela nova.
--
-- REVERSÃO:
--   drop table if exists public.lead_classificacoes;
--   alter table public.wa_conversas drop column if exists classificado_em;
--   alter table public.wa_ia_config drop column if exists classificador;
-- ===========================================================================

SET lock_timeout = '5s';

ALTER TABLE public.wa_ia_config
    ADD COLUMN IF NOT EXISTS classificador text NOT NULL DEFAULT 'desligado'
        CHECK (classificador IN ('desligado', 'ensaio', 'grava'));

ALTER TABLE public.wa_conversas
    ADD COLUMN IF NOT EXISTS classificado_em timestamptz;

CREATE TABLE IF NOT EXISTS public.lead_classificacoes (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em         timestamptz NOT NULL DEFAULT now(),
    lead_uid          text NOT NULL,
    conversa_id       uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL,
    modo              text NOT NULL CHECK (modo IN ('ensaio', 'grava')),
    modelo            text,
    categoria         text NOT NULL,
    selo              text NOT NULL,
    classe            text,
    score             integer,
    confianca         text,
    resumo            text,
    proxima_acao      text,
    -- o que a IA extraiu, cada campo com a frase do cliente que o prova
    extracao          jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- o que foi de fato escrito no lead (vazio no ensaio) — serve para desfazer
    campos_gravados   jsonb NOT NULL DEFAULT '{}'::jsonb,
    classe_gravada    boolean NOT NULL DEFAULT false,
    descartados       text[] NOT NULL DEFAULT '{}',
    custo_usd         numeric(10, 6)
);
CREATE INDEX IF NOT EXISTS idx_lead_classificacoes_lead ON public.lead_classificacoes (lead_uid, criado_em DESC);
ALTER TABLE public.lead_classificacoes ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.lead_classificacoes IS 'Histórico do Classificador de leads: extração com provas, selo da regra oficial, o que foi gravado. Só o servidor lê/escreve.';
