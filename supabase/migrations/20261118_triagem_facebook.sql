-- 20261118_triagem_facebook.sql — leads do Facebook passam pela Laura antes de chegar aos consultores
--
-- Pedido do Alexandre (13/11/2026): lead do Facebook não vai para consultor; vai direto para a Laura.
-- O Facebook (Lead Ads) cai em public.leadsfacebook, que nunca teve o gatilho de entrada da roleta (quem pegava
-- era o varredor de órfãos, ~1 min depois). Aqui:
--   1) wa_ia_config.triagem_facebook  — chave NASCE DESLIGADA (rollback: false → o lead novo volta ao fluxo antigo).
--   2) gatilho em leadsfacebook       — com a chave ligada, o lead novo entra preso em 'triagem_laura' (+ wa_triagem).
--      Antes do varredor de órfãos (ON CONFLICT DO NOTHING no dele), então ele não sobrescreve.
--   3) wa_vincular_lead e find_lead_by_phone passam a conhecer leadsfacebook — sem isso a resposta do cliente à
--      Laura não ligava a conversa ao lead e o CRM criava um lead duplicado "WhatsApp".
--   4) mesmo espelho de dono nas conversas (wa_sync_vendedor_do_lead) para leadsfacebook.
--
-- Reversão: update wa_ia_config set triagem_facebook = false (o motor libera o que estiver preso);
--   drop trigger tr_enqueue_dist_facebook on public.leadsfacebook; drop trigger trg_wa_sync_vendedor on public.leadsfacebook;
--   (as duas funções recriadas aceitam a versão anterior: 20260909*/ver git).

ALTER TABLE public.wa_ia_config
    ADD COLUMN IF NOT EXISTS triagem_facebook boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.fn_enqueue_facebook_triagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid TEXT := 'leadsfacebook:' || NEW.id::TEXT;
    v_liga BOOLEAN := FALSE;
BEGIN
    -- Nunca pode travar a entrada do lead: qualquer problema aqui segue o fluxo de sempre.
    BEGIN
        IF NEW.assigned_consultant_id IS NOT NULL THEN RETURN NEW; END IF;
        IF NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;
        IF COALESCE(NEW.descarte_financeiro, FALSE) THEN RETURN NEW; END IF;
        IF NEW.atendimento_iniciado_em IS NOT NULL THEN RETURN NEW; END IF;
        IF length(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g')) < 8 THEN RETURN NEW; END IF;
        SELECT COALESCE(triagem_facebook, FALSE) INTO v_liga FROM public.wa_ia_config WHERE id = 1;
        IF NOT v_liga THEN RETURN NEW; END IF;

        INSERT INTO public.lead_distribuicao (lead_uid, table_name, native_id, status, assigned_consultant_id, distribuido_em, tentados)
        VALUES (v_uid, 'leadsfacebook', NEW.id::TEXT, 'triagem_laura', NULL, NULL, '{}'::UUID[])
        ON CONFLICT (lead_uid) DO NOTHING;
        INSERT INTO public.wa_triagem (lead_uid) VALUES (v_uid) ON CONFLICT (lead_uid) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[triagem_facebook] não segurou o lead %: %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_enqueue_dist_facebook ON public.leadsfacebook;
CREATE TRIGGER tr_enqueue_dist_facebook
    AFTER INSERT ON public.leadsfacebook
    FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_facebook_triagem();

-- dono do lead → dono da conversa (já existia para o CRM e o espelho)
DROP TRIGGER IF EXISTS trg_wa_sync_vendedor ON public.leadsfacebook;
CREATE TRIGGER trg_wa_sync_vendedor
    AFTER UPDATE OF assigned_consultant_id ON public.leadsfacebook
    FOR EACH ROW
    WHEN (OLD.assigned_consultant_id IS DISTINCT FROM NEW.assigned_consultant_id)
    EXECUTE FUNCTION public.wa_sync_vendedor_do_lead();

-- ── liga a conversa ao lead (agora também leadsfacebook) ──
CREATE OR REPLACE FUNCTION public.wa_vincular_lead(p_conversa uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_conv     public.wa_conversas%ROWTYPE;
    v_tabela   text;
    v_id       text;
    v_vendedor uuid;
    v_achou    boolean := false;
BEGIN
    SELECT * INTO v_conv FROM public.wa_conversas WHERE id = p_conversa;
    IF NOT FOUND THEN RETURN; END IF;

    IF v_conv.lead_uid IS NOT NULL THEN
        v_tabela := split_part(v_conv.lead_uid, ':', 1);
        v_id     := substr(v_conv.lead_uid, length(v_tabela) + 2);
        IF v_tabela = 'leads_distribuicao_crm_26' AND v_id ~ '^\d+$' THEN
            SELECT d.assigned_consultant_id INTO v_vendedor
              FROM public.leads_distribuicao_crm_26 d WHERE d.id = v_id::integer;
            v_achou := FOUND;
        ELSIF v_tabela = 'leadsfacebook' AND v_id ~* '^[0-9a-f-]{36}$' THEN
            SELECT f.assigned_consultant_id INTO v_vendedor
              FROM public.leadsfacebook f WHERE f.id = v_id::uuid;
            v_achou := FOUND;
        ELSIF v_tabela = 'leads_master' AND v_id ~* '^[0-9a-f-]{36}$' THEN
            SELECT m.assigned_consultant_id INTO v_vendedor
              FROM public.leads_master m WHERE m.id = v_id::uuid;
            v_achou := FOUND;
        END IF;
        IF v_achou THEN
            UPDATE public.wa_conversas SET assigned_consultant_id = v_vendedor
             WHERE id = p_conversa AND assigned_consultant_id IS DISTINCT FROM v_vendedor;
            RETURN;
        END IF;
    END IF;

    SELECT 'leads_distribuicao_crm_26', d.id::text, d.assigned_consultant_id
      INTO v_tabela, v_id, v_vendedor
      FROM public.leads_distribuicao_crm_26 d
     WHERE public.wa_telefone_key(d.telefone) = v_conv.telefone_key
     ORDER BY (d.archived_at IS NULL) DESC, d.created_at DESC NULLS LAST, d.id DESC
     LIMIT 1;

    IF NOT FOUND THEN
        SELECT 'leadsfacebook', f.id::text, f.assigned_consultant_id
          INTO v_tabela, v_id, v_vendedor
          FROM public.leadsfacebook f
         WHERE public.wa_telefone_key(f.phone) = v_conv.telefone_key
         ORDER BY (f.archived_at IS NULL) DESC, f.created_at DESC NULLS LAST
         LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        SELECT 'leads_master', m.id::text, m.assigned_consultant_id
          INTO v_tabela, v_id, v_vendedor
          FROM public.leads_master m
         WHERE public.wa_telefone_key(m.phone) = v_conv.telefone_key
         ORDER BY (m.archived_at IS NULL) DESC, m.created_at DESC NULLS LAST
         LIMIT 1;
    END IF;

    IF FOUND THEN
        UPDATE public.wa_conversas
           SET lead_uid = v_tabela || ':' || v_id,
               assigned_consultant_id = v_vendedor
         WHERE id = p_conversa;
    ELSIF v_conv.lead_uid IS NOT NULL THEN
        UPDATE public.wa_conversas SET lead_uid = NULL, assigned_consultant_id = NULL WHERE id = p_conversa;
    END IF;
END;
$function$;

-- ── varredura por telefone (usada para não duplicar lead) ──
CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_phone text)
RETURNS TABLE(uid text, table_name text, native_id text, name text, assigned_consultant_id text)
LANGUAGE plpgsql
AS $function$
BEGIN
    p_phone := regexp_replace(p_phone, '\D', '', 'g');

    RETURN QUERY
    SELECT ('dist_' || d.id::text), 'leads_distribuicao_crm_26'::text, d.id::text, d.nome::text, d.assigned_consultant_id::text
    FROM leads_distribuicao_crm_26 d
    WHERE d.telefone = p_phone OR d.telefone ILIKE '%' || RIGHT(p_phone, 8)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT ('crm26_' || m.id::text), 'leads_manos_crm'::text, m.id::text, m.name::text, m.assigned_consultant_id::text
        FROM leads_manos_crm m
        WHERE m.phone = p_phone OR m.phone ILIKE '%' || RIGHT(p_phone, 8)
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RETURN QUERY
        SELECT ('compra_' || c.id::text), 'leads_compra'::text, c.id::text, c.nome::text, c.assigned_consultant_id::text
        FROM leads_compra c
        WHERE c.telefone = p_phone OR c.telefone ILIKE '%' || RIGHT(p_phone, 8)
        LIMIT 1;
    END IF;

    -- Facebook (Lead Ads): só o que está vivo; arquivado não segura a conversa
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT ('fb_' || f.id::text), 'leadsfacebook'::text, f.id::text, f.nome::text, f.assigned_consultant_id::text
        FROM leadsfacebook f
        WHERE f.archived_at IS NULL AND (f.phone = p_phone OR f.phone ILIKE '%' || RIGHT(p_phone, 8))
        ORDER BY f.created_at DESC
        LIMIT 1;
    END IF;
END;
$function$;
