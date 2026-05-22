---
name: manos-crm
description: Skill especialista no CRM da Manos Veículos. Use quando o usuário pedir auditoria de leads, ajustar fluxos da IA (Arthur SDR / Karol Reversão), mexer em filas, kanban de atendimento, cobranças de SLA, dashboards de venda ou qualquer evolução do CRM. Cobre 3 tabelas de leads, fila ai_sdr_queue, views unificadas, throttle anti-ban, detecção de intenção e tudo entre webhook Evolution → vendedor.
metadata:
  author: manos
  version: "1.0.0"
---

# Manos CRM — Skill do Motor de Vendas

CRM Next.js (App Router) + Supabase + Evolution API + OpenAI. Operado por 3 consultores (Wilson, Sergio, Victor) sob gerência Alexandre. **Foco: leads viram venda — todo o resto é meio.**

Antes de mexer em qualquer coisa, **leia este arquivo inteiro** — a topologia tem armadilhas que parecem bug mas são lógica de negócio.

## 0. Filosofia operacional

| Princípio | Tradução prática |
|---|---|
| **Não floode WhatsApp** | Toda IA tem que respeitar throttle de ≥60s/msg. Ban quebra a operação inteira. |
| **Não seja agressivo** | IA NUNCA insiste se cliente disse "já comprei". Roda `detectClosingIntent` antes de cada disparo. |
| **Cobre vendedor, não inunde** | Notificações `level≥2` só pra reversão real, lead quente ou intent crítico. Resto é badge silencioso. |
| **Lead bom é lead respondido** | KPI principal: speed-to-lead. Cada minuto sem resposta = -X% conversão. |
| **Defesa em profundidade** | Mesmo guard em 2 lugares (webhook + cron) pra cobrir falhas de timing. |

## 1. Topologia de dados

### Tabelas de lead (3, sim, três)
Histórico: foram crescendo organicamente, hoje convivem.

| Tabela | UID | Origem | Campo telefone | Campo nome |
|---|---|---|---|---|
| `leads_distribuicao_crm_26` | bigint `id` | Webhook WhatsApp + Meta Ads | `telefone` | `nome` |
| `leads_manos_crm` | UUID `id` | Pipeline V2 (legado em uso) | `phone` | `name` |
| `leads_compra` | UUID `id` | Fluxo de compra de carros usados | `telefone` | `nome` |

**Tudo no app lê via view unificada** — não toque na tabela direto, exceto na escrita (update/insert).

### Views centrais
```
unified_whatsapp_messages   → 1 lugar pra histórico de chat (Arthur+Karol+Vendedor)
leads_unified               → 3 tabelas em uma. UID = "<table>:<id>".
leads_unified_active        → leads_unified MINUS status ['vendido','perdido','lost','lost_by_inactivity','comprado','finalizado']
lead_kpis_daily             → KPIs últimos 30d (leads, contatados<5min, vendidos, conversão %)
```

A view `leads_unified` aplica `mask_phone_for_pesca(phone, assigned_consultant_id)` → telefone é mascarado (`4799****12`) quando `assigned_consultant_id IS NULL`. Após o vendedor clicar "Iniciar Atendimento" o `assigned_consultant_id` é setado e a view passa a entregar o número real. **Não tente ler `phone` da view e cruzar com WhatsApp sem antes verificar se contém `*`.**

### Fluxo de UID
Frontend usa `parseUid("leads_manos_crm:abc-123")` → `{table, nativeId}`. Para queries cruzadas use o lookup por telefone (suffix 8 dígitos) nas 3 tabelas:

```ts
const phoneSuffix = phone.replace(/\D/g,'').slice(-8);
const [a, b, c] = await Promise.all([
  sb.from('leads_distribuicao_crm_26').select('id').ilike('telefone', `%${phoneSuffix}%`),
  sb.from('leads_manos_crm').select('id').ilike('phone', `%${phoneSuffix}%`),
  sb.from('leads_compra').select('id').ilike('telefone', `%${phoneSuffix}%`),
]);
```

## 2. Fluxos de IA

### Arthur (IA SDR) — primeiro contato
- Worker: `src/app/api/cron/ai-sdr-runner/route.ts`
- Fonte: tabela `ai_sdr_queue`
- Frequência: EasyCron 1min
- Limite: **1 job/execução** (claim atômico via `claim_ai_sdr_jobs(p_limit=1)`)
- Hoje **desativado** para contato inicial: a trigger `trg_enqueue_ai_sdr` foi dropada na V3.7. Quem ainda enfileira: só `enqueue_reversal_agent` (BEFORE UPDATE OF status → 'perdido'/'arquivado'/'lost'/'lost_by_inactivity').

### Karol (IA Reversão) — recuperar perdidos
- Worker: `src/app/api/cron/followup-ai/route.ts`
- Fonte: **query direta** nas 3 tabelas (`fetchEligibleLeads`) — não usa a fila
- Frequência: 1×/dia via `daily-batch` (07:00 UTC) **+** EasyCron externo (se configurado)
- Janela operacional: 08:00–20:00 (do `system_settings.ai_config.value.{start_hour, end_hour}`)
- Anti-ban: **MAX_PER_RUN=1** + `sleep(60s)` entre envios. Configurável via env `REVERSAO_MAX_PER_RUN` e `REVERSAO_SEND_GAP_MS`.
- Estratégias por motivo de perda:
  - `preco`/`parcela` → `cheaper` (carro 30% mais barato no estoque Altimus)
  - `modelo` → `newer` (lançamento recente)
  - `concorrente` → `reinforce_value` (não menciona carro, reforça diferencial)
  - sumiu/outro → `gentle_pulse` (mensagem leve, sem oferta)
- **Bloqueio semântico**: antes de qualquer geração, `detectClosingIntent(history)` (regex pt-BR). Pegou "já comprei" / "pode parar" / "sem interesse" → manda closure educada (`closingMessageFor`) e marca `motivo_perda_estruturado` + trava futuras tentativas.

### Sender (canal de saída)
- `src/lib/services/whatsappSender.ts` → Evolution API (instâncias separadas: atendimento e follow-up)
- Sempre envie via essa camada — **não chame Evolution direto de outro lugar**.
- `kind` no `sendWhatsApp({kind})`: `ai_sdr` | `ai_followup` | `ai_closure` | `manual`. Vira prefixo do `message_id` (auditoria).

### Circuit breaker global
```sql
UPDATE system_settings SET ai_paused = true WHERE id = 'global';
```
Cron `followup-ai` checa e retorna early. Use em incidentes (suspeita de ban, msg errada vazando, etc).

## 3. Sinais críticos no banco

| Campo | Significado | Quem seta |
|---|---|---|
| `assigned_consultant_id` | Dono do lead | Round robin (`pickNextConsultant`) ou "Iniciar Atendimento" |
| `atendimento_iniciado_em` | Vendedor pegou o lead | `/api/lead/start-atendimento` ou click do botão |
| `ultima_interacao_humana` | Última msg humana (cliente ou vendedor) | Webhook + extensão WhatsApp Web |
| `flagged_reversao` | Subir pro topo do Inbox (badge rosa) | Webhook quando cliente responde pós-Karol |
| `descarte_financeiro` | IA bloqueada por crédito ruim | Trigger `enqueue_reversal_agent` ao detectar CPF Ruim/Sem margem/Score baixo |
| `motivo_perda_estruturado` | Categoriza por que perdeu | Modal "Finalizado→Perdido" do Kanban OU intent detector |
| `diagnostico_atendimento` | Texto livre do vendedor + prefixos `[IA-AUTO]` / `[INBOUND-AUTO]` da IA | Vendedor / detector de intenção |
| `respondeu_follow_up` | Cliente respondeu → trava follow-up automático | Webhook ao receber inbound |
| `ai_silence_until` | Mute por X tempo | Closure educada (+1 ano), pause manual |
| `reversao_attempt_count` | Contador de tentativas Karol (max 3) | Karol incrementa; intent detector seta 99 (trava total) |
| `archived_at` / `archived_reason` / `archived_by` | Arquivado (some do Inbox e Kanban) | Modal "Finalizado→Arquivar" |

### Status válidos (ordem do funil)
```
received → triagem → attempt → contacted → proposed → negotiation → scheduled → visited → closing → fechamento → vendido
                                                                                                            ↘ perdido / lost_by_inactivity / arquivado
```

## 4. Monitor de inatividade

- Função SQL: `run_inactivity_monitor()` (V3.7)
- Agenda: pg_cron `*/15 * * * *`
- Regras:
  - 8h sem `ultima_interacao_humana` em lead em atendimento → cria `inactivity_alerts` kind=`warning_8h`
  - 24h sem interação → muda status para `lost_by_inactivity` + cria alerta `auto_lost_24h`
- Tabela: `inactivity_alerts` (UNIQUE `lead_uid, kind`). Vendedor reconhece via UI setando `acknowledged_at`.

## 5. Inbox / Kanban / Modal

### Inbox (`/inbox`)
- Query: `leads_unified_active` filtrada por `assigned_consultant_id = me OR atendimento_iniciado_em IS NULL` (Fila de Pesca V5: vendedor vê dele + os sem dono)
- Badges no card:
  - 🛑 âmbar: intent detectado (`[IA-AUTO]`/`[INBOUND-AUTO]` em `diagnostico_atendimento`)
  - 🔥 rosa: `flagged_reversao=true`
  - 🚨 vermelho: `state=AGUARDANDO_VENDEDOR`
  - ✨ verde: lead novo (< X min)
- Telefone mascarado até clicar "Iniciar/Capturar".

### Atendimento Kanban (`/atendimento`)
5 colunas: Qualificação → Proposta → Test Drive → Fechamento → **🏁 Finalizado**

Drag pra Finalizado **não persiste** — abre Quick Action Modal:
- 🟢 Vendido (confete, `status='vendido'`, `won_at`)
- 🔴 Perdido (`diagnostico_atendimento` obrigatório, dispara trigger Karol)
- ⚪ Arquivar (`archived_at`, `ai_silence_until=+1ano`)

Filtros aplicados: `assigned_consultant_id=me`, `atendimento_iniciado_em IS NOT NULL`, `archived_at IS NULL`. View unificada já exclui status finais.

### Lead Profile Modal
- `useLeadTimeline` carrega de 6 fontes em paralelo. **WhatsApp vem da `unified_whatsapp_messages`** com lookup cruzado por telefone (suffix 8 dígitos).
- Realtime: subscribe em `whatsapp_messages` INSERT pra refrescar sem F5.
- "Gerar Análise": **abortada se 0 mensagens unificadas** (não chama OpenAI com contexto vazio).

## 6. Como auditar o sistema (receitas)

### Estado da fila
```ts
const { data: pend } = await sb.from('ai_sdr_queue').select('*').is('processed_at', null);
const reversal = pend.filter(p => p.payload?.isReversal === true).length;
const ghost    = pend.filter(p => p.payload?.isReversal !== true).length;
```
Se `ghost > 0` → tem produtor fantasma inserindo lead novo na fila (V3.7 deveria ter dropado).

### Leads que escaparam do detector
```sql
SELECT id, name, status, diagnostico_atendimento
  FROM leads_manos_crm
 WHERE diagnostico_atendimento ILIKE '%comprei%'
    OR diagnostico_atendimento ILIKE '%fechei%'
   AND motivo_perda_estruturado IS NULL;
```
Se aparecer linha → adicionar o padrão em `conversationIntent.ts`.

### Velocidade real do disparo Karol
```sql
SELECT created_at, lead_id
  FROM whatsapp_messages
 WHERE message_id LIKE 'ai_followup%'
   AND created_at > NOW() - INTERVAL '24 hours'
 ORDER BY created_at;
```
Gaps < 60s = throttle furou. Investigar.

### Conversão últimos 30d
```sql
SELECT * FROM lead_kpis_daily ORDER BY dia DESC LIMIT 30;
```

## 7. Padrões para evoluir

### Adicionar um detector novo de intenção
1. Edite `src/lib/services/conversationIntent.ts` — append no array `PATTERNS`.
2. Adicione caso correspondente em `closingMessageFor` e `lossReasonFor`.
3. Sem migration SQL — o sinal vai pelo `diagnostico_atendimento` com prefixo `[IA-AUTO]`/`[INBOUND-AUTO]`.

### Adicionar coluna nova no Lead
1. Migration SQL: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
2. **Recrie `leads_unified` com CASCADE** — `CREATE OR REPLACE VIEW` falha se mudou shape. Use `DROP VIEW IF EXISTS leads_unified_active CASCADE; DROP VIEW IF EXISTS leads_unified CASCADE;` e recrie + recrie `lead_kpis_daily` (depende).
3. Adicione a coluna no select da view nas 3 partes do UNION ALL.
4. Adicione na interface do tsx que consome.

### Adicionar nova ação de "Finalizado"
- Modal está em `src/app/atendimento/page.tsx` no estado `finishType`. Mantém 3 opções fixas. Se precisar 4ª, ajuste o `submitFinish` handler.

### Mexer em throttle
- Karol: env vars `REVERSAO_MAX_PER_RUN` (default 1) e `REVERSAO_SEND_GAP_MS` (default 60000).
- Arthur: hardcoded `p_limit=1` na RPC `claim_ai_sdr_jobs` — mudar requer entender que cron roda 1×/min.

## 8. Pitfalls / armadilhas reais

- **`CREATE OR REPLACE VIEW` não aceita remover coluna.** Use DROP + CREATE.
- **`GET DIAGNOSTICS x = x + ROW_COUNT` é inválido.** Use temp var: `GET DIAGNOSTICS t = ROW_COUNT; x := x + t;`
- **Coluna `consultor_id` foi removida da V3** mesmo com migration prevendo. Use só `assigned_consultant_id`.
- **`payload->>'isReversal'` é texto.** Pra comparar com booleano: `COALESCE((payload->>'isReversal')::boolean, false)`.
- **Telefone na view vem mascarado** quando lead não tem dono. Detecte `*` antes de usar.
- **Cron Vercel Hobby = 2 slots.** Não dá pra adicionar cron novo lá. Use EasyCron pra novas rotinas.
- **`leads_manos_crm.id` é UUID, mas `leads_distribuicao_crm_26.id` é bigint.** `parseInt` quando for `dist`.
- **`whatsapp_messages.lead_id` aceita texto E número.** A view `unified_whatsapp_messages` normaliza pra `lead_uid TEXT` via `COALESCE(lead_id::text, lead_compra_id::text)`.

## 9. Cobrança de vendas (modo "motor roncando")

Sempre que o usuário pedir relatório/diagnóstico, traga **números crus + ação concreta**, não floreio. Use a query do `lead_kpis_daily` + estas perguntas:

1. **Quem está deixando lead esfriar?** Cruze `assigned_consultant_id` com `ultima_interacao_humana > 8h AND status NOT IN finais`. Liste por consultor.
2. **Quantos leads Hot (`ai_score >= 80`) sem resposta?** `SELECT count(*) ... WHERE ai_score >= 80 AND first_contact_at IS NULL AND created_at > NOW() - INTERVAL '24h'`.
3. **Conversão por vendedor (mês)**: junte `leads_unified` com vendas no `sales_manos_crm`. Atribua a `assigned_consultant_id` ou `primeiro_vendedor`.
4. **Razão de perda dominante**: `SELECT motivo_perda_estruturado, count(*) FROM leads_unified GROUP BY 1 ORDER BY 2 DESC`. Sugira plano de ataque por motivo.
5. **Reversões bem-sucedidas**: `flagged_reversao=true AND respondeu_follow_up=true` → quantas viraram venda? Mostra ROI da Karol.

Sempre termine com uma **ação específica para Alexandre executar**, ex: "Wilson tem 6 leads quentes sem 1ª resposta há > 4h — manda mensagem no grupo agora."

## 10. Quando MEXER vs quando ESPERAR

| Situação | Mexer? |
|---|---|
| Fila ai_sdr_queue com itens isReversal=false | ✅ Purge soft, investigue produtor |
| Disparo concentrado no mesmo minuto | 🚨 Pause IA + investigue throttle ANTES de tudo |
| Detector regex pegou falso positivo | ✅ Ajusta padrão, não desativa o módulo |
| Cliente disse "comprei outro carro de manhã, vou voltar amanhã ver SUV" | ⚠️ Edge case — regex pega "comprei outro". Justificável marcar e deixar humano decidir |
| Vendedor reclama "lead virou perdido sozinho" | ✅ Inatividade 24h. Mostre `inactivity_alerts` pra ele saber. Não relaxe a regra. |
| Migration falhou no meio | 🚨 Rode em pedaços. Migrations são idempotentes (`CREATE OR REPLACE`, `IF NOT EXISTS`, `DROP ... CASCADE`). |

---

**Regra final:** este CRM existe pra fechar venda de carro. Cada feature, cron e badge tem que servir ao vendedor humano que está no chão de loja. Quando em dúvida, otimize para **ele responder o lead em < 5min**.
