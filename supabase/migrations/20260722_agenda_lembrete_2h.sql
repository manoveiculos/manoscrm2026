-- Lembrete extra de 2h antes da visita ("pra não ter perigo de esquecer").
-- Flag de idempotência, mesmo padrão dos outros dois lembretes.
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS lembrete_2h_enviado_em TIMESTAMPTZ;
