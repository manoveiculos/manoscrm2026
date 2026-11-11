-- ===========================================================================
-- CENTRAL DOS AGENTES — interruptor de cada agente (aba /agentes)
-- Data: 2026-11-06 · Programa Growth 360 · NÃO APLICAR sem o "aprovado" do Alexandre
--
-- O que cria (só objeto NOVO; nada existente muda):
--   tabela agentes_config — uma linha por agente com o modo atual:
--          ligado | ensaio | desligado, quem mudou e quando.
--          Linha especial 'ia_geral' = interruptor geral do maestro.
--          Agente sem linha = ligado (padrão: nada muda até alguém desligar).
--
-- Quem consulta: os agentes, antes de agir (src/lib/agentes/config.ts →
-- agenteLigado()). A Laura continua com o botão dela (wa_ia_config); quando a
-- sessão dela integrar, ela também respeita a linha 'ia_geral'.
--
-- Acesso:
--   anon          → nada
--   authenticated → SELECT só para admin (is_admin_or_alexandre())
--   escrita       → só o servidor (service_role), na rota /api/agentes/config,
--                   depois de conferir que quem pediu é admin
--
-- Risco: baixo. Tabela nova; a linha 'ia_geral' nasce LIGADA, então nenhum
-- agente muda de comportamento ao aplicar.
--
-- REVERSÃO:
--   drop table if exists public.agentes_config;
--   (os agentes voltam ao padrão "ligado")
--
-- Teste de RLS: supabase/tests/agentes_config_rls.test.sql (bloco DO que
-- termina em raise exception — tudo é desfeito).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.agentes_config (
    agente_id     text PRIMARY KEY CHECK (agente_id ~ '^[a-z0-9_]{2,40}$'),
    modo          text NOT NULL DEFAULT 'ligado' CHECK (modo IN ('ligado', 'ensaio', 'desligado')),
    ligado        boolean GENERATED ALWAYS AS (modo <> 'desligado') STORED,
    alterado_por  text,
    alterado_em   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agentes_config IS
    'Interruptor de cada agente da Central dos Agentes (/agentes). Sem linha = ligado. Escrita só pelo servidor.';

INSERT INTO public.agentes_config (agente_id, modo, alterado_por)
VALUES ('ia_geral', 'ligado', 'migration')
ON CONFLICT (agente_id) DO NOTHING;

ALTER TABLE public.agentes_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agentes_config_select_admin ON public.agentes_config;
CREATE POLICY agentes_config_select_admin ON public.agentes_config
    FOR SELECT TO authenticated
    USING ((SELECT public.is_admin_or_alexandre()));

-- Sem INSERT/UPDATE/DELETE para o navegador: tudo passa pelo servidor.
REVOKE ALL ON public.agentes_config FROM anon, public;
REVOKE ALL ON public.agentes_config FROM authenticated;
GRANT SELECT ON public.agentes_config TO authenticated;
GRANT ALL ON public.agentes_config TO service_role;
