-- ============================================================================
-- Inbox — leads_unified_active passa a RESPEITAR archived_at + esconder 'frio'
-- Data: 2026-07-11
-- ============================================================================
-- PROBLEMA (medido em prod em 2026-07-11):
--   A Inbox mostrava ~503 leads, mas 484 já estavam com archived_at preenchido
--   (arquivados pelo botão "Limpar +5d" e pelo cron zombie-triage) e 4 em
--   status 'frio'. A view leads_unified_active só filtrava status finais
--   (vendido/perdido/lost/...), NUNCA archived_at nem 'frio'. Resultado: toda a
--   limpeza que já rodou era cosmeticamente inútil — os leads voltavam pra tela.
--   Pior: zombie-triage "arquivava" setando status='frio' + updated_at=now(),
--   resetando a idade → zumbi imortal que reaparecia "fresco" a cada rodada.
--
-- FIX: recriar a view somando `archived_at IS NULL` e `status <> 'frio'`.
--   Só muda o WHERE — a lista de colunas é idêntica, então CREATE OR REPLACE
--   não quebra dependentes (não removemos nenhuma coluna).
--
-- EFEITO ESPERADO: Inbox de todos os consultores cai de ~503 -> ~15 leads reais.
--   Reversível: basta recriar a view sem as duas cláusulas novas.
-- ============================================================================

CREATE OR REPLACE VIEW leads_unified_active AS
 SELECT uid,
    table_name,
    native_id,
    name,
    phone,
    vehicle_interest,
    source,
    ai_score,
    ai_classification,
    status,
    proxima_acao,
    assigned_consultant_id,
    created_at,
    updated_at,
    first_contact_at,
    atendimento_iniciado_em,
    atendimento_iniciado_por,
    flagged_reversao,
    ultima_interacao_humana,
    diagnostico_atendimento,
    respondeu_follow_up,
    descarte_financeiro,
    archived_at,
    first_contact_channel,
    flow_type
   FROM leads_unified
  WHERE lower(COALESCE(status, ''::character varying)::text) <> ALL (
            ARRAY['vendido'::text, 'perdido'::text, 'comprado'::text,
                  'finalizado'::text, 'lost'::text, 'lost_by_inactivity'::text])
    AND archived_at IS NULL
    AND lower(COALESCE(status, ''::character varying)::text) <> 'frio';
