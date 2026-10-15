-- ===========================================================================
-- ORIGEM DO LEAD + FUNIL NA META CONVERSIONS API + CUSTO POR RESULTADO
-- Data: 2026-10-14
--
-- Por que existe
--   Análise de 14/10/2026: 0% dos leads tinham utm_params / details / id_meta e
--   a meta_conversions_log tinha 1 evento na história. Não dava pra saber qual
--   anúncio gerou qual lead/venda, e a Meta otimizava as campanhas por
--   "conversa iniciada" sem nunca ver um lead qualificado, visita ou venda.
--
-- O que esta migration faz
--   1. utm_params em leads_distribuicao_crm_26 (a tabela onde o n8n insere).
--   2. registrar_origem_lead(): grava a origem (anúncio CTWA, Google Ads,
--      formulário do site) no lead SEM sobrescrever origem já existente
--      (first touch). Se o lead ainda não existe, guarda em
--      lead_origem_pendente e aplica quando o INSERT chegar.
--   3. sync crm26 -> master e merge_lead_on_conflict passam a carregar
--      utm_params / id_meta / details (antes só id_meta, e sem guarda do
--      UNIQUE de leads_master.id_meta).
--   4. meta_capi_queue: fila alimentada por trigger quando o lead vira
--      qualificado (4 respostas), agenda visita ou compra. Um worker
--      (/api/cron/meta-capi-dispatch) envia pra Meta. Os triggers só LEEM o
--      lead e nunca bloqueiam o UPDATE (erro vira WARNING).
--   5. meta_ad_spend_daily + fn_custo_por_resultado(): custo por lead,
--      qualificado, visita agendada e venda por campanha.
--
-- Cuidados herdados do banco (não remover sem ler)
--   - Nada aqui escreve em `status`: trg_enqueue_reversal (BEFORE UPDATE OF
--     status, quando o status MUDA para perdido/arquivado/lost) agenda
--     mensagem da IA de reversão. O enriquecimento de origem também nunca faz
--     UPDATE que não muda nada.
--   - leads_master.id_meta é UNIQUE: id do anúncio NÃO vai em id_meta (vários
--     leads por anúncio). id_meta recebe o ctwa_clid (único por clique) ou o
--     leadgen_id do formulário Meta. Toda escrita checa a unicidade antes.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads_distribuicao_crm_26 ADD COLUMN IF NOT EXISTS utm_params jsonb;


-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Chave de telefone: DDD + últimos 8 dígitos. Casa o mesmo número com e sem
-- DDI 55 e com e sem o 9º dígito (o JID do WhatsApp às vezes vem sem ele).
CREATE OR REPLACE FUNCTION public.fn_phone_key(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN d IS NULL OR length(d) < 8 THEN NULL
        WHEN length(d) >= 12 AND left(d, 2) = '55' THEN substr(d, 3, 2) || right(d, 8)
        WHEN length(d) IN (10, 11) THEN left(d, 2) || right(d, 8)
        ELSE right(d, 8)
    END
    FROM (SELECT nullif(ltrim(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '0'), '') AS d) s
$$;

CREATE INDEX IF NOT EXISTS idx_crm26_phone_key ON public.leads_distribuicao_crm_26 (public.fn_phone_key(telefone));
CREATE INDEX IF NOT EXISTS idx_master_phone_key ON public.leads_master (public.fn_phone_key(phone));

CREATE OR REPLACE FUNCTION public.fn_origem_vazia(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT p IS NULL OR jsonb_typeof(p) <> 'object' OR p = '{}'::jsonb
$$;

-- Interesse genérico que o n8n grava quando não sabe o veículo.
CREATE OR REPLACE FUNCTION public.fn_interesse_generico(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT nullif(btrim(coalesce(p, '')), '') IS NULL OR btrim(p) = 'Lead Google - Não especificado'
$$;


-- ---------------------------------------------------------------------------
-- 3. Origem pendente (lead ainda não existe quando a origem chega)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_origem_pendente (
    id          bigserial PRIMARY KEY,
    phone_key   text NOT NULL,
    origem      jsonb NOT NULL,
    id_meta     text,
    extras      jsonb,
    recebido_em timestamptz NOT NULL DEFAULT now(),
    aplicado_em timestamptz
);
CREATE INDEX IF NOT EXISTS idx_lead_origem_pendente_key
    ON public.lead_origem_pendente (phone_key) WHERE aplicado_em IS NULL;
ALTER TABLE public.lead_origem_pendente ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 4. registrar_origem_lead
--    p_origem  → vai para utm_params (first touch: não sobrescreve)
--    p_id_meta → ctwa_clid ou leadgen_id (único por lead)
--    p_extras  → {"vehicle_interest": "...", "respostas": {...}, "bruto": {...}}
--                respostas/bruto vão para dados_brutos (crm26) / details (master)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_origem_lead(
    p_telefone text,
    p_origem   jsonb,
    p_id_meta  text  DEFAULT NULL,
    p_extras   jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_key      text := public.fn_phone_key(p_telefone);
    v_id_meta  text := nullif(btrim(coalesce(p_id_meta, '')), '');
    v_veiculo  text := nullif(btrim(coalesce(p_extras->>'vehicle_interest', '')), '');
    v_det      jsonb;
    n_crm26    int := 0;
    n_master   int := 0;
    n_achados  int := 0;
BEGIN
    IF v_key IS NULL OR public.fn_origem_vazia(p_origem) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'telefone ou origem ausente');
    END IF;

    v_det := jsonb_strip_nulls(jsonb_build_object(
        'origem_respostas', p_extras->'respostas',
        'origem_bruta',     p_extras->'bruto'
    ));

    -- crm26: só quando muda algo (ver cabeçalho).
    UPDATE public.leads_distribuicao_crm_26 d SET
        utm_params = CASE WHEN public.fn_origem_vazia(d.utm_params) THEN p_origem ELSE d.utm_params END,
        id_meta = coalesce(nullif(d.id_meta, ''), v_id_meta),
        interesse = CASE WHEN v_veiculo IS NOT NULL AND public.fn_interesse_generico(d.interesse)
                         THEN v_veiculo ELSE d.interesse END,
        vehicle_interest = CASE WHEN v_veiculo IS NOT NULL AND public.fn_interesse_generico(d.vehicle_interest)
                                THEN v_veiculo ELSE d.vehicle_interest END,
        dados_brutos = CASE WHEN v_det = '{}'::jsonb THEN d.dados_brutos
                            ELSE v_det || CASE WHEN jsonb_typeof(d.dados_brutos) = 'object' THEN d.dados_brutos ELSE '{}'::jsonb END
                       END
    WHERE public.fn_phone_key(d.telefone) = v_key
      AND (
            public.fn_origem_vazia(d.utm_params)
         OR (nullif(d.id_meta, '') IS NULL AND v_id_meta IS NOT NULL)
         OR (v_veiculo IS NOT NULL AND (public.fn_interesse_generico(d.interesse) OR public.fn_interesse_generico(d.vehicle_interest)))
         OR (v_det <> '{}'::jsonb AND NOT (coalesce(d.dados_brutos, '{}'::jsonb) ?| ARRAY['origem_respostas', 'origem_bruta']))
      );
    GET DIAGNOSTICS n_crm26 = ROW_COUNT;

    UPDATE public.leads_master m SET
        utm_params = CASE WHEN public.fn_origem_vazia(m.utm_params) THEN p_origem ELSE m.utm_params END,
        id_meta = CASE
            WHEN nullif(m.id_meta, '') IS NULL AND v_id_meta IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.leads_master x WHERE x.id_meta = v_id_meta AND x.id <> m.id)
            THEN v_id_meta ELSE m.id_meta END,
        vehicle_interest = CASE WHEN v_veiculo IS NOT NULL AND public.fn_interesse_generico(m.vehicle_interest)
                                THEN v_veiculo ELSE m.vehicle_interest END,
        details = CASE WHEN v_det = '{}'::jsonb THEN m.details
                       ELSE v_det || CASE WHEN jsonb_typeof(m.details) = 'object' THEN m.details ELSE '{}'::jsonb END
                  END
    WHERE public.fn_phone_key(m.phone) = v_key
      AND (
            public.fn_origem_vazia(m.utm_params)
         OR (nullif(m.id_meta, '') IS NULL AND v_id_meta IS NOT NULL)
         OR (v_veiculo IS NOT NULL AND public.fn_interesse_generico(m.vehicle_interest))
         OR (v_det <> '{}'::jsonb AND NOT (coalesce(m.details, '{}'::jsonb) ?| ARRAY['origem_respostas', 'origem_bruta']))
      );
    GET DIAGNOSTICS n_master = ROW_COUNT;

    -- O lead existe (mesmo sem nada a mudar)? Senão, guarda como pendente.
    SELECT (SELECT count(*) FROM public.leads_distribuicao_crm_26 WHERE public.fn_phone_key(telefone) = v_key)
         + (SELECT count(*) FROM public.leads_master WHERE public.fn_phone_key(phone) = v_key)
      INTO n_achados;

    IF n_achados = 0 THEN
        INSERT INTO public.lead_origem_pendente (phone_key, origem, id_meta, extras)
        VALUES (v_key, p_origem, v_id_meta, p_extras);
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'crm26_atualizados', n_crm26,
        'master_atualizados', n_master,
        'pendente', n_achados = 0
    );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_origem_lead(text, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_origem_lead(text, jsonb, text, jsonb) TO service_role;


-- Aplica a origem pendente quando o n8n finalmente insere o lead.
CREATE OR REPLACE FUNCTION public.fn_aplica_origem_pendente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key text;
    r     record;
    v_veiculo text;
    v_det jsonb;
BEGIN
    BEGIN
        v_key := public.fn_phone_key(NEW.telefone);
        IF v_key IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT * INTO r
          FROM public.lead_origem_pendente
         WHERE phone_key = v_key
           AND aplicado_em IS NULL
           AND recebido_em > now() - interval '30 days'
         ORDER BY recebido_em ASC   -- first touch
         LIMIT 1;

        IF r.id IS NULL THEN
            RETURN NEW;
        END IF;

        IF public.fn_origem_vazia(NEW.utm_params) THEN
            NEW.utm_params := r.origem;
        END IF;
        IF nullif(NEW.id_meta, '') IS NULL THEN
            NEW.id_meta := r.id_meta;
        END IF;

        v_veiculo := nullif(btrim(coalesce(r.extras->>'vehicle_interest', '')), '');
        IF v_veiculo IS NOT NULL AND public.fn_interesse_generico(NEW.interesse) THEN
            NEW.interesse := v_veiculo;
        END IF;
        IF v_veiculo IS NOT NULL AND public.fn_interesse_generico(NEW.vehicle_interest) THEN
            NEW.vehicle_interest := v_veiculo;
        END IF;

        v_det := jsonb_strip_nulls(jsonb_build_object(
            'origem_respostas', r.extras->'respostas',
            'origem_bruta',     r.extras->'bruto'
        ));
        IF v_det <> '{}'::jsonb THEN
            NEW.dados_brutos := v_det || CASE WHEN jsonb_typeof(NEW.dados_brutos) = 'object' THEN NEW.dados_brutos ELSE '{}'::jsonb END;
        END IF;

        UPDATE public.lead_origem_pendente
           SET aplicado_em = now()
         WHERE phone_key = v_key AND aplicado_em IS NULL;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[origem] fn_aplica_origem_pendente: %', SQLERRM;
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aplica_origem_pendente ON public.leads_distribuicao_crm_26;
CREATE TRIGGER trg_aplica_origem_pendente
    BEFORE INSERT ON public.leads_distribuicao_crm_26
    FOR EACH ROW EXECUTE FUNCTION public.fn_aplica_origem_pendente();


-- ---------------------------------------------------------------------------
-- 5. crm26 -> master carrega a origem
--    Mesmo corpo de antes + utm_params e guarda do UNIQUE de id_meta (antes
--    um id_meta '' ou repetido derrubava o INSERT em crm26 inteiro).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_distribuicao_26_to_master()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO leads_master (
        phone, name, city, vehicle_interest, source,
        assigned_consultant_id, primeiro_vendedor, status, ai_score, ai_classification,
        id_meta, utm_params, created_at, updated_at
    )
    VALUES (
        clean_phone_number(NEW.telefone), NEW.nome, NEW.cidade, NEW.interesse, COALESCE(NEW.origem, 'crm_26'),
        NEW.assigned_consultant_id, NEW.vendedor, NEW.status, NEW.ai_score, NEW.ai_classification,
        CASE
            WHEN nullif(NEW.id_meta, '') IS NOT NULL
             AND NOT EXISTS (
                SELECT 1 FROM leads_master x
                 WHERE x.id_meta = NEW.id_meta
                   AND x.phone IS DISTINCT FROM clean_phone_number(NEW.telefone)
             )
            THEN NEW.id_meta
        END,
        NEW.utm_params, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (phone) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, leads_master.name),
        source = CASE
            WHEN leads_master.source = 'crm_26' OR leads_master.source IS NULL THEN EXCLUDED.source
            ELSE leads_master.source
        END,
        assigned_consultant_id = COALESCE(EXCLUDED.assigned_consultant_id, leads_master.assigned_consultant_id),
        primeiro_vendedor = COALESCE(EXCLUDED.primeiro_vendedor, leads_master.primeiro_vendedor),
        status = EXCLUDED.status,
        id_meta = COALESCE(nullif(leads_master.id_meta, ''), EXCLUDED.id_meta),
        utm_params = CASE WHEN public.fn_origem_vazia(leads_master.utm_params) THEN EXCLUDED.utm_params ELSE leads_master.utm_params END,
        updated_at = NOW(),
        last_seen = NOW();
    RETURN NEW;
END;
$function$;


-- Mesmo corpo de antes + utm_params / id_meta / details só preenchendo o que
-- está vazio (este trigger é quem de fato roda quando o telefone já existe —
-- ele cancela o INSERT e o ON CONFLICT acima nunca chega a executar).
CREATE OR REPLACE FUNCTION public.merge_lead_on_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    NEW.phone := regexp_replace(COALESCE(NEW.phone, ''), '[^0-9]', '', 'g');
    IF COALESCE(NEW.phone, '') = '' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.leads_master
         WHERE phone = NEW.phone AND id != COALESCE(NEW.id, gen_random_uuid())
    ) THEN
        UPDATE public.leads_master SET
            name = COALESCE(NULLIF(NEW.name, ''), NULLIF(name, '')),
            email = COALESCE(NULLIF(NEW.email, ''), NULLIF(email, '')),
            vehicle_interest = COALESCE(NULLIF(NEW.vehicle_interest, ''), NULLIF(vehicle_interest, '')),
            ai_summary = COALESCE(NULLIF(NEW.ai_summary, ''), NULLIF(ai_summary, '')),
            next_step = COALESCE(NULLIF(NEW.next_step, ''), NULLIF(next_step, '')),
            valor_investimento = COALESCE(NULLIF(NEW.valor_investimento, ''), NULLIF(valor_investimento, '')),
            assigned_consultant_id = COALESCE(NEW.assigned_consultant_id, assigned_consultant_id),
            utm_params = CASE WHEN public.fn_origem_vazia(utm_params) THEN NEW.utm_params ELSE utm_params END,
            id_meta = CASE
                WHEN NULLIF(id_meta, '') IS NULL AND NULLIF(NEW.id_meta, '') IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM public.leads_master x WHERE x.id_meta = NEW.id_meta)
                THEN NEW.id_meta ELSE id_meta END,
            details = CASE
                WHEN NEW.details IS NULL OR jsonb_typeof(NEW.details) <> 'object' THEN details
                ELSE NEW.details || CASE WHEN jsonb_typeof(details) = 'object' THEN details ELSE '{}'::jsonb END
            END,
            updated_at = NOW()
        WHERE phone = NEW.phone;
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 6. Fila de eventos do funil para a Meta
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_capi_queue (
    id           bigserial PRIMARY KEY,
    event_name   text NOT NULL CHECK (event_name IN ('QualifiedLead', 'Schedule', 'Purchase')),
    -- Determinístico por linha: o reenvio do mesmo evento usa o mesmo event_id
    -- e a Meta deduplica.
    event_id     text GENERATED ALWAYS AS ('crm_' || lower(event_name) || '_' || id::text) STORED,
    lead_table   text NOT NULL,
    lead_id      text NOT NULL,
    phone_key    text,
    event_time   timestamptz NOT NULL DEFAULT now(),
    not_before   timestamptz NOT NULL DEFAULT now(),
    status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'expired')),
    attempts     int NOT NULL DEFAULT 0,
    canal        text,
    last_error   text,
    test_sent_at timestamptz,
    sent_at      timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_capi_queue_pending
    ON public.meta_capi_queue (not_before) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_meta_capi_queue_phone
    ON public.meta_capi_queue (event_name, phone_key);
ALTER TABLE public.meta_capi_queue ENABLE ROW LEVEL SECURITY;


-- As 4 perguntas de qualificação — mesmo critério do selo "qualificado" das
-- telas do funil (plano aprovado em 14/10/2026). Lidas via jsonb para que
-- coluna inexistente vire "não consta" em vez de quebrar o trigger.
--   carro   → coalesce(vehicle_interest, interesse); os marcadores do n8n
--             'Analisar Perfil' e 'Lead Google - Não especificado' NÃO contam
--   entrada → valor_investimento ("Sem entrada" conta como respondida)
--   troca   → carro_troca        ("Sem troca" conta como respondida)
--   prazo   → prazo_compra (esta_semana | este_mes | 1_3_meses | pesquisando;
--             coluna criada pela migration 20261014b da sessão do funil)
-- Forma de pagamento (metodo_compra) NÃO faz parte do critério.
CREATE OR REPLACE FUNCTION public.fn_lead_qualificacao(p_row jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
    WITH campos(campo, valor) AS (
        VALUES ('carro',        coalesce(nullif(btrim(p_row->>'vehicle_interest'), ''), p_row->>'interesse')),
               ('entrada',      p_row->>'valor_investimento'),
               ('troca',        p_row->>'carro_troca'),
               ('prazo_compra', p_row->>'prazo_compra')
    ), r AS (
        SELECT campo,
               CASE
                   WHEN nullif(btrim(coalesce(valor, '')), '') IS NULL
                     OR lower(btrim(valor)) IN ('não consta', 'nao consta', 'não informado', 'nao informado',
                                                'n/a', '-', 'null', 'indefinido',
                                                'analisar perfil', 'lead google - não especificado')
                   THEN 'não consta'
                   ELSE btrim(valor)
               END AS v
          FROM campos
    )
    SELECT jsonb_object_agg(campo, v) || jsonb_build_object('completo', bool_and(v <> 'não consta'))
      FROM r
$$;

-- Etapa do funil -> evento. Status confirmados com a sessão do funil em
-- 14/10/2026: visita agendada = 'scheduled', visitou = 'visited',
-- vendido = 'vendido'. 'visited' também vale como visita agendada (se a etapa
-- foi pulada, a visita aconteceu); a fila deduplica por pessoa.
-- Mantém o critério do relatório do squad Tráfego (venda/ganho, "contém
-- visita") para status antigos ou novos que sigam esse padrão.
CREATE OR REPLACE FUNCTION public.fn_meta_capi_evento_da_etapa(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN s IN ('vendido', 'venda', 'ganho', 'venda_realizada', 'venda realizada')
            THEN 'Purchase'
        WHEN (s IN ('scheduled', 'visited', 'agendado', 'agendamento') OR s LIKE '%visita%')
             AND s NOT LIKE '%cancel%' AND s NOT LIKE '%nao_compareceu%' AND s NOT LIKE '%não compareceu%'
            THEN 'Schedule'
    END
    FROM (SELECT lower(btrim(coalesce(p_status, ''))) AS s) x
$$;

-- Enfileira 1 evento por pessoa (telefone) a cada 90 dias. Pessoa que volta
-- meses depois por outro anúncio gera evento de novo.
CREATE OR REPLACE FUNCTION public.fn_meta_capi_enfileirar(
    p_event      text,
    p_table      text,
    p_lead_id    text,
    p_phone      text,
    p_event_time timestamptz DEFAULT now(),
    p_atraso     interval    DEFAULT interval '0'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key text := public.fn_phone_key(p_phone);
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.meta_capi_queue q
         WHERE q.event_name = p_event
           AND ((v_key IS NOT NULL AND q.phone_key = v_key)
                OR (q.lead_table = p_table AND q.lead_id = p_lead_id))
           AND q.event_time > now() - interval '90 days'
    ) THEN
        RETURN;
    END IF;

    INSERT INTO public.meta_capi_queue (event_name, lead_table, lead_id, phone_key, event_time, not_before)
    VALUES (p_event, p_table, p_lead_id, v_key, coalesce(p_event_time, now()), now() + coalesce(p_atraso, interval '0'));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_meta_capi_enfileirar(text, text, text, text, timestamptz, interval) FROM PUBLIC, anon, authenticated;


-- Trigger de funil em crm26 e master. Só lê o lead; erro vira WARNING.
CREATE OR REPLACE FUNCTION public.trg_meta_capi_funil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new    jsonb;
    v_old    jsonb;
    v_phone  text;
    v_evento text;
    v_recente boolean;
BEGIN
    BEGIN
        v_new := to_jsonb(NEW);
        v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
        v_phone := coalesce(v_new->>'telefone', v_new->>'phone');

        -- Lead qualificado: as 4 respostas preenchidas (transição).
        IF (public.fn_lead_qualificacao(v_new)->>'completo')::boolean
           AND (v_old IS NULL OR NOT (public.fn_lead_qualificacao(v_old)->>'completo')::boolean)
        THEN
            PERFORM public.fn_meta_capi_enfileirar('QualifiedLead', TG_TABLE_NAME, NEW.id::text, v_phone);
        END IF;

        -- Visita agendada / venda (mudança de status). Em INSERT só vale lead
        -- criado agora — carga em massa de histórico não vira evento "de hoje".
        v_evento := public.fn_meta_capi_evento_da_etapa(v_new->>'status');
        v_recente := coalesce((v_new->>'created_at')::timestamptz, now()) > now() - interval '1 day';
        IF v_evento IS NOT NULL
           AND ((TG_OP = 'UPDATE' AND (v_old->>'status') IS DISTINCT FROM (v_new->>'status'))
                OR (TG_OP = 'INSERT' AND v_recente))
        THEN
            -- Venda espera 2h: dá tempo do valor da venda ser lançado.
            PERFORM public.fn_meta_capi_enfileirar(
                v_evento, TG_TABLE_NAME, NEW.id::text, v_phone, now(),
                CASE WHEN v_evento = 'Purchase' THEN interval '2 hours' ELSE interval '0' END
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[meta_capi] trg_meta_capi_funil (%): %', TG_TABLE_NAME, SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_capi_funil ON public.leads_distribuicao_crm_26;
CREATE TRIGGER trg_meta_capi_funil
    AFTER INSERT OR UPDATE ON public.leads_distribuicao_crm_26
    FOR EACH ROW EXECUTE FUNCTION public.trg_meta_capi_funil();

DROP TRIGGER IF EXISTS trg_meta_capi_funil ON public.leads_master;
CREATE TRIGGER trg_meta_capi_funil
    AFTER INSERT OR UPDATE ON public.leads_master
    FOR EACH ROW EXECUTE FUNCTION public.trg_meta_capi_funil();


-- Agendamento criado na agenda = visita agendada (lead_uid = 'tabela:id').
CREATE OR REPLACE FUNCTION public.trg_meta_capi_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table text;
    v_id    text;
BEGIN
    BEGIN
        IF lower(coalesce(NEW.status, '')) IN ('cancelado', 'cancelada', 'canceled', 'cancelled') THEN
            RETURN NULL;
        END IF;
        v_table := nullif(split_part(coalesce(NEW.lead_uid, ''), ':', 1), '');
        v_id    := nullif(split_part(coalesce(NEW.lead_uid, ''), ':', 2), '');
        IF v_table IS NULL OR v_id IS NULL THEN
            v_table := 'agendamentos';
            v_id := NEW.id::text;
        END IF;
        PERFORM public.fn_meta_capi_enfileirar(
            'Schedule', v_table, v_id,
            coalesce(nullif(NEW.cliente_whatsapp, ''), NEW.cliente_telefone),
            coalesce(NEW.criado_em, now())
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[meta_capi] trg_meta_capi_agendamento: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_capi_agendamento ON public.agendamentos;
CREATE TRIGGER trg_meta_capi_agendamento
    AFTER INSERT ON public.agendamentos
    FOR EACH ROW EXECUTE FUNCTION public.trg_meta_capi_agendamento();


-- Perfil do lead para o worker montar o evento. Junta crm26 + master pelo
-- telefone e o valor da venda. Só service_role executa (tem PII).
CREATE OR REPLACE FUNCTION public.fn_meta_capi_perfil(p_fila_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    q       public.meta_capi_queue%ROWTYPE;
    v_d     jsonb;
    v_m     jsonb;
    v_valor numeric;
BEGIN
    SELECT * INTO q FROM public.meta_capi_queue WHERE id = p_fila_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_build_object(
               'id', d.id, 'nome', d.nome, 'telefone', d.telefone, 'cidade', d.cidade,
               'interesse', coalesce(nullif(d.vehicle_interest, ''), d.interesse),
               'utm_params', d.utm_params, 'id_meta', nullif(d.id_meta, ''), 'lead_id', nullif(d.lead_id, ''),
               'valor_venda', to_jsonb(d)->'valor_venda',
               'created_at', d.created_at)
      INTO v_d
      FROM public.leads_distribuicao_crm_26 d
     WHERE (q.lead_table = 'leads_distribuicao_crm_26' AND d.id::text = q.lead_id)
        OR (q.phone_key IS NOT NULL AND public.fn_phone_key(d.telefone) = q.phone_key)
     ORDER BY (d.id::text = q.lead_id) DESC, d.created_at DESC
     LIMIT 1;

    SELECT jsonb_build_object(
               'id', m.id, 'nome', m.name, 'telefone', m.phone, 'email', m.email, 'cidade', m.city,
               'interesse', m.vehicle_interest, 'utm_params', m.utm_params, 'id_meta', nullif(m.id_meta, ''),
               'ticket_estimado', m.estimated_ticket, 'created_at', m.created_at)
      INTO v_m
      FROM public.leads_master m
     WHERE (q.lead_table = 'leads_master' AND m.id::text = q.lead_id)
        OR (q.phone_key IS NOT NULL AND public.fn_phone_key(m.phone) = q.phone_key)
     ORDER BY (m.id::text = q.lead_id) DESC, m.created_at DESC
     LIMIT 1;

    IF q.event_name = 'Purchase' THEN
        SELECT s.sale_value INTO v_valor
          FROM public.sales_manos_crm s
         WHERE s.sale_value > 0
           AND (s.lead_id IN (q.lead_id, v_d->>'id', v_m->>'id')
                OR (q.phone_key IS NOT NULL AND public.fn_phone_key(s.phone) = q.phone_key))
         ORDER BY s.sale_date DESC NULLS LAST
         LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'fila', to_jsonb(q),
        'crm26', v_d,
        'master', v_m,
        'valor_venda', v_valor
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_meta_capi_perfil(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_meta_capi_perfil(bigint) TO service_role;


-- ---------------------------------------------------------------------------
-- 7. Gasto por anúncio/dia e custo por resultado
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_ad_spend_daily (
    platform      text NOT NULL DEFAULT 'meta',
    spend_date    date NOT NULL,
    account_id    text,
    campaign_id   text NOT NULL,
    campaign_name text,
    adset_id      text,
    adset_name    text,
    ad_id         text NOT NULL DEFAULT '',
    ad_name       text,
    spend         numeric(12, 2) NOT NULL DEFAULT 0,
    impressions   bigint,
    clicks        bigint,
    currency      text DEFAULT 'BRL',
    source        text,   -- 'crm_sync' (Graph API) | 'squad_trafego'
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (platform, spend_date, campaign_id, ad_id)
);
CREATE INDEX IF NOT EXISTS idx_meta_ad_spend_ad ON public.meta_ad_spend_daily (ad_id) WHERE ad_id <> '';
ALTER TABLE public.meta_ad_spend_daily ENABLE ROW LEVEL SECURITY;


-- Coorte: leads criados no período e o que aconteceu com eles depois (em
-- qualquer data). Gasto: o do período. Visões de período recente parecem
-- piores porque a venda ainda não aconteceu — é esperado.
--
-- Campanha do lead:
--   utm_params.campaign_id (Google, Meta lead form, site com utm_id)
--   senão o anúncio (source_id do CTWA / ad_id / utm_content) mapeado pela
--   tabela de gasto -> campanha.
CREATE OR REPLACE FUNCTION public.fn_custo_por_resultado(p_inicio date, p_fim date)
RETURNS TABLE (
    platform              text,
    campaign_id           text,
    campaign_name         text,
    spend                 numeric,
    leads                 bigint,
    qualificados          bigint,
    agendados             bigint,
    vendas                bigint,
    receita               numeric,
    custo_por_lead        numeric,
    custo_por_qualificado numeric,
    custo_por_agendamento numeric,
    custo_por_venda       numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH ad_map AS (
    SELECT DISTINCT ON (s.ad_id) s.ad_id, s.platform, s.campaign_id
      FROM meta_ad_spend_daily s
     WHERE s.ad_id <> ''
     ORDER BY s.ad_id, s.spend_date DESC
),
camp AS (
    SELECT DISTINCT ON (s.platform, s.campaign_id) s.platform, s.campaign_id, s.campaign_name
      FROM meta_ad_spend_daily s
     ORDER BY s.platform, s.campaign_id, s.spend_date DESC
),
gasto AS (
    SELECT s.platform, s.campaign_id, sum(s.spend) AS spend
      FROM meta_ad_spend_daily s
     WHERE s.spend_date BETWEEN p_inicio AND p_fim
     GROUP BY 1, 2
),
base AS (
    -- crm26 é a porta de entrada; master só para quem não existe em crm26.
    SELECT fn_phone_key(d.telefone) AS phone_key,
           coalesce(
               CASE WHEN NOT fn_origem_vazia(d.utm_params) THEN d.utm_params END,
               (SELECT m.utm_params FROM leads_master m
                 WHERE fn_phone_key(m.phone) = fn_phone_key(d.telefone)
                   AND NOT fn_origem_vazia(m.utm_params) LIMIT 1)
           ) AS utm
      FROM leads_distribuicao_crm_26 d
     WHERE d.created_at >= p_inicio AND d.created_at < p_fim + 1
    UNION ALL
    SELECT fn_phone_key(m.phone), m.utm_params
      FROM leads_master m
     WHERE m.created_at >= p_inicio AND m.created_at < p_fim + 1
       AND NOT EXISTS (SELECT 1 FROM leads_distribuicao_crm_26 d2
                        WHERE fn_phone_key(d2.telefone) = fn_phone_key(m.phone))
),
atrib AS (
    SELECT b.phone_key,
           coalesce(
               nullif(b.utm->>'platform', ''),
               am.platform,
               CASE WHEN b.utm ?| ARRAY['gclid', 'gbraid', 'wbraid'] THEN 'google'
                    WHEN b.utm ?| ARRAY['fbclid', 'ctwa_clid'] THEN 'meta' END,
               'sem_origem'
           ) AS platform,
           coalesce(nullif(b.utm->>'campaign_id', ''), am.campaign_id, nullif(b.utm->>'utm_id', '')) AS campaign_id
      FROM base b
      LEFT JOIN ad_map am
        ON am.ad_id = coalesce(nullif(b.utm->>'source_id', ''), nullif(b.utm->>'ad_id', ''), nullif(b.utm->>'utm_content', ''))
),
funil AS (
    SELECT a.platform, a.campaign_id,
           count(*) AS leads,
           count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM meta_capi_queue q WHERE q.phone_key = a.phone_key AND q.event_name = 'QualifiedLead')) AS qualificados,
           count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM meta_capi_queue q WHERE q.phone_key = a.phone_key AND q.event_name = 'Schedule')
            OR EXISTS (
               SELECT 1 FROM agendamentos g
                WHERE fn_phone_key(coalesce(nullif(g.cliente_whatsapp, ''), g.cliente_telefone)) = a.phone_key)) AS agendados,
           count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM meta_capi_queue q WHERE q.phone_key = a.phone_key AND q.event_name = 'Purchase')) AS vendas,
           coalesce(sum((
               SELECT max(s.sale_value) FROM sales_manos_crm s
                WHERE fn_phone_key(s.phone) = a.phone_key AND s.sale_value > 0)), 0) AS receita
      FROM atrib a
     WHERE a.phone_key IS NOT NULL
     GROUP BY 1, 2
)
SELECT coalesce(f.platform, g.platform)       AS platform,
       coalesce(f.campaign_id, g.campaign_id) AS campaign_id,
       c.campaign_name,
       coalesce(g.spend, 0)                   AS spend,
       coalesce(f.leads, 0)                   AS leads,
       coalesce(f.qualificados, 0)            AS qualificados,
       coalesce(f.agendados, 0)               AS agendados,
       coalesce(f.vendas, 0)                  AS vendas,
       coalesce(f.receita, 0)                 AS receita,
       round(g.spend / nullif(f.leads, 0), 2)        AS custo_por_lead,
       round(g.spend / nullif(f.qualificados, 0), 2) AS custo_por_qualificado,
       round(g.spend / nullif(f.agendados, 0), 2)    AS custo_por_agendamento,
       round(g.spend / nullif(f.vendas, 0), 2)       AS custo_por_venda
  FROM funil f
  FULL OUTER JOIN gasto g
    ON g.platform = f.platform AND g.campaign_id = f.campaign_id
  LEFT JOIN camp c
    ON c.platform = coalesce(f.platform, g.platform) AND c.campaign_id = coalesce(f.campaign_id, g.campaign_id)
 ORDER BY coalesce(g.spend, 0) DESC, coalesce(f.leads, 0) DESC
$$;

REVOKE ALL ON FUNCTION public.fn_custo_por_resultado(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_custo_por_resultado(date, date) TO service_role;


-- ---------------------------------------------------------------------------
-- 8. Agendamento (mesmo padrão dos outros crons: pg_cron -> call_cron_endpoint)
--    O despacho nasce DESLIGADO: só envia quando META_CAPI_FUNNEL_MODE for
--    'test' (com META_TEST_EVENT_CODE) ou 'live' no ambiente do app.
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
    'meta-capi-dispatch',
    '*/5 * * * *',
    $cron$ SELECT public.call_cron_endpoint('/api/cron/meta-capi-dispatch') $cron$
);

SELECT cron.schedule(
    'meta-ad-spend-sync',
    '30 6 * * *',
    $cron$ SELECT public.call_cron_endpoint('/api/cron/meta-ad-spend-sync') $cron$
);
