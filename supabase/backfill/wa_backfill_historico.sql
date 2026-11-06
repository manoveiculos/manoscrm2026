-- ===========================================================================
-- BACKFILL do histórico de WhatsApp → wa_conversas / wa_mensagens
-- Fase 2 da repaginação (Growth 360) · NÃO RODAR sem o "aprovado" do Alexandre
--
-- Pré-requisito: migration 20261104_wa_whatsapp_loja.sql aplicada.
--
-- Fontes (ficam intactas, só leitura):
--   concessionaria_mensagens  memória da Laura (n8n): type human → cliente,
--                             ai → laura. Ponte para o telefone: dados_cliente
--                             (sessionid → telefone). Só texto.
--   whatsapp_messages         histórico antigo do CRM (webhook até 03/07 e
--                             extensão do Chrome): inbound → cliente,
--                             outbound → vendedor. Telefone pelo lead.
--
-- Fica de fora:
--   - sessão da Laura cujo telefone é de um consultor (avisos internos tipo
--     "Novo Lead Google" mandados ao vendedor). Em 04/11: 2.768 mensagens.
--   - sessão sem ponte em dados_cliente (76 mensagens em 04/11).
--   - mensagem vazia (chamada de ferramenta da IA).
--   - memória da Laura POSTERIOR à 1ª mensagem gravada ao vivo pelo modo
--     sombra (origem 'evolution'): essa já entrou pela ingestão e não duplica.
--
-- Marcação para revisar na tela (extra):
--   possivel_descricao_imagem  texto da IA que descreve foto ("Interior de um
--                              carro…"). ~18,9 mil em 04/11.
--   possivel_aviso_interno     começa com "*Novo Lead" ou "🚨".
--
-- Idempotente: provider_message_id = 'legado:cm:<id>' / 'legado:wm:<id>'
-- (UNIQUE). Rodar de novo não duplica.
--
-- Como rodar (SQL Editor, conexão de dono):
--   1. rode o PASSO 0 e anote os números;
--   2. rode do BEGIN até a CONFERÊNCIA;
--   3. se a conferência bater com a prévia, rode COMMIT; senão, ROLLBACK.
--
-- REVERSÃO (só o que o backfill criou):
--   DELETE FROM public.wa_mensagens WHERE origem IN ('backfill_laura', 'backfill_whatsapp_messages');
--   DELETE FROM public.wa_conversas c
--    WHERE NOT EXISTS (SELECT 1 FROM public.wa_mensagens m WHERE m.conversa_id = c.id);
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- PASSO 0 — PRÉVIA (só leitura)
-- ---------------------------------------------------------------------------
WITH vendedores AS (
    SELECT DISTINCT right(regexp_replace(t, '\D', '', 'g'), 8) AS k8
      FROM public.consultants_manos_crm c,
           LATERAL (VALUES (c.personal_whatsapp), (c.phone)) v(t)
     WHERE length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 8
), ponte AS (
    SELECT d.sessionid, public.wa_telefone_key(d.telefone) AS k
      FROM public.dados_cliente d
     WHERE d.sessionid IS NOT NULL
), corte AS (
    -- só o que é ANTERIOR à 1ª mensagem gravada ao vivo (modo sombra): não duplica
    SELECT coalesce(min(criada_em), 'infinity'::timestamptz) AS t FROM public.wa_mensagens WHERE origem = 'evolution'
)
SELECT
    count(*) FILTER (WHERE p.k IS NOT NULL AND right(p.k, 8) NOT IN (SELECT k8 FROM vendedores)
                     AND m.message ->> 'type' IN ('human', 'ai')
                     AND coalesce(m.message ->> 'content', '') <> ''
                     AND (m.data AT TIME ZONE 'UTC') < (SELECT t FROM corte)) AS laura_a_importar,
    count(DISTINCT p.k) FILTER (WHERE p.k IS NOT NULL
                     AND right(p.k, 8) NOT IN (SELECT k8 FROM vendedores))          AS laura_conversas,
    count(*) FILTER (WHERE p.k IS NOT NULL AND right(p.k, 8) IN (SELECT k8 FROM vendedores)) AS laura_fora_vendedor,
    count(*) FILTER (WHERE p.k IS NULL)                                              AS laura_fora_sem_ponte,
    (SELECT count(*) FROM public.whatsapp_messages w
      WHERE coalesce(w.message_text, '') <> '')                                       AS whatsapp_messages_candidatas
FROM public.concessionaria_mensagens m
LEFT JOIN ponte p ON p.sessionid = m.session_id;


BEGIN;

-- ---------------------------------------------------------------------------
-- PASSO 1 — conversas a partir da memória da Laura
-- ---------------------------------------------------------------------------
WITH vendedores AS (
    SELECT DISTINCT right(regexp_replace(t, '\D', '', 'g'), 8) AS k8
      FROM public.consultants_manos_crm c,
           LATERAL (VALUES (c.personal_whatsapp), (c.phone)) v(t)
     WHERE length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 8
), ponte AS (
    SELECT d.sessionid, public.wa_telefone_key(d.telefone) AS k, nullif(trim(d.nome), '') AS nome
      FROM public.dados_cliente d
     WHERE d.sessionid IS NOT NULL
), corte AS (
    -- só o que é ANTERIOR à 1ª mensagem gravada ao vivo (modo sombra): não duplica
    SELECT coalesce(min(criada_em), 'infinity'::timestamptz) AS t FROM public.wa_mensagens WHERE origem = 'evolution'
), msgs AS (
    SELECT p.k, p.nome, (m.data AT TIME ZONE 'UTC') AS em
      FROM public.concessionaria_mensagens m
      JOIN ponte p ON p.sessionid = m.session_id
     WHERE p.k IS NOT NULL
       AND right(p.k, 8) NOT IN (SELECT k8 FROM vendedores)
       AND m.message ->> 'type' IN ('human', 'ai')
       AND coalesce(m.message ->> 'content', '') <> ''
       AND (m.data AT TIME ZONE 'UTC') < (SELECT t FROM corte)
)
INSERT INTO public.wa_conversas AS c (canal, telefone_key, nome_contato, ultima_mensagem_em, criada_em)
SELECT 'loja', k, max(nome), max(em), coalesce(min(em), now())
  FROM msgs
 GROUP BY k
ON CONFLICT (canal, telefone_key) DO UPDATE
    SET nome_contato       = coalesce(c.nome_contato, EXCLUDED.nome_contato),
        ultima_mensagem_em = greatest(c.ultima_mensagem_em, EXCLUDED.ultima_mensagem_em),
        criada_em          = least(c.criada_em, EXCLUDED.criada_em);


-- ---------------------------------------------------------------------------
-- PASSO 2 — mensagens da Laura
-- ---------------------------------------------------------------------------
WITH vendedores AS (
    SELECT DISTINCT right(regexp_replace(t, '\D', '', 'g'), 8) AS k8
      FROM public.consultants_manos_crm c,
           LATERAL (VALUES (c.personal_whatsapp), (c.phone)) v(t)
     WHERE length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 8
), ponte AS (
    SELECT d.sessionid, public.wa_telefone_key(d.telefone) AS k
      FROM public.dados_cliente d
     WHERE d.sessionid IS NOT NULL
), corte AS (
    -- só o que é ANTERIOR à 1ª mensagem gravada ao vivo (modo sombra): não duplica
    SELECT coalesce(min(criada_em), 'infinity'::timestamptz) AS t FROM public.wa_mensagens WHERE origem = 'evolution'
)
INSERT INTO public.wa_mensagens (
    conversa_id, provider_message_id, direcao, autor, tipo, texto, origem, extra, criada_em
)
SELECT
    c.id,
    'legado:cm:' || m.id,
    CASE WHEN m.message ->> 'type' = 'human' THEN 'in' ELSE 'out' END,
    CASE WHEN m.message ->> 'type' = 'human' THEN 'cliente' ELSE 'laura' END,
    'texto',
    m.message ->> 'content',
    'backfill_laura',
    jsonb_strip_nulls(jsonb_build_object(
        'legado', 'concessionaria_mensagens',
        'legado_id', m.id,
        'possivel_descricao_imagem',
            CASE WHEN m.message ->> 'type' = 'ai'
                  AND m.message ->> 'content' ~ '^(Interior|Imagem|A imagem|O carro na imagem)' THEN true END,
        'possivel_aviso_interno',
            CASE WHEN m.message ->> 'content' ~ '^(\*Novo Lead|🚨)' THEN true END
    )),
    coalesce(m.data AT TIME ZONE 'UTC', now())
FROM public.concessionaria_mensagens m
JOIN ponte p ON p.sessionid = m.session_id
JOIN public.wa_conversas c ON c.canal = 'loja' AND c.telefone_key = p.k
WHERE p.k IS NOT NULL
  AND right(p.k, 8) NOT IN (SELECT k8 FROM vendedores)
  AND m.message ->> 'type' IN ('human', 'ai')
  AND coalesce(m.message ->> 'content', '') <> ''
  AND (m.data AT TIME ZONE 'UTC') < (SELECT t FROM corte)
ON CONFLICT (provider_message_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- PASSO 3 — conversas a partir de whatsapp_messages (telefone pelo lead)
-- ---------------------------------------------------------------------------
WITH wm AS (
    SELECT w.created_at,
           public.wa_telefone_key(coalesce(d.telefone, mc.phone::text, ms.phone, lc.telefone)) AS k,
           coalesce(d.nome, mc.name::text, ms.name, lc.nome) AS nome
      FROM public.whatsapp_messages w
      LEFT JOIN public.leads_distribuicao_crm_26 d
             ON d.id = CASE WHEN w.lead_id ~ '^\d{1,9}$' THEN w.lead_id::integer END
      LEFT JOIN public.leads_manos_crm mc
             ON mc.id = CASE WHEN w.lead_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN w.lead_id::uuid END
      LEFT JOIN public.leads_master ms
             ON ms.id = CASE WHEN w.lead_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN w.lead_id::uuid END
      LEFT JOIN public.leads_compra lc ON lc.id = w.lead_compra_id
     WHERE coalesce(w.message_text, '') <> ''
)
INSERT INTO public.wa_conversas AS c (canal, telefone_key, nome_contato, ultima_mensagem_em, criada_em)
SELECT 'loja', k, max(nome), max(created_at), coalesce(min(created_at), now())
  FROM wm
 WHERE k IS NOT NULL
 GROUP BY k
ON CONFLICT (canal, telefone_key) DO UPDATE
    SET nome_contato       = coalesce(c.nome_contato, EXCLUDED.nome_contato),
        ultima_mensagem_em = greatest(c.ultima_mensagem_em, EXCLUDED.ultima_mensagem_em),
        criada_em          = least(c.criada_em, EXCLUDED.criada_em);


-- ---------------------------------------------------------------------------
-- PASSO 4 — mensagens de whatsapp_messages
-- ---------------------------------------------------------------------------
WITH wm AS (
    SELECT w.id, w.direction, w.message_text, w.message_id, w.created_at,
           public.wa_telefone_key(coalesce(d.telefone, mc.phone::text, ms.phone, lc.telefone)) AS k
      FROM public.whatsapp_messages w
      LEFT JOIN public.leads_distribuicao_crm_26 d
             ON d.id = CASE WHEN w.lead_id ~ '^\d{1,9}$' THEN w.lead_id::integer END
      LEFT JOIN public.leads_manos_crm mc
             ON mc.id = CASE WHEN w.lead_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN w.lead_id::uuid END
      LEFT JOIN public.leads_master ms
             ON ms.id = CASE WHEN w.lead_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN w.lead_id::uuid END
      LEFT JOIN public.leads_compra lc ON lc.id = w.lead_compra_id
     WHERE coalesce(w.message_text, '') <> ''
)
INSERT INTO public.wa_mensagens (
    conversa_id, provider_message_id, direcao, autor, tipo, texto, origem, extra, criada_em
)
SELECT
    c.id,
    'legado:wm:' || wm.id,
    CASE WHEN wm.direction = 'inbound' THEN 'in' ELSE 'out' END,
    CASE WHEN wm.direction = 'inbound' THEN 'cliente' ELSE 'vendedor' END,
    'texto',
    wm.message_text,
    'backfill_whatsapp_messages',
    jsonb_strip_nulls(jsonb_build_object(
        'legado', 'whatsapp_messages', 'legado_id', wm.id, 'message_id', wm.message_id)),
    coalesce(wm.created_at, now())
FROM wm
JOIN public.wa_conversas c ON c.canal = 'loja' AND c.telefone_key = wm.k
WHERE wm.k IS NOT NULL
ON CONFLICT (provider_message_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- PASSO 5 — liga as conversas aos leads e copia o vendedor (de uma vez, sem laço)
-- ---------------------------------------------------------------------------
WITH l AS (
    SELECT DISTINCT ON (k) k, id, assigned_consultant_id
      FROM (SELECT public.wa_telefone_key(telefone) AS k, id, assigned_consultant_id, archived_at, created_at
              FROM public.leads_distribuicao_crm_26) x
     WHERE k IS NOT NULL
     ORDER BY k, (archived_at IS NULL) DESC, created_at DESC NULLS LAST, id DESC
)
UPDATE public.wa_conversas c
   SET lead_uid = 'leads_distribuicao_crm_26:' || l.id,
       assigned_consultant_id = l.assigned_consultant_id
  FROM l
 WHERE c.lead_uid IS NULL
   AND c.telefone_key = l.k;

WITH l AS (
    SELECT DISTINCT ON (k) k, id, assigned_consultant_id
      FROM (SELECT public.wa_telefone_key(phone) AS k, id, assigned_consultant_id, archived_at, created_at
              FROM public.leads_master) x
     WHERE k IS NOT NULL
     ORDER BY k, (archived_at IS NULL) DESC, created_at DESC NULLS LAST
)
UPDATE public.wa_conversas c
   SET lead_uid = 'leads_master:' || l.id,
       assigned_consultant_id = l.assigned_consultant_id
  FROM l
 WHERE c.lead_uid IS NULL
   AND c.telefone_key = l.k;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — compare com a PRÉVIA antes de decidir
-- ---------------------------------------------------------------------------
SELECT
    (SELECT count(*) FROM public.wa_mensagens WHERE origem = 'backfill_laura')               AS laura_importadas,
    (SELECT count(*) FROM public.wa_mensagens WHERE origem = 'backfill_whatsapp_messages')   AS whatsapp_messages_importadas,
    (SELECT count(*) FROM public.wa_conversas)                                               AS conversas,
    (SELECT count(*) FROM public.wa_conversas WHERE lead_uid IS NOT NULL)                    AS conversas_com_lead,
    (SELECT count(*) FROM public.wa_conversas WHERE assigned_consultant_id IS NULL)          AS conversas_sem_vendedor,
    (SELECT count(*) FROM public.wa_mensagens WHERE extra ? 'possivel_descricao_imagem')     AS marcadas_descricao_imagem;

-- Números batem?  COMMIT;   Não batem?  ROLLBACK;
