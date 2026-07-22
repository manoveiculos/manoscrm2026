-- =====================================================================
-- Módulo "Agenda de Visitas" — Manos CRM
-- Data: 2026-07-22
--
-- Novo processo comercial: WhatsApp só serve pra AGENDAR. Toda conversa
-- termina com dia+hora de visita. A meta virou "visita agendada" e "quem
-- compareceu". Esta tabela é o coração disso.
--
-- Adaptações à realidade do CRM (a spec era genérica):
--   • NÃO existe uma tabela única public.leads — são 3 tabelas unificadas
--     por views. Por isso o vínculo é lead_uid TEXT ("<tabela>:<id>") +
--     snapshot do cliente (nunca depende só do FK).
--   • vendedor_id = auth.users.id (o auth.uid() do vendedor logado). O nome
--     é resolvido via consultants_manos_crm (auth_id).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.agendamentos (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendedor_id              UUID NOT NULL,                         -- auth.uid() do vendedor
    lead_uid                 TEXT,                                  -- "leads_manos_crm:<uuid>" etc. (opcional)
    -- Snapshot do cliente (o lead pode mudar/sumir)
    cliente_nome             TEXT NOT NULL,
    cliente_telefone         TEXT,
    cliente_whatsapp         TEXT,
    veiculo_interesse        TEXT,
    -- Tipo do encontro
    tipo                     TEXT NOT NULL CHECK (tipo IN ('loja','externa')),
    endereco                 TEXT,                                  -- obrigatório quando tipo='externa' (validado na API)
    data_hora                TIMESTAMPTZ NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'agendado'
                               CHECK (status IN ('agendado','confirmado','compareceu','nao_compareceu','remarcado','cancelado')),
    observacoes              TEXT,
    -- Idempotência dos lembretes (nunca disparar 2×)
    lembrete_1d_enviado_em   TIMESTAMPTZ,
    lembrete_dia_enviado_em  TIMESTAMPTZ,
    criado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_vendedor ON public.agendamentos(vendedor_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON public.agendamentos(data_hora)
    WHERE status IN ('agendado','confirmado');

-- Trigger atualizado_em -------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_update_timestamp_agenda()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_ts_agendamentos ON public.agendamentos;
CREATE TRIGGER set_ts_agendamentos BEFORE UPDATE ON public.agendamentos
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp_agenda();

-- RLS: vendedor vê só a dele; admin vê tudo; service_role total ---------
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agenda vendedor dono" ON public.agendamentos;
CREATE POLICY "Agenda vendedor dono" ON public.agendamentos
    FOR ALL
    USING (
        vendedor_id = auth.uid()
        OR auth.jwt() ->> 'email' = 'alexandre_gorges@hotmail.com'
        OR EXISTS (SELECT 1 FROM public.consultants_manos_crm
                   WHERE auth_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        vendedor_id = auth.uid()
        OR auth.jwt() ->> 'email' = 'alexandre_gorges@hotmail.com'
        OR EXISTS (SELECT 1 FROM public.consultants_manos_crm
                   WHERE auth_id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "Agenda service_role" ON public.agendamentos;
CREATE POLICY "Agenda service_role" ON public.agendamentos
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Métricas por vendedor (visita agendada + comparecimento) --------------
CREATE OR REPLACE VIEW public.agenda_metrics_por_vendedor AS
SELECT
    vendedor_id,
    count(*) FILTER (WHERE (data_hora AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS agendados_hoje,
    count(*) FILTER (WHERE status = 'compareceu') AS compareceram,
    count(*) FILTER (WHERE status = 'nao_compareceu') AS nao_compareceram,
    count(*) FILTER (WHERE status IN ('compareceu','nao_compareceu')) AS finalizados
FROM public.agendamentos
GROUP BY vendedor_id;
