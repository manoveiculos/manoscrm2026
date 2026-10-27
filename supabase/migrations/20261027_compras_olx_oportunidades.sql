-- Migração: Tabela de Oportunidades do Garimpeiro OLX Santa Catarina

CREATE TABLE IF NOT EXISTS public.compras_olx_oportunidades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id text UNIQUE NOT NULL,
    url text NOT NULL,
    titulo text NOT NULL,
    marca text,
    modelo text,
    ano integer,
    km integer,
    combustivel text,
    cambio text,
    preco numeric(12,2) NOT NULL,
    preco_fipe numeric(12,2),
    margem_percent numeric(5,2),
    margem_valor numeric(12,2),
    localizacao text,
    foto_url text,
    publicado_em text,
    is_particular boolean DEFAULT true,
    has_leilao boolean DEFAULT false,
    status_classificacao text DEFAULT 'OPORTUNIDADE',
    is_queda_preco boolean DEFAULT false,
    preco_anterior numeric(12,2),
    avisos text[] DEFAULT '{}',
    notificado boolean DEFAULT false,
    status_crm text DEFAULT 'novo' CHECK (status_crm IN ('novo', 'em_analise', 'contatado', 'descartado', 'comprado')),
    responsavel_nome text,
    observacoes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compras_olx_ad_id ON public.compras_olx_oportunidades(ad_id);
CREATE INDEX IF NOT EXISTS idx_compras_olx_margem ON public.compras_olx_oportunidades(margem_percent DESC);
CREATE INDEX IF NOT EXISTS idx_compras_olx_created_at ON public.compras_olx_oportunidades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compras_olx_status ON public.compras_olx_oportunidades(status_crm);

-- RLS
ALTER TABLE public.compras_olx_oportunidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compras_olx_all ON public.compras_olx_oportunidades;
CREATE POLICY compras_olx_all ON public.compras_olx_oportunidades FOR ALL USING (true) WITH CHECK (true);
