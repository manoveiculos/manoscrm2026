-- Migration: Fix sales/purchases schema and support virtual IDs
-- Description: Adds missing columns and relaxes type constraints for virtual IDs

-- 1. Fix sales_manos_crm table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales_manos_crm' AND column_name='created_at') THEN
        ALTER TABLE sales_manos_crm ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- 2. Relax lead_id constraints to support virtual IDs (crm26_...)
-- Note: lead_id was UUID, now must be TEXT to support strings like 'crm26_105'

-- In sales_manos_crm
ALTER TABLE sales_manos_crm DROP CONSTRAINT IF EXISTS sales_manos_crm_lead_id_fkey;
ALTER TABLE sales_manos_crm ALTER COLUMN lead_id TYPE TEXT;

-- In purchases_manos_crm
ALTER TABLE purchases_manos_crm DROP CONSTRAINT IF EXISTS purchases_manos_crm_lead_id_fkey;
ALTER TABLE purchases_manos_crm ALTER COLUMN lead_id TYPE TEXT;

-- 3. Ensure purchases_manos_crm has consistent naming (already checked in previous migration)
-- If it was missing anything from previous step, we'd add it here.
