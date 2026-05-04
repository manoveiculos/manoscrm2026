-- ===========================================================================
-- MIGRAÇÃO COMPLETA: Consolidar tudo em leads_master (fonte única de verdade)
-- Execute os PASSOs em ordem no Supabase SQL Editor
-- Data: 2026-03-25
-- ===========================================================================


-- ===========================================================================
-- PASSO 1: Preparar leads_master para ser a fonte única
-- Adicionar colunas que faltam para absorver dados de todas as fontes
-- ===========================================================================

-- Campos extras que vêm do crm26 e manos_crm
ALTER TABLE public.leads_master
  ADD COLUMN IF NOT EXISTS origem         TEXT,
  ADD COLUMN IF NOT EXISTS interesse      TEXT,
  ADD COLUMN IF NOT EXISTS metodo_compra  TEXT,
  ADD COLUMN IF NOT EXISTS carro_troca    TEXT,
  ADD COLUMN IF NOT EXISTS observacoes    TEXT,
  ADD COLUMN IF NOT EXISTS vendedor       TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS ai_reason      TEXT,
  ADD COLUMN IF NOT EXISTS region         TEXT,
  ADD COLUMN IF NOT EXISTS source_table   TEXT DEFAULT 'leads_master';

-- Confirma
DO $$ BEGIN
  RAISE NOTICE 'PASSO 1 concluído: colunas adicionadas ao leads_master';
END $$;


-- ===========================================================================
-- PASSO 2: Função para normalizar telefone (remove não-dígitos)
-- Usada para deduplicação consistente
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.normalize_phone(p TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g')
$$;

DO $$ BEGIN
  RAISE NOTICE 'PASSO 2 concluído: função normalize_phone criada';
END $$;


-- ===========================================================================
-- PASSO 3: Normalizar telefones existentes no leads_master
-- Remove espaços, hífens, parênteses etc.
-- ===========================================================================

UPDATE public.leads_master
SET phone = normalize_phone(phone)
WHERE phone IS NOT NULL
  AND phone != normalize_phone(phone);

DO $$ BEGIN
  RAISE NOTICE 'PASSO 3 concluído: telefones do leads_master normalizados';
END $$;


-- ===========================================================================
-- PASSO 4: Remover duplicatas DENTRO do próprio leads_master
-- Mantém o registro mais recente por telefone
-- ===========================================================================

DELETE FROM public.leads_master
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY normalize_phone(phone)
             ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
           ) AS rn
    FROM public.leads_master
    WHERE phone IS NOT NULL AND trim(phone) != ''
  ) ranked
  WHERE rn > 1
);

DO $$ BEGIN
  RAISE NOTICE 'PASSO 4 concluído: duplicatas internas do leads_master removidas';
END $$;


-- ===========================================================================
-- PASSO 5: Adicionar unique constraint em phone (evita duplicatas futuras)
-- ===========================================================================

-- Primeiro, garante que não há duplicatas (PASSO 4 já fez isso)
ALTER TABLE public.leads_master
  DROP CONSTRAINT IF EXISTS leads_master_phone_unique;

ALTER TABLE public.leads_master
  ADD CONSTRAINT leads_master_phone_unique UNIQUE (phone);

DO $$ BEGIN
  RAISE NOTICE 'PASSO 5 concluído: UNIQUE constraint em leads_master.phone';
END $$;


-- ===========================================================================
-- PASSO 6: Migrar leads_manos_crm → leads_master
-- ON CONFLICT: não sobrescreve dados existentes, só preenche campos vazios
-- ===========================================================================

INSERT INTO public.leads_master (
  id,
  phone,
  name,
  email,
  source,
  origem,
  vehicle_interest,
  interesse,
  ai_score,
  ai_classification,
  ai_summary,
  ai_reason,
  status,
  assigned_consultant_id,
  vendedor,
  valor_investimento,
  metodo_compra,
  carro_troca,
  region,
  response_time_seconds,
  scheduled_at,
  observacoes,
  created_at,
  updated_at,
  source_table
)
SELECT
  id,
  normalize_phone(phone)                      AS phone,
  name,
  email,
  source,
  source                                      AS origem,
  vehicle_interest,
  vehicle_interest                            AS interesse,
  COALESCE(ai_score, 0),
  ai_classification,
  ai_summary,
  ai_reason,
  -- Normaliza status legado
  CASE LOWER(COALESCE(status, 'received'))
    WHEN 'new'         THEN 'received'
    WHEN 'received'    THEN 'received'
    WHEN 'attempt'     THEN 'attempt'
    WHEN 'contacted'   THEN 'contacted'
    WHEN 'scheduled'   THEN 'scheduled'
    WHEN 'visited'     THEN 'visited'
    WHEN 'negotiation' THEN 'negotiation'
    WHEN 'proposed'    THEN 'negotiation'
    WHEN 'closed'      THEN 'closed'
    WHEN 'lost'        THEN 'lost'
    ELSE COALESCE(status, 'received')
  END                                         AS status,
  assigned_consultant_id,
  NULL                                        AS vendedor,
  valor_investimento,
  metodo_compra,
  carro_troca,
  region,
  response_time_seconds,
  scheduled_at,
  observacoes,
  created_at,
  updated_at,
  'leads_manos_crm'                           AS source_table
FROM public.leads_manos_crm
WHERE normalize_phone(phone) IS NOT NULL
  AND normalize_phone(phone) != ''

ON CONFLICT (phone) DO UPDATE SET
  -- Preenche campos vazios no master com dados do manos_crm (nunca sobrescreve)
  name                   = COALESCE(NULLIF(leads_master.name, ''), EXCLUDED.name),
  email                  = COALESCE(leads_master.email, EXCLUDED.email),
  vehicle_interest       = COALESCE(NULLIF(leads_master.vehicle_interest, ''), EXCLUDED.vehicle_interest),
  ai_score               = GREATEST(COALESCE(leads_master.ai_score, 0), COALESCE(EXCLUDED.ai_score, 0)),
  ai_summary             = COALESCE(NULLIF(leads_master.ai_summary, ''), EXCLUDED.ai_summary),
  valor_investimento     = COALESCE(NULLIF(leads_master.valor_investimento, ''), EXCLUDED.valor_investimento),
  region                 = COALESCE(NULLIF(leads_master.region, ''), EXCLUDED.region),
  -- Consultor: nunca sobrescreve atribuição existente
  assigned_consultant_id = COALESCE(leads_master.assigned_consultant_id, EXCLUDED.assigned_consultant_id),
  updated_at             = NOW();

DO $$ BEGIN
  RAISE NOTICE 'PASSO 6 concluído: leads_manos_crm migrado para leads_master';
END $$;


-- ===========================================================================
-- PASSO 7: Migrar leads_distribuicao_crm_26 → leads_master
-- Mesma lógica de merge: preenche vazios, não sobrescreve
-- ===========================================================================

INSERT INTO public.leads_master (
  phone,
  name,
  email,
  source,
  origem,
  vehicle_interest,
  interesse,
  ai_score,
  ai_classification,
  ai_summary,
  ai_reason,
  status,
  assigned_consultant_id,
  vendedor,
  valor_investimento,
  metodo_compra,
  carro_troca,
  region,
  response_time_seconds,
  observacoes,
  created_at,
  updated_at,
  source_table,
  next_step
)
SELECT
  normalize_phone(d.telefone)                 AS phone,
  d.nome                                      AS name,
  NULL                                        AS email,
  COALESCE(d.origem, 'Meta Ads')              AS source,
  d.origem                                    AS origem,
  COALESCE(d.vehicle_interest, d.interesse)   AS vehicle_interest,
  d.interesse                                 AS interesse,
  COALESCE(d.ai_score, 0)                     AS ai_score,
  d.ai_classification,
  d.resumo_consultor                          AS ai_summary,
  d.ai_reason,
  CASE LOWER(TRIM(COALESCE(d.status, 'received')))
    WHEN 'novo'                    THEN 'received'
    WHEN 'nova'                    THEN 'received'
    WHEN 'new'                     THEN 'received'
    WHEN 'received'                THEN 'received'
    WHEN 'aguardando'              THEN 'received'
    WHEN 'aguardando atendimento'  THEN 'received'
    WHEN 'sem contato'             THEN 'received'
    WHEN 'em atendimento'          THEN 'attempt'
    WHEN 'contatado'               THEN 'contacted'
    WHEN 'attempt'                 THEN 'attempt'
    WHEN 'contacted'               THEN 'contacted'
    WHEN 'agendado'                THEN 'scheduled'
    WHEN 'agendamento'             THEN 'scheduled'
    WHEN 'scheduled'               THEN 'scheduled'
    WHEN 'visitou'                 THEN 'visited'
    WHEN 'visita realizada'        THEN 'visited'
    WHEN 'visited'                 THEN 'visited'
    WHEN 'negociando'              THEN 'negotiation'
    WHEN 'negociação'              THEN 'negotiation'
    WHEN 'negotiation'             THEN 'negotiation'
    WHEN 'venda realizada'         THEN 'closed'
    WHEN 'vendido'                 THEN 'closed'
    WHEN 'fechado'                 THEN 'closed'
    WHEN 'closed'                  THEN 'closed'
    WHEN 'perda total'             THEN 'lost'
    WHEN 'perdido'                 THEN 'lost'
    WHEN 'lost'                    THEN 'lost'
    WHEN 'desistiu'                THEN 'lost'
    WHEN 'sem interesse'           THEN 'lost'
    WHEN 'inativo'                 THEN 'lost'
    WHEN 'lixo'                    THEN 'lost'
    WHEN 'duplicado'               THEN 'lost'
    ELSE COALESCE(d.status, 'received')
  END                                         AS status,
  d.assigned_consultant_id,
  d.vendedor,
  d.valor_investimento,
  d.metodo_compra,
  d.carro_troca,
  d.cidade                                    AS region,
  d.response_time_seconds,
  NULL                                        AS observacoes,
  COALESCE(d.criado_em, NOW())               AS created_at,
  COALESCE(d.atualizado_em, NOW())           AS updated_at,
  'leads_distribuicao_crm_26'                AS source_table,
  d.proxima_acao                              AS next_step
FROM public.leads_distribuicao_crm_26 d
WHERE d.nome IS NOT NULL
  AND trim(d.nome) != ''
  AND d.telefone IS NOT NULL
  AND trim(d.telefone) != ''
  AND LOWER(COALESCE(d.status, '')) != 'lost_redistributed'
  AND normalize_phone(d.telefone) != ''

ON CONFLICT (phone) DO UPDATE SET
  name                   = COALESCE(NULLIF(leads_master.name, ''), EXCLUDED.name),
  email                  = COALESCE(leads_master.email, EXCLUDED.email),
  vehicle_interest       = COALESCE(NULLIF(leads_master.vehicle_interest, ''), EXCLUDED.vehicle_interest),
  interesse              = COALESCE(NULLIF(leads_master.interesse, ''), EXCLUDED.interesse),
  ai_score               = GREATEST(COALESCE(leads_master.ai_score, 0), COALESCE(EXCLUDED.ai_score, 0)),
  ai_summary             = COALESCE(NULLIF(leads_master.ai_summary, ''), EXCLUDED.ai_summary),
  next_step              = COALESCE(NULLIF(leads_master.next_step, ''), EXCLUDED.next_step),
  valor_investimento     = COALESCE(NULLIF(leads_master.valor_investimento, ''), EXCLUDED.valor_investimento),
  metodo_compra          = COALESCE(NULLIF(leads_master.metodo_compra, ''), EXCLUDED.metodo_compra),
  carro_troca            = COALESCE(NULLIF(leads_master.carro_troca, ''), EXCLUDED.carro_troca),
  region                 = COALESCE(NULLIF(leads_master.region, ''), EXCLUDED.region),
  vendedor               = COALESCE(NULLIF(leads_master.vendedor, ''), EXCLUDED.vendedor),
  -- Consultor: nunca sobrescreve atribuição existente
  assigned_consultant_id = COALESCE(leads_master.assigned_consultant_id, EXCLUDED.assigned_consultant_id),
  updated_at             = NOW();

DO $$ BEGIN
  RAISE NOTICE 'PASSO 7 concluído: leads_distribuicao_crm_26 migrado para leads_master';
END $$;


-- ===========================================================================
-- PASSO 8: Atualizar a VIEW 'leads' — agora aponta só para leads_master
-- VIEW simples, sem UNION, sem complexidade
-- ===========================================================================

CREATE OR REPLACE VIEW public.leads AS
SELECT
  id::text                                    AS id,
  COALESCE(name, '')                          AS name,
  phone,
  email,
  COALESCE(source, 'Meta Ads')               AS source,
  COALESCE(origem, source, 'Meta Ads')       AS origem,
  vehicle_interest,
  COALESCE(interesse, vehicle_interest)      AS interesse,
  COALESCE(ai_score, 0)                      AS ai_score,
  ai_classification,
  ai_summary,
  ai_reason,
  -- Normaliza status para garantir V2 sempre recebe valores corretos
  CASE LOWER(TRIM(COALESCE(status, 'received')))
    WHEN 'novo'        THEN 'received'
    WHEN 'nova'        THEN 'received'
    WHEN 'new'         THEN 'received'
    WHEN 'received'    THEN 'received'
    WHEN 'aguardando'  THEN 'received'
    WHEN 'sem contato' THEN 'received'
    WHEN 'attempt'     THEN 'attempt'
    WHEN 'contacted'   THEN 'contacted'
    WHEN 'scheduled'   THEN 'scheduled'
    WHEN 'visited'     THEN 'visited'
    WHEN 'negotiation' THEN 'negotiation'
    WHEN 'closed'      THEN 'closed'
    WHEN 'lost'        THEN 'lost'
    ELSE COALESCE(status, 'received')
  END                                         AS status,
  assigned_consultant_id,
  COALESCE(created_at, NOW())               AS created_at,
  COALESCE(updated_at, NOW())               AS updated_at,
  valor_investimento,
  metodo_compra,
  carro_troca,
  COALESCE(region, city)                    AS region,
  response_time_seconds,
  scheduled_at,
  observacoes,
  vendedor,
  ai_summary                                 AS resumo_consultor,
  next_step                                  AS proxima_acao,
  COALESCE(source_table, 'leads_master')    AS source_table,
  1                                          AS priority
FROM public.leads_master
WHERE phone IS NOT NULL
  AND trim(phone) != '';

DO $$ BEGIN
  RAISE NOTICE 'PASSO 8 concluído: VIEW leads atualizada — aponta só para leads_master';
END $$;


-- ===========================================================================
-- PASSO 9: Trigger de MERGE automático para novos leads duplicados
-- Quando n8n ou extensão inserir um lead com telefone já existente,
-- faz MERGE automático ao invés de rejeitar
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.merge_lead_on_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Normaliza o telefone antes de qualquer coisa
  NEW.phone := normalize_phone(NEW.phone);

  -- Se telefone vazio, deixa passar (vai falhar no NOT NULL, que é correto)
  IF NEW.phone = '' OR NEW.phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verifica se já existe um lead com esse telefone
  IF EXISTS (SELECT 1 FROM public.leads_master WHERE phone = NEW.phone AND id != NEW.id) THEN
    -- MERGE: atualiza o existente com dados novos (só preenche vazios)
    UPDATE public.leads_master SET
      name                   = COALESCE(NULLIF(name, ''), NULLIF(NEW.name, '')),
      email                  = COALESCE(email, NEW.email),
      vehicle_interest       = COALESCE(NULLIF(vehicle_interest, ''), NULLIF(NEW.vehicle_interest, '')),
      interesse              = COALESCE(NULLIF(interesse, ''), NULLIF(NEW.interesse, '')),
      ai_score               = GREATEST(COALESCE(ai_score, 0), COALESCE(NEW.ai_score, 0)),
      ai_summary             = COALESCE(NULLIF(ai_summary, ''), NULLIF(NEW.ai_summary, '')),
      ai_reason              = COALESCE(NULLIF(ai_reason, ''), NULLIF(NEW.ai_reason, '')),
      next_step              = COALESCE(NULLIF(next_step, ''), NULLIF(NEW.next_step, '')),
      valor_investimento     = COALESCE(NULLIF(valor_investimento, ''), NULLIF(NEW.valor_investimento, '')),
      region                 = COALESCE(NULLIF(region, ''), NULLIF(NEW.region, '')),
      source                 = COALESCE(NULLIF(source, ''), NULLIF(NEW.source, '')),
      origem                 = COALESCE(NULLIF(origem, ''), NULLIF(NEW.origem, '')),
      vendedor               = COALESCE(NULLIF(vendedor, ''), NULLIF(NEW.vendedor, '')),
      -- REGRA CRÍTICA: nunca sobrescreve consultor já atribuído
      assigned_consultant_id = COALESCE(assigned_consultant_id, NEW.assigned_consultant_id),
      updated_at             = NOW()
    WHERE phone = NEW.phone;

    -- Cancela o INSERT (já fez o UPDATE acima)
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merge_lead_on_conflict ON public.leads_master;
CREATE TRIGGER trg_merge_lead_on_conflict
  BEFORE INSERT ON public.leads_master
  FOR EACH ROW
  EXECUTE FUNCTION public.merge_lead_on_conflict();

DO $$ BEGIN
  RAISE NOTICE 'PASSO 9 concluído: trigger de merge automático criado';
END $$;


-- ===========================================================================
-- PASSO 10: VERIFICAÇÃO FINAL
-- ===========================================================================

SELECT
  COUNT(*)                    AS total_leads,
  COUNT(DISTINCT phone)       AS telefones_unicos,
  COUNT(*) - COUNT(DISTINCT phone) AS duplicatas_restantes,
  COUNT(CASE WHEN assigned_consultant_id IS NOT NULL THEN 1 END) AS com_consultor,
  COUNT(CASE WHEN assigned_consultant_id IS NULL THEN 1 END)     AS sem_consultor
FROM public.leads_master;

-- Ver por fonte de origem
SELECT source_table, COUNT(*) AS total
FROM public.leads_master
GROUP BY source_table
ORDER BY total DESC;

-- Confirmar VIEW
SELECT COUNT(*) AS total_na_view FROM public.leads;

-- ===========================================================================
-- RESULTADO ESPERADO:
-- total_leads = telefones_unicos (zero duplicatas)
-- total_na_view ≈ total_leads
-- Todos os ~800-1200 leads consolidados em leads_master
-- ===========================================================================
