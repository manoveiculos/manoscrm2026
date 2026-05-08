-- Fix definitivo do bug "IA SDR enviou 0 em 24h"
--
-- Problema: scheduleFirstContact usava setTimeout dentro do route handler.
-- Em Next.js, depois que a Response é retornada o processo encerra e o
-- timer é descartado. Resultado: sendFirstContact NUNCA executava em prod.
--
-- Solução: fila persistente. Webhook faz INSERT instantâneo. Cron de 1min
-- drena entries com scheduled_at <= NOW() e dispara o envio real.

CREATE TABLE IF NOT EXISTS ai_sdr_queue (
    id           BIGSERIAL PRIMARY KEY,
    lead_id      TEXT NOT NULL,
    lead_table   TEXT NOT NULL,
    payload      JSONB NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    attempts     INT NOT NULL DEFAULT 0,
    last_error   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice pra runner pegar pendentes rápido (scheduled_at chegou + ainda não processou)
CREATE INDEX IF NOT EXISTS idx_ai_sdr_queue_pending
    ON ai_sdr_queue (scheduled_at)
    WHERE processed_at IS NULL;

-- Idempotência: 1 entrada por lead. Se webhook duplicar, ignora.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_sdr_queue_lead_unique
    ON ai_sdr_queue (lead_id, lead_table)
    WHERE processed_at IS NULL;
