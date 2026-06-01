-- Migração para adicionar o campo criado_por na tabela de alertas_clientes
-- Permite rastrear qual consultor/vendedor criou o alerta de monitoramento.

ALTER TABLE public.alertas_clientes ADD COLUMN IF NOT EXISTS criado_por TEXT;

-- Índice para acelerar a busca e filtragem por criador do alerta
CREATE INDEX IF NOT EXISTS idx_alertas_clientes_criado_por ON public.alertas_clientes(criado_por);
