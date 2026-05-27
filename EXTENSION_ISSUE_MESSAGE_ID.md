# Issue — Extensão Chrome WhatsApp Web Sync

**Data:** 2026-05-27
**Severidade:** Média (mitigado server-side; correção ideal é na fonte)
**Status:** Aberto — aguarda correção na extensão

## Sintoma observado em produção

Em 27/05/2026, durante o sprint V3.80, a auditoria do banco mostrou que **44 mensagens sincronizadas em 1h vieram com `message_id = NULL`** na tabela `whatsapp_messages`, e **22 dessas eram pares duplicados exatos** (mesmo texto, direção e timestamp).

Exemplo (recorte real):

| texto | direção | created_at | message_id |
|---|---|---|---|
| `+2` | inbound | 12:09:51.648 | null |
| `+2` | inbound | 12:09:51.648 | null |
| `4 portas` | inbound | 12:09:51.648 | null |
| `4 portas` | inbound | 12:09:51.648 | null |

## Causa raiz

O endpoint `/api/extension/sync-messages` espera receber no payload:

```json
{
  "messages": [
    { "id": "wa-msg-3EB0xxxx", "text": "...", "direction": "inbound", "timestamp": "2026-05-27T12:09:51.648Z" },
    ...
  ]
}
```

Os campos críticos são `id` (ou `messageId`) e `timestamp`. A extensão Chrome **não está enviando nenhum dos dois** — o que causa:

1. `message_id` NULL no DB → dedup via ID falha
2. `created_at` vira `new Date()` no servidor (fallback) → todas as msgs do batch ficam com timestamp idêntico
3. Quando o batch já contém duplicatas (sintoma observado), nada no servidor consegue distinguir as cópias

## Mitigação aplicada no servidor (V3.80.1)

Em `src/app/api/extension/sync-messages/route.ts`:

- **Dedup intra-batch** antes do insert, usando `(texto_normalizado, direção, minuto)` como chave
- **`sync_key` polimórfica obrigatória** com fallback hash quando `messageId` ausente
- **Upsert com `onConflict: sync_key, ignoreDuplicates: true`** — retries do mesmo batch viram no-op

Trade-off da mitigação: duas mensagens **legítimas** com texto e direção idênticos no mesmo minuto são tratadas como duplicata (raríssimo no WhatsApp). O fix real ainda é na fonte.

## O que a extensão precisa fazer

Quando coletar mensagens do DOM do WhatsApp Web, preencher o payload com:

```javascript
{
  id: msgElement.getAttribute('data-id') || msgElement.querySelector('[data-id]')?.dataset.id,
  text: extractText(msgElement),
  direction: isOutbound(msgElement) ? 'outbound' : 'inbound',
  timestamp: extractTimestamp(msgElement) || new Date().toISOString(),
}
```

O `data-id` (ou equivalente `_serialized`) é o identificador único da mensagem no WhatsApp e está disponível no DOM em `[data-id]` ou via `Store.Msg.get(...)` (se usar o WhatsApp Store API).

Sem `id`, o servidor cai no fallback hash — funciona, mas é menos preciso.

## Como validar a correção quando vier

Rodar no SQL Editor do Supabase:

```sql
SELECT
    COUNT(*) FILTER (WHERE message_id IS NOT NULL) AS com_id,
    COUNT(*) FILTER (WHERE message_id IS NULL)     AS sem_id,
    COUNT(*)                                       AS total
FROM whatsapp_messages
WHERE created_at > NOW() - INTERVAL '1 hour';
```

Esperado depois do fix na extensão: `com_id ≈ total` (proporção legacy do Evolution continua existindo, mas a maioria vinda da extensão terá `message_id`).
