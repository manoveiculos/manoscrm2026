-- FIX RLS POLICIES: Allow interactions and sales logging
-- Run this in your Supabase SQL Editor

-- 1. Interactions Table
ALTER TABLE interactions_manos_crm ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated interactions" ON interactions_manos_crm;
CREATE POLICY "Allow all for authenticated interactions" 
ON interactions_manos_crm FOR ALL 
USING (true)
WITH CHECK (true);

-- 2. Sales Table
ALTER TABLE sales_manos_crm ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated sales" ON sales_manos_crm;
CREATE POLICY "Allow all for authenticated sales" 
ON sales_manos_crm FOR ALL 
USING (true)
WITH CHECK (true);

-- 3. Ensure Leads table also has a broad policy if not already set correctly
DROP POLICY IF EXISTS "Allow all for authenticated leads" ON leads_manos_crm;
CREATE POLICY "Allow all for authenticated leads" 
ON leads_manos_crm FOR ALL 
USING (true)
WITH CHECK (true);

-- 4. Consultants Table
DROP POLICY IF EXISTS "Allow all for authenticated consultants" ON consultants_manos_crm;
CREATE POLICY "Allow all for authenticated consultants" 
ON consultants_manos_crm FOR ALL 
USING (true)
WITH CHECK (true);
