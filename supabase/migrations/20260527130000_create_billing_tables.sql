-- Create records_cobrancamanos26 table
CREATE TABLE IF NOT EXISTS public.records_cobrancamanos26 (
    id TEXT PRIMARY KEY,
    "clienteFornecedor" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    telefone TEXT,
    veiculo TEXT,
    vencimento TEXT NOT NULL,
    valor NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDENTE',
    "dataPagamento" TEXT,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS for records_cobrancamanos26
ALTER TABLE public.records_cobrancamanos26 ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to perform all operations
CREATE POLICY "Allow all operations for authenticated users on records" 
ON public.records_cobrancamanos26 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Create reminders_cobrancamanos26 table
CREATE TABLE IF NOT EXISTS public.reminders_cobrancamanos26 (
    id TEXT PRIMARY KEY,
    "recordId" TEXT,
    cliente TEXT,
    telefone TEXT,
    vencimento TEXT,
    estagio TEXT,
    "sentAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS for reminders_cobrancamanos26
ALTER TABLE public.reminders_cobrancamanos26 ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to perform all operations on reminders
CREATE POLICY "Allow all operations for authenticated users on reminders" 
ON public.reminders_cobrancamanos26 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_records_cobranca_vencimento ON public.records_cobrancamanos26(vencimento);
CREATE INDEX IF NOT EXISTS idx_records_cobranca_status ON public.records_cobrancamanos26(status);
CREATE INDEX IF NOT EXISTS idx_records_cobranca_cpfcnpj ON public.records_cobrancamanos26("cpfCnpj");
CREATE INDEX IF NOT EXISTS idx_reminders_cobranca_telefone ON public.reminders_cobrancamanos26(telefone);
CREATE INDEX IF NOT EXISTS idx_reminders_cobranca_venc_estagio ON public.reminders_cobrancamanos26(vencimento, estagio);
