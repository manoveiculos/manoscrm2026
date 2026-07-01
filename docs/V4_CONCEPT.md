# Manos CRM — V4 Concept

> **Documento de arquitetura oficial.** Relatório de Engenharia de Desempenho e Assertividade Comercial.
> Versão: 1.0 · Data: 2026-06-09 · Autor: auditoria macro (Claude) via MCP Supabase + inspeção de código.
> Status: **diagnóstico fechado, plano de correção em aberto** (frentes 1 e 2 priorizadas — ver §6).
> Regra deste doc: número cru primeiro, opinião depois. Toda métrica abaixo foi medida em produção na data acima.

---

## 0. Sumário executivo — os 6 números que explicam tudo

| Métrica | Valor real em produção (2026-06-09) | Leitura |
|---|---|---|
| Conversão da tabela principal `leads_distribuicao_crm_26` (982 leads) | **3 vendidos = 0,30%** | 426 mortos (225 `lost_by_inactivity` + 201 `lost`), 338 `frio` nunca trabalhados |
| Cobertura de atendimento (últimos 30d, mesma tabela) | **198 de 222 leads NUNCA contatados (89%)** | O gargalo não é velocidade — é que ninguém toca no lead |
| `inactivity_alerts` | **459 alertas, 0 reconhecidos (0%)** | A cobrança escreve numa tabela que **nenhuma linha de código lê** |
| `ai_sdr_queue` (motor de reversão) | **257 de 260 jobs MORTOS** (attempts ≥ 5) | Erro dominante: `telefone_invalido` (179) |
| Matchmaking semântico (pgvector instalado) | **0 de 2.116 leads com embedding; estoque sem embedding** | Cruzamento preditivo é 100% ficção hoje |
| `lead_kpis_daily` (14 dias) | **0 vendas, 0,00% conversão TODOS os dias** | Parte é bug de medição (atribuição quebrada), parte é realidade |

**Tese central:** a estratégia da Manos é tração agressiva de pátio; a arquitetura atual é **passiva e write-only**. O sistema *mede e rotula* a morte do lead, mas nunca *age* sobre ela. Toda a capacidade moderna (pgvector, pgmq, pg_net, pg_cron) está **instalada e desligada**.

---

## 1. Diagnóstico do "Limo do Funil"

### 1.1 Fricção operacional — o problema é cobertura, não velocidade
Quando um lead é tocado, é tocado em **1,1 min em média** (24/24 contatos em < 5 min). O CRM é rápido na exceção. O drama é o volume que **nunca entra no atendimento**: 89% dos leads de 30 dias não têm `first_contact_at`; 338 `frio` + 64 `received` apodrecem sem dono.

Causa raiz — o modelo **"Fila de Pesca"**: o Inbox mostra `assigned_consultant_id = me OR atendimento_iniciado_em IS NULL`. Lead sem dono fica boiando esperando alguém "pescar". Ninguém é obrigado a pescar → ninguém pesca. Soma-se `mask_phone_for_pesca()`: o telefone vem **mascarado** até o vendedor clicar "Iniciar Atendimento" — um clique de fricção *antes* do primeiro contato. É um **pull-system num time que precisa de push-system**.

### 1.2 O Mistério da Não-Cobrança — CONFIRMADO
`run_inactivity_monitor()` roda de fato (pg_cron jobid 13, `*/15 * * * *`, último run *succeeded*):
- 8h sem `ultima_interacao_humana` → `INSERT INTO inactivity_alerts (kind='warning_8h')`
- 24h → `UPDATE ... SET status='lost_by_inactivity'` **silenciosamente** + insere `auto_lost_24h`

**O furo (grep em todo o repositório):** `inactivity_alerts` é referenciada em apenas 3 arquivos — o `SKILL.md` (2×) e a migration que a criou. **Zero rotas, zero componentes, zero crons leem a tabela.** Não há toast, som, webhook ou badge ligado a ela. Por isso **0 de 459 alertas foram reconhecidos**: não há tela onde o alerta apareça. É uma **dead-letter table**. 226 leads foram mortos automaticamente sem ninguém ver.

> Agravante: existe um **segundo** mecanismo paralelo (`sla-watcher`, jobid 2, grava em `sla_escalations`, 73 linhas) competindo com o monitor. Dois sistemas de cobrança, nenhum fecha o loop até a tela do vendedor.

### 1.3 Churn precoce e falsos positivos
A trigger `enqueue_reversal_agent`, em qualquer lead perdido:
```
v_is_credit_issue := diagnostico ILIKE '%CPF Ruim%' OR ILIKE '%Sem margem%' OR ILIKE '%Score baixo%'
→ descarte_financeiro=true, archived_at=NOW(), arquiva. SEM triagem humana.
```
Um `ILIKE` em **texto livre** decide a morte do lead. E o caminho de recuperação está morto: dos 260 jobs de reversão, **257 mortos** com `telefone_invalido` (179), `outside_operating_hours` (38), `ai_prohibited_archived` (21). Ciclo real: **lead esfria → auto-`lost_by_inactivity` → trigger enfileira reversão → `telefone_invalido` → morre na fila → ninguém revisa.**

---

## 2. Arquitetura de Alto Desempenho (core reconstruído)

### 2.1 Camada de Dados — matar o `UNION ALL` e o split-brain de 4 tabelas
Não são 3 tabelas de lead, são **quatro**:

| Tabela | Linhas | No `leads_unified`? | Schema de atendimento? |
|---|---|---|---|
| `leads_master` | **2.062** | ❌ **NÃO** | ❌ não tem `ultima_interacao_humana`, `atendimento_iniciado_em`, `flagged_reversao`, `respondeu_follow_up` |
| `leads_distribuicao_crm_26` | 982 | ✅ | ✅ |
| `leads_manos_crm` | 54 | ✅ | ✅ |
| `leads_compra` | 28 | ✅ | ✅ |

**Split-brain:** `leads_master` é a maior tabela e a `sync-messages` resolve leads **contra ela primeiro** — mas ela está **fora** da view unificada. Consequências:
- 2.062 leads são **invisíveis** ao Inbox, Kanban e KPIs;
- `run_inactivity_monitor` **não varre** `leads_master`;
- a `sync-messages` tenta gravar `respondeu_follow_up` em `leads_master`, que **não tem essa coluna** → update falha silencioso (erro não checado).

**Performance:** `leads_unified` chama `mask_phone_for_pesca()` **por linha** sobre 3 full scans; `lead_kpis_daily` envolve `leads_unified` **de novo** com `EXISTS` correlacionado contra `sales_manos_crm` por linha.

**Atribuição de venda quebrada:** `lead_kpis_daily` casa `sales_manos_crm.lead_id = native_id`, mas `native_id` é bigint-as-text na distribuição e UUID nas outras → vendas reais **não batem** → dashboard mostra 0% em parte por bug de join.

**Alvo:** uma **única tabela canônica `leads`** com `flow_type` discriminador e **id space único (UUID)**. Particionada por `flow_type` ou mês de `created_at`. Zero views de `UNION ALL`. KPI vira **materialized view** com `REFRESH` agendado (pg_cron já existe), não cálculo em tempo de leitura.

### 2.2 Camada de Sincronização — pgmq já instalado e parado
`pgmq` (fila tipo SQS no Postgres) **instalado, não usado**. `pg_net` (HTTP assíncrono do banco) também. Hoje `sync-messages` faz, **dentro do request HTTP**: resolução de telefone com até ~10 queries `ilike '%sufixo%'` (wildcard à esquerda = seq scan) em 4 tabelas → e em seguida, **síncrono**, `runEliteCloser` (OpenAI, `maxDuration` 30s). É isso que congestiona o pool e segura o Next.js.

**Alvo:** webhook/extensão escreve o cru em `raw_messages` e **enfileira em pgmq** → retorna < 100ms. Worker dedicado (ou Edge Function) consome, resolve lead (com índice, não wildcard) e chama a IA fora do caminho crítico. Alertas de urgência saem por `pg_net` direto do banco.

### 2.3 Cache de Matchmaking — visão certa, infraestrutura zerada
`pgvector 0.8.0` instalado, mas **0 de 2.062 (`leads_master`) e 0 de 54 (`leads_manos_crm`) leads têm embedding**. `estoque` (35 carros) **não tem coluna de embedding**; `preco`, `km`, `ano` são **todos `text`** (sem cast não dá "SUV até 80k"). Matchmaking hoje = `ilike` de modelo.

**Alvo:** (1) normalizar `estoque` (`preco numeric`, `km int`, `ano int`); (2) embeddar cada carro; (3) **trigger/worker no insert do lead** que embedda o interesse e grava `top-3 estoque` num cache (`lead_matches` ou coluna `jsonb`); (4) índice `hnsw`. O card abre com os 3 carros **pré-calculados**.

---

## 3. Relatório de Produto — TER / TIRAR / IMPLEMENTAR

### ✅ DEVIA TER
- **Surface dos `inactivity_alerts`** — sino/inbox de alertas com som + badge, reconhecível. Dado já gerado (459 linhas); falta só a tela. **Maior ROI imediato, zero migration de dados.** → *Frente 2.*
- **Timer de SLA visível no card** — `created_at` e `ultima_interacao_humana` existem; falta o contador regressivo.
- **Atribuição forçada (zero lead órfão)** — `autoAssignService` existe mas não força; 402 leads sem dono.
- **Filtro de temperatura real + view "sem 1ª resposta há > Xh por consultor".**
- **Push nativo (Web Push)** de mensagem não respondida.

### ❌ DEVIA TIRAR
- **Um dos dois motores de reversão** (fila `enqueue_reversal_agent`→`ai-sdr-runner` vs query direta `followup-ai`). Redundantes; o da fila está 95% morto.
- **Os 16 produtores-fantasma** (`isReversal=false`, todos mortos) ainda inserindo na `ai_sdr_queue`.
- **Auto-arquivamento por `ILIKE` em texto livre** (`descarte_financeiro`) — frágil, mata lead por substring.
- **`mask_phone_for_pesca` como portão duro antes do contato** — clique de fricção + lookups lentos.
- **Topologia de 4 tabelas + views por-linha** (ver §2.1).

### 🚀 DEVIA IMPLEMENTAR
- **Ingestão assíncrona via pgmq** (§2.2) — destrava pool e front.
- **Matchmaking semântico pré-computado no insert** (§2.3).
- **Re-distribuição agressiva**: lead parado > Xh sem resposta → **volta pra Fila Geral com toast + som + webhook** via `pg_net`. Transforma o monitor passivo em **redistribuidor ativo**.
- **Leitura preditiva de engajamento** — latência de resposta do cliente (`raw_messages` timestamps) → temperatura real.
- **Conserto da atribuição de KPI** (id space único).

---

## 4. Conclusão estratégica — o descompasso

Três fraturas estruturais entre negócio e software:

1. **Monitora a morte, não age sobre ela.** `run_inactivity_monitor` grava 459 alertas que ninguém lê e mata 226 leads em silêncio. Motor de cobrança que escreve numa tabela sem leitor é **teatro de cobrança**.
2. **Modelo de pesca pressupõe vendedor caçador; o dado mostra o contrário** (89% nunca tocados). Pull-system onde o negócio precisa de push.
3. **A camada de IA está inerte** (Arthur desligado, Karol 95% morto, embeddings 0%, matchmaking só texto). Na prática é um **CRM manual com automações quebradas penduradas** — todo o peso em 3 humanos que tocam 11% do volume.

O código não limita a agressividade por falta de capacidade — a capacidade está instalada e desligada. Limita porque **fecha o loop de medição mas nunca o loop de ação**. Falta o último elo: do sinal → para a tela/som/atribuição do vendedor.

---

## 5. Segurança — RLS (multi-tenant, exige cirurgia)

O advisor do Supabase acusa **RLS desabilitado em 45 tabelas**, incluindo dados da loja: `dados_cliente` (1.360 clientes), `leads_distribuicao` (320), `whatsapp_send_log`, `sla_config`, `sla_escalations`, `concessionaria_mensagens`, `financiamentos_realizados`.

Achados que condicionam o plano:
- **O banco é multi-tenant.** Hospeda beachtennis, psicóloga, sorteios, copa26, vyro, raccarrepassadora, associação, nivermanos. Várias das 45 tabelas **não são da Manos** — ligar RLS nelas pode derrubar outros apps. **Só tocar tabelas da loja.**
- **O frontend Manos usa a `anon key` no browser** (`src/lib/supabase/client.ts`, `src/lib/supabase.ts`) e há client components lendo direto tabelas sensíveis (`LeadProfileModalV2`, `useLeadTimeline`, `useLeadFollowUp`, incl. `whatsapp_messages` com realtime). Hoje qualquer um com a anon key (pública, vai pro browser) lê dados de cliente — **este é o buraco**.
- **Consequência operacional:** `ENABLE ROW LEVEL SECURITY` **sem policy quebra essas telas**. RLS tem que vir **com policies para o papel `authenticated`** (e service-role já bypassa, então as rotas server-side seguem funcionando).
- **Pré-requisito:** confirmar que o app loga usuários via Supabase Auth (há `authenticated` JWT) antes de escrever as policies.

---

## 6. Roadmap priorizado

| # | Frente | Esforço | Risco | ROI |
|---|---|---|---|---|
| **1** | **Ligar RLS de segurança** (só tabelas Manos, com policies `authenticated`) | M | Alto se cego | Protege 1.360+ clientes |
| **2** | **Tela visual de alerta de cobrança** (ler `inactivity_alerts`, badge+som+reconhecimento) | M | Baixo | Destrava o SLA — dado já existe |
| 3 | Atribuição forçada no insert (acabar com 402 órfãos) + purga dos 257 jobs mortos | M | Médio | Cobertura de leads |
| 4 | Unificar 4 tabelas em id space único (conserta atribuição de KPI) | G | Alto | Base de tudo |
| 5 | Ingestão async via pgmq + matchmaking pgvector pré-computado | G | Médio | Escala + assertividade |

**Frentes 1 e 2 em execução imediata** (decisão de 2026-06-09).

---

## Apêndice A — Evidências e queries de verificação

```sql
-- Funil cru por tabela
SELECT 'dist' t, status, count(*) FROM leads_distribuicao_crm_26 GROUP BY status;

-- Cobrança silenciosa: alertas vs reconhecimento
SELECT kind, count(*), count(*) FILTER (WHERE acknowledged_at IS NOT NULL) acked
FROM inactivity_alerts GROUP BY kind;   -- => 459 total, 0 acked

-- Fila de reversão morta
SELECT CASE WHEN attempts>=5 THEN 'dead' ELSE 'claimable' END, count(*)
FROM ai_sdr_queue WHERE processed_at IS NULL GROUP BY 1;   -- => 257 dead

-- Embeddings nunca gerados
SELECT count(*) FILTER (WHERE embedding IS NOT NULL) FROM leads_master;  -- => 0

-- Split-brain: leads_master fora da view
SELECT definition ILIKE '%leads_master%' FROM pg_views WHERE viewname='leads_unified'; -- => false
```

## Apêndice B — Inventário de capacidade instalada e ociosa
- `pgmq 1.4.4` — fila assíncrona. **Não usada.**
- `vector 0.8.0` (pgvector) — embeddings/HNSW. **Instalada, 0% populada.**
- `pg_net 0.14.0` — HTTP assíncrono do banco. Disponível para webhooks de urgência.
- `pg_cron 1.6` — 8 jobs ativos (ver §1.2). Disponível para `REFRESH MATERIALIZED VIEW`.
- `pg_trgm`, `unaccent` (via default) — busca fuzzy para resolução de telefone/nome sem wildcard à esquerda.
