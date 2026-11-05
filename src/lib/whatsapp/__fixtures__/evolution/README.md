# Fixtures da Evolution API

Webhooks no formato da Evolution API (Baileys), montados com a estrutura real
dos eventos e **sem dado pessoal**: telefones fictícios (`47 9888x-xxxx`), nomes
genéricos, `apikey` falsa e URLs `.invalid`.

| Arquivo | Caso |
|---|---|
| 01-texto | texto simples (`conversation`) |
| 02-imagem-legenda | imagem com legenda, `fileLength` em string |
| 03-audio-ptt | nota de voz (`audioMessage.ptt = true`), número Long do protobuf |
| 04-video | vídeo, JID sem o 9º dígito |
| 05-documento | PDF dentro de `documentWithCaptionMessage` |
| 06-figurinha | `stickerMessage` |
| 07-localizacao | `locationMessage` |
| 08-contato | `contactMessage` com vCard |
| 09-reacao | `reactionMessage` numa mensagem da Laura |
| 10-resposta-citada | `extendedTextMessage` com `contextInfo.stanzaId` |
| 11-editada | edição (`editedMessage` → `protocolMessage` `MESSAGE_EDIT`) |
| 12-apagada | apagada para todos (`protocolMessage` `REVOKE`) |
| 13-status-entregue | `messages.update` da v2, `DELIVERY_ACK` |
| 14-status-lido | `MESSAGES_UPDATE` da v1 em lista, status 4 |
| 15-laura-fromme | mensagem enviada pela Laura (`fromMe`, evento `send.message`) |
| 16-n8n-embrulhado | corpo repassado pelo nó Webhook do n8n (`{ headers, body }`) |
| 17-lid | remetente com JID `@lid` e telefone em `remoteJidAlt` |
| 18-grupo | mensagem de grupo (ignorada) |
| 19-apagada-evento-delete | evento `messages.delete` |

Testes: `npm run test:whatsapp`.
