-- =====================================================================
-- CORREÇÃO URGENTE do trg_registrar_venda (aplicado em 15/10/2026)
--
-- sales_manos_crm.profit_margin é NOT NULL sem default. O gatilho inseria a
-- venda sem esse campo: o INSERT falhava e, sem tratamento de erro, derrubava
-- o UPDATE de status → ninguém conseguia marcar "vendido".
--
-- 1. Default 0 na coluna (cobre o gatilho e qualquer insert do app).
-- 2. Gatilho grava profit_margin = 0 explicitamente e, se o registro da venda
--    falhar por qualquer motivo, só avisa (WARNING) — NUNCA bloqueia a venda.
-- =====================================================================

ALTER TABLE public.sales_manos_crm ALTER COLUMN profit_margin SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fn_registrar_venda_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_row       JSONB := to_jsonb(NEW);
    v_lead_id   TEXT  := NEW.id::text;
    v_cons_nome TEXT;
BEGIN
    BEGIN
        IF EXISTS (SELECT 1 FROM public.sales_manos_crm WHERE lead_id = v_lead_id) THEN
            RETURN NEW;
        END IF;

        SELECT name INTO v_cons_nome
          FROM public.consultants_manos_crm
         WHERE id = NEW.assigned_consultant_id;

        INSERT INTO public.sales_manos_crm
            (lead_id, consultant_id, consultant_name, sale_value, profit_margin, sale_date, created_at,
             vehicle_name, client_name, phone)
        VALUES (
            v_lead_id,
            NEW.assigned_consultant_id,
            COALESCE(v_cons_nome, 'Equipe'),
            0,
            0,
            NOW(),
            NOW(),
            COALESCE(NULLIF(v_row->>'vehicle_interest', ''), NULLIF(v_row->>'interesse', ''), 'Veículo não informado'),
            COALESCE(v_row->>'nome', v_row->>'name'),
            COALESCE(v_row->>'telefone', v_row->>'phone')
        );
    EXCEPTION WHEN OTHERS THEN
        -- Registro de venda é rede de proteção: falhar aqui não pode impedir a venda.
        RAISE WARNING '[trg_registrar_venda] % : não registrou venda do lead % (%)', TG_TABLE_NAME, v_lead_id, SQLERRM;
    END;
    RETURN NEW;
END;
$function$;
