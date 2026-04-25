-- 20260425_harden_security_isolation.sql
--
-- GARANTIA DE ISOLAMENTO DE DADOS (RLS)
-- Consultores veem apenas seus próprios leads e dados.
-- Admins mantêm acesso total.

-- 1. Habilitar RLS em todas as tabelas críticas
ALTER TABLE public.consultants_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_distribuicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_distribuicao_crm_26 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_manos_crm ENABLE ROW LEVEL SECURITY;

-- 2. Limpeza de políticas permissivas (Removendo "Allow all for authenticated" e afins)

-- consultants_manos_crm
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.consultants_manos_crm;
DROP POLICY IF EXISTS "Permitir gestão para todos autenticados" ON public.consultants_manos_crm;
DROP POLICY IF EXISTS "Permitir leitura para todos autenticados" ON public.consultants_manos_crm;

-- leads_master
DROP POLICY IF EXISTS "Allow authenticated access to leads_master" ON public.leads_master;

-- leads_manos_crm
DROP POLICY IF EXISTS "Allow all for authenticated leads_manos" ON public.leads_manos_crm;

-- leads_distribuicao
DROP POLICY IF EXISTS "Allow all for authenticated distribution" ON public.leads_distribuicao;

-- leads_distribuicao_crm_26
DROP POLICY IF EXISTS "Allow All Operations Leads" ON public.leads_distribuicao_crm_26;
DROP POLICY IF EXISTS "Allow all for authenticated crm26" ON public.leads_distribuicao_crm_26;
DROP POLICY IF EXISTS "Leads CRM26: Gestão para autenticados" ON public.leads_distribuicao_crm_26;
DROP POLICY IF EXISTS "Leads CRM26: Leitura para autenticados" ON public.leads_distribuicao_crm_26;

-- interactions_manos_crm
DROP POLICY IF EXISTS "Allow authenticated access to interactions_manos_crm" ON public.interactions_manos_crm;
DROP POLICY IF EXISTS "interactions_authenticated_read" ON public.interactions_manos_crm;

-- whatsapp_messages
DROP POLICY IF EXISTS "Enable read access for all users" ON public.whatsapp_messages;

-- purchases_manos_crm
DROP POLICY IF EXISTS "Allow authenticated access to purchases" ON public.purchases_manos_crm;

-- sales_manos_crm
DROP POLICY IF EXISTS "Allow all for authenticated sales" ON public.sales_manos_crm;


-- 3. Criação de Novas Políticas de Isolamento

-- CONSULTANTS
-- Consultores veem apenas seus próprios dados. Admins veem tudo.
CREATE POLICY "consultants_isolation_select" ON public.consultants_manos_crm
FOR SELECT TO authenticated
USING (auth_id = auth.uid() OR is_crm_admin());

CREATE POLICY "consultants_isolation_update" ON public.consultants_manos_crm
FOR UPDATE TO authenticated
USING (auth_id = auth.uid() OR is_crm_admin())
WITH CHECK (auth_id = auth.uid() OR is_crm_admin());


-- LEADS (Master e Específicos)
-- Lógica: assigned_consultant_id = meu_id OR is_crm_admin()

-- leads_master
CREATE POLICY "leads_master_isolation_select" ON public.leads_master
FOR SELECT TO authenticated
USING (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin());

CREATE POLICY "leads_master_isolation_update" ON public.leads_master
FOR UPDATE TO authenticated
USING (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin())
WITH CHECK (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin());

-- leads_manos_crm
CREATE POLICY "leads_manos_isolation_select" ON public.leads_manos_crm
FOR SELECT TO authenticated
USING (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin());

CREATE POLICY "leads_manos_isolation_update" ON public.leads_manos_crm
FOR UPDATE TO authenticated
USING (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin())
WITH CHECK (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin());

-- leads_distribuicao
CREATE POLICY "leads_distribuicao_isolation_select" ON public.leads_distribuicao
FOR SELECT TO authenticated
USING (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin());

-- leads_distribuicao_crm_26
CREATE POLICY "leads_crm26_isolation_select" ON public.leads_distribuicao_crm_26
FOR SELECT TO authenticated
USING (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin());

CREATE POLICY "leads_crm26_isolation_update" ON public.leads_distribuicao_crm_26
FOR UPDATE TO authenticated
USING (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin())
WITH CHECK (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin());

-- leads_compra
CREATE POLICY "leads_compra_isolation_select" ON public.leads_compra
FOR SELECT TO authenticated
USING (assigned_consultant_id = get_my_consultant_id() OR is_crm_admin());


-- INTERAÇÕES E MENSAGENS
-- Devem seguir a permissão do lead relacionado.

-- interactions_manos_crm
CREATE POLICY "interactions_isolation_select" ON public.interactions_manos_crm
FOR SELECT TO authenticated
USING (
    is_crm_admin() OR
    EXISTS (
        SELECT 1 FROM public.leads_master
        WHERE id = interactions_manos_crm.lead_id
        AND assigned_consultant_id = get_my_consultant_id()
    )
);

-- whatsapp_messages
CREATE POLICY "whatsapp_messages_isolation_select" ON public.whatsapp_messages
FOR SELECT TO authenticated
USING (
    is_crm_admin() OR
    EXISTS (
        SELECT 1 FROM public.leads_master
        WHERE id::text = whatsapp_messages.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    )
);


-- VENDAS E COMPRAS (Financeiro)

-- sales_manos_crm
CREATE POLICY "sales_isolation_select" ON public.sales_manos_crm
FOR SELECT TO authenticated
USING (consultant_id = get_my_consultant_id() OR is_crm_admin());

-- purchases_manos_crm
CREATE POLICY "purchases_isolation_select" ON public.purchases_manos_crm
FOR SELECT TO authenticated
USING (consultant_id = get_my_consultant_id() OR is_crm_admin());

-- cowork_alerts
-- Consultores veem alertas destinados a eles ou alertas globais (sem target_consultant_id)
CREATE POLICY "cowork_alerts_isolation_select" ON public.cowork_alerts
FOR SELECT TO authenticated
USING (
    is_crm_admin() OR
    target_consultant_id IS NULL OR
    target_consultant_id = get_my_consultant_id()
);

-- 4. Garantir acesso ao Service Role (para CRONs e Triggers)
-- O service_role geralmente ignora RLS, mas é bom deixar explícito se necessário.
-- No Supabase, o service_role tem bypassrls por padrão.
