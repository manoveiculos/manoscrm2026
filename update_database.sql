-- SQL de Sincronização - CRM Manos Veículos
-- Estrutura para Reativação de Leads e Análise Inteligente

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Garante que a tabela de REATIVAÇÃO (leads_distribuicao) tenha as colunas de IA
ALTER TABLE leads_distribuicao 
ADD COLUMN IF NOT EXISTS ai_classification TEXT, -- hot, warm, cold
ADD COLUMN IF NOT EXISTS ai_reason TEXT,
ADD COLUMN IF NOT EXISTS ai_score INTEGER,
ADD COLUMN IF NOT EXISTS nivel_interesse TEXT,
ADD COLUMN IF NOT EXISTS momento_compra TEXT,
ADD COLUMN IF NOT EXISTS resumo_consultor TEXT,
ADD COLUMN IF NOT EXISTS proxima_acao TEXT,
ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT now();

-- 2. Garante que a tabela de GESTÃO (leads_distribuicao_crm_26) também suporte estes dados
ALTER TABLE leads_distribuicao_crm_26 
ADD COLUMN IF NOT EXISTS ai_classification TEXT,
ADD COLUMN IF NOT EXISTS ai_reason TEXT,
ADD COLUMN IF NOT EXISTS ai_score INTEGER,
ADD COLUMN IF NOT EXISTS nivel_interesse TEXT,
ADD COLUMN IF NOT EXISTS momento_compra TEXT,
ADD COLUMN IF NOT EXISTS resumo_consultor TEXT,
ADD COLUMN IF NOT EXISTS proxima_acao TEXT,
ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT now();

-- 3. Índices de Performance para Ordenação (Mais Recentes no Topo)
CREATE INDEX IF NOT EXISTS idx_leads_distribuicao_criado_em ON leads_distribuicao (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_leads_distribuicao_crm_26_criado_em ON leads_distribuicao_crm_26 (criado_em DESC);

-- 4. Índice para busca rápida por vendedor (Menu Lateral filtros)
CREATE INDEX IF NOT EXISTS idx_leads_distribuicao_vendedor ON leads_distribuicao (vendedor);

-- 5. Comentários para documentação no banco
COMMENT ON COLUMN leads_distribuicao.ai_classification IS 'Classificação térmica da IA: hot, warm ou cold';
COMMENT ON COLUMN leads_distribuicao.resumo IS 'Resumo histórico ou análise inicial do lead';

-- 6. Tabela para Persistência da Análise Inteligente Global (Legado - Mantida por compatibilidade)
CREATE TABLE IF NOT EXISTS intelligent_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    opportunities_of_the_day TEXT,
    recommended_actions JSONB,
    stats JSONB,
    analyses JSONB
);

-- 7. Tabela para Análise Individual por Consultor (Nova Lógica Estrutural)
CREATE TABLE IF NOT EXISTS crm_daily_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultor_id UUID REFERENCES consultants_manos_crm(id),
    analysis_text TEXT,
    analysis_json JSONB,
    generated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_daily_analysis_consultor ON crm_daily_analysis(consultor_id);
CREATE INDEX IF NOT EXISTS idx_crm_daily_analysis_generated ON crm_daily_analysis(generated_at DESC);

-- 8. RLS Policies (Opcional, mas recomendado para Supabase)
ALTER TABLE crm_daily_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_distribuicao_crm_26 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leads CRM26: Leitura para autenticados" ON leads_distribuicao_crm_26;
CREATE POLICY "Leads CRM26: Leitura para autenticados" ON leads_distribuicao_crm_26 FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Leads CRM26: Gestão para autenticados" ON leads_distribuicao_crm_26;
CREATE POLICY "Leads CRM26: Gestão para autenticados" ON leads_distribuicao_crm_26 FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Se o consultor_id referenciasse auth.users, usaríamos auth.uid(). 
-- Como referencia consultants_manos_crm(id), vamos permitir leitura/escrita para usuários autenticados por enquanto (Simplificado)
DROP POLICY IF EXISTS "Permitir leitura para todos autenticados" ON crm_daily_analysis;
CREATE POLICY "Permitir leitura para todos autenticados" ON crm_daily_analysis FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir inserção/atualização para todos autenticados" ON crm_daily_analysis;
CREATE POLICY "Permitir inserção/atualização para todos autenticados" ON crm_daily_analysis FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. Políticas para a tabela de consultores (Essencial para o mapeamento da IA)
ALTER TABLE consultants_manos_crm ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura para todos autenticados" ON consultants_manos_crm;
CREATE POLICY "Permitir leitura para todos autenticados" ON consultants_manos_crm FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir gestão para todos autenticados" ON consultants_manos_crm;
CREATE POLICY "Permitir gestão para todos autenticados" ON consultants_manos_crm FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE crm_daily_analysis IS 'Armazena análises estratégicas personalizadas para cada consultor';
