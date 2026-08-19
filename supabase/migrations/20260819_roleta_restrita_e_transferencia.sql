-- =====================================================================
-- Roleta restrita + transferência manual soberana
-- Data: 2026-08-19
--
-- Problema 1 — leads indo pra quem não vende:
--   pickNextDisponivel() pegava QUALQUER consultor com role='vendedor'.
--   Em 9 dias: Felipe Ledra 20 leads e Renato Gorge 12, contra Wilson 12,
--   Victor 3 e Sergio 2. Ou seja, 2/3 do fluxo foi pra fora do time de
--   vendas. Papel ('vendedor') não é a mesma coisa que "está na roleta" —
--   agora isso é explícito numa flag própria.
--
-- Problema 2 — transferência manual desfeita pelo motor:
--   /api/lead/transfer trocava o dono na tabela do lead mas não em
--   lead_distribuicao. O tick via o dono ANTIGO com o SLA estourado e
--   repassava pra outro, atropelando a decisão do gestor. Novo status
--   'manual' tira o lead do rodízio automático: quem mandou foi humano.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Quem está na roleta (explícito, editável, default fora)
-- ---------------------------------------------------------------------
ALTER TABLE public.consultants_manos_crm
    ADD COLUMN IF NOT EXISTS recebe_leads BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.consultants_manos_crm.recebe_leads IS
    'TRUE = entra no round-robin de leads novos. Independe de role/is_active: '
    'define APENAS quem recebe lead automático. Transferência manual continua '
    'podendo mandar lead pra qualquer consultor.';

-- O time de vendas de hoje: Victor, Sergio, Wilson.
UPDATE public.consultants_manos_crm SET recebe_leads = TRUE
WHERE id IN (
    '8ad0074f-238b-4a64-a6b9-ef8d7d6f669e',  -- Victor
    '2cc340eb-7dba-4d49-9800-375d34a1df8f',  -- SERGIO LUIS DA SILVA
    'e892b130-5c57-4f66-bd29-e2fe2174bb11'   -- wilson alcantara dultra netto
);

-- Todo o resto fica fora da roleta (default FALSE já cobre, explícito por clareza)
UPDATE public.consultants_manos_crm SET recebe_leads = FALSE
WHERE id NOT IN (
    '8ad0074f-238b-4a64-a6b9-ef8d7d6f669e',
    '2cc340eb-7dba-4d49-9800-375d34a1df8f',
    'e892b130-5c57-4f66-bd29-e2fe2174bb11'
);

CREATE INDEX IF NOT EXISTS idx_consultants_recebe_leads
    ON public.consultants_manos_crm(recebe_leads, last_lead_assigned_at)
    WHERE recebe_leads = TRUE;

-- ---------------------------------------------------------------------
-- 2) Status 'manual' — transferência humana sai do rodízio automático
-- ---------------------------------------------------------------------
ALTER TABLE public.lead_distribuicao DROP CONSTRAINT IF EXISTS lead_distribuicao_status_check;
ALTER TABLE public.lead_distribuicao ADD CONSTRAINT lead_distribuicao_status_check
    CHECK (status IN ('standby','aguardando','distribuido','atendido','esgotado','manual'));

-- ---------------------------------------------------------------------
-- 3) Devolve à fila o que foi parar fora do time de vendas
--    SÓ o que ninguém atendeu ainda. Lead JÁ em atendimento não se mexe:
--    tirar da mão de quem está conversando com o cliente é pior que o bug.
-- ---------------------------------------------------------------------
WITH fora_do_time AS (
    SELECT d.lead_uid
    FROM public.lead_distribuicao d
    JOIN public.leads_unified_active l ON l.uid = d.lead_uid
    WHERE d.status IN ('distribuido','esgotado')
      AND l.atendimento_iniciado_em IS NULL
      AND COALESCE(l.descarte_financeiro, FALSE) = FALSE
      AND (
            d.assigned_consultant_id IS NULL
         OR d.assigned_consultant_id NOT IN (
                '8ad0074f-238b-4a64-a6b9-ef8d7d6f669e',
                '2cc340eb-7dba-4d49-9800-375d34a1df8f',
                'e892b130-5c57-4f66-bd29-e2fe2174bb11'
            )
      )
)
UPDATE public.lead_distribuicao d
SET status = 'aguardando',
    assigned_consultant_id = NULL,
    distribuido_em = NULL,
    tentados = '{}'::UUID[],
    ciclos = 0,
    atualizado_em = NOW()
FROM fora_do_time f
WHERE d.lead_uid = f.lead_uid;

-- Limpa o dono também na tabela do lead, senão o /inbox continua mostrando
-- pro vendedor errado até o tick redistribuir.
UPDATE public.leads_distribuicao_crm_26 l
SET assigned_consultant_id = NULL, vendedor = NULL
FROM public.lead_distribuicao d
WHERE d.lead_uid = 'leads_distribuicao_crm_26:' || l.id::TEXT
  AND d.status = 'aguardando'
  AND l.atendimento_iniciado_em IS NULL;

UPDATE public.leads_manos_crm l
SET assigned_consultant_id = NULL
FROM public.lead_distribuicao d
WHERE d.lead_uid = 'leads_manos_crm:' || l.id::TEXT
  AND d.status = 'aguardando'
  AND l.atendimento_iniciado_em IS NULL;

UPDATE public.leads_compra l
SET assigned_consultant_id = NULL
FROM public.lead_distribuicao d
WHERE d.lead_uid = 'leads_compra:' || l.id::TEXT
  AND d.status = 'aguardando'
  AND l.atendimento_iniciado_em IS NULL;

-- Confere o resultado
SELECT status, count(*) FROM public.lead_distribuicao GROUP BY status ORDER BY 2 DESC;
