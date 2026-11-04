# Repaginação do Manos CRM + WhatsApp da loja dentro do CRM

Especificação completa: `D:\Agentes de marketing\docs\growth360\prompt-crm-repaginacao-whatsapp.md` (Growth 360, 04/11/2026).
Este arquivo registra **o que já existe e vai ser reaproveitado**, as decisões de cada fase e o que ficou pendente.

Branch: `feat/crm-repaginacao`, cortado de `release/e04-funil-origem` (52db0cc).

---

## Fase 0 — o que existe e como entra na repaginação

Conferido no código deste branch e no banco (só leitura, sem dado pessoal) em 04/11/2026.

### Leads, funil e qualificação (branch E04 — reaproveitar como está)

| O quê | Onde | Uso na repaginação |
|---|---|---|
| Etapas do funil (status ↔ etapa) | `src/constants/funil.ts` | Minha Fila decide "lead com resultado" por `etapaDoStatus()` (vendido/perdido saem da fila). Fase 5 usa as mesmas etapas. |
| Motivos de perda (lista fechada) | `src/constants/lossReasons.ts` | Botão **Resultado** da Minha Fila mostra exatamente `MOTIVOS_PERDA`; "Outro" exige texto (`MIN_TEXTO_OUTRO`). |
| Venda/perda no servidor | `src/app/api/lead/finish/route.ts` | A Minha Fila grava resultado **só** por essa rota (valida motivo, grava `sales_manos_crm`, `perdidos_auditoria`, timeline). |
| Selo Quente/Morno/Fora do perfil/Sem qualificação | `src/lib/qualificacao.ts` (`classificarLead`), `src/lib/services/qualificacaoService.ts` (`buscarQualificacao`, `pisoEstoque`) | Ordem da Minha Fila (quente sem resposta, morno). |
| Componentes | `src/components/qualificacao/SeloQualificacao.tsx`, `QualificacaoCard.tsx`, `FichaIACard.tsx` | `SeloQualificacao` em cada card da fila. `QualificacaoCard` e `FichaIACard` ficam para a ficha do lead (Fases 3 e 5). |
| Alerta de 15 min (quente sem resposta) | `src/lib/services/alertaQuente.ts` | A Minha Fila usa a **mesma regra** de "esperando um humano" (última mensagem do cliente sem resposta humana depois; sem histórico, nenhum contato humano registrado). |
| Próximo passo da IA | `src/app/api/lead/next-steps/route.ts` → `runEliteCloser` grava `resumo_consultor`/`ai_reason` ("… \| ORIENTAÇÃO: …") e `proxima_acao` | O topo da Minha Fila mostra a ORIENTAÇÃO já gravada do 1º lead da fila. **Não chama a IA** a cada abertura (custo e latência); sem orientação gravada, usa uma frase montada pela regra do card. |
| Origem do lead / CAPI | `src/lib/services/leadOrigin.ts`, `metaFunnelEvents.ts` | Fase 2: o parser novo extrai `externalAdReply` (fixture `02-texto-anuncio-ctwa.json`). |
| Agenda de visitas | `src/app/api/agenda` (`requireVendedor`, `startOfTodayBRT`), tabela `agendamentos` (`lead_uid` texto) | Card "Visitas de hoje e de amanhã" e botão **Agendar → Visita** (mesma rota `POST /api/agenda`, que já dispara o webhook de lembrete). |
| Cliente que voltou | `cowork_alerts` tipo `cliente_voltou`, título "Cliente voltou — lead #N" (27 em 30 dias) | Card "Cliente voltou a escrever". |
| Follow-ups | tabela `follow_ups` (`lead_id uuid`, `user_id text`, `metadata jsonb`) | **Agendar → Retorno** grava aqui. Como 99% dos leads ativos estão em `leads_distribuicao_crm_26` (id inteiro), o lead vai em `metadata.lead_uid` e `lead_id` fica nulo (a coluna já é anulável). |
| Rota de iniciar atendimento | `src/app/api/lead/start-atendimento` | Sem mudança. |

### Leitura atual dos dados (04/11/2026)

- `leads_unified_active`: 197 leads em `leads_distribuicao_crm_26` e 2 em `leadsfacebook`. `leads_manos_crm` não tem lead ativo.
- Perfis em `consultants_manos_crm` (ativos): 6 `vendedor`, 1 `admin`, 2 sem perfil. **Não existe `gestor` hoje** — o código já trata `gestor`/`manager` para quando houver.
- Mensagens: `whatsapp_messages` parou em 03/07/2026 (entrada) e 17/06/2026 (saída). A única conversa viva é a da Laura em
  `concessionaria_mensagens` (5.964 mensagens da IA e 1.352 de clientes em 30 dias), ligada ao telefone por `dados_cliente.sessionid`.
  **A conversa do vendedor com o cliente não fica registrada em lugar nenhum** — é o que a Fase 2 resolve.
- `concessionaria_mensagens` (68 mil linhas) e `dados_cliente` (2,9 mil) não têm índice além da chave primária.

### WhatsApp (Fases 2 e 3)

| O quê | Onde | Uso |
|---|---|---|
| Parser de eventos Evolution | `src/app/api/webhook/whatsapp/route.ts` (texto e legendas, ignora `fromMe`) e `src/app/api/billing/whatsapp-webhook/route.ts` (mídia, grupo, dedup por id) | Fase 2: juntar os dois em `lib/whatsapp/evolutionParser.ts`. |
| Fixtures sem dado pessoal | `tests/fixtures/evolution/` (19 arquivos, ver README) | Testes do parser. |
| Transcrição de áudio | `src/app/api/lead/analyze-audio/route.ts` (Gemini Flash, JSON com `transcricao`) | Fase 2: chamar na ingestão de todo áudio. |
| Envio pela Evolution | `src/lib/services/whatsappSender.ts`, `vendorNotifyService.ts`, `cobrancaWhatsappSender.ts` | Base do `EvolutionProvider` (Fase 2). |
| Respostas rápidas | `src/components/CannedResponses.tsx` | Fase 3 (envio). |
| Timeline atual | view `unified_whatsapp_messages`, `app/components/lead-profile/hooks/useLeadTimeline.ts`, `api/lead/get-unified` | Fase 3/5: aba WhatsApp substitui as mensagens da Timeline. |
| Extensão Chrome | `src/app/api/extension/*`, `consultant_active_chats` | Não mexer (regra 5). |
| `camilawhatsapp` | — | **Não reaproveitar** (colunas trocadas, sem mídia). |

### Interface

- Menu: `src/components/v2/NavigationV2.tsx` tinha 27 itens para todos os perfis (filtros por e-mail espalhados no componente).
- Perfil do lead: `src/app/components/lead-profile/tabs` (Arsenal, Dashboard, Financing, FollowUp, Proposal, Timeline, TradeIn) — Fase 5.
- Telas de lead do vendedor hoje: `/inbox` (pesca + meus leads), `/atendimento` (Kanban por etapa), `/leads`, `/lead/[id]`.

### Achados de passagem (fora do escopo da Fase 1 — não corrigidos aqui)

1. `src/app/lead/[id]/page.tsx` (`handleSchedule`) grava em `follow_ups` as colunas `consultant_id` e `notes`, que **não existem**
   (a tabela tem `user_id` e `note`), e usa o id inteiro do lead em `lead_id uuid`. O retorno agendado por essa tela não é gravado
   (o erro é ignorado; só a visita na agenda é criada).
2. `src/lib/services/inventoryMatcher.ts` consulta `estoque_sincronizado`, que **não existe** no banco (a tabela é `estoque`). O casamento
   lead × estoque usado pelo SDR volta sempre vazio.
3. `src/app/api/lead/analyze-audio/route.ts` baixa qualquer `audioUrl` recebida. Hoje exige sessão, mas na Fase 2 a transcrição deve
   receber o arquivo do nosso Storage, não uma URL livre.
4. O item "Repasse" (`pauloOnly`) não era filtrado: aparecia para todos os vendedores. O menu novo corrige isso (só Paulo e admin).


---

## Fase 1 — navegação por perfil + "Minha Fila"

### Perfis (`src/lib/perfil.ts`)

- **admin**: `role` `admin`/`owner` ou o login do Alexandre.
- **gestor**: `role` `gestor`/`manager` (ninguém hoje).
- **vendedor**: qualquer outro consultor ativo (inclui os 2 sem perfil).

As regras por pessoa continuam iguais: Camila (só Cobrança), Paulo (Compras + Repasse), Ivo (Compras + Divisão de Lucro),
Wilson (Terceiros + Leads WhatsApp, em "Seus módulos"), Ledra (Financeiro), Milhão e Scooters só para o Alexandre.

### Menu (`src/components/v2/menuConfig.ts`, `MenuSecoes.tsx`, `BarraInferior.tsx`)

- **Vendedor:** Minha Fila · Conversas (em breve, Fase 3) · Agenda · Meus Leads · Perfil. No celular, os 5 ficam numa barra fixa
  embaixo (alvos de 60 px); o menu lateral continua com os sinos e o "Sair".
- **Gestor:** os 5 do vendedor + Inbox geral, Conversão, Perdidos e Painel 48h.
- **Admin:** os 27 itens de antes + Minha Fila e Conversas, em 5 grupos recolhíveis (Vendas · Compras · Financeiro · Gestão · Marketing).
  O grupo aberto fica salvo no navegador.
- Tela inicial: vendedor e gestor vão para `/fila`; admin continua no War Room (`/`).
- **Saíram do menu do vendedor:** Inbox (pesca), Atendimento (Kanban), Precificar, Compras, Cobrança Acordos e Repasse.
  As rotas continuam abrindo pelo endereço. O menu só esconde: quem protege o dado é o RLS e as rotas de API.

### Minha Fila (`/fila`)

- Dados: `GET /api/fila`. O servidor confere a sessão e monta a fila só do consultor logado; a chave de serviço não vai ao navegador.
- Regra pura e testada: `src/lib/fila/montarFila.ts` (`npm run test:fila`, 11 testes). Leitura do banco: `src/lib/fila/carregarFila.ts`.

Ordem das seções. Cada lead aparece uma vez, na 1ª seção em que se encaixa:

1. **Quente sem resposta**: selo Quente e esperando um humano há mais de 15 min.
2. **Visitas de hoje e de amanhã**: `agendamentos` do vendedor (`agendado`/`confirmado`), com ou sem lead ligado.
3. **Cliente voltou a escrever**: alerta `cliente_voltou` dos últimos 3 dias, sem contato humano depois.
4. **Follow-up vencido**: retorno combinado que venceu, ou cadência D0, D1, D3, D7, D15, D30 sem contato humano depois do marco
   (marco contado do início do atendimento; sem início, da entrada do lead). D0 só vence depois de 15 min.
5. **Quentes e mornos em conversa**: selo Morno, ou Quente já respondido.
6. **Recuperável**: perdido nos últimos 90 dias por "Carro fora do estoque" (ou o antigo "modelo") e com carro do mesmo modelo no `estoque`.
7. **Em aberto**: o resto (sem qualificação, fora do perfil).

A seção 7 não está na spec: sem ela, lead sem selo ficaria fora da fila e quebraria a regra "não sai sem resultado". Lead novo sem
contato aparece antes, na seção 4, como "D0 — 1º contato pendente".

**Lead não sai da fila sem resultado ou sem próximo contato agendado.** Sai quando vira vendido/perdido, ou quando tem retorno ou visita
marcados para depois de amanhã; volta sozinho na data. Quente sem resposta e cliente que voltou aparecem mesmo com retorno marcado.

Cada card: nome, carro, telefone completo, selo, motivo de estar na fila, última mensagem da conversa com a Laura e há quanto tempo foi.
Quatro botões (alvos de 56 px):

| Botão | O que faz |
|---|---|
| **Conversa** | Por enquanto abre `/lead/<uid>` (a Timeline mostra a conversa da Laura). Na Fase 3 passa a abrir `/conversas`. |
| **Ligar** | `tel:` com o número completo. Registra o toque (`POST /api/fila/contato`): `ultima_interacao_humana` + nota na timeline. Não grava `first_contact_at` (tocar não prova que a ligação aconteceu; a Fase 7 decide como medir). |
| **Agendar** | 2 toques: Agendar → atalho. **Retorno** ("em 2 horas", "amanhã 9h", "amanhã 14h", "em 3 dias") grava em `follow_ups` (`POST /api/fila/retorno`). **Visita na loja** usa a mesma rota da Agenda (`POST /api/agenda`, com os lembretes de sempre). |
| **Resultado** | **Perdido**: Resultado → motivo (2 toques; "Outro" pede o detalhe). **Vendido**: Resultado → valor → Confirmar venda. Grava pela rota que já existe (`/api/lead/finish`), que agora aceita `exige_valor` (a fila manda; as outras telas não). Depois do 2º toque há 5 s para **desfazer**. A venda abre a Roleta de Prêmios, como no perfil do lead. |

Topo: "próximo passo" do 1º card da fila. Se o next-steps gravou ORIENTAÇÃO nos últimos 7 dias, ela aparece junto. Embaixo, a dica da
semana (`src/lib/fila/dicas.ts`).

### Prévia com dados fictícios

`/dev/fila` (Minha Fila) e `/dev/fila?vista=menu&perfil=vendedor|gestor|admin` (menu). Só existe fora de produção: a página responde 404
em produção e o proxy só libera `/dev/` fora dela. Os dados estão em `src/app/dev/fila/exemplo.ts` (nomes inventados, telefones
`47 90000-0xxx`).

### Limites conhecidos da Fase 1

- "Sem mensagem humana há 15 min" é **aproximado**. A conversa do vendedor não é registrada; a fila usa a última mensagem do cliente para a
  Laura contra `ultima_interacao_humana`/`first_contact_at`, a mesma regra do alerta de 15 min. Fica exato com `wa_mensagens` (Fase 2).
- "Chegou carro compatível" não tem data: `estoque` não guarda quando o carro entrou. A data da perda é o `atualizado_em` do lead
  (não existe coluna de data da perda).
- "Conversas" fica desabilitado no menu até a Fase 3.
- Marcar visita pela fila não muda a etapa do lead para "Visita agendada" (o Kanban continua mostrando o selo de visita).

### Banco

Nenhuma migration e nenhuma tabela nova. Leituras e gravações em tabelas que já existem: `follow_ups` (retorno, `type = 'retorno_fila'`,
lead em `metadata.lead_uid`), `agendamentos` (visita), `interactions_manos_crm` (nota da ligação), `leads_distribuicao_crm_26` /
`leadsfacebook` (`ultima_interacao_humana`).
