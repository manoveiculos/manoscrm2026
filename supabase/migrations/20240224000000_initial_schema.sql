-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Marketing & Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform VARCHAR(50) NOT NULL, -- 'facebook', 'google', 'instagram'
    external_id VARCHAR(100) UNIQUE,
    name VARCHAR(255),
    status VARCHAR(50),
    total_spend DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creatives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    external_id VARCHAR(100) UNIQUE,
    type VARCHAR(50), -- 'image', 'video', 'carousel'
    url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Consultants
CREATE TABLE IF NOT EXISTS consultants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    specialty VARCHAR(100), -- 'sedan', 'suv', 'truck'
    performance_score DECIMAL(3,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    last_lead_assigned_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Leads
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    source VARCHAR(100), -- 'meta', 'google', 'site', 'whatsapp'
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    creative_id UUID REFERENCES creatives(id) ON DELETE SET NULL,
    vehicle_interest VARCHAR(255),
    region VARCHAR(100),
    estimated_ticket DECIMAL(12,2),
    ai_score INTEGER, -- 1-100
    ai_classification VARCHAR(50), -- 'hot', 'warm', 'cold'
    status VARCHAR(50) DEFAULT 'new', -- 'new', 'contacted', 'scheduled', 'visited', 'proposed', 'closed', 'lost'
    assigned_consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Interactions & Funnel History
CREATE TABLE IF NOT EXISTS interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    type VARCHAR(50), -- 'whatsapp_msg', 'call', 'internal_note'
    content TEXT,
    sender_type VARCHAR(50), -- 'lead', 'consultant', 'system'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funnel_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    changed_by UUID, -- Can be consultant_id or admin_id
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Inventory & Sales
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model VARCHAR(255),
    category VARCHAR(100), -- 'SUV', 'Sedan', 'Hatch', 'Truck'
    margin_estimated DECIMAL(12,2),
    entry_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'in_stock', -- 'in_stock', 'sold', 'reserved'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
    consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
    sale_value DECIMAL(12,2),
    profit_margin DECIMAL(12,2),
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_consultant_id);
CREATE INDEX IF NOT EXISTS idx_interactions_lead ON interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);

-- 7. RLS (Row Level Security) - Basic Examples
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- Policy: Consultants see only their assigned leads
-- (Note: This requires Supabase Auth setup to work fully)
-- CREATE POLICY "Consultants can see their assigned leads" ON leads
-- FOR SELECT USING (auth.uid() IN (SELECT id FROM consultants WHERE id = assigned_consultant_id));
