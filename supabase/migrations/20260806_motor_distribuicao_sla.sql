-- =====================================================================
-- Motor de Distribuição Round-Robin + SLA 10min
-- Data: 2026-08-06
--
-- Substitui a "pesca" (fila geral) por distribuição 1-para-1 com dono e relógio.
-- Lead vai pro próximo vendedor DISPONÍVEL (check-in do dia); 10min de horário
-- COMERCIAL pra ele iniciar o atendimento, senão repassa e loga o evento.
-- Fora do horário → standby; despejo na abertura; SLA pausa no fechamento.
-- =====================================================================

-- 1) Estado de distribuição por lead (lateral — não mexe nas 3 tabelas de lead)
CREATE TABLE IF NOT EXISTS public.lead_distribuicao (
    lead_uid                TEXT PRIMARY KEY,          -- "<tabela>:<id>"
    table_name              TEXT NOT NULL,
    native_id               TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'standby'
                              CHECK (status IN ('standby','aguardando','distribuido','atendido','esgotado')),
    assigned_consultant_id  UUID,                      -- dono atual (na roleta)
    distribuido_em          TIMESTAMPTZ,               -- início do SLA do dono atual
    atendido_em             TIMESTAMPTZ,
    ciclos                  INT  NOT NULL DEFAULT 0,    -- nº de repasses por SLA
    tentados                UUID[] NOT NULL DEFAULT '{}', -- vendedores já tentados neste giro
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leaddist_status    ON public.lead_distribuicao(status);
CREATE INDEX IF NOT EXISTS idx_leaddist_pendentes ON public.lead_distribuicao(status, distribuido_em)
    WHERE status IN ('distribuido','aguardando','standby');
CREATE INDEX IF NOT EXISTS idx_leaddist_dono      ON public.lead_distribuicao(assigned_consultant_id, status);

-- 2) Check-in diário do vendedor (disponível hoje = disponivel_em = hoje no fuso SP)
ALTER TABLE public.consultants_manos_crm
    ADD COLUMN IF NOT EXISTS disponivel_em DATE;

-- 3) Feriados (admin popula; domingo é pulado no código)
CREATE TABLE IF NOT EXISTS public.feriados (
    dia         DATE PRIMARY KEY,
    descricao   TEXT
);

-- 4) Horário comercial editável (Seg–Sex 08–18, Sáb 08–12, fuso SP)
INSERT INTO public.system_settings (id, value)
VALUES ('store_hours', '{"seg_sex":[8,18],"sab":[8,12],"tz":"America/Sao_Paulo"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- RLS: só admin + service_role (o app lê via rotas server-side)
-- ---------------------------------------------------------------------
ALTER TABLE public.lead_distribuicao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leaddist admin"        ON public.lead_distribuicao;
DROP POLICY IF EXISTS "leaddist service_role" ON public.lead_distribuicao;
CREATE POLICY "leaddist admin" ON public.lead_distribuicao FOR ALL
    USING (public.is_crm_admin()) WITH CHECK (public.is_crm_admin());
CREATE POLICY "leaddist service_role" ON public.lead_distribuicao FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role') WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feriados admin"        ON public.feriados;
DROP POLICY IF EXISTS "feriados service_role" ON public.feriados;
DROP POLICY IF EXISTS "feriados read auth"    ON public.feriados;
CREATE POLICY "feriados admin" ON public.feriados FOR ALL
    USING (public.is_crm_admin()) WITH CHECK (public.is_crm_admin());
CREATE POLICY "feriados service_role" ON public.feriados FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role') WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
-- leitura por qualquer logado (calendário não é sensível)
CREATE POLICY "feriados read auth" ON public.feriados FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------
-- 5) Agenda o tick do motor no pg_cron (1/min) — 100% automático, sem serviço
--    externo. Reusa public.call_cron_endpoint (mesmo padrão dos outros crons;
--    ela injeta base_url + CRON_SECRET a partir da tabela cron_config).
--    Inofensivo antes do deploy (o endpoint só 404 até subir o código).
-- ---------------------------------------------------------------------
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'distribuicao') THEN
        PERFORM cron.unschedule('distribuicao');
    END IF;
    PERFORM cron.schedule('distribuicao', '* * * * *',
        $cmd$ SELECT public.call_cron_endpoint('/api/cron/distribuicao') $cmd$);
END
$do$;
