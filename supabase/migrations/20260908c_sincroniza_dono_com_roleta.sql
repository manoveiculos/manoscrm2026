-- =====================================================================
-- Uma fonte de verdade para "de quem é o lead"
-- Data: 2026-09-08
--
-- Por que a Inbox do Sergio tinha 34 leads que não saíam com nada:
--
-- Existem DOIS lugares dizendo de quem é o lead:
--   (1) lead_distribuicao.assigned_consultant_id + status  → o motor
--   (2) leads_*.assigned_consultant_id                     → a Inbox
--
-- Só a atribuição mantinha os dois juntos. Quando o lead ESGOTAVA (deu a
-- volta na roleta e ninguém aceitou), o motor gravava status='esgotado'
-- em (1) e não tocava em (2). O lead saía do rodízio mas continuava com
-- dono na tabela — e a Inbox filtra por (2).
--
-- Resultado: cada lead que a equipe inteira recusou ficava depositado
-- PARA SEMPRE na Inbox de quem foi tentado por último. Nada o removia:
-- não era redistribuído (fora do rodízio), não era arquivado (updated_at
-- era rejuvenescido a cada tentativa) e não era atendido. Só acumulava.
--
-- Isso é independente da reciclagem e das outras correções de hoje — por
-- isso os 34 continuaram lá mesmo depois de tudo atualizado.
--
-- O código passou a espelhar (2) a partir de (1) em toda transição. Esta
-- migration limpa o que já está depositado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Quem está fora do rodízio não pode ter dono na tabela do lead
--
--    'esgotado'    → equipe inteira recusou; vira decisão de gestão
--    'aguardando'  → esperando distribuição; ainda sem dono
--    'standby'     → fora do horário; ainda sem dono
--
--    'distribuido', 'atendido' e 'manual' MANTÊM o dono — são os estados
--    em que alguém de fato é responsável.
-- ---------------------------------------------------------------------
UPDATE public.leads_distribuicao_crm_26 l
SET assigned_consultant_id = NULL, vendedor = NULL
FROM public.lead_distribuicao d
WHERE d.lead_uid = 'leads_distribuicao_crm_26:' || l.id::TEXT
  AND d.status IN ('esgotado', 'aguardando', 'standby')
  AND l.assigned_consultant_id IS NOT NULL
  AND l.atendimento_iniciado_em IS NULL;

UPDATE public.leads_manos_crm l
SET assigned_consultant_id = NULL
FROM public.lead_distribuicao d
WHERE d.lead_uid = 'leads_manos_crm:' || l.id::TEXT
  AND d.status IN ('esgotado', 'aguardando', 'standby')
  AND l.assigned_consultant_id IS NOT NULL
  AND l.atendimento_iniciado_em IS NULL;

UPDATE public.leads_compra l
SET assigned_consultant_id = NULL
FROM public.lead_distribuicao d
WHERE d.lead_uid = 'leads_compra:' || l.id::TEXT
  AND d.status IN ('esgotado', 'aguardando', 'standby')
  AND l.assigned_consultant_id IS NOT NULL
  AND l.atendimento_iniciado_em IS NULL;

-- Espelha também na própria roleta: 'esgotado' não guarda dono.
UPDATE public.lead_distribuicao
SET assigned_consultant_id = NULL
WHERE status = 'esgotado' AND assigned_consultant_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) Diagnóstico: o que sobra em cada Inbox, e por quê
--
--    Esta é a query que responde "por que tenho N leads na fila".
--    Rode depois do UPDATE acima.
-- ---------------------------------------------------------------------
SELECT
    c.name AS vendedor,
    COALESCE(d.status, 'sem linha na roleta') AS estado_na_roleta,
    count(*) AS leads,
    min(l.created_at)::date AS mais_antigo,
    max(l.created_at)::date AS mais_recente
FROM public.leads_unified_active l
JOIN public.consultants_manos_crm c ON c.id = l.assigned_consultant_id
LEFT JOIN public.lead_distribuicao d ON d.lead_uid = l.uid
WHERE l.atendimento_iniciado_em IS NULL
  AND (l.first_contact_at IS NULL OR l.first_contact_channel = 'ai_sdr')
  AND COALESCE(l.descarte_financeiro, FALSE) = FALSE
GROUP BY c.name, d.status
ORDER BY leads DESC;
