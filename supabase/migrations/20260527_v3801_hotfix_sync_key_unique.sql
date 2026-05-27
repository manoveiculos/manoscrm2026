-- =====================================================================
-- V3.80.1 HOTFIX — 2026-05-27
-- O UNIQUE INDEX parcial criado em 20260527_v380_inbox_perf_sync_key.sql
-- não funciona como conflict target via supabase-js / PostgREST porque a
-- biblioteca não suporta passar a cláusula WHERE no ON CONFLICT.
-- Sintoma: upsert silenciosamente falha com
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" e a rota /api/extension/sync-messages retorna success
-- sem gravar nada.
-- Fix: substituir por UNIQUE INDEX completo. NULLs continuam permitidos
-- (default Postgres: NULLs são distintos em UNIQUE).
-- =====================================================================

DROP INDEX IF EXISTS public.uq_whatsapp_messages_sync_key;

CREATE UNIQUE INDEX uq_whatsapp_messages_sync_key
    ON public.whatsapp_messages (sync_key);
