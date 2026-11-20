-- Login do Meta e do Google feito pelo botão "Conectar" do CRM (OAuth).
-- Guarda o acesso renovável de cada plataforma. Aditivo e idempotente: não mexe em nada existente.
--
-- SEGURANÇA: RLS ligada e NENHUMA policy. Só a service_role (servidor do CRM) lê e escreve.
-- Nunca abra esta tabela para anon/authenticated: ela guarda credenciais.

create table if not exists public.oauth_conexoes (
  provedor        text primary key check (provedor in ('google', 'meta')),
  refresh_token   text,                 -- Google: acesso renovável. Meta: não usado.
  access_token    text,                 -- Meta: token de longa duração (~60 dias).
  expira_em       timestamptz,          -- quando o access_token vence (null = sem data)
  escopos         text,                 -- o que o usuário autorizou
  conectado_por   text,                 -- e-mail de quem clicou em Conectar
  atualizado_em   timestamptz not null default now()
);

alter table public.oauth_conexoes enable row level security;

comment on table public.oauth_conexoes is
  'Credenciais OAuth do Meta e do Google conectadas pelo botão Conectar. Só service_role.';
