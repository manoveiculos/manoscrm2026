-- Create table for Marketing Quality Intelligence Reports
CREATE TABLE IF NOT EXISTS marketing_quality_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_leads INTEGER DEFAULT 0,
    quentes INTEGER DEFAULT 0,
    mornos INTEGER DEFAULT 0,
    frios INTEGER DEFAULT 0,
    desqualificados INTEGER DEFAULT 0,
    perda_total INTEGER DEFAULT 0,
    quality_average DECIMAL(5,2) DEFAULT 0, -- 0-100
    overall_score DECIMAL(4,2) DEFAULT 0, -- 0-10
    insights JSONB DEFAULT '[]', -- FB performance, creative, filter, service
    recommendations JSONB DEFAULT '[]', -- Actionable items
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure crm26 table has all needed columns for individual results
ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS probability_of_sale INTEGER DEFAULT 0;
ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS recommended_approach TEXT;

-- Create an index for report_date
CREATE INDEX IF NOT EXISTS idx_marketing_quality_reports_date ON marketing_quality_reports(report_date);
