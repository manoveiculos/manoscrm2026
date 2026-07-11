-- ============================================================================
-- Roleta de Prêmios — registro de rodadas (gamificação pós-venda)
-- Data: 2026-07-11
-- ============================================================================
-- Cada venda (veiculo_id = id do lead/venda) rende UM giro que soma um prêmio
-- em dinheiro (R$ 50–500) à comissão. Esta tabela é a fonte da verdade + trava
-- anti-fraude (1 giro por veículo, garantido por UNIQUE, não só por checagem
-- de aplicação). Escrita SEMPRE via rota server-side (service_role) — o cliente
-- nunca insere direto nem decide o prêmio.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roletas_rodadas (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    consultor_id    uuid,                       -- FK lógica p/ consultants_manos_crm (auditoria)
    consultor_nome  text,
    consultor_email text,
    veiculo_id      text NOT NULL,              -- id do lead/venda (uuid, bigint ou uid "tabela:id")
    veiculo_modelo  text,
    premio_ganho    numeric(10,2) NOT NULL CHECK (premio_ganho >= 0)
);

-- Trava anti-fraude: no máximo 1 rodada por veículo (atômico contra corrida de cliques/abas).
CREATE UNIQUE INDEX IF NOT EXISTS roletas_rodadas_veiculo_uidx
    ON public.roletas_rodadas (veiculo_id);

-- Consulta por consultor (relatórios/dashboards).
CREATE INDEX IF NOT EXISTS roletas_rodadas_consultor_idx
    ON public.roletas_rodadas (consultor_id, created_at DESC);

-- RLS: fecha a tabela. authenticated só LÊ (p/ dashboards); INSERT/UPDATE/DELETE
-- ficam exclusivos do service_role (rotas server-side), que bypassa RLS.
ALTER TABLE public.roletas_rodadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roletas_rodadas_select ON public.roletas_rodadas;
CREATE POLICY roletas_rodadas_select ON public.roletas_rodadas
    FOR SELECT TO authenticated USING (true);
