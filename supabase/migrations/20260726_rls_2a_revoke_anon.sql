-- =====================================================================
-- Fase 2a — Fechar o vazamento da anon key
-- Data: 2026-07-26
--
-- PROBLEMA (verificado em prod): as tabelas núcleo de lead JÁ têm RLS real por
-- consultor (get_my_consultant_id / is_crm_admin). MAS as views centrais
-- (leads_unified_active, unified_whatsapp_messages, leads, ...) são SECURITY
-- DEFINER (security_invoker=off, dono postgres) → FURAM o RLS. E a role `anon`
-- (chave pública que vai no browser) tem SELECT nessas views. Resultado:
-- qualquer um com a anon key lê TODO lead/telefone/conversa pela view.
--
-- FIX: os grants hoje vêm via PUBLIC (anon herda). Revoga de anon E de public, e
-- re-concede aos papéis do app:
--   - views  → SELECT para authenticated (leitura logada; a view definer segue
--              entregando os dados, mas só atrás de login).
--   - tabelas→ DML para authenticated (o RLS continua restringindo as LINHAS).
--   - tudo   → ALL para service_role (rotas server-side).
--
-- ESCOPO CIRÚRGICO: só objetos da MANOS. NÃO toca estoque/veículos (site público)
-- nem tabelas de outros tenants (bolão, sorteio, psicóloga, repassadoras...).
--
-- Idempotente (REVOKE/GRANT + guarda de existência). Rollback = re-GRANT a public.
-- =====================================================================

DO $$
DECLARE
    obj   text;
    kind  "char";
    -- Objetos Manos com PII / financeiro / operação interna. Views E tabelas base.
    manos_objs text[] := ARRAY[
        -- VIEWS (definer) que hoje a anon lê
        'leads','leads_unified','leads_unified_active','unified_whatsapp_messages',
        'lead_kpis_daily','interactions','ai_analyses','active_chats_now',
        'agenda_metrics_por_vendedor','vendas_por_dia','vendas_por_vendedor_7d',
        'vendas_por_vendedor_30d','sales','purchases','inventory','campaigns',
        'v_billing_controle','consultants_backup_v2_redundant',
        -- TABELAS base (PII/financeiro) — defesa em profundidade
        'leads_manos_crm','leads_distribuicao_crm_26','leads_compra','leads_master',
        'whatsapp_messages','consultants_manos_crm','interactions_manos_crm',
        'inactivity_alerts','historico_followup','ai_sdr_queue','perdidos_auditoria',
        'webhook_errors','sales_manos_crm','purchases_manos_crm','inventory_manos_crm',
        'campaigns_manos_crm','intelligent_analysis_results','consultant_active_chats',
        'dados_cliente','financiamentos_realizados','cadastro_venda_veiculo',
        'billing_whatsapp_messages','billing_acordos','billing_juridico_envios',
        'billing_ai_analysis','billing_observacoes_gerais'
    ];
BEGIN
    FOREACH obj IN ARRAY manos_objs LOOP
        IF to_regclass('public.' || quote_ident(obj)) IS NULL THEN
            RAISE NOTICE 'pulando %, nao existe neste ambiente', obj;
            CONTINUE;
        END IF;

        SELECT c.relkind INTO kind
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = obj;

        -- 1) Fecha pra anon (e pro PUBLIC, de onde a anon herda)
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', obj);
        EXECUTE format('REVOKE ALL ON public.%I FROM public', obj);

        -- 2) Re-concede ao app logado. View = só SELECT; tabela = DML (RLS filtra linhas)
        IF kind = 'v' THEN
            EXECUTE format('GRANT SELECT ON public.%I TO authenticated', obj);
        ELSE
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', obj);
        END IF;

        -- 3) Rotas server-side seguem full
        EXECUTE format('GRANT ALL ON public.%I TO service_role', obj);

        RAISE NOTICE 'anon fechado + app/service mantidos em % (%).', obj, kind;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- ROLLBACK (rode manualmente se algo quebrar — devolve leitura ao PUBLIC):
-- ---------------------------------------------------------------------
-- DO $$
-- DECLARE obj text;
-- DECLARE manos_objs text[] := ARRAY[ ...mesma lista... ];
-- BEGIN
--   FOREACH obj IN ARRAY manos_objs LOOP
--     IF to_regclass('public.'||quote_ident(obj)) IS NULL THEN CONTINUE; END IF;
--     EXECUTE format('GRANT SELECT ON public.%I TO anon', obj);
--   END LOOP;
-- END $$;
