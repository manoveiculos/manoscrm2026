-- FIX RLS POLICIES FOR DISTRIBUTION TABLES
-- Run this in your Supabase SQL Editor

-- 1. Leads Distribuição (Principal Archive Table)
ALTER TABLE leads_distribuicao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated distribution" ON leads_distribuicao;
CREATE POLICY "Allow all for authenticated distribution" 
ON leads_distribuicao FOR ALL 
USING (true)
WITH CHECK (true);

-- 2. Leads Distribuição CRM 26 (Alternate Source)
ALTER TABLE leads_distribuicao_crm_26 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated crm26" ON leads_distribuicao_crm_26;
CREATE POLICY "Allow all for authenticated crm26" 
ON leads_distribuicao_crm_26 FOR ALL 
USING (true)
WITH CHECK (true);

-- NOTE: RLS for 'estoque_manos_crm' is skipped because it is a VIEW.
-- RLS cannot be enabled directly on views in PostgreSQL.
