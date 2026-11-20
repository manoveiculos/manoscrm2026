-- ===========================================================================
-- CONVERSÕES OFFLINE DO GOOGLE ADS (lead qualificado, visita agendada, venda)
-- Data: 2026-11-20   Status: ADITIVA (tabela nova + índice); nada existente é alterado.
--
-- Espelha o que a Meta já tem (meta_capi_queue): o worker /api/cron/google-conversoes olha os mesmos
-- eventos do funil que o banco já enfileira em meta_capi_queue e, para os leads que vieram do Google
-- (gclid no lead ou origem 'google'), registra aqui o envio ao Google Ads (uploadClickConversions).
-- Sem tocar nos gatilhos do banco: uma fila a mais, sem risco para o fluxo de leads.
--
--   status: pending (a enviar) | sent | failed | ignored (não é do Google / sem identificador / ação não configurada)
--           | expired (passou de 90 dias: o Google recusa)
--   order_id: chave de deduplicação do Google (mesmo valor do event_id da Meta: crm_<evento>_<id>)
--   validated_at: o modo teste (validateOnly) não consome o item; só marca aqui
--   canal: 'gclid' (clique identificado) | 'enhanced' (e-mail/telefone com hash SHA-256)
--
-- Acesso: RLS ligada e sem política (só o servidor, via service_role).
-- REVERSÃO: drop table if exists public.google_conv_envios;
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.google_conv_envios (
    fila_id      bigint PRIMARY KEY,                      -- meta_capi_queue.id
    event_name   text NOT NULL,
    order_id     text NOT NULL,
    status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'sent', 'failed', 'ignored', 'expired')),
    attempts     int NOT NULL DEFAULT 0,
    canal        text,
    last_error   text,
    not_before   timestamptz NOT NULL DEFAULT now(),
    validated_at timestamptz,
    sent_at      timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_google_conv_envios_pendentes ON public.google_conv_envios (not_before) WHERE status = 'pending';
ALTER TABLE public.google_conv_envios ENABLE ROW LEVEL SECURITY;
