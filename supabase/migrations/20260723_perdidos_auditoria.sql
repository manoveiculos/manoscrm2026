-- =====================================================================
-- Auditoria de Perdidos — pesquisa de satisfação + cobrança no vendedor
-- Data: 2026-07-23
--
-- Todo lead marcado como PERDIDO (ou arquivado como SPAM) cai aqui pro
-- admin auditar: ligar pro cliente, ver se foi bem atendido, se ficou
-- dúvida, dar nota — e, dependendo da resposta, gerar cobrança formal
-- no vendedor (que aparece no War Room dele até ser resolvida).
--
-- A fila é populada por sync no GET /api/perdidos (service-role), sem
-- trigger nas 3 tabelas de lead. lead_uid é único ("<tabela>:<id>").
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.perdidos_auditoria (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_uid                TEXT NOT NULL UNIQUE,
    categoria               TEXT NOT NULL DEFAULT 'perdido' CHECK (categoria IN ('perdido','spam')),
    -- Snapshot do lead na hora da perda
    cliente_nome            TEXT,
    cliente_telefone        TEXT,
    veiculo_interesse       TEXT,
    vendedor_consultant_id  UUID,          -- consultants_manos_crm.id (assigned_consultant_id)
    vendedor_nome           TEXT,
    motivo                  TEXT,          -- diagnóstico escrito na perda
    perdido_em              TIMESTAMPTZ,
    -- Pesquisa de satisfação (preenchida pelo admin)
    status_auditoria        TEXT NOT NULL DEFAULT 'pendente'
                              CHECK (status_auditoria IN ('pendente','contatado','sem_resposta','resolvido')),
    bem_atendido            BOOLEAN,
    nota                    SMALLINT CHECK (nota BETWEEN 1 AND 5),
    duvidas                 TEXT,
    comentario              TEXT,
    -- Cobrança no vendedor (depende das respostas)
    gerar_cobranca          BOOLEAN NOT NULL DEFAULT FALSE,
    cobranca_texto          TEXT,
    cobranca_resolvida      BOOLEAN NOT NULL DEFAULT FALSE,
    contatado_em            TIMESTAMPTZ,
    auditado_por            TEXT,
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perdidos_status ON public.perdidos_auditoria(status_auditoria, perdido_em DESC);
CREATE INDEX IF NOT EXISTS idx_perdidos_vendedor ON public.perdidos_auditoria(vendedor_consultant_id)
    WHERE gerar_cobranca = TRUE AND cobranca_resolvida = FALSE;

DROP TRIGGER IF EXISTS set_ts_perdidos ON public.perdidos_auditoria;
CREATE TRIGGER set_ts_perdidos BEFORE UPDATE ON public.perdidos_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp_agenda();

-- RLS: só admin (e service_role). Vendedor NÃO vê a auditoria.
ALTER TABLE public.perdidos_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perdidos admin" ON public.perdidos_auditoria;
CREATE POLICY "Perdidos admin" ON public.perdidos_auditoria
    FOR ALL
    USING (
        auth.jwt() ->> 'email' = 'alexandre_gorges@hotmail.com'
        OR EXISTS (SELECT 1 FROM public.consultants_manos_crm
                   WHERE auth_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        auth.jwt() ->> 'email' = 'alexandre_gorges@hotmail.com'
        OR EXISTS (SELECT 1 FROM public.consultants_manos_crm
                   WHERE auth_id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "Perdidos service_role" ON public.perdidos_auditoria;
CREATE POLICY "Perdidos service_role" ON public.perdidos_auditoria
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
