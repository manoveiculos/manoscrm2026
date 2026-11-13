-- ===========================================================================
-- TRIAGEM: LEMBRETE DO MESMO DIA (lead morno que esfriou)
-- Data: 2026-11-13   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- Plano "esfriou" (Alexandre, 13/11/2026): lead que conversou com a Laura e parou de responder
--   quente → 60 min calado: vai ao consultor com o resumo;
--   morno  → 2 h calado: a Laura manda UM lembrete no mesmo dia; 12 h sem resposta: vai ao consultor;
--   leve   → só a Laura (follow-up de 1, 2, 4 e 10 dias).
-- wa_triagem.lembrete_em marca quando o lembrete do mesmo dia saiu (para não repetir e para
-- contar as 12 h até soltar). Coluna nova, vazia, em tabela pequena: nada existente muda.
--
-- REVERSÃO:  alter table public.wa_triagem drop column if exists lembrete_em;
-- ===========================================================================

SET lock_timeout = '5s';

ALTER TABLE public.wa_triagem
    ADD COLUMN IF NOT EXISTS lembrete_em timestamptz;
