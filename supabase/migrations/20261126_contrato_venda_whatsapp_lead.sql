-- =====================================================================
-- Contrato de venda → lead do CRM, pelo WhatsApp do comprador
-- Data: 2026-11-21  ·  APLICADA em produção em 2026-11-23, com o "aprovado" do
-- Alexandre, depois de um ensaio desfeito (lead real → vendido, venda com o
-- valor do contrato, Purchase na fila com 2h de espera; WhatsApp sem lead →
-- contrato grava e nada mais acontece).
--
-- Problema (21/11): a Meta e o Google não sabem quais anúncios viram venda.
--   - Nenhum lead do crm26 foi marcado "vendido" desde 14/10; a última linha
--     em sales_manos_crm é de 11/07. Sem venda ligada a lead, a fila
--     meta_capi_queue nunca recebe Purchase (zero na história).
--   - As vendas de verdade estão em contratos_venda (Divisão de Lucro), mas o
--     contrato não tem telefone: só 1 de 7 contratos casa com um lead pelo nome.
--
-- O que esta migration faz:
--   1. contratos_venda.comprador_whatsapp (opcional) — preenchido no formulário
--      do contrato de venda.
--   2. sales_manos_crm.contrato_venda_id — qual contrato gerou ou completou a
--      linha da venda (auditoria e idempotência).
--   3. fn_vincular_venda_ao_lead(contrato): acha o lead mais recente com esse
--      telefone (fn_phone_key, a mesma chave da fila da Meta; crm26 antes do
--      master), marca 'vendido' e grava a venda com o valor do contrato.
--      Os gatilhos que já existem fazem o resto:
--        crm26  → trg_registrar_venda (linha em sales_manos_crm) e
--                 trg_meta_capi_funil (Purchase na fila, 2h de espera pelo valor)
--        master → trg_meta_capi_funil
--      A fila é a mesma que o envio ao Google lê (google_conv_envios).
--   4. Gatilho AFTER INSERT / UPDATE OF comprador_whatsapp em contratos_venda.
--      Erro vira WARNING: ligar ao lead nunca derruba o contrato.
--
-- Não faz UPDATE em contratos_venda: o societario_filhos_guard zera as
-- aprovações dos sócios a cada alteração no contrato.
--
-- Limites conhecidos:
--   - Lead com o mesmo telefone em mais de uma pessoa (ex.: telefone da
--     família): liga ao lead mais recente.
--   - Trocar o WhatsApp de um contrato já ligado não religa (o primeiro vínculo
--     fica). Para corrigir: apagar o contrato_venda_id da linha da venda e
--     regravar o WhatsApp.
--
-- REVERSÃO:
--   drop trigger if exists trg_vincular_venda_ao_lead on public.contratos_venda;
--   drop function if exists public.trg_vincular_venda_ao_lead();
--   drop function if exists public.fn_vincular_venda_ao_lead(uuid);
--   drop index if exists public.uq_sales_contrato_venda;
--   alter table public.sales_manos_crm drop column if exists contrato_venda_id;
--   alter table public.contratos_venda drop column if exists comprador_whatsapp;
--   Leads marcados 'vendido' por aqui (antes de apagar a coluna):
--     select lead_id, contrato_venda_id from public.sales_manos_crm where contrato_venda_id is not null;
-- =====================================================================

SET lock_timeout = '5s';

ALTER TABLE public.contratos_venda
    ADD COLUMN IF NOT EXISTS comprador_whatsapp text;

ALTER TABLE public.sales_manos_crm
    ADD COLUMN IF NOT EXISTS contrato_venda_id uuid
        REFERENCES public.contratos_venda(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_contrato_venda
    ON public.sales_manos_crm (contrato_venda_id)
    WHERE contrato_venda_id IS NOT NULL;

COMMENT ON COLUMN public.contratos_venda.comprador_whatsapp IS
    'WhatsApp do comprador. Liga a venda ao lead do CRM (fn_vincular_venda_ao_lead) para a Meta e o Google saberem qual anúncio vendeu.';
COMMENT ON COLUMN public.sales_manos_crm.contrato_venda_id IS
    'Contrato de venda que gerou ou completou esta linha (fn_vincular_venda_ao_lead).';


CREATE OR REPLACE FUNCTION public.fn_vincular_venda_ao_lead(p_contrato_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c           public.contratos_venda%ROWTYPE;
    v_key       text;
    v_tabela    text;
    v_lead      text;
    v_nome      text;
    v_tel       text;
    v_status    text;
    v_cons      uuid;
    v_cons_nome text;
    v_veiculo   text;
    v_venda     uuid;
BEGIN
    SELECT * INTO c FROM public.contratos_venda WHERE id = p_contrato_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('vinculado', false, 'motivo', 'contrato não encontrado');
    END IF;

    v_key := public.fn_phone_key(c.comprador_whatsapp);
    IF v_key IS NULL THEN
        RETURN jsonb_build_object('vinculado', false, 'motivo', 'sem WhatsApp do comprador');
    END IF;

    -- Já ligado (o gatilho rodou de novo, ou o WhatsApp foi regravado).
    SELECT s.lead_id INTO v_lead FROM public.sales_manos_crm s WHERE s.contrato_venda_id = c.id;
    IF FOUND THEN
        RETURN jsonb_build_object('vinculado', true, 'lead_id', v_lead, 'motivo', 'já estava ligado');
    END IF;

    -- 1. O lead: o mais recente com esse telefone. crm26 (onde estão os leads
    --    ativos) antes do master.
    SELECT d.id::text, d.nome, d.telefone, d.status, d.assigned_consultant_id
      INTO v_lead, v_nome, v_tel, v_status, v_cons
      FROM public.leads_distribuicao_crm_26 d
     WHERE public.fn_phone_key(d.telefone) = v_key
     ORDER BY d.created_at DESC NULLS LAST
     LIMIT 1;
    IF FOUND THEN
        v_tabela := 'leads_distribuicao_crm_26';
    ELSE
        SELECT m.id::text, m.name, m.phone, m.status, m.assigned_consultant_id
          INTO v_lead, v_nome, v_tel, v_status, v_cons
          FROM public.leads_master m
         WHERE public.fn_phone_key(m.phone) = v_key
         ORDER BY m.created_at DESC NULLS LAST
         LIMIT 1;
        IF FOUND THEN
            v_tabela := 'leads_master';
        END IF;
    END IF;

    IF v_tabela IS NULL THEN
        RETURN jsonb_build_object('vinculado', false, 'motivo', 'nenhum lead com esse WhatsApp');
    END IF;

    -- 2. Lead vendido. Os gatilhos de status cuidam da linha da venda (crm26)
    --    e do Purchase na fila da Meta/Google.
    IF lower(coalesce(v_status, '')) NOT IN ('vendido', 'closed') THEN
        IF v_tabela = 'leads_distribuicao_crm_26' THEN
            UPDATE public.leads_distribuicao_crm_26
               SET status = 'vendido', atualizado_em = now()
             WHERE id = v_lead::integer;
        ELSE
            UPDATE public.leads_master
               SET status = 'vendido', updated_at = now()
             WHERE id = v_lead::uuid;
        END IF;
    END IF;

    -- 3. A venda com o valor do contrato. Completa a linha recém-criada pelo
    --    status (ou a que o vendedor marcou no Kanban nos últimos 60 dias, ainda
    --    sem contrato); senão cria uma. O valor do contrato vale mais que o
    --    digitado no Kanban.
    SELECT nullif(btrim(concat_ws(' ', v.marca, v.modelo, v.ano_modelo::text)
                        || coalesce(' · ' || nullif(v.placa, ''), '')), '')
      INTO v_veiculo
      FROM public.veiculos v
     WHERE v.id = c.veiculo_id;

    SELECT s.id INTO v_venda
      FROM public.sales_manos_crm s
     WHERE s.lead_id = v_lead
       AND s.contrato_venda_id IS NULL
       AND coalesce(s.sale_date, s.created_at) > now() - interval '60 days'
     ORDER BY s.created_at DESC
     LIMIT 1;

    IF v_venda IS NOT NULL THEN
        UPDATE public.sales_manos_crm s
           SET contrato_venda_id = c.id,
               sale_value        = c.valor_venda_fechado,
               vehicle_name      = coalesce(v_veiculo, s.vehicle_name),
               client_name       = coalesce(s.client_name, v_nome),
               phone             = coalesce(s.phone, v_tel)
         WHERE s.id = v_venda;
    ELSE
        SELECT name INTO v_cons_nome FROM public.consultants_manos_crm WHERE id = v_cons;
        INSERT INTO public.sales_manos_crm
            (lead_id, consultant_id, consultant_name, sale_value, profit_margin, sale_date, created_at,
             vehicle_name, client_name, phone, contrato_venda_id)
        VALUES (
            v_lead, v_cons, coalesce(v_cons_nome, nullif(btrim(c.vendedor_responsavel), ''), 'Equipe'),
            c.valor_venda_fechado, 0, coalesce(c.data_contrato::timestamptz, now()), now(),
            coalesce(v_veiculo, 'Veículo não informado'), coalesce(v_nome, c.comprador_nome), v_tel, c.id
        )
        RETURNING id INTO v_venda;
    END IF;

    RETURN jsonb_build_object(
        'vinculado', true,
        'lead_table', v_tabela,
        'lead_id', v_lead,
        'nome', v_nome,
        'status_anterior', v_status,
        'venda_id', v_venda
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_vincular_venda_ao_lead(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_vincular_venda_ao_lead(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.trg_vincular_venda_ao_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.fn_phone_key(NEW.comprador_whatsapp) IS NULL THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE'
       AND public.fn_phone_key(OLD.comprador_whatsapp) IS NOT DISTINCT FROM public.fn_phone_key(NEW.comprador_whatsapp) THEN
        RETURN NULL;
    END IF;
    BEGIN
        PERFORM public.fn_vincular_venda_ao_lead(NEW.id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[venda→lead] contrato %: %', NEW.id, SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_vincular_venda_ao_lead ON public.contratos_venda;
CREATE TRIGGER trg_vincular_venda_ao_lead
    AFTER INSERT OR UPDATE OF comprador_whatsapp ON public.contratos_venda
    FOR EACH ROW EXECUTE FUNCTION public.trg_vincular_venda_ao_lead();
