-- MASTER SYNC: Unified Database Architecture for Manos Veículos CRM
-- Run this in your Supabase SQL Editor to unify all tables under the '_manos_crm' suffix.

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CREATE TABLES (UNIFIED NAMES)

-- CONSULTANTS
CREATE TABLE IF NOT EXISTS consultants_manos_crm (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    specialty TEXT,
    performance_score DECIMAL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    on_duty BOOLEAN DEFAULT FALSE,
    last_lead_assigned_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending', -- pending, active, blocked
    role TEXT DEFAULT 'consultant', -- admin, consultant
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CAMPAIGNS
CREATE TABLE IF NOT EXISTS campaigns_manos_crm (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform TEXT, -- Meta Ads, Google Ads, etc
    name TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'active',
    total_spend DECIMAL DEFAULT 0,
    link_clicks INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    cpc DECIMAL DEFAULT 0,
    ctr DECIMAL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LEADS
CREATE TABLE IF NOT EXISTS leads_manos_crm (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    source TEXT,
    campaign_id UUID REFERENCES campaigns_manos_crm(id),
    creative_id TEXT,
    vehicle_interest TEXT,
    region TEXT,
    estimated_ticket DECIMAL,
    ai_score INTEGER DEFAULT 0,
    ai_classification TEXT DEFAULT 'cold', -- hot, warm, cold
    ai_summary TEXT,
    ai_reason TEXT, -- Detailed AI justification
    status TEXT DEFAULT 'received',
    assigned_consultant_id UUID REFERENCES consultants_manos_crm(id),
    assigned_at TIMESTAMPTZ,
    first_contact_at TIMESTAMPTZ,
    response_time_seconds INTEGER,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    duplicate_id UUID REFERENCES leads_manos_crm(id),
    
    -- Meta Ads Specifics
    id_meta TEXT,
    id_formulario TEXT,
    id_anuncio_meta TEXT,
    id_conjunto_anuncio_meta TEXT,
    id_campanha_meta TEXT,
    plataforma_meta TEXT,
    data_criacao_meta TEXT,
    dados_brutos JSONB,
    
    -- Additional Insights
    observacoes TEXT,
    valor_investimento TEXT,
    metodo_compra TEXT,
    carro_troca TEXT,
    prazo_troca TEXT,
    scheduled_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SALES
CREATE TABLE IF NOT EXISTS sales_manos_crm (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads_manos_crm(id),
    inventory_id INTEGER, -- Link to 'estoque_manos_crm' or legacy 'estoque'
    consultant_id UUID REFERENCES consultants_manos_crm(id),
    sale_value DECIMAL NOT NULL,
    profit_margin DECIMAL NOT NULL,
    sale_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INTERACTIONS (History)
CREATE TABLE IF NOT EXISTS interactions_manos_crm (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads_manos_crm(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MARKETING REPORTS
CREATE TABLE IF NOT EXISTS marketing_daily_reports_manos_crm (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_date DATE DEFAULT CURRENT_DATE,
    summary TEXT,
    recommendations JSONB, 
    performance_metrics JSONB, 
    roi_prediction DECIMAL,
    status TEXT DEFAULT 'processed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INVENTORY (Unified View - DO NOT CREATE AS TABLE)
-- We use a view because the 'estoque' table is integrated with external systems.
-- This ensures 'estoque_manos_crm' exists for the CRM while keeping 'estoque' untouched.
DROP VIEW IF EXISTS estoque_manos_crm CASCADE;
DROP TABLE IF EXISTS estoque_manos_crm CASCADE;

CREATE OR REPLACE VIEW estoque_manos_crm AS
SELECT 
    * 
FROM estoque;

-- 3. SAFETY CHECKS & REPAIR
-- Ensure updated_at exists in all tables before migration
DO $$ 
BEGIN 
    -- Ensure columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns_manos_crm' AND column_name='updated_at') THEN
        ALTER TABLE campaigns_manos_crm ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_manos_crm' AND column_name='updated_at') THEN
        ALTER TABLE leads_manos_crm ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Ensure unique constraint for sync (ON CONFLICT requires this)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_manos_crm_name_key') THEN
        -- Check if there's any other unique constraint on name
        IF NOT EXISTS (
            SELECT 1 FROM pg_index i 
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'campaigns_manos_crm'::regclass AND i.indisunique AND a.attname = 'name'
        ) THEN
            ALTER TABLE campaigns_manos_crm ADD CONSTRAINT campaigns_manos_crm_name_key UNIQUE (name);
        END IF;
    END IF;
END $$;

-- 4. DATA MIGRATION (Safe copy from legacy tables)

DO $$ 
BEGIN 
    -- Migrate Campaigns
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaigns_manoscrm26') THEN
        INSERT INTO campaigns_manos_crm (id, name, platform, status, total_spend, updated_at, created_at)
        SELECT id, name, platform, status, total_spend, updated_at, created_at 
        FROM campaigns_manoscrm26
        ON CONFLICT (name) DO UPDATE SET 
            total_spend = EXCLUDED.total_spend,
            updated_at = EXCLUDED.updated_at;
    END IF;

    -- Migrate Inventory (SKIPPED: Now using VIEW 'estoque_manos_crm' pointing to 'estoque')
    -- Migration is no longer needed because the view is live.

    -- Migrate Reports
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketing_daily_reports_manoscrm26') THEN
        INSERT INTO marketing_daily_reports_manos_crm (id, report_date, summary, recommendations, performance_metrics, roi_prediction, status, created_at)
        SELECT id, report_date, summary, recommendations, performance_metrics, roi_prediction, status, created_at 
        FROM marketing_daily_reports_manoscrm26
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 4. HOUSEKEEPING (Indices & Constraints)
CREATE INDEX IF NOT EXISTS idx_leads_phone_manos ON leads_manos_crm(phone);
CREATE INDEX IF NOT EXISTS idx_leads_consultant_manos ON leads_manos_crm(assigned_consultant_id);
CREATE INDEX IF NOT EXISTS idx_sales_lead_manos ON sales_manos_crm(lead_id);
CREATE INDEX IF NOT EXISTS idx_reports_date_manos ON marketing_daily_reports_manos_crm(report_date);

-- Enable RLS
ALTER TABLE leads_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultants_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_daily_reports_manos_crm ENABLE ROW LEVEL SECURITY;

-- Simple RLS Policy: Authenticated users can read everything
DROP POLICY IF EXISTS "Allow all for authenticated" ON leads_manos_crm;
CREATE POLICY "Allow all for authenticated" ON leads_manos_crm FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON consultants_manos_crm;
CREATE POLICY "Allow all for authenticated" ON consultants_manos_crm FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON campaigns_manos_crm;
CREATE POLICY "Allow all for authenticated" ON campaigns_manos_crm FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON marketing_daily_reports_manos_crm;
CREATE POLICY "Allow all for authenticated" ON marketing_daily_reports_manos_crm FOR ALL USING (auth.role() = 'authenticated');

-- Note: RLS for 'estoque' is skipped to avoid any changes to its structure/config.
