-- ===========================================================================
-- Ensaio + teste de RLS de push_inscricoes (migration 20261106).
-- Roda a migration, testa como vendedor A, vendedor B e anon, e termina em
-- RAISE EXCEPTION: TUDO é desfeito (nada fica no banco).
-- Resultado esperado na mensagem de erro:
--   "ENSAIO OK (desfeito): A vê 1, B vê 1, anon bloqueado, insert do navegador bloqueado"
-- ===========================================================================
DO $ensaio$
DECLARE
    a uuid; a_auth uuid; b uuid; b_auth uuid;
    n_a int; n_b int; anon_txt text := 'LIDO (FALHA)'; ins_txt text := 'ACEITO (FALHA)';
BEGIN
    -- ── migration (mesmo conteúdo de 20261106_push_inscricoes.sql) ────────
    CREATE TABLE IF NOT EXISTS public.push_inscricoes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consultant_id uuid NOT NULL REFERENCES public.consultants_manos_crm(id) ON DELETE CASCADE,
        endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL, user_agent text,
        ativo boolean NOT NULL DEFAULT true, falhas integer NOT NULL DEFAULT 0,
        criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now(),
        ultimo_envio_em timestamptz,
        CONSTRAINT ck_push_endpoint_https CHECK (endpoint LIKE 'https://%'));
    CREATE INDEX IF NOT EXISTS idx_push_inscricoes_consultor_ativo ON public.push_inscricoes (consultant_id) WHERE ativo;
    ALTER TABLE public.push_inscricoes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY push_inscricoes_select_proprias ON public.push_inscricoes
        FOR SELECT TO authenticated USING (consultant_id = (SELECT public.wa_meu_consultant_id()));
    REVOKE ALL ON public.push_inscricoes FROM anon, public;
    REVOKE ALL ON public.push_inscricoes FROM authenticated;
    GRANT SELECT ON public.push_inscricoes TO authenticated;
    GRANT ALL ON public.push_inscricoes TO service_role;

    -- ── dois vendedores ativos com login ──────────────────────────────────
    SELECT id, auth_id INTO a, a_auth FROM public.consultants_manos_crm
     WHERE is_active AND auth_id IS NOT NULL AND coalesce(status, 'active') = 'active' ORDER BY created_at LIMIT 1;
    SELECT id, auth_id INTO b, b_auth FROM public.consultants_manos_crm
     WHERE is_active AND auth_id IS NOT NULL AND coalesce(status, 'active') = 'active' AND id <> a ORDER BY created_at LIMIT 1;
    IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'ENSAIO SEM 2 VENDEDORES ATIVOS'; END IF;

    INSERT INTO public.push_inscricoes (consultant_id, endpoint, p256dh, auth)
    VALUES (a, 'https://push.exemplo.test/a', 'x', 'y'), (b, 'https://push.exemplo.test/b', 'x', 'y');

    -- ── como vendedor A ───────────────────────────────────────────────────
    PERFORM set_config('request.jwt.claims', json_build_object('sub', a_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO n_a FROM public.push_inscricoes;
    BEGIN
        INSERT INTO public.push_inscricoes (consultant_id, endpoint, p256dh, auth) VALUES (a, 'https://push.exemplo.test/x', 'x', 'y');
    EXCEPTION WHEN insufficient_privilege THEN ins_txt := 'insert do navegador bloqueado';
    END;
    EXECUTE 'RESET ROLE';

    -- ── como vendedor B ───────────────────────────────────────────────────
    PERFORM set_config('request.jwt.claims', json_build_object('sub', b_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO n_b FROM public.push_inscricoes;
    EXECUTE 'RESET ROLE';

    -- ── como anon ─────────────────────────────────────────────────────────
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
        PERFORM count(*) FROM public.push_inscricoes;
    EXCEPTION WHEN insufficient_privilege THEN anon_txt := 'anon bloqueado';
    END;
    EXECUTE 'RESET ROLE';

    RAISE EXCEPTION 'ENSAIO OK (desfeito): A vê %, B vê %, %, %', n_a, n_b, anon_txt, ins_txt;
END
$ensaio$;
