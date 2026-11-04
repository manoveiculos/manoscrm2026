-- =====================================================================
-- Qualificação do lead: prazo de compra (4ª pergunta)
-- Data: 2026-10-14  ·  NÃO APLICAR sem revisão do Alexandre.
--
-- As outras três perguntas já têm coluna (vehicle_interest/interesse,
-- valor_investimento, carro_troca). Sem esta coluna o app segue funcionando:
-- qualificacaoService ignora o prazo e avisa na tela.
-- Valores: esta_semana | este_mes | 1_3_meses | pesquisando
-- =====================================================================

ALTER TABLE public.leads_distribuicao_crm_26
    ADD COLUMN IF NOT EXISTS prazo_compra TEXT
    CONSTRAINT ck_crm26_prazo_compra
    CHECK (prazo_compra IS NULL OR prazo_compra IN ('esta_semana', 'este_mes', '1_3_meses', 'pesquisando'));

ALTER TABLE public.leads_manos_crm
    ADD COLUMN IF NOT EXISTS prazo_compra TEXT
    CONSTRAINT ck_manos_prazo_compra
    CHECK (prazo_compra IS NULL OR prazo_compra IN ('esta_semana', 'este_mes', '1_3_meses', 'pesquisando'));
