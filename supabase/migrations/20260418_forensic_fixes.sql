-- Migração: Forensic Fixes 2026-04-18
-- Descrição: Adiciona resiliência para falhas de IA e rastreabilidade de notificações
-- Autor: Antigravity (Auditoria Forense)

-- 1. Campos para controle de processamento de IA
ALTER TABLE public.leads_manos_crm ADD COLUMN IF NOT EXISTS ai_pending BOOLEAN DEFAULT FALSE;
ALTER TABLE public.leads_compra ADD COLUMN IF NOT EXISTS ai_pending BOOLEAN DEFAULT FALSE;

-- 2. Tabela para log de falhas em webhooks externos (n8n, etc)
CREATE TABLE IF NOT EXISTS public.notification_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    lead_id UUID,
    consultant_id UUID,
    channel TEXT NOT NULL,  -- 'n8n_vendor', 'n8n_morning_brief', etc.
    payload JSONB,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    resolved BOOLEAN DEFAULT FALSE
);

-- 3. Índices de performance
CREATE INDEX IF NOT EXISTS idx_notif_failures_unresolved 
    ON public.notification_failures(resolved, created_at);

-- 4. Comentários para documentação
COMMENT ON COLUMN public.leads_manos_crm.ai_pending IS 'Indica que o processamento de IA falhou e precisa de retry';
COMMENT ON COLUMN public.leads_compra.ai_pending IS 'Indica que o processamento de IA falhou e precisa de retry';
COMMENT ON TABLE public.notification_failures IS 'Log de falhas críticas em integrações externas de notificação';
