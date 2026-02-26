-- SOLUÇÃO DEFINITIVA: Forçar todas as colunas de características para TEXT
-- Isso evita erros quando o cliente digita textos em campos que o banco esperava números.

-- 1. Tabela: leads_manos_crm
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS valor_investimento TEXT;
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS metodo_compra TEXT;
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS carro_troca TEXT;
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS prazo_troca TEXT;
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS ai_reason TEXT;

ALTER TABLE leads_manos_crm ALTER COLUMN valor_investimento TYPE TEXT;
ALTER TABLE leads_manos_crm ALTER COLUMN metodo_compra TYPE TEXT;
ALTER TABLE leads_manos_crm ALTER COLUMN carro_troca TYPE TEXT;
ALTER TABLE leads_manos_crm ALTER COLUMN prazo_troca TYPE TEXT;

-- 2. Tabela: leads_manoscrm26
ALTER TABLE leads_manoscrm26 ADD COLUMN IF NOT EXISTS valor_investimento TEXT;
ALTER TABLE leads_manoscrm26 ADD COLUMN IF NOT EXISTS metodo_compra TEXT;
ALTER TABLE leads_manoscrm26 ADD COLUMN IF NOT EXISTS carro_troca TEXT;
ALTER TABLE leads_manoscrm26 ADD COLUMN IF NOT EXISTS prazo_troca TEXT;
ALTER TABLE leads_manoscrm26 ADD COLUMN IF NOT EXISTS ai_reason TEXT;

ALTER TABLE leads_manoscrm26 ALTER COLUMN valor_investimento TYPE TEXT;
ALTER TABLE leads_manoscrm26 ALTER COLUMN metodo_compra TYPE TEXT;
ALTER TABLE leads_manoscrm26 ALTER COLUMN carro_troca TYPE TEXT;
ALTER TABLE leads_manoscrm26 ALTER COLUMN prazo_troca TYPE TEXT;

-- 3. Adição de Metadados e Indices (Caso não existam)
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS id_meta TEXT;
ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS meta_id_campanha TEXT;
ALTER TABLE leads_manoscrm26 ADD COLUMN IF NOT EXISTS id_meta TEXT;
ALTER TABLE leads_manoscrm26 ADD COLUMN IF NOT EXISTS meta_id_campanha TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_manos_crm_meta ON leads_manos_crm(id_meta);
CREATE INDEX IF NOT EXISTS idx_leads_manoscrm26_meta ON leads_manoscrm26(id_meta);
