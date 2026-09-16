-- ==============================================================================
-- MIGRATION: DASHBOARD DE OPERAÇÕES AUTOMOTIVAS & DIVISÃO SOCIETÁRIA
-- Data: 2026-09-15
-- Autores/Sócios com Whitelist: Alexandre & Ivo
-- ==============================================================================

-- 1. TABELA DE SÓCIOS AUTORIZADOS (WHITELIST ESTRITA)
CREATE TABLE IF NOT EXISTS public.usuarios_socios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    participacao_padrao_pct NUMERIC(5,2) NOT NULL DEFAULT 50.00,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Inserção dos Sócios Principais (Whitelist Autorizada)
INSERT INTO public.usuarios_socios (email, nome, participacao_padrao_pct, ativo)
VALUES 
    ('alexandre_gorges@hotmail.com', 'Alexandre', 50.00, true),
    ('vo@acesso.com', 'Ivo', 50.00, true),
    ('ivo@acesso.com', 'Ivo', 50.00, true),
    ('alexandre@manoveiculos.com.br', 'Alexandre', 50.00, true),
    ('ivo@manoveiculos.com.br', 'Ivo', 50.00, true)
ON CONFLICT (email) DO UPDATE 
SET ativo = true, nome = EXCLUDED.nome;

-- 2. TABELA DE VEÍCULOS / INVENTÁRIO SOCIETÁRIO
-- Garantia de compatibilidade: se a tabela veiculos já existia com ID integer/bigint, converte para UUID
DO $$
DECLARE
    v_type text;
BEGIN
    SELECT data_type INTO v_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'veiculos' AND column_name = 'id';

    IF v_type IS NOT NULL AND v_type NOT IN ('uuid') THEN
        ALTER TABLE public.veiculos ALTER COLUMN id DROP DEFAULT;
        ALTER TABLE public.veiculos ALTER COLUMN id TYPE UUID USING gen_random_uuid();
        ALTER TABLE public.veiculos ALTER COLUMN id SET DEFAULT gen_random_uuid();
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Mantendo compatibilidade de ID: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS public.veiculos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    placa VARCHAR(10),
    chassi VARCHAR(30),
    renavam VARCHAR(30),
    marca TEXT,
    modelo TEXT,
    ano_fabricacao INT,
    ano_modelo INT,
    km INT DEFAULT 0,
    combustivel TEXT,
    cor TEXT,
    status TEXT DEFAULT 'disponivel',
    origem TEXT DEFAULT 'compra_direta',
    loja_atual TEXT DEFAULT 'manos',
    custo_aquisicao_inicial NUMERIC(12,2) DEFAULT 0.00,
    valor_venda_tabela NUMERIC(12,2) DEFAULT 0.00,
    data_entrada TIMESTAMPTZ DEFAULT now(),
    data_venda TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Garantia de colunas caso a tabela veiculos já existisse no Supabase
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS placa VARCHAR(10);
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS chassi VARCHAR(30);
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS renavam VARCHAR(30);
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS marca TEXT;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS modelo TEXT;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS ano_fabricacao INT;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS ano_modelo INT;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS km INT DEFAULT 0;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS combustivel TEXT;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS cor TEXT;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'disponivel';
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'compra_direta';
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS loja_atual TEXT DEFAULT 'manos';
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS custo_aquisicao_inicial NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS valor_venda_tabela NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS data_entrada TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS data_venda TIMESTAMPTZ;

-- Indices para buscas rápidas por Placa e Chassi
CREATE INDEX IF NOT EXISTS idx_veiculos_placa ON public.veiculos (placa);
CREATE INDEX IF NOT EXISTS idx_veiculos_chassi ON public.veiculos (chassi);
CREATE INDEX IF NOT EXISTS idx_veiculos_status ON public.veiculos (status);

-- 3. CONTRATOS DE COMPRA (ENTRADA DE ESTOQUE)
CREATE TABLE IF NOT EXISTS public.contratos_compra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
    fornecedor_nome TEXT NOT NULL,
    fornecedor_cpf_cnpj TEXT,
    captador_vendedor TEXT,
    loja_pagadora TEXT DEFAULT 'manos',
    valor_acordado_compra NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    forma_liquidacao TEXT, -- ex: DDA, TED, PIX
    data_contrato DATE NOT NULL DEFAULT CURRENT_DATE,
    pdf_url TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.contratos_compra ADD COLUMN IF NOT EXISTS loja_pagadora TEXT DEFAULT 'manos';

-- 4. CONTRATOS DE VENDA (SAÍDA DE ESTOQUE)
CREATE TABLE IF NOT EXISTS public.contratos_venda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
    comprador_nome TEXT NOT NULL,
    comprador_cpf_cnpj TEXT,
    vendedor_responsavel TEXT,
    loja_recebedora TEXT DEFAULT 'manos',
    valor_venda_fechado NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    valor_entrada_moeda NUMERIC(12,2) DEFAULT 0.00,
    valor_veiculo_troca NUMERIC(12,2) DEFAULT 0.00,
    tem_troca BOOLEAN DEFAULT false,
    troca_placa VARCHAR(10),
    troca_modelo TEXT,
    troca_veiculo_gerado_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
    saldo_devedor NUMERIC(12,2) DEFAULT 0.00,
    data_contrato DATE NOT NULL DEFAULT CURRENT_DATE,
    pdf_url TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.contratos_venda ADD COLUMN IF NOT EXISTS loja_recebedora TEXT DEFAULT 'manos';

-- 5. DETALHAMENTO DE PAGAMENTOS / COMPOSIÇÃO DE FECHAMENTO
CREATE TABLE IF NOT EXISTS public.pagamentos_contrato (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_venda_id UUID NOT NULL REFERENCES public.contratos_venda(id) ON DELETE CASCADE,
    tipo_pagamento TEXT NOT NULL CHECK (tipo_pagamento IN ('ted', 'dda', 'pix', 'dinheiro', 'permuta_veiculo', 'financiamento')),
    loja_conta TEXT DEFAULT 'manos',
    valor NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    descricao TEXT,
    comprovante_url TEXT,
    data_pagamento DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.pagamentos_contrato ADD COLUMN IF NOT EXISTS loja_conta TEXT DEFAULT 'manos';

-- 6. CUSTOS ADICIONAIS / PREPARAÇÃO DE PÁTIO
CREATE TABLE IF NOT EXISTS public.custos_adicionais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL CHECK (categoria IN ('oficina', 'vistoria', 'polimento', 'transferencia', 'guincho', 'outros')),
    loja_pagadora TEXT DEFAULT 'manos',
    descricao TEXT NOT NULL,
    valor NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    comprovante_url TEXT,
    data_custo DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.custos_adicionais ADD COLUMN IF NOT EXISTS loja_pagadora TEXT DEFAULT 'manos';

-- 7. APURAÇÃO DE LUCRO E DIVISÃO SOCIETÁRIA
CREATE TABLE IF NOT EXISTS public.fechamentos_lucro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veiculo_id UUID UNIQUE REFERENCES public.veiculos(id) ON DELETE CASCADE,
    contrato_compra_id UUID REFERENCES public.contratos_compra(id) ON DELETE SET NULL,
    contrato_venda_id UUID REFERENCES public.contratos_venda(id) ON DELETE SET NULL,
    custo_aquisicao NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    valor_venda NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    lucro_bruto NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    comissao_vendedor NUMERIC(12,2) DEFAULT 0.00,
    imposto_nf NUMERIC(12,2) DEFAULT 0.00,
    total_custos_extras NUMERIC(12,2) DEFAULT 0.00,
    lucro_liquido NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pct_alexandre NUMERIC(5,2) DEFAULT 50.00,
    cota_alexandre NUMERIC(12,2) DEFAULT 0.00,
    pct_ivo NUMERIC(5,2) DEFAULT 50.00,
    cota_ivo NUMERIC(12,2) DEFAULT 0.00,
    status_fechamento TEXT DEFAULT 'rascunho' CHECK (status_fechamento IN ('rascunho', 'liquidado', 'pendente_custos')),
    data_fechamento TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir coluna veiculo_id em fechamentos_lucro se a tabela já existia
ALTER TABLE public.fechamentos_lucro ADD COLUMN IF NOT EXISTS veiculo_id UUID REFERENCES public.veiculos(id);

-- 8. EXTRATO DE RETIRADAS DOS SÓCIOS
CREATE TABLE IF NOT EXISTS public.retiradas_socios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    socio_email TEXT NOT NULL,
    socio_nome TEXT NOT NULL,
    valor NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    data_retirada DATE NOT NULL DEFAULT CURRENT_DATE,
    descricao TEXT,
    comprovante_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.retiradas_socios ADD COLUMN IF NOT EXISTS loja_caixa TEXT DEFAULT 'manos';

-- ==============================================================================
-- FUNÇÃO AUXILIAR DE SEGURANÇA WHITELIST (RLS GUARD)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_socio_autorizado()
RETURNS BOOLEAN AS $$
DECLARE
    user_email TEXT;
    is_valid BOOLEAN := false;
BEGIN
    user_email := auth.jwt() ->> 'email';
    IF user_email IS NULL THEN
        -- Se executado via service_role ou no-auth interno no Postgres
        RETURN true;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.usuarios_socios
        WHERE lower(email) = lower(user_email)
        AND ativo = true
    ) INTO is_valid;

    RETURN is_valid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- HABILITAR RLS NAS TABELAS SOCIETÁRIAS
ALTER TABLE public.usuarios_socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_contrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custos_adicionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamentos_lucro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retiradas_socios ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS (APENAS SÓCIOS AUTORIZADOS PODEM LER/ESCREVER)
DROP POLICY IF EXISTS "Socios Whitelist Policy" ON public.usuarios_socios;
CREATE POLICY "Socios Whitelist Policy" ON public.usuarios_socios FOR ALL USING (public.is_socio_autorizado());

DROP POLICY IF EXISTS "Veiculos Whitelist Policy" ON public.veiculos;
CREATE POLICY "Veiculos Whitelist Policy" ON public.veiculos FOR ALL USING (public.is_socio_autorizado());

DROP POLICY IF EXISTS "Contratos Compra Policy" ON public.contratos_compra;
CREATE POLICY "Contratos Compra Policy" ON public.contratos_compra FOR ALL USING (public.is_socio_autorizado());

DROP POLICY IF EXISTS "Contratos Venda Policy" ON public.contratos_venda;
CREATE POLICY "Contratos Venda Policy" ON public.contratos_venda FOR ALL USING (public.is_socio_autorizado());

DROP POLICY IF EXISTS "Pagamentos Policy" ON public.pagamentos_contrato;
CREATE POLICY "Pagamentos Policy" ON public.pagamentos_contrato FOR ALL USING (public.is_socio_autorizado());

DROP POLICY IF EXISTS "Custos Policy" ON public.custos_adicionais;
CREATE POLICY "Custos Policy" ON public.custos_adicionais FOR ALL USING (public.is_socio_autorizado());

DROP POLICY IF EXISTS "Fechamentos Policy" ON public.fechamentos_lucro;
CREATE POLICY "Fechamentos Policy" ON public.fechamentos_lucro FOR ALL USING (public.is_socio_autorizado());

DROP POLICY IF EXISTS "Retiradas Policy" ON public.retiradas_socios;
CREATE POLICY "Retiradas Policy" ON public.retiradas_socios FOR ALL USING (public.is_socio_autorizado());

-- VIEW CONSOLIDADA DE VENDAS E DIVISÃO SOCIETÁRIA
DROP VIEW IF EXISTS public.vw_fechamento_societario_consolidado CASCADE;
CREATE OR REPLACE VIEW public.vw_fechamento_societario_consolidado AS
SELECT 
    v.id AS veiculo_id,
    v.placa,
    v.marca,
    v.modelo,
    v.status AS status_veiculo,
    v.origem AS origem_veiculo,
    v.loja_atual,
    cc.loja_pagadora AS loja_compra,
    cv.loja_recebedora AS loja_venda,
    v.custo_aquisicao_inicial,
    cv.valor_venda_fechado AS valor_venda,
    cv.data_contrato AS data_venda,
    cv.vendedor_responsavel,
    cv.tem_troca,
    cv.troca_placa,
    cv.troca_modelo,
    cv.valor_veiculo_troca,
    COALESCE(fl.lucro_bruto, (COALESCE(cv.valor_venda_fechado, 0) - COALESCE(v.custo_aquisicao_inicial, 0))) AS lucro_bruto,
    COALESCE(fl.comissao_vendedor, 0) AS comissao_vendedor,
    COALESCE(fl.imposto_nf, 0) AS imposto_nf,
    COALESCE(fl.total_custos_extras, 0) AS total_custos_extras,
    COALESCE(fl.lucro_liquido, (COALESCE(cv.valor_venda_fechado, 0) - COALESCE(v.custo_aquisicao_inicial, 0) - COALESCE(fl.comissao_vendedor, 0) - COALESCE(fl.imposto_nf, 0) - COALESCE(fl.total_custos_extras, 0))) AS lucro_liquido,
    COALESCE(fl.pct_alexandre, 50.00) AS pct_alexandre,
    COALESCE(fl.cota_alexandre, (COALESCE(fl.lucro_liquido, 0) * 0.50)) AS cota_alexandre,
    COALESCE(fl.pct_ivo, 50.00) AS pct_ivo,
    COALESCE(fl.cota_ivo, (COALESCE(fl.lucro_liquido, 0) * 0.50)) AS cota_ivo,
    COALESCE(fl.status_fechamento, 'rascunho') AS status_fechamento
FROM public.veiculos v
LEFT JOIN public.contratos_compra cc ON cc.veiculo_id = v.id
LEFT JOIN public.contratos_venda cv ON cv.veiculo_id = v.id
LEFT JOIN public.fechamentos_lucro fl ON (fl.veiculo_id = v.id OR fl.id = v.id);
