-- ===========================================================================
-- NOME E CARRO DE INTERESSE CORRIGIDOS SOZINHOS PELO CRM
-- Data: 2026-11-07 · Growth 360 · NÃO APLICAR sem o "aprovado" do Alexandre
-- Especificação: docs/growth360/nome-e-interesse-automaticos.md
--
-- O que cria:
--   lead_nome_historico      cada troca (ou tentativa) de nome: antigo, novo, origem,
--                            trecho que justifica, quem fez. Serve para DESFAZER.
--   lead_veiculos_interesse  carros de interesse por telefone (feed, origem, em_estoque).
--   atualizar_nome_lead()    ÚNICO caminho do CRM para trocar nome (crm26 + master +
--                            wa_conversas), numa transação, com a regra de prioridade:
--                            manual > cliente_disse > formulario > perfil_whatsapp > generico
--   desfazer_nome_lead()     volta o nome anterior (botão "desfazer" da tela)
--   registrar_interesse_lead()  grava o carro e recompõe o campo que a tela lê
--                            (crm26.interesse + vehicle_interest; master.vehicle_interest)
--   nome_lead_estado()       nome atual e origem (selo da tela e Laura)
--
-- Muda (sem trocar comportamento para ninguém mais):
--   sync_distribuicao_26_to_master(): ganha uma guarda no começo. Quando a escrita vem
--     destas funções (variável de transação manos.escrita_crm = 'nome_interesse'), o
--     gatilho NÃO copia nada para leads_master. Motivo: hoje 1.815 leads têm status
--     diferente entre crm26 e master, e a cópia sobrescreveria o status do master.
--     O nome/interesse do master é gravado direto pela função. Para qualquer outra
--     escrita o gatilho é idêntico ao de antes.
--   wa_conversas.nome_cliente_origem: aceita as origens novas.
--
-- NÃO mexe em status, não dispara CAPI de etapa, não cria alerta. Nenhuma coluna nova
-- em tabela de lead.
--
-- REVERSÃO:
--   drop function if exists public.atualizar_nome_lead(text,text,text,text,text),
--     public.desfazer_nome_lead(uuid,text), public.registrar_interesse_lead(text,text,text,smallint,text,text,boolean,text,text),
--     public.nome_lead_estado(text), public.fn_lead_nome_origem_atual(text,text,text,text),
--     public.atualizar_cidade_lead(text,text), public.fn_prioridade_nome(text),
--     public.fn_compor_interesse(text), public.fn_mesmo_carro(text,text), public.fn_lead_telefone_e_meu(text),
--     public.fn_nome_generico(text), public.fn_interesse_vazio(text), public.fn_sem_acento(text);
--   drop table if exists public.lead_nome_historico, public.lead_veiculos_interesse;
--   gatilho: recriar sync_distribuicao_26_to_master() sem o bloco "GUARDA" (o resto é idêntico);
--   wa_conversas: alter table … drop constraint wa_conversas_nome_cliente_origem_check,
--     add constraint wa_conversas_nome_cliente_origem_check check (nome_cliente_origem in ('ia','manual'));
--     (antes, update wa_conversas set nome_cliente_origem = 'ia' where nome_cliente_origem not in ('ia','manual'))
--
-- Teste: supabase/tests/nome_interesse.test.sql (bloco DO que sempre termina em erro).
--
-- ENSAIADA em produção em 11/11/2026 dentro de BEGIN … ROLLBACK junto com o teste:
-- "NOME_INTERESSE PASSOU — 33 verificações ok". Conferido depois: 0 tabelas, 0 funções,
-- 0 dados de teste, gatilho original intacto. NÃO APLICADA (precisa do "aprovado").
-- ===========================================================================

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Ajudantes (puros)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sem_acento(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT lower(translate(coalesce(p, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'))
$$;

-- Mesma regra de nomeGenerico() em src/lib/identificacao/nome.ts
CREATE OR REPLACE FUNCTION public.fn_nome_generico(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    WITH t AS (SELECT btrim(regexp_replace(public.fn_sem_acento(p), '\s+', ' ', 'g')) AS s)
    SELECT s = '' OR s = '---'
        OR length(regexp_replace(s, '\D', '', 'g')) >= 6
        OR s !~ '[a-z]{2}'
        OR s ~ '^(lead\M|analisar perfil|novo lead|sem nome|cliente\M|contato\M|desconhecid|whats ?app|teste$)'
      FROM t
$$;

-- Mesma regra de interesseGenerico() em src/lib/qualificacao.ts. Diferente de
-- fn_interesse_generico (E04), que não trata "Analisar Perfil": aquela fica como está.
CREATE OR REPLACE FUNCTION public.fn_interesse_vazio(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT length(btrim(coalesce(p, ''))) < 2
        OR public.fn_sem_acento(btrim(p)) ~ '^(analisar\s+perfil|lead\s+(google|whatsapp|facebook|meta|instagram)|sem\s+(interesse|info)|entrada\s+manual|-+$)'
        OR public.fn_sem_acento(p) ~ 'nao\s+especificad'
$$;

-- Mesmo carro? Todas as palavras do texto menor estão no maior ("Onix 2018" ⊂ "Chevrolet Onix LTZ 2018")
CREATE OR REPLACE FUNCTION public.fn_mesmo_carro(a text, b text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    WITH x AS (
        SELECT ARRAY(SELECT t FROM regexp_split_to_table(public.fn_sem_acento(a), '[^a-z0-9]+') t WHERE length(t) >= 2) AS ta,
               ARRAY(SELECT t FROM regexp_split_to_table(public.fn_sem_acento(b), '[^a-z0-9]+') t WHERE length(t) >= 2) AS tb
    )
    SELECT cardinality(ta) > 0 AND cardinality(tb) > 0 AND (ta <@ tb OR tb <@ ta) FROM x
$$;

-- ---------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_nome_historico (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    telefone_key     text NOT NULL,
    lead_uid         text,             -- 'tabela:id'; NULL = só a conversa (lead ainda não existe)
    nome_antigo      text,
    nome_novo        text NOT NULL,
    origem           text NOT NULL CHECK (origem IN ('manual', 'cliente_disse', 'formulario', 'perfil_whatsapp', 'desfeito')),
    origem_anterior  text,
    aplicado         boolean NOT NULL,
    motivo           text,
    trecho           text,
    por              text NOT NULL,    -- 'crm:ingestao', 'laura-crm', 'consultor:<auth uid>', 'limpeza'
    criado_em        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_nome_hist_tel ON public.lead_nome_historico (telefone_key, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_lead_nome_hist_uid ON public.lead_nome_historico (lead_uid, criado_em DESC);
COMMENT ON TABLE public.lead_nome_historico IS
    'Trocas de nome feitas pelo CRM (e tentativas recusadas). O último registro aplicado diz a origem do nome atual.';

CREATE TABLE IF NOT EXISTS public.lead_veiculos_interesse (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    telefone_key   text NOT NULL,
    descricao      text NOT NULL,
    modelo_chave   text NOT NULL,
    ano            smallint,
    codigo_feed    text,
    origem         text NOT NULL CHECK (origem IN ('link_site', 'anuncio', 'laura_estoque', 'cliente_citou', 'anterior')),
    em_estoque     boolean NOT NULL DEFAULT true,
    oculto         boolean NOT NULL DEFAULT false,  -- consultor editou o campo e tirou da tela
    trecho         text,
    por            text,
    criado_em      timestamptz NOT NULL DEFAULT now(),
    atualizado_em  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_veiculos_interesse_unico
    ON public.lead_veiculos_interesse (telefone_key, modelo_chave, coalesce(ano, 0));
COMMENT ON TABLE public.lead_veiculos_interesse IS
    'Carros de interesse por telefone. origem=anterior: texto que já estava no lead (digitado por consultor ou n8n) — nunca sai da tela.';

ALTER TABLE public.wa_conversas DROP CONSTRAINT IF EXISTS wa_conversas_nome_cliente_origem_check;
ALTER TABLE public.wa_conversas ADD CONSTRAINT wa_conversas_nome_cliente_origem_check
    CHECK (nome_cliente_origem IN ('ia', 'manual', 'cliente_disse', 'formulario', 'perfil_whatsapp', 'generico'));

-- ---------------------------------------------------------------------------
-- 3. Guarda no gatilho de sincronização crm26 → master
--    (corpo idêntico ao de produção em 07/11/2026, só o bloco GUARDA é novo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_distribuicao_26_to_master()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- GUARDA (07/11/2026): escrita de nome/interesse feita por atualizar_nome_lead() /
    -- registrar_interesse_lead() não sincroniza o master por aqui (elas gravam o master
    -- direto). Assim o status do master nunca é sobrescrito por uma troca de nome.
    IF current_setting('manos.escrita_crm', true) = 'nome_interesse' THEN
        RETURN NEW;
    END IF;

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

-- ---------------------------------------------------------------------------
-- 4. Origem do nome atual de um lead
-- ---------------------------------------------------------------------------
-- Sem histórico, um nome que não é genérico pode ser: o perfil do WhatsApp (igual ao
-- nome_contato da conversa), formulário (lead de anúncio/site) ou digitado à mão.
-- Na dúvida vale 'manual' — o CRM não toca.
CREATE OR REPLACE FUNCTION public.fn_lead_nome_origem_atual(p_nome text, p_key text, p_lead_uid text, p_fonte text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    h record;
BEGIN
    IF public.fn_nome_generico(p_nome) THEN RETURN 'generico'; END IF;
    SELECT origem, nome_novo INTO h
      FROM public.lead_nome_historico
     WHERE aplicado AND (lead_uid = p_lead_uid OR (p_lead_uid IS NULL AND lead_uid IS NULL AND telefone_key = p_key))
     ORDER BY criado_em DESC LIMIT 1;
    IF FOUND AND public.fn_sem_acento(h.nome_novo) = public.fn_sem_acento(p_nome) THEN
        RETURN CASE WHEN h.origem = 'desfeito' THEN 'manual' ELSE h.origem END;
    END IF;
    IF FOUND THEN RETURN 'manual'; END IF;  -- mudou depois da última troca do CRM: foi alguém
    IF EXISTS (SELECT 1 FROM public.wa_conversas c
                WHERE c.telefone_key = p_key AND public.fn_sem_acento(c.nome_contato) = public.fn_sem_acento(p_nome)) THEN
        RETURN 'perfil_whatsapp';
    END IF;
    IF public.fn_sem_acento(p_fonte) ~ '(lead ads|formul|facebook|instagram|google|site|meta)' THEN
        RETURN 'formulario';
    END IF;
    RETURN 'manual';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_prioridade_nome(p text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p WHEN 'manual' THEN 1 WHEN 'cliente_disse' THEN 2 WHEN 'formulario' THEN 3
                  WHEN 'perfil_whatsapp' THEN 4 ELSE 5 END
$$;

-- ---------------------------------------------------------------------------
-- 5. atualizar_nome_lead — ÚNICO caminho do CRM para trocar nome
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_nome_lead(
    p_telefone text, p_nome text, p_origem text, p_por text, p_trecho text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_key     text := public.wa_telefone_key(p_telefone);
    v_nome    text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
    r         record;
    v_atual_o text;
    v_troca   boolean;
    v_motivo  text;
    v_aplic   int := 0;
    v_leads   int := 0;
    v_res     jsonb := '[]'::jsonb;
BEGIN
    IF v_key IS NULL OR p_origem NOT IN ('manual', 'cliente_disse', 'formulario', 'perfil_whatsapp')
       OR public.fn_nome_generico(v_nome) OR length(v_nome) > 60 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'entrada inválida');
    END IF;
    -- consultor desfez este nome: o CRM não volta a aplicar
    IF p_origem <> 'manual' AND EXISTS (
        SELECT 1 FROM public.lead_nome_historico
         WHERE telefone_key = v_key AND origem = 'desfeito' AND public.fn_sem_acento(nome_antigo) = public.fn_sem_acento(v_nome)) THEN
        RETURN jsonb_build_object('ok', true, 'aplicados', 0, 'motivo', 'nome desfeito por consultor');
    END IF;

    PERFORM set_config('manos.escrita_crm', 'nome_interesse', true);

    FOR r IN
        SELECT 'leads_distribuicao_crm_26' AS tabela, d.id::text AS id, d.nome AS nome, d.origem AS fonte
          FROM public.leads_distribuicao_crm_26 d WHERE public.wa_telefone_key(d.telefone) = v_key
        UNION ALL
        SELECT 'leads_master', m.id::text, m.name, m.source
          FROM public.leads_master m WHERE public.wa_telefone_key(m.phone) = v_key
    LOOP
        v_leads := v_leads + 1;
        IF public.fn_sem_acento(r.nome) = public.fn_sem_acento(v_nome) THEN CONTINUE; END IF;
        v_atual_o := public.fn_lead_nome_origem_atual(r.nome, v_key, r.tabela || ':' || r.id, r.fonte);
        v_troca := false;
        IF p_origem = 'manual' THEN
            v_troca := true; v_motivo := 'editado por consultor';
        ELSIF v_atual_o = 'manual' THEN
            v_motivo := 'nome digitado por consultor: não troca';
        ELSIF v_atual_o <> 'generico'
              AND split_part(public.fn_sem_acento(r.nome), ' ', 1) = split_part(public.fn_sem_acento(v_nome), ' ', 1)
              AND array_length(regexp_split_to_array(btrim(v_nome), '\s+'), 1) < array_length(regexp_split_to_array(btrim(r.nome), '\s+'), 1) THEN
            v_motivo := 'nome atual mais completo';
        ELSIF public.fn_prioridade_nome(p_origem) < public.fn_prioridade_nome(v_atual_o) THEN
            v_troca := true; v_motivo := 'origem mais forte';
        ELSIF p_origem = 'cliente_disse' AND v_atual_o = 'cliente_disse' THEN
            v_troca := true; v_motivo := 'cliente se corrigiu';
        ELSE
            v_motivo := 'origem mais fraca';
        END IF;

        IF v_troca THEN
            IF r.tabela = 'leads_distribuicao_crm_26' THEN
                UPDATE public.leads_distribuicao_crm_26 SET nome = v_nome WHERE id = r.id::integer;
            ELSE
                UPDATE public.leads_master SET name = v_nome WHERE id = r.id::uuid;
            END IF;
            v_aplic := v_aplic + 1;
        END IF;
        -- histórico: troca aplicada, ou tentativa recusada de quem tem voz (cliente/consultor)
        IF v_troca OR p_origem IN ('cliente_disse', 'manual') THEN
            INSERT INTO public.lead_nome_historico
                (telefone_key, lead_uid, nome_antigo, nome_novo, origem, origem_anterior, aplicado, motivo, trecho, por)
            VALUES (v_key, r.tabela || ':' || r.id, r.nome, v_nome, p_origem, v_atual_o, v_troca, v_motivo, left(p_trecho, 300), p_por);
        END IF;
        v_res := v_res || jsonb_build_object('lead', r.tabela || ':' || r.id, 'aplicado', v_troca, 'motivo', v_motivo);
    END LOOP;

    -- conversa do WhatsApp da loja (nunca troca nome travado como manual)
    UPDATE public.wa_conversas c
       SET nome_cliente = v_nome, nome_cliente_origem = p_origem
     WHERE c.telefone_key = v_key
       AND public.fn_sem_acento(c.nome_cliente) IS DISTINCT FROM public.fn_sem_acento(v_nome)
       AND (p_origem = 'manual'
            OR c.nome_cliente_origem IS NULL
            OR (c.nome_cliente_origem <> 'manual'
                AND (public.fn_prioridade_nome(p_origem) < public.fn_prioridade_nome(CASE WHEN c.nome_cliente_origem = 'ia' THEN 'cliente_disse' ELSE c.nome_cliente_origem END)
                     OR (p_origem = 'cliente_disse' AND c.nome_cliente_origem IN ('cliente_disse', 'ia')))));
    IF v_leads = 0 AND FOUND THEN
        INSERT INTO public.lead_nome_historico (telefone_key, lead_uid, nome_antigo, nome_novo, origem, aplicado, motivo, trecho, por)
        VALUES (v_key, NULL, NULL, v_nome, p_origem, true, 'só a conversa (lead ainda não existe)', left(p_trecho, 300), p_por);
    END IF;

    PERFORM set_config('manos.escrita_crm', '', true);
    RETURN jsonb_build_object('ok', true, 'aplicados', v_aplic, 'leads', v_res);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. desfazer_nome_lead — botão "desfazer" (volta o nome de antes da troca)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desfazer_nome_lead(p_historico uuid, p_por text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    h      public.lead_nome_historico%ROWTYPE;
    v_tab  text;
    v_id   text;
    v_n    int := 0;
BEGIN
    SELECT * INTO h FROM public.lead_nome_historico WHERE id = p_historico;
    IF NOT FOUND OR NOT h.aplicado OR h.origem = 'desfeito' OR h.lead_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'nada para desfazer');
    END IF;
    v_tab := split_part(h.lead_uid, ':', 1);
    v_id  := substr(h.lead_uid, length(v_tab) + 2);
    PERFORM set_config('manos.escrita_crm', 'nome_interesse', true);
    IF v_tab = 'leads_distribuicao_crm_26' THEN
        UPDATE public.leads_distribuicao_crm_26 SET nome = h.nome_antigo
         WHERE id = v_id::integer AND public.fn_sem_acento(nome) = public.fn_sem_acento(h.nome_novo);
        GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSIF v_tab = 'leads_master' THEN
        UPDATE public.leads_master SET name = h.nome_antigo
         WHERE id = v_id::uuid AND public.fn_sem_acento(name) = public.fn_sem_acento(h.nome_novo);
        GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    PERFORM set_config('manos.escrita_crm', '', true);
    IF v_n = 0 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'o nome já mudou de novo');
    END IF;
    INSERT INTO public.lead_nome_historico (telefone_key, lead_uid, nome_antigo, nome_novo, origem, origem_anterior, aplicado, motivo, por)
    VALUES (h.telefone_key, h.lead_uid, h.nome_novo, coalesce(h.nome_antigo, ''), 'desfeito', h.origem, true, 'desfeito pelo consultor', p_por);
    UPDATE public.wa_conversas SET nome_cliente = NULL, nome_cliente_origem = NULL
     WHERE telefone_key = h.telefone_key AND public.fn_sem_acento(nome_cliente) = public.fn_sem_acento(h.nome_novo)
       AND coalesce(nome_cliente_origem, '') <> 'manual';
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. nome_lead_estado — nome atual, origem e última troca (selo da tela e Laura)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nome_lead_estado(p_lead_uid text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_tab text := split_part(p_lead_uid, ':', 1);
    v_id  text := substr(p_lead_uid, length(split_part(p_lead_uid, ':', 1)) + 2);
    v_nome text; v_tel text; v_fonte text; v_key text;
    h record;
BEGIN
    IF v_tab = 'leads_distribuicao_crm_26' AND v_id ~ '^\d+$' THEN
        SELECT nome, telefone, origem INTO v_nome, v_tel, v_fonte FROM public.leads_distribuicao_crm_26 WHERE id = v_id::integer;
    ELSIF v_tab = 'leads_master' AND v_id ~* '^[0-9a-f-]{36}$' THEN
        SELECT name, phone, source INTO v_nome, v_tel, v_fonte FROM public.leads_master WHERE id = v_id::uuid;
    ELSE
        RETURN NULL;
    END IF;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_key := public.wa_telefone_key(v_tel);
    SELECT id, nome_antigo, nome_novo, origem, por, criado_em INTO h
      FROM public.lead_nome_historico WHERE lead_uid = p_lead_uid AND aplicado ORDER BY criado_em DESC LIMIT 1;
    RETURN jsonb_build_object(
        'nome', v_nome,
        'origem', public.fn_lead_nome_origem_atual(v_nome, v_key, p_lead_uid, v_fonte),
        'ultima', CASE WHEN h.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', h.id, 'nome_antigo', h.nome_antigo, 'nome_novo', h.nome_novo, 'origem', h.origem,
            'por', h.por, 'criado_em', h.criado_em,
            'pode_desfazer', h.origem NOT IN ('desfeito', 'manual') AND public.fn_sem_acento(h.nome_novo) = public.fn_sem_acento(v_nome)) END
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Carro de interesse
-- ---------------------------------------------------------------------------
-- Até 3 carros, o mais recente primeiro; os "anteriores" (texto que já estava) nunca saem.
CREATE OR REPLACE FUNCTION public.fn_compor_interesse(p_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH v AS (
        SELECT descricao, origem, atualizado_em FROM public.lead_veiculos_interesse
         WHERE telefone_key = p_key AND NOT oculto
    ), ant AS (
        SELECT * FROM v WHERE origem = 'anterior'
    ), crm AS (
        SELECT * FROM v WHERE origem <> 'anterior'
         ORDER BY atualizado_em DESC
         LIMIT greatest(0, 3 - (SELECT count(*) FROM ant))
    )
    SELECT left(string_agg(descricao, ' · ' ORDER BY atualizado_em DESC), 250)
      FROM (SELECT * FROM ant UNION ALL SELECT * FROM crm) x
$$;

CREATE OR REPLACE FUNCTION public.registrar_interesse_lead(
    p_telefone text, p_descricao text, p_modelo_chave text, p_ano smallint, p_codigo_feed text,
    p_origem text, p_em_estoque boolean, p_por text, p_trecho text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_key    text := public.wa_telefone_key(p_telefone);
    v_desc   text := left(btrim(coalesce(p_descricao, '')), 120);
    v_antes  text;
    v_depois text;
    r        record;
    v_cur    text;
    v_igual  uuid;
    v_leads  jsonb := '[]'::jsonb;
BEGIN
    IF v_key IS NULL OR v_desc = '' OR coalesce(p_modelo_chave, '') = ''
       OR p_origem NOT IN ('link_site', 'anuncio', 'laura_estoque', 'cliente_citou') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'entrada inválida');
    END IF;
    PERFORM set_config('manos.escrita_crm', 'nome_interesse', true);
    v_antes := coalesce(public.fn_compor_interesse(v_key), '');

    -- A) o que está no lead e não foi o CRM que escreveu (consultor, n8n, formulário) vira "anterior"
    FOR r IN
        SELECT coalesce(nullif(btrim(d.vehicle_interest), ''), d.interesse) AS atual
          FROM public.leads_distribuicao_crm_26 d WHERE public.wa_telefone_key(d.telefone) = v_key
        UNION ALL
        SELECT m.vehicle_interest FROM public.leads_master m WHERE public.wa_telefone_key(m.phone) = v_key
    LOOP
        v_cur := btrim(coalesce(r.atual, ''));
        IF public.fn_interesse_vazio(v_cur) OR v_cur = v_antes THEN CONTINUE; END IF;
        IF v_antes <> '' THEN
            -- consultor editou o campo depois do CRM: o que o CRM tinha posto sai da tela
            UPDATE public.lead_veiculos_interesse SET oculto = true
             WHERE telefone_key = v_key AND origem <> 'anterior' AND NOT oculto
               AND position(public.fn_sem_acento(descricao) IN public.fn_sem_acento(v_cur)) = 0;
        END IF;
        INSERT INTO public.lead_veiculos_interesse (telefone_key, descricao, modelo_chave, origem, por, atualizado_em)
        VALUES (v_key, left(v_cur, 120), 'anterior:' || md5(public.fn_sem_acento(v_cur)), 'anterior', 'crm', clock_timestamp() - interval '1 second')
        ON CONFLICT (telefone_key, modelo_chave, coalesce(ano, 0)) DO UPDATE SET oculto = false;
    END LOOP;

    -- B) o carro novo: se já existe (mesmo carro), só sobe para o topo
    SELECT id INTO v_igual FROM public.lead_veiculos_interesse
     WHERE telefone_key = v_key AND NOT oculto
       AND ((modelo_chave = p_modelo_chave AND coalesce(ano, 0) = coalesce(p_ano, 0)) OR public.fn_mesmo_carro(descricao, v_desc))
     ORDER BY (origem = 'anterior') DESC LIMIT 1;
    IF v_igual IS NOT NULL THEN
        UPDATE public.lead_veiculos_interesse
           SET atualizado_em = clock_timestamp(),
               descricao   = CASE WHEN origem <> 'anterior' AND p_codigo_feed IS NOT NULL THEN v_desc ELSE descricao END,
               codigo_feed = CASE WHEN origem <> 'anterior' THEN coalesce(p_codigo_feed, codigo_feed) ELSE codigo_feed END,
               em_estoque  = CASE WHEN origem <> 'anterior' THEN p_em_estoque ELSE em_estoque END
         WHERE id = v_igual;
    ELSE
        INSERT INTO public.lead_veiculos_interesse
            (telefone_key, descricao, modelo_chave, ano, codigo_feed, origem, em_estoque, trecho, por)
        VALUES (v_key, v_desc, p_modelo_chave, p_ano, p_codigo_feed, p_origem, p_em_estoque, left(p_trecho, 300), p_por)
        ON CONFLICT (telefone_key, modelo_chave, coalesce(ano, 0)) DO UPDATE
           SET atualizado_em = clock_timestamp(), oculto = false, descricao = EXCLUDED.descricao,
               codigo_feed = coalesce(EXCLUDED.codigo_feed, lead_veiculos_interesse.codigo_feed),
               em_estoque = EXCLUDED.em_estoque;
    END IF;
    -- o modelo sem ano some quando chega o mesmo modelo com ano
    IF p_ano IS NOT NULL THEN
        DELETE FROM public.lead_veiculos_interesse
         WHERE telefone_key = v_key AND modelo_chave = p_modelo_chave AND ano IS NULL AND origem <> 'anterior';
    END IF;

    -- C) recompõe o campo que a tela lê
    v_depois := public.fn_compor_interesse(v_key);
    FOR r IN
        SELECT 'leads_distribuicao_crm_26' AS tabela, d.id::text AS id,
               coalesce(nullif(btrim(d.vehicle_interest), ''), d.interesse) AS atual
          FROM public.leads_distribuicao_crm_26 d WHERE public.wa_telefone_key(d.telefone) = v_key
        UNION ALL
        SELECT 'leads_master', m.id::text, m.vehicle_interest
          FROM public.leads_master m WHERE public.wa_telefone_key(m.phone) = v_key
    LOOP
        IF v_depois IS NULL OR r.atual IS NOT DISTINCT FROM v_depois THEN CONTINUE; END IF;
        IF r.tabela = 'leads_distribuicao_crm_26' THEN
            UPDATE public.leads_distribuicao_crm_26 SET interesse = v_depois, vehicle_interest = v_depois WHERE id = r.id::integer;
        ELSE
            UPDATE public.leads_master SET vehicle_interest = v_depois WHERE id = r.id::uuid;
        END IF;
        v_leads := v_leads || to_jsonb(r.tabela || ':' || r.id);
    END LOOP;
    PERFORM set_config('manos.escrita_crm', '', true);
    RETURN jsonb_build_object('ok', true, 'interesse', v_depois, 'leads_atualizados', v_leads, 'em_estoque', p_em_estoque);
END;
$$;

-- Cidade que o cliente disse: só preenche quando está vazia (crm26.cidade, master.city).
CREATE OR REPLACE FUNCTION public.atualizar_cidade_lead(p_telefone text, p_cidade text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_key text := public.wa_telefone_key(p_telefone);
    v_cid text := left(btrim(coalesce(p_cidade, '')), 60);
    a int; b int;
BEGIN
    IF v_key IS NULL OR v_cid = '' THEN RETURN 0; END IF;
    PERFORM set_config('manos.escrita_crm', 'nome_interesse', true);
    UPDATE public.leads_distribuicao_crm_26 SET cidade = v_cid
     WHERE public.wa_telefone_key(telefone) = v_key AND nullif(btrim(cidade), '') IS NULL;
    GET DIAGNOSTICS a = ROW_COUNT;
    UPDATE public.leads_master SET city = v_cid
     WHERE public.wa_telefone_key(phone) = v_key AND nullif(btrim(city), '') IS NULL;
    GET DIAGNOSTICS b = ROW_COUNT;
    UPDATE public.wa_conversas SET cidade = v_cid WHERE telefone_key = v_key AND nullif(btrim(cidade), '') IS NULL;
    PERFORM set_config('manos.escrita_crm', '', true);
    RETURN a + b;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Acesso
-- ---------------------------------------------------------------------------
-- O lead daquele telefone é do vendedor logado?
CREATE OR REPLACE FUNCTION public.fn_lead_telefone_e_meu(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.leads_distribuicao_crm_26 d
                    WHERE public.wa_telefone_key(d.telefone) = p_key AND d.assigned_consultant_id = public.wa_meu_consultant_id())
        OR EXISTS (SELECT 1 FROM public.leads_master m
                    WHERE public.wa_telefone_key(m.phone) = p_key AND m.assigned_consultant_id = public.wa_meu_consultant_id())
$$;

ALTER TABLE public.lead_nome_historico     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_veiculos_interesse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_nome_historico_select ON public.lead_nome_historico;
CREATE POLICY lead_nome_historico_select ON public.lead_nome_historico
    FOR SELECT TO authenticated
    USING ((SELECT public.wa_ve_todas()) OR public.fn_lead_telefone_e_meu(telefone_key));

DROP POLICY IF EXISTS lead_veiculos_interesse_select ON public.lead_veiculos_interesse;
CREATE POLICY lead_veiculos_interesse_select ON public.lead_veiculos_interesse
    FOR SELECT TO authenticated
    USING ((SELECT public.wa_ve_todas()) OR public.fn_lead_telefone_e_meu(telefone_key));

REVOKE ALL ON public.lead_nome_historico, public.lead_veiculos_interesse FROM anon, public;
REVOKE ALL ON public.lead_nome_historico, public.lead_veiculos_interesse FROM authenticated;
GRANT SELECT ON public.lead_nome_historico, public.lead_veiculos_interesse TO authenticated;
GRANT ALL ON public.lead_nome_historico, public.lead_veiculos_interesse TO service_role;

-- Funções que escrevem: só o servidor (service_role). As puras ficam abertas.
REVOKE ALL ON FUNCTION public.atualizar_nome_lead(text, text, text, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.desfazer_nome_lead(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_interesse_lead(text, text, text, smallint, text, text, boolean, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.nome_lead_estado(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.atualizar_cidade_lead(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_cidade_lead(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_lead_nome_origem_atual(text, text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.fn_compor_interesse(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.fn_lead_telefone_e_meu(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_nome_lead(text, text, text, text, text),
                          public.desfazer_nome_lead(uuid, text),
                          public.registrar_interesse_lead(text, text, text, smallint, text, text, boolean, text, text),
                          public.nome_lead_estado(text) TO service_role;
