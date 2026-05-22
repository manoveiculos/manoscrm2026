-- Migração para criar a tabela de métricas e custos de IA
CREATE TABLE IF NOT EXISTS public.ai_metrics_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost NUMERIC(12, 6),
    latency_ms INTEGER,
    caller_api TEXT, -- Nome do endpoint ou serviço que originou a chamada (ex: /api/lead/analyze)
    lead_id TEXT, -- ID do lead associado para análise granular
    status TEXT DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.ai_metrics_log ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS: apenas service_role e admins podem ler ou gravar
CREATE POLICY "Permitir leitura apenas para administradores" ON public.ai_metrics_log
    FOR SELECT USING (
        auth.jwt()->>'role' = 'service_role' OR 
        (EXISTS (
            SELECT 1 FROM public.consultants_manos_crm c
            WHERE (c.user_id = auth.uid() OR c.auth_id = auth.uid()) AND c.role = 'admin'
        ))
    );

CREATE POLICY "Permitir escrita apenas para service_role" ON public.ai_metrics_log
    FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');
