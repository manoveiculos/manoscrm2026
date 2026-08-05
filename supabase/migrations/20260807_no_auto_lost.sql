-- =====================================================================
-- Atendimento: NUNCA remover lead automaticamente
-- Data: 2026-08-07
--
-- Regra do dono: lead em atendimento nunca sai sozinho — só o vendedor tira
-- (Vendido/Perdido/Arquivar), e ao tirar é obrigado a justificar. O sistema
-- pode COBRAR (aviso de 8h parado), mas NÃO pode mais auto-perder em 24h.
--
-- Reescreve run_inactivity_monitor mantendo só o aviso de 8h (warning_8h) e
-- REMOVENDO o auto-lose de 24h (que virava lost_by_inactivity e sumia o card).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.run_inactivity_monitor()
 RETURNS TABLE(warnings integer, auto_lost integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_warn INT := 0;
BEGIN
    -- Aviso de 8h parado (só cobra; não remove). Idempotente por (lead_uid, kind).
    WITH candidates AS (
        SELECT 'leads_manos_crm:' || id::text AS uid, 'leads_manos_crm' AS tbl, id::text AS lid, assigned_consultant_id AS cid
        FROM leads_manos_crm
        WHERE atendimento_iniciado_em IS NOT NULL
          AND ultima_interacao_humana < NOW() - INTERVAL '8 hours'
          AND LOWER(COALESCE(status,'')) NOT IN ('vendido','perdido','lost','lost_by_inactivity','arquivado','comprado')
          AND archived_at IS NULL
        UNION ALL
        SELECT 'leads_distribuicao_crm_26:' || id::text, 'leads_distribuicao_crm_26', id::text, assigned_consultant_id
        FROM leads_distribuicao_crm_26
        WHERE atendimento_iniciado_em IS NOT NULL
          AND ultima_interacao_humana < NOW() - INTERVAL '8 hours'
          AND LOWER(COALESCE(status,'')) NOT IN ('vendido','perdido','lost','lost_by_inactivity','arquivado','comprado')
          AND archived_at IS NULL
        UNION ALL
        SELECT 'leads_compra:' || id::text, 'leads_compra', id::text, assigned_consultant_id
        FROM leads_compra
        WHERE atendimento_iniciado_em IS NOT NULL
          AND ultima_interacao_humana < NOW() - INTERVAL '8 hours'
          AND LOWER(COALESCE(status,'')) NOT IN ('vendido','perdido','lost','lost_by_inactivity','arquivado','comprado')
          AND archived_at IS NULL
    ),
    inserted AS (
        INSERT INTO inactivity_alerts (lead_uid, lead_table, lead_id, consultor_id, kind)
        SELECT uid, tbl, lid, cid, 'warning_8h' FROM candidates
        ON CONFLICT (lead_uid, kind) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_warn FROM inserted;

    -- AUTO-LOSE de 24h REMOVIDO de propósito. Lead só sai por ação do vendedor.
    RETURN QUERY SELECT v_warn, 0;
END;
$function$;
