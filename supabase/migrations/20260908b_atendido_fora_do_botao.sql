-- =====================================================================
-- "Atendido" é quem o vendedor atendeu — não quem clicou no botão
-- Data: 2026-09-08
--
-- Queixa do time: a Inbox mostra como "não atendido" lead que já foi
-- atendido. E está certa a queixa — o problema é a definição.
--
-- O CRM tratava `atendimento_iniciado_em` (o clique em "INICIAR
-- ATENDIMENTO") como a única prova de atendimento. Só que o time atende
-- direto no WhatsApp e raramente clica. Quem registra esse atendimento é
-- a extensão: ao ver mensagem SAINDO para o cliente, ela grava
-- first_contact_at + first_contact_channel='vendor_whatsapp'.
--
-- Resultado: lead atendido de verdade ficava eternamente na fila, era
-- redistribuído, esgotava, era reciclado e voltava. O vendedor via de
-- novo um cliente com quem já tinha conversado dias atrás.
--
-- Regra correta de "ainda não atendido":
--     atendimento_iniciado_em IS NULL
--     AND (first_contact_at IS NULL OR first_contact_channel = 'ai_sdr')
--
-- A IA ter mandado mensagem não conta como atendimento humano. Mensagem
-- só de ENTRADA também não conta: cliente que escreveu e ninguém
-- respondeu é exatamente quem mais precisa estar na fila.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Consolida o histórico: quem o vendedor já atendeu passa a constar
--    como atendido, com a data real do primeiro contato.
-- ---------------------------------------------------------------------
UPDATE public.leads_distribuicao_crm_26
SET atendimento_iniciado_em  = first_contact_at,
    atendimento_iniciado_por = COALESCE(atendimento_iniciado_por, assigned_consultant_id)
WHERE atendimento_iniciado_em IS NULL
  AND first_contact_at IS NOT NULL
  AND COALESCE(first_contact_channel, '') <> 'ai_sdr';

UPDATE public.leads_manos_crm
SET atendimento_iniciado_em  = first_contact_at,
    atendimento_iniciado_por = COALESCE(atendimento_iniciado_por, assigned_consultant_id)
WHERE atendimento_iniciado_em IS NULL
  AND first_contact_at IS NOT NULL
  AND COALESCE(first_contact_channel, '') <> 'ai_sdr';

UPDATE public.leads_compra
SET atendimento_iniciado_em  = first_contact_at,
    atendimento_iniciado_por = COALESCE(atendimento_iniciado_por, assigned_consultant_id)
WHERE atendimento_iniciado_em IS NULL
  AND first_contact_at IS NOT NULL
  AND COALESCE(first_contact_channel, '') <> 'ai_sdr';

-- Tira da roleta o que acabou de ser reconhecido como atendido, senão o
-- motor continua girando esses leads mesmo já fora da Inbox.
UPDATE public.lead_distribuicao d
SET status = 'atendido',
    atendido_em = COALESCE(d.atendido_em, l.atendimento_iniciado_em, NOW()),
    atualizado_em = NOW()
FROM public.leads_unified_active l
WHERE l.uid = d.lead_uid
  AND d.status IN ('standby', 'aguardando', 'distribuido', 'esgotado')
  AND l.atendimento_iniciado_em IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) A rede de segurança precisa da mesma definição. Sem isso ela torna a
--    enfileirar amanhã tudo que acabamos de tirar da fila.
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
          -- Vendedor já falou com o cliente → atendido, não é órfão.
          AND (l.first_contact_at IS NULL OR l.first_contact_channel = 'ai_sdr')
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
-- 3) Confere o estrago desfeito
-- ---------------------------------------------------------------------
SELECT
    count(*) FILTER (WHERE atendimento_iniciado_em IS NOT NULL) AS agora_atendidos,
    count(*) FILTER (
        WHERE atendimento_iniciado_em IS NULL
          AND (first_contact_at IS NULL OR first_contact_channel = 'ai_sdr')
    ) AS realmente_na_fila
FROM public.leads_unified_active
WHERE COALESCE(descarte_financeiro, FALSE) = FALSE;
