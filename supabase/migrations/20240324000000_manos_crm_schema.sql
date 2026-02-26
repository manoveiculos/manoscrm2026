-- SCHEMA DE BANCO DE DADOS - MANOS VEÍCULOS CRM
-- Sugestão: Nomear as tabelas com o sufixo _manos_crm para facilitar a organização

-- 1. Campanhas de Marketing
CREATE TABLE IF NOT EXISTS campaigns_manos_crm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL, -- 'meta', 'google', 'instagram', 'whatsapp', 'site'
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    total_spend DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Criativos de Anúncios (Opcional, para granularidade)
CREATE TABLE IF NOT EXISTS creatives_manos_crm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns_manos_crm(id) ON DELETE CASCADE,
    name VARCHAR(255),
    format VARCHAR(50), -- 'image', 'video', 'carousel'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Consultores / Vendedores
CREATE TABLE IF NOT EXISTS consultants_manos_crm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    specialty VARCHAR(100), -- Ex: 'Luxury', 'SUV', 'Popular'
    performance_score INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    last_lead_assigned_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Leads (Tabela Principal)
CREATE TABLE IF NOT EXISTS leads_manos_crm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    source VARCHAR(100), -- Ex: 'Facebook Ads', 'Organic'
    campaign_id UUID REFERENCES campaigns_manos_crm(id) ON DELETE SET NULL,
    creative_id UUID REFERENCES creatives_manos_crm(id) ON DELETE SET NULL,
    vehicle_interest VARCHAR(255),
    region VARCHAR(100),
    estimated_ticket DECIMAL(12,2),
    ai_score INTEGER DEFAULT 0,
    ai_classification VARCHAR(50), -- 'hot', 'warm', 'cold'
    status VARCHAR(50) DEFAULT 'new', -- 'new', 'contacted', 'scheduled', 'closed', 'lost'
    assigned_consultant_id UUID REFERENCES consultants_manos_crm(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Interações e Timeline
CREATE TABLE IF NOT EXISTS interactions_manos_crm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads_manos_crm(id) ON DELETE CASCADE,
    consultant_id UUID REFERENCES consultants_manos_crm(id) ON DELETE SET NULL,
    type VARCHAR(50), -- 'call', 'whatsapp', 'email', 'meeting'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Estoque / Inventário
CREATE TABLE IF NOT EXISTS inventory_manos_crm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model VARCHAR(255) NOT NULL,
    brand VARCHAR(100),
    year INTEGER,
    category VARCHAR(100), -- 'luxury', 'suv', 'sedan'
    purchase_value DECIMAL(12,2),
    margin_estimated DECIMAL(12,2),
    status VARCHAR(50) DEFAULT 'in_stock', -- 'in_stock', 'sold', 'reserved'
    entry_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Vendas Concluídas
CREATE TABLE IF NOT EXISTS sales_manos_crm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads_manos_crm(id) ON DELETE SET NULL,
    inventory_id UUID REFERENCES inventory_manos_crm(id) ON DELETE SET NULL,
    consultant_id UUID REFERENCES consultants_manos_crm(id) ON DELETE SET NULL,
    sale_value DECIMAL(12,2) NOT NULL,
    profit_margin DECIMAL(12,2) NOT NULL,
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads_manos_crm(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_consultant ON leads_manos_crm(assigned_consultant_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads_manos_crm(status);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_manos_crm(sale_date);

-- FUNÇÃO PARA TRATAR UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads_manos_crm FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
