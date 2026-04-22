-- Migração: Criar tabela leads_compra
-- Descrição: Nova vertical para leads de compra (Facebook Leads)
-- Data: 2026-04-13

CREATE TABLE IF NOT EXISTS public.leads_compra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    primeiro_nome TEXT,
    telefone TEXT NOT NULL,
    veiculo_original TEXT,
    marca TEXT,
    modelo TEXT,
    ano INTEGER,
    km INTEGER,
    valor_cliente DECIMAL(12,2),
    aceita_abaixo_fipe BOOLEAN DEFAULT FALSE,
    valor_fipe DECIMAL(12,2),
    origem TEXT,
    status TEXT DEFAULT 'novo',
    pipeline TEXT DEFAULT 'compras',
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ativar RLS
ALTER TABLE public.leads_compra ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS (Por enquanto, permite tudo para administradores e leitura/escrita condicional se necessário)
-- Como o CRM já lida com permissões no front-end, vamos garantir que o service_role e admins tenham acesso total.

CREATE POLICY "Acesso total para admins" ON public.leads_compra
    FOR ALL
    USING (
        auth.jwt() ->> 'email' = 'alexandre_gorges@hotmail.com'
        OR EXISTS (
            SELECT 1 FROM public.consultants_manos_crm 
            WHERE auth_id = auth.uid() AND role = 'admin'
        )
    );

-- Felipe Ledra também precisa de acesso total via RLS se não for admin no banco
CREATE POLICY "Acesso Felipe Ledra" ON public.leads_compra
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.consultants_manos_crm 
            WHERE auth_id = auth.uid() AND name ILIKE '%Felipe Ledra%'
        )
    );

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_compra_updated_at ON public.leads_compra;
CREATE TRIGGER trg_leads_compra_updated_at
BEFORE UPDATE ON public.leads_compra
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
