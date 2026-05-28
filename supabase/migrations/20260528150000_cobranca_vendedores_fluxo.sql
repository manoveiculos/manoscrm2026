-- Adição de colunas na tabela records_cobrancamanos26
ALTER TABLE public.records_cobrancamanos26 ADD COLUMN IF NOT EXISTS fase TEXT NOT NULL DEFAULT 'NORMAL' CHECK (fase IN ('NORMAL', 'ENVIO_JURIDICO', 'JURIDICO_VENDEDORES', 'ENVIO_FORUM'));
ALTER TABLE public.records_cobrancamanos26 ADD COLUMN IF NOT EXISTS telefone_invalido BOOLEAN DEFAULT false;
ALTER TABLE public.records_cobrancamanos26 ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES public.consultants_manos_crm(id) ON DELETE SET NULL;
ALTER TABLE public.records_cobrancamanos26 ADD COLUMN IF NOT EXISTS quem_vendeu TEXT;

-- Recriação da view v_billing_controle com as novas colunas
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
    ai.risk_score,
    r.fase,
    r.telefone_invalido,
    r.vendedor_id,
    r.quem_vendeu,
    c.name AS vendedor_nome
FROM public.records_cobrancamanos26 r
LEFT JOIN public.billing_ai_analysis ai ON ai.record_id = r.id
LEFT JOIN public.consultants_manos_crm c ON c.id = r.vendedor_id;

GRANT SELECT ON public.v_billing_controle TO authenticated;
