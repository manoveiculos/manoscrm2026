# Fixtures de webhook da Evolution API (v2) — sem dado pessoal

Base para os testes do parser `lib/whatsapp/evolutionParser.ts` (Fase 2).

## De onde vieram

**Não são capturas do número da loja.** O webhook `api/webhook/whatsapp` não recebe nada desde 03/07/2026,
então não há evento real guardado no banco nem no repositório.

As fixtures foram montadas no formato que a Evolution API v2 entrega (envelope `event` / `instance` / `data` /
`date_time` / `sender` / `server_url` / `apikey`; mensagem no formato Baileys). Esse formato é o mesmo que os
parsers que já existem no CRM leem:

- `src/app/api/webhook/whatsapp/route.ts`: `data.key.remoteJid`, `fromMe`, `conversation`, `extendedTextMessage`, legendas;
- `src/app/api/billing/whatsapp-webhook/route.ts`: `imageMessage`, `audioMessage`, `videoMessage`, `documentMessage`, grupo `@g.us`;
- `src/lib/services/leadOrigin.ts`: `contextInfo.externalAdReply` (anúncio Click-to-WhatsApp).

**Na Fase 2, no 1º dia do modo sombra:** guardar 1 evento real de cada tipo, anonimizar (telefone para
`55479000000xx`, nome para "Cliente Teste", URLs e chaves de mídia para `FAKE`) e substituir a fixture equivalente.
Rodar `node tests/fixtures/evolution/verificar-sem-dado-pessoal.mjs` antes do commit.

## Dados fictícios usados

| Campo | Valor |
|---|---|
| Número da loja | `5547900000000` |
| Cliente | `5547900000001` · "Cliente Teste" |
| Contato do vCard | `5547900000099` · "Contato Teste" |
| Instância | `loja-teste` (o nome real ainda precisa ser confirmado pelo Alexandre) |
| Horário | 04/11/2026 a partir de 10:00 (BRT) · `messageTimestamp` 1793797200 + n min |
| Mídia | URLs, `mediaKey`, hashes e miniaturas falsos (não baixam nada) |

## Arquivos

| Arquivo | Evento | Tipo (`wa_mensagens.tipo`) | O que o parser precisa tirar | Confiança no formato |
|---|---|---|---|---|
| `01-texto.json` | `messages.upsert` | texto | `message.conversation` | alta |
| `02-texto-anuncio-ctwa.json` | `messages.upsert` | texto | `extendedTextMessage.text` + origem do anúncio em `contextInfo.externalAdReply` | alta |
| `03-imagem-legenda.json` | `messages.upsert` | imagem | `imageMessage` (mime, bytes, legenda); baixar por `getBase64FromMediaMessage` | alta |
| `04-audio-ptt.json` | `messages.upsert` | audio | `audioMessage.ptt = true`, `seconds`, `audio/ogg; codecs=opus` → transcrever na chegada | alta |
| `05-video.json` | `messages.upsert` | video | `videoMessage` (legenda, duração, 2,4 MB) | alta |
| `06-documento.json` | `messages.upsert` | documento | `documentMessage.fileName`, `pageCount` | alta |
| `06b-documento-com-legenda.json` | `messages.upsert` | documento | documento dentro de `documentWithCaptionMessage.message` | média |
| `07-figurinha.json` | `messages.upsert` | figurinha | `stickerMessage` (`image/webp`) | alta |
| `08-localizacao.json` | `messages.upsert` | localizacao | `degreesLatitude`, `degreesLongitude`, `name`, `address` | alta |
| `09-contato.json` | `messages.upsert` | contato | `contactMessage.vcard` | alta |
| `10-reacao.json` | `messages.upsert` | reacao | `reactionMessage.text` + `key.id` da mensagem reagida | alta |
| `11-resposta-citada.json` | `messages.upsert` | texto | `contextInfo.stanzaId` → `citada_message_id` (vem em `extendedTextMessage.contextInfo` e em `data.contextInfo`) | alta |
| `12-editada.json` | `messages.upsert` | (atualiza a original) | `protocolMessage.type = MESSAGE_EDIT` + `editedMessage` → `editada_em` | **a confirmar** (a versão da Evolution pode mandar `messages.edited` ou o `type` como número 14) |
| `13-apagada-revoke.json` | `messages.upsert` | (atualiza a original) | `protocolMessage.type = REVOKE` → `apagada_em` | **a confirmar** (o `type` pode vir como número 0) |
| `13b-apagada-messages-delete.json` | `messages.delete` | (atualiza a original) | `data.id` → `apagada_em` | média |
| `14-status-entregue.json` | `messages.update` | (status) | `keyId` + `status = DELIVERY_ACK` → `status_entrega = entregue` | alta |
| `15-status-lido.json` | `messages.update` | (status) | `status = READ` → `lida` | alta |
| `16-laura-send-message.json` | `send.message` | texto | `fromMe = true` enviado pela API (n8n) → `autor = laura` | média |
| `17-grupo-ignorar.json` | `messages.upsert` | — | `remoteJid` termina em `@g.us` → ignorar | alta |

## Pontos de atenção para a Fase 2

- Mensagem que o próprio celular da loja manda (`fromMe = true` em `messages.upsert`) é diferente da enviada pela API
  (`send.message`). As duas precisam virar `direcao = out`; o autor sai de quem enviou (Laura = n8n; vendedor = CRM).
- Com a opção "Webhook Base64" ligada na instância, a mídia vem em `data.message.base64`. Sem ela, o servidor baixa
  por `getBase64FromMediaMessage`. O parser deve aceitar os dois.
- `messageTimestamp` está em segundos (às vezes vem como string); `senderTimestampMs` e `timestampMs`, em milissegundos.
