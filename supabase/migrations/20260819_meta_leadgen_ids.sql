-- =====================================================================
-- Guardar a identidade Meta do lead de formulário (Lead Ads)
-- Data: 2026-08-19
--
-- O webhook /api/webhook/facebook-leads busca no Graph o leadgen_id, o
-- campaign_id, o ad_id e o form_id — e descarta TODOS na hora de gravar.
-- O insert em leads_compra salva só nome, telefone, origem, veículo e data.
--
-- Consequências que isso causa hoje, em todo lead de formulário:
--   1) Os eventos que o CRM devolve pela CAPI vão com user_data.lead_id
--      vazio. O Meta recebe o evento órfão e não consegue atribuir a venda
--      ao anúncio — a otimização por qualidade não tem como funcionar.
--   2) Não dá para filtrar leads por campanha, então não existe relatório
--      por campanha nem teste isolado de uma campanha só.
--   3) As respostas das perguntas de qualificação do formulário (troca,
--      forma de pagamento, prazo de decisão) se perdem: só sobrevivem os
--      4 campos que o parser reconhece.
--
-- Esta migration é puramente aditiva e não muda comportamento nenhum
-- sozinha — só cria o lugar onde o webhook passa a gravar.
-- =====================================================================

ALTER TABLE public.leads_compra
    ADD COLUMN IF NOT EXISTS meta_leadgen_id     TEXT,
    ADD COLUMN IF NOT EXISTS meta_campaign_id    TEXT,
    ADD COLUMN IF NOT EXISTS meta_campaign_name  TEXT,
    ADD COLUMN IF NOT EXISTS meta_adset_id       TEXT,
    ADD COLUMN IF NOT EXISTS meta_ad_id          TEXT,
    ADD COLUMN IF NOT EXISTS meta_form_id        TEXT,
    ADD COLUMN IF NOT EXISTS meta_platform       TEXT,
    ADD COLUMN IF NOT EXISTS meta_raw            JSONB;

COMMENT ON COLUMN public.leads_compra.meta_leadgen_id IS
    'ID do lead no Meta (leadgen_id). É a chave que casa este lead com o '
    'formulário do Lead Ads — vai em user_data.lead_id nos eventos da CAPI. '
    'Sem ele, o evento chega ao Meta sem dono e não atribui.';

COMMENT ON COLUMN public.leads_compra.meta_raw IS
    'field_data cru do formulário: guarda as respostas das perguntas de '
    'qualificação que o parser do webhook não mapeia em coluna própria.';

-- Um leadgen_id só pode virar um lead. O Meta reenvia a notificação quando
-- não recebe 200, e sem isto a reentrega criaria lead duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_compra_meta_leadgen
    ON public.leads_compra(meta_leadgen_id)
    WHERE meta_leadgen_id IS NOT NULL;

-- Filtro da aba por campanha (/admin/campanha) e dos relatórios por campanha.
CREATE INDEX IF NOT EXISTS idx_leads_compra_meta_campaign
    ON public.leads_compra(meta_campaign_id, criado_em DESC)
    WHERE meta_campaign_id IS NOT NULL;
