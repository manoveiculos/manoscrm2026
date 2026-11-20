-- Acerto de contas Manos × V3 (rota /manosv3): sistema NOVO e isolado do módulo societário.
-- Não toca em veiculos, contratos_*, fechamentos_lucro, retiradas_socios etc.
-- Acesso só via API (service role + guard de sócios): RLS ligado sem policies.

-- Substitui o rascunho anterior (ledger genérico). Só remove se estiver vazio.
DO $$
BEGIN
    IF to_regclass('public.manosv3_caixa_lancamentos') IS NOT NULL THEN
        IF (SELECT count(*) FROM public.manosv3_caixa_lancamentos) = 0 THEN
            DROP TABLE public.manosv3_caixa_lancamentos;
        ELSE
            RAISE NOTICE 'manosv3_caixa_lancamentos tem dados; mantida.';
        END IF;
    END IF;
END $$;

-- Um registro por carro/negócio (compra → estoque → venda → finalizado).
CREATE TABLE IF NOT EXISTS public.manosv3_negocios (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_por              TEXT,
    placa                   TEXT,
    veiculo                 TEXT NOT NULL,
    chassi                  TEXT,
    ano_modelo              INT,
    km                      INT,
    cor                     TEXT,
    status                  TEXT NOT NULL DEFAULT 'estoque' CHECK (status IN ('estoque', 'vendido', 'finalizado')),
    -- compra
    compra_loja             TEXT NOT NULL CHECK (compra_loja IN ('manos', 'v3')),   -- empresa que assinou a compra
    compra_data             DATE,
    compra_valor_centavos   BIGINT NOT NULL CHECK (compra_valor_centavos >= 0),
    compra_parte            TEXT,                                                    -- fornecedor
    compra_contrato_path    TEXT,
    -- venda
    venda_loja              TEXT CHECK (venda_loja IN ('manos', 'v3')),             -- empresa que vendeu
    venda_data              DATE,
    venda_valor_centavos    BIGINT CHECK (venda_valor_centavos >= 0),
    venda_parte             TEXT,                                                    -- comprador
    venda_contrato_path     TEXT,
    venda_registrada_em     TIMESTAMPTZ,
    venda_registrada_por    TEXT,
    comissao_beneficiario   TEXT,
    -- fechamento e conferência dos sócios
    conferido_alexandre_em  TIMESTAMPTZ,
    conferido_ivo_em        TIMESTAMPTZ,
    finalizado_em           TIMESTAMPTZ,
    finalizado_por          TEXT,
    observacoes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_manosv3_negocios_placa  ON public.manosv3_negocios (placa);
CREATE INDEX IF NOT EXISTS idx_manosv3_negocios_status ON public.manosv3_negocios (status);

-- Todo dinheiro que se move: quem pagou (de_lado) e quem recebeu (para_lado). 'externo' = fornecedor, cliente, governo, vendedor.
CREATE TABLE IF NOT EXISTS public.manosv3_movimentos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_por      TEXT,
    negocio_id      UUID REFERENCES public.manosv3_negocios (id) ON DELETE RESTRICT,
    tipo            TEXT NOT NULL CHECK (tipo IN ('compra', 'custo', 'venda', 'comissao', 'imposto', 'repasse', 'retirada', 'outro')),
    de_lado         TEXT NOT NULL CHECK (de_lado IN ('manos', 'v3', 'externo')),
    para_lado       TEXT NOT NULL CHECK (para_lado IN ('manos', 'v3', 'externo')),
    valor_centavos  BIGINT NOT NULL CHECK (valor_centavos > 0),
    status          TEXT NOT NULL DEFAULT 'pago' CHECK (status IN ('pago', 'pendente')),
    data            DATE NOT NULL DEFAULT CURRENT_DATE,
    vencimento      DATE,
    pago_em         TIMESTAMPTZ,
    pago_por        TEXT,
    forma           TEXT,                          -- pix, ted, dinheiro, financiamento, troca_veiculo...
    descricao       TEXT,
    estornado_em    TIMESTAMPTZ,                   -- nada é apagado: estorno mantém o histórico
    estornado_por   TEXT,
    CONSTRAINT manosv3_mov_lados_diferentes CHECK (de_lado <> para_lado)
);
CREATE INDEX IF NOT EXISTS idx_manosv3_mov_negocio ON public.manosv3_movimentos (negocio_id);
CREATE INDEX IF NOT EXISTS idx_manosv3_mov_status  ON public.manosv3_movimentos (status) WHERE estornado_em IS NULL;

ALTER TABLE public.manosv3_negocios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manosv3_movimentos ENABLE ROW LEVEL SECURITY;

-- Contratos em PDF (bucket privado; leitura por URL assinada gerada pela API).
INSERT INTO storage.buckets (id, name, public)
VALUES ('manosv3-contratos', 'manosv3-contratos', false)
ON CONFLICT (id) DO NOTHING;
