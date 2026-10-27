-- Migração: Auditoria de Exclusão de Lançamentos e Contas a Pagar / Receber

ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS data_vencimento date,
  ADD COLUMN IF NOT EXISTS data_pagamento date,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS motivo_exclusao text DEFAULT NULL;

-- Atualizar registros existentes onde data_vencimento é nulo
UPDATE public.fin_lancamentos
SET data_vencimento = data
WHERE data_vencimento IS NULL;

-- Tabela de auditoria para exclusões e ações sensíveis
CREATE TABLE IF NOT EXISTS public.fin_lancamentos_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lancamento_id uuid NOT NULL,
    acao text NOT NULL, -- 'exclusao' | 'restauracao' | 'baixa'
    executado_por text NOT NULL,
    owner_email text NOT NULL,
    motivo text NOT NULL,
    dados_snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_lancamentos_audit_owner_idx ON public.fin_lancamentos_audit (owner_email, created_at DESC);
CREATE INDEX IF NOT EXISTS fin_lancamentos_deleted_idx ON public.fin_lancamentos (owner_email, deleted_at);

ALTER TABLE public.fin_lancamentos_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_lancamentos_audit_all ON public.fin_lancamentos_audit;
CREATE POLICY fin_lancamentos_audit_all ON public.fin_lancamentos_audit FOR ALL USING (true) WITH CHECK (true);
