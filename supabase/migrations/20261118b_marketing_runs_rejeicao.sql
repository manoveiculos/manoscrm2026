-- Reprovação humana passa a ter campos próprios.
-- Antes, o botão "reprovar" do /admin/marketing gravava approved_by/approved_at,
-- e uma pauta reprovada parecia aprovada para quem lia só esses campos.
-- Linhas antigas ficam como estão: não dá para saber com segurança se a
-- reprovação veio do botão ou de uma rotina (Diretor de Arte/Publisher).
alter table public.marketing_agent_runs
    add column if not exists rejected_by text,
    add column if not exists rejected_at timestamptz;

comment on column public.marketing_agent_runs.rejected_by is 'Quem reprovou pelo CRM (e-mail da sessão). Aprovação continua em approved_by.';
comment on column public.marketing_agent_runs.rejected_at is 'Quando foi reprovado pelo CRM.';
