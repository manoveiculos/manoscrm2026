-- Este script SQL serve para padronizar os nomes dos vendedores que já estão na base de dados
-- Ele não é estritamente obrigatório (pois o código do sistema agora já busca pelo primeiro nome inteligente),
-- mas é recomendado para deixar a tabela visualmente limpa e os relatórios mais consistentes.

BEGIN;

-- Padroniza as variações do Sergio
UPDATE public.leads_distribuicao_crm_26
SET vendedor = 'Sergio'
WHERE vendedor ILIKE '%sergio%';

-- Padroniza as variações do Victor
UPDATE public.leads_distribuicao_crm_26
SET vendedor = 'Victor'
WHERE vendedor ILIKE '%victor%';

-- Padroniza as variações do Wilson
UPDATE public.leads_distribuicao_crm_26
SET vendedor = 'Wilson'
WHERE vendedor ILIKE '%wilson%';

-- Padroniza as variações da Camila
UPDATE public.leads_distribuicao_crm_26
SET vendedor = 'Camila'
WHERE vendedor ILIKE '%camila%';

-- Padroniza as variações do Alexandre
UPDATE public.leads_distribuicao_crm_26
SET vendedor = 'Alexandre'
WHERE vendedor ILIKE '%alexandre%';

COMMIT;
