-- =====================================================
-- COWORK IA — Tabela de Relatórios Diários
-- Execute no Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS cowork_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ DEFAULT now(),
    type        TEXT NOT NULL DEFAULT 'daily_briefing', -- 'daily_briefing' | 'weekly' | 'alert_summary'
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_cowork_reports_type_date
    ON cowork_reports (type, created_at DESC);

ALTER TABLE cowork_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_cowork_reports" ON cowork_reports;
CREATE POLICY "service_role_cowork_reports" ON cowork_reports
    FOR ALL TO service_role USING (true) WITH CHECK (true);
