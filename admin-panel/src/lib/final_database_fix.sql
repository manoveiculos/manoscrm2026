-- FINAL FIX: Create Missing Tables and Ensure Constraints (manoscrm26)
-- Run this in your Supabase SQL Editor

-- 1. Create Daily AI Marketing Reports Table (if missing)
CREATE TABLE IF NOT EXISTS marketing_daily_reports_manoscrm26 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_date DATE DEFAULT CURRENT_DATE,
    summary TEXT,
    recommendations JSONB, 
    performance_metrics JSONB, 
    roi_prediction DECIMAL,
    status TEXT DEFAULT 'processed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for date-based lookups
CREATE INDEX IF NOT EXISTS idx_marketing_reports_date ON marketing_daily_reports_manoscrm26(report_date);

-- 2. Ensure Campaigns Table has necessary columns and constraints
-- (Adding updated_at if missing)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns_manoscrm26' AND column_name='updated_at') THEN
        ALTER TABLE campaigns_manoscrm26 ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- (Adding unique constraint for sync)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_campaign_name_manos') THEN
        ALTER TABLE campaigns_manoscrm26 ADD CONSTRAINT unique_campaign_name_manos UNIQUE (name);
    END IF;
END $$;

-- 3. Insert a dummy report if the table is empty (to test UI)
INSERT INTO marketing_daily_reports_manoscrm26 (summary, recommendations, performance_metrics, roi_prediction)
SELECT 
    'A análise de IA está ativa. Sincronize seus dados para ver insights reais.',
    '[{"title": "Meta Ads", "action": "Aguardando Sinc", "reason": "Sem dados reais"}]'::jsonb,
    '{"cac": 0, "roi": 0}'::jsonb,
    1.0
WHERE NOT EXISTS (SELECT 1 FROM marketing_daily_reports_manoscrm26 LIMIT 1);
