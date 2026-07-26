-- =====================================================================
-- webhook_errors — dead-letter dos webhooks de entrada
-- Data: 2026-07-25
--
-- Antes, falha crítica no webhook do WhatsApp era gravada com
-- fs.appendFileSync num caminho de disco local ('c:/Users/.../webhook_errors.log').
-- Em serverless (Vercel) isso falha/escreve em disco efêmero → lead que falha
-- no insert some SEM RASTRO. Esta tabela é o dead-letter auditável: todo erro
-- de webhook (WhatsApp, universal, facebook-leads) e toda falha de
-- notificação/análise cai aqui pro admin investigar.
--
-- Append-only. Populada por rotas server-side (service-role).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.webhook_errors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          TEXT NOT NULL,              -- 'whatsapp' | 'universal' | 'facebook-leads' | 'notify' | 'analyze-auto'
    error_message   TEXT NOT NULL,
    payload         JSONB,                      -- corpo/contexto que causou o erro (truncado no app)
    lead_id         TEXT,                       -- quando já existe lead associado
    resolved        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_errors_created  ON public.webhook_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_source   ON public.webhook_errors(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_unresolved
    ON public.webhook_errors(created_at DESC) WHERE resolved = FALSE;

-- RLS: só admin (e service_role). Vendedor não vê.
ALTER TABLE public.webhook_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Webhook errors admin" ON public.webhook_errors;
CREATE POLICY "Webhook errors admin" ON public.webhook_errors
    FOR ALL
    USING (
        auth.jwt() ->> 'email' = 'alexandre_gorges@hotmail.com'
        OR EXISTS (SELECT 1 FROM public.consultants_manos_crm
                   WHERE auth_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        auth.jwt() ->> 'email' = 'alexandre_gorges@hotmail.com'
        OR EXISTS (SELECT 1 FROM public.consultants_manos_crm
                   WHERE auth_id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "Webhook errors service_role" ON public.webhook_errors;
CREATE POLICY "Webhook errors service_role" ON public.webhook_errors
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
