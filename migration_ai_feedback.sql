-- ============================================================
-- MANOS CRM — MIGRAÇÃO: Tabela ai_feedback
-- Execute no Supabase SQL Editor
-- Seguro para rodar múltiplas vezes (idempotente)
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_feedback (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id               UUID        NOT NULL,
    lead_name             TEXT,
    lead_phone            TEXT,
    reported_score        INTEGER,                         -- score que a IA atribuiu
    reported_label        TEXT,                            -- 'quente', 'morno', 'frio'
    correct_label         TEXT,                            -- o que o vendedor diz que deveria ser
    reason                TEXT        NOT NULL,            -- justificativa do vendedor
    category              TEXT        NOT NULL,            -- score_alto_demais | score_baixo_demais | lead_morto | lead_quente_ignorado | status_errado
    lead_status           TEXT,                            -- status do lead no momento do feedback
    lead_origin           TEXT,                            -- origem/source do lead
    lead_interest         TEXT,                            -- vehicle_interest no momento
    days_in_funnel        INTEGER     DEFAULT 0,           -- dias desde a criação do lead
    total_interactions    INTEGER     DEFAULT 0,           -- total de interações registradas
    last_interaction_days INTEGER     DEFAULT 999,         -- dias desde a última interação
    reported_by           TEXT        NOT NULL,            -- nome do consultor que reportou
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries do aiFeedbackService
CREATE INDEX IF NOT EXISTS idx_ai_feedback_lead_id    ON ai_feedback(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_category   ON ai_feedback(category);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created_at ON ai_feedback(created_at DESC);

-- RLS
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_feedback_authenticated_read" ON ai_feedback;
CREATE POLICY "ai_feedback_authenticated_read" ON ai_feedback
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ai_feedback_authenticated_insert" ON ai_feedback;
CREATE POLICY "ai_feedback_authenticated_insert" ON ai_feedback
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ai_feedback_service_all" ON ai_feedback;
CREATE POLICY "ai_feedback_service_all" ON ai_feedback
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Verificação final
DO $$
DECLARE col_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_name = 'ai_feedback';
    RAISE NOTICE 'ai_feedback — % colunas criadas', col_count;
END $$;
