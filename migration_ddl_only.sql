-- ===========================================================================
-- DDL FINAL — Rode APÓS o script Node.js ter completado com sucesso
-- Apenas 3 operações: colunas, VIEW, trigger de merge
-- ===========================================================================

-- PASSO A: Adicionar colunas que faltam no leads_master
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

-- PASSO B: Garantir UNIQUE em phone (evita duplicatas futuras)
ALTER TABLE public.leads_master
  DROP CONSTRAINT IF EXISTS leads_master_phone_unique;
ALTER TABLE public.leads_master
  ADD CONSTRAINT leads_master_phone_unique UNIQUE (phone);

-- PASSO C: Atualizar VIEW — agora simples, só leads_master
CREATE OR REPLACE VIEW public.leads AS
SELECT
  id::text                                     AS id,
  COALESCE(name, '')                           AS name,
  phone,
  email,
  COALESCE(source, 'Meta Ads')                AS source,
  COALESCE(origem, source, 'Meta Ads')        AS origem,
  vehicle_interest,
  COALESCE(interesse, vehicle_interest)       AS interesse,
  COALESCE(ai_score, 0)                       AS ai_score,
  ai_classification,
  ai_summary,
  ai_reason,
  CASE LOWER(TRIM(COALESCE(status, 'received')))
    WHEN 'novo'        THEN 'received'
    WHEN 'new'         THEN 'received'
    WHEN 'received'    THEN 'received'
    WHEN 'aguardando'  THEN 'received'
    WHEN 'attempt'     THEN 'attempt'
    WHEN 'contacted'   THEN 'contacted'
    WHEN 'scheduled'   THEN 'scheduled'
    WHEN 'visited'     THEN 'visited'
    WHEN 'negotiation' THEN 'negotiation'
    WHEN 'closed'      THEN 'closed'
    WHEN 'lost'        THEN 'lost'
    ELSE COALESCE(status, 'received')
  END                                          AS status,
  assigned_consultant_id,
  COALESCE(created_at, NOW())                AS created_at,
  COALESCE(updated_at, NOW())                AS updated_at,
  valor_investimento,
  metodo_compra,
  carro_troca,
  COALESCE(region, city)                     AS region,
  response_time_seconds,
  scheduled_at,
  observacoes,
  vendedor,
  ai_summary                                  AS resumo_consultor,
  next_step                                   AS proxima_acao,
  COALESCE(source_table, 'leads_master')     AS source_table,
  1                                           AS priority
FROM public.leads_master
WHERE phone IS NOT NULL AND trim(phone) != '';

-- PASSO D: Trigger de merge automático para novos leads
CREATE OR REPLACE FUNCTION public.merge_lead_on_conflict()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.phone := regexp_replace(COALESCE(NEW.phone, ''), '[^0-9]', '', 'g');
  IF NEW.phone = '' OR NEW.phone IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.leads_master WHERE phone = NEW.phone AND id != COALESCE(NEW.id, gen_random_uuid())) THEN
    UPDATE public.leads_master SET
      name                   = COALESCE(NULLIF(name, ''), NULLIF(NEW.name, '')),
      email                  = COALESCE(email, NEW.email),
      vehicle_interest       = COALESCE(NULLIF(vehicle_interest, ''), NULLIF(NEW.vehicle_interest, '')),
      interesse              = COALESCE(NULLIF(interesse, ''), NULLIF(NEW.interesse, '')),
      ai_score               = GREATEST(COALESCE(ai_score, 0), COALESCE(NEW.ai_score, 0)),
      ai_summary             = COALESCE(NULLIF(ai_summary, ''), NULLIF(NEW.ai_summary, '')),
      next_step              = COALESCE(NULLIF(next_step, ''), NULLIF(NEW.next_step, '')),
      valor_investimento     = COALESCE(NULLIF(valor_investimento, ''), NULLIF(NEW.valor_investimento, '')),
      region                 = COALESCE(NULLIF(region, ''), NULLIF(NEW.region, '')),
      source                 = COALESCE(NULLIF(source, ''), NULLIF(NEW.source, '')),
      vendedor               = COALESCE(NULLIF(vendedor, ''), NULLIF(NEW.vendedor, '')),
      assigned_consultant_id = COALESCE(assigned_consultant_id, NEW.assigned_consultant_id),
      updated_at             = NOW()
    WHERE phone = NEW.phone;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merge_lead_on_conflict ON public.leads_master;
CREATE TRIGGER trg_merge_lead_on_conflict
  BEFORE INSERT ON public.leads_master
  FOR EACH ROW EXECUTE FUNCTION public.merge_lead_on_conflict();

-- VERIFICAÇÃO FINAL
SELECT
  COUNT(*)                   AS total_leads,
  COUNT(DISTINCT phone)      AS telefones_unicos,
  COUNT(*) - COUNT(DISTINCT phone) AS duplicatas
FROM public.leads_master;

SELECT COUNT(*) AS total_na_view FROM public.leads;
