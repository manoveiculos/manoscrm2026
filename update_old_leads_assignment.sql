-- 1. Garante que existe a coluna 'assigned_consultant_id' para fazer o vínculo oficial 
-- na tabela antiga (leads_distribuicao)
ALTER TABLE public.leads_distribuicao 
ADD COLUMN IF NOT EXISTS assigned_consultant_id UUID REFERENCES public.consultants_manos_crm(id);

-- 2. Atualiza os leads dessa tabela, validando o preenchimento de vendedor.
UPDATE public.leads_distribuicao AS l
SET assigned_consultant_id = c.id
FROM public.consultants_manos_crm AS c
WHERE l.vendedor IS NOT NULL 
  AND l.vendedor != ''
  AND l.assigned_consultant_id IS NULL
  AND c.name ILIKE '%' || split_part(trim(l.vendedor), ' ', 1) || '%';
