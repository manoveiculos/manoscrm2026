-- =============================================================================
-- Módulo de Reversão: followup-ai vira Agente de Reversão de leads perdidos
-- =============================================================================
--
-- Bot de triagem inicial (aiSdrService) cuida do primeiro contato.
-- Vendedor humano conduz negociação. Quando vendedor marca PERDIDO ou
-- ARQUIVA, o módulo de reversão entra em ação:
--
--   1. Lê motivo estruturado (preço, parcela, modelo, concorrente, etc)
--      + diagnóstico textual livre do vendedor.
--   2. Lê histórico completo da conversa em whatsapp_messages.
--   3. Identifica "carro da virada" no estoque Altimus baseado no motivo.
--   4. Envia mensagem de reversão (1 a 3 tentativas, 24h entre cada).
--   5. Cliente responder → flagged_reversao=true → lead volta pro Inbox
--      com badge "🔥 REVERSÃO BEM-SUCEDIDA" e notifica vendedor (level=3).
--
-- Descarte financeiro: se motivo for credito_negado / cpf_ruim / score_baixo,
-- lead recebe descarte_financeiro=true e IA ignora pra sempre.

-- =============================================================================
-- 1. Colunas novas nas 3 tabelas (idempotente)
-- =============================================================================

ALTER TABLE leads_manos_crm
    ADD COLUMN IF NOT EXISTS diagnostico_atendimento TEXT,
    ADD COLUMN IF NOT EXISTS motivo_perda_estruturado TEXT,
    ADD COLUMN IF NOT EXISTS descarte_financeiro BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS flagged_reversao BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reversao_attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reversao_last_attempt_at TIMESTAMPTZ;

ALTER TABLE leads_distribuicao_crm_26
    ADD COLUMN IF NOT EXISTS diagnostico_atendimento TEXT,
    ADD COLUMN IF NOT EXISTS motivo_perda_estruturado TEXT,
    ADD COLUMN IF NOT EXISTS descarte_financeiro BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS flagged_reversao BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reversao_attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reversao_last_attempt_at TIMESTAMPTZ;

ALTER TABLE leads_compra
    ADD COLUMN IF NOT EXISTS diagnostico_atendimento TEXT,
    ADD COLUMN IF NOT EXISTS motivo_perda_estruturado TEXT,
    ADD COLUMN IF NOT EXISTS descarte_financeiro BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS flagged_reversao BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reversao_attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reversao_last_attempt_at TIMESTAMPTZ;

-- =============================================================================
-- 2. Recria leads_unified incluindo as 6 colunas novas
-- =============================================================================

DROP VIEW IF EXISTS leads_unified_active CASCADE;
DROP VIEW IF EXISTS leads_unified CASCADE;
DROP VIEW IF EXISTS lead_kpis_daily CASCADE;

CREATE VIEW leads_unified AS
SELECT
    'leads_manos_crm:' || l.id::text AS uid,
    'leads_manos_crm' AS table_name,
    l.id::text AS native_id,
    l.name, l.phone, l.vehicle_interest, l.source,
    l.ai_score, l.ai_classification, l.status, l.proxima_acao,
    l.ai_summary,
    l.assigned_consultant_id,
    l.created_at, l.updated_at, l.first_contact_at, l.first_contact_channel,
    l.archived_at, l.follow_up_count, l.respondeu_follow_up,
    l.ai_silence_until, l.atendimento_manual_at,
    l.atendimento_iniciado_em, l.atendimento_iniciado_por,
    l.diagnostico_atendimento, l.motivo_perda_estruturado,
    l.descarte_financeiro, l.flagged_reversao,
    l.reversao_attempt_count, l.reversao_last_attempt_at,
    'venda' AS flow_type
FROM leads_manos_crm l

UNION ALL

SELECT
    'leads_compra:' || c.id::text, 'leads_compra', c.id::text,
    c.nome, c.telefone, c.veiculo_original, c.origem,
    c.ai_score, c.ai_classification, c.status, c.proxima_acao,
    c.ai_summary,
    c.assigned_consultant_id,
    c.criado_em, c.updated_at, c.first_contact_at, c.first_contact_channel,
    c.archived_at, c.follow_up_count, c.respondeu_follow_up,
    c.ai_silence_until, c.atendimento_manual_at,
    c.atendimento_iniciado_em, c.atendimento_iniciado_por,
    c.diagnostico_atendimento, c.motivo_perda_estruturado,
    c.descarte_financeiro, c.flagged_reversao,
    c.reversao_attempt_count, c.reversao_last_attempt_at,
    'compra'
FROM leads_compra c

UNION ALL

SELECT
    'leads_distribuicao_crm_26:' || d.id::text, 'leads_distribuicao_crm_26', d.id::text,
    d.nome, d.telefone, NULL, d.origem,
    d.ai_score, d.ai_classification, d.status, NULL,
    COALESCE(d.ai_summary, d.resumo),
    d.assigned_consultant_id,
    d.criado_em, d.atualizado_em, d.first_contact_at, d.first_contact_channel,
    d.archived_at, d.follow_up_count, d.respondeu_follow_up,
    d.ai_silence_until, d.atendimento_manual_at,
    d.atendimento_iniciado_em, d.atendimento_iniciado_por,
    d.diagnostico_atendimento, d.motivo_perda_estruturado,
    d.descarte_financeiro, d.flagged_reversao,
    d.reversao_attempt_count, d.reversao_last_attempt_at,
    'venda'
FROM leads_distribuicao_crm_26 d;

CREATE VIEW leads_unified_active AS
SELECT * FROM leads_unified
WHERE LOWER(COALESCE(status, '')) NOT IN
    ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity', 'frio')
  AND archived_at IS NULL;

-- Recria lead_kpis_daily
CREATE VIEW lead_kpis_daily AS
SELECT
    dia,
    SUM(leads) AS leads,
    SUM(contatados) AS contatados,
    SUM(contatado_5min) AS contatado_5min,
    SUM(vendidos) AS vendidos,
    SUM(perdidos) AS perdidos,
    SUM(frios) AS frios,
    CASE WHEN SUM(leads) > 0 THEN ROUND(100.0 * SUM(vendidos) / SUM(leads), 2) ELSE 0 END AS conversao_pct,
    CASE WHEN SUM(contatados) > 0 THEN ROUND(100.0 * SUM(contatado_5min) / SUM(contatados), 2) ELSE 0 END AS resposta_5min_pct
FROM (
    SELECT
        DATE(l.created_at) AS dia,
        1 AS leads,
        CASE WHEN l.first_contact_at IS NOT NULL THEN 1 ELSE 0 END AS contatados,
        CASE WHEN l.first_contact_at IS NOT NULL
                  AND EXTRACT(EPOCH FROM (l.first_contact_at - l.created_at))/60 <= 5
             THEN 1 ELSE 0 END AS contatado_5min,
        CASE WHEN LOWER(COALESCE(l.status, '')) IN ('vendido', 'comprado')
                  OR EXISTS (SELECT 1 FROM sales_manos_crm s WHERE s.lead_id::text = l.native_id)
             THEN 1 ELSE 0 END AS vendidos,
        CASE WHEN LOWER(COALESCE(l.status, '')) IN ('perdido', 'lost', 'lost_by_inactivity') THEN 1 ELSE 0 END AS perdidos,
        CASE WHEN LOWER(COALESCE(l.status, '')) = 'frio' THEN 1 ELSE 0 END AS frios
    FROM leads_unified l
    WHERE l.created_at >= NOW() - INTERVAL '30 days'
) sub
GROUP BY dia
ORDER BY dia DESC;

-- =============================================================================
-- 3. Índices parciais — pro cron de reversão achar elegíveis rápido
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_manos_reversao_elegivel
    ON leads_manos_crm (reversao_last_attempt_at NULLS FIRST)
    WHERE (status IN ('perdido','lost','lost_by_inactivity') OR archived_at IS NOT NULL)
      AND descarte_financeiro = false
      AND reversao_attempt_count < 3;

CREATE INDEX IF NOT EXISTS idx_leads_dist_reversao_elegivel
    ON leads_distribuicao_crm_26 (reversao_last_attempt_at NULLS FIRST)
    WHERE (status IN ('perdido','lost','lost_by_inactivity') OR archived_at IS NOT NULL)
      AND descarte_financeiro = false
      AND reversao_attempt_count < 3;

CREATE INDEX IF NOT EXISTS idx_leads_compra_reversao_elegivel
    ON leads_compra (reversao_last_attempt_at NULLS FIRST)
    WHERE (status IN ('perdido','lost','lost_by_inactivity') OR archived_at IS NOT NULL)
      AND descarte_financeiro = false
      AND reversao_attempt_count < 3;

-- =============================================================================
-- Validação
-- =============================================================================
DO $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'leads_manos_crm'
      AND column_name IN ('diagnostico_atendimento','motivo_perda_estruturado',
                          'descarte_financeiro','flagged_reversao',
                          'reversao_attempt_count','reversao_last_attempt_at');
    RAISE NOTICE 'leads_manos_crm: % de 6 colunas novas presentes', v_count;
END $$;
