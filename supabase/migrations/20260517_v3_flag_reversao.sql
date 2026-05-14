-- Migração V3 - Flag de Reversão
-- Data: 2026-05-14

DO $$ 
BEGIN
    -- Adicionar flagged_reversao se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads_manos_crm' AND column_name = 'flagged_reversao') THEN
        ALTER TABLE leads_manos_crm ADD COLUMN flagged_reversao BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads_compra' AND column_name = 'flagged_reversao') THEN
        ALTER TABLE leads_compra ADD COLUMN flagged_reversao BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads_distribuicao_crm_26' AND column_name = 'flagged_reversao') THEN
        ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN flagged_reversao BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
