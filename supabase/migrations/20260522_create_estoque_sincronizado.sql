-- Migração para criar a tabela de estoque sincronizado e habilitar o pgvector
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.estoque_sincronizado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_externo TEXT UNIQUE, -- ID do veículo no feed do integrador (Altimus)
    marca TEXT NOT NULL,
    modelo TEXT NOT NULL,
    versao TEXT,
    ano INTEGER,
    ano_fabricacao INTEGER,
    preco NUMERIC(12, 2),
    km INTEGER,
    cambio TEXT,
    combustivel TEXT,
    cor TEXT,
    link TEXT,
    embedding vector(1536), -- Embedding do veículo para busca semântica (OpenAI text-embedding-3-small ou similar)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.estoque_sincronizado ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS simples: todos podem ler, somente service_role/admin pode escrever
CREATE POLICY "Permitir leitura pública do estoque" ON public.estoque_sincronizado
    FOR SELECT USING (true);

CREATE POLICY "Permitir escrita apenas para service_role" ON public.estoque_sincronizado
    FOR ALL USING (auth.jwt()->>'role' = 'service_role')
    WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_timestamp_estoque
    BEFORE UPDATE ON public.estoque_sincronizado
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_update_timestamp();

-- Função RPC para busca semântica no estoque por similaridade de cosseno
CREATE OR REPLACE FUNCTION public.match_estoque (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  id_externo text,
  marca text,
  modelo text,
  versao text,
  ano integer,
  ano_fabricacao integer,
  preco numeric,
  km integer,
  cambio text,
  combustivel text,
  cor text,
  link text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.id_externo,
    e.marca,
    e.modelo,
    e.versao,
    e.ano,
    e.ano_fabricacao,
    e.preco,
    e.km,
    e.cambio,
    e.combustivel,
    e.cor,
    e.link,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.estoque_sincronizado e
  WHERE e.embedding IS NOT NULL AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
