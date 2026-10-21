-- =====================================================================
-- LEADS WHATSAPP DIRETO (leads de formulário que caem no WhatsApp do vendedor)
-- Acesso: alexandre_gorges@hotmail.com, dultra49@gmail.com (+ service_role)
-- =====================================================================

create table if not exists public.leads_whatsapp_direto_wilsol (
    id              uuid primary key default gen_random_uuid(),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    -- Dados vindos do payload
    nome            text,
    telefone_lead   text not null,
    cidade          text,
    tem_troca       text,               -- ex: sim,_quero_avaliar_meu_carro
    qual_troca      text,               -- ex: Amarok 2024 v6 28 mil km
    pagamento       text,               -- ex: financiamento_com_entrada
    veiculo_interesse text,             -- extraído de "NOVO LEAD - HAVAL H6 GT"
    mensagem_texto  text,
    link_whatsapp   text,
    vendedor_telefone text,             -- extraído do phone= do linkWhatsApp
    origem          text default 'anuncio_formulario',
    payload_raw     jsonb,              -- payload original completo

    -- Acompanhamento
    vendedor_nome   text,
    status          text not null default 'novo'
                    check (status in ('novo','em_atendimento','agendado','visitou',
                                      'proposta','vendido','perdido','sem_resposta')),
    motivo_perda    text,
    observacoes     text,
    proximo_contato timestamptz,
    valor_venda     numeric(12,2),
    atualizado_por  text
);

create index if not exists idx_lwd_created   on public.leads_whatsapp_direto_wilsol (created_at desc);
create index if not exists idx_lwd_status    on public.leads_whatsapp_direto_wilsol (status);
create index if not exists idx_lwd_telefone  on public.leads_whatsapp_direto_wilsol (telefone_lead);
create index if not exists idx_lwd_vendedor  on public.leads_whatsapp_direto_wilsol (vendedor_telefone);

-- updated_at automático
create or replace function public.lwd_set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end $$;

drop trigger if exists trg_lwd_updated on public.leads_whatsapp_direto_wilsol;
create trigger trg_lwd_updated before update on public.leads_whatsapp_direto_wilsol
for each row execute function public.lwd_set_updated_at();

-- Extrai veículo e telefone do vendedor automaticamente no INSERT
create or replace function public.lwd_enrich()
returns trigger language plpgsql as $$
begin
    if new.veiculo_interesse is null and new.mensagem_texto is not null then
        new.veiculo_interesse := nullif(trim(substring(new.mensagem_texto from 'NOVO LEAD - ([^*]+)\*')), '');
    end if;
    if new.vendedor_telefone is null and new.link_whatsapp is not null then
        new.vendedor_telefone := substring(new.link_whatsapp from 'phone=([0-9]+)');
    end if;
    return new;
end $$;

drop trigger if exists trg_lwd_enrich on public.leads_whatsapp_direto_wilsol;
create trigger trg_lwd_enrich before insert on public.leads_whatsapp_direto_wilsol
for each row execute function public.lwd_enrich();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.leads_whatsapp_direto_wilsol enable row level security;

drop policy if exists lwd_acesso_restrito on public.leads_whatsapp_direto_wilsol;
drop policy if exists lwd_select on public.leads_whatsapp_direto_wilsol;
drop policy if exists lwd_insert on public.leads_whatsapp_direto_wilsol;
drop policy if exists lwd_update on public.leads_whatsapp_direto_wilsol;
drop policy if exists lwd_delete_admin on public.leads_whatsapp_direto_wilsol;

create policy lwd_select on public.leads_whatsapp_direto_wilsol for select to authenticated
using (lower(auth.jwt() ->> 'email') in ('alexandre_gorges@hotmail.com','dultra49@gmail.com'));

create policy lwd_insert on public.leads_whatsapp_direto_wilsol for insert to authenticated
with check (lower(auth.jwt() ->> 'email') in ('alexandre_gorges@hotmail.com','dultra49@gmail.com'));

create policy lwd_update on public.leads_whatsapp_direto_wilsol for update to authenticated
using (lower(auth.jwt() ->> 'email') in ('alexandre_gorges@hotmail.com','dultra49@gmail.com'))
with check (lower(auth.jwt() ->> 'email') in ('alexandre_gorges@hotmail.com','dultra49@gmail.com'));

-- Apagar: somente admin
create policy lwd_delete_admin on public.leads_whatsapp_direto_wilsol for delete to authenticated
using (lower(auth.jwt() ->> 'email') = 'alexandre_gorges@hotmail.com');

-- =====================================================================
-- RPC de ingestão (para n8n/Make/webhook). Aceita objeto OU array.
-- Chamar com service_role:  POST /rest/v1/rpc/ingest_leads_whatsapp_direto_wilsol
-- body: { "payload": [ { "nome": "...", "telefoneLead": "...", ... } ] }
-- =====================================================================
create or replace function public.ingest_leads_whatsapp_direto_wilsol(payload jsonb)
returns setof public.leads_whatsapp_direto_wilsol
language plpgsql security definer set search_path = public as $$
declare
    item jsonb;
    arr  jsonb := case when jsonb_typeof(payload) = 'array' then payload else jsonb_build_array(payload) end;
begin
    for item in select * from jsonb_array_elements(arr) loop
        return query
        insert into public.leads_whatsapp_direto_wilsol
            (nome, telefone_lead, cidade, tem_troca, qual_troca, pagamento,
             mensagem_texto, link_whatsapp, payload_raw)
        values
            (item->>'nome', item->>'telefoneLead', item->>'cidade', item->>'temTroca',
             item->>'qualTroca', item->>'pagamento', item->>'mensagemTexto',
             item->>'linkWhatsApp', item)
        returning *;
    end loop;
end $$;

revoke all on function public.ingest_leads_whatsapp_direto_wilsol(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_leads_whatsapp_direto_wilsol(jsonb) to service_role;
