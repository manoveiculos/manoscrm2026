-- Add missing campaign metrics columns
ALTER TABLE campaigns_manos_crm ADD COLUMN IF NOT EXISTS cpm NUMERIC DEFAULT 0;
ALTER TABLE campaigns_manos_crm ADD COLUMN IF NOT EXISTS frequency NUMERIC DEFAULT 0;
