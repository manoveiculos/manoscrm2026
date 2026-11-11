-- ===========================================================================
-- FOLLOW-UP DA LAURA: cliente que parou de responder no WhatsApp da loja
-- Data: 2026-11-11   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- Cadência decidida pelo Alexandre em 11/11/2026: toques em 1, 2, 4 e 10 dias
-- contados do último recado da loja que ficou sem resposta. Depois disso, para.
--
-- Esta tabela só REGISTRA o que a Laura mandou (ou rascunhou, no ensaio):
--   * progresso da cadência (quantos toques já saíram desde o último silêncio);
--   * teto diário de envios;
--   * auditoria (texto, custo, motivo de erro).
-- O cron /api/cron/followup-wa só age com WA_FOLLOWUP_ATIVO=true + Laura em "envia".
--
-- Acesso: leitura só gestor/admin (wa_ve_todas); escrita só o servidor (service_role).
-- Risco: baixo (só objeto novo, nenhuma tabela existente muda).
--
-- REVERSÃO:  drop table if exists public.wa_followups;
-- ===========================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.wa_followups (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id   uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
    etapa         smallint NOT NULL CHECK (etapa BETWEEN 1 AND 10),
    status        text NOT NULL CHECK (status IN ('enviado', 'rascunho', 'erro')),
    texto         text,
    motivo        text,
    custo_usd     numeric(10, 6),
    criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_followups_conversa ON public.wa_followups (conversa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_followups_dia ON public.wa_followups (criado_em) WHERE status = 'enviado';

ALTER TABLE public.wa_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_followups_leitura ON public.wa_followups;
CREATE POLICY wa_followups_leitura ON public.wa_followups
    FOR SELECT TO authenticated
    USING (public.wa_ve_todas());

COMMENT ON TABLE public.wa_followups IS 'Follow-up da Laura (cadência 1/2/4/10 dias). Escrita só pelo servidor.';

-- Agendamento (rodar DEPOIS de aplicar a tabela e de ligar WA_FOLLOWUP_ATIVO; mesmo padrão dos outros crons):
--   SELECT cron.schedule('wa-followup', '*/10 11-20 * * 1-6',
--       $cron$ SELECT public.call_cron_endpoint('/api/cron/followup-wa') $cron$);
-- (pg_cron roda em UTC: 11-20 UTC = 8h-17h em Brasília, de segunda a sábado; a Laura ainda confere o horário da loja.)
