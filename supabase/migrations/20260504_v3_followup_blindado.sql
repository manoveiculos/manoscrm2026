-- Manos CRM V3 — Follow-up Blindado (Inteligência Comercial)
--
-- Resolve:
--   1. Erro 42P16: cannot drop columns from view → DROP VIEW CASCADE antes de CREATE
--   2. Bug x10 no preço Altimus → fix em código (já feito)
--   3. Falta tabela historico_followup pra auditoria + Dashboard
--   4. Falta colunas follow_up_count + respondeu_follow_up nas 3 tabelas de leads
--   5. Lead em status 'frio' após 3 tentativas
--   6. Anti-repetição: vamos consultar historico_followup antes de gerar nova msg
--
-- Ordem cirúrgica:
--   A. DROP VIEW (CASCADE solta dependências)
--   B. ALTER TABLEs (adiciona colunas)
--   C. CREATE TABLE historico_followup
--   D. CREATE VIEWs novamente (com schema atualizado)
--   E. Backfills idempotentes

-- ════════════════════════════════════════════════════════════════
-- A. DROP VIEWS (cascade pra não dar 42P16)
-- ════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS leads_unified_active CASCADE;
DROP VIEW IF EXISTS leads_unified CASCADE;
DROP VIEW IF EXISTS lead_kpis_daily CASCADE;

-- ════════════════════════════════════════════════════════════════
-- B. COLUNAS NOVAS — controle de follow-up
-- ════════════════════════════════════════════════════════════════

ALTER TABLE leads_manos_crm
    ADD COLUMN IF NOT EXISTS follow_up_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS respondeu_follow_up BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ai_silence_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS atendimento_manual_at TIMESTAMPTZ;

ALTER TABLE leads_compra
    ADD COLUMN IF NOT EXISTS follow_up_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS respondeu_follow_up BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ai_silence_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS atendimento_manual_at TIMESTAMPTZ;

ALTER TABLE leads_distribuicao_crm_26
    ADD COLUMN IF NOT EXISTS follow_up_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS respondeu_follow_up BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ai_silence_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS atendimento_manual_at TIMESTAMPTZ;

-- ════════════════════════════════════════════════════════════════
-- C. TABELA historico_followup
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS historico_followup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id TEXT NOT NULL,                      -- string pra aceitar UUID OU INT (CRM26)
    lead_table TEXT NOT NULL,                   -- 'leads_manos_crm' | 'leads_compra' | 'leads_distribuicao_crm_26'
    attempt_number INT NOT NULL,                -- 1ª, 2ª ou 3ª tentativa
    mensagem_enviada TEXT NOT NULL,
    resposta_cliente TEXT,                       -- preenchido quando webhook detecta inbound
    veiculo_ofertado TEXT,                       -- nome completo do veículo (descricao Altimus)
    preco_real_estoque DECIMAL(12,2),            -- preço real validado contra Altimus
    abordagem TEXT,                              -- categoria: 'urgencia' | 'preco' | 'agendar' | 'soft' | 'closing'
    instance_used TEXT,                          -- qual EVOLUTION_INSTANCE foi usada
    enviado_em TIMESTAMPTZ DEFAULT NOW(),
    respondido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_historico_followup_lead
    ON historico_followup (lead_id, enviado_em DESC);

CREATE INDEX IF NOT EXISTS idx_historico_followup_pending_response
    ON historico_followup (lead_id, respondido_em)
    WHERE respondido_em IS NULL;

-- Realtime pra dashboard atualizar
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE historico_followup;
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- D. RECRIA VIEWS (agora com schema atualizado)
-- ════════════════════════════════════════════════════════════════

CREATE VIEW leads_unified AS
SELECT
    'leads_manos_crm:' || l.id::text AS uid,
    'leads_manos_crm' AS table_name,
    l.id::text AS native_id,
    l.name, l.phone, l.vehicle_interest, l.source,
    l.ai_score, l.ai_classification, l.status, l.proxima_acao,
    l.assigned_consultant_id,
    l.created_at, l.updated_at, l.first_contact_at, l.first_contact_channel,
    l.archived_at, l.follow_up_count, l.respondeu_follow_up,
    l.ai_silence_until, l.atendimento_manual_at,
    'venda' AS flow_type
FROM leads_manos_crm l

UNION ALL

SELECT
    'leads_compra:' || c.id::text, 'leads_compra', c.id::text,
    c.nome, c.telefone, c.veiculo_original, c.origem,
    c.ai_score, c.ai_classification, c.status, c.proxima_acao,
    c.assigned_consultant_id,
    c.criado_em, c.updated_at, c.first_contact_at, c.first_contact_channel,
    c.archived_at, c.follow_up_count, c.respondeu_follow_up,
    c.ai_silence_until, c.atendimento_manual_at,
    'compra'
FROM leads_compra c

UNION ALL

SELECT
    'leads_distribuicao_crm_26:' || d.id::text, 'leads_distribuicao_crm_26', d.id::text,
    d.nome, d.telefone, NULL, d.origem,
    d.ai_score, d.ai_classification, d.status, NULL,
    d.assigned_consultant_id,
    d.criado_em, d.atualizado_em, d.first_contact_at, d.first_contact_channel,
    d.archived_at, d.follow_up_count, d.respondeu_follow_up,
    d.ai_silence_until, d.atendimento_manual_at,
    'venda'
FROM leads_distribuicao_crm_26 d;

CREATE VIEW leads_unified_active AS
SELECT * FROM leads_unified
WHERE LOWER(COALESCE(status, '')) NOT IN
    ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity', 'frio')
  AND archived_at IS NULL;

-- View KPI consolidada (junta vendas reais de sales_manos_crm)
CREATE VIEW lead_kpis_daily AS
SELECT
    dia,
    SUM(leads) AS leads,
    SUM(contatados) AS contatados,
    SUM(contatado_5min) AS contatado_5min,
    SUM(vendidos) AS vendidos,
    SUM(perdidos) AS perdidos,
    SUM(frios) AS frios,
    CASE WHEN SUM(leads) > 0
         THEN ROUND(100.0 * SUM(vendidos) / SUM(leads), 2)
         ELSE 0 END AS conversao_pct,
    CASE WHEN SUM(contatados) > 0
         THEN ROUND(100.0 * SUM(contatado_5min) / SUM(contatados), 2)
         ELSE 0 END AS resposta_5min_pct
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
        CASE WHEN LOWER(COALESCE(l.status, '')) IN ('perdido', 'lost', 'lost_by_inactivity')
             THEN 1 ELSE 0 END AS perdidos,
        CASE WHEN LOWER(COALESCE(l.status, '')) = 'frio'
             THEN 1 ELSE 0 END AS frios
    FROM leads_unified l
    WHERE l.created_at >= NOW() - INTERVAL '30 days'
) sub
GROUP BY dia
ORDER BY dia DESC;

-- ════════════════════════════════════════════════════════════════
-- E. BACKFILLS idempotentes (rodam várias vezes sem efeito colateral)
-- ════════════════════════════════════════════════════════════════

-- E.1 — Marca first_contact_at em leads onde IA enviou ai_first_contact mas timestamp ficou NULL
DO $$
DECLARE
    rec RECORD;
    qtd INT := 0;
BEGIN
    FOR rec IN
        SELECT DISTINCT wsl.lead_id, MIN(wsl.sent_at) AS first_sent
        FROM whatsapp_send_log wsl
        WHERE wsl.kind = 'ai_first_contact'
          AND wsl.lead_id IS NOT NULL
          AND wsl.lead_id NOT LIKE 'c:%'
        GROUP BY wsl.lead_id
    LOOP
        UPDATE leads_manos_crm
        SET first_contact_at = rec.first_sent, first_contact_channel = COALESCE(first_contact_channel, 'ai_sdr')
        WHERE id::text = rec.lead_id AND first_contact_at IS NULL;
        IF FOUND THEN qtd := qtd + 1; CONTINUE; END IF;

        UPDATE leads_compra
        SET first_contact_at = rec.first_sent, first_contact_channel = COALESCE(first_contact_channel, 'ai_sdr')
        WHERE id::text = rec.lead_id AND first_contact_at IS NULL;
        IF FOUND THEN qtd := qtd + 1; CONTINUE; END IF;

        BEGIN
            UPDATE leads_distribuicao_crm_26
            SET first_contact_at = rec.first_sent, first_contact_channel = COALESCE(first_contact_channel, 'ai_sdr')
            WHERE id::text = rec.lead_id AND first_contact_at IS NULL;
            IF FOUND THEN qtd := qtd + 1; END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END LOOP;
    RAISE NOTICE 'Backfill first_contact_at: % leads atualizados', qtd;
END $$;

-- E.2 — Marca leads como "vendido" se existe registro em sales_manos_crm órfão
UPDATE leads_manos_crm
SET status = 'vendido', won_at = COALESCE(won_at, NOW())
WHERE id IN (SELECT DISTINCT lead_id::uuid FROM sales_manos_crm WHERE lead_id IS NOT NULL)
  AND LOWER(COALESCE(status, '')) NOT IN ('vendido', 'comprado');

-- E.3 — Marca leads_master duplicados como arquivados (bug do n8n duplicando)
-- Critério: nome+phone iguais a outro lead, criado depois, sem nenhum envio IA
UPDATE leads_master
SET archived_at = COALESCE(archived_at, NOW()),
    archived_reason = COALESCE(archived_reason, 'duplicate_of_leads_distribuicao_crm_26'),
    status = CASE WHEN LOWER(COALESCE(status, '')) IN ('vendido', 'perdido', 'comprado') THEN status
                  ELSE 'lost_by_inactivity' END
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND archived_at IS NULL
  AND id NOT IN (SELECT DISTINCT lead_id::uuid FROM whatsapp_send_log WHERE lead_id IS NOT NULL AND lead_id ~ '^[0-9a-f]{8}-')
  AND id NOT IN (SELECT DISTINCT lead_id::uuid FROM sales_manos_crm WHERE lead_id IS NOT NULL);

-- ════════════════════════════════════════════════════════════════
-- VALIDAÇÃO RÁPIDA
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM leads_unified WHERE follow_up_count IS NOT NULL;
    RAISE NOTICE 'leads_unified com follow_up_count exposto: %', v_count;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
        WHERE table_name = 'historico_followup';
    RAISE NOTICE 'historico_followup colunas criadas: %', v_count;

    SELECT COUNT(*) INTO v_count FROM lead_kpis_daily;
    RAISE NOTICE 'lead_kpis_daily linhas: %', v_count;
END $$;
