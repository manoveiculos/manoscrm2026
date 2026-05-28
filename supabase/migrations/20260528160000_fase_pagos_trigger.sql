-- Alterar a constraint CHECK da coluna fase para incluir 'PAGOS'
ALTER TABLE public.records_cobrancamanos26 DROP CONSTRAINT IF EXISTS records_cobrancamanos26_fase_check;
ALTER TABLE public.records_cobrancamanos26 ADD CONSTRAINT records_cobrancamanos26_fase_check CHECK (fase IN ('NORMAL', 'ENVIO_JURIDICO', 'JURIDICO_VENDEDORES', 'ENVIO_FORUM', 'PAGOS'));

-- Criar a função e trigger para alterar fase para 'PAGOS' automaticamente ao marcar como 'PAGO'
CREATE OR REPLACE FUNCTION public.tg_cobranca_sync_fase_pago()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'PAGO' THEN
        NEW.fase := 'PAGOS';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_fase_pago ON public.records_cobrancamanos26;
CREATE TRIGGER trg_sync_fase_pago
BEFORE INSERT OR UPDATE ON public.records_cobrancamanos26
FOR EACH ROW
EXECUTE FUNCTION public.tg_cobranca_sync_fase_pago();
