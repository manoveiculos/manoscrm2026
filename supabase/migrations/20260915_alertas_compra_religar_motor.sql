-- ============================================================================
-- MOTOR DE ALERTAS DA CENTRAL DE COMPRAS — PARTE 2 (APLICAR SÓ DEPOIS DO DEPLOY)
--
-- A CAUSA RAIZ do silêncio: o trigger de `repassecentral` chamava
--     https://vyro.drivvoo.com/api/webhooks/processar-alerta?admin_key=...
-- que é um deploy ANTIGO, hospedado na Hostinger, rodando a versão velha do
-- matching (marca do alerta tinha que ser IGUAL à marca do carro). Alerta
-- "HILLUX" contra carro "TOYOTA Hilux CD SR" era descartado na primeira linha.
-- Resultado medido em produção: 123 chamadas em 6h, todas 200 OK, todas com
-- "matchesCount": 0. O motor novo, em manoscrm.com.br, nunca era chamado.
--
-- Esta migration aponta o trigger para o app de verdade, reaproveitando o
-- mesmo par base_url + cron_secret já usado (e comprovadamente funcionando)
-- pelos jobs do pg_cron. Sem domínio nem chave chumbados no código.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notificar_api_novo_repasse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
    v_base_url    TEXT;
    v_cron_secret TEXT;
    v_tem_alerta  BOOLEAN;
BEGIN
    -- 1. Oferta que o parser reprovou não vira aviso.
    IF NEW.oferta_valida IS FALSE THEN
        RETURN NEW;
    END IF;

    -- 2. Sem marca e sem modelo não há o que casar.
    IF COALESCE(NEW.marca, '') = '' AND COALESCE(NEW.modelo, '') = '' THEN
        RETURN NEW;
    END IF;

    -- 3. Entram ~600 carros por dia. Se ninguém está esperando nada, não
    --    gastamos uma requisição HTTP por carro.
    SELECT EXISTS (
        SELECT 1 FROM public.alertas_clientes
        WHERE ativo = TRUE AND nome_cliente NOT ILIKE '[EXCLUIDO]%'
    ) INTO v_tem_alerta;

    IF NOT v_tem_alerta THEN
        RETURN NEW;
    END IF;

    SELECT value INTO v_base_url    FROM public.cron_config WHERE key = 'base_url';
    SELECT value INTO v_cron_secret FROM public.cron_config WHERE key = 'cron_secret';

    IF v_base_url IS NULL OR v_cron_secret IS NULL THEN
        RAISE WARNING '[alertas] cron_config sem base_url ou cron_secret — aviso não disparado';
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url     := v_base_url || '/api/compras/webhooks/processar-alerta',
        body    := jsonb_build_object('record', to_jsonb(NEW)),
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_cron_secret
        ),
        timeout_milliseconds := 30000
    );

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.notificar_api_novo_repasse() IS
    'Avisa o vendedor quando entra um carro que bate com um alerta. Destino lido de cron_config.base_url.';

-- O trigger já existe e continua apontando para esta função:
--   trigger_notificar_api_repasse AFTER INSERT ON repassecentral FOR EACH ROW
-- Recriado aqui só por idempotência.
DROP TRIGGER IF EXISTS trigger_notificar_api_repasse ON public.repassecentral;
CREATE TRIGGER trigger_notificar_api_repasse
    AFTER INSERT ON public.repassecentral
    FOR EACH ROW
    EXECUTE FUNCTION public.notificar_api_novo_repasse();

-- ----------------------------------------------------------------------------
-- Fila anti-ban: quando dois carros do mesmo perfil entram em sequência, o
-- segundo aviso fica represado e este job solta um por número por minuto.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    PERFORM cron.unschedule('alertas-pendentes');
EXCEPTION WHEN OTHERS THEN
    NULL; -- ainda não existia
END $$;

SELECT cron.schedule(
    'alertas-pendentes',
    '* * * * *',
    $$ SELECT public.call_cron_endpoint('/api/cron/alertas-pendentes') $$
);
