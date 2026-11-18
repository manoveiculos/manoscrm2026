-- ===========================================================================
-- LISTA DE ESPERA DE CARROS ("Procurando carro")
-- Data: 2026-11-18   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- Problema: muito cliente pede carro que não está no estoque e a informação se perde.
-- Fase 2 (esta): a Laura (ou o consultor) registra o pedido do cliente nesta tabela.
-- Fase 3 (depois): um cron compara o feed da Altimus com o último visto e avisa o cliente quando
--                  entrar um carro que combine. NADA aqui avisa ninguém ainda.
--
-- Não confundir com "fila de espera" de LEADS (20261117_fila_de_espera.sql): aquela é sobre quem
-- atende o lead; esta é sobre o carro que o cliente quer.
--
-- Acesso: RLS ligada e SEM política (só o servidor, via service_role, lê e grava), como acessos_presenca.
-- Risco: baixo. Uma tabela nova; nada existente é alterado.
--
-- REVERSÃO:
--   drop table if exists public.carro_espera;
-- ===========================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.carro_espera (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    telefone_key    text NOT NULL,
    lead_uid        text,
    conversa_id     uuid,
    consultor_id    uuid REFERENCES public.consultants_manos_crm(id) ON DELETE SET NULL,
    nome_cliente    text,
    -- o que o cliente quer
    texto_original  text NOT NULL,
    chave           text NOT NULL,            -- marca+modelo+tipo normalizados: evita pedido duplicado
    marca           text,
    modelo          text,
    carroceria      text,
    ano_min         integer,
    preco_max       numeric,
    cambio          text,
    -- controle
    origem          text NOT NULL DEFAULT 'laura' CHECK (origem IN ('laura', 'consultor')),
    status          text NOT NULL DEFAULT 'aguardando'
                    CHECK (status IN ('aguardando', 'avisado', 'atendido', 'cancelado', 'expirado')),
    criado_em       timestamptz NOT NULL DEFAULT now(),
    atualizado_em   timestamptz NOT NULL DEFAULT now(),
    expira_em       timestamptz NOT NULL DEFAULT now() + interval '90 days',
    avisado_em      timestamptz,
    veiculo_id_avisado text
);

-- um cliente só tem UM pedido aguardando por carro
CREATE UNIQUE INDEX IF NOT EXISTS uq_carro_espera_aguardando
    ON public.carro_espera (telefone_key, chave) WHERE status = 'aguardando';

CREATE INDEX IF NOT EXISTS idx_carro_espera_status ON public.carro_espera (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_carro_espera_consultor ON public.carro_espera (consultor_id) WHERE status = 'aguardando';

ALTER TABLE public.carro_espera ENABLE ROW LEVEL SECURITY;
-- sem política: nenhum papel de cliente enxerga; o service_role ignora a RLS.
