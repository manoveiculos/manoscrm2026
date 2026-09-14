-- ==============================================================================
-- FIX: is_socio_autorizado() liberava a anon key
-- Data: 2026-09-16
--
-- A versão de 20260915 devolvia TRUE quando o JWT não tem email. É exatamente o
-- caso da anon key (pública no bundle do front) e de qualquer request sem login:
-- as policies "FOR ALL USING (is_socio_autorizado())" deixavam ler e gravar
-- veiculos, contratos, pagamentos, fechamentos e retiradas dos sócios.
--
-- O atalho não era necessário: service_role já ignora RLS (as rotas /api/societario
-- usam service role), então sem email = sem acesso.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_socio_autorizado()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.usuarios_socios
        WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          AND ativo = true
    );
$$;
