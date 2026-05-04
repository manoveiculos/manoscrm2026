-- ============================================================
-- MANOS CRM — MIGRAÇÃO AI-FIRST (Fase 1, 2 e 3)
-- Execute no Supabase SQL Editor
-- Seguro para rodar múltiplas vezes (idempotente)
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 1. leads_manos_crm — colunas de IA adicionadas nas Fases 1-3
-- ══════════════════════════════════════════════════════════════

ALTER TABLE leads_manos_crm
  ADD COLUMN IF NOT EXISTS next_step          TEXT,
  ADD COLUMN IF NOT EXISTS proxima_acao       TEXT,
  ADD COLUMN IF NOT EXISTS behavioral_profile JSONB,
  ADD COLUMN IF NOT EXISTS ai_summary         TEXT,
  ADD COLUMN IF NOT EXISTS loss_category      TEXT,        -- 3.5: motivo de perda classificado pela IA
  ADD COLUMN IF NOT EXISTS churn_probability  INTEGER DEFAULT 0;  -- 3.4: risco de abandono (0-99)

-- Índices para performance dos crons e filtros de pipeline
CREATE INDEX IF NOT EXISTS idx_leads_churn        ON leads_manos_crm(churn_probability);
CREATE INDEX IF NOT EXISTS idx_leads_status_upd   ON leads_manos_crm(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_leads_ai_score     ON leads_manos_crm(ai_score);
CREATE INDEX IF NOT EXISTS idx_leads_consultant   ON leads_manos_crm(assigned_consultant_id);


-- ══════════════════════════════════════════════════════════════
-- 2. interactions_manos_crm — colunas para timeline e WhatsApp
-- ══════════════════════════════════════════════════════════════

ALTER TABLE interactions_manos_crm
  ADD COLUMN IF NOT EXISTS type      TEXT,     -- ex: whatsapp_in, whatsapp_out, ai_followup, ai_alert_compra
  ADD COLUMN IF NOT EXISTS user_name TEXT,     -- nome do consultor ou 'Cliente'
  ADD COLUMN IF NOT EXISTS user_id   TEXT;     -- UUID do consultor ou 'system'

CREATE INDEX IF NOT EXISTS idx_interactions_lead_type
  ON interactions_manos_crm(lead_id, type);

CREATE INDEX IF NOT EXISTS idx_interactions_created
  ON interactions_manos_crm(created_at DESC);

-- RLS: service role já bypassa; permite leitura para autenticados
ALTER TABLE interactions_manos_crm ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interactions_authenticated_read" ON interactions_manos_crm;
CREATE POLICY "interactions_authenticated_read" ON interactions_manos_crm
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "interactions_service_write" ON interactions_manos_crm;
CREATE POLICY "interactions_service_write" ON interactions_manos_crm
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- 3. follow_ups — criar tabela (se não existir)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS follow_ups (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id      UUID,       -- nullable: alertas admin_overload não têm lead_id
    user_id      TEXT        NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    type         TEXT        NOT NULL,   -- ai_auto | ai_alert_compra | admin_overload | manual
    note         TEXT,
    priority     TEXT        DEFAULT 'medium',  -- high | medium | low
    status       TEXT        DEFAULT 'pending', -- pending | completed | missed
    result       TEXT,
    result_note  TEXT,
    completed_at TIMESTAMPTZ,
    metadata     JSONB,      -- dados extras (ex: { consultant_id, lead_count } no admin_overload)
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Se a tabela já existia sem essas colunas, garantir que existam
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS metadata   JSONB;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- lead_id precisa ser NULL para alertas de admin_overload (3.3)
ALTER TABLE follow_ups ALTER COLUMN lead_id DROP NOT NULL;

-- Índices para queries de dedup e listagem
CREATE INDEX IF NOT EXISTS idx_followups_lead    ON follow_ups(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_followups_type    ON follow_ups(type, status);
CREATE INDEX IF NOT EXISTS idx_followups_user    ON follow_ups(user_id, status);
CREATE INDEX IF NOT EXISTS idx_followups_created ON follow_ups(created_at DESC);

-- RLS
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "followups_authenticated_read" ON follow_ups;
CREATE POLICY "followups_authenticated_read" ON follow_ups
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "followups_service_all" ON follow_ups;
CREATE POLICY "followups_service_all" ON follow_ups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Permite que o consultor logado gerencie seus próprios follow-ups
DROP POLICY IF EXISTS "followups_user_write" ON follow_ups;
CREATE POLICY "followups_user_write" ON follow_ups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- 4. Verificação final — confirma colunas criadas
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'leads_manos_crm'
    AND column_name IN ('next_step','proxima_acao','churn_probability','loss_category','behavioral_profile','ai_summary');

  RAISE NOTICE 'leads_manos_crm — % de 6 colunas IA confirmadas', col_count;

  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'interactions_manos_crm'
    AND column_name IN ('type','user_name','user_id');

  RAISE NOTICE 'interactions_manos_crm — % de 3 colunas confirmadas', col_count;

  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'follow_ups';

  RAISE NOTICE 'follow_ups — % colunas no total', col_count;
END $$;
