-- Migration: Add purchases_manos_crm table
-- Description: Table to record vehicles purchased from leads

CREATE TABLE IF NOT EXISTS purchases_manos_crm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads_manos_crm(id) ON DELETE SET NULL,
    consultant_id UUID REFERENCES consultants_manos_crm(id) ON DELETE SET NULL,
    vehicle_details TEXT NOT NULL,
    purchase_value DECIMAL(12,2) NOT NULL,
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_purchases_lead ON purchases_manos_crm(lead_id);
CREATE INDEX IF NOT EXISTS idx_purchases_consultant ON purchases_manos_crm(consultant_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases_manos_crm(purchase_date);

-- Enable RLS (Assuming similar policy to sales)
ALTER TABLE purchases_manos_crm ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read and insert (standard CRM behavior here)
CREATE POLICY "Allow authenticated access to purchases" ON purchases_manos_crm
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
