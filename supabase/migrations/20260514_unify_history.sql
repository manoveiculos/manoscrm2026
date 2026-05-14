-- Unificação de Histórico e Contexto Multi-Fonte
-- Data: 2026-05-14

-- 1. View de Mensagens Unificadas (Arthur + Vendedor + Karol)
-- Esta view centraliza mensagens de todas as colunas de ID possíveis
CREATE OR REPLACE VIEW unified_whatsapp_messages AS
SELECT 
    id,
    created_at,
    direction,
    message_text,
    message_id,
    -- Converte qualquer ID para texto para facilitar o filtro unificado (UID)
    COALESCE(lead_id::text, lead_compra_id::text) as lead_uid,
    media_type,
    sender_name
FROM whatsapp_messages;

-- 2. Função para encontrar Lead por Telefone em qualquer tabela
-- Essencial para o Webhook não duplicar leads e unificar histórico
CREATE OR REPLACE FUNCTION find_lead_by_phone(p_phone TEXT)
RETURNS TABLE (
    uid TEXT,
    table_name TEXT,
    native_id TEXT,
    name TEXT,
    assigned_consultant_id TEXT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    -- Limpa o telefone de entrada
    p_phone := regexp_replace(p_phone, '\D', '', 'g');

    -- Tenta na tabela principal (V2)
    RETURN QUERY 
    SELECT ('dist_' || id::text), 'leads_distribuicao_crm_26'::text, id::text, nome, assigned_consultant_id::text
    FROM leads_distribuicao_crm_26 
    WHERE telefone = p_phone OR telefone ILIKE '%' || RIGHT(p_phone, 8)
    LIMIT 1;

    -- Se não achou, tenta na legado (V1)
    IF NOT FOUND THEN
        RETURN QUERY 
        SELECT ('crm26_' || id::text), 'leads_manos_crm'::text, id::text, name, assigned_consultant_id::text
        FROM leads_manos_crm 
        WHERE phone = p_phone OR phone ILIKE '%' || RIGHT(p_phone, 8)
        LIMIT 1;
    END IF;

    -- Se não achou, tenta na Compra
    IF NOT FOUND THEN
        RETURN QUERY 
        SELECT ('compra_' || id::text), 'leads_compra'::text, id::text, nome, assigned_consultant_id::text
        FROM leads_compra 
        WHERE telefone = p_phone OR telefone ILIKE '%' || RIGHT(p_phone, 8)
        LIMIT 1;
    END IF;
END;
$$;

-- 3. Índice para acelerar a busca por UID na whatsapp_messages
-- Como o Supabase não suporta índices em colunas virtuais de views, 
-- criamos índices nas colunas base.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_compra_id ON whatsapp_messages (lead_compra_id) WHERE lead_compra_id IS NOT NULL;
