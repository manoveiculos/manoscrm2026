-- ============================================================================
-- Espelho do WhatsApp (Gestão → WhatsApp) — SÓ LEITURA, SÓ ADMIN
--
-- Pedido do Alexandre (26/11/2026): ver dentro do CRM as conversas de um número
-- do WhatsApp (instância "Camila" na Evolution) apenas para analisar. Nenhum
-- agente responde, a tela não tem campo de envio e o histórico fica salvo no
-- banco para sempre.
--
-- Separado de tudo o que já existe:
--   * wa_conversas / wa_mensagens  → WhatsApp da loja (Laura, leads, roleta)
--   * billing_whatsapp_messages    → WhatsApp da cobrança
-- Nada aqui cria lead, mexe em fila ou dispara mensagem.
--
-- Como os dados chegam: o servidor LÊ a Evolution (POST /chat/findMessages) a
-- cada minuto (cron wa-espelho). A configuração da instância na Evolution
-- (webhook etc.) não é alterada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Conversas (uma por número, por instância)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_espelho_conversas (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instancia        text NOT NULL,
    telefone_key     text NOT NULL,
    remote_jid       text,
    nome             text,
    ultima_em        timestamptz,
    ultima_direcao   text CHECK (ultima_direcao IS NULL OR ultima_direcao IN ('in', 'out')),
    ultima_tipo      text,
    ultima_texto     text,
    total_mensagens  integer NOT NULL DEFAULT 0,
    criada_em        timestamptz NOT NULL DEFAULT now(),
    atualizada_em    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (instancia, telefone_key)
);

CREATE INDEX IF NOT EXISTS idx_wa_espelho_conv_ultima
    ON public.wa_espelho_conversas (instancia, ultima_em DESC NULLS LAST);

COMMENT ON TABLE public.wa_espelho_conversas IS
    'Espelho só leitura de um número do WhatsApp (Gestão → WhatsApp). Leitura só admin; escrita só servidor.';


-- ---------------------------------------------------------------------------
-- 2. Mensagens (histórico permanente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_espelho_mensagens (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id         uuid NOT NULL REFERENCES public.wa_espelho_conversas(id) ON DELETE CASCADE,
    instancia           text NOT NULL,
    provider_message_id text NOT NULL,
    remote_jid          text,
    direcao             text NOT NULL CHECK (direcao IN ('in', 'out')),
    tipo                text NOT NULL,
    texto               text,
    legenda             text,
    midia_mime          text,
    midia_bytes         bigint,
    midia_nome          text,
    duracao_s           integer,
    midia_path          text,
    midia_erro          text,
    transcricao         text,
    citada_message_id   text,
    editada_em          timestamptz,
    apagada_em          timestamptz,
    enviada_em          timestamptz NOT NULL,
    extra               jsonb,
    criada_em           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (instancia, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_espelho_msg_conversa
    ON public.wa_espelho_mensagens (conversa_id, enviada_em DESC);

COMMENT ON COLUMN public.wa_espelho_mensagens.enviada_em IS 'Hora da mensagem no WhatsApp.';
COMMENT ON COLUMN public.wa_espelho_mensagens.midia_path IS
    'Caminho no bucket privado whatsapp-espelho-midia (baixada na primeira vez que alguém abre). Nunca vai ao navegador.';


-- ---------------------------------------------------------------------------
-- 3. Estado da sincronização (uma linha por instância)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_espelho_sync (
    instancia             text PRIMARY KEY,
    ultima_sync_em        timestamptz,
    ultima_sync_gravadas  integer,
    importacao_pagina     integer NOT NULL DEFAULT 1,
    importacao_concluida  boolean NOT NULL DEFAULT false,
    total_evolution       integer,
    ultimo_erro           text,
    ultimo_erro_em        timestamptz,
    atualizado_em         timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 4. Log de acesso (LGPD): quem abriu qual conversa / mídia
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_espelho_acessos_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    auth_uid    uuid,
    email       text,
    conversa_id uuid REFERENCES public.wa_espelho_conversas(id) ON DELETE SET NULL,
    mensagem_id uuid REFERENCES public.wa_espelho_mensagens(id) ON DELETE SET NULL,
    acao        text NOT NULL CHECK (acao IN ('abriu', 'abriu_midia', 'ouviu_audio', 'baixou_documento')),
    em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_espelho_acessos_em ON public.wa_espelho_acessos_log (em DESC);


-- ---------------------------------------------------------------------------
-- 5. Gravação em lote (chamada pelo servidor com service_role)
--    p_msgs: [{ id, telefone_key, remote_jid, nome, direcao, tipo, texto, legenda,
--              midia_mime, midia_bytes, midia_nome, duracao_s, citada, enviada_em, extra }]
--    Idempotente: mensagem repetida é ignorada. Devolve { gravadas, conversas }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_espelho_gravar(p_instancia text, p_msgs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_gravadas integer := 0;
    v_conversas uuid[];
BEGIN
    IF p_msgs IS NULL OR jsonb_typeof(p_msgs) <> 'array' OR jsonb_array_length(p_msgs) = 0 THEN
        RETURN jsonb_build_object('gravadas', 0, 'conversas', 0);
    END IF;

    -- conversas: cria as que faltam; nome só entra se ainda não tinha
    INSERT INTO public.wa_espelho_conversas AS c (instancia, telefone_key, remote_jid, nome)
    SELECT DISTINCT ON (m->>'telefone_key')
           p_instancia, m->>'telefone_key', m->>'remote_jid', nullif(m->>'nome', '')
      FROM jsonb_array_elements(p_msgs) m
     WHERE coalesce(m->>'telefone_key', '') <> ''
     ORDER BY m->>'telefone_key', (nullif(m->>'nome', '') IS NULL), (m->>'enviada_em') DESC
    ON CONFLICT (instancia, telefone_key) DO UPDATE
       SET nome = coalesce(c.nome, excluded.nome),
           remote_jid = coalesce(c.remote_jid, excluded.remote_jid);

    WITH ins AS (
        INSERT INTO public.wa_espelho_mensagens (
            conversa_id, instancia, provider_message_id, remote_jid, direcao, tipo, texto, legenda,
            midia_mime, midia_bytes, midia_nome, duracao_s, citada_message_id, enviada_em, extra
        )
        SELECT c.id, p_instancia, m->>'id', m->>'remote_jid', m->>'direcao', m->>'tipo',
               m->>'texto', m->>'legenda', m->>'midia_mime',
               nullif(m->>'midia_bytes', '')::bigint, m->>'midia_nome',
               nullif(m->>'duracao_s', '')::integer, m->>'citada',
               (m->>'enviada_em')::timestamptz,
               CASE WHEN jsonb_typeof(m->'extra') = 'object' THEN m->'extra' END
          FROM jsonb_array_elements(p_msgs) m
          JOIN public.wa_espelho_conversas c
            ON c.instancia = p_instancia AND c.telefone_key = m->>'telefone_key'
         WHERE coalesce(m->>'id', '') <> ''
        ON CONFLICT (instancia, provider_message_id) DO NOTHING
        RETURNING conversa_id
    )
    SELECT count(*)::integer, array_agg(DISTINCT conversa_id) INTO v_gravadas, v_conversas FROM ins;

    IF v_gravadas > 0 THEN
        UPDATE public.wa_espelho_conversas c
           SET ultima_em = u.enviada_em,
               ultima_direcao = u.direcao,
               ultima_tipo = u.tipo,
               ultima_texto = left(coalesce(u.texto, u.legenda), 300),
               total_mensagens = (SELECT count(*) FROM public.wa_espelho_mensagens x WHERE x.conversa_id = c.id),
               atualizada_em = now()
          FROM (
                SELECT DISTINCT ON (conversa_id) conversa_id, enviada_em, direcao, tipo, texto, legenda
                  FROM public.wa_espelho_mensagens
                 WHERE conversa_id = ANY (v_conversas)
                 ORDER BY conversa_id, enviada_em DESC
               ) u
         WHERE c.id = u.conversa_id;
    END IF;

    RETURN jsonb_build_object('gravadas', v_gravadas, 'conversas', coalesce(array_length(v_conversas, 1), 0));
END;
$$;


-- ---------------------------------------------------------------------------
-- 6. Acesso: leitura só admin, escrita só servidor
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_espelho_conversas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_espelho_mensagens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_espelho_sync        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_espelho_acessos_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_espelho_conversas_admin ON public.wa_espelho_conversas;
CREATE POLICY wa_espelho_conversas_admin ON public.wa_espelho_conversas
    FOR SELECT TO authenticated USING (public.is_admin_or_alexandre());

DROP POLICY IF EXISTS wa_espelho_mensagens_admin ON public.wa_espelho_mensagens;
CREATE POLICY wa_espelho_mensagens_admin ON public.wa_espelho_mensagens
    FOR SELECT TO authenticated USING (public.is_admin_or_alexandre());

DROP POLICY IF EXISTS wa_espelho_sync_admin ON public.wa_espelho_sync;
CREATE POLICY wa_espelho_sync_admin ON public.wa_espelho_sync
    FOR SELECT TO authenticated USING (public.is_admin_or_alexandre());

DROP POLICY IF EXISTS wa_espelho_acessos_admin ON public.wa_espelho_acessos_log;
CREATE POLICY wa_espelho_acessos_admin ON public.wa_espelho_acessos_log
    FOR SELECT TO authenticated USING (public.is_admin_or_alexandre());

REVOKE ALL ON public.wa_espelho_conversas, public.wa_espelho_mensagens, public.wa_espelho_sync, public.wa_espelho_acessos_log FROM anon, public, authenticated;
GRANT SELECT ON public.wa_espelho_conversas, public.wa_espelho_mensagens, public.wa_espelho_sync, public.wa_espelho_acessos_log TO authenticated;
GRANT ALL ON public.wa_espelho_conversas, public.wa_espelho_mensagens, public.wa_espelho_sync, public.wa_espelho_acessos_log TO service_role;

REVOKE ALL ON FUNCTION public.wa_espelho_gravar(text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_espelho_gravar(text, jsonb) TO service_role;


-- ---------------------------------------------------------------------------
-- 7. Bucket privado das mídias (sem política: só o servidor lê e assina URL)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-espelho-midia', 'whatsapp-espelho-midia', false)
ON CONFLICT (id) DO NOTHING;


