-- ============================================================================
-- MOTOR DE ALERTAS DA CENTRAL DE COMPRAS — PARTE 1 (segura, aplicar antes do deploy)
--
-- Contexto: o aviso de "achei o carro do teu cliente" parou de chegar no
-- WhatsApp dos vendedores e ninguém percebeu por semanas, porque NADA era
-- registrado. Esta migration cria o rastro de auditoria e conserta os dados
-- que impediriam a entrega mesmo com o motor religado.
-- ============================================================================

-- 1. Nome do cliente final ---------------------------------------------------
-- `nome_cliente`/`telefone_cliente` sempre foram, na prática, o VENDEDOR que
-- recebe o aviso. O nome do cliente que está procurando o carro não tinha onde
-- ser guardado — agora tem, e entra na mensagem.
ALTER TABLE public.alertas_clientes
    ADD COLUMN IF NOT EXISTS cliente_final TEXT;

COMMENT ON COLUMN public.alertas_clientes.nome_cliente IS
    'Quem RECEBE o aviso no WhatsApp (o vendedor).';
COMMENT ON COLUMN public.alertas_clientes.telefone_cliente IS
    'WhatsApp de quem recebe o aviso. Celular com 11 dígitos (DDD + 9).';
COMMENT ON COLUMN public.alertas_clientes.cliente_final IS
    'Nome do cliente que está procurando o carro. Só compõe a mensagem.';

-- 2. Auditoria de disparos ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alertas_disparos (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alerta_id         UUID REFERENCES public.alertas_clientes(id) ON DELETE CASCADE,
    veiculo_id        UUID,
    -- impressão digital do anúncio (marca|modelo|ano|km|preço): o mesmo carro é
    -- repostado várias vezes por dia nos grupos e não pode virar 5 avisos
    veiculo_digital   TEXT,
    veiculo_descricao TEXT,
    veiculo_ano       TEXT,
    veiculo_km        INTEGER,
    veiculo_preco     NUMERIC,
    destinatario      TEXT,
    telefone          TEXT,
    -- enviado | pendente | falhou | telefone_invalido | bloqueado_limite | duplicado | teste
    status            TEXT NOT NULL DEFAULT 'pendente',
    erro              TEXT,
    mensagem          TEXT,
    tentativas        SMALLINT NOT NULL DEFAULT 0,
    enviado_em        TIMESTAMPTZ,
    criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.alertas_disparos IS
    'Rastro de todo aviso de carro encontrado: o que bateu, pra quem foi, se chegou.';

CREATE INDEX IF NOT EXISTS idx_alertas_disparos_alerta   ON public.alertas_disparos(alerta_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_disparos_dedup    ON public.alertas_disparos(alerta_id, veiculo_digital, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_disparos_telefone ON public.alertas_disparos(telefone, status, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_disparos_fila     ON public.alertas_disparos(status, criado_em)
    WHERE status = 'pendente';

ALTER TABLE public.alertas_disparos ENABLE ROW LEVEL SECURITY;

-- Só a service_role (rotas de API) escreve/lê. O front consome via API.
DROP POLICY IF EXISTS alertas_disparos_service ON public.alertas_disparos;
CREATE POLICY alertas_disparos_service ON public.alertas_disparos
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Conserta celulares gravados com 10 dígitos ------------------------------
-- Celular no Brasil tem 9 dígitos depois do DDD desde 2013. Havia alerta ATIVO
-- com "(47) 9917-3286" — número que nenhum provider entrega.
UPDATE public.alertas_clientes
SET telefone_cliente = substring(regexp_replace(telefone_cliente, '\D', '', 'g'), 1, 2)
                    || '9'
                    || substring(regexp_replace(telefone_cliente, '\D', '', 'g'), 3, 8)
WHERE length(regexp_replace(telefone_cliente, '\D', '', 'g')) = 10
  AND substring(regexp_replace(telefone_cliente, '\D', '', 'g'), 3, 1) ~ '[6-9]';

-- 4. O 9 passa a ser colocado sozinho, em QUALQUER caminho de escrita --------
-- Não adianta validar só no formulário: n8n, importação e SQL na mão também
-- gravam aqui. O banco é a última fronteira — e ela conserta em vez de recusar.
CREATE OR REPLACE FUNCTION public.normalizar_telefone_alerta()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    d TEXT;
BEGIN
    IF NEW.telefone_cliente IS NULL OR NEW.telefone_cliente = '' THEN
        RETURN NEW;
    END IF;

    d := regexp_replace(NEW.telefone_cliente, '\D', '', 'g');

    -- Tira o DDI 55 quando veio grudado
    IF length(d) > 11 AND left(d, 2) = '55' THEN
        d := substring(d FROM 3);
    END IF;

    -- Tira o zero de operadora (047...)
    IF length(d) IN (11, 12) AND left(d, 1) = '0' THEN
        d := substring(d FROM 2);
    END IF;

    -- AQUI: celular antigo de 8 dígitos ganha o nono, sempre
    IF length(d) = 10 AND substring(d, 3, 1) ~ '[6-9]' THEN
        d := substring(d, 1, 2) || '9' || substring(d, 3, 8);
    END IF;

    NEW.telefone_cliente := d;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.normalizar_telefone_alerta() IS
    'Deixa todo telefone de alerta em 11 dígitos (DDD + 9). Roda antes do CHECK.';

DROP TRIGGER IF EXISTS trg_normalizar_telefone_alerta ON public.alertas_clientes;
CREATE TRIGGER trg_normalizar_telefone_alerta
    BEFORE INSERT OR UPDATE OF telefone_cliente ON public.alertas_clientes
    FOR EACH ROW
    EXECUTE FUNCTION public.normalizar_telefone_alerta();

-- 5. Trava de qualidade na entrada -------------------------------------------
-- Depois do conserto automático acima, o que não vira celular de 11 dígitos
-- é porque não era celular. Aí sim barra.
ALTER TABLE public.alertas_clientes
    DROP CONSTRAINT IF EXISTS alertas_clientes_telefone_valido;

ALTER TABLE public.alertas_clientes
    ADD CONSTRAINT alertas_clientes_telefone_valido
    CHECK (
        telefone_cliente IS NULL
        OR regexp_replace(telefone_cliente, '\D', '', 'g') ~ '^(55)?[1-9][1-9]9[0-9]{8}$'
    ) NOT VALID;
