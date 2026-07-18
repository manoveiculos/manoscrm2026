-- =====================================================================
-- RG Scooters — app exclusivo do Renato (gestão do negócio de scooters)
-- Data: 2026-07-18
--
-- App em /renato, acesso total só do login renato@manos.com.br.
-- Alexandre (admin) controla tudo via /admin/scooters.
-- As rotas /api/scooters/* usam service_role (burlam RLS) e têm guard
-- próprio de e-mail no servidor. O RLS abaixo segue o padrão do CRM
-- (dono por e-mail + admin + service_role) como defesa em profundidade.
--
-- Porta do arquivo original gestor-scooters.jsx (que NÃO é alterado):
--   scooters -> scooters_models | vendas -> scooters_vendas
--   clientes -> scooters_clientes | despesas -> scooters_despesas
--   meta     -> scooters_config.meta
-- =====================================================================

-- 1. Modelos em estoque -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scooters_models (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email TEXT NOT NULL DEFAULT 'renato@manos.com.br',
    modelo      TEXT NOT NULL,
    custo       NUMERIC(12,2) NOT NULL DEFAULT 0,
    preco       NUMERIC(12,2) NOT NULL DEFAULT 0,
    qtd         INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Vendas (snapshot de modelo/custo na hora da venda) -----------------
CREATE TABLE IF NOT EXISTS public.scooters_vendas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email TEXT NOT NULL DEFAULT 'renato@manos.com.br',
    model_id    UUID REFERENCES public.scooters_models(id) ON DELETE SET NULL,
    modelo      TEXT NOT NULL,
    custo       NUMERIC(12,2) NOT NULL DEFAULT 0,
    cliente     TEXT NOT NULL,
    valor       NUMERIC(12,2) NOT NULL DEFAULT 0,
    pagamento   TEXT,
    data        DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scooters_vendas_data ON public.scooters_vendas(data);

-- 3. Clientes / leads ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scooters_clientes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email TEXT NOT NULL DEFAULT 'renato@manos.com.br',
    nome        TEXT NOT NULL,
    whats       TEXT,
    interesse   TEXT,
    status      TEXT NOT NULL DEFAULT 'Lead' CHECK (status IN ('Lead','Negociando','Comprou')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Despesas -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scooters_despesas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email TEXT NOT NULL DEFAULT 'renato@manos.com.br',
    descricao   TEXT NOT NULL,
    valor       NUMERIC(12,2) NOT NULL DEFAULT 0,
    data        DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scooters_despesas_data ON public.scooters_despesas(data);

-- 5. Config (meta mensal, singleton por dono) ---------------------------
CREATE TABLE IF NOT EXISTS public.scooters_config (
    owner_email TEXT PRIMARY KEY DEFAULT 'renato@manos.com.br',
    meta        NUMERIC(12,2) NOT NULL DEFAULT 3000,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Trigger updated_at (reaproveita função padrão do CRM) --------------
CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_ts_scooters_models ON public.scooters_models;
CREATE TRIGGER set_ts_scooters_models BEFORE UPDATE ON public.scooters_models
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();
DROP TRIGGER IF EXISTS set_ts_scooters_clientes ON public.scooters_clientes;
CREATE TRIGGER set_ts_scooters_clientes BEFORE UPDATE ON public.scooters_clientes
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();
DROP TRIGGER IF EXISTS set_ts_scooters_config ON public.scooters_config;
CREATE TRIGGER set_ts_scooters_config BEFORE UPDATE ON public.scooters_config
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

-- 7. RLS: dono (renato) por e-mail + admin + service_role ---------------
ALTER TABLE public.scooters_models   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scooters_vendas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scooters_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scooters_despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scooters_config   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['scooters_models','scooters_vendas','scooters_clientes','scooters_despesas','scooters_config'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "Scooters dono e admin" ON public.%I;
      CREATE POLICY "Scooters dono e admin" ON public.%I
        FOR ALL
        USING (
          auth.jwt() ->> 'email' IN ('renato@manos.com.br','alexandre_gorges@hotmail.com')
          OR EXISTS (SELECT 1 FROM public.consultants_manos_crm
                     WHERE auth_id = auth.uid() AND role = 'admin')
        )
        WITH CHECK (
          auth.jwt() ->> 'email' IN ('renato@manos.com.br','alexandre_gorges@hotmail.com')
          OR EXISTS (SELECT 1 FROM public.consultants_manos_crm
                     WHERE auth_id = auth.uid() AND role = 'admin')
        );
      DROP POLICY IF EXISTS "Scooters service_role" ON public.%I;
      CREATE POLICY "Scooters service_role" ON public.%I
        FOR ALL
        USING (auth.jwt() ->> 'role' = 'service_role')
        WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
    $f$, t, t, t, t);
  END LOOP;
END $$;

-- 8. Seed: config única do Renato --------------------------------------
INSERT INTO public.scooters_config (owner_email, meta)
SELECT 'renato@manos.com.br', 3000
WHERE NOT EXISTS (SELECT 1 FROM public.scooters_config WHERE owner_email = 'renato@manos.com.br');
