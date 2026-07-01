-- ============================================================================
-- V3.85 — Performance da sincronização da extensão (resolução de telefone)
-- Data: 2026-06-09
--
-- PROBLEMA: /api/extension/sync-messages resolve o lead com ILIKE '%sufixo%'
--   em 4 tabelas. Wildcard à ESQUERDA → B-tree NÃO ajuda → seq scan. Sob carga
--   isso causa timeout no Next.js, a extensão reenvia o lote em loop, e o lead
--   "vivo" acaba morto por falso positivo no monitor de inatividade.
--
-- FIX: índices GIN trigram (pg_trgm já instalado). Trigram acelera ILIKE '%x%'
--   quando o trecho tem >=3 chars contíguos — os sufixos de telefone (4 a 9
--   dígitos) se qualificam.
--
-- NOTA: as tabelas são pequenas (982/54/28/2062 linhas) → CREATE INDEX comum,
--   sem CONCURRENTLY (que nem rodaria dentro da transação da migration).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- já instalado; idempotente

-- Índices trigram para a busca por sufixo de telefone
CREATE INDEX IF NOT EXISTS idx_trgm_manos_phone
    ON public.leads_manos_crm           USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_trgm_compra_telefone
    ON public.leads_compra              USING gin (telefone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_trgm_dist_telefone
    ON public.leads_distribuicao_crm_26 USING gin (telefone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_trgm_master_phone
    ON public.leads_master              USING gin (phone gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- sync_key: já existe como coluna + UNIQUE (uq_whatsapp_messages_sync_key).
-- Guard idempotente caso a migration rode em ambiente novo (ex.: branch).
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS sync_key text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname='public' AND tablename='whatsapp_messages'
          AND indexdef ILIKE '%(sync_key)%' AND indexdef ILIKE '%UNIQUE%'
    ) THEN
        CREATE UNIQUE INDEX uq_whatsapp_messages_sync_key
            ON public.whatsapp_messages (sync_key);
    END IF;
END $$;

-- Atualiza estatísticas pro planner usar os índices novos de imediato
ANALYZE public.leads_manos_crm;
ANALYZE public.leads_compra;
ANALYZE public.leads_distribuicao_crm_26;
ANALYZE public.leads_master;
