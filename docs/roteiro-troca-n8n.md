# Roteiro da troca — Laura atendendo só pelo CRM (dia D)

Growth 360 · preparado em 11/11/2026 para executar em **12/11/2026**. Quem participa: **Alexandre** (n8n, Hostinger,
Evolution, aprova) e o **Claude** (confere o banco e o site, monta cada passo). Plano geral: `docs/laura-sem-n8n.md`.

## Decisão de desenho: troca em DUAS etapas (recomendada)

| | Etapa 1 — **dia D** | Etapa 2 — depois (quando o item 7 estiver pronto) |
|---|---|---|
| Webhook da Evolution | **não muda** (continua apontando para o n8n, que já repassa ao CRM) | passa a apontar direto para o CRM (`/api/wa/ingest?s=…`) |
| Laura que responde | **CRM** (a do n8n é desligada) | CRM |
| O que o n8n continua fazendo | recebe o webhook, repassa ao CRM e roda os outros fluxos que dependem dele | sai do caminho |
| Risco | baixo: se algo falhar, religa a Laura no n8n em 1 minuto | médio |

**Por quê:** a Evolution só aceita **uma** URL de webhook. Se a URL for trocada para o CRM no dia D, tudo o que ainda
depende do n8n para receber mensagem (rotinas de ficha, "cliente que voltou", resumo do Painel 48h etc.) para de receber.
Na etapa 1 só a **resposta** muda de dono; a entrada de mensagens segue como está e já provada (n8n → CRM).

## Antes do dia D (hoje, 11/11)

- [ ] **Saldo da Anthropic** com folga (cada conversa custa ~US$ 0,04).
- [ ] **Prontidão → grupo Base todo ✓** (já está) e **Número da loja: open**.
- [ ] **Teste do nome:** mandar "Olá" / "Sou o [nome]" / "Quero o Compass 2019" de um número que não seja de vendedor; o Claude confere no banco.
- [ ] **Escolher a hora.** Sugestão: **19h30**, com a loja fechada (poucos clientes, ninguém atendendo pelo celular).
- [ ] **Exportar o fluxo da Laura do n8n em JSON** e guardar (é o seu backup e me mostra quais nós respondem).
- [ ] **Localizar no fluxo do n8n** o(s) nó(s) que **enviam resposta ao cliente** (agente de IA e envio pela Evolution) e **o nó HTTP que repassa ao CRM**. Anotar o nome de cada um.
- [ ] **Avisar o time** (consultores): "amanhã à noite a Laura passa a responder pelo CRM; se o cliente pedir uma pessoa, a conversa vira atendimento humano".
- [ ] Decidir os dois pontos abertos (ver "Decisões pendentes").

## Roteiro minuto a minuto (hora = H, sugestão 19h30)

**H−15 — Pré-voo (Claude)**
1. Banco: erros de webhook nos últimos 30 min = 0; última mensagem gravada < 15 min; sem rodada `rodando` presa.
2. Anotar o estado de hoje: nº de conversas, mensagens e leads (para comparar depois).
3. Confirmar com o Alexandre que o JSON do fluxo foi exportado.

**H+0 — Variáveis na Hostinger (Alexandre)** — todas juntas, depois **redeploy**:
```
WA_CRIAR_LEAD=true
WA_ENVIO_PELO_CRM=true
NEXT_PUBLIC_WA_ENVIO=true
WA_IA_ENVIO_LIBERADO=true
```
**NÃO criar `WA_SEM_N8N` na etapa 1.** Motivo: com o webhook ainda no n8n, ela confundiria a Laura do n8n com "celular da loja"
(a conversa viraria humana). Ela só entra na etapa 2, junto com a troca da URL.
(`NEXT_PUBLIC_…` exige o redeploy completo: ~4 minutos.)

**H+6 — Conferir (Claude + Alexandre)**
1. Site de pé: `/login` e `/api/health` = 200.
2. **Prontidão** (Conferir de novo): `CRM cria o lead`, `Envio pelo CRM`, `Caixa de resposta` e `Laura autorizada a ENVIAR` ✓.
   (`Mensagem do celular = humano assumiu` continua ✗ de propósito na etapa 1.)

**H+10 — Desligar a Laura do n8n (Alexandre)** — **não desative o workflow inteiro**: ele também repassa as mensagens ao CRM.
1. Desconectar/desativar **só o nó do agente de IA e o de envio da resposta**.
2. **Manter ativo** o nó HTTP que chama `/api/wa/ingest`.
3. Salvar. Avisar: "Laura do n8n desligada".

**H+12 — Ligar o envio no CRM (Alexandre)**
1. manoscrm.com.br → Conversas → barra Laura do CRM → **Ligar envio ao cliente** (confirmar).
2. O selo muda de ENSAIO para **ENVIANDO**.

**H+15 — Teste real (Alexandre, com um número que não seja de vendedor)**
1. "Olá" → deve chegar **uma** resposta só, com pausa de digitação, vinda do CRM.
2. "Quero o Compass 2019" → informa preço e km exatos; oferece fotos.
3. "Me manda foto" → chegam fotos.
4. "Pode ser amanhã às 10h" → visita confirmada e o consultor avisado.
5. No CRM: a conversa aparece como **Laura**; o lead foi criado/ligado; o consultor recebeu o aviso; o nome foi para o lead.
6. Conferir que **não** chegou resposta dupla (a do n8n e a do CRM).

**H+30 → H+90 — Acompanhamento (Claude, a cada ~10 min)**
- rodadas `ok` x `erro`; mensagens com `enviada = true`; tempo de resposta; erros de webhook;
- conversas novas: lead criado? consultor avisado? alguma em "humano" indevidamente?
- custo por conversa e saldo da Anthropic.

## Critérios de PARAR e voltar (qualquer um basta)
- **Resposta dupla** ao cliente (n8n e CRM).
- **Duas ou mais falhas de envio** seguidas (`envio falhou`).
- Laura **calada** por mais de 5 minutos numa conversa nova (com a IA ligada e a conversa em "ia").
- Mensagem com **preço ou condição errada** enviada ao cliente.
- Site fora (5xx) por mais de 5 minutos.

## Plano de volta (menos de 2 minutos)
1. CRM → Laura do CRM → **Desligar** (ou `WA_IA_ATIVA=false`).
2. n8n → reconectar/ativar de volta o agente de IA e o envio da Laura.
3. (Opcional) Hostinger: `WA_IA_ENVIO_LIBERADO=false`.
O CRM continua gravando tudo; nada é apagado. Conversas que ficaram sem resposta durante a troca: o consultor assume pela tela Conversas.

## O que NÃO está pronto (saiba antes de trocar)
- **Aviso no celular se a Laura passar de 5 min sem responder**: não foi construído. No dia D o Claude acompanha o banco; depois entra como melhoria.
- **Leituras que dependem da memória do n8n** (`concessionaria_mensagens`): com a Laura do n8n desligada, **param de receber mensagens novas**:
  o resumo por IA do **Painel 48h**, a **rotina horária da ficha** do squad Recepção, o job **"cliente que voltou"** e a linha do tempo
  (`unified_whatsapp_messages`). Até o item 7 (trocar essas leituras para `wa_conversas`/`wa_mensagens`) elas ficam **desatualizadas**.
  Se isso for crítico, **adie a troca** até o item 7.
- **Fila de "quero vender meu carro"**: hoje só fica registrada (`webhook_errors`, origem `wa_triagem`); nenhum consultor é avisado.
- **Tela do selo "nome identificado pelo CRM"** (editar/desfazer): o nome já é corrigido, mas o selo ainda não aparece.
- **Instagram, formulários e cobrança** continuam no n8n.

## Decisões pendentes (responder antes do dia D)
1. **Aceita** as leituras do Painel 48h / ficha horária / "cliente que voltou" ficarem desatualizadas por alguns dias, ou **adia** a troca?
2. **"Quero vender meu carro":** o que fazer? (a) só registrar; (b) criar na tabela de compra e avisar um consultor; (c) outro.
3. **Hora da troca:** 19h30 de 12/11 está bom?

## Depois do dia D
- **24 h:** relatório (respostas, tempo, custo, erros, leads criados, nomes corrigidos).
- **Etapa 2:** item 7 + `WA_SEM_N8N=true` + URL do webhook da Evolution direto para o CRM (passo a passo em `docs/laura-sem-n8n.md`).
- Limpeza dos leads antigos (nomes e carros), com o "aprovado" próprio.
