-- ============================================================================
-- RLS Security Hardening — Manos CRM
-- Data: 2026-06-09
-- Origem: V4 Concept §5 (docs/V4_CONCEPT.md) — advisor Supabase acusou 45 tabelas
--         com RLS desabilitado, expostas à anon key (pública, vai pro browser).
--
-- OBJETIVO: fechar o buraco — anon (sem login) deixa de ler/escrever dados da
--           loja; usuário logado (authenticated) e rotas server-side (service_role,
--           que SEMPRE bypassa RLS) seguem funcionando normalmente.
--
-- ESCOPO CIRÚRGICO: este banco é MULTI-TENANT (beachtennis, psicóloga, sorteios,
--   copa26, vyro, raccarrepassadora, associação, nivermanos...). Esta migration
--   só toca tabelas da MANOS. NÃO inclui tabelas de outros apps.
--
-- DELIBERADAMENTE FORA (2ª passada, decisão do dono):
--   - estoque / veiculos  → podem ter consumidor público (site/anúncios). Avaliar.
--   - afiliados/indique-e-ganhe, mensagens_grupo/conversas_grupo → ambíguos.
--
-- COMO TESTAR ANTES DE PRODUÇÃO (workflow escolhido = branch primeiro):
--   1) Crie um branch:           supabase branches create rls-security
--   2) Aplique lá:               supabase db push   (ou rode este arquivo no branch)
--   3) Logue no app apontado pro branch e confirme que Inbox/Kanban/Lead Profile
--      continuam lendo (sessão authenticated). Confirme que a anon key crua NÃO lê.
--   4) Merge pra produção.
--
-- IMPORTANTE: a policy abaixo é "authenticated pode tudo". Ela FECHA o vazamento
--   (anon = negado), mas NÃO faz isolamento por consultor (vendedor só vê os seus).
--   Isolamento fino é uma 2ª camada — requer mapear consultants_manos_crm.auth_id
--   nas policies e validar caso a caso. Aqui priorizamos parar o vazamento sem
--   quebrar nenhuma tela.
-- ============================================================================

DO $$
DECLARE
    t        text;
    pol      text;
    -- Tabelas Manos com RLS OFF hoje (todas internas, sem consumidor público legítimo).
    tables   text[] := ARRAY[
        -- PII / dados de cliente e financeiro (prioridade máxima)
        'dados_cliente',
        'financiamentos_realizados',
        'cadastro_venda_veiculo',
        'funcionarios',
        -- Conversas / mensageria
        'concessionaria_mensagens',
        'whatsapp_chat_history_atendimentocompra2026',
        'whatsapp_send_log',
        'registro_envios_whatsapp',
        -- CRM legado (crm26) e fluxo de compra
        'consultants_manoscrm26',
        'campaigns_manoscrm26',
        'leads_manoscrm26',
        'sales_manoscrm26',
        'lead_history_manoscrm26',
        'marketing_daily_reports_manoscrm26',
        'leads_compra26',
        'eventos_formulario_compra26',
        'instagram_crm_26',
        -- Inteligência / marketing / operação
        'intelligent_analysis_results',
        'marketing_quality_reports',
        'sla_config',
        'sla_escalations',
        'alertas_clientes',
        'notification_failures',
        'cron_heartbeats'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Pula com segurança se a tabela não existir neste ambiente.
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            RAISE NOTICE 'pulando %, não existe', t;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        pol := t || '_authenticated_all';
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
            pol, t
        );

        RAISE NOTICE 'RLS ligado + policy authenticated em %', t;
    END LOOP;
END $$;

-- ============================================================================
-- ROLLBACK (rode manualmente se algo quebrar — devolve ao estado anterior:
--           RLS desligado nessas tabelas)
-- ============================================================================
-- DO $$
-- DECLARE t text;
-- DECLARE tables text[] := ARRAY[
--     'dados_cliente','financiamentos_realizados','cadastro_venda_veiculo','funcionarios',
--     'concessionaria_mensagens','whatsapp_chat_history_atendimentocompra2026','whatsapp_send_log',
--     'registro_envios_whatsapp','consultants_manoscrm26','campaigns_manoscrm26','leads_manoscrm26',
--     'sales_manoscrm26','lead_history_manoscrm26','marketing_daily_reports_manoscrm26','leads_compra26',
--     'eventos_formulario_compra26','instagram_crm_26','intelligent_analysis_results',
--     'marketing_quality_reports','sla_config','sla_escalations','alertas_clientes',
--     'notification_failures','cron_heartbeats'
-- ];
-- BEGIN
--     FOREACH t IN ARRAY tables LOOP
--         IF to_regclass('public.'||quote_ident(t)) IS NULL THEN CONTINUE; END IF;
--         EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_authenticated_all', t);
--         EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--     END LOOP;
-- END $$;
