-- ============================================================
-- MANOS CRM — P4: Função de Busca Semântica (v2)
-- Execute no Supabase SQL Editor
-- Aceita float[] em vez de vector(1536) para compatibilidade
-- com PostgREST / Supabase JS client
-- ============================================================

-- Remove versão anterior se existir
DROP FUNCTION IF EXISTS match_leads(vector(1536), float, int);
DROP FUNCTION IF EXISTS match_leads(float[], float, int);

-- Nova função com parâmetro float[] (cast interno para vector)
CREATE OR REPLACE FUNCTION match_leads(
    query_embedding float[],
    match_threshold float DEFAULT 0.2,
    match_count     int   DEFAULT 20
)
RETURNS TABLE (
    id         uuid,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        l.id,
        (1 - (l.embedding <=> query_embedding::vector))::float AS similarity
    FROM leads_manos_crm l
    WHERE l.embedding IS NOT NULL
      AND (1 - (l.embedding <=> query_embedding::vector)) > match_threshold
    ORDER BY l.embedding <=> query_embedding::vector
    LIMIT match_count;
$$;

-- Verificação
DO $$
DECLARE
    v_fn BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'match_leads'
    ) INTO v_fn;
    RAISE NOTICE '[P4] match_leads (float[]): %', CASE WHEN v_fn THEN 'CRIADA ✓' ELSE 'ERRO ✗' END;
END $$;
