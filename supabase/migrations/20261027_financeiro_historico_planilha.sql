-- TABELAS PARA O HISTÓRICO SEPARADO DA PLANILHA (2023 A 2026)
-- Mantém 100% separado dos caixas operacionais ativos atuais para não poluir os saldos bancários

CREATE TABLE IF NOT EXISTS fin_historico_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_ordem integer NOT NULL,
  titulo text NOT NULL,
  saldo_inicial numeric(15,2) DEFAULT 0,
  total_recebido numeric(15,2) DEFAULT 0,
  total_pago numeric(15,2) DEFAULT 0,
  saldo_final numeric(15,2) DEFAULT 0,
  qtd_entradas integer DEFAULT 0,
  qtd_saidas integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_historico_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES fin_historico_periodos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  data_registro text,
  descricao text NOT NULL,
  motivo_ou_placa text,
  valor numeric(15,2) NOT NULL,
  ordem_linha integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_hist_periodos_ordem ON fin_historico_periodos(numero_ordem);
CREATE INDEX IF NOT EXISTS idx_fin_hist_itens_periodo ON fin_historico_itens(periodo_id);

ALTER TABLE fin_historico_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_historico_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_historico_periodos_all" ON fin_historico_periodos;
CREATE POLICY "fin_historico_periodos_all" ON fin_historico_periodos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fin_historico_itens_all" ON fin_historico_itens;
CREATE POLICY "fin_historico_itens_all" ON fin_historico_itens FOR ALL USING (true) WITH CHECK (true);
