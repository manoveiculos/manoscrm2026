-- =====================================================
-- COWORK IA — Tabelas de Avisos e Reconhecimentos
-- Execute no Supabase SQL Editor
-- =====================================================

-- Tabela de avisos da gerência
CREATE TABLE IF NOT EXISTS cowork_alerts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at           TIMESTAMPTZ DEFAULT now(),
    type                 TEXT NOT NULL DEFAULT 'manual',
    priority             SMALLINT NOT NULL DEFAULT 2, -- 1=crítico 2=atenção 3=aviso
    title                TEXT NOT NULL,
    message              TEXT NOT NULL,
    target_consultant_id UUID REFERENCES consultants_manos_crm(id) ON DELETE SET NULL,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    expires_at           TIMESTAMPTZ
);

-- Índice para busca por consultor + ativo
CREATE INDEX IF NOT EXISTS idx_cowork_alerts_active
    ON cowork_alerts (is_active, target_consultant_id);

-- Tabela de respostas dos consultores
CREATE TABLE IF NOT EXISTS alert_acknowledgements (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at       TIMESTAMPTZ DEFAULT now(),
    alert_id         UUID NOT NULL REFERENCES cowork_alerts(id) ON DELETE CASCADE,
    consultant_id    UUID NOT NULL REFERENCES consultants_manos_crm(id) ON DELETE CASCADE,
    consultant_name  TEXT NOT NULL DEFAULT 'Desconhecido',
    action           TEXT NOT NULL CHECK (action IN ('acknowledged', 'contested')),
    contest_reason   TEXT,

    UNIQUE (alert_id, consultant_id) -- cada consultor responde uma vez por aviso
);

-- Índice para busca por aviso
CREATE INDEX IF NOT EXISTS idx_alert_acks_alert_id
    ON alert_acknowledgements (alert_id);

-- RLS: habilitar (o acesso é feito via service_role_key nas API routes)
ALTER TABLE cowork_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Políticas abertas para service_role (recria sem erro)
DROP POLICY IF EXISTS "service_role_cowork_alerts" ON cowork_alerts;
CREATE POLICY "service_role_cowork_alerts" ON cowork_alerts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_alert_acks" ON alert_acknowledgements;
CREATE POLICY "service_role_alert_acks" ON alert_acknowledgements
    FOR ALL TO service_role USING (true) WITH CHECK (true);
