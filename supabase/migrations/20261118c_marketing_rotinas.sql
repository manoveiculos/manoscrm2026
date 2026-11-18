-- Estado de cada rotina agendada do Time de Marketing (painel /admin/marketing/conexoes).
-- Já aplicada no Supabase em 18/11/2026. Cada rotina grava aqui ao iniciar e ao terminar.
-- Só o servidor lê e escreve (RLS ligada, sem policy).
create table if not exists public.marketing_rotinas (
    id text primary key,
    nome text not null,
    squad text not null,
    funcao text,
    agenda text,
    ativo boolean not null default false,
    motivo_pausa text,
    ultimo_inicio timestamptz,
    ultimo_fim timestamptz,
    ultimo_status text check (ultimo_status in ('ok', 'erro', 'bloqueado')),
    ultimo_erro text,
    bloqueio text,
    atualizado_em timestamptz not null default now()
);
alter table public.marketing_rotinas enable row level security;
comment on table public.marketing_rotinas is 'Estado de cada rotina agendada do Time de Marketing (painel /admin/marketing/conexoes). Cada rotina grava aqui ao iniciar e ao terminar. Só o servidor lê e escreve.';
comment on column public.marketing_rotinas.bloqueio is 'Causa do bloqueio quando ultimo_status <> ok: limite_semanal | permissao | metricool | supabase | n8n | rede | cota | outro';

-- Linhas iniciais (8 rotinas, todas pausadas em 18/11/2026 para reprogramar do zero):
-- ver o INSERT aplicado no banco; ids = ids das rotinas na nuvem (trig_...).
