-- ============================================================================
-- Módulo FINANCEIRO — Caixa Livre + Patrimônio (Alexandre & Felipe Ledra)
-- Cada usuário tem seu próprio caixa PRIVADO (owner_email).
-- Acesso ao módulo: alexandre_gorges@hotmail.com, hgledra@hotmail.com
-- As rotas /api/financeiro usam service role + guard de sessão; o RLS abaixo
-- é a segunda camada (protege acesso direto via anon key).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_financeiro_autorizado(user_email text)
RETURNS boolean AS $$
BEGIN
    RETURN lower(coalesce(user_email, '')) IN ('alexandre_gorges@hotmail.com', 'hgledra@hotmail.com');
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- Contas (Nubank, Dinheiro, Conta PJ, Cartão...)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fin_contas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email text NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL DEFAULT 'banco' CHECK (tipo IN ('banco', 'dinheiro', 'cartao', 'investimento')),
    escopo text NOT NULL DEFAULT 'PF' CHECK (escopo IN ('PF', 'PJ')),
    saldo_inicial numeric(14,2) NOT NULL DEFAULT 0,
    data_saldo_inicial date NOT NULL DEFAULT current_date,
    cor text,
    ordem int NOT NULL DEFAULT 0,
    ativa boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_contas_owner_idx ON public.fin_contas (owner_email);

-- ---------------------------------------------------------------------------
-- Categorias
--   natureza = 'operacional' → entra no RESULTADO (receita/despesa)
--   natureza = 'patrimonial' → só troca dinheiro por bem (compra/venda de veículo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fin_categorias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email text NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    natureza text NOT NULL DEFAULT 'operacional' CHECK (natureza IN ('operacional', 'patrimonial')),
    acao_patrimonio text CHECK (acao_patrimonio IN ('compra_veiculo', 'venda_veiculo')),
    cor text,
    palavras_chave text[] NOT NULL DEFAULT '{}',
    ativa boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_categorias_owner_idx ON public.fin_categorias (owner_email);

-- ---------------------------------------------------------------------------
-- Fechamentos (período travado)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fin_fechamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email text NOT NULL,
    titulo text,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    caixa_inicial numeric(14,2) NOT NULL DEFAULT 0,
    entradas numeric(14,2) NOT NULL DEFAULT 0,
    saidas numeric(14,2) NOT NULL DEFAULT 0,
    resultado_operacional numeric(14,2) NOT NULL DEFAULT 0,
    caixa_final numeric(14,2) NOT NULL DEFAULT 0,
    patrimonio_inicial numeric(14,2),
    patrimonio_final numeric(14,2),
    observacao text,
    fechado_em timestamptz NOT NULL DEFAULT now(),
    CHECK (data_fim >= data_inicio)
);
CREATE INDEX IF NOT EXISTS fin_fechamentos_owner_idx ON public.fin_fechamentos (owner_email, data_inicio);

-- ---------------------------------------------------------------------------
-- Patrimônio (bens e dívidas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fin_patrimonio (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email text NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('ativo', 'passivo')),
    grupo text NOT NULL DEFAULT 'outro'
        CHECK (grupo IN ('veiculo', 'imovel', 'a_receber', 'investimento', 'financiamento', 'emprestimo', 'divida', 'outro')),
    escopo text NOT NULL DEFAULT 'PF' CHECK (escopo IN ('PF', 'PJ')),
    valor_atual numeric(14,2) NOT NULL DEFAULT 0,
    valor_aquisicao numeric(14,2),
    placa text,
    ativo boolean NOT NULL DEFAULT true,            -- false = vendido / quitado
    baixado_em date,
    origem_lancamento_id uuid,
    observacao text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_patrimonio_owner_idx ON public.fin_patrimonio (owner_email, ativo);

CREATE TABLE IF NOT EXISTS public.fin_patrimonio_hist (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES public.fin_patrimonio(id) ON DELETE CASCADE,
    owner_email text NOT NULL,
    valor numeric(14,2) NOT NULL,
    data date NOT NULL DEFAULT current_date,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_patrimonio_hist_item_idx ON public.fin_patrimonio_hist (item_id, data);

-- ---------------------------------------------------------------------------
-- Lançamentos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fin_lancamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email text NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida', 'transferencia')),
    valor numeric(14,2) NOT NULL CHECK (valor > 0),
    data date NOT NULL DEFAULT current_date,
    descricao text NOT NULL,
    conta_id uuid REFERENCES public.fin_contas(id) ON DELETE SET NULL,
    conta_destino_id uuid REFERENCES public.fin_contas(id) ON DELETE SET NULL,
    categoria_id uuid REFERENCES public.fin_categorias(id) ON DELETE SET NULL,
    escopo text NOT NULL DEFAULT 'PF' CHECK (escopo IN ('PF', 'PJ')),
    placa text,
    status text NOT NULL DEFAULT 'pago' CHECK (status IN ('pago', 'previsto')),
    texto_original text,
    fechamento_id uuid REFERENCES public.fin_fechamentos(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_lancamentos_owner_data_idx ON public.fin_lancamentos (owner_email, data DESC);
CREATE INDEX IF NOT EXISTS fin_lancamentos_placa_idx ON public.fin_lancamentos (owner_email, placa) WHERE placa IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Foto diária do patrimônio
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fin_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email text NOT NULL,
    data date NOT NULL,
    caixa numeric(14,2) NOT NULL DEFAULT 0,
    bens numeric(14,2) NOT NULL DEFAULT 0,      -- ativos fora do caixa
    dividas numeric(14,2) NOT NULL DEFAULT 0,   -- passivos
    patrimonio_liquido numeric(14,2) NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_email, data)
);

-- ---------------------------------------------------------------------------
-- RLS — dono do registro + e-mail autorizado
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['fin_contas','fin_categorias','fin_fechamentos','fin_patrimonio',
                             'fin_patrimonio_hist','fin_lancamentos','fin_snapshots']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
               USING (lower(owner_email) = lower(auth.jwt() ->> ''email'') AND public.is_financeiro_autorizado(auth.jwt() ->> ''email''))
               WITH CHECK (lower(owner_email) = lower(auth.jwt() ->> ''email'') AND public.is_financeiro_autorizado(auth.jwt() ->> ''email''))',
            t || '_owner', t);
    END LOOP;
END $$;
