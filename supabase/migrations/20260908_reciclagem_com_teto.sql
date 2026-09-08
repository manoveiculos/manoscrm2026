-- =====================================================================
-- Teto de reciclagem — matar o "zumbi imortal" que eu recriei
-- Data: 2026-09-08
--
-- O que os vendedores relataram: leads velhos aparecendo "do nada" na
-- Inbox, todo dia, há semanas. O print do dia 08/09 mostra um lead de
-- 19/08 (20 dias) no topo da fila do Sergio, rotulado "Novo lead —
-- ninguém atendeu ainda".
--
-- A causa foi a reciclagem de 'esgotado' que subiu em 20/08. Ela devolve
-- à fila o lead que deu a volta na roleta sem ninguém aceitar — boa
-- intenção, dois defeitos:
--
--   1) SEM TETO. A regra era "volta uma vez por dia", sem limite de
--      quantas vezes ao todo. Lead que ninguém quer volta todo santo dia,
--      para sempre.
--
--   2) REJUVENESCIA O LEAD. atribuirA() escrevia updated_at = agora a
--      cada redistribuição. O zombie-triage arquiva por updated_at > 15
--      dias, então o lead nunca envelhecia aos olhos dele e o
--      arquivamento automático nunca chegava. O próprio zombie-triage
--      documenta esse padrão: "NÃO reseta updated_at: resetar mascarava
--      a idade real do lead e era o que criava o zumbi imortal". Recriei
--      o zumbi por outra porta.
--
-- O código já não escreve mais updated_at na distribuição. Esta migration
-- fecha o (1): passa a contar quantas vezes cada lead foi reciclado.
-- =====================================================================

ALTER TABLE public.lead_distribuicao
    ADD COLUMN IF NOT EXISTS reciclagens INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.lead_distribuicao.reciclagens IS
    'Quantas vezes este lead já voltou da situação "esgotado" para a fila. '
    'Ao bater MAX_RECICLAGENS (slaEngine), para de voltar: se a equipe inteira '
    'recusou N vezes, insistir só polui a Inbox de quem está atendendo lead novo.';

-- Os leads que já estão rodando em loop desde 20/08 entram com o contador
-- estourado: pararam de voltar sozinhos e viram decisão de gestão (arquivar
-- ou puxar na mão), em vez de reaparecerem amanhã de novo.
UPDATE public.lead_distribuicao
SET reciclagens = 99
WHERE status = 'esgotado';

-- Fila de trabalho do admin: o que parou de circular e precisa de decisão.
CREATE INDEX IF NOT EXISTS idx_leaddist_esgotado_saturado
    ON public.lead_distribuicao(status, reciclagens)
    WHERE status = 'esgotado';
