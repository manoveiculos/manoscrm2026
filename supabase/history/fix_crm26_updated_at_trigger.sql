-- ===========================================================================
-- FIX: Erro "record NEW has no field updated_at" no n8n
-- Causa: Trigger automático na tabela leads_distribuicao_crm_26 tenta setar
--        NEW.updated_at, mas a coluna nessa tabela é atualizado_em (PT-BR).
-- Solução: Adicionar coluna updated_at que o trigger espera.
-- ===========================================================================

-- Adiciona a coluna que o trigger espera
ALTER TABLE public.leads_distribuicao_crm_26
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Sincroniza valores existentes com atualizado_em
UPDATE public.leads_distribuicao_crm_26
SET updated_at = COALESCE(atualizado_em, criado_em, NOW())
WHERE updated_at IS NULL;

-- Confirma
DO $$
BEGIN
  RAISE NOTICE 'Fix aplicado: coluna updated_at adicionada em leads_distribuicao_crm_26';
END $$;
