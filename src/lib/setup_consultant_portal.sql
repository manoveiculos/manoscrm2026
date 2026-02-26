-- Vincular consultores ao sistema de autenticação do Supabase
-- Adiciona campos necessários para o Portal do Consultor

ALTER TABLE consultants_manos_crm ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'consultant';

-- Comentários para documentação
COMMENT ON COLUMN consultants_manos_crm.auth_id IS 'ID do usuário no Supabase Auth';
COMMENT ON COLUMN consultants_manos_crm.status IS 'Status do consultor: pending, active, blocked';
COMMENT ON COLUMN consultants_manos_crm.role IS 'Papel do usuário: admin, consultant';

-- Garantir que o status default seja aplicado a registros existentes sem status
UPDATE consultants_manos_crm SET status = 'active' WHERE status IS NULL OR status = '';

-- Criar um índice para buscas rápidas por auth_id
CREATE INDEX IF NOT EXISTS idx_consultants_auth_id ON consultants_manos_crm(auth_id);
