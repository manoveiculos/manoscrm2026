-- Phase 1: Database Enhancement for Professional CRM (manoscrm26)
-- Run this in your Supabase SQL Editor

-- 1. Create Consultants Table (New Suffix)
CREATE TABLE IF NOT EXISTS consultants_manoscrm26 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    specialty TEXT,
    performance_score DECIMAL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    on_duty BOOLEAN DEFAULT FALSE,
    last_lead_assigned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns_manoscrm26 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform TEXT, -- meta, google, etc
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    total_spend DECIMAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Leads Table
CREATE TABLE IF NOT EXISTS leads_manoscrm26 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    source TEXT,
    campaign_id UUID REFERENCES campaigns_manoscrm26(id),
    creative_id TEXT,
    vehicle_interest TEXT,
    region TEXT,
    estimated_ticket DECIMAL,
    ai_score INTEGER DEFAULT 0,
    ai_classification TEXT DEFAULT 'cold',
    status TEXT DEFAULT 'received',
    assigned_consultant_id UUID REFERENCES consultants_manoscrm26(id),
    assigned_at TIMESTAMPTZ,
    first_contact_at TIMESTAMPTZ,
    response_time_seconds INTEGER,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    duplicate_id UUID REFERENCES leads_manoscrm26(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Sales Table
CREATE TABLE IF NOT EXISTS sales_manoscrm26 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads_manoscrm26(id),
    inventory_id INTEGER, -- Link to existing estoque
    consultant_id UUID REFERENCES consultants_manoscrm26(id),
    sale_value DECIMAL NOT NULL,
    profit_margin DECIMAL NOT NULL,
    sale_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Lead History Table
CREATE TABLE IF NOT EXISTS lead_history_manoscrm26 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads_manoscrm26(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_leads_phone_26 ON leads_manoscrm26(phone);
CREATE INDEX IF NOT EXISTS idx_leads_email_26 ON leads_manoscrm26(email);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_26 ON leads_manoscrm26(assigned_consultant_id);

-- 6. Daily AI Marketing Reports Table
CREATE TABLE IF NOT EXISTS marketing_daily_reports_manoscrm26 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_date DATE DEFAULT CURRENT_DATE,
    summary TEXT,
    recommendations JSONB, -- List of specific campaign actions
    performance_metrics JSONB, -- CAC, ROI, CPL of the day
    roi_prediction DECIMAL,
    status TEXT DEFAULT 'processed', -- processed, draft
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for date-based lookups
CREATE INDEX IF NOT EXISTS idx_marketing_reports_date ON marketing_daily_reports_manoscrm26(report_date);
