-- ===========================================================================
-- FILA DE ESPERA: lead novo fica sem dono, todos os consultores são avisados e só UM atende
-- Data: 2026-11-13   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- Problema (13/11/2026): o motor entrega o lead a um consultor por rodízio e, se ele não clica em
-- "Iniciar atendimento" em 10 min, passa para o próximo (escalada de SLA). O lead gira entre
-- consultores e mais de um acaba chamando o mesmo cliente. O aviso de lead novo também não saía.
--
-- Novo modelo (chave wa_ia_config.distribuicao = 'fila', padrão 'rodizio' = nada muda):
--   * lead novo (ou solto pela triagem da Laura) entra em lead_distribuicao com status 'fila_espera',
--     SEM dono, e aparece em "Pegar leads" para todos;
--   * todos os consultores disponíveis recebem o aviso "lead na fila de espera";
--   * o primeiro que clica em "Iniciar atendimento" leva (a trava atômica já existe em /api/lead/start-atendimento);
--   * o motor para de passar o lead de consultor em consultor: sem dono por 10 min vira lembrete a todos,
--     sem dono por 20 min vira alerta ao Alexandre.
--
--   lead_distribuicao.status        ganha 'fila_espera'
--   lead_distribuicao.fila_avisada_em / fila_lembrete_em / fila_escalou_em   controle dos avisos
--   wa_ia_config.distribuicao       'rodizio' (padrão) | 'fila'
--
-- Esta migration NÃO muda o comportamento hoje: a chave nasce 'rodizio'.
-- Risco: baixo. Um CHECK ampliado, colunas novas vazias, um gatilho com o mesmo corpo + um desvio com a chave ligada.
--
-- REVERSÃO:
--   update public.wa_ia_config set distribuicao='rodizio' where id=1;
--   update public.lead_distribuicao set status='aguardando' where status='fila_espera';
--   (recriar fn_enqueue_lead_distribuicao como em 20261114_triagem_whatsapp_custos.sql)
--   alter table public.lead_distribuicao drop constraint lead_distribuicao_status_check, add constraint
--     lead_distribuicao_status_check check (status in ('standby','aguardando','distribuido','atendido','esgotado','manual','triagem_laura'));
--   alter table public.lead_distribuicao drop column fila_avisada_em, drop column fila_lembrete_em, drop column fila_escalou_em;
--   alter table public.wa_ia_config drop column distribuicao;
-- ===========================================================================

SET lock_timeout = '5s';

ALTER TABLE public.wa_ia_config
    ADD COLUMN IF NOT EXISTS distribuicao text NOT NULL DEFAULT 'rodizio'
        CHECK (distribuicao IN ('rodizio', 'fila'));

ALTER TABLE public.lead_distribuicao
    ADD COLUMN IF NOT EXISTS fila_avisada_em  timestamptz,
    ADD COLUMN IF NOT EXISTS fila_lembrete_em timestamptz,
    ADD COLUMN IF NOT EXISTS fila_escalou_em  timestamptz;

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
        CHECK (status = ANY (ARRAY['standby','aguardando','distribuido','atendido','esgotado','manual','triagem_laura','fila_espera']));
END $$;

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
    v_fila BOOLEAN := FALSE;
    v_origem TEXT := lower(COALESCE(NEW.origem, ''));
BEGIN
    IF COALESCE(NEW.descarte_financeiro, FALSE) THEN RETURN NEW; END IF;
    IF NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.atendimento_iniciado_em IS NOT NULL THEN RETURN NEW; END IF;
    IF lower(COALESCE(NEW.status, '')) IN
        ('vendido','perdido','comprado','finalizado','lost','lost_by_inactivity','frio')
    THEN RETURN NEW; END IF;

    IF NOT v_tem_dono AND TG_TABLE_NAME = 'leads_distribuicao_crm_26' THEN
        BEGIN
            -- triagem da Laura (Google e WhatsApp)
            IF v_origem = 'google' THEN
                SELECT COALESCE(triagem_google, FALSE) INTO v_triagem FROM public.wa_ia_config WHERE id = 1;
            ELSIF v_origem = 'whatsapp' THEN
                SELECT COALESCE(triagem_whatsapp, FALSE) INTO v_triagem FROM public.wa_ia_config WHERE id = 1;
            END IF;
            -- fila de espera (sem rodízio): vale para todo lead novo sem dono
            SELECT (COALESCE(distribuicao, 'rodizio') = 'fila') INTO v_fila FROM public.wa_ia_config WHERE id = 1;
        EXCEPTION WHEN OTHERS THEN
            v_triagem := FALSE; v_fila := FALSE;   -- qualquer problema: segue o fluxo de sempre
        END;
    END IF;

    INSERT INTO public.lead_distribuicao
        (lead_uid, table_name, native_id, status, assigned_consultant_id, distribuido_em, tentados)
    VALUES (
        v_uid, TG_TABLE_NAME, NEW.id::TEXT,
        CASE WHEN v_tem_dono THEN 'distribuido'
             WHEN v_triagem THEN 'triagem_laura'
             WHEN v_fila THEN 'fila_espera'
             ELSE 'aguardando' END,
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
