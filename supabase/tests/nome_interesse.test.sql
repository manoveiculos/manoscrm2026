-- ===========================================================================
-- TESTE — Nome e carro de interesse automáticos (migration 20261107_nome_interesse_auto.sql)
--
-- Confere: troca de nome com prioridade (manual nunca é sobrescrito), histórico e desfazer,
-- master sem sobrescrever status, carro (substitui genérico, acrescenta sem repetir, até 3,
-- mantém o que o consultor digitou, fora do estoque), RLS (vendedor só vê os próprios leads).
-- Telefones e nomes são INVENTADOS. UM bloco DO que SEMPRE termina em erro de propósito
-- (desfaz tudo):  "NOME_INTERESSE PASSOU — n verificações ok"  /  "… FALHOU — x falha(s)".
--
-- Ensaio antes de aplicar:  BEGIN; <migration>; <este arquivo>; ROLLBACK;
-- ===========================================================================

DO $teste$
DECLARE
    a_auth uuid := gen_random_uuid();
    b_auth uuid := gen_random_uuid();
    a_id uuid; b_id uuid;
    l1 int; l2 int; l3 int;
    h1 uuid;
    res jsonb;
    v text; n bigint;
    r text[] := '{}';
    falhas int;
    j_a jsonb; j_anon jsonb;
BEGIN
    EXECUTE $f$
        CREATE FUNCTION pg_temp.ni_contar(p_sql text, p_role text, p_claims jsonb)
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
        CREATE FUNCTION pg_temp.ni_chk(p_nome text, p_ok boolean, p_detalhe text DEFAULT '')
        RETURNS text LANGUAGE sql AS $b$
            SELECT CASE WHEN p_ok THEN 'ok    ' ELSE 'FALHA ' END || p_nome || CASE WHEN p_detalhe = '' THEN '' ELSE ' [' || p_detalhe || ']' END
        $b$
    $f$;

    -- 0. Estrutura ------------------------------------------------------------
    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
     WHERE s.nspname = 'public' AND c.relname IN ('lead_nome_historico', 'lead_veiculos_interesse') AND c.relrowsecurity;
    r := r || pg_temp.ni_chk('tabelas novas com RLS ligado', n = 2);
    SELECT (has_table_privilege('anon', 'public.lead_nome_historico', 'SELECT')
         OR has_table_privilege('authenticated', 'public.lead_nome_historico', 'INSERT')
         OR has_function_privilege('authenticated', 'public.atualizar_nome_lead(text,text,text,text,text)', 'EXECUTE')
         OR has_function_privilege('anon', 'public.registrar_interesse_lead(text,text,text,smallint,text,text,boolean,text,text)', 'EXECUTE'))::int INTO n;
    r := r || pg_temp.ni_chk('anon/authenticated sem acesso às tabelas e funções que escrevem', n = 0);
    r := r || pg_temp.ni_chk('guarda do gatilho de sincronização presente',
        position('manos.escrita_crm' IN pg_get_functiondef('public.sync_distribuicao_26_to_master()'::regprocedure)) > 0);

    -- 1. Dados fictícios --------------------------------------------------------
    INSERT INTO public.consultants_manos_crm (name, email, role, status, is_active, auth_id, user_id, recebe_leads)
    VALUES ('Teste NI A', 'ni-a@teste.invalid', 'vendedor', 'active', true, a_auth, a_auth, false) RETURNING id INTO a_id;
    INSERT INTO public.consultants_manos_crm (name, email, role, status, is_active, auth_id, user_id, recebe_leads)
    VALUES ('Teste NI B', 'ni-b@teste.invalid', 'vendedor', 'active', true, b_auth, b_auth, false) RETURNING id INTO b_id;

    -- L1: lead do vendedor A, nome genérico e interesse genérico
    INSERT INTO public.leads_distribuicao_crm_26 (nome, telefone, status, origem, interesse, assigned_consultant_id)
    VALUES ('Lead WhatsApp', '47900000001', 'received', 'WhatsApp', 'Analisar Perfil', a_id) RETURNING id INTO l1;
    -- L2: lead do vendedor B, nome digitado por consultor (sem histórico, sem perfil igual) e carro digitado
    INSERT INTO public.leads_distribuicao_crm_26 (nome, telefone, status, origem, interesse, assigned_consultant_id)
    VALUES ('Marcos Pereira', '47900000002', 'received', 'WhatsApp', 'Hilux até 200 mil', b_id) RETURNING id INTO l2;
    -- L3: nome vindo do perfil do WhatsApp ("Papai"), conversa com o mesmo nome de contato
    INSERT INTO public.leads_distribuicao_crm_26 (nome, telefone, status, origem, assigned_consultant_id)
    VALUES ('Papai', '47900000003', 'received', 'WhatsApp', a_id) RETURNING id INTO l3;
    INSERT INTO public.wa_conversas (telefone_key, nome_contato, assigned_consultant_id, ultima_mensagem_em)
    VALUES ('47900000003', 'Papai', a_id, now());
    INSERT INTO public.wa_conversas (telefone_key, nome_contato, assigned_consultant_id, ultima_mensagem_em)
    VALUES ('47900000001', 'Perfil Zap', a_id, now());

    -- status do master diferente do crm26 (como em 1.815 leads reais): a troca de nome não pode mexer
    UPDATE public.leads_master SET status = 'attempt' WHERE phone = '47900000001';

    -- 2. Nome: genérico → cliente disse ------------------------------------------
    res := public.atualizar_nome_lead('47900000001', 'Carlos Souza', 'cliente_disse', 'teste', 'sou o Carlos Souza');
    SELECT nome INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l1;
    r := r || pg_temp.ni_chk('genérico → cliente disse troca o nome no crm26', v = 'Carlos Souza', coalesce(v, 'null'));
    SELECT name INTO v FROM public.leads_master WHERE phone = '47900000001';
    r := r || pg_temp.ni_chk('o mesmo nome vai para o master', v = 'Carlos Souza', coalesce(v, 'null'));
    SELECT nome_cliente || '/' || nome_cliente_origem INTO v FROM public.wa_conversas WHERE telefone_key = '47900000001';
    r := r || pg_temp.ni_chk('e para a conversa, com a origem', v = 'Carlos Souza/cliente_disse', coalesce(v, 'null'));
    SELECT status INTO v FROM public.leads_master WHERE phone = '47900000001';
    r := r || pg_temp.ni_chk('status do master NÃO foi sobrescrito', v = 'attempt', coalesce(v, 'null'));
    SELECT status INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l1;
    r := r || pg_temp.ni_chk('status do crm26 intacto', v = 'received', coalesce(v, 'null'));
    SELECT count(*) INTO n FROM public.lead_nome_historico WHERE lead_uid = 'leads_distribuicao_crm_26:' || l1 AND aplicado AND nome_antigo = 'Lead WhatsApp';
    r := r || pg_temp.ni_chk('histórico registra a troca (antigo → novo)', n = 1);

    -- 3. O cliente se corrige; nome mais curto não troca ----------------------------
    res := public.atualizar_nome_lead('47900000001', 'Carlos Alberto Souza', 'cliente_disse', 'teste', 'na verdade é Carlos Alberto Souza');
    SELECT nome INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l1;
    r := r || pg_temp.ni_chk('cliente se corrige: vale o último que ele disse', v = 'Carlos Alberto Souza', coalesce(v, 'null'));
    res := public.atualizar_nome_lead('47900000001', 'Carlos', 'cliente_disse', 'teste');
    SELECT nome INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l1;
    r := r || pg_temp.ni_chk('nome mais curto da mesma pessoa não troca', v = 'Carlos Alberto Souza', coalesce(v, 'null'));
    res := public.atualizar_nome_lead('47900000001', 'Papai', 'perfil_whatsapp', 'teste');
    SELECT nome INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l1;
    r := r || pg_temp.ni_chk('perfil do WhatsApp (origem mais fraca) não troca', v = 'Carlos Alberto Souza', coalesce(v, 'null'));

    -- 4. Manual nunca é sobrescrito --------------------------------------------------
    res := public.atualizar_nome_lead('47900000002', 'Marcos', 'cliente_disse', 'teste', 'me chamo Marcos');
    SELECT nome INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l2;
    r := r || pg_temp.ni_chk('nome digitado por consultor NÃO é sobrescrito', v = 'Marcos Pereira', coalesce(v, 'null'));
    SELECT count(*) INTO n FROM public.lead_nome_historico WHERE lead_uid = 'leads_distribuicao_crm_26:' || l2 AND NOT aplicado;
    r := r || pg_temp.ni_chk('a tentativa recusada fica no histórico', n = 1);
    res := public.atualizar_nome_lead('47900000002', 'Marcos Antônio Pereira', 'manual', 'consultor:teste');
    SELECT nome INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l2;
    r := r || pg_temp.ni_chk('o consultor pode editar (origem manual)', v = 'Marcos Antônio Pereira', coalesce(v, 'null'));

    -- 5. Perfil do WhatsApp → o cliente diz o nome ------------------------------------
    res := public.atualizar_nome_lead('47900000003', 'Carlos', 'cliente_disse', 'teste', 'sou o Carlos');
    SELECT nome INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l3;
    r := r || pg_temp.ni_chk('"Papai" (perfil) → "sou o Carlos" troca', v = 'Carlos', coalesce(v, 'null'));

    -- 6. Desfazer --------------------------------------------------------------------
    SELECT id INTO h1 FROM public.lead_nome_historico
     WHERE lead_uid = 'leads_distribuicao_crm_26:' || l3 AND aplicado AND origem = 'cliente_disse' ORDER BY criado_em DESC LIMIT 1;
    res := public.desfazer_nome_lead(h1, 'consultor:teste');
    SELECT nome INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l3;
    r := r || pg_temp.ni_chk('desfazer devolve o nome anterior', v = 'Papai', coalesce(v, 'null'));
    res := public.atualizar_nome_lead('47900000003', 'Carlos', 'cliente_disse', 'teste');
    SELECT nome INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l3;
    r := r || pg_temp.ni_chk('nome desfeito não volta sozinho', v = 'Papai', coalesce(v, 'null'));
    r := r || pg_temp.ni_chk('entrada inválida é recusada (nome genérico)', (public.atualizar_nome_lead('47900000003', 'Lead WhatsApp', 'cliente_disse', 'teste') ->> 'ok')::boolean = false);

    -- 7. Carro -----------------------------------------------------------------------
    res := public.registrar_interesse_lead('47900000001', 'Chevrolet Onix HATCH LTZ 1.4 8V FlexPower 5p Aut. 2018', 'onix', 2018::smallint, '4421111', 'cliente_citou', true, 'teste', 'tem o onix 2018?');
    SELECT interesse || '|' || vehicle_interest INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l1;
    r := r || pg_temp.ni_chk('"Analisar Perfil" é substituído (interesse e vehicle_interest)',
        v = 'Chevrolet Onix HATCH LTZ 1.4 8V FlexPower 5p Aut. 2018|Chevrolet Onix HATCH LTZ 1.4 8V FlexPower 5p Aut. 2018', coalesce(v, 'null'));
    SELECT vehicle_interest INTO v FROM public.leads_master WHERE phone = '47900000001';
    r := r || pg_temp.ni_chk('o master recebe o carro', v LIKE 'Chevrolet Onix%', coalesce(v, 'null'));
    res := public.registrar_interesse_lead('47900000001', 'Jeep Compass LIMITED 2.0 4x2 Flex 16V Aut. 2019', 'compass', 2019::smallint, '4500001', 'laura_estoque', true, 'teste');
    SELECT vehicle_interest INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l1;
    r := r || pg_temp.ni_chk('segundo carro é acrescentado, o mais recente primeiro', v LIKE 'Jeep Compass%·%Chevrolet Onix%', coalesce(v, 'null'));
    res := public.registrar_interesse_lead('47900000001', 'Chevrolet Onix HATCH LTZ 1.4 8V FlexPower 5p Aut. 2018', 'onix', 2018::smallint, '4421111', 'cliente_citou', true, 'teste');
    SELECT count(*) INTO n FROM public.lead_veiculos_interesse WHERE telefone_key = '47900000001';
    r := r || pg_temp.ni_chk('o mesmo carro não é repetido', n = 2, n::text);
    SELECT vehicle_interest INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l1;
    r := r || pg_temp.ni_chk('citar de novo sobe o carro para o topo', v LIKE 'Chevrolet Onix%·%Jeep Compass%', coalesce(v, 'null'));
    res := public.registrar_interesse_lead('47900000001', 'Toyota Corolla 2015', 'corolla', 2015::smallint, NULL, 'cliente_citou', false, 'teste', 'procuro um corolla 2015');
    SELECT em_estoque INTO n FROM (SELECT (NOT em_estoque)::int AS em_estoque FROM public.lead_veiculos_interesse WHERE telefone_key = '47900000001' AND modelo_chave = 'corolla') x;
    r := r || pg_temp.ni_chk('carro fora do estoque entra com em_estoque = false', n = 1);
    res := public.registrar_interesse_lead('47900000001', 'Volkswagen T-Cross Highline 2021', 'tcross', 2021::smallint, '4500003', 'link_site', true, 'teste');
    SELECT length(vehicle_interest) - length(replace(vehicle_interest, '·', '')) INTO n FROM public.leads_distribuicao_crm_26 WHERE id = l1;
    r := r || pg_temp.ni_chk('a tela mostra no máximo 3 carros', n = 2, n::text);
    -- o que o consultor digitou nunca sai
    res := public.registrar_interesse_lead('47900000002', 'Chevrolet Onix HATCH LTZ 2018', 'onix', 2018::smallint, '4421111', 'cliente_citou', true, 'teste');
    SELECT vehicle_interest INTO v FROM public.leads_distribuicao_crm_26 WHERE id = l2;
    r := r || pg_temp.ni_chk('o carro digitado pelo consultor continua na tela', v LIKE '%Hilux até 200 mil%' AND v LIKE '%Onix%', coalesce(v, 'null'));
    SELECT status INTO v FROM public.leads_master WHERE phone = '47900000001';
    r := r || pg_temp.ni_chk('status do master continua intacto depois dos carros', v = 'attempt', coalesce(v, 'null'));

    -- 8. RLS -------------------------------------------------------------------------
    j_a    := jsonb_build_object('sub', a_auth, 'role', 'authenticated', 'email', 'ni-a@teste.invalid');
    j_anon := jsonb_build_object('role', 'anon');
    r := r || pg_temp.ni_chk('vendedor A vê o histórico dos próprios leads',
        pg_temp.ni_contar('SELECT count(*) FROM public.lead_nome_historico WHERE telefone_key = ''47900000001''', 'authenticated', j_a) > 0);
    r := r || pg_temp.ni_chk('vendedor A NÃO vê o histórico do lead do vendedor B',
        pg_temp.ni_contar('SELECT count(*) FROM public.lead_nome_historico WHERE telefone_key = ''47900000002''', 'authenticated', j_a) = 0);
    r := r || pg_temp.ni_chk('vendedor A vê os carros do próprio lead',
        pg_temp.ni_contar('SELECT count(*) FROM public.lead_veiculos_interesse WHERE telefone_key = ''47900000001''', 'authenticated', j_a) > 0);
    r := r || pg_temp.ni_chk('vendedor A NÃO vê os carros do lead do B',
        pg_temp.ni_contar('SELECT count(*) FROM public.lead_veiculos_interesse WHERE telefone_key = ''47900000002''', 'authenticated', j_a) = 0);
    r := r || pg_temp.ni_chk('anônimo não lê nada',
        pg_temp.ni_contar('SELECT count(*) FROM public.lead_nome_historico', 'anon', j_anon) <= 0);

    SELECT count(*) INTO falhas FROM unnest(r) x WHERE x LIKE 'FALHA%';
    IF falhas = 0 THEN
        RAISE EXCEPTION 'NOME_INTERESSE PASSOU — % verificações ok (tudo desfeito)%', (SELECT count(*) FROM unnest(r) x WHERE x LIKE 'ok%'),
            E'\n' || array_to_string(r, E'\n');
    ELSE
        RAISE EXCEPTION 'NOME_INTERESSE FALHOU — % falha(s) (tudo desfeito)%', falhas, E'\n' || array_to_string(r, E'\n');
    END IF;
END
$teste$;
