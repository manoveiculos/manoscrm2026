-- ===========================================================================
-- TRIAGEM DA LAURA PARA LEADS DE ANÚNCIO (Google primeiro) — Fase 4
-- Data: 2026-11-12   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- Decisão do Alexandre (12/11/2026): todo lead de anúncio passa primeiro pela Laura. Ela chama
-- o lead no WhatsApp, qualifica, e só então ele vai para o consultor com um resumo.
--
-- Como funciona (e por que é seguro aplicar):
--   * Esta migration NÃO muda o comportamento hoje: a chave nasce DESLIGADA
--     (wa_ia_config.triagem_google = false). Com ela desligada, o gatilho de entrada na roleta
--     faz exatamente o que fazia.
--   * Ligada, lead novo de origem 'google' SEM dono entra na roleta com status 'triagem_laura'
--     (em vez de 'aguardando'). O motor da roleta ignora esse status. Quando a Laura qualifica
--     (ou passa o tempo-limite), o código muda o status para 'aguardando' e o motor distribui
--     como sempre (rodízio + SLA de 10 min).
--   * wa_triagem guarda o primeiro contato da Laura e o motivo da liberação (auditoria).
--
-- Acesso: wa_triagem só pelo servidor (service_role); RLS ligada, sem política.
-- Risco: baixo. Um CHECK ampliado, uma coluna nova com padrão false, uma tabela nova, um gatilho
-- reescrito com o mesmo corpo + um desvio que só vale com a chave ligada.
--
-- REVERSÃO:
--   (1) update public.lead_distribuicao set status='aguardando' where status='triagem_laura';
--   (2) recriar fn_enqueue_lead_distribuicao sem o desvio (corpo em 20260819_* / histórico);
--   (3) alter table public.lead_distribuicao drop constraint lead_distribuicao_status_check,
--         add constraint lead_distribuicao_status_check check (status in
--         ('standby','aguardando','distribuido','atendido','esgotado','manual'));
--   (4) drop table public.wa_triagem; alter table public.wa_ia_config drop column triagem_google;
-- ===========================================================================

SET lock_timeout = '5s';

-- 1. chave geral (desligada)
ALTER TABLE public.wa_ia_config
    ADD COLUMN IF NOT EXISTS triagem_google boolean NOT NULL DEFAULT false;

-- 2. novo status da roleta
DO $$
DECLARE v_nome text;
BEGIN
    SELECT conname INTO v_nome FROM pg_constraint
     WHERE conrelid = 'public.lead_distribuicao'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%standby%';
    IF v_nome IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.lead_distribuicao DROP CONSTRAINT %I', v_nome);
    END IF;
    ALTER TABLE public.lead_distribuicao
        ADD CONSTRAINT lead_distribuicao_status_check
        CHECK (status = ANY (ARRAY['standby','aguardando','distribuido','atendido','esgotado','manual','triagem_laura']));
END $$;

-- 3. primeiro contato e liberação
CREATE TABLE IF NOT EXISTS public.wa_triagem (
    lead_uid        text PRIMARY KEY,
    conversa_id     uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL,
    criado_em       timestamptz NOT NULL DEFAULT now(),
    contato_em      timestamptz,
    liberado_em     timestamptz,
    motivo          text,
    resumo          text
);
ALTER TABLE public.wa_triagem ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.wa_triagem IS 'Triagem da Laura em leads de anúncio: primeiro contato e motivo da liberação ao consultor. Só o servidor lê/escreve.';

-- 4. gatilho de entrada na roleta (mesmo corpo de antes + desvio com a chave ligada)
CREATE OR REPLACE FUNCTION public.fn_enqueue_lead_distribuicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid TEXT := TG_TABLE_NAME || ':' || NEW.id::TEXT;
    v_tem_dono BOOLEAN := NEW.assigned_consultant_id IS NOT NULL;
    v_triagem BOOLEAN := FALSE;
BEGIN
    -- Nasceu fechado (descarte, arquivo, já em atendimento, status final)
    -- → não é fila de ninguém.
    IF COALESCE(NEW.descarte_financeiro, FALSE) THEN RETURN NEW; END IF;
    IF NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.atendimento_iniciado_em IS NOT NULL THEN RETURN NEW; END IF;
    IF lower(COALESCE(NEW.status, '')) IN
        ('vendido','perdido','comprado','finalizado','lost','lost_by_inactivity','frio')
    THEN RETURN NEW; END IF;

    -- Triagem da Laura: lead de anúncio do Google, sem dono, e a chave ligada.
    IF NOT v_tem_dono AND TG_TABLE_NAME = 'leads_distribuicao_crm_26' AND lower(COALESCE(NEW.origem, '')) = 'google' THEN
        BEGIN
            SELECT COALESCE(triagem_google, FALSE) INTO v_triagem FROM public.wa_ia_config WHERE id = 1;
        EXCEPTION WHEN OTHERS THEN
            v_triagem := FALSE;   -- qualquer problema: segue o fluxo de sempre
        END;
    END IF;

    INSERT INTO public.lead_distribuicao
        (lead_uid, table_name, native_id, status, assigned_consultant_id, distribuido_em, tentados)
    VALUES (
        v_uid, TG_TABLE_NAME, NEW.id::TEXT,
        -- Já veio com dono (rota do app que atribuiu) → o SLA de 10min já
        -- corre pra ele. Sem dono → entra na fila e o tick distribui
        -- (ou fica com a Laura, em 'triagem_laura', se a triagem estiver ligada).
        CASE WHEN v_tem_dono THEN 'distribuido' WHEN v_triagem THEN 'triagem_laura' ELSE 'aguardando' END,
        NEW.assigned_consultant_id,
        CASE WHEN v_tem_dono THEN NOW() ELSE NULL END,
        CASE WHEN v_tem_dono THEN ARRAY[NEW.assigned_consultant_id] ELSE '{}'::UUID[] END
    )
    ON CONFLICT (lead_uid) DO NOTHING;

    IF v_triagem THEN
        INSERT INTO public.wa_triagem (lead_uid) VALUES (v_uid) ON CONFLICT (lead_uid) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$function$;
