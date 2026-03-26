# PLANO_IA_CRM.md
# Manos CRM — Contexto de Implementação IA-First
> Última atualização: 26/03/2026
> Documento vivo — atualizar a cada sessão de desenvolvimento

---

## VISÃO GERAL DO PROJETO

**Produto:** Manos CRM — sistema de gestão de leads para Manos Veículos (concessionária multimarcas, Rio Do Sul/SC, Brasil).

**Stack:**
- Next.js 16 App Router + React 19 + TypeScript strict
- Tailwind CSS 4 + Framer Motion
- Supabase (PostgreSQL + Auth + Realtime)
- OpenAI GPT-4o / GPT-4o-mini
- Vercel (deploy + crons)

**Objetivo da transformação:** Converter o CRM de um sistema de registro passivo para um software 100% AI-First — onde a IA antecipa, sugere e executa ações no funil de vendas.

**Metodologia:** Cognitive Walkthrough — cada interação do usuário (clique, drag, abertura de modal) foi dissecada para identificar onde a IA pode atuar.

---

## ARQUITETURA IA — RECURSOS DE BASE (PRÉ-TRANSFORMAÇÃO)

| Recurso | Rota / Arquivo | Status |
|---|---|---|
| Elite Closer V3 (análise de chat WhatsApp) | `POST /api/extension/analyze-chat` | ✅ Produção |
| Next Steps feedback-aware (GPT-4o completo) | `POST /api/lead/next-steps` | ✅ Produção |
| AI Feedback Loop (vendedor corrige IA) | `src/lib/services/aiFeedbackService.ts` | ✅ Produção |
| ScoreBadgeWithFeedback (UI de feedback) | `DashboardTab` no modal | ✅ Produção |
| Score heurístico local | `calculateLeadScore()` em `src/utils/calculateScore.ts` | ⚠️ Fallback apenas |
| Arsenal de scripts por estágio | `GET /api/extension/arsenal` | ✅ Estático |
| SLA bars por estágio | `LeadCardV2` + `STAGE_SLA_HOURS` | ✅ Visual |
| Webhook Meta Ads com IA inline | `POST /api/webhook/facebook-leads` | ✅ Produção |

**Tabela principal:** `leads_manos_crm`
**Campos IA:** `ai_score` (0-99), `ai_classification` (hot/warm/cold), `ai_reason`, `next_step`, `proxima_acao`, `vehicle_interest`, `churn_probability`, `loss_category`

---

## BUGS CRÍTICOS CORRIGIDOS (FASE 1)

### Bug 1 — Score heurístico sobrescrevia ai_score do banco
**Causa:** `useLeadScore.ts` iniciava com `lead.ai_score` mas o `useEffect` sempre rodava `calculateLeadScore()` e sobrescrevia o valor real.
**Impacto:** `ScoreBadgeWithFeedback`, `LeadCardV2`, `leads/page.tsx`, `pulse/page.tsx` exibiam score errado em 4 telas.
**Fix:** Lógica `aiScore > 0 ? aiScore : calculateLeadScore(...)` em todos os 4 pontos.

### Bug 2 — handleSaveFinish era no-op (vendas não eram salvas)
**Causa:** `LeadProfileModalV2.tsx` passava `handleSaveFinish={() => setShowFinishing(false)}` — fechava o modal mas não persistia nada.
**Fix:** Nova função `handleSaveFinish` async + nova rota `POST /api/lead/finish`.

---

## FASE 1 — ENRIQUECIMENTO PASSIVO ✅ COMPLETA

### 1.1 Score Real no Card ✅
**Padrão:** `const aiScore = Number(lead.ai_score); const scoreVal = aiScore > 0 ? aiScore : calculateLeadScore({...});`

### 1.2 Auto-análise na Criação do Lead ✅
**Rota:** `POST /api/lead/init-score` — GPT-4o mini analisa dados brutos, retorna `ai_score`, `ai_classification`, `proxima_acao`, `vehicle_interest_normalized`.
Fire-and-forget adicionado em: `NewLeadModalV2.tsx`, `extension/create-lead/route.ts`, `webhook/facebook-leads/route.ts`.

### 1.3 Cron de Recálculo Noturno ✅
**Rota:** `GET /api/cron/ai-score-refresh` — diariamente às 07h UTC, processa leads com `ai_score = 0` ou `null`, batches de 5 com 600ms de intervalo.

### 1.4 Normalização de Veículo ✅
Embutida no `init-score` e no `ai-score-refresh`. Atualiza `vehicle_interest` para formato `Marca Modelo Ano`.

---

## FASE 2 — ASSISTÊNCIA ATIVA ✅ COMPLETA (exceto 2.4)

### 2.1 Trigger de IA na Mudança de Estágio ✅
**Onde:** `handleStatusChange` em `pipeline/page.tsx` — fire-and-forget para `POST /api/lead/next-steps` quando `newStatus === 'ataque' || 'fechamento'`.

### 2.2 Briefing Matinal (AI Daily Brief) ✅
**API:** `GET /api/ai/daily-brief?consultantId=X&name=X` — GPT-4o mini gera `saudacao`, `resumo`, `prioridades[]`, `aviso`.
**Banner no Pipeline:** aparece 1x/sessão, cache `sessionStorage` por `brief_{date}_{consultantId}`, dismissável.

### 2.3 Assistente de Proposta ✅
**API:** `POST /api/lead/generate-proposal` — 3 cenários de financiamento (24x/36x/48x).
**UI:** botão "Gerar proposta" em `TacticalAction.tsx`, painel inline expansível.

### 2.4 Busca Semântica ⏳ PENDENTE
**Bloqueio:** requer extensão `pgvector` no Supabase + coluna `embedding VECTOR(1536)` em `leads_manos_crm`.
**Quando habilitar:** ativar pgvector no painel Supabase → rodar `ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS embedding vector(1536);` → criar API `POST /api/ai/semantic-search`.

### 2.5 Filtro "IA Recomenda Hoje" ✅
**Critério client-side:** `ai_score >= 70 || ai_classification === 'hot'` + `updated_at` há mais de 2h.
**UX:** chip âmbar `Brain IA Hoje (X)` na barra de filtros do Pipeline.

---

## FASE 3 — AUTOMAÇÃO TOTAL ✅ COMPLETA

### 3.1 Follow-up Automático Inteligente ✅
**Rota:** `GET /api/cron/followup-ai` — a cada 3h. SLA: `fechamento/negotiation/proposed` = 3h, outros = 6h.
Cria `follow_ups` com `type='ai_auto'`, `status='pending'` — safety gate, vendedor aprova antes de enviar.
Registra na timeline com `type='ai_followup'`. Dedup por lead + tipo pendente.

### 3.2 Detecção de Intenção de Compra via WhatsApp ✅
**Onde:** `sync-messages/route.ts` — bloco após insert de interações (leadType === 'main').
**Trigger:** 14 keywords nas últimas 5 msgs do cliente OU `urgency_score >= 88`.
**Ação:** `ai_score = 92`, `ai_classification = 'hot'` + `follow_ups` com `type='ai_alert_compra'`, `priority='high'`.
Dedup: não cria se existe alerta nas últimas 4h. Latência: < 30s.

### 3.3 Alerta de Consultor Sobrecarregado ✅
**Onde:** embutido no cron `churn-predict/route.ts`.
**Trigger:** consultor com > 15 leads ativos → `follow_ups` com `type='admin_overload'`, `user_id='admin'`.
Dedup: 1 alerta por consultor por dia. IA nunca redistribui — só notifica.

### 3.4 Modelo Preditivo de Churn ✅
**Rota:** `GET /api/cron/churn-predict` — diariamente às 06h UTC.
**Fórmula:** base 30 + inatividade (até +40) ± ai_score ± ai_classification ± estágio fechamento.
**Campo:** `churn_probability` (int 0-99) em `leads_manos_crm`.
**UX card:** ícone `⚠` âmbar em `LeadCardV2` quando `churn_probability > 70`.
**UX pulse:** seção "Risco de Abandono" em `/v2/pulse` lista os 5 leads com maior risco.

### 3.5 Auto-classificação de Motivo de Perda ✅
Implementado em `api/lead/finish/route.ts` via `classifyLossReasonAsync()`.
Categorias: `preco | concorrente | sem_interesse | sem_resposta | credito_negado | outro`.
Campo `loss_category` em `leads_manos_crm` (adicionado na migration `migration_ai_first_v3.sql`).

### 3.6 Safety Gate — UI de Alertas IA ✅
**Onde:** `FollowUpTab.tsx` — seção "Alertas IA" no topo da aba, aparece quando há `ai_auto` ou `ai_alert_compra` pendentes.
**Ações disponíveis:** Enviar via WhatsApp (abre wa.me com mensagem pré-preenchida + marca como concluído), Concluir, Dispensar.
Alertas IA são ocultados da lista de "Outros Agendamentos" para não duplicar.

---

## BANCO DE DADOS — MIGRATION APLICADA

**Arquivo:** `migration_ai_first_v3.sql` (raiz do projeto) — aplicado em 26/03/2026.

### leads_manos_crm — colunas adicionadas
| Campo | Tipo | Populado por |
|---|---|---|
| `next_step` | TEXT | `init-score`, `ai-score-refresh`, `next-steps`, `sync-messages` |
| `proxima_acao` | TEXT | mesmos (legado extensão Chrome) |
| `behavioral_profile` | JSONB | `analyze-chat`, `sync-messages` |
| `ai_summary` | TEXT | `sync-messages` |
| `loss_category` | TEXT | `api/lead/finish` |
| `churn_probability` | INTEGER 0-99 | `cron/churn-predict` |

### interactions_manos_crm — colunas adicionadas
| Campo | Tipo | Uso |
|---|---|---|
| `type` | TEXT | whatsapp_in, whatsapp_out, ai_followup, ai_alert_compra |
| `user_name` | TEXT | nome do consultor ou "Cliente" |
| `user_id` | TEXT | UUID do consultor ou "system" |

### follow_ups — tabela criada
Campos: `id`, `lead_id` (nullable), `user_id`, `scheduled_at`, `type`, `note`, `priority`, `status`, `result`, `result_note`, `completed_at`, `metadata` (JSONB), `created_at`.
Tipos de `type` em uso: `ai_auto`, `ai_alert_compra`, `admin_overload`, `manual`, `visit`, `whatsapp`, `call`, `proposal`.

---

## CRONS ATIVOS (vercel.json)

| Path | Schedule | Função |
|---|---|---|
| `/api/cron/cowork-daily` | `0 11 * * 1-6` | Relatório diário coworking |
| `/api/cron/anti-loss` | `0 2 * * *` | Alerta de leads em risco de perda |
| `/api/cron/pipeline-sla` | `0 3 * * *` | SLA breaches no pipeline |
| `/api/cron/ai-score-refresh` | `0 7 * * *` | Recálculo de ai_score em batch |
| `/api/cron/followup-ai` | `0 */3 * * *` | Follow-up automático com IA |
| `/api/cron/churn-predict` | `0 6 * * *` | Churn prediction + alerta overload |

---

## PADRÕES ARQUITETURAIS ESTABELECIDOS

### Score Priority Pattern
```typescript
const aiScore = Number(lead.ai_score);
const scoreVal = aiScore > 0 ? aiScore : calculateLeadScore({ status, tempoFunilHoras, ... });
```

### Fire-and-Forget (client-side)
```typescript
fetch('/api/lead/init-score', { method: 'POST', headers: {...}, body: JSON.stringify({ leadId }) }).catch(() => {});
```

### Fire-and-Forget (server-side)
```typescript
fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/lead/init-score`, { method: 'POST', ... }).catch(() => {});
```

### Supabase Clients
- `@/lib/supabase/admin` → server routes (service role, bypassa RLS)
- `@/lib/supabase/client` → browser components
- `@/lib/supabase/server` → SSR (cookies)
- **Nunca usar** `createClient` direto do `@supabase/supabase-js` em rotas novas

### Cron Protection
```typescript
if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new NextResponse('Unauthorized', { status: 401 });
```

### GPT Model Policy
- **GPT-4o mini:** scoring, classificação, scripts curtos, follow-ups, churn
- **GPT-4o completo:** Elite Closer, análise de chat longa, propostas complexas

---

## PRÓXIMOS PASSOS (BACKLOG PRIORIZADO)

### Alta prioridade

**P1 — Notificações em tempo real (Supabase Realtime)**
- Subscribed em `follow_ups` onde `status='pending'` e `type IN ('ai_auto','ai_alert_compra')`
- Badge de notificação no header/navbar sem precisar recarregar a página
- Arquivo: criar `src/hooks/useAIAlerts.ts` com `supabase.channel('ai-alerts').on('postgres_changes', ...)`

**P2 — Dashboard `/v2` compacto com atalhos rápidos**
- A tentativa anterior foi revertida pelo linter
- Redesenho: header menor + grid de 8 atalhos (Pipeline, Pulse, Leads, Follow-ups pendentes, Leads IA Hoje, Risco de Churn, Nova Proposta, Agenda)
- Métricas em linha horizontal compacta em vez de 4 cards grandes
- Arquivo: `src/app/v2/DashboardClient.tsx`

**P3 — Pulse: alertas admin_overload visíveis**
- Exibir alertas `type='admin_overload'` da tabela `follow_ups` para o admin
- Seção abaixo de "Leads Órfãos" com lista de consultores sobrecarregados + botão redistribuir

### Média prioridade

**P4 — Busca Semântica (2.4)**
- Bloqueio: habilitar `pgvector` no Supabase Dashboard → Database → Extensions
- SQL: `ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS embedding vector(1536);`
- Criar: `POST /api/ai/semantic-search` + input de linguagem natural no Pipeline

**P5 — Métricas de performance da IA**
- Quantos `ai_auto` foram enviados vs dispensados por semana
- Taxa de conversão de leads com `ai_alert_compra` vs leads sem alerta
- Painel simples em `/v2/pulse` seção admin

**P6 — Churn no DashboardTab do modal**
- Mostrar gauge/barra de churn dentro do modal do lead (DashboardTab)
- Com sugestão de ação baseada no motivo calculado (inatividade vs score baixo)

### Baixa prioridade / Futuro

**P7 — Modelo de Churn com ML real**
- Substituir fórmula heurística por modelo treinado nos dados históricos de perda
- Usar `loss_category` acumulado para treinar

**P8 — Redistribuição semi-automática de leads**
- Admin vê sugestão de redistribuição gerada pela IA
- 1 clique confirma, sem precisar ir ao painel de leads

**P9 — Extensão Chrome v2: alertas IA inline**
- Mostrar badge de `ai_alert_compra` pendente diretamente na extensão ao abrir conversa do WhatsApp

---
