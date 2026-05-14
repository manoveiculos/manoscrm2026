-- Migração V3 - Foco, Performance e Reversão
-- Data: 2026-05-14

-- 1. Adição de colunas necessárias nas 3 tabelas de leads
DO $$ 
BEGIN
    -- leads_manos_crm
    ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS consultor_id UUID REFERENCES auth.users(id);
    ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS diagnostico_atendimento TEXT;
    ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS ultima_interacao_humana TIMESTAMP WITH TIME ZONE;
    ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS respondeu_follow_up BOOLEAN DEFAULT FALSE;

    -- leads_compra
    ALTER TABLE leads_compra ADD COLUMN IF NOT EXISTS consultor_id UUID REFERENCES auth.users(id);
    ALTER TABLE leads_compra ADD COLUMN IF NOT EXISTS diagnostico_atendimento TEXT;
    ALTER TABLE leads_compra ADD COLUMN IF NOT EXISTS ultima_interacao_humana TIMESTAMP WITH TIME ZONE;
    ALTER TABLE leads_compra ADD COLUMN IF NOT EXISTS respondeu_follow_up BOOLEAN DEFAULT FALSE;

    -- leads_distribuicao_crm_26
    ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS consultor_id UUID REFERENCES auth.users(id);
    ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS diagnostico_atendimento TEXT;
    ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS ultima_interacao_humana TIMESTAMP WITH TIME ZONE;
    ALTER TABLE leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS respondeu_follow_up BOOLEAN DEFAULT FALSE;
END $$;

-- 2. Tabela de Histórico de Follow-up (Agente de Reversão)
CREATE TABLE IF NOT EXISTS historico_followup (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id TEXT, -- UID unificado (tabela:id)
    mensagem_enviada TEXT,
    resposta_cliente TEXT,
    veiculo_ofertado TEXT,
    preco_real_estoque DECIMAL(12,2),
    enviado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Atualização da View leads_unified para incluir as novas colunas
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
    l.consultor_id                                          AS consultor_id,
    l.created_at                                            AS created_at,
    l.updated_at                                            AS updated_at,
    l.first_contact_at                                      AS first_contact_at,
    l.atendimento_iniciado_em                               AS atendimento_iniciado_em,
    l.atendimento_iniciado_por                               AS atendimento_iniciado_por,
    l.flagged_reversao                                      AS flagged_reversao,
    l.ultima_interacao_humana                               AS ultima_interacao_humana,
    l.diagnostico_atendimento                               AS diagnostico_atendimento,
    l.respondeu_follow_up                                   AS respondeu_follow_up,
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
    c.consultor_id                                          AS consultor_id,
    c.criado_em                                             AS created_at,
    c.updated_at                                            AS updated_at,
    c.first_contact_at                                      AS first_contact_at,
    c.atendimento_iniciado_em                               AS atendimento_iniciado_em,
    c.atendimento_iniciado_por                               AS atendimento_iniciado_por,
    c.flagged_reversao                                      AS flagged_reversao,
    c.ultima_interacao_humana                               AS ultima_interacao_humana,
    c.diagnostico_atendimento                               AS diagnostico_atendimento,
    c.respondeu_follow_up                                   AS respondeu_follow_up,
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
    d.consultor_id                                          AS consultor_id,
    d.criado_em                                             AS created_at,
    d.atualizado_em                                         AS updated_at,
    d.first_contact_at                                      AS first_contact_at,
    d.atendimento_iniciado_em                               AS atendimento_iniciado_em,
    d.atendimento_iniciado_por                               AS atendimento_iniciado_por,
    d.flagged_reversao                                      AS flagged_reversao,
    d.ultima_interacao_humana                               AS ultima_interacao_humana,
    d.diagnostico_atendimento                               AS diagnostico_atendimento,
    d.respondeu_follow_up                                   AS respondeu_follow_up,
    'venda'                                                 AS flow_type
FROM leads_distribuicao_crm_26 d;

-- Recriar view ativa
CREATE OR REPLACE VIEW leads_unified_active AS
SELECT * FROM leads_unified
WHERE LOWER(COALESCE(status, '')) NOT IN
    ('vendido', 'perdido', 'comprado', 'finalizado', 'lost', 'lost_by_inactivity');
