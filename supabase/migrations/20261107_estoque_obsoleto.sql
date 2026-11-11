-- Marca a tabela `estoque` como OBSOLETA (decisão do Alexandre, 06/11/2026).
-- O estoque do CRM vem do feed da Altimus (src/lib/estoque). Só comentário: nada é apagado,
-- nada muda de estrutura. NÃO APLICAR sem o "aprovado" do Alexandre.
-- REVERSÃO: comment on table public.estoque is null;
COMMENT ON TABLE public.estoque IS
    'OBSOLETA desde 06/11/2026: o estoque vem do feed da Altimus (src/lib/estoque). Em 06/11 tinha 3 preços errados, 6 carros que já saíram e faltavam 14. Não ler nem escrever. Congelar 30 dias antes de decidir se apaga.';
