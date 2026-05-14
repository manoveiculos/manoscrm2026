-- =============================================================================
-- Reset de lógica do Inbox: limpar urgentes "fantasma" + view de inbox
-- =============================================================================
--
-- Problema relatado pelo gestor: leads em negociação há dias aparecem como
-- "URGENTE" no Inbox. Isso é falha de classificação — quem já teve interação
-- humana NÃO é urgente.
--
-- 1. UPDATE: zera flags antigas de "urgente" pra leads com interação.
-- 2. View v_inbox_vendedor: snapshot oficial do que deve aparecer no Inbox.

-- ── 1. RESET de urgência pra leads com interação humana ─────────────────────
-- Lead que já teve ultima_interacao_humana não pode estar com status='urgente'
-- (se algum legado tiver). Move pra 'attempt' (em negociação).

UPDATE leads_manos_crm
SET status = 'attempt', updated_at = NOW()
WHERE LOWER(COALESCE(status, '')) IN ('urgente', 'urgent')
  AND ultima_interacao_humana IS NOT NULL;

UPDATE leads_distribuicao_crm_26
SET status = 'attempt', atualizado_em = NOW()
WHERE LOWER(COALESCE(status, '')) IN ('urgente', 'urgent')
  AND ultima_interacao_humana IS NOT NULL;

UPDATE leads_compra
SET status = 'attempt', updated_at = NOW()
WHERE LOWER(COALESCE(status, '')) IN ('urgente', 'urgent')
  AND ultima_interacao_humana IS NOT NULL;

-- ── 2. View pública v_inbox_vendedor ───────────────────────────────────────
-- Source-of-truth do que deve aparecer no Inbox de qualquer vendedor.
-- Regras:
--   • Lead novo do dia sem atendimento_iniciado_em AND sem descarte_financeiro
--   • OU lead reativado (flagged_reversao=true)
--   • Excluir status finais e arquivados
DROP VIEW IF EXISTS v_inbox_vendedor CASCADE;
CREATE VIEW v_inbox_vendedor AS
SELECT *
FROM leads_unified_active
WHERE descarte_financeiro = false
  AND (
    -- Lead novo do dia: sem atendimento iniciado, criado hoje
    (atendimento_iniciado_em IS NULL AND created_at::date = CURRENT_DATE)
    -- OU lead reativado: cliente respondeu IA de reversão
    OR flagged_reversao = true
  );

-- ── 3. Reset de descarte financeiro: leads que já estão na fila e tem
-- descarte_financeiro=true devem ser arquivados (saem do Inbox de vez)
UPDATE leads_manos_crm
SET archived_at = NOW(),
    archived_reason = 'descarte_financeiro_auto',
    updated_at = NOW()
WHERE descarte_financeiro = true
  AND archived_at IS NULL;

UPDATE leads_distribuicao_crm_26
SET archived_at = NOW(),
    archived_reason = 'descarte_financeiro_auto',
    atualizado_em = NOW()
WHERE descarte_financeiro = true
  AND archived_at IS NULL;

UPDATE leads_compra
SET archived_at = NOW(),
    archived_reason = 'descarte_financeiro_auto',
    updated_at = NOW()
WHERE descarte_financeiro = true
  AND archived_at IS NULL;

-- ── Validação ───────────────────────────────────────────────────────────────
DO $$
DECLARE v_inbox INT; v_descarte INT;
BEGIN
    SELECT COUNT(*) INTO v_inbox FROM v_inbox_vendedor;
    SELECT COUNT(*) INTO v_descarte FROM leads_manos_crm
      WHERE descarte_financeiro = true AND archived_at IS NOT NULL;
    RAISE NOTICE 'v_inbox_vendedor: % leads | descarte_financeiro arquivados (manos): %', v_inbox, v_descarte;
END $$;
