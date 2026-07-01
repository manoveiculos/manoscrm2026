-- =====================================================================
-- Módulo "Repasse" — ecossistema mobile do Paulo (intermediador/repassador)
-- Data: 2026-07-01
--
-- Paulo trabalha na rua comprando e repassando veículos. Precisa de controle
-- total na palma da mão: caixa, carros (compra-venda E intermediação por
-- comissão), lucro mensal e a rede de lojas/repassadores.
--
-- Modelo de caixa: o dinheiro dos CARROS é derivado da tabela repasse_veiculos
-- (compra/venda/comissão). A tabela repasse_caixa guarda só as movimentações
-- que NÃO são de carro (aporte, retirada, despesa de rua) — sem contar 2x.
--
-- Acesso: login paulo@manoscrm.com (+ admin). API usa service_role (burla RLS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rede de contatos (lojas, repassadores, particulares)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.repasse_lojas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email  TEXT NOT NULL DEFAULT 'paulo@manoscrm.com',
    nome         TEXT NOT NULL,
    tipo         TEXT NOT NULL DEFAULT 'loja'
                   CHECK (tipo IN ('loja','repassador','particular','outro')),
    telefone     TEXT,
    cidade       TEXT,
    obs          TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repasse_lojas_owner ON public.repasse_lojas(owner_email);

-- ---------------------------------------------------------------------
-- 2. Veículos / negócios (compra-venda ou intermediação)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.repasse_veiculos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email         TEXT NOT NULL DEFAULT 'paulo@manoscrm.com',
    estoque_id_externo  TEXT,
    marca               TEXT NOT NULL,
    modelo              TEXT NOT NULL,
    versao              TEXT,
    ano                 INTEGER,
    placa               TEXT,
    km                  INTEGER,
    cor                 TEXT,
    tipo_operacao       TEXT NOT NULL DEFAULT 'compra_venda'
                          CHECK (tipo_operacao IN ('compra_venda','intermediacao')),
    status              TEXT NOT NULL DEFAULT 'negociando'
                          CHECK (status IN ('negociando','comprado','anunciado','vendido','cancelado')),
    fornecedor_id       UUID REFERENCES public.repasse_lojas(id) ON DELETE SET NULL,
    comprador_id        UUID REFERENCES public.repasse_lojas(id) ON DELETE SET NULL,
    valor_compra        NUMERIC(14,2) NOT NULL DEFAULT 0,
    custos              NUMERIC(14,2) NOT NULL DEFAULT 0,  -- despachante, mecânica, guincho, etc.
    valor_anuncio       NUMERIC(14,2),
    valor_venda         NUMERIC(14,2),
    comissao            NUMERIC(14,2) NOT NULL DEFAULT 0,  -- usada na intermediação
    compra_paga         BOOLEAN NOT NULL DEFAULT TRUE,     -- FALSE = ele ainda deve (a pagar)
    venda_recebida      BOOLEAN NOT NULL DEFAULT TRUE,     -- FALSE = ainda vai receber (a receber)
    data_compra         DATE,
    data_venda          DATE,
    obs                 TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repasse_veiculos_owner  ON public.repasse_veiculos(owner_email);
CREATE INDEX IF NOT EXISTS idx_repasse_veiculos_status ON public.repasse_veiculos(status);
CREATE INDEX IF NOT EXISTS idx_repasse_veiculos_dvenda ON public.repasse_veiculos(data_venda);

-- ---------------------------------------------------------------------
-- 3. Caixa — movimentações que NÃO são de carro (aporte/retirada/despesa)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.repasse_caixa (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email      TEXT NOT NULL DEFAULT 'paulo@manoscrm.com',
    tipo             TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
    categoria        TEXT NOT NULL DEFAULT 'despesa'
                       CHECK (categoria IN ('aporte','retirada','despesa','comissao','outros')),
    descricao        TEXT,
    valor            NUMERIC(14,2) NOT NULL DEFAULT 0,
    data             DATE NOT NULL DEFAULT CURRENT_DATE,
    forma_pagamento  TEXT,
    veiculo_id       UUID REFERENCES public.repasse_veiculos(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repasse_caixa_owner ON public.repasse_caixa(owner_email);
CREATE INDEX IF NOT EXISTS idx_repasse_caixa_data  ON public.repasse_caixa(data);

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

DROP TRIGGER IF EXISTS set_timestamp_repasse_lojas ON public.repasse_lojas;
CREATE TRIGGER set_timestamp_repasse_lojas BEFORE UPDATE ON public.repasse_lojas
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_repasse_veiculos ON public.repasse_veiculos;
CREATE TRIGGER set_timestamp_repasse_veiculos BEFORE UPDATE ON public.repasse_veiculos
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

-- ---------------------------------------------------------------------
-- 5. RLS — acesso do Paulo (por e-mail) + admin + service_role
-- ---------------------------------------------------------------------
ALTER TABLE public.repasse_lojas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repasse_veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repasse_caixa    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['repasse_lojas','repasse_veiculos','repasse_caixa'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "Repasse acesso Paulo" ON public.%I;
      CREATE POLICY "Repasse acesso Paulo" ON public.%I
        FOR ALL
        USING (
          auth.jwt() ->> 'email' IN ('paulo@manoscrm.com','alexandre_gorges@hotmail.com')
          OR EXISTS (SELECT 1 FROM public.consultants_manos_crm WHERE auth_id = auth.uid() AND role = 'admin')
        )
        WITH CHECK (
          auth.jwt() ->> 'email' IN ('paulo@manoscrm.com','alexandre_gorges@hotmail.com')
          OR EXISTS (SELECT 1 FROM public.consultants_manos_crm WHERE auth_id = auth.uid() AND role = 'admin')
        );
      DROP POLICY IF EXISTS "Repasse service_role" ON public.%I;
      CREATE POLICY "Repasse service_role" ON public.%I
        FOR ALL
        USING (auth.jwt() ->> 'role' = 'service_role')
        WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
    $f$, t, t, t, t);
  END LOOP;
END $$;
