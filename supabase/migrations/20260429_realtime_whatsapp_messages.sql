-- Garante que whatsapp_messages está na publicação Realtime do Supabase
-- (necessário pra /lead/[id] mostrar mensagens da IA em tempo real)

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
END $$;
