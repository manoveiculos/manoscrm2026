-- ============================================================================
-- Anti-race de captura de lead (Fila de Pesca)
-- Data: 2026-07-01
--
-- PROBLEMA: dois vendedores clicam "capturar/iniciar atendimento" no mesmo lead
-- quase ao mesmo tempo. Ambos leem atendimento_iniciado_por = NULL e ambos gravam
-- → o 2º sobrescreve o 1º e os dois pensam que são donos.
--
-- CAMADAS DA CORREÇÃO:
--   1) App: /api/lead/start-atendimento faz claim ATÔMICO
--      (UPDATE ... WHERE atendimento_iniciado_por IS NULL) → 2º recebe 409.
--   2) App: inbox não faz mais update direto no cliente (passa pela API).
--   3) Banco (este arquivo): trava final — mesmo um UPDATE cru NÃO troca o dono
--      de um lead já em atendimento. Defesa em profundidade.
--
-- SEGURO PARA TRANSFER / DEVOLVER À FILA: essas ações setam
-- atendimento_iniciado_por = NULL (liberam o lead), o que É permitido. A trava
-- só age quando alguém tenta trocar de um dono NÃO-nulo para OUTRO dono não-nulo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_lead_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Lead já em atendimento por alguém e um UPDATE tenta trocar para OUTRO
    -- consultor (não-nulo) → mantém o dono original (o 2º não rouba).
    IF OLD.atendimento_iniciado_por IS NOT NULL
       AND NEW.atendimento_iniciado_por IS NOT NULL
       AND NEW.atendimento_iniciado_por IS DISTINCT FROM OLD.atendimento_iniciado_por
    THEN
        NEW.atendimento_iniciado_por := OLD.atendimento_iniciado_por;
        NEW.atendimento_iniciado_em  := OLD.atendimento_iniciado_em;
        NEW.assigned_consultant_id   := OLD.assigned_consultant_id;
    END IF;
    RETURN NEW;
END;
$$;

-- Só nas 3 tabelas reais de lead (leads_master é espelho e não tem essas colunas).
DROP TRIGGER IF EXISTS trg_guard_ownership_manos  ON public.leads_manos_crm;
CREATE TRIGGER trg_guard_ownership_manos  BEFORE UPDATE ON public.leads_manos_crm
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_lead_ownership();

DROP TRIGGER IF EXISTS trg_guard_ownership_compra ON public.leads_compra;
CREATE TRIGGER trg_guard_ownership_compra BEFORE UPDATE ON public.leads_compra
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_lead_ownership();

DROP TRIGGER IF EXISTS trg_guard_ownership_dist   ON public.leads_distribuicao_crm_26;
CREATE TRIGGER trg_guard_ownership_dist   BEFORE UPDATE ON public.leads_distribuicao_crm_26
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_lead_ownership();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_guard_ownership_manos  ON public.leads_manos_crm;
-- DROP TRIGGER IF EXISTS trg_guard_ownership_compra ON public.leads_compra;
-- DROP TRIGGER IF EXISTS trg_guard_ownership_dist   ON public.leads_distribuicao_crm_26;
-- DROP FUNCTION IF EXISTS public.fn_guard_lead_ownership();
