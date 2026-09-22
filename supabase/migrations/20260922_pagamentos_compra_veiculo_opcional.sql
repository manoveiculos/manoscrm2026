-- ==============================================================================
-- DIVISÃO DE LUCRO / ACERTOS: PERMITIR ENTRADA DE COMPRA SEM VEÍCULO VINCULADO
-- Data: 2026-09-22
--
-- Permite lançar adiantamento ou aporte para compra de veículo (ex: Ivo deixou
-- R$ 100 mil com Alexandre para aquisição de um novo carro) mesmo antes de
-- existir um veículo cadastrado no estoque.
-- ==============================================================================

-- 1. Tornar veiculo_id opcional na tabela pagamentos_compra
ALTER TABLE public.pagamentos_compra ALTER COLUMN veiculo_id DROP NOT NULL;

-- 2. Atualizar a trigger de proteção para ignorar registros com veiculo_id IS NULL
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
        IF v_id IS NOT NULL THEN
            v_ids := v_ids || v_id;
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF TG_TABLE_NAME = 'pagamentos_contrato' THEN
            SELECT veiculo_id INTO v_id FROM public.contratos_venda WHERE id = NEW.contrato_venda_id;
        ELSE
            v_id := NEW.veiculo_id;
        END IF;
        IF v_id IS NOT NULL THEN
            v_ids := v_ids || v_id;
        END IF;
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
