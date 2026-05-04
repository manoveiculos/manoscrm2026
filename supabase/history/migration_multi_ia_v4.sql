-- ============================================================
-- MANOS CRM — MIGRAÇÃO MULTI-IA v4
-- Execute no Supabase SQL Editor
-- Idempotente: seguro para rodar múltiplas vezes
-- Data: 27/03/2026
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 1. REALTIME — Habilitar para follow_ups
-- Necessário para useAIAlerts.ts (hook de notificações em tempo real)
-- ══════════════════════════════════════════════════════════════

-- Adiciona follow_ups na publication do Supabase Realtime
-- (se já estiver, o DO block ignora silenciosamente)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND tablename = 'follow_ups'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE follow_ups;
        RAISE NOTICE 'follow_ups adicionada ao supabase_realtime';
    ELSE
        RAISE NOTICE 'follow_ups já está no supabase_realtime — nenhuma ação necessária';
    END IF;
END $$;


-- ══════════════════════════════════════════════════════════════
-- 2. ÍNDICES DE PERFORMANCE — Queries novas (P3, P5, P8)
-- ══════════════════════════════════════════════════════════════

-- P5: métricas IA — filtra type + created_at (últimos 7 dias)
CREATE INDEX IF NOT EXISTS idx_followups_type_created
    ON follow_ups(type, created_at DESC);

-- P3: alertas admin_overload — filtra user_id='admin' + type + status
CREATE INDEX IF NOT EXISTS idx_followups_admin_alerts
    ON follow_ups(user_id, type, status)
    WHERE user_id = 'admin';

-- P1 / useAIAlerts: filtra user_id + status + type para badge de notificação
-- (reforça o índice existente idx_followups_user com cobertura de type)
CREATE INDEX IF NOT EXISTS idx_followups_user_type_status
    ON follow_ups(user_id, type, status)
    WHERE status = 'pending';


-- ══════════════════════════════════════════════════════════════
-- 3. consultants_manos_crm — garantir coluna is_active
-- Usada pela nova rota GET /api/extension/consultants
-- ══════════════════════════════════════════════════════════════

ALTER TABLE consultants_manos_crm
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Índice para o filtro is_active=true (listagem de consultores ativos)
CREATE INDEX IF NOT EXISTS idx_consultants_active
    ON consultants_manos_crm(is_active) WHERE is_active = true;


-- ══════════════════════════════════════════════════════════════
-- 4. PREPARAÇÃO PARA P4 — Busca Semântica (pgvector)
-- !! Execute SOMENTE após habilitar a extensão vector no painel:
-- !!   Supabase Dashboard → Database → Extensions → vector → Enable
-- !! Deixe comentado até lá.
-- ══════════════════════════════════════════════════════════════

-- CREATE EXTENSION IF NOT EXISTS vector;
--
-- ALTER TABLE leads_manos_crm
--     ADD COLUMN IF NOT EXISTS embedding vector(1536);
--
-- -- Índice IVFFlat para busca por similaridade cosseno
-- -- Ajuste `lists` conforme o volume: ~sqrt(nrows) é uma boa heurística
-- CREATE INDEX IF NOT EXISTS idx_leads_embedding
--     ON leads_manos_crm USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);


-- ══════════════════════════════════════════════════════════════
-- 5. VERIFICAÇÃO FINAL
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_realtime   BOOLEAN;
    v_idx_count  INTEGER;
    v_is_active  BOOLEAN;
BEGIN
    -- Realtime
    SELECT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'follow_ups'
    ) INTO v_realtime;
    RAISE NOTICE '[Realtime] follow_ups: %', CASE WHEN v_realtime THEN 'ATIVO ✓' ELSE 'INATIVO ✗' END;

    -- Índices novos
    SELECT COUNT(*) INTO v_idx_count
    FROM pg_indexes
    WHERE tablename = 'follow_ups'
      AND indexname IN (
          'idx_followups_type_created',
          'idx_followups_admin_alerts',
          'idx_followups_user_type_status'
      );
    RAISE NOTICE '[Índices] follow_ups novos: % de 3 criados', v_idx_count;

    -- is_active em consultants_manos_crm
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'consultants_manos_crm' AND column_name = 'is_active'
    ) INTO v_is_active;
    RAISE NOTICE '[Coluna] consultants_manos_crm.is_active: %', CASE WHEN v_is_active THEN 'EXISTE ✓' ELSE 'FALTANDO ✗' END;
END $$;
