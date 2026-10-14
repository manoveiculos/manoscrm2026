-- =====================================================================
-- Venda SEMPRE vira linha em sales_manos_crm
-- Data: 2026-10-14  ·  NÃO APLICAR sem revisão do Alexandre.
--
-- Diagnóstico (14/10): nenhuma venda em sales_manos_crm desde 11/07.
--   1. O Kanban de Atendimento marcava "Vendido" com UPDATE direto incluindo
--      won_at — coluna que leads_distribuicao_crm_26 (onde estão ~100% dos
--      leads ativos) não tem. O PostgREST rejeitava o UPDATE inteiro.
--   2. Nenhum caminho do Kanban inseria em sales_manos_crm.
--   3. /api/lead/finish e salesService.recordSale gravavam na view `sales`
--      E na tabela: cada venda entrava em dobro (6 duplicatas hoje).
-- O código (branch fix/venda-perda-registro) corrige os três. Este trigger é
-- a rede de proteção: qualquer caminho que mude o status para vendido
-- (extensão, n8n, tela antiga, SQL manual) passa a gerar a linha também.
-- O app completa valor e veículo na linha criada aqui (não duplica).
-- =====================================================================

-- ── 1. Limpeza das duplicatas existentes (mesmo lead + mesmo created_at) ──
-- Confira antes:
--   SELECT lead_id, created_at, count(*) FROM sales_manos_crm
--   GROUP BY 1,2 HAVING count(*) > 1;
DELETE FROM public.sales_manos_crm a
 USING public.sales_manos_crm b
 WHERE a.lead_id = b.lead_id
   AND a.created_at = b.created_at
   AND a.id > b.id;

-- ── 2. Trigger: status → vendido cria a venda se ainda não existe ─────────
CREATE OR REPLACE FUNCTION public.fn_registrar_venda_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_row       JSONB := to_jsonb(NEW);
    v_lead_id   TEXT  := NEW.id::text;
    v_cons_nome TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM public.sales_manos_crm WHERE lead_id = v_lead_id) THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_cons_nome
      FROM public.consultants_manos_crm
     WHERE id = NEW.assigned_consultant_id;

    INSERT INTO public.sales_manos_crm
        (lead_id, consultant_id, consultant_name, sale_value, sale_date, created_at,
         vehicle_name, client_name, phone)
    VALUES (
        v_lead_id,
        NEW.assigned_consultant_id,
        COALESCE(v_cons_nome, 'Equipe'),
        0,
        NOW(),
        NOW(),
        COALESCE(NULLIF(v_row->>'vehicle_interest', ''), NULLIF(v_row->>'interesse', ''), 'Veículo não informado'),
        COALESCE(v_row->>'nome', v_row->>'name'),
        COALESCE(v_row->>'telefone', v_row->>'phone')
    );
    RETURN NEW;
END;
$function$;

-- Só nas tabelas de VENDA que o app usa. leads_master fica de fora: é espelho
-- do n8n e geraria venda em dobro com o gêmeo de leads_distribuicao_crm_26.
DROP TRIGGER IF EXISTS trg_registrar_venda ON public.leads_distribuicao_crm_26;
CREATE TRIGGER trg_registrar_venda
    AFTER UPDATE OF status ON public.leads_distribuicao_crm_26
    FOR EACH ROW
    WHEN (lower(COALESCE(NEW.status, '')) IN ('vendido', 'closed')
          AND NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION public.fn_registrar_venda_on_status();

DROP TRIGGER IF EXISTS trg_registrar_venda ON public.leads_manos_crm;
CREATE TRIGGER trg_registrar_venda
    AFTER UPDATE OF status ON public.leads_manos_crm
    FOR EACH ROW
    WHEN (lower(COALESCE(NEW.status, '')) IN ('vendido', 'closed')
          AND NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION public.fn_registrar_venda_on_status();

DROP TRIGGER IF EXISTS trg_registrar_venda ON public.leadsfacebook;
CREATE TRIGGER trg_registrar_venda
    AFTER UPDATE OF status ON public.leadsfacebook
    FOR EACH ROW
    WHEN (lower(COALESCE(NEW.status, '')) IN ('vendido', 'closed')
          AND NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION public.fn_registrar_venda_on_status();
