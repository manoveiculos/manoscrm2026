-- ===========================================================================
-- ESTOQUE VISTO (para a lista de espera saber qual carro é NOVO)
-- Data: 2026-11-18   Status: aplicada junto com a Fase 3 (aprovada pelo Alexandre)
--
-- O feed da Altimus não diz "este carro entrou hoje". O cron /api/cron/wa-espera grava aqui cada
-- id_externo na primeira vez que o vê (primeiro_visto_em). Carro visto nas últimas 48 h = chegou agora.
-- Na primeira execução (tabela vazia) tudo entra com data 1970, para NÃO avisar ninguém do estoque que já existia.
-- Acesso: RLS ligada e sem política (só o servidor).
--
-- REVERSÃO: drop table if exists public.estoque_snapshot;
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.estoque_snapshot (
    id_externo        text PRIMARY KEY,
    descricao         text,
    primeiro_visto_em timestamptz NOT NULL DEFAULT now(),
    ultimo_visto_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estoque_snapshot_primeiro ON public.estoque_snapshot (primeiro_visto_em DESC);
ALTER TABLE public.estoque_snapshot ENABLE ROW LEVEL SECURITY;
