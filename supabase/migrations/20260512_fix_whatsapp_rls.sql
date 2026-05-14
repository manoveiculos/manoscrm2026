-- Fix RLS policies to allow consultants to see whatsapp messages and interactions from all lead tables

-- 1. Fix whatsapp_messages
DROP POLICY IF EXISTS "whatsapp_messages_isolation_select" ON public.whatsapp_messages;

CREATE POLICY "whatsapp_messages_isolation_select" ON public.whatsapp_messages
FOR SELECT TO authenticated
USING (
    is_crm_admin() OR
    EXISTS (
        SELECT 1 FROM public.leads_master
        WHERE id::text = whatsapp_messages.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    ) OR
    EXISTS (
        SELECT 1 FROM public.leads_manos_crm
        WHERE id::text = whatsapp_messages.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    ) OR
    EXISTS (
        SELECT 1 FROM public.leads_distribuicao_crm_26
        WHERE id::text = whatsapp_messages.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    ) OR
    EXISTS (
        SELECT 1 FROM public.leads_compra
        WHERE id::text = whatsapp_messages.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    ) OR
    EXISTS (
        SELECT 1 FROM public.leads_compra
        WHERE id::text = whatsapp_messages.lead_compra_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    )
);

-- 2. Fix interactions_manos_crm
DROP POLICY IF EXISTS "interactions_isolation_select" ON public.interactions_manos_crm;

CREATE POLICY "interactions_isolation_select" ON public.interactions_manos_crm
FOR SELECT TO authenticated
USING (
    is_crm_admin() OR
    EXISTS (
        SELECT 1 FROM public.leads_master
        WHERE id::text = interactions_manos_crm.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    ) OR
    EXISTS (
        SELECT 1 FROM public.leads_manos_crm
        WHERE id::text = interactions_manos_crm.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    ) OR
    EXISTS (
        SELECT 1 FROM public.leads_distribuicao_crm_26
        WHERE id::text = interactions_manos_crm.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    ) OR
    EXISTS (
        SELECT 1 FROM public.leads_compra
        WHERE id::text = interactions_manos_crm.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    )
);

-- 3. Fix historico_followup se necessário
DROP POLICY IF EXISTS "historico_followup_isolation_select" ON public.historico_followup;

CREATE POLICY "historico_followup_isolation_select" ON public.historico_followup
FOR SELECT TO authenticated
USING (
    is_crm_admin() OR
    EXISTS (
        SELECT 1 FROM public.leads_master
        WHERE id::text = historico_followup.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    ) OR
    EXISTS (
        SELECT 1 FROM public.leads_manos_crm
        WHERE id::text = historico_followup.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    ) OR
    EXISTS (
        SELECT 1 FROM public.leads_distribuicao_crm_26
        WHERE id::text = historico_followup.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    ) OR
    EXISTS (
        SELECT 1 FROM public.leads_compra
        WHERE id::text = historico_followup.lead_id::text
        AND assigned_consultant_id = get_my_consultant_id()
    )
);
