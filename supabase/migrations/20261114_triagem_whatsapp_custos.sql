-- ===========================================================================
-- TRIAGEM TAMBÉM NO WHATSAPP + CUSTO DA IA POR AGENTE
-- Data: 2026-11-13   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- 1) Triagem do WhatsApp (pedido do Alexandre, 13/11/2026): lead que nasce de uma conversa no
--    WhatsApp também fica preso com a Laura ('triagem_laura') até ela qualificar. Hoje ele é
--    entregue a um consultor ~20 min depois de nascer, mesmo com a Laura ainda atendendo, e o
--    consultor liga no meio da conversa. A chave nasce DESLIGADA (wa_ia_config.triagem_whatsapp).
--
-- 2) ia_custos: o custo de cada chamada de IA que ainda não era registrada (triagem, analista).
--    A Laura já grava em wa_ia_execucoes e o follow-up em wa_followups; a Central dos Agentes
--    soma as três fontes para mostrar o gasto por dia, semana e mês.
--
-- Acesso: ia_custos só pelo servidor (service_role); RLS ligada, sem política (a tela passa pela API).
-- Risco: baixo. Uma coluna nova (padrão false), uma tabela nova, e o gatilho de entrada na roleta
-- com o mesmo corpo de antes + um desvio que só vale com a chave ligada.
--
-- REVERSÃO:
--   update public.lead_distribuicao set status='aguardando' where status='triagem_laura';
--   (recriar fn_enqueue_lead_distribuicao como em 20261113_triagem_laura.sql, só com 'google')
--   drop table public.ia_custos; alter table public.wa_ia_config drop column triagem_whatsapp;
-- ===========================================================================

SET lock_timeout = '5s';

ALTER TABLE public.wa_ia_config
    ADD COLUMN IF NOT EXISTS triagem_whatsapp boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ia_custos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em       timestamptz NOT NULL DEFAULT now(),
    agente          text NOT NULL,
    custo_usd       numeric(10, 6) NOT NULL CHECK (custo_usd >= 0),
    modelo          text,
    tokens_entrada  integer,
    tokens_saida    integer,
    conversa_id     uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL,
    lead_ref        text
);
CREATE INDEX IF NOT EXISTS idx_ia_custos_criado ON public.ia_custos (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_ia_custos_agente ON public.ia_custos (agente, criado_em DESC);
ALTER TABLE public.ia_custos ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ia_custos IS 'Custo (US$) de chamadas de IA por agente (triagem, analista). Laura e follow-up ficam em wa_ia_execucoes e wa_followups. Só o servidor lê/escreve.';

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
    v_origem TEXT := lower(COALESCE(NEW.origem, ''));
BEGIN
    IF COALESCE(NEW.descarte_financeiro, FALSE) THEN RETURN NEW; END IF;
    IF NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.atendimento_iniciado_em IS NOT NULL THEN RETURN NEW; END IF;
    IF lower(COALESCE(NEW.status, '')) IN
        ('vendido','perdido','comprado','finalizado','lost','lost_by_inactivity','frio')
    THEN RETURN NEW; END IF;

    -- Triagem da Laura: lead de anúncio do Google ou de conversa no WhatsApp, sem dono, chave ligada.
    IF NOT v_tem_dono AND TG_TABLE_NAME = 'leads_distribuicao_crm_26' AND v_origem IN ('google', 'whatsapp') THEN
        BEGIN
            IF v_origem = 'google' THEN
                SELECT COALESCE(triagem_google, FALSE) INTO v_triagem FROM public.wa_ia_config WHERE id = 1;
            ELSE
                SELECT COALESCE(triagem_whatsapp, FALSE) INTO v_triagem FROM public.wa_ia_config WHERE id = 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_triagem := FALSE;   -- qualquer problema: segue o fluxo de sempre
        END;
    END IF;

    INSERT INTO public.lead_distribuicao
        (lead_uid, table_name, native_id, status, assigned_consultant_id, distribuido_em, tentados)
    VALUES (
        v_uid, TG_TABLE_NAME, NEW.id::TEXT,
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
