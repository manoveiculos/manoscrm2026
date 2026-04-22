-- ========================================================
-- SECURITY SWEEP: CRM Manos (jkblxdxnbmciicakusnl)
-- Goal: Fix "Table publicly accessible" and "Sensitive data" alerts
-- ========================================================

-- 1. Ativa RLS em todas as tabelas principais
ALTER TABLE IF EXISTS public.leads_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.consultants_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.interactions_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.campaigns_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory_manos_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales_manos_crm ENABLE ROW LEVEL SECURITY;

-- 2. Limpeza: Remover políticas permissivas legadas (USING true)
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND (qual = '(true)' OR with_check = '(true)')
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.' || quote_ident(pol.tablename) || ';';
    END LOOP;
END $$;

-- 3. Funções Auxiliares para RLS
CREATE OR REPLACE FUNCTION public.is_crm_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.consultants_manos_crm 
    WHERE auth_id = auth.uid() AND role = 'admin' AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_consultant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM public.consultants_manos_crm WHERE auth_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. POLÍTICAS: LEADS_MASTER
-- Admins veem tudo
CREATE POLICY "Admins full access on leads_master" 
ON public.leads_master FOR ALL TO authenticated 
USING (is_crm_admin());

-- Consultores veem apenas seus próprios leads
CREATE POLICY "Consultants view own leads" 
ON public.leads_master FOR SELECT TO authenticated 
USING (assigned_consultant_id = get_my_consultant_id());

-- Consultores podem atualizar seus próprios leads
CREATE POLICY "Consultants update own leads" 
ON public.leads_master FOR UPDATE TO authenticated 
USING (assigned_consultant_id = get_my_consultant_id())
WITH CHECK (assigned_consultant_id = get_my_consultant_id());

-- 5. POLÍTICAS: CONSULTANTS
CREATE POLICY "Admins full access on consultants" 
ON public.consultants_manos_crm FOR ALL TO authenticated 
USING (is_crm_admin());

CREATE POLICY "Consultants view self" 
ON public.consultants_manos_crm FOR SELECT TO authenticated 
USING (auth_id = auth.uid());

-- 6. POLÍTICAS: WHATSAPP_MESSAGES
-- Restringe para que ninguém de fora acesse as conversas sensíveis
CREATE POLICY "Admins full access on whatsapp_messages" 
ON public.whatsapp_messages FOR ALL TO authenticated 
USING (is_crm_admin());

CREATE POLICY "Consultants view messages of their leads" 
ON public.whatsapp_messages FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.leads_master 
    WHERE id::text = whatsapp_messages.lead_id::text 
    AND assigned_consultant_id = get_my_consultant_id()
  )
);

-- 7. POLÍTICAS: INTERACTIONS
CREATE POLICY "Admins full access on interactions" 
ON public.interactions_manos_crm FOR ALL TO authenticated 
USING (is_crm_admin());

CREATE POLICY "Consultants view interactions of their leads" 
ON public.interactions_manos_crm FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.leads_master 
    WHERE id = interactions_manos_crm.lead_id 
    AND assigned_consultant_id = get_my_consultant_id()
  )
);

-- 8. POLÍTICAS: INVENTORY & CAMPAIGNS (Leitura pública se necessário para o site, senão restrito)
-- Se o CRM for 100% interno, restringimos para usuários autenticados
CREATE POLICY "Authenticated users view inventory" 
ON public.inventory_manos_crm FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users view campaigns" 
ON public.campaigns_manos_crm FOR SELECT TO authenticated USING (true);
