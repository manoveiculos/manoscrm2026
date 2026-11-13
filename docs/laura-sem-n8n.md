# Laura atendendo só pelo CRM (sem o n8n) — passo a passo da troca

Growth 360 · 11/11/2026. Decisão do Alexandre: o n8n sai do atendimento da Laura; o CRM faz tudo na conversa.
**Nada daqui liga sozinho:** cada chave abaixo nasce desligada e a troca só acontece com o "aprovado" dele.

## O que o CRM já faz (código pronto)
| Função | Onde | Chave que liga |
|---|---|---|
| Receber o webhook direto da Evolution | `POST /api/wa/ingest?s=<segredo>` | `WA_INGEST_ATIVO=true` (já ligada) |
| Criar o lead na 1ª mensagem e a roleta distribuir (avisa consultor por WhatsApp e push) | `src/lib/whatsapp/criarLead.ts` | `WA_CRIAR_LEAD=true` |
| Origem do anúncio (`ctwa_clid`, ID do anúncio) | mesmo arquivo, `registrarOrigemDoPayload` | `WA_CRIAR_LEAD=true` |
| Cliente que volta sobe o lead parado (sem reabrir venda) | idem | `WA_CRIAR_LEAD=true` |
| Fornecedor, vaga e "quero vender meu carro" não viram lead de venda | idem (registro em `webhook_errors`, origem `wa_triagem`) | `WA_CRIAR_LEAD=true` |
| Vendedor responde pela tela Conversas (texto, imagem, áudio) no número da loja | `POST /api/wa/conversas/:id/enviar` | `WA_ENVIO_PELO_CRM=true` e `NEXT_PUBLIC_WA_ENVIO=true` (e rebuild) |
| Botões Assumir / Devolver para a IA | `POST /api/wa/conversas/:id/atendimento` | — |
| "Humano assumiu": mensagem do celular da loja que o CRM não mandou põe a conversa em humano | ingestão | `WA_SEM_N8N=true` |
| Laura responde (pausa de digitação, trava por conversa, interruptor geral) | `src/lib/whatsapp/ia/motor.ts` | `WA_IA_ATIVA=true` + modo "envia" + `WA_IA_ENVIO_LIBERADO=true` |
| IA falhou: mensagem "Já te respondo 😉" (1 a cada 30 min) e alerta ao consultor | `motor.ts` | modo "envia" |

## Antes do dia da troca (o Alexandre)
1. Recarregar o saldo da Anthropic (sem ele a Laura não gera nem rascunho: o ensaio ficou parado de 06/11 a 10/11).
2. Rodar o ensaio por alguns dias e comparar as respostas (aba "Ensaio da Laura").
3. Exportar o fluxo da Laura do n8n em JSON (para conferir que nenhuma função ficou para trás).

## Dia da troca (fora do horário comercial, com o "aprovado")
1. **Hostinger — variáveis** (todas de uma vez, depois reiniciar):
   - `WA_CRIAR_LEAD=true`
   - `WA_SEM_N8N=true`
   - `WA_ENVIO_PELO_CRM=true` e `NEXT_PUBLIC_WA_ENVIO=true` (esta exige novo deploy/build)
   - `WA_IA_ATIVA=true` (já) e `WA_IA_ENVIO_LIBERADO=true`
2. **CRM → Conversas (admin):** botão "Laura do CRM" em **Envia**. (O botão atual só oferece Ensaio/Desligar; o modo "envia" é gravado na tabela `wa_ia_config` depois do "aprovado".)
3. **Evolution Manager → instância `teste` → Events → Webhook:**
   - URL: `https://manoscrm.com.br/api/wa/ingest?s=<WHATSAPP_INGEST_SECRET>`
     (a tela da Evolution não tem campo de cabeçalho, por isso o segredo vai na URL; ele já existe na Hostinger; **não** cole em chat nem em print)
   - **Enabled** ligado; **Webhook by Events** desligado; **Webhook Base64** desligado.
   - Eventos marcados: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE` (os demais podem ficar desmarcados).
   - Guardar a URL antiga do n8n (`https://n8n.drivvoo.com/webhook/manosoficial`) para o plano de volta.
4. **n8n:** desligar o fluxo da Laura (e o nó que chamava `/api/wa/ingest`, que deixa de ser usado).
5. **Conferir por 15 minutos** (mande uma mensagem de um número que não seja de vendedor):
   - a mensagem aparece em Conversas; um lead novo foi criado e distribuído; o consultor recebeu o aviso;
   - a Laura respondeu pelo CRM (com pausa de digitação) e a resposta aparece como "Laura";
   - mensagem digitada no celular da loja põe a conversa em "Atendimento humano" e a Laura para.

## Plano de volta (segundos)
1. Evolution: voltar a URL do webhook para `https://n8n.drivvoo.com/webhook/manosoficial`.
2. n8n: religar o fluxo da Laura.
3. CRM: botão "Laura do CRM" em **Desligar** (ou `WA_IA_ATIVA=false`) e `WA_SEM_N8N=false`.
Nada é apagado: o CRM só deixa de receber e de responder.

## Fora desta troca (continuam no n8n por enquanto)
Instagram (Recepção 24h), formulários do Google e do site, cobrança (Camila), Arthur e Karol.

## Atenção
- O segredo na URL aparece em logs do servidor da Evolution. Trocar `WHATSAPP_INGEST_SECRET` na Hostinger e na URL se ele vazar.
- Com `WA_SEM_N8N=true` e o webhook ainda no n8n, mensagens da Laura do n8n seriam tratadas como "celular da loja" e a conversa viraria humana. **Só ligue as duas coisas juntas, no dia da troca.**

## Lista de variáveis para a Hostinger (copiar e colar)

Painel da Hostinger → o site do CRM → Variáveis de ambiente. Depois de salvar, reiniciar/refazer o deploy.
A tela **Conversas → Laura do CRM → Prontidão** (só admin) mostra o que ainda falta, sem mostrar valores.

**Base (precisa existir para o ensaio e para o envio):**
```
WA_INGEST_ATIVO=true
WHATSAPP_INGEST_SECRET=<valor longo e aleatório; o mesmo que vai na URL da Evolution>
WA_LOJA_INSTANCIA=teste
WA_LOJA_TOKEN=<apikey da instância teste>
EVOLUTION_BASE_URL=https://evolution.drivvoo.com
API_CLAUDE=<chave de console.anthropic.com>
WA_IA_ATIVA=true
```
(Já existiam na Hostinger desde 05/11: as quatro primeiras e a do Claude. Conferir `EVOLUTION_BASE_URL`: o manager aparece em `evolution.drivvoo.com`.)

**Nome e carro corrigidos sozinhos (migration já aplicada):**
```
WA_IDENTIFICACAO=on
```

**Só no dia da troca do n8n, com o "aprovado" (todas juntas):**
```
WA_CRIAR_LEAD=true
WA_SEM_N8N=true
WA_ENVIO_PELO_CRM=true
NEXT_PUBLIC_WA_ENVIO=true
WA_IA_ENVIO_LIBERADO=true
```
Depois: **Laura do CRM → Ligar envio ao cliente** (botão do admin, pede confirmação), trocar a URL do webhook na Evolution
e desligar a Laura no n8n (passo a passo acima).

**Opcional:** `WA_IA_LIMITE_DIA=300` (teto de respostas por dia).
