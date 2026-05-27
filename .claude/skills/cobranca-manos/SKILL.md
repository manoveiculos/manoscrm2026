---
name: cobranca-manos
description: Skill especialista no módulo de Cobrança da Manos Veículos. Use quando o usuário pedir análise de inadimplência, ajustes na régua anti-ban, relatórios financeiros, acordos, escalada para jurídico, integração com Evolution (instância camila-cobranca), aba WhatsApp do cobrança, ou IA de classificação de conversas (promessa/negociação/recusa). Cobre tabelas billing_*, view v_billing_controle e fluxo webhook Evolution → billing_whatsapp_messages → ai-analyze.
metadata:
  author: manos
  version: "1.0.0"
---

# Cobrança Manos — Skill do Setor Financeiro

Módulo `/admin/cobranca` do CRM Next.js. Operado pela Camila (financeiro) sob gerência do Alexandre. **Foco: recuperar dinheiro sem queimar a marca nem o número do WhatsApp.**

Antes de mexer em qualquer coisa, **leia este arquivo inteiro**. O setor tem regras de negócio que não estão óbvias no código (ex.: jurídico só após 90 dias, instância separada do SDR por anti-ban).

## 0. Filosofia operacional

| Princípio | Tradução prática |
|---|---|
| **Anti-ban é lei** | Instância `camila-cobranca` é SEPARADA do SDR (Arthur/Karol). Nunca compartilhar token. Gap mínimo entre disparos: 3min. Janela permitida: 08:00–18:00. |
| **Cobrar é relação, não pressão** | Mensagens com tom firme + cordial. "Não vou pagar" ≠ "tô apertado mês que vem". A IA classifica isso (`ai_intent`) — confiar na classificação antes de escalar. |
| **Jurídico custa caro** | Só escalar quem tem 90+ dias E demonstrou recusa explícita OU 30+ dias sem resposta. Acordo sempre antes. |
| **Relatório com ação, não floreio** | Toda saída para o Alexandre/Camila deve dizer **o que fazer** por cliente, não só "X% de inadimplência". |
| **Localstorage é fallback, não fonte** | `records_cobrancamanos26` no Supabase é a fonte de verdade. Localstorage só pinga quando offline. |

## 1. Topologia de dados

### Tabela principal (legado)
`public.records_cobrancamanos26` — uma linha por parcela/cobrança em aberto.
- `id` TEXT (csv-xxx ou pre-xxx)
- `clienteFornecedor`, `cpfCnpj`, `telefone`, `veiculo`, `vencimento` (YYYY-MM-DD), `valor` NUMERIC
- `status`: `PAGO` | `PENDENTE` | `ATRASADO`
- `dataPagamento`, `observacoes`

⚠️ Sem FK pra cliente único. Mesmo CPF aparece em N linhas (uma por parcela).

### Tabelas novas (criadas em 2026-05-27, migration `20260527140000`)

| Tabela | Função | UID | Quando usar |
|---|---|---|---|
| `billing_whatsapp_messages` | inbox completa (in + out) com classificação IA | UUID | toda msg que chega pelo webhook `/api/billing/whatsapp-webhook` |
| `billing_acordos` | parcelamentos, descontos, promessas de pagamento | UUID | quando cliente aceita negociar |
| `billing_juridico_envios` | registro de envio para escritório/advogado | UUID | só após confirmar com Alexandre — operação cara/lenta |
| `billing_observacoes_gerais` | anotações livres do setor (não amarradas a record) | UUID | reuniões, decisões de política, alertas |
| `billing_ai_analysis` | cache da última análise IA por record | record_id (PK) | UPSERT a cada chamada de `/api/billing/ai-analyze` |

### View consolidada
`v_billing_controle` — junta tudo, calcula `dias_atraso` e `faixa_atraso` (`EM_DIA` / `1_30` / `31_60` / `61_90` / `PLUS_90`). Use para queries de relatório — evita JOIN manual.

## 2. WhatsApp — fluxo end-to-end

### Recepção (inbound)
```
WhatsApp cliente
  ↓
Evolution Manager · instância "camila-cobranca"
  ↓ webhook POST
https://manoscrm.com.br/api/billing/whatsapp-webhook
  ↓ filtro fromMe/group/instance
  ↓ tenta amarrar telefone ↔ records_cobrancamanos26.telefone
  ↓ insert
billing_whatsapp_messages (direction=INBOUND, ai_intent=null)
```

⚠️ **Não confundir com** `/api/webhook/whatsapp` que é do SDR. Os dois webhooks coexistem; cada Evolution instância aponta pra sua rota.

### Envio (outbound)
- API manual: `POST /api/billing/whatsapp-messages` body `{ telefone, message, recordId, cpfCnpj }`
- Service: `src/lib/services/cobrancaWhatsappSender.ts` (Evolution `/message/sendText/{instance}`)
- Usa envs `EVOLUTION_COBRANCA_BASE_URL`, `_INSTANCE_NAME`, `_INSTANCE_TOKEN`
- Dedup: bloqueia mesma mensagem pro mesmo número em <10min
- Toda mensagem outbound também grava em `billing_whatsapp_messages` (direction=OUTBOUND) → aparece no inbox

### Régua programada (preexistente)
- `n8n` consome `/api/billing/queue/*` (toggle, force-dispatch, set-delay, set-hours)
- Lote: `BatchFilterModal` → `/api/billing/batch-scheduler` enfileira contatos elegíveis
- Status em `/api/billing/queue-status` (polling 2s)
- Estágios: `1_DIA_ANTES`, `NO_DIA`, `JUROS_VENCIDOS` (vide `BatchFilterModal.tsx`)

## 3. IA de análise — `/api/billing/ai-analyze`

Modelo: **Claude Sonnet 4.6** com prompt caching no system block.

Entrada: `recordId`. Lê o record + últimas 50 msgs + acordos.

Saída JSON cacheada em `billing_ai_analysis`:
```json
{
  "classification": "PROMESSA_PAGAMENTO|NEGOCIACAO_ABERTA|RECUSA|SEM_CONTATO|CANDIDATO_JURIDICO|PERDIDO|RECUPERAVEL",
  "risk_score": 0-100,
  "next_action": "Reenviar boleto e pedir confirmação até quinta",
  "next_action_at": "2026-05-30",
  "summary": "Cliente prometeu pagar dia 28, sem resposta há 3 dias."
}
```

### Regras de classificação (já no system prompt, NÃO duplique no código)
- "tô sem grana", "to apertado", "mês que vem" → **NEGOCIACAO_ABERTA**
- "pago dia X", "deposita hoje" → **PROMESSA_PAGAMENTO**
- "não vou pagar", "não devo nada" → **RECUSA**
- Sem resposta +14 dias com 90+ dias atraso → **CANDIDATO_JURIDICO**
- Sem qualquer contato → **SEM_CONTATO**

### Quando chamar
- On-demand: botão "Análise IA" no `WhatsAppInbox.tsx`
- Sugestão (não implementado ainda): rodar em batch noturno para todos os records com `status='ATRASADO'` e msgs novas desde a última análise

## 4. Aba Controle — relatórios

Componente: `src/app/admin/cobranca/components/ControlePanel.tsx`

Inclui:
- 4 KPIs (taxa recuperação, taxa inadimplência, devedores únicos, candidatos jurídico)
- 4 gráficos recharts (pizza status, aging bar, evolução mensal area, top 10 devedores bar)
- Tabela imprimível "Candidatos Jurídico" (atraso >90 dias)
- Posição financeira consolidada (8 caixas: total, recebido, aberto, atrasado, 4 faixas de aging)
- Botão **Gerar Relatório** que ativa `@media print` e abre o diálogo de impressão (PDF nativo via browser)

⚠️ Cálculo de `diasAtraso` usa `todayStr` hard-coded `2026-05-27` por enquanto. **Quando passar de junho, trocar para `new Date().toISOString().slice(0,10)`** (ou criar prop dinâmico).

## 5. Pontos de atenção / armadilhas

- **`records_cobrancamanos26` pode não existir remotamente**: o setor de cobrança rodou meses só em localStorage. Antes de criar FKs novas, confirmar que a migration `20260527130000_create_billing_tables.sql` foi aplicada (`mcp__supabase__list_tables` → procurar pela tabela).
- **Telefone vem com lixo**: `telefone` na records pode ter múltiplos números separados por espaço (`47988189895 47999166668`). O webhook usa `ILIKE %numero%` pra casar — não use `=` exato.
- **Webhook é idempotente por `evolution_msg_id`**: Evolution reentrega às vezes. Confiar no UNIQUE constraint.
- **`billing_acordos` ainda não tem UI**: a tabela existe mas falta CRUD na página. Próxima evolução natural.
- **`billing_juridico_envios` ainda não tem UI**: idem. Por enquanto, a aba Controle só LISTA candidatos.

## 6. Comandos úteis (Supabase MCP)

```sql
-- Quantos clientes com 90+ dias de atraso (candidatos jurídico)
SELECT count(*), sum(valor)
FROM v_billing_controle
WHERE faixa_atraso = 'PLUS_90';

-- Top devedores
SELECT cliente, sum(valor) as total
FROM v_billing_controle
WHERE status != 'PAGO'
GROUP BY cliente
ORDER BY total DESC
LIMIT 20;

-- Conversas sem resposta há mais de 3 dias
SELECT telefone, max(created_at) as ultima_msg
FROM billing_whatsapp_messages
WHERE direction = 'INBOUND'
GROUP BY telefone
HAVING max(created_at) < NOW() - INTERVAL '3 days';
```

## 7. Quando estender este módulo

1. **Antes de criar tabela nova**: confere se cabe num campo JSONB de `records_cobrancamanos26.observacoes` ou se vira mesmo entidade própria.
2. **Antes de mexer no Evolution**: lembrar que a instância de cobrança é separada do SDR. Não unificar — anti-ban.
3. **Antes de mandar disparo em massa**: simular com 1 cliente. Janela 08:00–18:00 é sagrada (lei brasileira de cobrança + bom senso).
4. **Antes de escalar pra jurídico**: rodar a IA de análise. Se `classification != 'RECUSA'` e `risk_score < 70`, dar mais uma chance de acordo.

## 8. Variáveis de ambiente

```env
# Cobrança (instância separada, anti-ban)
EVOLUTION_COBRANCA_BASE_URL=https://...
EVOLUTION_COBRANCA_INSTANCE_NAME=camila-cobranca
EVOLUTION_COBRANCA_INSTANCE_TOKEN=...

# IA (compartilhado com resto do CRM)
API_CLAUDE=...
```
