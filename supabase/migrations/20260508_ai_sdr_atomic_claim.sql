-- Atomic claim de jobs da fila — elimina race condition em concorrência.
--
-- Sem isso: 2 runners simultâneos pegam os mesmos jobs e enviam msg duplicada
-- pro cliente. Com FOR UPDATE SKIP LOCKED, cada runner pega seu lote e os
-- outros pulam silenciosamente.

CREATE OR REPLACE FUNCTION claim_ai_sdr_jobs(p_limit INT DEFAULT 20)
RETURNS TABLE (
    id         BIGINT,
    lead_id    TEXT,
    lead_table TEXT,
    payload    JSONB,
    attempts   INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    UPDATE ai_sdr_queue
    SET attempts = ai_sdr_queue.attempts + 1
    WHERE ai_sdr_queue.id IN (
        SELECT q.id
        FROM ai_sdr_queue q
        WHERE q.scheduled_at <= NOW()
          AND q.processed_at IS NULL
          AND q.attempts < 5
        ORDER BY q.scheduled_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING ai_sdr_queue.id, ai_sdr_queue.lead_id, ai_sdr_queue.lead_table,
              ai_sdr_queue.payload, ai_sdr_queue.attempts;
END;
$$;
