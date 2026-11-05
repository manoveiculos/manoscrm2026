-- ===========================================================================
-- WHATSAPP DA LOJA DENTRO DO CRM — Fase 2 (modelo de dados) + Fase 4 (acesso)
-- Data: 2026-11-04 · Programa Growth 360 · NÃO APLICAR sem o "aprovado" do Alexandre
--
-- O que cria (só objetos NOVOS; nenhuma definição existente é alterada):
--   tabelas  wa_conversas, wa_mensagens, wa_acessos_log — RLS desde o início
--   funções  wa_telefone_key, wa_meu_consultant_id, wa_ve_todas,
--            wa_vincular_lead, wa_registrar_mensagem, wa_ia_pode_responder,
--            wa_tocar_conversa, wa_sync_vendedor_do_lead
--   gatilhos trg_wa_conversas_tocar (wa_conversas)
--            trg_wa_sync_vendedor em leads_distribuicao_crm_26 e leads_master
--            (só AFTER UPDATE OF assigned_consultant_id; erro vira WARNING e
--            nunca bloqueia a roleta)
--   bucket   whatsapp-midia, PRIVADO, sem nenhuma política em storage.objects
--   cron     wa-retencao-midia, 1x/dia, chama /api/cron/wa-retencao
--
-- Acesso (Fase 4):
--   vendedor  → só conversas com assigned_consultant_id = o seu
--               consultants_manos_crm.id (auth_id = auth.uid(), ativo)
--   gestor / admin (role 'gestor' ou 'admin', ativo) e o login do Alexandre → todas
--   sem vendedor atribuído → só gestor/admin
--   redistribuição → a conversa segue o lead; o anterior perde o acesso na hora
--                    e fica registrado em vendedor_anterior
--   vendedor desativado (is_active = false ou status <> 'active') → lê 0
--   anon → sem privilégio nenhum nas tabelas
--   authenticated → só SELECT (escrita é do servidor, com service_role)
--   bucket → nenhuma política para anon/authenticated: só o servidor lê,
--            depois de checar a permissão, e entrega URL assinada (Fase 3)
--
-- Risco: baixo. Tabelas novas e vazias. Os 2 gatilhos em tabelas de lead só
-- disparam quando muda o vendedor e só fazem UPDATE em wa_conversas.
--
-- REVERSÃO (nada antigo foi substituído, então é só remover):
--   select cron.unschedule('wa-retencao-midia');
--   drop trigger if exists trg_wa_sync_vendedor on public.leads_distribuicao_crm_26;
--   drop trigger if exists trg_wa_sync_vendedor on public.leads_master;
--   drop table if exists public.wa_acessos_log, public.wa_mensagens, public.wa_conversas;
--   drop function if exists public.wa_registrar_mensagem(jsonb), public.wa_vincular_lead(uuid),
--        public.wa_ia_pode_responder(text), public.wa_sync_vendedor_do_lead(),
--        public.wa_tocar_conversa(), public.wa_ve_todas(), public.wa_meu_consultant_id(),
--        public.wa_telefone_key(text);
--   bucket: esvaziar pela API do Storage e depois
--   delete from storage.buckets where id = 'whatsapp-midia';
--
-- Teste de RLS: supabase/tests/wa_rls.test.sql (roda dentro de BEGIN … ROLLBACK).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Chave do telefone (mesma regra de telefoneKey() em src/lib/whatsapp/evolutionParser.ts)
--    celular BR → DDD + 9 + 8 (11 dígitos, recoloca o 9º dígito que o JID às vezes perde)
--    fixo BR    → DDD + 8 (10 dígitos)
--    estrangeiro → número inteiro com DDI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_telefone_key(p_telefone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    WITH a AS (
        SELECT nullif(ltrim(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '0'), '') AS d
    ), b AS (
        SELECT CASE
            WHEN d IS NULL OR length(d) < 8 THEN NULL
            WHEN left(d, 2) = '55' AND length(d) IN (12, 13) THEN substr(d, 3)
            WHEN length(d) > 11 THEN '#' || d
            ELSE d
        END AS d
        FROM a
    )
    SELECT CASE
        WHEN d IS NULL THEN NULL
        WHEN left(d, 1) = '#' THEN substr(d, 2)
        WHEN length(d) = 10 AND substr(d, 3, 1) ~ '[6-9]' THEN left(d, 2) || '9' || substr(d, 3)
        WHEN length(d) IN (10, 11) THEN d
        ELSE NULL
    END
    FROM b
$$;


-- ---------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_conversas (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canal                  text NOT NULL DEFAULT 'loja' CHECK (canal IN ('loja')),
    telefone_key           text NOT NULL,
    remote_jid             text,
    nome_contato           text,
    -- '<tabela>:<id>', mesmo formato de leads_unified.uid. NULL = ainda sem lead.
    lead_uid               text,
    assigned_consultant_id uuid REFERENCES public.consultants_manos_crm(id) ON DELETE SET NULL,
    vendedor_anterior      uuid REFERENCES public.consultants_manos_crm(id) ON DELETE SET NULL,
    status                 text NOT NULL DEFAULT 'ia' CHECK (status IN ('ia', 'humano', 'encerrada')),
    ia_silenciada_ate      timestamptz,
    ultima_mensagem_em     timestamptz,
    nao_lidas_vendedor     integer NOT NULL DEFAULT 0 CHECK (nao_lidas_vendedor >= 0),
    criada_em              timestamptz NOT NULL DEFAULT now(),
    atualizada_em          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wa_conversas_canal_telefone_key UNIQUE (canal, telefone_key)
);

CREATE INDEX IF NOT EXISTS idx_wa_conversas_vendedor
    ON public.wa_conversas (assigned_consultant_id, ultima_mensagem_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conversas_lead_uid
    ON public.wa_conversas (lead_uid) WHERE lead_uid IS NOT NULL;

COMMENT ON TABLE public.wa_conversas IS
    'Uma conversa por telefone no número da loja. RLS: vendedor vê só as suas; gestor/admin todas.';


CREATE TABLE IF NOT EXISTS public.wa_mensagens (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id            uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
    -- id da mensagem no WhatsApp. UNIQUE = idempotência da ingestão.
    provider_message_id    text NOT NULL,
    direcao                text NOT NULL CHECK (direcao IN ('in', 'out')),
    autor                  text NOT NULL CHECK (autor IN ('cliente', 'laura', 'vendedor', 'sistema')),
    consultant_id          uuid REFERENCES public.consultants_manos_crm(id) ON DELETE SET NULL,
    tipo                   text NOT NULL DEFAULT 'texto' CHECK (tipo IN (
                               'texto', 'imagem', 'audio', 'video', 'documento',
                               'figurinha', 'localizacao', 'contato', 'reacao')),
    texto                  text,
    legenda                text,
    -- mídia: arquivo some do bucket em 30 dias; o registro (tipo, tamanho, data) fica
    midia_path             text,
    midia_mime             text,
    midia_bytes            bigint,
    midia_nome             text,
    midia_erro             text,
    midia_tentativas       smallint NOT NULL DEFAULT 0,
    duracao_s              integer,
    -- transcrição do áudio: fica para sempre
    transcricao            text,
    transcricao_tentativas smallint NOT NULL DEFAULT 0,
    -- localização (lat/lng), contatos (vCard), tipo original da Evolution
    extra                  jsonb,
    citada_message_id      text,
    status_entrega         text CHECK (status_entrega IN ('enviada', 'entregue', 'lida', 'falhou')),
    origem                 text NOT NULL DEFAULT 'evolution'
                               CHECK (origem IN ('evolution', 'crm', 'backfill_laura', 'backfill_whatsapp_messages')),
    editada_em             timestamptz,
    apagada_em             timestamptz,
    midia_expirada_em      timestamptz,
    -- horário da mensagem no WhatsApp (ou de quando chegou)
    criada_em              timestamptz NOT NULL DEFAULT now(),
    -- quando o CRM gravou (mede o aceite "em até 5 s" do modo sombra)
    recebida_em            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wa_mensagens_provider_message_id_key UNIQUE (provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_mensagens_conversa
    ON public.wa_mensagens (conversa_id, criada_em);
-- job de retenção: mídia ainda no bucket
CREATE INDEX IF NOT EXISTS idx_wa_mensagens_midia_viva
    ON public.wa_mensagens (criada_em) WHERE midia_path IS NOT NULL AND midia_expirada_em IS NULL;
-- reprocesso: áudio sem transcrição
CREATE INDEX IF NOT EXISTS idx_wa_mensagens_audio_sem_transcricao
    ON public.wa_mensagens (criada_em) WHERE tipo = 'audio' AND transcricao IS NULL;

COMMENT ON TABLE public.wa_mensagens IS
    'Mensagens do número da loja. Texto, legenda e transcrição para sempre; arquivo de mídia por 30 dias.';


CREATE TABLE IF NOT EXISTS public.wa_acessos_log (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    consultant_id uuid REFERENCES public.consultants_manos_crm(id) ON DELETE SET NULL,
    auth_uid      uuid,
    conversa_id   uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL,
    mensagem_id   uuid REFERENCES public.wa_mensagens(id) ON DELETE SET NULL,
    acao          text NOT NULL CHECK (acao IN ('abriu', 'ouviu_audio', 'abriu_midia', 'baixou_documento', 'enviou')),
    em            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_acessos_log_em ON public.wa_acessos_log (em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_acessos_log_consultor ON public.wa_acessos_log (consultant_id, em DESC);

COMMENT ON TABLE public.wa_acessos_log IS
    'Auditoria LGPD: quem abriu qual conversa/mídia. Escrita só pelo servidor; leitura gestor/admin.';


-- ---------------------------------------------------------------------------
-- 3. Quem é quem (usadas nas políticas)
-- ---------------------------------------------------------------------------

-- consultants_manos_crm.id do usuário logado, só se ATIVO. Vendedor desativado → NULL → lê 0.
CREATE OR REPLACE FUNCTION public.wa_meu_consultant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT c.id
      FROM public.consultants_manos_crm c
     WHERE c.auth_id = auth.uid()
       AND coalesce(c.is_active, false)
       AND c.status = 'active'
     LIMIT 1
$$;

-- Gestor ou admin ativo, ou o login do Alexandre (mesma regra de is_admin_or_alexandre).
CREATE OR REPLACE FUNCTION public.wa_ve_todas()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coalesce(lower(auth.jwt() ->> 'email') = 'alexandre_gorges@hotmail.com', false)
        OR EXISTS (
            SELECT 1
              FROM public.consultants_manos_crm c
             WHERE c.auth_id = auth.uid()
               AND coalesce(c.is_active, false)
               AND c.status = 'active'
               AND c.role IN ('admin', 'gestor')
        )
$$;


-- ---------------------------------------------------------------------------
-- 4. Gatilhos
-- ---------------------------------------------------------------------------

-- atualizada_em + vendedor_anterior na redistribuição
CREATE OR REPLACE FUNCTION public.wa_tocar_conversa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.atualizada_em := now();
    IF NEW.assigned_consultant_id IS DISTINCT FROM OLD.assigned_consultant_id
       AND OLD.assigned_consultant_id IS NOT NULL THEN
        NEW.vendedor_anterior := OLD.assigned_consultant_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_conversas_tocar ON public.wa_conversas;
CREATE TRIGGER trg_wa_conversas_tocar
    BEFORE UPDATE ON public.wa_conversas
    FOR EACH ROW EXECUTE FUNCTION public.wa_tocar_conversa();


-- Lead redistribuído → a conversa vai junto, na hora. Nunca bloqueia a roleta.
CREATE OR REPLACE FUNCTION public.wa_sync_vendedor_do_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        UPDATE public.wa_conversas
           SET assigned_consultant_id = NEW.assigned_consultant_id
         WHERE lead_uid = TG_TABLE_NAME || ':' || NEW.id::text
           AND assigned_consultant_id IS DISTINCT FROM NEW.assigned_consultant_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[wa] sync do vendedor falhou para %:%: %', TG_TABLE_NAME, NEW.id, SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_sync_vendedor ON public.leads_distribuicao_crm_26;
CREATE TRIGGER trg_wa_sync_vendedor
    AFTER UPDATE OF assigned_consultant_id ON public.leads_distribuicao_crm_26
    FOR EACH ROW
    WHEN (OLD.assigned_consultant_id IS DISTINCT FROM NEW.assigned_consultant_id)
    EXECUTE FUNCTION public.wa_sync_vendedor_do_lead();

DROP TRIGGER IF EXISTS trg_wa_sync_vendedor ON public.leads_master;
CREATE TRIGGER trg_wa_sync_vendedor
    AFTER UPDATE OF assigned_consultant_id ON public.leads_master
    FOR EACH ROW
    WHEN (OLD.assigned_consultant_id IS DISTINCT FROM NEW.assigned_consultant_id)
    EXECUTE FUNCTION public.wa_sync_vendedor_do_lead();


-- ---------------------------------------------------------------------------
-- 5. Liga a conversa ao lead (pelo telefone) e copia o vendedor dele.
--    Prioridade: leads_distribuicao_crm_26 (Inbox/roleta) → leads_master.
--    Não cria lead: isso é a Fase 6.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_vincular_lead(p_conversa uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conv     public.wa_conversas%ROWTYPE;
    v_tabela   text;
    v_id       text;
    v_vendedor uuid;
    v_achou    boolean := false;
BEGIN
    SELECT * INTO v_conv FROM public.wa_conversas WHERE id = p_conversa;
    IF NOT FOUND THEN RETURN; END IF;

    IF v_conv.lead_uid IS NOT NULL THEN
        v_tabela := split_part(v_conv.lead_uid, ':', 1);
        v_id     := substr(v_conv.lead_uid, length(v_tabela) + 2);
        IF v_tabela = 'leads_distribuicao_crm_26' AND v_id ~ '^\d+$' THEN
            SELECT d.assigned_consultant_id INTO v_vendedor
              FROM public.leads_distribuicao_crm_26 d WHERE d.id = v_id::integer;
            v_achou := FOUND;
        ELSIF v_tabela = 'leads_master' AND v_id ~* '^[0-9a-f-]{36}$' THEN
            SELECT m.assigned_consultant_id INTO v_vendedor
              FROM public.leads_master m WHERE m.id = v_id::uuid;
            v_achou := FOUND;
        END IF;
        IF v_achou THEN
            UPDATE public.wa_conversas SET assigned_consultant_id = v_vendedor
             WHERE id = p_conversa AND assigned_consultant_id IS DISTINCT FROM v_vendedor;
            RETURN;
        END IF;
        -- lead sumiu: procura de novo pelo telefone
    END IF;

    SELECT 'leads_distribuicao_crm_26', d.id::text, d.assigned_consultant_id
      INTO v_tabela, v_id, v_vendedor
      FROM public.leads_distribuicao_crm_26 d
     WHERE public.wa_telefone_key(d.telefone) = v_conv.telefone_key
     ORDER BY (d.archived_at IS NULL) DESC, d.created_at DESC NULLS LAST, d.id DESC
     LIMIT 1;

    IF NOT FOUND THEN
        SELECT 'leads_master', m.id::text, m.assigned_consultant_id
          INTO v_tabela, v_id, v_vendedor
          FROM public.leads_master m
         WHERE public.wa_telefone_key(m.phone) = v_conv.telefone_key
         ORDER BY (m.archived_at IS NULL) DESC, m.created_at DESC NULLS LAST
         LIMIT 1;
    END IF;

    IF FOUND THEN
        UPDATE public.wa_conversas
           SET lead_uid = v_tabela || ':' || v_id,
               assigned_consultant_id = v_vendedor
         WHERE id = p_conversa;
    ELSIF v_conv.lead_uid IS NOT NULL THEN
        UPDATE public.wa_conversas SET lead_uid = NULL, assigned_consultant_id = NULL WHERE id = p_conversa;
    END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 6. Ingestão atômica de UMA mensagem (chamada por /api/wa/ingest com service_role)
--    Idempotente: provider_message_id repetido não duplica nem soma não lida.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_registrar_mensagem(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key      text := public.wa_telefone_key(p ->> 'telefone');
    v_quando   timestamptz := coalesce(nullif(p ->> 'criada_em', '')::timestamptz, now());
    v_autor    text := coalesce(nullif(p ->> 'autor', ''), 'cliente');
    v_conv_id  uuid;
    v_msg_id   uuid;
    v_nova     boolean := false;
BEGIN
    IF v_key IS NULL THEN
        RAISE EXCEPTION 'wa_registrar_mensagem: telefone inválido';
    END IF;
    IF coalesce(p ->> 'provider_message_id', '') = '' THEN
        RAISE EXCEPTION 'wa_registrar_mensagem: provider_message_id vazio';
    END IF;

    -- Já existe: não mexe em nada (nem na conversa).
    SELECT m.id, m.conversa_id INTO v_msg_id, v_conv_id
      FROM public.wa_mensagens m WHERE m.provider_message_id = p ->> 'provider_message_id';
    IF FOUND THEN
        RETURN jsonb_build_object(
            'conversa_id', v_conv_id,
            'mensagem_id', v_msg_id,
            'nova', false,
            'lead_uid', (SELECT lead_uid FROM public.wa_conversas WHERE id = v_conv_id)
        );
    END IF;

    INSERT INTO public.wa_conversas AS c (canal, telefone_key, remote_jid, nome_contato, ultima_mensagem_em)
    VALUES ('loja', v_key, nullif(p ->> 'remote_jid', ''), nullif(p ->> 'nome_contato', ''), v_quando)
    ON CONFLICT (canal, telefone_key) DO UPDATE
        SET remote_jid         = coalesce(EXCLUDED.remote_jid, c.remote_jid),
            nome_contato       = coalesce(EXCLUDED.nome_contato, c.nome_contato),
            ultima_mensagem_em = greatest(c.ultima_mensagem_em, EXCLUDED.ultima_mensagem_em)
    RETURNING c.id INTO v_conv_id;

    INSERT INTO public.wa_mensagens (
        conversa_id, provider_message_id, direcao, autor, consultant_id, tipo,
        texto, legenda, midia_mime, midia_bytes, midia_nome, duracao_s,
        extra, citada_message_id, status_entrega, origem, criada_em
    ) VALUES (
        v_conv_id,
        p ->> 'provider_message_id',
        CASE WHEN v_autor = 'cliente' THEN 'in' ELSE 'out' END,
        v_autor,
        nullif(p ->> 'consultant_id', '')::uuid,
        coalesce(nullif(p ->> 'tipo', ''), 'texto'),
        p ->> 'texto',
        p ->> 'legenda',
        p ->> 'midia_mime',
        nullif(p ->> 'midia_bytes', '')::bigint,
        p ->> 'midia_nome',
        nullif(p ->> 'duracao_s', '')::numeric::integer,
        CASE WHEN jsonb_typeof(p -> 'extra') = 'object' THEN p -> 'extra' END,
        nullif(p ->> 'citada_message_id', ''),
        nullif(p ->> 'status_entrega', ''),
        coalesce(nullif(p ->> 'origem', ''), 'evolution'),
        v_quando
    )
    ON CONFLICT (provider_message_id) DO NOTHING
    RETURNING id INTO v_msg_id;

    v_nova := v_msg_id IS NOT NULL;
    IF NOT v_nova THEN
        -- corrida: outra chamada gravou o mesmo id entre o SELECT e o INSERT
        SELECT id, conversa_id INTO v_msg_id, v_conv_id
          FROM public.wa_mensagens WHERE provider_message_id = p ->> 'provider_message_id';
    ELSIF v_autor = 'cliente' THEN
        UPDATE public.wa_conversas SET nao_lidas_vendedor = nao_lidas_vendedor + 1 WHERE id = v_conv_id;
    END IF;

    PERFORM public.wa_vincular_lead(v_conv_id);

    RETURN jsonb_build_object(
        'conversa_id', v_conv_id,
        'mensagem_id', v_msg_id,
        'nova', v_nova,
        'lead_uid', (SELECT lead_uid FROM public.wa_conversas WHERE id = v_conv_id)
    );
END;
$$;


-- ---------------------------------------------------------------------------
-- 7. Contrato com a Laura (n8n): consultar ANTES de responder.
--    false = um vendedor assumiu a conversa e o silêncio da IA ainda vale.
--    Sem conversa, ou status 'ia'/'encerrada', ou silêncio vencido → true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_ia_pode_responder(p_telefone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NOT EXISTS (
        SELECT 1
          FROM public.wa_conversas c
         WHERE c.canal = 'loja'
           AND c.telefone_key = public.wa_telefone_key(p_telefone)
           AND c.status = 'humano'
           AND (c.ia_silenciada_ate IS NULL OR c.ia_silenciada_ate > now())
    )
$$;


-- ---------------------------------------------------------------------------
-- 8. RLS e privilégios
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_conversas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_mensagens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_acessos_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_conversas_select ON public.wa_conversas;
CREATE POLICY wa_conversas_select ON public.wa_conversas
    FOR SELECT TO authenticated
    USING (
        (SELECT public.wa_ve_todas())
        OR (assigned_consultant_id IS NOT NULL
            AND assigned_consultant_id = (SELECT public.wa_meu_consultant_id()))
    );

DROP POLICY IF EXISTS wa_mensagens_select ON public.wa_mensagens;
CREATE POLICY wa_mensagens_select ON public.wa_mensagens
    FOR SELECT TO authenticated
    USING (
        (SELECT public.wa_ve_todas())
        OR EXISTS (
            SELECT 1 FROM public.wa_conversas c
             WHERE c.id = wa_mensagens.conversa_id
               AND c.assigned_consultant_id IS NOT NULL
               AND c.assigned_consultant_id = (SELECT public.wa_meu_consultant_id())
        )
    );

DROP POLICY IF EXISTS wa_acessos_log_select ON public.wa_acessos_log;
CREATE POLICY wa_acessos_log_select ON public.wa_acessos_log
    FOR SELECT TO authenticated
    USING ((SELECT public.wa_ve_todas()));

-- Sem INSERT/UPDATE/DELETE para o navegador: tudo passa pelo servidor.
REVOKE ALL ON public.wa_conversas, public.wa_mensagens, public.wa_acessos_log FROM anon, public;
REVOKE ALL ON public.wa_conversas, public.wa_mensagens, public.wa_acessos_log FROM authenticated;
GRANT SELECT ON public.wa_conversas, public.wa_mensagens, public.wa_acessos_log TO authenticated;
GRANT ALL ON public.wa_conversas, public.wa_mensagens, public.wa_acessos_log TO service_role;

-- Funções: as das políticas para authenticated; as de escrita só para o servidor.
REVOKE ALL ON FUNCTION public.wa_telefone_key(text)        FROM public, anon;
REVOKE ALL ON FUNCTION public.wa_meu_consultant_id()       FROM public, anon;
REVOKE ALL ON FUNCTION public.wa_ve_todas()                FROM public, anon;
REVOKE ALL ON FUNCTION public.wa_tocar_conversa()          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_sync_vendedor_do_lead()   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_vincular_lead(uuid)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_registrar_mensagem(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_ia_pode_responder(text)   FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_telefone_key(text), public.wa_meu_consultant_id(), public.wa_ve_todas()
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wa_vincular_lead(uuid), public.wa_registrar_mensagem(jsonb),
    public.wa_ia_pode_responder(text) TO service_role;


-- ---------------------------------------------------------------------------
-- 9. Bucket privado. NENHUMA política em storage.objects para ele:
--    anon e authenticated não leem nem escrevem; o servidor usa service_role.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('whatsapp-midia', 'whatsapp-midia', false, 104857600, NULL)
ON CONFLICT (id) DO UPDATE SET public = false;


-- ---------------------------------------------------------------------------
-- 10. Retenção de 30 dias: 1x/dia às 06:30 UTC (03:30 em Rio do Sul).
--     Mesmo padrão dos outros crons (call_cron_endpoint + CRON_SECRET em cron_config).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-retencao-midia') THEN
        PERFORM cron.unschedule('wa-retencao-midia');
    END IF;
END $$;

SELECT cron.schedule(
    'wa-retencao-midia',
    '30 6 * * *',
    $cron$ SELECT public.call_cron_endpoint('/api/cron/wa-retencao') $cron$
);
