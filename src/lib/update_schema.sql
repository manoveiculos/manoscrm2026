ALTER TABLE leads_distribuicao ADD COLUMN IF NOT EXISTS ai_classification TEXT CHECK (ai_classification IN ('hot', 'warm', 'cold'));
