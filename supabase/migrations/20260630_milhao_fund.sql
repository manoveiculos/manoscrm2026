-- =====================================================================
-- Projeto "Milhão" — Fundo segregado de capital para giro de veículos
-- Data: 2026-06-30
--
-- Objetivo de negócio: controlar um empréstimo de R$1.000.000 (30x R$48.724,
-- 1ª parcela em 20/01/2027) aplicado na compra/venda de carros, com a meta de
-- sobrar R$1.000.000 LIMPO depois de quitar todo o empréstimo (R$1.461.720).
-- Logo, a meta de LUCRO DE TRADING acumulado é exatamente R$1.461.720.
--
-- Acesso: SOMENTE o login admin Alexandre (alexandre_gorges@hotmail.com).
-- As rotas de API usam service_role e burlam o RLS; o RLS abaixo segue o
-- mesmo padrão das demais tabelas do CRM (admin por e-mail + service_role).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Configuração do fundo (linha única / singleton)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.milhao_config (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capital_inicial       NUMERIC(14,2) NOT NULL DEFAULT 1000000,   -- valor tomado no empréstimo
    valor_parcela         NUMERIC(14,2) NOT NULL DEFAULT 48724,     -- parcela mensal
    n_parcelas            INTEGER       NOT NULL DEFAULT 30,
    primeira_parcela      DATE          NOT NULL DEFAULT DATE '2027-01-20',
    meta_liquido          NUMERIC(14,2) NOT NULL DEFAULT 1000000,   -- quanto deve sobrar LIMPO no fim
    parcela_paga_por_fora BOOLEAN       NOT NULL DEFAULT TRUE,      -- TRUE = loja paga as parcelas; fundo é só o passivo
    data_inicio           DATE          NOT NULL DEFAULT CURRENT_DATE,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 2. Livro-razão dos carros do projeto (segregado do estoque normal)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.milhao_veiculos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Vínculo opcional com o feed do Altimus (estoque_sincronizado.id_externo)
    estoque_id_externo  TEXT,
    -- Identificação
    marca               TEXT NOT NULL,
    modelo              TEXT NOT NULL,
    versao              TEXT,
    ano                 INTEGER,
    placa               TEXT,
    km                  INTEGER,
    cor                 TEXT,
    -- Dinheiro que ENTRA no carro (custo)
    valor_compra        NUMERIC(14,2) NOT NULL DEFAULT 0,
    custos_reconto      NUMERIC(14,2) NOT NULL DEFAULT 0,  -- despachante, mecânica, estética, etc.
    -- Referências (rigor FIPE, sem chute)
    valor_fipe          NUMERIC(14,2),
    valor_anuncio       NUMERIC(14,2),  -- preço pedido enquanto em estoque
    -- Dinheiro que SAI (venda)
    valor_venda         NUMERIC(14,2),
    -- Datas e ciclo
    data_compra         DATE NOT NULL DEFAULT CURRENT_DATE,
    data_venda          DATE,
    status              TEXT NOT NULL DEFAULT 'estoque'
                          CHECK (status IN ('estoque','reservado','vendido','devolvido')),
    consultor           TEXT,
    obs                 TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milhao_veiculos_status      ON public.milhao_veiculos(status);
CREATE INDEX IF NOT EXISTS idx_milhao_veiculos_data_compra ON public.milhao_veiculos(data_compra);
CREATE INDEX IF NOT EXISTS idx_milhao_veiculos_data_venda  ON public.milhao_veiculos(data_venda);

-- ---------------------------------------------------------------------
-- 3. Cronograma de parcelas do empréstimo (30 linhas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.milhao_parcelas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero          INTEGER NOT NULL UNIQUE,
    vencimento      DATE NOT NULL,
    valor           NUMERIC(14,2) NOT NULL,
    paga            BOOLEAN NOT NULL DEFAULT FALSE,
    data_pagamento  DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 4. Trigger de updated_at (reaproveita a função padrão do CRM)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_milhao_config ON public.milhao_config;
CREATE TRIGGER set_timestamp_milhao_config
    BEFORE UPDATE ON public.milhao_config
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_milhao_veiculos ON public.milhao_veiculos;
CREATE TRIGGER set_timestamp_milhao_veiculos
    BEFORE UPDATE ON public.milhao_veiculos
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

-- ---------------------------------------------------------------------
-- 5. RLS — mesmo padrão de leads_compra (admin por e-mail + service_role)
-- ---------------------------------------------------------------------
ALTER TABLE public.milhao_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milhao_veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milhao_parcelas ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['milhao_config','milhao_veiculos','milhao_parcelas'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "Milhao acesso Alexandre" ON public.%I;
      CREATE POLICY "Milhao acesso Alexandre" ON public.%I
        FOR ALL
        USING (
          auth.jwt() ->> 'email' = 'alexandre_gorges@hotmail.com'
          OR EXISTS (
            SELECT 1 FROM public.consultants_manos_crm
            WHERE auth_id = auth.uid() AND role = 'admin'
          )
        )
        WITH CHECK (
          auth.jwt() ->> 'email' = 'alexandre_gorges@hotmail.com'
          OR EXISTS (
            SELECT 1 FROM public.consultants_manos_crm
            WHERE auth_id = auth.uid() AND role = 'admin'
          )
        );
      DROP POLICY IF EXISTS "Milhao service_role" ON public.%I;
      CREATE POLICY "Milhao service_role" ON public.%I
        FOR ALL
        USING (auth.jwt() ->> 'role' = 'service_role')
        WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
    $f$, t, t, t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6. Seed — config única + 30 parcelas (só na primeira vez)
-- ---------------------------------------------------------------------
INSERT INTO public.milhao_config (capital_inicial, valor_parcela, n_parcelas, primeira_parcela, meta_liquido, data_inicio)
SELECT 1000000, 48724, 30, DATE '2027-01-20', 1000000, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM public.milhao_config);

INSERT INTO public.milhao_parcelas (numero, vencimento, valor)
SELECT g,
       (DATE '2027-01-20' + ((g - 1) || ' months')::interval)::date,
       48724
FROM generate_series(1, 30) AS g
WHERE NOT EXISTS (SELECT 1 FROM public.milhao_parcelas);
