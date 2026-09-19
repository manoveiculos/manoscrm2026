-- Tabela de Auditoria e Log de Conversões da Meta Conversions API (v26.0)
CREATE TABLE IF NOT EXISTS public.meta_conversions_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id TEXT,
    fb_lead_id TEXT,
    event_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'SUCCESS', 'FAILED', 'PENDING'
    response_code INT,
    response_payload JSONB,
    payload_sent JSONB,
    error_message TEXT,
    attempts INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para busca rápida no painel admin
CREATE INDEX IF NOT EXISTS idx_meta_conversions_lead_id ON public.meta_conversions_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_meta_conversions_fb_lead_id ON public.meta_conversions_log(fb_lead_id);
CREATE INDEX IF NOT EXISTS idx_meta_conversions_event_name ON public.meta_conversions_log(event_name);
CREATE INDEX IF NOT EXISTS idx_meta_conversions_status ON public.meta_conversions_log(status);
CREATE INDEX IF NOT EXISTS idx_meta_conversions_created_at ON public.meta_conversions_log(created_at DESC);

-- Habilitar RLS e criar política de leitura para service_role / autenticados
ALTER TABLE public.meta_conversions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read/write for service_role on meta_conversions_log"
ON public.meta_conversions_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow read for authenticated users on meta_conversions_log"
ON public.meta_conversions_log
FOR SELECT
TO authenticated
USING (true);
