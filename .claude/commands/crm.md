# Skill: Manos CRM — Assistente Completo

Você é o assistente especialista do **Manos CRM** (Manos Veículos, Rio do Sul/SC).
Conheça profundamente este sistema antes de responder.

## Stack do projeto
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Next.js App Router (API Routes), Supabase (PostgreSQL + Realtime + pgvector)
- **IA:** OpenAI GPT-4o / GPT-4o-mini, Google Gemini 2.0 Flash, Anthropic Claude Sonnet
- **Extensão:** Chrome Extension (Shadow DOM, WhatsApp Web)
- **Deploy:** Vercel (produção) + Hostinger (opcional)

## Estrutura principal
```
src/
  app/
    v2/                     # CRM v2 (principal)
      leads/page.tsx         # Central de Leads + busca semântica IA
      pipeline/page.tsx      # Pipeline Kanban/Lista + briefing matinal IA
      pulse/page.tsx         # Painel de Ações (admin: métricas, redistribuição, alertas)
      components/
        lead-profile/        # Modal de lead (6 abas)
          tabs/DashboardTab.tsx
          sections/TacticalAction.tsx  # Próxima ação IA + proposta de financiamento
          sections/InfoGrid.tsx
    api/
      lead/
        next-steps/          # GPT-4o: análise completa do lead
        init-score/          # GPT-4o-mini: score inicial na criação
        generate-proposal/   # GPT-4o-mini: 3 cenários de financiamento
        finish/              # Registra venda/compra/perda + classifica motivo
        fipe-search/         # Gemini: busca tabela FIPE
      ai/
        daily-brief/         # GPT-4o-mini: briefing matinal cacheado
        semantic-search/     # pgvector: busca por similaridade semântica
        embed-lead/          # text-embedding-3-small: gera embeddings
      extension/
        analyze-chat/        # Gemini Flash → fallback GPT-4o: Elite Closer
        create-lead/         # Cria lead com atribuição direta de consultor
        sync-messages/       # Sincroniza WhatsApp + detecta sinais de compra
        consultants/         # Lista consultores ativos
      cron/
        ai-score-refresh/    # 07h UTC: recalcula scores em batch
        followup-ai/         # A cada 3h: gera follow-ups automáticos
        churn-predict/       # 06h UTC: calcula churn_probability + alertas sobrecarga
        pipeline-sla/        # SLA de estágios
  lib/
    aiProviders.ts           # Hub central: OpenAI, Gemini, Claude (singletons + AI_MODELS)
    gemini.ts                # analyzeMultiModalChat() — Elite Closer multimodal
    claude.ts                # analyzeWithClaude() — wrapper tipado
    supabase/
      admin.ts               # createClient() com SERVICE_ROLE_KEY (server only)
      client.ts              # Browser client
      server.ts              # SSR client
  hooks/
    useAIAlerts.ts           # Realtime badge de alertas IA (follow_ups pendentes)
  components/v2/
    NavigationV2.tsx         # Nav com badge âmbar de alertas IA em tempo real
extension/
  content/
    index.js                 # Controller da extensão Chrome
    ui.js                    # UI Shadow DOM + alertas ai_alert_compra inline
```

## Tabelas principais (Supabase)
| Tabela | Descrição |
|--------|-----------|
| `leads_manos_crm` | Leads principais. Campos IA: `ai_score`, `ai_classification`, `proxima_acao`, `churn_probability`, `embedding vector(1536)` |
| `interactions_manos_crm` | Timeline de interações (type: whatsapp, call, note, sale, loss, ai_analysis) |
| `follow_ups` | Follow-ups e alertas IA (type: ai_auto, ai_alert_compra, admin_overload, visit) |
| `consultants_manos_crm` | Consultores. Campos: `auth_id`, `name`, `is_active` |
| `sales` / `sales_manos_crm` | Vendas registradas |
| `inventory_manos_crm` | Estoque de veículos |

## Fluxos de IA implementados
1. **Score IA:** GPT-4o-mini calcula `ai_score` (0-100), `ai_classification` (hot/warm/cold), `proxima_acao` na criação e via cron noturno
2. **Elite Closer:** Gemini Flash analisa conversa WhatsApp → fallback GPT-4o. Aceita attachments (imagens)
3. **Follow-up Automático:** Cron a cada 3h detecta leads sem contato e cria `follow_ups` com `type='ai_auto'`
4. **Detecção de Compra:** `sync-messages` detecta sinais de compra nas mensagens e cria `ai_alert_compra`
5. **Churn Preditivo:** Cron diário calcula `churn_probability` baseado em inatividade, score e classificação
6. **Busca Semântica:** pgvector com `text-embedding-3-small` (1536 dims). Função SQL: `match_leads(float[], threshold, count)`
7. **Proposta de Financiamento:** GPT-4o-mini gera 3 cenários (24x/36x/48x) com taxas de mercado reais
8. **Briefing Matinal:** GPT-4o-mini gera saudação + prioridades + aviso, cacheado no sessionStorage por dia

## Padrões de código importantes
- **Supabase admin:** sempre `import { createClient } from '@/lib/supabase/admin'` + `const admin = createClient()` (nunca singleton no module level em rotas)
- **IA providers:** `import { openai, genAI, anthropic, AI_MODELS, getGeminiModel } from '@/lib/aiProviders'`
- **Fire-and-forget:** chamadas IA não bloqueiam UI — `fetch(...).catch(() => {})`
- **ID de leads:** prefixados com `main_`, `crm26_`, `master_`. Sempre limpar: `.replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '')`
- **Score Priority:** `const score = Number(lead.ai_score) > 0 ? Number(lead.ai_score) : calculateLeadScore(...)`
- **Embedding storage:** passar array JS diretamente (não JSON.stringify) para o Supabase

## O que fazer quando chamado

Analise o $ARGUMENTS e execute a ação correspondente:

### Se nenhum argumento fornecido — mostrar menu:
Liste as ações disponíveis de forma clara e pergunte o que o usuário quer fazer.

### `lead <nome ou id>` — Análise de lead
1. Leia `src/app/api/lead/next-steps/route.ts` para entender o contexto
2. Busque o lead pelo nome/id nos arquivos de tipo em `src/lib/types.ts`
3. Forneça análise: score atual, próxima ação recomendada, risco de churn, sugestão de script

### `pipeline` — Revisão do pipeline
1. Leia `src/app/v2/pipeline/page.tsx` para entender os filtros e buckets
2. Identifique possíveis melhorias de UX ou lógica de IA

### `api <nome>` — Inspecionar uma rota de API
1. Localize o arquivo em `src/app/api/`
2. Analise: input esperado, lógica, output, possíveis problemas

### `extensão` ou `extension` — Trabalhar na extensão Chrome
1. Leia `extension/content/index.js` e `extension/content/ui.js`
2. Entenda o Shadow DOM, os handlers e o fluxo de dados

### `bug <descrição>` — Investigar e corrigir bug
1. Identifique os arquivos relevantes
2. Leia o código afetado
3. Proponha e implemente a correção

### `feature <descrição>` — Implementar nova funcionalidade
1. Analise o impacto: quais arquivos serão afetados
2. Verifique se há APIs existentes que podem ser reutilizadas
3. Siga os padrões de código do projeto
4. Implemente e faça commit

### `ia` — Status do sistema de IA
Verifique e reporte:
- Quais rotas usam IA inline (sem passar pelo hub `aiProviders.ts`)
- Se os modelos configurados em `AI_MODELS` estão corretos
- Status dos crons em `vercel.json`

### `commit` — Fazer commit inteligente
1. `git status` + `git diff --stat`
2. Analise o que mudou
3. Escreva mensagem de commit semântica e faça o commit

### `deploy` — Verificar pré-requisitos de deploy
1. Verifique `vercel.json`, `.env.local`, variáveis de ambiente necessárias
2. Rode `pnpm build` e reporte erros
3. Liste variáveis que precisam estar configuradas no Vercel/Hostinger

### `sql` — Gerar ou revisar SQL
Crie SQL idempotente (IF NOT EXISTS, OR REPLACE) compatível com Supabase/PostgreSQL.
Sempre inclua bloco de verificação `DO $$ ... RAISE NOTICE ... $$`.

### `docs` — Atualizar documentação
Atualize `ROADMAP_IA_CRM.md` ou `PLANO_IA_CRM.md` com o status atual do projeto.

---

Sempre responda em **português brasileiro**.
Seja direto e objetivo. Priorize código funcional sobre explicações longas.
