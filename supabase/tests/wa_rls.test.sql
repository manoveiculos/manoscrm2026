-- ===========================================================================
-- TESTE DE ACESSO (RLS) — WhatsApp da loja (wa_conversas, wa_mensagens,
-- wa_acessos_log e bucket whatsapp-midia)
--
-- Roda como: vendedor A, vendedor B, gestor, admin, login do Alexandre,
-- conta logada de outro app (ex.: Beach Tennis) e anônimo.
--
-- O teste inteiro é UM bloco DO e SEMPRE termina em erro de propósito:
-- o erro desfaz tudo (consultores, conversas e mensagens de teste), mesmo que
-- alguém rode sem BEGIN/ROLLBACK. Leia a mensagem do erro:
--     "WA_RLS PASSOU — n/n verificações ok"    → tudo certo
--     "WA_RLS FALHOU — x falha(s)"             → a lista diz qual
--
-- Como rodar:
--   já com a migration aplicada:   psql -f supabase/tests/wa_rls.test.sql
--   ensaio antes de aplicar:       BEGIN; <migration 20261104_wa_whatsapp_loja.sql>; <este arquivo>; ROLLBACK;
-- ===========================================================================

DO $teste$
DECLARE
    a_auth   uuid := gen_random_uuid();
    b_auth   uuid := gen_random_uuid();
    g_auth   uuid := gen_random_uuid();
    adm_auth uuid := gen_random_uuid();
    alex_sub uuid := gen_random_uuid();
    outro    uuid := gen_random_uuid();
    a_id uuid; b_id uuid; g_id uuid; adm_id uuid;
    c_a uuid; c_b uuid; c_n uuid;
    j_a jsonb; j_b jsonb; j_g jsonb; j_adm jsonb; j_alex jsonb; j_outro jsonb; j_anon jsonb;
    n bigint;
    v_json jsonb;
    v_txt text;
    r text[] := '{}';
    falhas int;
    tem_objeto boolean := false;
BEGIN
    -- -----------------------------------------------------------------------
    -- Helpers temporários (somem com o erro final)
    -- -----------------------------------------------------------------------
    EXECUTE $f$
        CREATE FUNCTION pg_temp.wa_contar(p_sql text, p_role text, p_claims jsonb)
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
                n := -1;  -- sem privilégio nenhum = não lê nada
            END;
            RESET ROLE;
            PERFORM set_config('request.jwt.claims', '', true);
            PERFORM set_config('request.jwt.claim.sub', '', true);
            PERFORM set_config('request.jwt.claim.role', '', true);
            RETURN n;
        END $b$
    $f$;
    EXECUTE $f$
        CREATE FUNCTION pg_temp.wa_chk(p_nome text, p_obtido bigint, p_esperado bigint)
        RETURNS text LANGUAGE sql AS $b$
            SELECT CASE WHEN p_obtido = p_esperado THEN 'ok    ' ELSE 'FALHA ' END
                   || p_nome || ' = ' || coalesce(p_obtido::text, 'null') || ' (esperado ' || p_esperado || ')'
        $b$
    $f$;
    -- leitura "zero": 0 linhas ou sem privilégio (-1)
    EXECUTE $f$
        CREATE FUNCTION pg_temp.wa_chk_zero(p_nome text, p_obtido bigint)
        RETURNS text LANGUAGE sql AS $b$
            SELECT CASE WHEN p_obtido <= 0 THEN 'ok    ' ELSE 'FALHA ' END
                   || p_nome || ' = ' || CASE WHEN p_obtido = -1 THEN 'sem privilégio' ELSE p_obtido::text END
                   || ' (esperado 0)'
        $b$
    $f$;

    -- -----------------------------------------------------------------------
    -- 0. Estrutura (ensaio da migration)
    -- -----------------------------------------------------------------------
    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
     WHERE s.nspname = 'public' AND c.relname IN ('wa_conversas', 'wa_mensagens', 'wa_acessos_log')
       AND c.relrowsecurity;
    r := r || pg_temp.wa_chk('tabelas wa_* com RLS ligado', n, 3);

    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('wa_conversas', 'wa_mensagens', 'wa_acessos_log');
    r := r || pg_temp.wa_chk('políticas nas tabelas wa_* (só SELECT)', n, 3);

    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('wa_conversas', 'wa_mensagens', 'wa_acessos_log')
       AND (cmd <> 'SELECT' OR NOT ('authenticated' = ANY (roles)) OR 'anon' = ANY (roles) OR 'public' = ANY (roles));
    r := r || pg_temp.wa_chk('políticas fora de SELECT/authenticated', n, 0);

    SELECT count(*) INTO n FROM storage.buckets WHERE id = 'whatsapp-midia' AND public = false;
    r := r || pg_temp.wa_chk('bucket whatsapp-midia existe e é privado', n, 1);

    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%whatsapp-midia%';
    r := r || pg_temp.wa_chk('políticas de storage citando whatsapp-midia', n, 0);

    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (coalesce(qual, '') || coalesce(with_check, '')) NOT ILIKE '%bucket_id%';
    r := r || pg_temp.wa_chk('políticas de storage que valem para qualquer bucket', n, 0);

    SELECT count(*) INTO n FROM pg_trigger
     WHERE tgname = 'trg_wa_sync_vendedor' AND NOT tgisinternal;
    r := r || pg_temp.wa_chk('gatilhos de sync do vendedor (crm26 + master)', n, 2);

    SELECT count(*) INTO n FROM cron.job WHERE jobname = 'wa-retencao-midia';
    r := r || pg_temp.wa_chk('cron wa-retencao-midia agendado', n, 1);

    SELECT (has_table_privilege('anon', 'public.wa_conversas', 'SELECT')
         OR has_table_privilege('anon', 'public.wa_mensagens', 'SELECT')
         OR has_table_privilege('anon', 'public.wa_acessos_log', 'SELECT'))::int INTO n;
    r := r || pg_temp.wa_chk('anon com SELECT em alguma tabela wa_*', n, 0);

    SELECT (has_table_privilege('authenticated', 'public.wa_conversas', 'INSERT')
         OR has_table_privilege('authenticated', 'public.wa_conversas', 'UPDATE')
         OR has_table_privilege('authenticated', 'public.wa_mensagens', 'INSERT')
         OR has_table_privilege('authenticated', 'public.wa_mensagens', 'DELETE')
         OR has_table_privilege('authenticated', 'public.wa_acessos_log', 'INSERT'))::int INTO n;
    r := r || pg_temp.wa_chk('authenticated pode escrever em wa_*', n, 0);

    SELECT (has_function_privilege('anon', 'public.wa_registrar_mensagem(jsonb)', 'EXECUTE')
         OR has_function_privilege('authenticated', 'public.wa_registrar_mensagem(jsonb)', 'EXECUTE')
         OR has_function_privilege('anon', 'public.wa_ia_pode_responder(text)', 'EXECUTE')
         OR has_function_privilege('authenticated', 'public.wa_ia_pode_responder(text)', 'EXECUTE'))::int INTO n;
    r := r || pg_temp.wa_chk('anon/authenticated executam funções de escrita', n, 0);

    -- telefone_key igual ao TypeScript
    SELECT (public.wa_telefone_key('5547988880001') = '47988880001'
        AND public.wa_telefone_key('554788880002') = '47988880002'
        AND public.wa_telefone_key('(47) 98888-0001') = '47988880001'
        AND public.wa_telefone_key('554733001352') = '4733001352'
        AND public.wa_telefone_key('14155550100123') = '14155550100123'
        AND public.wa_telefone_key('123') IS NULL)::int INTO n;
    r := r || pg_temp.wa_chk('wa_telefone_key = telefoneKey() do TS', n, 1);

    -- -----------------------------------------------------------------------
    -- 1. Dados de teste (todos desfeitos no fim)
    -- -----------------------------------------------------------------------
    INSERT INTO public.consultants_manos_crm (name, email, role, status, is_active, auth_id, user_id, recebe_leads)
    VALUES ('Teste RLS A', 'wa-rls-a@teste.invalid', 'vendedor', 'active', true, a_auth, a_auth, false) RETURNING id INTO a_id;
    INSERT INTO public.consultants_manos_crm (name, email, role, status, is_active, auth_id, user_id, recebe_leads)
    VALUES ('Teste RLS B', 'wa-rls-b@teste.invalid', 'vendedor', 'active', true, b_auth, b_auth, false) RETURNING id INTO b_id;
    INSERT INTO public.consultants_manos_crm (name, email, role, status, is_active, auth_id, user_id, recebe_leads)
    VALUES ('Teste RLS Gestor', 'wa-rls-g@teste.invalid', 'gestor', 'active', true, g_auth, g_auth, false) RETURNING id INTO g_id;
    INSERT INTO public.consultants_manos_crm (name, email, role, status, is_active, auth_id, user_id, recebe_leads)
    VALUES ('Teste RLS Admin', 'wa-rls-adm@teste.invalid', 'admin', 'active', true, adm_auth, adm_auth, false) RETURNING id INTO adm_id;

    INSERT INTO public.wa_conversas (telefone_key, nome_contato, assigned_consultant_id, ultima_mensagem_em)
    VALUES ('99900000001', 'Cliente do A', a_id, now()) RETURNING id INTO c_a;
    INSERT INTO public.wa_conversas (telefone_key, nome_contato, assigned_consultant_id, ultima_mensagem_em)
    VALUES ('99900000002', 'Cliente do B', b_id, now()) RETURNING id INTO c_b;
    INSERT INTO public.wa_conversas (telefone_key, nome_contato, assigned_consultant_id, ultima_mensagem_em)
    VALUES ('99900000003', 'Sem vendedor', NULL, now()) RETURNING id INTO c_n;

    INSERT INTO public.wa_mensagens (conversa_id, provider_message_id, direcao, autor, tipo, texto) VALUES
        (c_a, 'teste-rls-a1', 'in', 'cliente', 'texto', 'oi A'),
        (c_a, 'teste-rls-a2', 'out', 'laura', 'texto', 'resposta A'),
        (c_b, 'teste-rls-b1', 'in', 'cliente', 'texto', 'oi B'),
        (c_b, 'teste-rls-b2', 'in', 'cliente', 'audio', NULL),
        (c_n, 'teste-rls-n1', 'in', 'cliente', 'texto', 'oi sem dono'),
        (c_n, 'teste-rls-n2', 'out', 'laura', 'texto', 'resposta sem dono');
    INSERT INTO public.wa_acessos_log (consultant_id, conversa_id, acao) VALUES (a_id, c_a, 'abriu');

    BEGIN
        INSERT INTO storage.objects (bucket_id, name) VALUES ('whatsapp-midia', '2026/11/teste-rls/objeto.ogg');
        tem_objeto := true;
    EXCEPTION WHEN OTHERS THEN
        r := r || ('aviso  objeto de teste no bucket não inserido (' || SQLERRM || '): bucket conferido só pelas políticas');
    END;

    j_a     := jsonb_build_object('sub', a_auth,   'role', 'authenticated', 'email', 'wa-rls-a@teste.invalid');
    j_b     := jsonb_build_object('sub', b_auth,   'role', 'authenticated', 'email', 'wa-rls-b@teste.invalid');
    j_g     := jsonb_build_object('sub', g_auth,   'role', 'authenticated', 'email', 'wa-rls-g@teste.invalid');
    j_adm   := jsonb_build_object('sub', adm_auth, 'role', 'authenticated', 'email', 'wa-rls-adm@teste.invalid');
    j_alex  := jsonb_build_object('sub', alex_sub, 'role', 'authenticated', 'email', 'alexandre_gorges@hotmail.com');
    j_outro := jsonb_build_object('sub', outro,    'role', 'authenticated', 'email', 'jogador@beachtennis.invalid');
    j_anon  := jsonb_build_object('role', 'anon');

    -- -----------------------------------------------------------------------
    -- 2. Vendedor A
    -- -----------------------------------------------------------------------
    r := r || pg_temp.wa_chk('A: conversas visíveis',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_conversas', 'authenticated', j_a), 1);
    r := r || pg_temp.wa_chk('A: vê a própria conversa',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_conversas WHERE id = %L', c_a), 'authenticated', j_a), 1);
    r := r || pg_temp.wa_chk('A: linhas da conversa do B',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_conversas WHERE id = %L', c_b), 'authenticated', j_a), 0);
    r := r || pg_temp.wa_chk('A: mensagens visíveis (só as 2 dele)',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_mensagens', 'authenticated', j_a), 2);
    r := r || pg_temp.wa_chk('A: mensagens do B',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_mensagens WHERE conversa_id = %L', c_b), 'authenticated', j_a), 0);
    r := r || pg_temp.wa_chk('A: conversa sem vendedor',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_conversas WHERE id = %L', c_n), 'authenticated', j_a), 0);
    r := r || pg_temp.wa_chk('A: log de acessos',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_acessos_log', 'authenticated', j_a), 0);
    r := r || pg_temp.wa_chk('A: tentar UPDATE em wa_conversas (−1 = negado)',
        pg_temp.wa_contar(format('WITH u AS (UPDATE public.wa_conversas SET status = %L WHERE id = %L RETURNING 1) SELECT count(*) FROM u', 'humano', c_a), 'authenticated', j_a), -1);
    r := r || pg_temp.wa_chk('A: tentar INSERT em wa_mensagens (−1 = negado)',
        pg_temp.wa_contar(format('WITH i AS (INSERT INTO public.wa_mensagens (conversa_id, provider_message_id, direcao, autor) VALUES (%L, %L, %L, %L) RETURNING 1) SELECT count(*) FROM i', c_a, 'teste-rls-intruso', 'out', 'vendedor'), 'authenticated', j_a), -1);
    r := r || pg_temp.wa_chk('A: executar wa_registrar_mensagem (−1 = negado)',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_registrar_mensagem(''{"telefone":"5547900000098","provider_message_id":"teste-rls-rpc"}''::jsonb)', 'authenticated', j_a), -1);
    r := r || pg_temp.wa_chk('A: objetos do bucket whatsapp-midia',
        pg_temp.wa_contar('SELECT count(*) FROM storage.objects WHERE bucket_id = ''whatsapp-midia''', 'authenticated', j_a), 0);

    -- -----------------------------------------------------------------------
    -- 3. Vendedor B
    -- -----------------------------------------------------------------------
    r := r || pg_temp.wa_chk('B: conversas visíveis',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_conversas', 'authenticated', j_b), 1);
    r := r || pg_temp.wa_chk('B: linhas da conversa do A',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_conversas WHERE id = %L', c_a), 'authenticated', j_b), 0);
    r := r || pg_temp.wa_chk('B: mensagens do A',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_mensagens WHERE conversa_id = %L', c_a), 'authenticated', j_b), 0);
    r := r || pg_temp.wa_chk('B: mensagens visíveis (só as 2 dele)',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_mensagens', 'authenticated', j_b), 2);

    -- -----------------------------------------------------------------------
    -- 4. Gestor, admin e login do Alexandre: tudo (filtrado aos dados de teste)
    -- -----------------------------------------------------------------------
    r := r || pg_temp.wa_chk('gestor: conversas de teste',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_conversas WHERE id IN (%L, %L, %L)', c_a, c_b, c_n), 'authenticated', j_g), 3);
    r := r || pg_temp.wa_chk('admin: conversas de teste',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_conversas WHERE id IN (%L, %L, %L)', c_a, c_b, c_n), 'authenticated', j_adm), 3);
    r := r || pg_temp.wa_chk('admin: mensagens de teste',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_mensagens WHERE provider_message_id LIKE ''teste-rls-%''', 'authenticated', j_adm), 6);
    r := r || pg_temp.wa_chk('admin: log de acessos de teste',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_acessos_log WHERE conversa_id = %L', c_a), 'authenticated', j_adm), 1);
    r := r || pg_temp.wa_chk('login do Alexandre: conversas de teste',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_conversas WHERE id IN (%L, %L, %L)', c_a, c_b, c_n), 'authenticated', j_alex), 3);
    r := r || pg_temp.wa_chk('admin: objetos do bucket (navegador nunca lê)',
        pg_temp.wa_contar('SELECT count(*) FROM storage.objects WHERE bucket_id = ''whatsapp-midia''', 'authenticated', j_adm), 0);

    -- -----------------------------------------------------------------------
    -- 5. Conta logada de outro app (Beach Tennis) e anônimo
    -- -----------------------------------------------------------------------
    r := r || pg_temp.wa_chk('outro app: conversas',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_conversas', 'authenticated', j_outro), 0);
    r := r || pg_temp.wa_chk('outro app: mensagens',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_mensagens', 'authenticated', j_outro), 0);
    r := r || pg_temp.wa_chk('outro app: log de acessos',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_acessos_log', 'authenticated', j_outro), 0);
    r := r || pg_temp.wa_chk('outro app: objetos do bucket',
        pg_temp.wa_contar('SELECT count(*) FROM storage.objects WHERE bucket_id = ''whatsapp-midia''', 'authenticated', j_outro), 0);
    r := r || pg_temp.wa_chk_zero('anônimo: conversas',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_conversas', 'anon', j_anon));
    r := r || pg_temp.wa_chk_zero('anônimo: mensagens',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_mensagens', 'anon', j_anon));
    r := r || pg_temp.wa_chk_zero('anônimo: log de acessos',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_acessos_log', 'anon', j_anon));
    r := r || pg_temp.wa_chk_zero('anônimo: objetos do bucket',
        pg_temp.wa_contar('SELECT count(*) FROM storage.objects WHERE bucket_id = ''whatsapp-midia''', 'anon', j_anon));
    r := r || pg_temp.wa_chk_zero('anônimo: wa_registrar_mensagem',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_registrar_mensagem(''{"telefone":"5547900000098","provider_message_id":"teste-rls-rpc"}''::jsonb)', 'anon', j_anon));

    -- -----------------------------------------------------------------------
    -- 6. Redistribuição: conversa do A passa para o B
    -- -----------------------------------------------------------------------
    UPDATE public.wa_conversas SET assigned_consultant_id = b_id WHERE id = c_a;
    r := r || pg_temp.wa_chk('redistribuição: A perde a conversa na hora',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_conversas', 'authenticated', j_a), 0);
    r := r || pg_temp.wa_chk('redistribuição: A perde as mensagens',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_mensagens', 'authenticated', j_a), 0);
    r := r || pg_temp.wa_chk('redistribuição: B passa a ver 2 conversas',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_conversas', 'authenticated', j_b), 2);
    SELECT (vendedor_anterior = a_id)::int INTO n FROM public.wa_conversas WHERE id = c_a;
    r := r || pg_temp.wa_chk('redistribuição: vendedor_anterior = A', n, 1);

    -- Gatilho de sync: lead muda de dono → conversa muda junto.
    -- Testado numa tabela temporária para não tocar nos leads reais.
    EXECUTE 'CREATE TEMP TABLE wa_teste_lead (id int PRIMARY KEY, assigned_consultant_id uuid)';
    EXECUTE 'INSERT INTO pg_temp.wa_teste_lead VALUES (1, NULL)';
    EXECUTE 'CREATE TRIGGER trg_wa_sync_vendedor AFTER UPDATE OF assigned_consultant_id ON pg_temp.wa_teste_lead
             FOR EACH ROW WHEN (OLD.assigned_consultant_id IS DISTINCT FROM NEW.assigned_consultant_id)
             EXECUTE FUNCTION public.wa_sync_vendedor_do_lead()';
    UPDATE public.wa_conversas SET lead_uid = 'wa_teste_lead:1' WHERE id = c_n;
    EXECUTE format('UPDATE pg_temp.wa_teste_lead SET assigned_consultant_id = %L WHERE id = 1', a_id);
    r := r || pg_temp.wa_chk('sync do lead: conversa sem dono vai para o A',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_conversas WHERE id = %L', c_n), 'authenticated', j_a), 1);

    -- -----------------------------------------------------------------------
    -- 7. Vendedor desativado perde o acesso na hora
    -- -----------------------------------------------------------------------
    UPDATE public.consultants_manos_crm SET is_active = false WHERE id = b_id;
    r := r || pg_temp.wa_chk('B desativado: conversas',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_conversas', 'authenticated', j_b), 0);
    r := r || pg_temp.wa_chk('B desativado: mensagens',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_mensagens', 'authenticated', j_b), 0);
    UPDATE public.consultants_manos_crm SET is_active = true, status = 'inactive' WHERE id = b_id;
    r := r || pg_temp.wa_chk('B com status inactive: conversas',
        pg_temp.wa_contar('SELECT count(*) FROM public.wa_conversas', 'authenticated', j_b), 0);
    UPDATE public.consultants_manos_crm SET is_active = false WHERE id = adm_id;
    r := r || pg_temp.wa_chk('admin desativado: conversas de teste',
        pg_temp.wa_contar(format('SELECT count(*) FROM public.wa_conversas WHERE id IN (%L, %L, %L)', c_a, c_b, c_n), 'authenticated', j_adm), 0);

    -- -----------------------------------------------------------------------
    -- 8. Ingestão: idempotência e contrato com a Laura
    -- -----------------------------------------------------------------------
    v_json := public.wa_registrar_mensagem(jsonb_build_object(
        'telefone', '5547988880099', 'provider_message_id', 'teste-rls-idem',
        'autor', 'cliente', 'tipo', 'texto', 'texto', 'primeira', 'nome_contato', 'Teste'));
    r := r || pg_temp.wa_chk('ingestão: 1ª chamada grava', (v_json ->> 'nova')::boolean::int, 1);
    v_txt := v_json ->> 'conversa_id';
    -- mesmo cliente, JID sem o 9º dígito, mesmo id de mensagem
    v_json := public.wa_registrar_mensagem(jsonb_build_object(
        'telefone', '554788880099', 'provider_message_id', 'teste-rls-idem',
        'autor', 'cliente', 'tipo', 'texto', 'texto', 'repetida'));
    r := r || pg_temp.wa_chk('ingestão: 2ª chamada com o mesmo id não grava', (v_json ->> 'nova')::boolean::int, 0);
    r := r || pg_temp.wa_chk('ingestão: 2ª chamada devolve a mesma conversa', (v_json ->> 'conversa_id' = v_txt)::int, 1);
    v_json := public.wa_registrar_mensagem(jsonb_build_object(
        'telefone', '5547999990098', 'provider_message_id', 'teste-rls-idem',
        'autor', 'cliente', 'tipo', 'texto', 'texto', 'id repetido com outro telefone'));
    SELECT count(*) INTO n FROM public.wa_conversas WHERE telefone_key = '47999990098';
    r := r || pg_temp.wa_chk('ingestão: id repetido não cria conversa vazia', n, 0);
    v_json := jsonb_build_object('conversa_id', v_txt);
    SELECT count(*) INTO n FROM public.wa_mensagens WHERE provider_message_id = 'teste-rls-idem';
    r := r || pg_temp.wa_chk('ingestão: mensagens com o id repetido', n, 1);
    SELECT nao_lidas_vendedor INTO n FROM public.wa_conversas WHERE id = (v_json ->> 'conversa_id')::uuid;
    r := r || pg_temp.wa_chk('ingestão: não lidas somou 1 vez só', n, 1);
    SELECT texto INTO v_txt FROM public.wa_mensagens WHERE provider_message_id = 'teste-rls-idem';
    r := r || pg_temp.wa_chk('ingestão: texto original preservado', (v_txt = 'primeira')::int, 1);

    UPDATE public.wa_conversas SET status = 'humano', ia_silenciada_ate = now() + interval '7 days'
     WHERE id = (v_json ->> 'conversa_id')::uuid;
    r := r || pg_temp.wa_chk('Laura: conversa assumida → não responde',
        public.wa_ia_pode_responder('5547988880099')::int, 0);
    r := r || pg_temp.wa_chk('Laura: idem com o número sem o 9º dígito',
        public.wa_ia_pode_responder('554788880099')::int, 0);
    UPDATE public.wa_conversas SET ia_silenciada_ate = now() - interval '1 minute'
     WHERE id = (v_json ->> 'conversa_id')::uuid;
    r := r || pg_temp.wa_chk('Laura: silêncio vencido → responde',
        public.wa_ia_pode_responder('5547988880099')::int, 1);
    r := r || pg_temp.wa_chk('Laura: telefone sem conversa → responde',
        public.wa_ia_pode_responder('5547911111111')::int, 1);

    -- -----------------------------------------------------------------------
    -- Resultado. O erro abaixo é de propósito: desfaz tudo o que o teste criou.
    -- -----------------------------------------------------------------------
    SELECT count(*) INTO falhas FROM unnest(r) x WHERE x LIKE 'FALHA%';
    IF falhas = 0 THEN
        RAISE EXCEPTION 'WA_RLS PASSOU — % verificações ok (tudo desfeito)%', (SELECT count(*) FROM unnest(r) x WHERE x LIKE 'ok%'),
            E'\n' || array_to_string(r, E'\n');
    ELSE
        RAISE EXCEPTION 'WA_RLS FALHOU — % falha(s) (tudo desfeito)%', falhas, E'\n' || array_to_string(r, E'\n');
    END IF;
END
$teste$;
