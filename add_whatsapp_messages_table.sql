-- Migration para Tabela de Mensagens do WhatsApp
-- Permite armazenar o histórico de conversas para a "Linha do Tempo" e Reanálise de IA

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id BIGINT REFERENCES leads_distribuicao_crm_26(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_text TEXT NOT NULL,
    message_id TEXT, -- ID original da mensagem no WhatsApp/Meta
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index para buscas rápidas por lead_id (para carregar a Linha do Tempo)
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead_id ON whatsapp_messages(lead_id);

-- Opcional: Ativar RLS se necessário, mas para uso interno/API deixamos desativado ou liberado para serviço autenticado
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON "public"."whatsapp_messages"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON "public"."whatsapp_messages"
AS PERMISSIVE FOR INSERT
TO public
WITH CHECK (true);
