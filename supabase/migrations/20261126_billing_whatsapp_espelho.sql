-- ============================================================================
-- Cobrança — espelho do WhatsApp (só leitura, só admin), histórico permanente
--
-- Contexto (26/11/2026):
--   * billing_whatsapp_messages parou de receber em 19/09/2026: o proxy passou
--     a exigir sessão em /api e o webhook da Evolution ficou de fora da lista.
--   * 1.521 de 1.552 mensagens estavam sem record_id: o webhook gravava o
--     telefone sem o 9º dígito (10 dígitos) e a busca nos records falhava.
--   * A política "billing_wa_all_authenticated" deixava QUALQUER login (inclusive
--     vendedor) ler e escrever as conversas de cobrança.
--
-- O que muda:
--   1. Colunas novas: hora real da mensagem, tipo, quem enviou, mídia,
--      transcrição, citada, editada/apagada, status de entrega.
--   2. Telefone padronizado pelo mesmo padrão do WhatsApp da loja
--      (public.wa_telefone_key: DDD + 9 + 8 para celular) por gatilho — vale
--      para o webhook, para o envio da régua e para a importação.
--   3. Vínculo automático com records_cobrancamanos26 pelo telefone (o campo
--      telefone dos records pode ter vários números separados).
--   4. Acesso: leitura só admin (is_admin_or_alexandre); escrita só servidor.
--   5. Log de quem abriu cada conversa (LGPD).
--   6. Nada aqui apaga mensagem: o histórico é permanente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_whatsapp_messages
    ADD COLUMN IF NOT EXISTS message_at        timestamptz,
    ADD COLUMN IF NOT EXISTS message_type      text,
    ADD COLUMN IF NOT EXISTS enviado_por       text,
    ADD COLUMN IF NOT EXISTS remote_jid        text,
    ADD COLUMN IF NOT EXISTS media_mime        text,
    ADD COLUMN IF NOT EXISTS media_bytes       bigint,
    ADD COLUMN IF NOT EXISTS media_nome        text,
    ADD COLUMN IF NOT EXISTS media_duracao_s   integer,
    ADD COLUMN IF NOT EXISTS media_path        text,
    ADD COLUMN IF NOT EXISTS media_erro        text,
    ADD COLUMN IF NOT EXISTS transcricao       text,
    ADD COLUMN IF NOT EXISTS quoted_msg_id     text,
    ADD COLUMN IF NOT EXISTS status_entrega    text,
    ADD COLUMN IF NOT EXISTS editada_em        timestamptz,
    ADD COLUMN IF NOT EXISTS apagada_em        timestamptz,
    ADD COLUMN IF NOT EXISTS extra             jsonb;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_wa_enviado_por_chk') THEN
        ALTER TABLE public.billing_whatsapp_messages
            ADD CONSTRAINT billing_wa_enviado_por_chk
            CHECK (enviado_por IS NULL OR enviado_por IN ('cliente', 'numero', 'crm'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_wa_status_entrega_chk') THEN
        ALTER TABLE public.billing_whatsapp_messages
            ADD CONSTRAINT billing_wa_status_entrega_chk
            CHECK (status_entrega IS NULL OR status_entrega IN ('enviada', 'entregue', 'lida', 'falhou'));
    END IF;
END $$;

COMMENT ON COLUMN public.billing_whatsapp_messages.message_at IS
    'Hora da mensagem no WhatsApp. created_at é a hora em que o banco gravou (difere na importação).';
COMMENT ON COLUMN public.billing_whatsapp_messages.enviado_por IS
    'cliente = recebida; numero = enviada pelo celular/WhatsApp Web da cobrança; crm = enviada pelo CRM/régua.';
COMMENT ON COLUMN public.billing_whatsapp_messages.media_path IS
    'Caminho no bucket privado cobranca-whatsapp-midia. Nunca vai para o navegador (URL assinada pelo servidor).';


-- ---------------------------------------------------------------------------
-- 2. Record de cobrança pelo telefone
--    records_cobrancamanos26.telefone pode ter vários números ("47988189895 47999166668").
--    Prioriza o record em aberto com vencimento mais antigo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_wa_record_do_telefone(p_telefone text)
RETURNS TABLE (record_id text, cpf_cnpj text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.id, r."cpfCnpj"
      FROM public.records_cobrancamanos26 r
     WHERE public.wa_telefone_key(p_telefone) IS NOT NULL
       AND EXISTS (
            SELECT 1
              FROM regexp_split_to_table(coalesce(r.telefone, ''), '[\s/,;|]+') AS parte
             WHERE public.wa_telefone_key(parte) = public.wa_telefone_key(p_telefone)
       )
     ORDER BY (r.status = 'PAGO'), r.vencimento NULLS LAST
     LIMIT 1
$$;


-- ---------------------------------------------------------------------------
-- 3. Gatilho: padroniza telefone, preenche hora e vincula o record
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_wa_antes_de_gravar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key text;
    v_rec record;
BEGIN
    v_key := public.wa_telefone_key(NEW.telefone);
    IF v_key IS NOT NULL THEN
        NEW.telefone := v_key;
    END IF;

    IF NEW.message_at IS NULL THEN
        NEW.message_at := coalesce(NEW.created_at, now());
    END IF;

    IF NEW.enviado_por IS NULL THEN
        NEW.enviado_por := CASE WHEN NEW.direction = 'INBOUND' THEN 'cliente' ELSE NULL END;
    END IF;

    IF NEW.record_id IS NULL AND TG_OP = 'INSERT' THEN
        SELECT * INTO v_rec FROM public.billing_wa_record_do_telefone(NEW.telefone);
        IF FOUND THEN
            NEW.record_id := v_rec.record_id;
            NEW.cpf_cnpj := coalesce(NEW.cpf_cnpj, v_rec.cpf_cnpj);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_wa_antes_de_gravar ON public.billing_whatsapp_messages;
CREATE TRIGGER trg_billing_wa_antes_de_gravar
    BEFORE INSERT OR UPDATE OF telefone ON public.billing_whatsapp_messages
    FOR EACH ROW EXECUTE FUNCTION public.billing_wa_antes_de_gravar();


-- ---------------------------------------------------------------------------
-- 4. Corrige o que já está gravado
-- ---------------------------------------------------------------------------
-- 4a. hora real: o timestamp da Evolution está no payload cru
UPDATE public.billing_whatsapp_messages m
   SET message_at = coalesce(
           CASE WHEN (m.raw_payload #>> '{data,messageTimestamp}') ~ '^\d{9,11}$'
                THEN to_timestamp((m.raw_payload #>> '{data,messageTimestamp}')::bigint) END,
           m.created_at)
 WHERE m.message_at IS NULL;

-- 4b. telefone padronizado (o gatilho de UPDATE OF telefone cuida do formato)
UPDATE public.billing_whatsapp_messages
   SET telefone = public.wa_telefone_key(telefone)
 WHERE public.wa_telefone_key(telefone) IS NOT NULL
   AND telefone <> public.wa_telefone_key(telefone);

-- 4c. quem enviou e de qual conversa
UPDATE public.billing_whatsapp_messages m
   SET enviado_por = CASE
           WHEN m.direction = 'INBOUND' THEN 'cliente'
           WHEN m.raw_payload IS NULL THEN 'crm'      -- gravada pelo cobrancaWhatsappSender
           ELSE 'numero'
       END,
       remote_jid = coalesce(m.remote_jid, m.raw_payload #>> '{data,key,remoteJid}')
 WHERE m.enviado_por IS NULL OR m.remote_jid IS NULL;

-- 4d. vínculo com o record (antes falhava pelo 9º dígito)
UPDATE public.billing_whatsapp_messages m
   SET record_id = r.record_id,
       cpf_cnpj  = coalesce(m.cpf_cnpj, r.cpf_cnpj)
  FROM (
        SELECT DISTINCT telefone FROM public.billing_whatsapp_messages WHERE record_id IS NULL
       ) t
 CROSS JOIN LATERAL public.billing_wa_record_do_telefone(t.telefone) r
 WHERE m.telefone = t.telefone
   AND m.record_id IS NULL;

ALTER TABLE public.billing_whatsapp_messages
    ALTER COLUMN message_at SET DEFAULT now(),
    ALTER COLUMN message_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_wa_tel_msgat
    ON public.billing_whatsapp_messages (telefone, message_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_wa_msgat
    ON public.billing_whatsapp_messages (message_at DESC);


-- ---------------------------------------------------------------------------
-- 5. Log de acesso (LGPD): quem abriu qual conversa / mídia
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_wa_acessos_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    auth_uid    uuid,
    email       text,
    telefone    text NOT NULL,
    mensagem_id uuid REFERENCES public.billing_whatsapp_messages(id) ON DELETE SET NULL,
    acao        text NOT NULL CHECK (acao IN ('abriu', 'abriu_midia', 'ouviu_audio', 'baixou_documento', 'analise_ia')),
    em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_wa_acessos_em ON public.billing_wa_acessos_log (em DESC);

COMMENT ON TABLE public.billing_wa_acessos_log IS
    'Auditoria LGPD do espelho do WhatsApp da cobrança. Escrita só pelo servidor; leitura só admin.';


-- ---------------------------------------------------------------------------
-- 6. Acesso: leitura só admin, escrita só servidor (service_role)
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_wa_acessos_log    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_wa_all_authenticated" ON public.billing_whatsapp_messages;
DROP POLICY IF EXISTS "billing_wa_service_insert"    ON public.billing_whatsapp_messages;
DROP POLICY IF EXISTS billing_wa_admin_select        ON public.billing_whatsapp_messages;
CREATE POLICY billing_wa_admin_select ON public.billing_whatsapp_messages
    FOR SELECT TO authenticated
    USING (public.is_admin_or_alexandre());

DROP POLICY IF EXISTS billing_wa_acessos_admin_select ON public.billing_wa_acessos_log;
CREATE POLICY billing_wa_acessos_admin_select ON public.billing_wa_acessos_log
    FOR SELECT TO authenticated
    USING (public.is_admin_or_alexandre());

REVOKE ALL ON public.billing_whatsapp_messages, public.billing_wa_acessos_log FROM anon, public;
REVOKE ALL ON public.billing_whatsapp_messages, public.billing_wa_acessos_log FROM authenticated;
GRANT SELECT ON public.billing_whatsapp_messages, public.billing_wa_acessos_log TO authenticated;
GRANT ALL    ON public.billing_whatsapp_messages, public.billing_wa_acessos_log TO service_role;

REVOKE ALL ON FUNCTION public.billing_wa_record_do_telefone(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_wa_antes_de_gravar()         FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wa_record_do_telefone(text) TO service_role;


-- ---------------------------------------------------------------------------
-- 7. Bucket privado para as mídias (sem política: só o servidor lê e assina URL)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('cobranca-whatsapp-midia', 'cobranca-whatsapp-midia', false)
ON CONFLICT (id) DO NOTHING;
