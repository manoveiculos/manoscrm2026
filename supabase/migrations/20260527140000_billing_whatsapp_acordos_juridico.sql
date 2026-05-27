-- ============================================================================
-- Cobrança v2: WhatsApp inbox, Acordos, Jurídico e IA de análise
-- Vinculado ao módulo /admin/cobranca + Evolution instância "camila-cobranca"
-- ============================================================================

-- Tabela de mensagens WhatsApp (inbound + outbound) recebidas via Evolution
-- Webhook receptor: /api/billing/whatsapp-webhook
CREATE TABLE IF NOT EXISTS public.billing_whatsapp_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id     TEXT REFERENCES public.records_cobrancamanos26(id) ON DELETE SET NULL,
    cpf_cnpj      TEXT,
    telefone      TEXT NOT NULL,
    direction     TEXT NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    body          TEXT,
    media_url     TEXT,
    media_type    TEXT,
    push_name     TEXT,
    evolution_msg_id TEXT UNIQUE,
    evolution_instance TEXT,
    raw_payload   JSONB,
    -- classificação IA (preenchida pelo /api/billing/ai-analyze)
    ai_intent     TEXT CHECK (ai_intent IN (
        'PROMESSA_PAGAMENTO','NEGOCIACAO','RECUSA','SEM_RESPOSTA',
        'INFO_GENERICA','RECLAMACAO','OUTROS'
    )),
    ai_summary    TEXT,
    ai_analyzed_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_billing_wa_telefone ON public.billing_whatsapp_messages(telefone);
CREATE INDEX IF NOT EXISTS idx_billing_wa_record ON public.billing_whatsapp_messages(record_id);
CREATE INDEX IF NOT EXISTS idx_billing_wa_created ON public.billing_whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_wa_intent ON public.billing_whatsapp_messages(ai_intent) WHERE ai_intent IS NOT NULL;

ALTER TABLE public.billing_whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_wa_all_authenticated"
ON public.billing_whatsapp_messages
FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Permite o webhook (service role) inserir sem autenticação de usuário
CREATE POLICY "billing_wa_service_insert"
ON public.billing_whatsapp_messages
FOR INSERT TO service_role
WITH CHECK (true);


-- ============================================================================
-- Acordos de negociação (parcelamentos, descontos, promessa de pagamento)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_acordos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id        TEXT NOT NULL REFERENCES public.records_cobrancamanos26(id) ON DELETE CASCADE,
    tipo             TEXT NOT NULL CHECK (tipo IN ('PARCELAMENTO','DESCONTO_VISTA','PROMESSA_DATA','OUTRO')),
    valor_original   NUMERIC NOT NULL,
    valor_acordado   NUMERIC NOT NULL,
    parcelas         INT DEFAULT 1,
    primeira_parcela DATE,
    observacao       TEXT,
    status           TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','CUMPRIDO','QUEBRADO','CANCELADO')),
    criado_por       TEXT,
    created_at       TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at       TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_billing_acordos_record ON public.billing_acordos(record_id);
CREATE INDEX IF NOT EXISTS idx_billing_acordos_status ON public.billing_acordos(status);

ALTER TABLE public.billing_acordos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_acordos_all_authenticated"
ON public.billing_acordos FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- Envios para cobrança jurídica
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_juridico_envios (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id        TEXT NOT NULL REFERENCES public.records_cobrancamanos26(id) ON DELETE CASCADE,
    motivo           TEXT NOT NULL,
    valor_devido     NUMERIC NOT NULL,
    dias_atraso      INT,
    enviado_para     TEXT, -- nome/email do escritório/advogado
    documentos_url   TEXT[], -- URLs de docs anexos (S3/Storage)
    status           TEXT NOT NULL DEFAULT 'ENVIADO' CHECK (status IN ('ENVIADO','EM_ANALISE','PROTESTADO','ACAO_JUDICIAL','RECUPERADO','PERDIDO')),
    observacao       TEXT,
    enviado_por      TEXT,
    enviado_em       TIMESTAMPTZ DEFAULT timezone('utc', now()),
    atualizado_em    TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_billing_juridico_record ON public.billing_juridico_envios(record_id);
CREATE INDEX IF NOT EXISTS idx_billing_juridico_status ON public.billing_juridico_envios(status);

ALTER TABLE public.billing_juridico_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_juridico_all_authenticated"
ON public.billing_juridico_envios FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- Observações gerais do setor de cobrança (não vinculadas a um record específico)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_observacoes_gerais (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo      TEXT NOT NULL,
    conteudo    TEXT NOT NULL,
    categoria   TEXT CHECK (categoria IN ('GERAL','PROCEDIMENTO','META','ALERTA','REUNIAO')),
    autor       TEXT,
    pinned      BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_billing_obs_created ON public.billing_observacoes_gerais(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_obs_pinned ON public.billing_observacoes_gerais(pinned) WHERE pinned = true;

ALTER TABLE public.billing_observacoes_gerais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_obs_all_authenticated"
ON public.billing_observacoes_gerais FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- Cache de análise IA por record (sumário do caso, próxima ação sugerida)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_ai_analysis (
    record_id        TEXT PRIMARY KEY REFERENCES public.records_cobrancamanos26(id) ON DELETE CASCADE,
    risk_score       INT CHECK (risk_score BETWEEN 0 AND 100),
    classification   TEXT CHECK (classification IN (
        'PROMESSA_PAGAMENTO','NEGOCIACAO_ABERTA','RECUSA','SEM_CONTATO',
        'CANDIDATO_JURIDICO','PERDIDO','RECUPERAVEL'
    )),
    next_action      TEXT,
    next_action_at   DATE,
    summary          TEXT,
    model            TEXT,
    analyzed_at      TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_billing_ai_class ON public.billing_ai_analysis(classification);

ALTER TABLE public.billing_ai_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_ai_all_authenticated"
ON public.billing_ai_analysis FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- View unificada para a aba Controle (dashboards)
-- ============================================================================
CREATE OR REPLACE VIEW public.v_billing_controle AS
SELECT
    r.id,
    r."clienteFornecedor" AS cliente,
    r."cpfCnpj" AS cpf_cnpj,
    r.telefone,
    r.veiculo,
    r.vencimento,
    r.valor,
    r.status,
    r."dataPagamento" AS data_pagamento,
    CASE
        WHEN r.status = 'PAGO' THEN 0
        ELSE GREATEST(0, (CURRENT_DATE - r.vencimento::date))
    END AS dias_atraso,
    CASE
        WHEN r.status = 'PAGO' THEN 'PAGO'
        WHEN (CURRENT_DATE - r.vencimento::date) <= 0 THEN 'EM_DIA'
        WHEN (CURRENT_DATE - r.vencimento::date) <= 30 THEN '1_30'
        WHEN (CURRENT_DATE - r.vencimento::date) <= 60 THEN '31_60'
        WHEN (CURRENT_DATE - r.vencimento::date) <= 90 THEN '61_90'
        ELSE 'PLUS_90'
    END AS faixa_atraso,
    (SELECT COUNT(*) FROM public.billing_acordos a WHERE a.record_id = r.id AND a.status = 'ATIVO') AS acordos_ativos,
    (SELECT COUNT(*) FROM public.billing_juridico_envios j WHERE j.record_id = r.id) AS juridico_envios,
    (SELECT MAX(created_at) FROM public.billing_whatsapp_messages w WHERE w.record_id = r.id) AS ultima_msg_whatsapp,
    ai.classification AS ai_classification,
    ai.risk_score
FROM public.records_cobrancamanos26 r
LEFT JOIN public.billing_ai_analysis ai ON ai.record_id = r.id;

GRANT SELECT ON public.v_billing_controle TO authenticated;
