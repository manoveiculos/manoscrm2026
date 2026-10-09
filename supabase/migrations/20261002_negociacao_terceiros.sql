-- Migration for Negociação de Terceiros module (Alexandre & Wilson)

-- 1. Helper function for RLS
CREATE OR REPLACE FUNCTION is_terceiros_autorizado(user_email text)
RETURNS boolean AS $$
BEGIN
    RETURN user_email IN ('alexandre_gorges@hotmail.com', 'dultra49@gmail.com');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the main negociacao_terceiros table
CREATE TABLE IF NOT EXISTS public.negociacao_terceiros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_operacao text NOT NULL, -- 'Compra e Venda Própria', 'Intermediação (Consignado/Terceiro)', 'Repasse', 'Sociedade Pontual'
    veiculo_marca text,
    veiculo_modelo text,
    veiculo_versao text,
    veiculo_ano text,
    veiculo_placa text,
    veiculo_chassi text,
    veiculo_cor text,
    veiculo_km text,
    terceiro_nome text,
    terceiro_cpf_cnpj text,
    terceiro_telefone text,
    comprador_nome text,
    comprador_cpf_cnpj text,
    comprador_telefone text,
    status text DEFAULT 'Em Negociação', -- 'Em Negociação', 'Veículo em Estoque Terceiro', 'Vendido', 'Finalizado', 'Cancelado'
    responsavel_interno text, -- 'Alexandre', 'Wilson', 'Ambos'
    valor_nfe_entrada numeric DEFAULT 0,
    valor_nfe_saida numeric DEFAULT 0,
    margem_bruta numeric DEFAULT 0,
    comissao_vendedor numeric DEFAULT 0,
    comissao_socios numeric DEFAULT 0,
    status_comissoes text DEFAULT 'Pendente', -- 'Pendente', 'Pago'
    imposto_icms numeric DEFAULT 0,
    imposto_pis_cofins numeric DEFAULT 0,
    imposto_irpj_csll numeric DEFAULT 0,
    imposto_total numeric DEFAULT 0,
    lucro_liquido numeric DEFAULT 0,
    percentual_alexandre numeric DEFAULT 50,
    percentual_wilson numeric DEFAULT 50,
    lucro_alexandre numeric DEFAULT 0,
    lucro_wilson numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Create despesas table
CREATE TABLE IF NOT EXISTS public.negociacao_terceiros_despesas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    negociacao_id UUID REFERENCES public.negociacao_terceiros(id) ON DELETE CASCADE,
    categoria text NOT NULL,
    descricao text,
    valor numeric NOT NULL,
    status text DEFAULT 'A Pagar', -- 'A Pagar', 'Pago'
    responsavel_pagamento text, -- 'Alexandre', 'Wilson', 'Caixa Terceiros'
    comprovante_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. Create caixa/acerto table
CREATE TABLE IF NOT EXISTS public.negociacao_terceiros_caixa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    negociacao_id UUID REFERENCES public.negociacao_terceiros(id) ON DELETE CASCADE,
    tipo text NOT NULL, -- 'A Receber', 'A Pagar', 'Acerto'
    descricao text,
    pessoa text,
    valor numeric NOT NULL,
    data_limite date,
    status text DEFAULT 'Pendente', -- 'Pendente', 'Pago', 'Quitado'
    origem_acerto text, -- e.g. 'Alexandre'
    destino_acerto text, -- e.g. 'Wilson'
    created_at timestamptz DEFAULT now(),
    pago_em timestamptz,
    updated_at timestamptz DEFAULT now()
);

-- 5. Enable RLS
ALTER TABLE public.negociacao_terceiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negociacao_terceiros_despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negociacao_terceiros_caixa ENABLE ROW LEVEL SECURITY;

-- 6. Add Policies
CREATE POLICY "terceiros_access_negociacao"
ON public.negociacao_terceiros
FOR ALL
USING (is_terceiros_autorizado(auth.jwt() ->> 'email'))
WITH CHECK (is_terceiros_autorizado(auth.jwt() ->> 'email'));

CREATE POLICY "terceiros_access_despesas"
ON public.negociacao_terceiros_despesas
FOR ALL
USING (is_terceiros_autorizado(auth.jwt() ->> 'email'))
WITH CHECK (is_terceiros_autorizado(auth.jwt() ->> 'email'));

CREATE POLICY "terceiros_access_caixa"
ON public.negociacao_terceiros_caixa
FOR ALL
USING (is_terceiros_autorizado(auth.jwt() ->> 'email'))
WITH CHECK (is_terceiros_autorizado(auth.jwt() ->> 'email'));

-- 7. Add updated_at triggers
CREATE OR REPLACE FUNCTION update_modified_column_terceiros()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_negociacao_terceiros_modtime
    BEFORE UPDATE ON public.negociacao_terceiros
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column_terceiros();

CREATE TRIGGER update_negociacao_terceiros_despesas_modtime
    BEFORE UPDATE ON public.negociacao_terceiros_despesas
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column_terceiros();

CREATE TRIGGER update_negociacao_terceiros_caixa_modtime
    BEFORE UPDATE ON public.negociacao_terceiros_caixa
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column_terceiros();
