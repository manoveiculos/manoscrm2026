-- =====================================================================
-- RG Scooters — Caixa completo (app do Renato)
-- Data: 2026-08-05
--
-- O caixa passa a ser um SALDO ACUMULADO que bate com a conta bancária, em vez
-- de um "resultado do mês" que zerava ao virar o mês. Para isso:
--   - saldo_inicial: abertura do caixa. O Renato digita "quanto tem no banco
--     hoje" e o app calcula esse valor pra bater (self-service reconciliation).
--   - meta_loja: a meta grande (loja física) que o app usa como objetivo/mentor.
--
-- Aditivo e isolado — só a tabela de config do RG Scooters. Idempotente.
-- =====================================================================

ALTER TABLE public.scooters_config
    ADD COLUMN IF NOT EXISTS saldo_inicial numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS meta_loja     numeric NOT NULL DEFAULT 50000;
