-- Sprint 4 — View leads_unified
--
-- Apresenta leads_manos_crm + leads_compra + leads_distribuicao_crm_26 como
-- uma fila única para o /inbox, /lead/[id] e dashboard. Mantém as tabelas
-- nativas intocadas (escrita ainda vai para a tabela canônica de cada fluxo).
--
-- Convenções:
--   uid = "<table>:<id>" — pra preservar unicidade global na fila
--   table_name e native_id permitem rotear updates pra tabela certa

CREATE OR REPLACE VIEW leads_unified AS
SELECT
    'leads_manos_crm:' || l.id::text                       AS uid,
    'leads_manos_crm'                                       AS table_name,
    l.id::text                                              AS native_id,
    l.name                                                  AS name,
    l.phone                                                 AS phone,
    l.vehicle_interest                                      AS vehicle_interest,
    l.source                                                AS source,
    l.ai_score                                              AS ai_score,
    l.ai_classification                                     AS ai_classification,
    l.status                                                AS status,
    l.proxima_acao                                          AS proxima_acao,
    l.assigned_consultant_id                                AS assigned_consultant_id,
    l.created_at                                            AS created_at,
    l.updated_at                                            AS updated_at,
    l.first_contact_at                                      AS first_contact_at,
    'venda'                                                 AS flow_type
FROM leads_manos_crm l

UNION ALL

SELECT
    'leads_compra:' || c.id::text                           AS uid,
    'leads_compra'                                          AS table_name,
    c.id::text                                              AS native_id,
    c.nome                                                  AS name,
    c.telefone                                              AS phone,
    c.veiculo_original                                      AS vehicle_interest,
    c.origem                                                AS source,
    c.ai_score                                              AS ai_score,
    c.ai_classification                                     AS ai_classification,
    c.status                                                AS status,
    c.proxima_acao                                          AS proxima_acao,
    c.assigned_consultant_id                                AS assigned_consultant_id,
    c.criado_em                                             AS created_at,
    c.updated_at                                            AS updated_at,
    c.first_contact_at                                      AS first_contact_at,
    'compra'                                                AS flow_type
FROM leads_compra c

UNION ALL

SELECT
    'leads_distribuicao_crm_26:' || d.id::text              AS uid,
    'leads_distribuicao_crm_26'                             AS table_name,
    d.id::text                                              AS native_id,
    d.nome                                                  AS name,
    d.telefone                                              AS phone,
    NULL                                                    AS vehicle_interest,
    d.origem                                                AS source,
    d.ai_score                                              AS ai_score,
    d.ai_classification                                     AS ai_classification,
    d.status                                                AS status,
    NULL                                                    AS proxima_acao,
    d.assigned_consultant_id                                AS assigned_consultant_id,
    d.criado_em                                             AS created_at,
    d.atualizado_em                                         AS updated_at,
    d.first_contact_at                                      AS first_contact_at,
    'venda'                                                 AS flow_type
FROM leads_distribuicao_crm_26 d;

COMMENT ON VIEW leads_unified IS
    'Fila única consumida por /inbox, /lead/[id] e dashboard. UID composto = "<table>:<id>".';

-- Status finais por tabela (mapa pra dashboard e SLA watcher)
CREATE OR REPLACE VIEW leads_unified_active AS
SELECT * FROM leads_unified
WHERE LOWER(COALESCE(status, '')) NOT IN
    ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity');
