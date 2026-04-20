-- ════════════════════════════════════════════════════════════════
-- Loss Attribution: desmascara vendedor que marca lead como lixo.
--
-- Sem isso, o sistema confia 100% no que o vendedor digita ao perder
-- um lead. Vendedor preguiçoso marca tudo como "sem interesse" e some
-- da fila. Estes campos permitem auditar a atribuição da culpa
-- (cliente desistiu vs vendedor abandonou) com base no histórico real
-- da conversa no WhatsApp.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.leads_manos_crm
    -- Snapshot do score IA no MOMENTO da perda (não muda mais).
    -- Sem isso, impossível separar "lead ruim perdido" de "lead bom
    -- perdido por vendedor ruim", pois ai_score atual reflete estado
    -- pós-perda.
    ADD COLUMN IF NOT EXISTS ai_score_at_loss INTEGER,

    -- Atribuição da culpa, classificada por IA com base no chat:
    --   client_disengaged    → cliente sumiu / disse não ter interesse
    --   consultant_abandoned → cliente respondeu, vendedor não retornou
    --   external_factor      → crédito negado, mudou de cidade, etc.
    --   no_history           → sem mensagens suficientes p/ analisar
    ADD COLUMN IF NOT EXISTS loss_attribution TEXT,

    -- Justificativa textual da IA (1 linha) p/ auditoria do gerente
    ADD COLUMN IF NOT EXISTS loss_attribution_reason TEXT,

    -- Score 0-100 da proatividade do vendedor naquele lead específico:
    --   100 = respondeu sempre rápido, mandou última msg
    --     0 = ignorou cliente, não retornou
    -- Penaliza vendedor mesmo quando perda é técnica "legítima".
    ADD COLUMN IF NOT EXISTS consultant_response_score INTEGER,

    -- Quando a análise rodou (idempotência + diagnóstico)
    ADD COLUMN IF NOT EXISTS loss_analyzed_at TIMESTAMPTZ;

-- Índice para o futuro dashboard de performance por vendedor.
-- Filtros típicos: "leads HOT (score≥70 no momento da perda) por consultor"
CREATE INDEX IF NOT EXISTS idx_leads_loss_attribution
    ON public.leads_manos_crm (assigned_consultant_id, loss_attribution, ai_score_at_loss)
    WHERE status = 'perdido';
