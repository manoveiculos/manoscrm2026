-- Migration: Adicionar coluna meta_content_id nas tabelas de leads do CRM
-- Data: 2026-09-19
-- Descrição: Permite vincular explicitamente o retailer_id do catálogo da Meta (feed Altimus) ao lead,
-- garantindo match exato nos eventos de conversão (Purchase/ViewContent/AddToCart).

ALTER TABLE public.leads_manos_crm ADD COLUMN IF NOT EXISTS meta_content_id TEXT;
ALTER TABLE public.leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS meta_content_id TEXT;
ALTER TABLE public.leads_master ADD COLUMN IF NOT EXISTS meta_content_id TEXT;
ALTER TABLE public.leads_compra ADD COLUMN IF NOT EXISTS meta_content_id TEXT;
ALTER TABLE public.leadsfacebook ADD COLUMN IF NOT EXISTS meta_content_id TEXT;

COMMENT ON COLUMN public.leads_manos_crm.meta_content_id IS 'ID do veículo no catálogo Meta/Altimus (retailer_id)';
COMMENT ON COLUMN public.leads_distribuicao_crm_26.meta_content_id IS 'ID do veículo no catálogo Meta/Altimus (retailer_id)';
COMMENT ON COLUMN public.leads_master.meta_content_id IS 'ID do veículo no catálogo Meta/Altimus (retailer_id)';
COMMENT ON COLUMN public.leads_compra.meta_content_id IS 'ID do veículo no catálogo Meta/Altimus (retailer_id)';
COMMENT ON COLUMN public.leadsfacebook.meta_content_id IS 'ID do veículo no catálogo Meta/Altimus (retailer_id)';
