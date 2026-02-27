-- 1. Atualizar Tabela de Campanhas (Adicionar colunas de métricas avançadas)
ALTER TABLE IF EXISTS campaigns_manos_crm 
ADD COLUMN IF NOT EXISTS link_clicks BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS reach BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS impressions BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS cpc DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS ctr DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'Meta Ads',
ADD COLUMN IF NOT EXISTS effective_status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Criar Tabela de Relatórios Diários da IA (Marketing)
CREATE TABLE IF NOT EXISTS marketing_daily_reports_manos_crm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE DEFAULT CURRENT_DATE,
    summary TEXT,
    recommendations JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Garantir que a tabela de campanhas tenha índice por nome para o UPSERT do dataService
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_name ON campaigns_manos_crm(name);

-- 4. Criar Política de RLS para a nova tabela de relatórios (leitura pública ou autenticada)
ALTER TABLE marketing_daily_reports_manos_crm ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura para todos" ON marketing_daily_reports_manos_crm;
CREATE POLICY "Permitir leitura para todos" ON marketing_daily_reports_manos_crm FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir inserção para autenticados" ON marketing_daily_reports_manos_crm;
CREATE POLICY "Permitir inserção para autenticados" ON marketing_daily_reports_manos_crm FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 5. Garantir que Leads tenham referência à Campanha (se ainda não existir)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads_manos_crm' AND column_name='campaign_id') THEN
        ALTER TABLE leads_manos_crm ADD COLUMN campaign_id UUID REFERENCES campaigns_manos_crm(id);
    END IF;
END $$;
