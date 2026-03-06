-- Migration: Add id_meta column for Meta Lead Ads deduplication
-- This column stores the unique Meta Lead ID to prevent reimporting the same lead

ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS id_meta TEXT;

-- Create an index for fast lookups during deduplication
CREATE INDEX IF NOT EXISTS idx_leads_crm26_id_meta ON leads_distribuicao_crm_26(id_meta) WHERE id_meta IS NOT NULL;
