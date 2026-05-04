# Relatório Completo — Inteligência Artificial no CRM Manos Veículos

> **Data:** 31/03/2026 | **Tipo:** Auditoria / Inventário completo | **Ação:** Somente leitura

---

## 1. VISÃO GERAL

O CRM Manos implementa um **pipeline multi-modelo de IA** com 3 provedores (OpenAI, Google Gemini, Anthropic Claude), 20+ endpoints de API, 5 cron jobs automatizados e um sistema de feedback/aprendizado contínuo. A IA permeia todo o ciclo de vida do lead: captura → scoring → análise comportamental → scripts de venda → propostas → predição de churn → follow-up automático.

---

## 2. PROVEDORES E MODELOS

**Arquivo de configuração:** `src/lib/aiProviders.ts`

| Provedor | Modelo | Variável de Ambiente | Uso Principal |
|----------|--------|---------------------|---------------|
| OpenAI | `gpt-4o` | `OPENAI_API_KEY` | Propostas, análise de marketing, classificação bulk |
| OpenAI | `gpt-4o-mini` | `OPENAI_API_KEY` | Scoring batch, churn, follow-ups, briefings (custo-eficiente) |
| OpenAI | `text-embedding-3-small` | `OPENAI_API_KEY` | Embeddings para busca semântica (1536 dims) |
| Google | `gemini-2.0-flash` | `GOOGLE_AI_API_KEY` | Análise multimodal (imagens, áudio, PDF) |
| Anthropic | `claude-sonnet-4-6` | `API_CLAUDE` | Elite Closer para leads quentes (raciocínio profundo) |

**Dependências (package.json):**
- `openai: ^6.25.0`
- `@anthropic-ai/sdk: ^0.80.0`
- `@google/generative-ai: ^0.24.1`

---

## 3. ESTRATÉGIA DE ROTEAMENTO DE MODELOS

```
Tarefa                         → Modelo Selecionado    → Motivo
─────────────────────────────────────────────────────────────────
Elite Closer (leads quentes)   → Claude Sonnet         → Raciocínio + nuance
Elite Closer (fallback)        → GPT-4o                → Backup robusto
Scoring/follow-up/churn        → GPT-4o-mini           → Custo baixo em batch
Propostas de financiamento     → GPT-4o                → Raciocínio completo
Análise de chat multimodal     → Gemini 2.0 Flash      → Suporte a imagens/PDF
Briefing diário                → GPT-4o-mini           → Resposta rápida
Análise de marketing           → GPT-4o                → Análise estratégica profunda
Leads frios (churn)            → Heurística pura       → Zero custo de API
```

---

## 4. SERVIÇOS DE IA (BACKEND)

### 4.1 Elite Closer V3
**Arquivo:** `src/lib/services/ai-closer-service.ts`

- Função principal: `runEliteCloser(leadId, messages[], consultantName)`
- Gera: diagnóstico, orientação tática, 3 scripts WhatsApp (cobrança, agendamento, contorno de objeção)
- Score de urgência 0-99 com classificação hot/warm/cold
- Detecta nome do cliente automaticamente no histórico de conversa
- Memória de ações anteriores (evita repetir recomendações)
- Consulta estoque disponível para matchmaking

### 4.2 Lead Strategy Service (Claude)
**Arquivo:** `src/lib/services/leadStrategyService.ts`

- Usa exclusivamente Claude Sonnet
- Análise de perfil comportamental profundo
- Matchmaking com estoque (fit_score 0-100)
- Probabilidade de fechamento
- Script WhatsApp personalizado por perfil

### 4.3 Proposal Service
**Arquivo:** `src/lib/services/proposal-service.ts`

- Usa GPT-4o para gerar 3 cenários de financiamento (20%, 30%, 40% entrada)
- Calcula parcelas com taxa de 2%/mês em 48x
- Gera mensagens WhatsApp prontas para enviar
- Cache de 6 horas para evitar regeneração

### 4.4 AI Feedback Service (Loop de Aprendizado)
**Arquivo:** `src/lib/services/aiFeedbackService.ts`

- `getAIContext(leadId)` — contexto específico do lead
- `getGlobalFeedbackContext()` — padrões de erro dos últimos 30 dias
- Categorias de erro rastreadas:
  - `score_alto_demais` — IA inflando leads desengajados
  - `score_baixo_demais` — IA ignorando leads com interesse real
  - `lead_morto` — classificando SPAM como válido
  - `lead_quente_ignorado` — perdendo compradores prioritários
  - `status_errado` — estágio de funil errado
- Feedback é injetado nos prompts futuros para auto-calibração

### 4.5 Gemini Multimodal
**Arquivo:** `src/lib/gemini.ts`

- `analyzeMultiModalChat(chatText, attachments[], leadName)`
- Suporta imagens (PNG, JPG) e documentos (PDF) em base64
- Análise de tom emocional, objeções ocultas, perfil comportamental

### 4.6 Claude Analysis
**Arquivo:** `src/lib/claude.ts`

- `analyzeWithClaude(prompt, model, systemPrompt)`
- Wrapper do SDK Anthropic para análises customizadas

---

## 5. ENDPOINTS DE API (20+ ROTAS)

### 5.1 Scoring e Classificação

| Rota | Método | Modelo | Função |
|------|--------|--------|--------|
| `/api/lead/init-score` | POST | GPT-4o-mini | Score inicial ao criar lead (fire-and-forget) |
| `/api/cron/ai-score-refresh` | GET | GPT-4o-mini | Batch diário: 100 leads (60 sem score + 40 desatualizados) |
| `/api/classify-leads` | POST | GPT-4o | Classificação bulk de leads legados |

### 5.2 Análise Avançada

| Rota | Método | Modelo | Função |
|------|--------|--------|--------|
| `/api/lead/next-steps` | POST | Claude/GPT-4o | Elite Closer — diagnóstico + scripts |
| `/api/analyze-chat` | POST | Gemini/GPT-4o | Análise multimodal de conversa |
| `/api/extension/analyze-chat` | POST | Gemini/GPT-4o | Análise via extensão Chrome |
| `/api/intelligent-analysis` | POST | GPT-4o | Análise tática global do CRM |

### 5.3 Vendas e Propostas

| Rota | Método | Modelo | Função |
|------|--------|--------|--------|
| `/api/lead/generate-proposal` | POST | GPT-4o | 3 cenários de financiamento |
| `/api/lead/handoff-brief` | POST | GPT-4o-mini | Briefing de transferência entre consultores |
| `/api/lead/pre-visit-brief` | POST | GPT-4o-mini | Briefing tático pré-visita |
| `/api/lead/finish` | POST | GPT-4o-mini | Classificação automática de motivo de perda |

### 5.4 Follow-up e Churn

| Rota | Método | Modelo | Função |
|------|--------|--------|--------|
| `/api/cron/churn-predict` | GET | GPT-4o-mini + heurística | Predição diária de abandono |
| `/api/cron/followup-ai` | GET | GPT-4o-mini | Auto-geração de follow-ups a cada 3h |
| `/api/generate-followup` | POST | GPT-4o-mini | Follow-up manual sob demanda |

### 5.5 Busca Semântica e Embeddings

| Rota | Método | Modelo | Função |
|------|--------|--------|--------|
| `/api/ai/embed-lead` | POST | text-embedding-3-small | Gera vetor 1536-dim por lead |
| `/api/ai/semantic-search` | POST | text-embedding-3-small | Busca por similaridade via pgvector |

### 5.6 Inteligência e Marketing

| Rota | Método | Modelo | Função |
|------|--------|--------|--------|
| `/api/ai/daily-brief` | GET | GPT-4o-mini | Briefing matinal personalizado |
| `/api/analyze-campaign-ai` | POST | GPT-4o-mini | Análise de campanhas Facebook/Meta |
| `/api/marketing-quality-analysis` | POST | GPT-4o | Auditoria de qualidade de leads multi-fonte |

### 5.7 Feedback e Saúde

| Rota | Método | Função |
|------|--------|--------|
| `/api/extension/ai-feedback` | POST | Recebe correções dos consultores |
| `/api/health/ai` | GET | Teste de conectividade OpenAI |
| `/api/gpt-test` | GET | Teste de conexão GPT-4o-mini |

---

## 6. CRON JOBS AUTOMATIZADOS

| Cron | Horário | Modelo | Batch | Duração Max | Função |
|------|---------|--------|-------|-------------|--------|
| `ai-score-refresh` | Diário 07:00 UTC (04:00 BRT) | GPT-4o-mini | 100 leads | 5 min | Refresh de scores |
| `churn-predict` | Diário 06:00 UTC (03:00 BRT) | GPT-4o-mini + heurística | 500 leads | 2 min | Predição de churn |
| `followup-ai` | A cada 3 horas | GPT-4o-mini | 30 leads | ~30s | Follow-ups automáticos |
| `pipeline-sla` | Periódico | — | — | — | Monitoramento de SLA |
| `anti-loss` | Periódico | — | — | — | Prevenção de perdas |

---

## 7. BANCO DE DADOS — ESTRUTURAS DE IA

### 7.1 Colunas AI na `leads_manos_crm`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `ai_score` | INTEGER | Score 0-99 (probabilidade de conversão) |
| `ai_classification` | VARCHAR | hot / warm / cold |
| `ai_summary` | TEXT | Resumo da análise IA |
| `ai_reason` | TEXT | Diagnóstico da IA |
| `behavioral_profile` | JSONB | Perfil: sentimento, urgência, intenções, probabilidade |
| `proxima_acao` | TEXT | Próxima ação recomendada |
| `next_step` | TEXT | Script WhatsApp sugerido |
| `churn_probability` | INTEGER | Risco de abandono 0-99 |
| `churn_reason` | TEXT | Motivo do risco de churn |
| `embedding` | vector(1536) | Embedding para busca semântica |
| `last_scripts_json` | JSONB | Cache dos 3 scripts gerados |
| `last_proposal_json` | JSONB | Cache da proposta de financiamento |
| `handoff_summary` | TEXT | Briefing de transição |
| `loss_category` | TEXT | Classificação automática de perda |

### 7.2 Tabela `ai_feedback`
- Armazena correções dos consultores
- Campos: lead_id, reported_score, correct_label, category, reason
- RLS: leitura e inserção para autenticados

### 7.3 Tabela `marketing_quality_reports`
- Relatórios de qualidade de marketing gerados por IA
- Campos: quality_average, overall_score, insights (JSONB), recommendations (JSONB)

### 7.4 Tabela `follow_ups` (tipos IA)
- `type = 'ai_auto'` — follow-ups automáticos
- `type = 'ai_alert_compra'` — alertas de intenção de compra
- `type = 'ai_followup'` — follow-ups gerados por IA

### 7.5 Função RPC `match_leads()`
- Busca semântica via pgvector (distância cosseno)
- Index IVFFlat com 100 listas

---

## 8. FRONTEND — COMPONENTES E HOOKS DE IA

### 8.1 Hooks

| Hook | Arquivo | Função |
|------|---------|--------|
| `useLeadScore` | `src/app/components/lead-profile/hooks/useLeadScore.ts` | Score inteligente: prioriza AI real, fallback heurístico |
| `useAIAlerts` | `src/hooks/useAIAlerts.ts` | Monitoramento real-time de alertas IA via Supabase Realtime |

### 8.2 Componentes

| Componente | Arquivo | Função |
|-----------|---------|--------|
| `ScoreBadgeWithFeedback` | `src/app/components/lead-profile/components/ScoreBadgeWithFeedback.tsx` | Badge de score clicável + coleta de feedback em 3 etapas |
| `TacticalAction` | `src/app/components/lead-profile/sections/TacticalAction.tsx` | Hub central IA no modal: próxima ação, scripts, propostas |
| `AIOpportunityCard` | `src/app/pulse/components/AIOpportunityCard.tsx` | Cards de oportunidade no dashboard Pulse |

### 8.3 Páginas

| Página | Arquivo | Função |
|--------|---------|--------|
| AI Calibration | `src/app/admin/ai-calibration/page.tsx` | Dashboard admin: métricas de acurácia, gráficos de erro, tendências |
| Pulse | `src/app/pulse/page.tsx` | Briefing matinal IA + missões de elite |
| Pipeline | `src/app/pipeline/page.tsx` | Cards com score IA + badge de churn |
| Lead Modal | `src/app/components/lead-profile/LeadProfileModalV2.tsx` | Auto-análise ao abrir (se >8h), scripts, proposta |

---

## 9. ALGORITMO HEURÍSTICO DE SCORE

**Arquivo:** `src/utils/calculateScore.ts`

| Fator | Pontos |
|-------|--------|
| Status base (entrada→fechamento) | 20-75 pts |
| Engajamento (interações) | 0-20 pts |
| Recência (última interação) | 0-20 pts |
| Qualificação (investimento + interesse) | 0-15 pts |
| Penalidade: entrada >48h | -15 pts |
| Penalidade: triagem >120h | -10 pts |
| Penalidade: sem interação >336h | -20 pts |
| **Total máximo** | **99** |

Valores reservados: 0 = Perdido, 100 = Vendido

---

## 10. FLUXO DE DADOS COMPLETO

```
Lead Criado (NewLeadModalV2 / Webhook / Facebook)
    │
    ├─→ POST /api/lead/init-score (GPT-4o-mini)
    │     └─→ ai_score, ai_classification, proxima_acao
    │
    ├─→ POST /api/ai/embed-lead (embedding-3-small)
    │     └─→ vetor 1536-dim → coluna embedding
    │
    ▼
Cron Diário 04:00 BRT — ai-score-refresh (GPT-4o-mini batch)
    │  └─→ Atualiza scores com contexto de behavioral_profile + feedback
    │
Cron Diário 03:00 BRT — churn-predict
    │  ├─→ Leads frios: heurística (zero custo)
    │  └─→ Leads quentes: GPT-4o-mini → churn_probability + churn_reason
    │
Cron A cada 3h — followup-ai (GPT-4o-mini)
    │  └─→ Gera follow_ups type='ai_auto' (requer aprovação do consultor)
    │
    ▼
Consultor abre Pulse → GET /api/ai/daily-brief
    │  └─→ Briefing personalizado: saudação, 3 prioridades, alerta urgente
    │
Consultor abre Lead Modal
    │  ├─→ Auto-trigger recalculateStrategy() se análise >8h
    │  ├─→ Elite Closer (Claude/GPT-4o) → diagnóstico + 3 scripts
    │  ├─→ TacticalAction exibe: próxima ação, scripts, botão de proposta
    │  └─→ Gerar Proposta → GPT-4o → 3 cenários de financiamento
    │
Consultor corrige score (ScoreBadgeWithFeedback)
    │  └─→ ai_feedback table → categoria + motivo + contexto
    │        └─→ Próximo scoring inclui feedback como contexto
    │
    ▼
Loop de Aprendizado Contínuo
```

---

## 11. PROMPTS E ENGENHARIA DE PROMPTS

### Padrões principais:

1. **Elite Closer** — "Especialista Elite de Vendas da Manos Veículos"
   - Temp: 0.25 (determinístico)
   - Output: JSON estruturado com diagnóstico + orientação + script
   - Scoring: 0-30 (sem intenção), 31-60 (frio/morno), 61-85 (quente), 86-100 (fechamento iminente)

2. **Director Comercial** (Claude) — "Diretor Comercial Sênior — 20 anos de experiência"
   - Framework de 200 linhas com regras detalhadas
   - Foco: matchmaking com estoque, probabilidade de fechamento

3. **Sales Copilot** — "Copiloto de vendas cirúrgico"
   - Foco: objeções diagonais, intenção real, prova de orçamento
   - Output: score, sentimento, intenções, perfil comportamental

4. **Growth Ninja** (Marketing) — Especialista em Facebook Ads
   - KPIs: CPL, CTR, CPC, CPM, frequência
   - Thresholds: CPL >R$50 crítico, <R$15 excelente

---

## 12. SEGURANÇA

- **Chaves de API** armazenadas em `.env.local` (não commitadas)
- **RLS** habilitado em tabelas sensíveis (leads, interactions, ai_feedback)
- **Service Role Key** para operações admin (bypass RLS)
- **Rate limiting** via delays entre batches (600ms) e maxDuration por rota
- **Extensão Chrome** autenticada via `EXTENSION_API_SECRET`

---

## 13. STATUS POR FASE DO ROADMAP

### Fase 1 — Enriquecimento Passivo ✅ COMPLETA
- [x] Score IA real em todos os cards/modais/dashboards
- [x] Auto-análise na criação do lead
- [x] Recálculo noturno em batch
- [x] Normalização de interesse veicular

### Fase 2 — Assistência Ativa 🔄 EM PROGRESSO
- [x] Briefing diário personalizado
- [x] Geração de propostas de financiamento
- [x] Detecção de churn
- [x] Briefing de handoff
- [ ] Busca semântica (parcial — precisa setup pgvector)
- [ ] Triggers automáticos em mudança de status

### Fase 3 — Automação Total 📋 PLANEJADA
- [ ] Follow-ups totalmente automáticos com gates de segurança
- [ ] Auto-detecção de intenção de compra via WhatsApp
- [ ] Redistribuição inteligente de leads
- [ ] Dashboard avançado de categorização de perdas

---

## 14. NÚMEROS E MÉTRICAS

- **20+ endpoints** de API com IA
- **3 provedores** de LLM (OpenAI, Google, Anthropic)
- **5 modelos** diferentes em uso
- **5 cron jobs** automatizados
- **100 leads/dia** processados em batch scoring
- **500 leads/dia** avaliados para churn
- **30 leads/ciclo** recebem follow-up automático
- **3 scripts** gerados por análise de lead
- **3 cenários** de proposta por lead
- **1536 dimensões** por embedding vetorial
