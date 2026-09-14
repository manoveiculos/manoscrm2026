-- ==============================================================================
-- DIVISÃO DE LUCRO: APROVAÇÃO DUPLA POR OPERAÇÃO + ACERTOS ENTRE EMPRESAS
-- Data: 2026-09-17
--
-- Regra combinada (Manos = Alexandre, V3 = Ivo):
--   * Cada operação de carro (compra + venda + gastos + comissão + pagamentos)
--     precisa do OK do Alexandre e do Ivo.
--   * Antes dos dois aprovarem pode alterar; qualquer alteração zera as aprovações
--     (quem aprovou, aprovou números que mudaram).
--   * Depois dos dois aprovarem, nada da operação pode ser alterado nem excluído.
--     A trava é no banco, não só na tela.
-- ==============================================================================

-- 1. Aprovação de cada sócio (na raiz da operação: o veículo)
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS aprovado_alexandre_em TIMESTAMPTZ;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS aprovado_ivo_em TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.societario_operacao_travada(p_veiculo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT aprovado_alexandre_em IS NOT NULL AND aprovado_ivo_em IS NOT NULL
         FROM public.veiculos WHERE id = p_veiculo_id),
        false
    );
$$;

-- 2. Veículo: travado não muda; mudança fora das colunas de aprovação zera as aprovações
CREATE OR REPLACE FUNCTION public.societario_veiculos_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.aprovado_alexandre_em IS NOT NULL AND OLD.aprovado_ivo_em IS NOT NULL THEN
            RAISE EXCEPTION 'Operação % aprovada pelos dois sócios: não pode ser excluída.', COALESCE(OLD.placa, OLD.id::text);
        END IF;
        RETURN OLD;
    END IF;

    -- update sem mudança real não faz nada
    IF to_jsonb(NEW) = to_jsonb(OLD) THEN
        RETURN NEW;
    END IF;

    IF OLD.aprovado_alexandre_em IS NOT NULL AND OLD.aprovado_ivo_em IS NOT NULL THEN
        RAISE EXCEPTION 'Operação % aprovada pelos dois sócios: não pode ser alterada.', COALESCE(OLD.placa, OLD.id::text);
    END IF;

    IF (to_jsonb(NEW) - ARRAY['aprovado_alexandre_em', 'aprovado_ivo_em', 'updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['aprovado_alexandre_em', 'aprovado_ivo_em', 'updated_at']) THEN
        NEW.aprovado_alexandre_em := NULL;
        NEW.aprovado_ivo_em := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_societario_veiculos_guard ON public.veiculos;
CREATE TRIGGER trg_societario_veiculos_guard
    BEFORE UPDATE OR DELETE ON public.veiculos
    FOR EACH ROW EXECUTE FUNCTION public.societario_veiculos_guard();

-- 3. Tabelas filhas da operação: bloqueia se travada, zera aprovação parcial se mudou
CREATE OR REPLACE FUNCTION public.societario_filhos_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_ids UUID[] := ARRAY[]::UUID[];
    v_id UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN
        RETURN NEW;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF TG_TABLE_NAME = 'pagamentos_contrato' THEN
            SELECT veiculo_id INTO v_id FROM public.contratos_venda WHERE id = OLD.contrato_venda_id;
        ELSE
            v_id := OLD.veiculo_id;
        END IF;
        v_ids := v_ids || v_id;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF TG_TABLE_NAME = 'pagamentos_contrato' THEN
            SELECT veiculo_id INTO v_id FROM public.contratos_venda WHERE id = NEW.contrato_venda_id;
        ELSE
            v_id := NEW.veiculo_id;
        END IF;
        v_ids := v_ids || v_id;
    END IF;

    FOREACH v_id IN ARRAY v_ids LOOP
        CONTINUE WHEN v_id IS NULL;

        IF public.societario_operacao_travada(v_id) THEN
            RAISE EXCEPTION 'Operação aprovada pelos dois sócios: registros de % não podem ser alterados.', TG_TABLE_NAME;
        END IF;

        UPDATE public.veiculos
        SET aprovado_alexandre_em = NULL, aprovado_ivo_em = NULL
        WHERE id = v_id
          AND (aprovado_alexandre_em IS NOT NULL OR aprovado_ivo_em IS NOT NULL);
    END LOOP;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_societario_guard ON public.contratos_compra;
CREATE TRIGGER trg_societario_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contratos_compra
    FOR EACH ROW EXECUTE FUNCTION public.societario_filhos_guard();

DROP TRIGGER IF EXISTS trg_societario_guard ON public.contratos_venda;
CREATE TRIGGER trg_societario_guard BEFORE INSERT OR UPDATE OR DELETE ON public.contratos_venda
    FOR EACH ROW EXECUTE FUNCTION public.societario_filhos_guard();

DROP TRIGGER IF EXISTS trg_societario_guard ON public.pagamentos_contrato;
CREATE TRIGGER trg_societario_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pagamentos_contrato
    FOR EACH ROW EXECUTE FUNCTION public.societario_filhos_guard();

DROP TRIGGER IF EXISTS trg_societario_guard ON public.custos_adicionais;
CREATE TRIGGER trg_societario_guard BEFORE INSERT OR UPDATE OR DELETE ON public.custos_adicionais
    FOR EACH ROW EXECUTE FUNCTION public.societario_filhos_guard();

DROP TRIGGER IF EXISTS trg_societario_guard ON public.fechamentos_lucro;
CREATE TRIGGER trg_societario_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fechamentos_lucro
    FOR EACH ROW EXECUTE FUNCTION public.societario_filhos_guard();

-- 4. Pagamentos de uma empresa pra outra quitando o acerto
CREATE TABLE IF NOT EXISTS public.acertos_empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    de_loja TEXT NOT NULL CHECK (de_loja IN ('manos', 'v3')),
    para_loja TEXT NOT NULL CHECK (para_loja IN ('manos', 'v3')),
    valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
    data_acerto DATE NOT NULL DEFAULT CURRENT_DATE,
    descricao TEXT,
    registrado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT acertos_empresas_lojas_diferentes CHECK (de_loja <> para_loja)
);

ALTER TABLE public.acertos_empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acertos Policy" ON public.acertos_empresas;
CREATE POLICY "Acertos Policy" ON public.acertos_empresas FOR ALL USING (public.is_socio_autorizado());

-- 5. Entradas de compra: de qual caixa saiu o dinheiro de cada compra (pode ser dividido)
--    Parte do custo sem lançamento conta como paga pela loja do contrato de compra.
--    Em carro de troca não sai dinheiro: a parte lançada pela outra empresa abate o acerto.
CREATE TABLE IF NOT EXISTS public.pagamentos_compra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
    loja TEXT NOT NULL CHECK (loja IN ('manos', 'v3')),
    valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
    forma TEXT,
    data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
    descricao TEXT,
    registrado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_compra_veiculo ON public.pagamentos_compra (veiculo_id);

ALTER TABLE public.pagamentos_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pagamentos Compra Policy" ON public.pagamentos_compra;
CREATE POLICY "Pagamentos Compra Policy" ON public.pagamentos_compra FOR ALL USING (public.is_socio_autorizado());

DROP TRIGGER IF EXISTS trg_societario_guard ON public.pagamentos_compra;
CREATE TRIGGER trg_societario_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pagamentos_compra
    FOR EACH ROW EXECUTE FUNCTION public.societario_filhos_guard();
