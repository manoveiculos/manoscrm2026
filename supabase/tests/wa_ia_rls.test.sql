-- ===========================================================================
-- TESTE — Laura dentro do CRM (migration 20261106_wa_ia_ensaio.sql)
--
-- Confere: estrutura, botão nascendo DESLIGADO, trava de 1 rodada por conversa,
-- acesso (vendedor não vê o ensaio; gestor vê; anônimo nada; ninguém escreve
-- pelo navegador) e as colunas novas de wa_conversas legíveis pelo vendedor dono.
--
-- UM bloco DO que SEMPRE termina em erro de propósito: o erro desfaz tudo.
--     "WA_IA PASSOU — n verificações ok"  → tudo certo
--     "WA_IA FALHOU — x falha(s)"         → a lista diz qual
--
-- Como rodar:
--   já com a migration aplicada:  psql -f supabase/tests/wa_ia_rls.test.sql
--   ensaio antes de aplicar:      BEGIN; <migration 20261106_wa_ia_ensaio.sql>; <este arquivo>; ROLLBACK;
-- ===========================================================================

DO $teste$
DECLARE
    a_auth uuid := gen_random_uuid();
    g_auth uuid := gen_random_uuid();
    a_id uuid; g_id uuid;
    c_a uuid; m_a uuid; e1 uuid;
    j_a jsonb; j_g jsonb; j_anon jsonb;
    n bigint;
    r text[] := '{}';
    falhas int;
BEGIN
    EXECUTE $f$
        CREATE FUNCTION pg_temp.ia_contar(p_sql text, p_role text, p_claims jsonb)
        RETURNS bigint LANGUAGE plpgsql AS $b$
        DECLARE n bigint;
        BEGIN
            PERFORM set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
            PERFORM set_config('request.jwt.claim.sub', coalesce(p_claims ->> 'sub', ''), true);
            PERFORM set_config('request.jwt.claim.role', coalesce(p_claims ->> 'role', ''), true);
            EXECUTE 'SET LOCAL ROLE ' || quote_ident(p_role);
            BEGIN
                EXECUTE p_sql INTO n;
            EXCEPTION WHEN insufficient_privilege THEN
                n := -1;
            END;
            RESET ROLE;
            PERFORM set_config('request.jwt.claims', '', true);
            PERFORM set_config('request.jwt.claim.sub', '', true);
            PERFORM set_config('request.jwt.claim.role', '', true);
            RETURN n;
        END $b$
    $f$;
    EXECUTE $f$
        CREATE FUNCTION pg_temp.ia_chk(p_nome text, p_obtido bigint, p_esperado bigint)
        RETURNS text LANGUAGE sql AS $b$
            SELECT CASE WHEN p_obtido = p_esperado THEN 'ok    ' ELSE 'FALHA ' END
                   || p_nome || ' = ' || coalesce(p_obtido::text, 'null') || ' (esperado ' || p_esperado || ')'
        $b$
    $f$;
    EXECUTE $f$
        CREATE FUNCTION pg_temp.ia_chk_zero(p_nome text, p_obtido bigint)
        RETURNS text LANGUAGE sql AS $b$
            SELECT CASE WHEN p_obtido <= 0 THEN 'ok    ' ELSE 'FALHA ' END
                   || p_nome || ' = ' || CASE WHEN p_obtido = -1 THEN 'sem privilégio' ELSE p_obtido::text END
                   || ' (esperado 0)'
        $b$
    $f$;

    -- 0. Estrutura ------------------------------------------------------------
    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
     WHERE s.nspname = 'public' AND c.relname IN ('wa_ia_config', 'wa_ia_execucoes') AND c.relrowsecurity;
    r := r || pg_temp.ia_chk('tabelas wa_ia_* com RLS ligado', n, 2);

    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('wa_ia_config', 'wa_ia_execucoes')
       AND (cmd <> 'SELECT' OR NOT ('authenticated' = ANY (roles)) OR 'anon' = ANY (roles) OR 'public' = ANY (roles));
    r := r || pg_temp.ia_chk('políticas fora de SELECT/authenticated', n, 0);

    SELECT count(*) INTO n FROM public.wa_ia_config WHERE id = 1 AND modo = 'desligada';
    r := r || pg_temp.ia_chk('botão da IA nasce desligado', n, 1);

    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'wa_conversas'
       AND column_name IN ('nome_cliente', 'nome_cliente_origem', 'nome_ia_no_lead', 'cidade', 'ficha');
    r := r || pg_temp.ia_chk('colunas novas em wa_conversas', n, 5);

    SELECT (has_table_privilege('anon', 'public.wa_ia_config', 'SELECT')
         OR has_table_privilege('anon', 'public.wa_ia_execucoes', 'SELECT'))::int INTO n;
    r := r || pg_temp.ia_chk('anon com SELECT em wa_ia_*', n, 0);

    SELECT (has_table_privilege('authenticated', 'public.wa_ia_config', 'INSERT')
         OR has_table_privilege('authenticated', 'public.wa_ia_config', 'UPDATE')
         OR has_table_privilege('authenticated', 'public.wa_ia_execucoes', 'INSERT')
         OR has_table_privilege('authenticated', 'public.wa_ia_execucoes', 'UPDATE')
         OR has_table_privilege('authenticated', 'public.wa_ia_execucoes', 'DELETE'))::int INTO n;
    r := r || pg_temp.ia_chk('authenticated pode escrever em wa_ia_*', n, 0);

    SELECT (has_column_privilege('authenticated', 'public.wa_conversas', 'nome_cliente', 'SELECT')
        AND has_column_privilege('authenticated', 'public.wa_conversas', 'ficha', 'SELECT'))::int INTO n;
    r := r || pg_temp.ia_chk('authenticated lê as colunas novas (RLS decide as linhas)', n, 1);

    -- 1. Restrições -------------------------------------------------------------
    BEGIN
        UPDATE public.wa_ia_config SET modo = 'liga_tudo' WHERE id = 1;
        r := r || 'FALHA modo inválido aceito em wa_ia_config'::text;
    EXCEPTION WHEN check_violation THEN
        r := r || 'ok    modo inválido recusado em wa_ia_config'::text;
    END;
    BEGIN
        INSERT INTO public.wa_ia_config (id, modo) VALUES (2, 'ensaio');
        r := r || 'FALHA segunda linha aceita em wa_ia_config'::text;
    EXCEPTION WHEN check_violation THEN
        r := r || 'ok    wa_ia_config só tem 1 linha'::text;
    END;

    -- 2. Dados de teste -------------------------------------------------------
    INSERT INTO public.consultants_manos_crm (name, email, role, status, is_active, auth_id, user_id, recebe_leads)
    VALUES ('Teste IA A', 'wa-ia-a@teste.invalid', 'vendedor', 'active', true, a_auth, a_auth, false) RETURNING id INTO a_id;
    INSERT INTO public.consultants_manos_crm (name, email, role, status, is_active, auth_id, user_id, recebe_leads)
    VALUES ('Teste IA Gestor', 'wa-ia-g@teste.invalid', 'gestor', 'active', true, g_auth, g_auth, false) RETURNING id INTO g_id;

    INSERT INTO public.wa_conversas (telefone_key, nome_contato, assigned_consultant_id, ultima_mensagem_em, nome_cliente, nome_cliente_origem, ficha)
    VALUES ('99900000091', 'Perfil Zap', a_id, now(), 'Carlos', 'ia', '{"carro_interesse":"Onix"}') RETURNING id INTO c_a;
    INSERT INTO public.wa_mensagens (conversa_id, provider_message_id, direcao, autor, tipo, texto)
    VALUES (c_a, 'teste-ia-a1', 'in', 'cliente', 'texto', 'sou o carlos') RETURNING id INTO m_a;

    BEGIN
        UPDATE public.wa_conversas SET nome_cliente_origem = 'robo' WHERE id = c_a;
        r := r || 'FALHA nome_cliente_origem inválido aceito'::text;
    EXCEPTION WHEN check_violation THEN
        r := r || 'ok    nome_cliente_origem só ia/manual'::text;
    END;

    -- 3. Trava: 1 rodada "rodando" por conversa ---------------------------------
    INSERT INTO public.wa_ia_execucoes (conversa_id, gatilho_mensagem_id, modo, status)
    VALUES (c_a, m_a, 'ensaio', 'rodando') RETURNING id INTO e1;
    BEGIN
        INSERT INTO public.wa_ia_execucoes (conversa_id, gatilho_mensagem_id, modo, status) VALUES (c_a, m_a, 'ensaio', 'rodando');
        r := r || 'FALHA duas rodadas ao mesmo tempo na mesma conversa'::text;
    EXCEPTION WHEN unique_violation THEN
        r := r || 'ok    trava: segunda rodada simultânea recusada'::text;
    END;
    UPDATE public.wa_ia_execucoes SET status = 'ok', texto_final = 'Prazer, Carlos!', custo_usd = 0.0031, tempo_ms = 6100,
           terminada_em = now() WHERE id = e1;
    INSERT INTO public.wa_ia_execucoes (conversa_id, gatilho_mensagem_id, modo, status) VALUES (c_a, m_a, 'ensaio', 'rodando');
    r := r || 'ok    trava liberada depois que a rodada termina'::text;
    BEGIN
        INSERT INTO public.wa_ia_execucoes (conversa_id, modo, status) VALUES (c_a, 'desligada', 'ok');
        r := r || 'FALHA rodada com modo inválido aceita'::text;
    EXCEPTION WHEN check_violation THEN
        r := r || 'ok    rodada só em ensaio/envia'::text;
    END;

    j_a    := jsonb_build_object('sub', a_auth, 'role', 'authenticated', 'email', 'wa-ia-a@teste.invalid');
    j_g    := jsonb_build_object('sub', g_auth, 'role', 'authenticated', 'email', 'wa-ia-g@teste.invalid');
    j_anon := jsonb_build_object('role', 'anon');

    -- 4. Acesso ---------------------------------------------------------------
    r := r || pg_temp.ia_chk_zero('vendedor: rodadas do ensaio',
        pg_temp.ia_contar('SELECT count(*) FROM public.wa_ia_execucoes', 'authenticated', j_a));
    r := r || pg_temp.ia_chk_zero('vendedor: botão da IA',
        pg_temp.ia_contar('SELECT count(*) FROM public.wa_ia_config', 'authenticated', j_a));
    r := r || pg_temp.ia_chk('vendedor: lê nome e ficha da própria conversa',
        pg_temp.ia_contar(format('SELECT count(*) FROM public.wa_conversas WHERE id = %L AND nome_cliente = %L AND ficha ? %L', c_a, 'Carlos', 'carro_interesse'), 'authenticated', j_a), 1);
    r := r || pg_temp.ia_chk('gestor: rodadas da conversa de teste',
        pg_temp.ia_contar(format('SELECT count(*) FROM public.wa_ia_execucoes WHERE conversa_id = %L', c_a), 'authenticated', j_g), 2);
    r := r || pg_temp.ia_chk('gestor: botão da IA',
        pg_temp.ia_contar('SELECT count(*) FROM public.wa_ia_config', 'authenticated', j_g), 1);
    r := r || pg_temp.ia_chk_zero('anônimo: rodadas',
        pg_temp.ia_contar('SELECT count(*) FROM public.wa_ia_execucoes', 'anon', j_anon));
    r := r || pg_temp.ia_chk_zero('anônimo: botão',
        pg_temp.ia_contar('SELECT count(*) FROM public.wa_ia_config', 'anon', j_anon));
    r := r || pg_temp.ia_chk('gestor tentando ligar a IA pelo navegador (-1 = sem privilégio)',
        pg_temp.ia_contar('WITH u AS (UPDATE public.wa_ia_config SET modo = ''ensaio'' RETURNING 1) SELECT count(*) FROM u', 'authenticated', j_g), -1);

    -- 5. Apagar a conversa leva as rodadas junto (retenção/LGPD) -----------------
    DELETE FROM public.wa_conversas WHERE id = c_a;
    SELECT count(*) INTO n FROM public.wa_ia_execucoes WHERE conversa_id = c_a;
    r := r || pg_temp.ia_chk('rodadas somem com a conversa', n, 0);

    -- Resultado (o erro é de propósito: desfaz tudo) ----------------------------
    SELECT count(*) INTO falhas FROM unnest(r) x WHERE x LIKE 'FALHA%';
    IF falhas = 0 THEN
        RAISE EXCEPTION 'WA_IA PASSOU — % verificações ok (tudo desfeito)%', (SELECT count(*) FROM unnest(r) x WHERE x LIKE 'ok%'),
            E'\n' || array_to_string(r, E'\n');
    ELSE
        RAISE EXCEPTION 'WA_IA FALHOU — % falha(s) (tudo desfeito)%', falhas, E'\n' || array_to_string(r, E'\n');
    END IF;
END
$teste$;
