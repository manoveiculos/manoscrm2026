-- Passo 1: Adicionar a coluna campaign_id nas tabelas de leads
ALTER TABLE public.leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns_manos_crm(id);
ALTER TABLE public.leads_manos_crm ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns_manos_crm(id);

-- Passo 2: Atualizar a VIEW para incluir o campaign_id
CREATE OR REPLACE VIEW public.leads AS
 SELECT l.id,
    l.nome,
    l.telefone,
    l.email,
    l.cidade,
    l.interesse,
    l.status,
    l.origem,
    l.assigned_consultant_id,
    l.created_at,
    l.campaign_id,
    'crm26'::text AS source_table
   FROM leads_distribuicao_crm_26 l
UNION ALL
 SELECT lm.id::text AS id,
    lm.nome,
    lm.telefone,
    lm.email,
    lm.cidade,
    lm.interesse,
    lm.status,
    lm.origem,
    lm.assigned_consultant_id,
    lm.created_at,
    lm.campaign_id,
    'main'::text AS source_table
   FROM leads_manos_crm lm;

-- Passo 3: Backfill dos leads existentes (Vincular pelo nome da campanha no resumo)
-- Nota: Isso assume que o nome da campanha no resumo bate com o nome na tabela campaigns_manos_crm
UPDATE public.leads_distribuicao_crm_26 l
SET campaign_id = c.id
FROM public.campaigns_manos_crm c
WHERE l.resumo LIKE '%' || c.name || '%'
AND l.campaign_id IS NULL;

-- Verificar o resultado do backfill
SELECT c.name, COUNT(l.id) as leads_vinculados
FROM public.leads l
JOIN public.campaigns_manos_crm c ON l.campaign_id = c.id
GROUP BY c.name;
