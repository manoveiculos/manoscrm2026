## Contexto do projeto

Sistema CRM para Manos Veículos (Next.js 15 + Supabase). Estamos consolidando 3 tabelas de leads em uma única fonte de verdade (`leads_master`) sem perder nenhum dado e sem quebrar o sistema V1 que está em produção.

---

## Estado atual do banco (verificado hoje)

| Tabela | Registros |
|---|---|
| `leads_master` | 975 |
| `leads_manos_crm` | 39 |
| `leads_distribuicao_crm_26` | 624 |
| VIEW `leads` | 390 (desatualizada, não inclui leads_master) |

O problema: a VIEW `leads` que o sistema usa para exibir leads **não inclui** `leads_master`, então 975 leads estão invisíveis no CRM.

A migração de dados já foi executada via script Node.js com sucesso:
- leads de `leads_manos_crm` foram mergeados em `leads_master`
- leads de `leads_distribuicao_crm_26` foram mergeados em `leads_master`
- Nenhum lead foi deletado das tabelas originais (V1 continua funcionando)

---

## O que precisa ser feito agora (apenas DDL)

São exatamente **4 operações** no banco. Execute uma por vez, verificando o resultado antes de avançar.

---

### OPERAÇÃO 1 — Verificação antes de qualquer mudança

```sql
SELECT COUNT(*) AS total_master FROM public.leads_master;
SELECT COUNT(*) AS total_view FROM public.leads;
SELECT COUNT(*) AS total_manos FROM public.leads_manos_crm;
SELECT COUNT(*) AS total_crm26 FROM public.leads_distribuicao_crm_26;
```

**Esperado:** master=975, view=390, manos=39, crm26=624

Só continue se os números baterem.

---

### OPERAÇÃO 2 — Adicionar UNIQUE constraint em phone

```sql
ALTER TABLE public.leads_master
  ADD CONSTRAINT leads_master_phone_unique UNIQUE (phone);
```

**Verificar após:**
```sql
SELECT COUNT(*) AS total, COUNT(DISTINCT phone) AS unicos FROM public.leads_master;
```
`total` deve ser igual a `unicos`. Se não for, há duplicatas — me avise antes de continuar.

---

### OPERAÇÃO 3 — Atualizar a VIEW leads (crítico)

Esta é a operação principal. Substitui a VIEW antiga (que não incluía leads_master) por uma nova que aponta só para leads_master.

```sql
CREATE OR REPLACE VIEW public.leads AS
SELECT
  id::text AS id,
  COALESCE(name, '') AS name,
  phone,
  email,
  COALESCE(source, 'Meta Ads') AS source,
  COALESCE(source, 'Meta Ads') AS origem,
  vehicle_interest,
  vehicle_interest AS interesse,
  COALESCE(ai_score, 0) AS ai_score,
  ai_classification,
  ai_summary,
  ai_reason,
  CASE LOWER(TRIM(COALESCE(status, 'received')))
    WHEN 'novo'        THEN 'received'
    WHEN 'new'         THEN 'received'
    WHEN 'received'    THEN 'received'
    WHEN 'attempt'     THEN 'attempt'
    WHEN 'contacted'   THEN 'contacted'
    WHEN 'scheduled'   THEN 'scheduled'
    WHEN 'visited'     THEN 'visited'
    WHEN 'negotiation' THEN 'negotiation'
    WHEN 'closed'      THEN 'closed'
    WHEN 'lost'        THEN 'lost'
    ELSE COALESCE(status, 'received')
  END AS status,
  assigned_consultant_id,
  COALESCE(created_at, NOW()) AS created_at,
  COALESCE(updated_at, NOW()) AS updated_at,
  valor_investimento,
  NULL::text        AS metodo_compra,
  NULL::text        AS carro_troca,
  city              AS region,
  NULL::int         AS response_time_seconds,
  NULL::timestamptz AS scheduled_at,
  NULL::text        AS observacoes,
  primeiro_vendedor AS vendedor,
  ai_summary        AS resumo_consultor,
  next_step         AS proxima_acao,
  'leads_master'    AS source_table,
  1                 AS priority
FROM public.leads_master
WHERE phone IS NOT NULL
  AND trim(phone) != '';
```

**Verificar após:**
```sql
SELECT COUNT(*) AS total_na_view FROM public.leads;
```
Deve retornar próximo de 975 (todos os leads do master com telefone válido).

---

### OPERAÇÃO 4 — Criar trigger de merge automático

Este trigger impede duplicatas futuras: quando chegar um lead com telefone já existente, faz merge automático ao invés de criar um segundo registro.

```sql
CREATE OR REPLACE FUNCTION public.merge_lead_on_conflict()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.phone := regexp_replace(COALESCE(NEW.phone, ''), '[^0-9]', '', 'g');

  IF COALESCE(NEW.phone, '') = '' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.leads_master
    WHERE phone = NEW.phone
      AND id != COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    UPDATE public.leads_master SET
      name                   = COALESCE(NULLIF(name, ''), NULLIF(NEW.name, '')),
      email                  = COALESCE(email, NEW.email),
      vehicle_interest       = COALESCE(NULLIF(vehicle_interest, ''), NULLIF(NEW.vehicle_interest, '')),
      ai_summary             = COALESCE(NULLIF(ai_summary, ''), NULLIF(NEW.ai_summary, '')),
      next_step              = COALESCE(NULLIF(next_step, ''), NULLIF(NEW.next_step, '')),
      valor_investimento     = COALESCE(NULLIF(valor_investimento, ''), NULLIF(NEW.valor_investimento, '')),
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
  FOR EACH ROW
  EXECUTE FUNCTION public.merge_lead_on_conflict();
```

**Verificar após:**
```sql
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'leads_master';
```
Deve aparecer `trg_merge_lead_on_conflict` na lista.

---

### VERIFICAÇÃO FINAL COMPLETA

```sql
SELECT
  (SELECT COUNT(*) FROM public.leads_master)            AS master_total,
  (SELECT COUNT(DISTINCT phone) FROM public.leads_master) AS master_unicos,
  (SELECT COUNT(*) FROM public.leads)                   AS view_total,
  (SELECT COUNT(*) FROM public.leads_manos_crm)         AS manos_intacto,
  (SELECT COUNT(*) FROM public.leads_distribuicao_crm_26) AS crm26_intacto;
```

**Resultado esperado:**
- `master_total` = `master_unicos` (zero duplicatas)
- `view_total` ≈ `master_total` (todos os leads visíveis)
- `manos_intacto` = 39 (V1 intacta, nada deletado)
- `crm26_intacto` = 624 (V1 intacta, nada deletado)

---

## O que NÃO fazer

- Não deletar nada das tabelas `leads_manos_crm` ou `leads_distribuicao_crm_26`
- Não alterar estrutura dessas tabelas (V1 depende delas)
- Não rodar as operações fora de ordem
- Se qualquer verificação retornar número errado, parar e reportar antes de continuar

---

## Rollback de emergência (se algo der errado na OPERAÇÃO 3)

```sql
-- Restaura a VIEW antiga (3 fontes com deduplicação por telefone)
CREATE OR REPLACE VIEW public.leads AS
WITH all_sources AS (
  SELECT 'main_'||id::text AS id, name, phone, email, source, source AS origem,
    vehicle_interest, vehicle_interest AS interesse, COALESCE(ai_score,0) AS ai_score,
    ai_classification, ai_summary, ai_reason, status, assigned_consultant_id,
    created_at, updated_at, valor_investimento, metodo_compra, carro_troca,
    region, NULL::int AS response_time_seconds, scheduled_at, observacoes,
    NULL::text AS vendedor, NULL::text AS resumo_consultor, NULL::text AS proxima_acao,
    'leads_manos_crm' AS source_table, 2 AS priority
  FROM public.leads_manos_crm
  UNION ALL
  SELECT 'crm26_'||id::text AS id, nome AS name, telefone AS phone, NULL AS email,
    COALESCE(origem,'Meta Ads') AS source, origem, COALESCE(vehicle_interest,interesse),
    interesse, COALESCE(ai_score,0), ai_classification, resumo_consultor AS ai_summary,
    ai_reason, COALESCE(status,'received'), assigned_consultant_id,
    criado_em AS created_at, COALESCE(atualizado_em,criado_em) AS updated_at,
    valor_investimento, metodo_compra, carro_troca, cidade AS region,
    response_time_seconds, NULL::timestamptz, NULL::text, vendedor,
    resumo_consultor, proxima_acao, 'leads_distribuicao_crm_26', 3
  FROM public.leads_distribuicao_crm_26
  WHERE nome IS NOT NULL AND trim(nome)!='' AND telefone IS NOT NULL AND trim(telefone)!=''
  UNION ALL
  SELECT id::text, COALESCE(name,''), phone, email, COALESCE(source,'Meta Ads'),
    COALESCE(source,'Meta Ads'), vehicle_interest, vehicle_interest,
    COALESCE(ai_score,0), ai_classification, ai_summary, ai_reason,
    COALESCE(status,'received'), assigned_consultant_id,
    COALESCE(created_at,NOW()), COALESCE(updated_at,NOW()), valor_investimento,
    NULL::text, NULL::text, city AS region, NULL::int, NULL::timestamptz, NULL::text,
    primeiro_vendedor, ai_summary, next_step, 'leads_master', 1
  FROM public.leads_master WHERE phone IS NOT NULL AND trim(phone)!=''
)
SELECT DISTINCT ON (phone)
  id, name, phone, email, source, origem, vehicle_interest, interesse,
  ai_score, ai_classification, ai_summary, ai_reason, status,
  assigned_consultant_id, created_at, updated_at, valor_investimento,
  metodo_compra, carro_troca, region, response_time_seconds, scheduled_at,
  observacoes, vendedor, resumo_consultor, proxima_acao, source_table, priority
FROM all_sources
ORDER BY phone, priority ASC, created_at DESC;
```
