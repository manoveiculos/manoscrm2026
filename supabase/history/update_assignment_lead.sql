-- 1. Garante que existe a coluna 'assigned_consultant_id' para fazer o vínculo oficial 
-- na tabela leads_distribuicao_crm_26
ALTER TABLE public.leads_distribuicao_crm_26 
ADD COLUMN IF NOT EXISTS assigned_consultant_id UUID REFERENCES public.consultants_manos_crm(id);

-- 2. Atualiza todos os leads que possuem um Vendedor (texto) inserido, 
-- cruzando o primeiro nome do vendedor com o cadastro oficial dos consultores.
UPDATE public.leads_distribuicao_crm_26 AS l
SET assigned_consultant_id = c.id
FROM public.consultants_manos_crm AS c
WHERE l.vendedor IS NOT NULL 
  AND l.vendedor != ''
  -- Evita sobreescrever caso você já tenha atribuído manualmente outro
  AND l.assigned_consultant_id IS NULL
  -- Pega a primeira palavra da coluna vendedor e busca no nome do consultor
  AND c.name ILIKE '%' || split_part(trim(l.vendedor), ' ', 1) || '%';

-- Exemplo: Se l.vendedor for "Sergio", vai conectar com o ID do "SERGIO LUIS DA SILVA".
-- Isso fará com que o Painel "Gestão de Encaminhamento" já puxe o consultor direto do banco.
