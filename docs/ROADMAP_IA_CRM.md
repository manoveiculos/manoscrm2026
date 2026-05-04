# ROADMAP_IA_CRM.md
# Manos CRM — Transformação AI-First

> Versão 1.1 — 26/03/2026
> Metodologia: Cognitive Walkthrough × Jobs-to-be-Done
> Stack IA: OpenAI GPT-4o, Google Gemini, Supabase pgvector (futuro)

---

## DIAGNÓSTICO: O QUE JÁ EXISTE

| Recurso | Onde | Status |
|---|---|---|
| Elite Closer V3 (análise de chat) | `/api/extension/analyze-chat` | ✅ Produção |
| Next Steps com feedback-aware | `/api/lead/next-steps` | ✅ Produção |
| AI Feedback Loop | `aiFeedbackService.ts` | ✅ Produção |
| Score heurístico (local, client-side) | `calculateLeadScore()` no LeadCardV2 | ⚠️ Limitado |
| Arsenal de scripts | `/api/extension/arsenal` | ✅ Estático |
| SLA bars por estágio | `LeadCardV2` | ✅ Visual Only |
| `TacticalAction` + `ScoreBadgeWithFeedback` | DashboardTab | ✅ Produção |

### Lacunas críticas identificadas

**Lacuna 1 — Score falso no card e no modal**
`useLeadScore` inicia com `lead.ai_score` mas o `useEffect` **sobrescreve** com o heurístico `calculateLeadScore()`. Resultado: mesmo quando a IA calculou um score real e o salvou no banco, o `ScoreBadgeWithFeedback` exibe o score heurístico. O feedback loop está calibrando um número que o usuário nunca vê.
→ Arquivos: `useLeadScore.ts:17-24`, `LeadCardV2.tsx:41-51`

**Lacuna 2 — Fluxo de Conclusão não persiste (BUG)**
No `LeadProfileModalV2.tsx:480-482`, o `handleSaveFinish` passado para `DashboardTab` é `() => setShowFinishing(false)`. Ele fecha o modal de conclusão mas **não salva nada no banco**. Vendas, compras e perdas não estão sendo registradas via este fluxo.
→ Arquivo: `LeadProfileModalV2.tsx:480`

**Lacuna 3 — IA reativa. Precisa ser proativa.**
Score só é calculado pela IA quando o vendedor clica "Recalcular" manualmente. Não há trigger automático na abertura do modal, na mudança de status ou na chegada de mensagem.

---

## COGNITIVE WALKTHROUGH — PIPELINE DE VENDAS

> Para cada interação do usuário na tela, mapeamos o que a IA pode fazer.

### Tela: Pipeline (`/v2/pipeline`)

---

#### 1. ABERTURA DA PÁGINA — `useEffect → loadLeads()`

**Ação atual:** Carrega leads do banco, calcula score localmente.

**Oportunidade IA:**
- **IA proativa no load:** Ao carregar, a API pode retornar um campo `ai_priority_rank` pré-calculado por um job noturno (cron). Os leads seriam ordenados pela IA, não por data.
- **Briefing matinal:** Um banner no topo do Pipeline gerado por IA: *"Bom dia, João. Você tem 3 leads quentes que não receberam contato há mais de 24h. Recomendo começar por eles."*
- **Detecção de anomalias:** IA identifica se um lead passou de NEGOCIAÇÃO de volta para TRIAGEM (regressão no funil) e alerta o gestor.

---

#### 2. CARD DO LEAD — `LeadCardV2`

**Ações atuais:** Visualizar nome, score heurístico, interesse, SLA bar, botão Mover, botão WhatsApp (Quick Strike).

**Oportunidade IA por elemento:**

| Elemento no Card | Hoje | Com IA |
|---|---|---|
| **Score (número %)** | Heurístico local (status + tempo) | Score real do banco (`ai_score`) + recálculo incremental via webhook quando nova mensagem chega |
| **Cor do tempo** (verde→vermelho) | Baseado em horas desde criação | Baseado em **predição de churn**: IA aprende que leads deste perfil esfriam em X horas |
| **SLA Bar** | Cronômetro fixo por estágio | SLA **dinâmico por perfil de lead**: leads de Instagram têm janela menor que Google Ads |
| **Label HOT/WARM/COLD** | Derivado do score heurístico | Label da última análise do Elite Closer, sempre atualizado |
| **Botão "Quick Strike" (⚡)** | Abre WhatsApp com `proxima_acao` ou fallback genérico | **IA garante que `proxima_acao` está sempre populado** — gerado automaticamente na entrada do lead |
| **Interesse do veículo** | Campo livre | IA normaliza e infere o modelo exato a partir do texto bruto do formulário |

---

#### 3. ARRASTAR CARD ENTRE COLUNAS — `handleDrop → onStatusChange`

**Ação atual:** Atualiza `status` no banco. Nenhuma IA é acionada.

**Oportunidade IA (alto impacto):**
- **Trigger automático pós-mudança de estágio:** Ao mover para ATAQUE ou FECHAMENTO, a API de Next Steps é chamada em background silencioso. Quando o vendedor abre o lead, o script já está pronto.
- **Bloqueio inteligente:** Ao tentar mover para FECHAMENTO sem que o lead tenha `vehicle_interest` preenchido, a IA exibe: *"Confirmar interesse no veículo antes de avançar para fechamento?"*
- **Sugestão de redistribuição:** Se um consultor tem 8 leads em FECHAMENTO ao mesmo tempo, IA alerta o gestor para redistribuir.

---

#### 4. BOTÃO "MOVER" (`MoveMenu`) — mudança de status manual

**Ação atual:** Dropdown com os estágios. Seleciona e salva.

**Oportunidade IA:**
- **Justificativa de regressão:** Ao mover um lead para um estágio ANTERIOR (ex: de ATAQUE de volta para TRIAGEM), IA pede motivo e usa como dado de treinamento para calibrar o modelo.
- **Próximo estágio recomendado destacado:** IA destaca qual é o próximo passo recomendado com base na conversa, em vez de listar todos igualmente.

---

#### 5. FILTRO DE SCORE — `filterScore`

**Ação atual:** Filtro manual: Quente/Morno/Frio/Gelado. Usa `l.ai_score || 0`.

**Oportunidade IA:**
- **Filtro "Fechar Hoje":** IA cria um segmento dinâmico — leads com alta probabilidade de fechar HOJE com base em padrão histórico (dia da semana, tempo no funil, última interação).
- **Filtro "Resgatar":** Leads que estão esfriando mas têm perfil histórico de reaquecimento. IA prioriza o contato.

---

#### 6. CAMPO DE BUSCA — `searchTerm`

**Ação atual:** Busca textual simples em nome, telefone, interesse, fonte.

**Oportunidade IA:**
- **Busca semântica:** *"Quem quer um SUV com entrada"* → retorna leads com `vehicle_interest` contendo SUVs e `valor_investimento` acima de zero.
- Implementação: Embeddings com `pgvector` no Supabase.

---

#### 7. BOTÃO "+ NOVO" — `NewLeadModalV2`

**Ação atual:** Formulário manual. Salva lead com status `new`.

**Oportunidade IA:**
- **Classificação automática na criação:** Ao salvar, API de Next Steps é chamada com os dados do formulário. Lead já nasce com `ai_score`, `proxima_acao` e `classificacao` populados.
- **Autocompletar veículo:** IA sugere o veículo do estoque mais próximo ao interesse digitado.
- **Detecção de duplicata:** IA verifica se o telefone/nome já existe com outro status e alerta.

---

#### 8. CONTADORES DO HEADER — `counters.total / elite / emergency`

**Ação atual:** Contagem simples de leads por score.

**Oportunidade IA:**
- **Previsão de fechamento do dia:** *"Probabilidade de fechar 2 vendas hoje: 73%"* (modelo treinado no histórico da Manos).
- **Anomalia de funil:** *"3 leads em FECHAMENTO há mais de 48h sem progresso — atenção."*

---

## COGNITIVE WALKTHROUGH — MODAL DO LEAD (`LeadProfileModalV2`)

> Painel lateral que abre ao clicar em qualquer lead. 6 abas: Visão Geral, Timeline, Ações, Arsenal, Troca, Crédito.

---

#### 1. ABERTURA DO MODAL — `useLeadScore` + `useLeadData`

**Ação atual:** Carrega dados do lead, calcula score heurístico via `useLeadScore`. Nenhuma IA é acionada automaticamente.

**Bug identificado:** `useLeadScore` inicia com `lead.ai_score` mas o `useEffect` sobrescreve com `calculateLeadScore()`. O `ScoreBadgeWithFeedback` exibe o heurístico, nunca o score real da IA.

**Oportunidade IA:**
- **Auto-análise silenciosa na abertura:** Se `lead.ai_score` não foi atualizado nas últimas 4h, chama `/api/lead/next-steps` em background. Ao término, atualiza o badge sem interromper o fluxo.
- **`useLeadScore` corrigido:** Priorizar `lead.ai_score` do banco. Heurístico só como fallback quando `ai_score` é zero.

---

#### 2. `ScoreBadgeWithFeedback` — feedback dos vendedores

**Ação atual:** Vendedor clica, seleciona categoria de erro, escreve justificativa. Salva na tabela `ai_feedback`. Timeline recebe uma nota.

**O que funciona bem:** A UI é excelente. O dado salvo é rico (dias no funil, total de interações, última interação).

**Gaps e oportunidades:**
- **Feedback não dispara re-análise imediata.** Após `onScoreUpdated`, `recalculateStrategy` é chamado — mas esse fluxo busca WhatsApp antes de chamar a API. Se não há mensagens, o contexto do feedback não é aproveitado de imediato.
- **Sem dashboard de calibração.** Os dados de `ai_feedback` estão sendo coletados mas não há tela para o gestor ver: "IA acertou X% esta semana", "erro mais comum: score_alto_demais".
- **Oportunidade Fase 2:** Tela de "Calibração da IA" no Pulse — gráfico de acurácia do score ao longo do tempo.

---

#### 3. `TacticalAction` — seção "Próxima ação IA"

**Ação atual:** Exibe `lead.proxima_acao || lead.next_step || fallbackAction`. Botão "Recalcular" chama `recalculateStrategy()`. "Executar ação" vai para a aba Follow-up.

**Gaps:**
- `fallbackAction` é um texto genérico estático — quando não há análise, o vendedor vê instrução vaga.
- Botão "Executar ação" só navega para a aba — não pré-seleciona o template certo para o estágio.

**Oportunidade IA:**
- **Fallback inteligente:** Quando `proxima_acao` é vazio, gerar um script mínimo baseado apenas no estágio e na origem (sem GPT-4o completo — usar GPT-4o mini, custo ~10x menor).
- **"Executar ação" com contexto:** Ao clicar, navegar para Follow-up e pré-selecionar o template que a IA recomendou, não o primeiro da lista.

---

#### 4. `handleSaveFinish` — conclusão de venda / compra / perda ⚠️ BUG CRÍTICO

**Ação atual:** O handler passado é `() => setShowFinishing(false)`. Fecha o modal de conclusão mas **não persiste nada no banco**.

**Impacto:** Todas as vendas, compras e perdas registradas via este fluxo se perdem. Não alimentam o histórico, não atualizam o status do lead, não geram interação na timeline.

**O que precisa ser implementado (Fase 1 — urgente):**
- Salvar `status = 'vendido'` ou `'perdido'` no lead
- Inserir linha em `sales` (venda) ou `purchases` (compra)
- Registrar motivo de perda em `interactions_manos_crm` com `type: 'loss'`
- **IA pós-conclusão:** Após registrar perda com motivo, chamar classificação automática da categoria (item 3.5 do roadmap) via GPT-4o mini.

---

#### 5. ABA ARSENAL — `ArsenalTab`

**Ação atual:** Lista veículos do estoque. Vendedor vincula manualmente ao lead.

**Oportunidade IA:**
- **Recomendação automática de veículo:** Ao abrir a aba, IA filtra o estoque pelos critérios do lead (`vehicle_interest`, `valor_investimento`, `carro_troca`) e destaca os 3 melhores matches no topo.
- **Trigger pós-vínculo:** Quando `handleVincularVeiculo` é chamado, dispara re-análise em background — agora com veículo específico no contexto.

---

#### 6. ABA TROCA — `TradeInTab`

**Ação atual:** Formulário para dados do veículo de troca. Salva via `handleSaveField`.

**Oportunidade IA (Fase 2):**
- **Consulta FIPE automática:** Ao preencher marca/modelo/ano, IA busca a tabela FIPE e retorna a faixa de valor de avaliação. Vendedor tem argumento imediato na negociação.
- **Score de troca:** IA avalia se o veículo de troca é vantajoso para a Manos com base no estoque atual e demanda.

---

#### 7. ABA CRÉDITO — `FinancingTab`

**Ação atual:** Componente vazio (`<FinancingTab />`). Não tem nenhuma funcionalidade implementada.

**Oportunidade IA (Fase 2 — tela inteira a construir):**
- **Simulador de financiamento:** Dado o valor do veículo + entrada informada + perfil do lead, IA gera 3 cenários de parcelamento (24x / 36x / 48x) com taxas realistas.
- **Score de crédito estimado:** Com base em dados do lead (profissão, região, valor de interesse), IA estima perfil de crédito e alerta se há risco de reprovação pelo banco.

---

#### 8. ABA TIMELINE — filtro `ai_analysis`

**Ação atual:** Exibe eventos históricos. Filtro "Orientação IA" existe mas depende de análises anteriores salvas como nota.

**Oportunidade IA:**
- **Resumo da timeline:** Botão "Resumir conversa" → IA gera um parágrafo explicando o histórico completo do lead para o vendedor que está pegando o lead de outro colega.
- **Detecção de padrão de objeção:** IA analisa todas as notas e identifica a objeção recorrente do cliente (ex: "sempre fala de preço alto") e exibe no topo da timeline.

---

## FASES DE IMPLANTAÇÃO

---

### FASE 1 — Enriquecimento Passivo
> **Meta:** IA lendo dados, pontuando e resumindo. Zero mudança no workflow do vendedor.
> **Prazo estimado:** 2–3 semanas

#### 1.1 Score Real no Card (maior impacto visual imediato)
- **Problema:** `LeadCardV2` usa `calculateLeadScore()` heurístico. `ai_score` do banco é ignorado no card.
- **Solução:** Substituir `scoreVal` por `lead.ai_score` quando disponível, com fallback para o heurístico.
- **Arquivo:** [LeadCardV2.tsx](src/app/v2/pipeline/components/LeadCardV2.tsx#L41-L51)

#### 1.2 Score Auto-populado na Criação do Lead ✅ ENTREGUE
- **Trigger:** `POST /api/extension/create-lead` e `NewLeadModalV2` → chama `/api/lead/init-score` em background (fire-and-forget).
- **Resultado:** Lead nasce com `ai_score`, `proxima_acao`, `ai_classification` já preenchidos.
- **Arquivos:**
  - `src/app/api/lead/init-score/route.ts` — nova rota GPT-4o mini (ai_score, ai_classification, proxima_acao, vehicle_interest normalizado)
  - `NewLeadModalV2.tsx` — fire-and-forget após `onSuccess(newLead)`
  - `extension/create-lead/route.ts` — fire-and-forget após insert
  - `webhook/facebook-leads/route.ts` — `next_step` e `proxima_acao` agora persistidos junto com `ai_reason`

#### 1.3 Cron de Recálculo Noturno ✅ ENTREGUE
- **Job:** Todo dia às 07h00 UTC (04h00 BRT), recalcula `ai_score` de leads ativos sem análise.
- **Lógica:** Processa até 100 leads com `ai_score = 0` ou `null`, em batches de 5 com 600ms de intervalo.
- **Tabela:** Atualiza `leads_manos_crm.ai_score`, `ai_classification`, `next_step`, `proxima_acao`, `vehicle_interest` em batch.
- **Arquivos:**
  - `src/app/api/cron/ai-score-refresh/route.ts` — novo cron GPT-4o mini em batch
  - `vercel.json` — schedule `"0 7 * * *"` adicionado

#### 1.4 Normalização de Interesse de Veículo ✅ ENTREGUE
- **Problema:** `vehicle_interest` vem como texto livre: "quero um hb20", "HB 20 1.0", "hatch barato".
- **Solução:** Tanto `init-score` quanto `ai-score-refresh` normalizam para `Marca Modelo Ano` via GPT-4o mini — campo `vehicle_interest_normalized` no JSON de resposta.

---

### FASE 2 — Assistência Ativa
> **Meta:** IA sugerindo a próxima melhor ação, automaticamente, no momento certo.
> **Prazo estimado:** 3–5 semanas após Fase 1

#### 2.1 Trigger de IA na Mudança de Estágio
- **Quando:** `handleStatusChange` é chamado (drag ou MoveMenu).
- **O que:** Para mudanças para `ataque` ou `fechamento`, chama `/api/lead/next-steps` em background.
- **UX:** Quando o vendedor abre o lead minutos depois, a análise já está pronta. Sem espera.

#### 2.2 Briefing Matinal (AI Daily Brief)
- **Componente:** Banner no topo do Pipeline, renderizado uma vez por dia.
- **Conteúdo gerado por IA:** Resumo dos leads prioritários, alertas de SLA, previsão do dia.
- **API:** `GET /api/ai/daily-brief?consultantId=X` — cached por 4h no Supabase.

#### 2.3 Assistente de Proposta (no Modal do Lead)
- **Onde:** Aba "Dashboard" do `LeadProfileModalV2`, seção `TacticalAction`.
- **Funcionalidade:** Botão "Gerar Proposta Completa" → IA cria PDF ou texto formatado com dados do lead + veículo do estoque + condições de financiamento.
- **Contexto usado:** `vehicle_interest`, `valor_investimento`, `carro_troca`, estoque atual.

#### 2.4 Busca Semântica no Pipeline
- **Implementação:** `pgvector` no Supabase. Campo `embedding` na tabela `leads_manos_crm`.
- **Geração:** Embedding gerado na criação/atualização do lead a partir de nome + interesse + histórico resumido.
- **UX:** Input de busca aceita linguagem natural.

#### 2.5 Filtro "IA Recomenda Hoje"
- **Lógica:** Segmento dinâmico calculado pelo cron noturno. Marca leads com `ai_priority_today = true`.
- **UX:** Chip de filtro no Pipeline: `★ IA Recomenda (X)`.

---

### FASE 3 — Automação Total
> **Meta:** IA executando tarefas de background no funil sem intervenção humana.
> **Prazo estimado:** 5–8 semanas após Fase 2

#### 3.1 Follow-up Automático Inteligente
- **Trigger:** Lead fica X horas sem contato em determinado estágio (configurável por role Admin).
- **Ação:** IA gera mensagem de reengajamento + cria `followup` com `type: 'ai_auto'` na tabela.
- **Controle:** Vendedor recebe notificação push/WhatsApp com a mensagem sugerida e aprova ou edita antes do envio. IA não envia sem confirmação humana (safety gate).

#### 3.2 Detecção de Intenção de Compra via WhatsApp
- **Trigger:** Nova mensagem sincronizada via extensão (`/api/extension/sync-messages`).
- **Ação:** IA analisa se a mensagem contém sinal de compra imediato (ex: "quanto de entrada?", "quando posso buscar?"). Se sim, eleva `ai_score` para 90+ e cria alerta para o vendedor.
- **Latência alvo:** < 30 segundos após recebimento da mensagem.

#### 3.3 Redistribuição Automática de Leads
- **Trigger:** Lead sem interação há N horas (N configurável pelo Admin).
- **Ação:** IA verifica se o consultor responsável tem capacidade. Se não, sugere redistribuição ao gestor via notificação.
- **Regra:** Nunca redistribui automaticamente — sempre passa pelo Admin. IA apenas recomenda.

#### 3.4 Modelo Preditivo de Churn
- **Dado de treino:** Histórico de leads perdidos (`status = perdido`) com features: tempo no funil, interações, origem, veículo, score.
- **Output:** `churn_probability` (0-100) por lead. Atualizado diariamente pelo cron.
- **UX:** Ícone de alerta `⚠` no card quando `churn_probability > 70`.

#### 3.5 Auto-classificação de Motivo de Perda
- **Quando:** Lead movido para `perdido` com motivo preenchido em texto livre.
- **Ação:** IA classifica em categorias padronizadas: `preco`, `concorrente`, `sem_interesse`, `sem_resposta`, `credito_negado`, `outro`.
- **Uso:** Dados alimentam dashboard de análise de causa-raiz de perdas.

---

## PRÓXIMOS PASSOS IMEDIATOS

### Dissecção Prioritária — Sprint Atual

**Tela 1: Pipeline de Vendas** ✅ Dissecado + ✅ Entregue
→ `LeadCardV2.tsx` — score usa `ai_score` do banco com fallback heurístico

**Tela 2: Modal do Lead** ✅ Dissecado + ✅ Entregue
→ `useLeadScore.ts` — corrigido: prioriza `ai_score`, heurístico apenas como fallback
→ `LeadProfileModalV2.tsx` — `handleSaveFinish` implementado (bug crítico corrigido)
→ `src/app/api/lead/finish/route.ts` — nova API: persiste venda/compra/perda + classifica motivo com GPT-4o mini

**Tela 3: Central de Leads (`/v2/leads`)** ✅ Dissecado + ✅ Entregue
→ `leads/page.tsx` — filtro de score usa `ai_score` com fallback heurístico

**Tela 4: Pulse (`/v2/pulse`)** ✅ Dissecado + ✅ Entregue
→ `pulse/page.tsx` — `leadsWithScores` usa `ai_score` com fallback heurístico
→ Seções "Missão de Elite" e "Em Fechamento" agora refletem score real da IA

**Fase 1 — COMPLETA ✅**
→ 1.1 — Score real no card (LeadCardV2, useLeadScore, leads/page, pulse/page) ✅
→ 1.2 — Auto-análise na criação de lead (init-score, NewLeadModalV2, extension, webhook) ✅
→ 1.3 — Cron noturno de recálculo de score em batch (ai-score-refresh + vercel.json) ✅
→ 1.4 — Normalização de interesse de veículo na entrada do lead ✅

**Próxima fase — Fase 2: Assistência Ativa**
→ 2.1 — Trigger de IA na mudança de estágio (handleStatusChange → /api/lead/next-steps)
→ 2.2 — Briefing Matinal (/api/ai/daily-brief)
→ 2.3 — Assistente de Proposta no Modal do Lead
→ 2.4 — Busca Semântica (pgvector)
→ 2.5 — Filtro "IA Recomenda Hoje"

---

## PRINCÍPIOS ARQUITETURAIS

1. **IA como co-piloto, não autopiloto.** Fase 1 e 2 apenas sugerem. Fase 3 automatiza fluxos de baixo risco com safety gates humanos.
2. **Latência percebida zero.** IA roda em background; quando o vendedor abre o lead, já encontra a análise pronta.
3. **Feedback loop fechado.** `ScoreBadgeWithFeedback` é o principal mecanismo de treino contínuo. Cada correção do vendedor melhora os próximos scores.
4. **Sem chamadas de IA em `render`.** Todas as chamadas são feitas em `useEffect`, handlers de evento ou crons — nunca bloqueiam a UI.
5. **Custo controlado.** Fase 1 usa GPT-4o mini para tarefas simples (normalização, classificação). GPT-4o completo apenas para análise de chat e propostas.

---

---

## COGNITIVE WALKTHROUGH — CENTRAL DE LEADS (`/v2/leads`)

> Tela de listagem completa. Mesma estrutura de filtros do Pipeline, com visão global de todos os leads da Manos.

---

#### 1. FILTRO DE SCORE — `calculateLeadScore` inline no `filteredLeads`

**Problema idêntico ao Pipeline:** O filtro "Quente/Morno/Frio/Gelado" recalcula o score heurístico inline na função de filtragem (`leads/page.tsx:197-204`). Ignora `lead.ai_score` do banco.

**Fix (Fase 1):** Substituir por `lead.ai_score || calculateLeadScore(...)` para dar prioridade ao score real da IA.

---

#### 2. FILTRO "SEM VENDEDOR" — leads órfãos

**Ação atual:** Admin filtra por `consultant = none` para ver leads sem atribuição. Totalmente manual.

**Oportunidade IA (Fase 2):**
- **Auto-sugestão de atribuição:** Ao filtrar "Sem Vendedor", IA analisa perfil de cada lead (origem, veículo, região) e sugere qual consultor tem mais afinidade histórica com esse perfil.
- **Badge de compatibilidade:** No card, IA exibe `Consultor sugerido: João (87% match)` baseado em taxa de conversão histórica por origem/interesse.

---

#### 3. `handleStatusChange` — mudança de status sem IA

**Ação atual:** Atualiza `status` no banco e no estado local. Zero IA acionada.

**Oportunidade IA:** Igual ao Pipeline — trigger silencioso de Next Steps ao avançar para `ataque` ou `fechamento`.

---

#### 4. `handleConsultantChange` — atribuição de lead

**Ação atual:** Admin reatribui lead para outro consultor. Atualiza `assigned_consultant_id` e `primeiro_vendedor`.

**Oportunidade IA (Fase 2):**
- **Contexto de handoff:** Ao reatribuir, IA gera automaticamente um resumo do histórico do lead para o novo consultor: *"Este lead veio do Facebook, mostrou interesse em SUV, última resposta há 3 dias. Tom: receptivo. Objeção: preço."*
- **Notificação inteligente:** Novo consultor recebe o resumo + script de retomada gerado pela IA antes mesmo de abrir o lead.

---

#### 5. BOTÃO REFRESH — `dataService.getLeads()`

**Ação atual:** Recarrega todos os leads sem parâmetros (sem filtro de consultor — bug de segurança: admin pode ver todos, consultor deveria só ver os seus).

**Oportunidade IA (Fase 2):**
- **Refresh inteligente:** Ao recarregar, API retorna apenas leads com mudanças desde o último load, com flag `ai_score_changed: true` para highlights visuais.

---

## COGNITIVE WALKTHROUGH — PULSE (`/v2/pulse`)

> Dashboard de missão diária. Agrupa leads por urgência, mostra agendas, leads órfãos e métricas financeiras.

---

#### 1. `leadsWithScores` — score heurístico em TODOS os buckets

**Problema:** `pulse/page.tsx:161-170` recalcula `calculateLeadScore()` para todos os leads e cria `tactical_score`. O bucket `closingLeads` filtra por `tactical_score >= 80` — mas este score ignora `ai_score`.

**Impacto direto:** A seção "Missão de Elite" e "Em Fechamento" exibem leads baseados no score heurístico. Leads com `ai_score` alto da IA (calculado pelo Elite Closer) podem estar sendo omitidos.

**Fix (Fase 1):** `const score = lead.ai_score > 0 ? lead.ai_score : calculateLeadScore(...)`.

---

#### 2. `DailyMissionHeader` — header estático

**Ação atual:** Exibe contagem de vendas do mês, total de leads, tempo médio de resposta e taxa de resposta (vem de `getFinancialMetrics`).

**Oportunidade IA (Fase 2 — briefing matinal):**
- **Texto gerado por IA:** *"Bom dia, João. Hoje é quinta, dia historicamente forte para fechar. Você tem 2 leads quentes sem contato há 18h e 1 agenda às 14h. Comece por Carlos Silva."*
- **Cached por 4h** em Supabase para não chamar GPT toda vez que a página carrega.
- **API:** `GET /api/ai/daily-brief?consultantId=X&date=YYYY-MM-DD`

---

#### 3. `AIOpportunityCard` — card de "Missão de Elite"

**Ação atual:** Exibe lead com score alto. Tem botão de ação que abre o modal.

**Oportunidade IA (Fase 2):**
- O card já tem o nome `AIOpportunityCard` mas não tem nenhum conteúdo gerado por IA.
- **Enriquecer com:** diagnóstico curto da IA (`lead.ai_reason`), script sugerido (`lead.proxima_acao`), e botão "Copiar Script" que já envia o texto gerado para o WhatsApp.

---

#### 4. Alerta de leads órfãos — `orphanedLeads`

**Ação atual:** Exibe banner vermelho com contagem. Botão redireciona para Central de Leads filtrada.

**Oportunidade IA (Fase 2):**
- **Sugestão de distribuição:** Ao clicar em "Resolver Agora", IA propõe distribuição automática baseada na carga atual de cada consultor e compatibilidade histórica com o perfil do lead. Gestor confirma com 1 clique.

---

#### 5. Seção "Agendas" — `scheduledLeads`

**Ação atual:** Lista leads com status `scheduled` ou `fechamento` ou `scheduled_at` futuro.

**Oportunidade IA (Fase 2):**
- **Preparação automática:** 1 hora antes de cada agenda, IA gera um briefing: *"Daqui 1h: visita de Pedro Alves. Interesse: Corolla 2022. Última mensagem: perguntou sobre financiamento. Script de entrada sugerido: [...]"*
- **Implementação:** Cron a cada 30min verifica agendas próximas e gera briefing para o consultor via notificação.

---

#### 6. Métricas financeiras — `getFinancialMetrics`

**Ação atual:** `salesCount`, `avgResponseTime`, `responseRate` do mês atual.

**Oportunidade IA (Fase 3):**
- **Previsão de fechamento do mês:** Com base no histórico + leads em `fechamento` + sazonalidade, IA projeta quantas vendas serão fechadas até o fim do mês.
- **Identificação de padrão de perda:** *"Este mês, 60% das perdas são por 'preço'. Considere criar uma condição especial de entrada."*
- **Dashboard de calibração do modelo:** Gráfico de acurácia do `ScoreBadgeWithFeedback` — quantos feedbacks foram "score_alto_demais" vs "score_baixo_demais" nos últimos 30 dias.

---

*Documento vivo — atualizar ao final de cada sprint com o que foi entregue e o que mudou.*
