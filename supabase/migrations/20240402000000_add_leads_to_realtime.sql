-- Habilita Supabase Realtime na tabela leads_manos_crm
-- Necessário para o sininho de notificação de novos leads
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'leads_manos_crm'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE leads_manos_crm;
        RAISE NOTICE 'leads_manos_crm added to supabase_realtime';
    ELSE
        RAISE NOTICE 'leads_manos_crm already in supabase_realtime';
    END IF;
END $$;
