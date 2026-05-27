-- =====================================================================
-- SCRIPT: Corrigir Duplicatas + Prevenir Futuras Duplicatas
-- Tabela: registro_envios_whatsapp
-- =====================================================================

-- PASSO 1: Remover duplicatas mantendo apenas o registro com menor ID
-- (preserva o primeiro envio registrado, remove os repetidos)
DELETE FROM registro_envios_whatsapp
WHERE id NOT IN (
  SELECT MIN(id)
  FROM registro_envios_whatsapp
  GROUP BY destinatario_id, vencimento, estagio_cobranca
);

-- PASSO 2: Verificar resultado após limpeza
SELECT 
  id,
  destinatario_id,
  cliente_nome,
  vencimento,
  estagio_cobranca,
  data_hora_brasil
FROM registro_envios_whatsapp
ORDER BY data_hora_brasil DESC;

-- PASSO 3: Criar UNIQUE CONSTRAINT para bloquear duplicatas futuras
-- (combinação: destinatario_id + vencimento + estagio_cobranca deve ser única)
ALTER TABLE registro_envios_whatsapp
ADD CONSTRAINT uq_envio_whatsapp_destinatario_vencimento_estagio
UNIQUE (destinatario_id, vencimento, estagio_cobranca);
