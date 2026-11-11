-- ===========================================================================
-- Ensaio + teste de RLS de agentes_config (migration 20261106b).
-- Roda a migration, testa como admin, vendedor, outro app (login sem cadastro
-- de consultor) e anon, e termina em RAISE EXCEPTION: TUDO é desfeito.
-- Esperado: "ENSAIO OK (desfeito): admin vê 2, vendedor vê 0, outro app vê 0,
--            anon bloqueado, escrita do navegador bloqueada"
-- ===========================================================================
DO $ensaio$
DECLARE
    admin_auth uuid; vend_auth uuid;
    n_admin int; n_vend int; n_outro int;
    anon_txt text := 'LIDO (FALHA)'; esc_txt text := 'ACEITA (FALHA)';
BEGIN
    -- ── migration (mesmo conteúdo de 20261106b_agentes_config.sql) ────────
    CREATE TABLE IF NOT EXISTS public.agentes_config (
        agente_id text PRIMARY KEY CHECK (agente_id ~ '^[a-z0-9_]{2,40}$'),
        modo text NOT NULL DEFAULT 'ligado' CHECK (modo IN ('ligado', 'ensaio', 'desligado')),
        ligado boolean GENERATED ALWAYS AS (modo <> 'desligado') STORED,
        alterado_por text, alterado_em timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.agentes_config (agente_id, modo, alterado_por) VALUES ('ia_geral', 'ligado', 'migration') ON CONFLICT (agente_id) DO NOTHING;
    ALTER TABLE public.agentes_config ENABLE ROW LEVEL SECURITY;
    CREATE POLICY agentes_config_select_admin ON public.agentes_config
        FOR SELECT TO authenticated USING ((SELECT public.is_admin_or_alexandre()));
    REVOKE ALL ON public.agentes_config FROM anon, public;
    REVOKE ALL ON public.agentes_config FROM authenticated;
    GRANT SELECT ON public.agentes_config TO authenticated;
    GRANT ALL ON public.agentes_config TO service_role;

    INSERT INTO public.agentes_config (agente_id, modo, alterado_por) VALUES ('supervisor', 'desligado', 'ensaio');

    SELECT auth_id INTO admin_auth FROM public.consultants_manos_crm
     WHERE role = 'admin' AND auth_id IS NOT NULL ORDER BY created_at LIMIT 1;
    SELECT auth_id INTO vend_auth FROM public.consultants_manos_crm
     WHERE coalesce(role, '') <> 'admin' AND auth_id IS NOT NULL AND is_active ORDER BY created_at LIMIT 1;
    IF admin_auth IS NULL OR vend_auth IS NULL THEN RAISE EXCEPTION 'ENSAIO SEM ADMIN OU SEM VENDEDOR'; END IF;

    -- admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO n_admin FROM public.agentes_config;
    BEGIN
        UPDATE public.agentes_config SET modo = 'desligado' WHERE agente_id = 'ia_geral';
    EXCEPTION WHEN insufficient_privilege THEN esc_txt := 'escrita do navegador bloqueada';
    END;
    EXECUTE 'RESET ROLE';

    -- vendedor
    PERFORM set_config('request.jwt.claims', json_build_object('sub', vend_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO n_vend FROM public.agentes_config;
    EXECUTE 'RESET ROLE';

    -- outro app: login válido, mas sem cadastro de consultor
    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'email', 'outro.app@exemplo.test')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO n_outro FROM public.agentes_config;
    EXECUTE 'RESET ROLE';

    -- anon
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
        PERFORM count(*) FROM public.agentes_config;
    EXCEPTION WHEN insufficient_privilege THEN anon_txt := 'anon bloqueado';
    END;
    EXECUTE 'RESET ROLE';

    RAISE EXCEPTION 'ENSAIO OK (desfeito): admin vê %, vendedor vê %, outro app vê %, %, %', n_admin, n_vend, n_outro, anon_txt, esc_txt;
END
$ensaio$;
