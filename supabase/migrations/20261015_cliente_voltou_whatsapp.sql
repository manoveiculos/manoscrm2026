-- ===========================================================================
-- CLIENTE QUE VOLTOU PELO WHATSAPP → LEAD VOLTA PARA ATENDIMENTO
-- Data: 2026-10-15
--
-- Problema (medido em 15/10/2026): em 30 dias, 24 clientes que já tinham lead
-- voltaram a escrever no WhatsApp da loja e NENHUM lead foi reativado. Ex.:
-- lead #3579 voltou em 14/10 pelo anúncio do Onix e o atualizado_em seguiu em
-- 02/10. Causa: o fluxo de IA do n8n só cria o lead na primeira conversa
-- (dados_cliente.enviado_crm), e a lógica de "cliente voltou" do
-- /api/webhook/whatsapp nunca roda — aquele webhook não recebe nada desde
-- 03/07/2026 (whatsapp_messages vazio desde então).
--
-- Conserto: o banco já vê TODA mensagem de cliente — o fluxo de IA grava cada
-- uma em concessionaria_mensagens (type 'human'), e dados_cliente liga a
-- sessão ao telefone (100% das conversas dos últimos 7 dias têm a ponte).
-- Um job pg_cron de 1 em 1 minuto lê as mensagens novas (cursor por id) e:
--
--   a) lead em leads_distribuicao_crm_26 parado há mais de 3 dias, perdido,
--      frio ou arquivado → volta para o topo do Inbox:
--        - atualizado_em = now()
--        - perdido/frio/arquivado → status 'received' e desarquiva (mesmo
--          comportamento do /api/webhook/whatsapp). 'received' não está na
--          lista do trg_enqueue_reversal, então não agenda IA de reversão.
--        - vendido → status mantido (não apaga a venda); só avisa.
--        - acrescenta "CLIENTE VOLTOU em dd/mm hh:mm — <mensagem>" no topo do
--          handoff_summary (nunca apaga o que havia)
--        - alerta cowork_alerts 'cliente_voltou' para o dono do lead
--   b) telefone só existe em leads_master (fora do Inbox) → reabre: cria o
--      lead em crm26 com os dados do master, status 'received'; o trigger de
--      distribuição já existente entrega a um vendedor.
--   c) telefone sem lead nenhum → nada: cliente novo é criado pelo n8n.
--
-- Conversa em andamento (lead mexido nos últimos 3 dias) não é tocada.
-- Mensagens triviais ("ok", "obrigado") não reativam.
-- Não mexe no n8n nem na tabela dele: só lê concessionaria_mensagens.
--
-- Mesmo título de alerta da rotina provisória "Acompanhamento de Leads"
-- (Passo 1B): 'Cliente voltou — lead #<id>'. Ela checa esse alerta nas
-- últimas 24h e pula — não duplica. Depois que isto estiver no ar, o Passo 1B
-- pode ser desligado.
--
-- Depende de: fn_phone_key (migration 20261014_origem_lead_meta_capi.sql).
-- ===========================================================================


-- Cursor: começa no id mais recente para NÃO reprocessar o histórico.
CREATE TABLE IF NOT EXISTS public.whatsapp_retorno_cursor (
    id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ultimo_msg_id bigint NOT NULL,
    atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.whatsapp_retorno_cursor (id, ultimo_msg_id)
SELECT 1, coalesce(max(id), 0) FROM public.concessionaria_mensagens
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.whatsapp_retorno_cursor ENABLE ROW LEVEL SECURITY;


CREATE OR REPLACE FUNCTION public.fn_processar_retornos_whatsapp(p_limite int DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cursor  bigint;
    v_max     bigint;
    r         record;
    v_d       public.leads_distribuicao_crm_26%ROWTYPE;
    v_m       public.leads_master%ROWTYPE;
    v_status  text;
    v_vendido boolean;
    v_fechado boolean;
    v_parado  boolean;
    v_bloco   text;
    v_titulo  text;
    v_novo_id int;
    n_reativados int := 0;
    n_reabertos  int := 0;
    n_vendidos   int := 0;
    n_ignorados  int := 0;
BEGIN
    -- FOR UPDATE serializa execuções sobrepostas do cron.
    SELECT ultimo_msg_id INTO v_cursor FROM public.whatsapp_retorno_cursor WHERE id = 1 FOR UPDATE;
    IF v_cursor IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'cursor ausente');
    END IF;

    SELECT max(id) INTO v_max
      FROM (SELECT id FROM public.concessionaria_mensagens WHERE id > v_cursor ORDER BY id LIMIT p_limite) lote;
    IF v_max IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'mensagens', 0);
    END IF;

    FOR r IN
        WITH novas AS (
            SELECT cm.id, cm.data, cm.session_id,
                   btrim(regexp_replace(coalesce(cm.message->>'content', ''), '\s+', ' ', 'g')) AS texto
              FROM public.concessionaria_mensagens cm
             WHERE cm.id > v_cursor AND cm.id <= v_max
               AND cm.message->>'type' = 'human'
        )
        SELECT public.fn_phone_key(dc.telefone) AS phone_key,
               max(dc.telefone) AS telefone,
               max(dc.nome)     AS nome,
               min(n.data)      AS primeira,
               left(string_agg(n.texto, ' / ' ORDER BY n.id), 300) AS textos
          FROM novas n
          JOIN LATERAL (
              SELECT c.telefone, c.nome FROM public.dados_cliente c
               WHERE c.sessionid = n.session_id ORDER BY c.id DESC LIMIT 1
          ) dc ON true
         WHERE public.fn_phone_key(dc.telefone) IS NOT NULL
         GROUP BY 1
    LOOP
        BEGIN
            -- "ok", "obrigado"… sozinhos não são cliente voltando ("oi" é).
            IF r.textos = ''
               OR lower(r.textos) ~ '^((ok|okay|obg|obrigad[oa]|valeu|vlw|blz|beleza|t[aá]|t[aá] bom|show|top|👍|🙏)[ .!]*)( / (ok|okay|obg|obrigad[oa]|valeu|vlw|blz|beleza|t[aá]|t[aá] bom|show|top|👍|🙏)[ .!]*)*$'
            THEN
                n_ignorados := n_ignorados + 1;
                CONTINUE;
            END IF;

            -- concessionaria_mensagens.data é UTC; a ficha mostra horário de Brasília.
            v_bloco := 'CLIENTE VOLTOU em '
                || to_char((r.primeira AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                || ' — "' || r.textos || '"';

            v_d := NULL;
            SELECT * INTO v_d FROM public.leads_distribuicao_crm_26
             WHERE public.fn_phone_key(telefone) = r.phone_key
             ORDER BY id DESC LIMIT 1;

            IF v_d.id IS NOT NULL THEN
                -- (a) lead no Inbox
                v_status  := lower(btrim(coalesce(v_d.status, '')));
                v_vendido := v_status IN ('vendido', 'post_sale', 'comprado');
                v_fechado := v_status IN ('perdido', 'arquivado', 'lost', 'lost_by_inactivity', 'frio')
                             OR v_d.archived_at IS NOT NULL;
                v_parado  := coalesce(v_d.atualizado_em, v_d.created_at) < r.primeira - interval '3 days';

                IF NOT (v_fechado OR v_parado) THEN
                    CONTINUE;   -- conversa em andamento
                END IF;

                v_titulo := 'Cliente voltou — lead #' || v_d.id;
                IF EXISTS (SELECT 1 FROM public.cowork_alerts a
                            WHERE a.type = 'cliente_voltou' AND a.title = v_titulo
                              AND a.created_at > now() - interval '24 hours') THEN
                    CONTINUE;   -- já tratado (por este job ou pela rotina provisória)
                END IF;

                UPDATE public.leads_distribuicao_crm_26 SET
                    atualizado_em   = now(),
                    status          = CASE WHEN v_fechado AND NOT v_vendido THEN 'received' ELSE status END,
                    archived_at     = CASE WHEN v_vendido THEN archived_at ELSE NULL END,
                    archived_reason = CASE WHEN v_vendido THEN archived_reason ELSE NULL END,
                    archived_by     = CASE WHEN v_vendido THEN archived_by ELSE NULL END,
                    handoff_summary = left(v_bloco || CASE WHEN coalesce(handoff_summary, '') = '' THEN ''
                                                           ELSE E'\n\n' || handoff_summary END, 2000)
                 WHERE id = v_d.id;

                INSERT INTO public.cowork_alerts (type, priority, blocking, target_consultant_id, title, message, expires_at)
                VALUES ('cliente_voltou', 1, false, v_d.assigned_consultant_id, v_titulo,
                        left(r.textos, 300) || CASE
                            WHEN v_vendido THEN ' — cliente que JÁ COMPROU voltou a chamar.'
                            WHEN v_fechado THEN ' — lead estava perdido/arquivado e voltou para o Inbox.'
                            ELSE ' — lead subiu para o topo do Inbox.' END,
                        now() + interval '3 days');

                IF v_vendido THEN n_vendidos := n_vendidos + 1; ELSE n_reativados := n_reativados + 1; END IF;

            ELSE
                -- (b) só existe em leads_master → reabre no Inbox
                v_m := NULL;
                SELECT * INTO v_m FROM public.leads_master
                 WHERE public.fn_phone_key(phone) = r.phone_key
                 ORDER BY created_at DESC NULLS LAST LIMIT 1;

                IF v_m.id IS NULL THEN
                    CONTINUE;   -- (c) cliente novo: o n8n cria
                END IF;

                v_novo_id := NULL;
                INSERT INTO public.leads_distribuicao_crm_26
                    (nome, telefone, cidade, interesse, vehicle_interest, origem, status,
                     utm_params, handoff_summary, criado_em, atualizado_em)
                VALUES (
                    coalesce(nullif(btrim(r.nome), ''), v_m.name),
                    regexp_replace(r.telefone, '\D', '', 'g'),
                    v_m.city,
                    v_m.vehicle_interest,
                    v_m.vehicle_interest,
                    coalesce(nullif(v_m.source, ''), 'WhatsApp'),
                    'received',
                    v_m.utm_params,
                    left(v_bloco || E'\n\n(lead antigo reaberto — existia só no histórico do CRM)', 2000),
                    now(), now()
                )
                ON CONFLICT (telefone) DO NOTHING
                RETURNING id INTO v_novo_id;

                IF v_novo_id IS NOT NULL THEN
                    INSERT INTO public.cowork_alerts (type, priority, blocking, target_consultant_id, title, message, expires_at)
                    VALUES ('cliente_voltou', 1, false, NULL, 'Cliente voltou — lead #' || v_novo_id,
                            left(r.textos, 300) || ' — lead antigo reaberto e enviado para distribuição.',
                            now() + interval '3 days');
                    n_reabertos := n_reabertos + 1;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[cliente_voltou] telefone %: %', r.phone_key, SQLERRM;
        END;
    END LOOP;

    UPDATE public.whatsapp_retorno_cursor SET ultimo_msg_id = v_max, atualizado_em = now() WHERE id = 1;

    RETURN jsonb_build_object(
        'ok', true,
        'ate_msg_id', v_max,
        'reativados', n_reativados,
        'reabertos_do_master', n_reabertos,
        'vendidos_que_voltaram', n_vendidos,
        'mensagens_triviais', n_ignorados
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_processar_retornos_whatsapp(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_processar_retornos_whatsapp(int) TO service_role;

SELECT cron.schedule(
    'whatsapp-cliente-voltou',
    '* * * * *',
    $cron$ SELECT public.fn_processar_retornos_whatsapp() $cron$
);
