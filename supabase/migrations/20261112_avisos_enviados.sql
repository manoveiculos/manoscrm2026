-- ===========================================================================
-- HISTÓRICO DE AVISOS E COBRANÇAS ENVIADOS AOS CONSULTORES
-- Data: 2026-11-11   Status: ESCRITA, NÃO APLICADA (só com o "aprovado" do Alexandre)
--
-- Pedido do Alexandre (11/11/2026): todo aviso e cobrança que o CRM manda aos consultores
-- pelo webhook (chamadavendedorcrm) fica registrado, para o admin ver tudo numa tela
-- (/admin/avisos) e usar nas reuniões semanais.
--
-- Uma linha por aviso: quem recebeu, que tipo (lead novo, cobrança, cliente pediu humano,
-- resumo do dia...), o texto exato, se o webhook aceitou ou falhou, e o lead/conversa ligados.
-- Os registros NÃO são apagados (histórico de reunião): só crescem. Estimativa: poucas
-- centenas de linhas por mês.
--
-- Acesso: só o servidor (service_role) lê e escreve; a tela do admin passa pela API, que
-- confere o perfil. RLS ligada e sem política = nenhum acesso direto.
-- Risco: baixo. Só objeto novo.
--
-- REVERSÃO:  drop table if exists public.avisos_enviados;
-- ===========================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.avisos_enviados (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em      timestamptz NOT NULL DEFAULT now(),
    tipo           text NOT NULL,
    consultor_id   uuid REFERENCES public.consultants_manos_crm(id) ON DELETE SET NULL,
    consultor_nome text NOT NULL,
    telefone       text,
    mensagem       text NOT NULL,
    status         text NOT NULL CHECK (status IN ('enviado', 'falhou')),
    erro           text,
    lead_ref       text,
    conversa_id    uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL,
    origem         text,
    meta           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_avisos_enviados_criado ON public.avisos_enviados (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_avisos_enviados_consultor ON public.avisos_enviados (consultor_nome, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_avisos_enviados_tipo ON public.avisos_enviados (tipo, criado_em DESC);

ALTER TABLE public.avisos_enviados ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.avisos_enviados IS 'Avisos e cobranças enviados aos consultores pelo webhook do n8n. Só o servidor lê/escreve; tela em /admin/avisos.';
