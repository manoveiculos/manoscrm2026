-- =====================================================================
-- Distribuição: nenhum lead nasce fora da roleta
-- Data: 2026-08-10
--
-- Buraco corrigido: o motor (slaEngine) só enxerga o que está em
-- lead_distribuicao, e só as rotas do app (webhooks Next) chamavam
-- distribuirLead(). Lead inserido DIRETO no banco (n8n) nascia órfão:
-- assigned_consultant_id NULL, sem linha em lead_distribuicao. Como o
-- /inbox do vendedor filtra pelo dono, esse lead ficava invisível pra
-- todo mundo menos o admin — 11 leads parados até 3 dias.
--
-- Correção em 3 partes:
--   1) Trigger AFTER INSERT nas 3 tabelas → toda entrada vira linha em
--      lead_distribuicao, não importa QUEM inseriu (n8n, app, SQL na mão).
--   2) fn_enfileirar_orfaos_distribuicao() → rede de segurança chamada
--      pelo tick do cron: pesca qualquer lead ativo que ficou de fora.
--   3) Drop dos triggers legados tr_assign_lead_* (roleta velha) — eram
--      no-op (procuravam role='consultant', que não existe no banco) e
--      concorriam com o motor. Fonte única de verdade = slaEngine.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Todo lead novo entra na roleta
-- ---------------------------------------------------------------------
-- SECURITY DEFINER: lead_distribuicao tem RLS (admin + service_role). O
-- insert do n8n/anon precisa conseguir gravar a linha da roleta.
CREATE OR REPLACE FUNCTION public.fn_enqueue_lead_distribuicao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid TEXT := TG_TABLE_NAME || ':' || NEW.id::TEXT;
    v_tem_dono BOOLEAN := NEW.assigned_consultant_id IS NOT NULL;
BEGIN
    -- Nasceu fechado (descarte, arquivo, já em atendimento, status final)
    -- → não é fila de ninguém.
    IF COALESCE(NEW.descarte_financeiro, FALSE) THEN RETURN NEW; END IF;
    IF NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.atendimento_iniciado_em IS NOT NULL THEN RETURN NEW; END IF;
    IF lower(COALESCE(NEW.status, '')) IN
        ('vendido','perdido','comprado','finalizado','lost','lost_by_inactivity','frio')
    THEN RETURN NEW; END IF;

    INSERT INTO public.lead_distribuicao
        (lead_uid, table_name, native_id, status, assigned_consultant_id, distribuido_em, tentados)
    VALUES (
        v_uid, TG_TABLE_NAME, NEW.id::TEXT,
        -- Já veio com dono (rota do app que atribuiu) → o SLA de 10min já
        -- corre pra ele. Sem dono → entra na fila e o tick distribui.
        CASE WHEN v_tem_dono THEN 'distribuido' ELSE 'aguardando' END,
        NEW.assigned_consultant_id,
        CASE WHEN v_tem_dono THEN NOW() ELSE NULL END,
        CASE WHEN v_tem_dono THEN ARRAY[NEW.assigned_consultant_id] ELSE '{}'::UUID[] END
    )
    ON CONFLICT (lead_uid) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enqueue_dist_crm26  ON public.leads_distribuicao_crm_26;
DROP TRIGGER IF EXISTS tr_enqueue_dist_manos  ON public.leads_manos_crm;
DROP TRIGGER IF EXISTS tr_enqueue_dist_compra ON public.leads_compra;

CREATE TRIGGER tr_enqueue_dist_crm26  AFTER INSERT ON public.leads_distribuicao_crm_26
    FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_lead_distribuicao();
CREATE TRIGGER tr_enqueue_dist_manos  AFTER INSERT ON public.leads_manos_crm
    FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_lead_distribuicao();
CREATE TRIGGER tr_enqueue_dist_compra AFTER INSERT ON public.leads_compra
    FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_lead_distribuicao();

-- ---------------------------------------------------------------------
-- 2) Rede de segurança: pesca órfão que escapou por qualquer caminho
--    (chamada pelo tick do cron a cada minuto — ver slaEngine.tickSla)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enfileirar_orfaos_distribuicao(p_limit INT DEFAULT 200)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    WITH orfaos AS (
        SELECT l.uid, l.table_name, l.native_id, l.assigned_consultant_id
        FROM public.leads_unified_active l
        LEFT JOIN public.lead_distribuicao d ON d.lead_uid = l.uid
        WHERE d.lead_uid IS NULL
          AND l.atendimento_iniciado_em IS NULL
          AND COALESCE(l.descarte_financeiro, FALSE) = FALSE
        ORDER BY l.created_at
        LIMIT p_limit
    ), ins AS (
        INSERT INTO public.lead_distribuicao
            (lead_uid, table_name, native_id, status, assigned_consultant_id, distribuido_em, tentados)
        SELECT
            o.uid, o.table_name, o.native_id,
            CASE WHEN o.assigned_consultant_id IS NOT NULL THEN 'distribuido' ELSE 'aguardando' END,
            o.assigned_consultant_id,
            CASE WHEN o.assigned_consultant_id IS NOT NULL THEN NOW() END,
            CASE WHEN o.assigned_consultant_id IS NOT NULL THEN ARRAY[o.assigned_consultant_id] ELSE '{}'::UUID[] END
        FROM orfaos o
        ON CONFLICT (lead_uid) DO NOTHING
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM ins;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_enfileirar_orfaos_distribuicao(INT) TO service_role;

-- ---------------------------------------------------------------------
-- 3) Aposenta a roleta legada (no-op que só confundia)
--    fn_assign_next_consultant procurava role='consultant'; os papéis
--    reais são 'vendedor'/'admin'/''. Nunca atribuiu ninguém.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_assign_lead_crm26  ON public.leads_distribuicao_crm_26;
DROP TRIGGER IF EXISTS tr_assign_lead_venda  ON public.leads_manos_crm;
DROP TRIGGER IF EXISTS tr_assign_lead_compra ON public.leads_compra;

-- ---------------------------------------------------------------------
-- 4) Backfill imediato do backlog atual (idempotente)
-- ---------------------------------------------------------------------
SELECT public.fn_enfileirar_orfaos_distribuicao(500);
