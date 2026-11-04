# Origem do lead + funil na Meta Conversions API

**Criado em:** 2026-10-14 · migration `supabase/migrations/20261014_origem_lead_meta_capi.sql`

Por que existe: em 14/10/2026, 0% dos leads tinham `utm_params`/`details`/`id_meta` e a
`meta_conversions_log` tinha 1 evento na história. Não dava pra saber qual anúncio trouxe
qual lead/venda, e a Meta otimizava as campanhas por "conversa iniciada" sem nunca ver um
lead qualificado, uma visita ou uma venda.

---

## Como fica a cadeia

```
Canal (WhatsApp / Google Ads / site)
  │
  ├─► n8n ──► INSERT em leads_distribuicao_crm_26          (igual a hoje — cria o lead)
  │
  └─► n8n ──► POST /api/webhook/lead-origin (payload CRU)  (NOVO — grava a origem)
                 └─► registrar_origem_lead()
                       ├─ lead existe → utm_params / id_meta / dados_brutos (sem sobrescrever)
                       └─ ainda não   → lead_origem_pendente → aplicado no INSERT do n8n

leads_distribuicao_crm_26 ──trigger──► leads_master   (agora leva utm_params e id_meta)

Lead muda de etapa ──trigger──► meta_capi_queue ──pg_cron 5min──► /api/cron/meta-capi-dispatch
                                                                    ├─ ctwa_clid + WABA → CAPI p/ mensagens
                                                                    └─ senão            → CAPI do CRM
                                                                    └─ log: meta_conversions_log
```

A ordem entre o INSERT do n8n e o POST de origem **não importa**: a origem que chega antes
fica pendente (até 30 dias) e é aplicada quando o lead é criado.

### O que é gravado em `utm_params`

| Canal | Campos |
|---|---|
| WhatsApp (Click-to-WhatsApp) | `platform=meta`, `channel=ctwa`, `source_id` (**ID do anúncio**), `source_type`, `source_url`, `headline`, `ctwa_clid`, `app` (facebook/instagram), `waba_id` (Cloud API) |
| Google Ads (formulário) | `platform=google`, `channel=lead_form`, `campaign_id`, `adgroup_id`, `creative_id`, `gclid`, `form_id`, `lead_id` |
| Site | `platform`, `channel=site_form`, `utm_*`, `fbclid`/`gclid`/…, `canal`, `landing_page`, `referrer_host`, `first_touch`, `external_id` |

- **First touch:** se o lead já tem origem, ela não é trocada.
- **`id_meta`:** recebe o `ctwa_clid`, que é único por clique. O ID do anúncio **não** vai
  para `id_meta`, porque `leads_master.id_meta` é UNIQUE e vários leads vêm do mesmo anúncio.
- **Google:** o veículo das respostas preenche `interesse`/`vehicle_interest` quando o valor
  é `'Lead Google - Não especificado'` ou vazio. As respostas ficam em
  `dados_brutos.origem_respostas`, com `entrada`, `pagamento`, `troca` e `prazo_compra` em
  chaves fixas quando reconhecidas.
- **Status nunca é alterado** pela gravação de origem. O `trg_enqueue_reversal` só dispara
  quando o status MUDA para perdido/arquivado/lost, então enriquecer um lead perdido não
  agenda mensagem da IA.

---

## Variáveis de ambiente (app)

Nada de token ou id de dataset no código.

| Var | Obrigatória | Para quê |
|---|---|---|
| `LEAD_ORIGIN_WEBHOOK_SECRET` | sim | header `x-webhook-secret` que o n8n manda para `/api/webhook/lead-origin` |
| `GOOGLE_ADS_LEAD_FORM_KEY` | opcional | a "chave" do webhook no formulário do Google Ads, se o Google for chamar o CRM direto |
| `META_CAPI_FUNNEL_MODE` | sim | `off` (padrão) · `test` · `live` |
| `META_CAPI_DATASET_ID` | sim | dataset que recebe os eventos do funil (CRM) |
| `META_CAPI_ACCESS_TOKEN` | sim* | token da CAPI (*cai em `META_ACCESS_TOKEN`) |
| `META_TEST_EVENT_CODE` | p/ teste | código da aba "Testar eventos" do Gerenciador de Eventos |
| `META_WABA_ID` | p/ CTWA | ID da conta do WhatsApp Business (Cloud API) |
| `META_CAPI_MESSAGING_DATASET_ID` | p/ CTWA | dataset da WABA: `GET /{WABA_ID}/dataset` (permissões `whatsapp_business_management` + `whatsapp_business_manage_events`) |
| `META_CAPI_MESSAGING_ACCESS_TOKEN` | opcional | se o token da WABA for outro |
| `META_AD_ACCOUNT_ID` | p/ custo | conta de anúncios, só números (ex.: a principal) |
| `META_ADS_ACCESS_TOKEN` | opcional | token com `ads_read` para o gasto (cai em `META_ACCESS_TOKEN`) |

> **Cuidado com `META_TEST_EVENT_CODE`:** o `meta-service.ts` antigo usa essa variável como
> padrão em **todo** envio. Se ela ficar definida em produção, os eventos antigos (Lead,
> ViewContent…) também vão como teste e não contam para otimização. O fluxo novo só usa o
> código no modo `test`.

### Qual dataset usar

Datasets da conta em 14/10/2026: `Formulario Leads CRM` (1397712305554437), `manoscompra.com`
(3253946971444443, pixel do site), `CRM+SITE ATUALIZADOS OFICIAL` (995826668986455, pixel
oficial + catálogo), `Manos Offline` (1253375706932977, nunca disparou). Nenhum recebia
QualifiedLead/Schedule/Purchase. A escolha de `META_CAPI_DATASET_ID` é do dono da conta.
Ele precisa ser o dataset que as campanhas vão usar como evento de otimização.

### Click-to-WhatsApp: requisito da variante para mensagens

A CAPI para mensagens (`action_source=business_messaging`) exige o número na **WhatsApp
Business Platform (Cloud API)** com WABA. Sem `META_WABA_ID`, os eventos de leads CTWA
vão para o dataset do CRM, casados por telefone em hash. Isso mede, mas não destrava a
otimização da campanha CTWA. Pela central de ajuda da Meta, para otimizar CTWA por "leads"
é preciso ≥10 eventos de lead ou compra em 30 dias por esse canal, e o chat precisa virar
lead **até 7 dias após o clique**. Se o número estiver no Evolution/Baileys (app WhatsApp
Business), a alternativa da Meta são as etiquetas do próprio app.

- Lead qualificado: vai como `LeadSubmitted`.
- Venda: `Purchase`.
- `Schedule` não existe nesse canal e vai sempre pelo dataset do CRM.

---

## n8n: o que adicionar (sem mexer no INSERT)

Em cada fluxo, um nó **HTTP Request** em paralelo logo depois do Webhook de entrada:

- Method `POST`, URL `https://manoscrm.com.br/api/webhook/lead-origin`
- Header `x-webhook-secret: <LEAD_ORIGIN_WEBHOOK_SECRET>`
- Body JSON: o corpo **cru** recebido (`{{ $json.body }}` no nó Webhook do n8n)
- "Continue on fail" ligado (a origem nunca pode travar a entrada do lead)

| Fluxo | O que repassar |
|---|---|
| WhatsApp (Evolution) | o evento `messages.upsert` como chegou do Evolution. Só a 1ª mensagem do anúncio tem `externalAdReply`; as demais respondem `ignored` |
| Google Ads | o corpo do webhook do formulário (com `user_column_data`, `gcl_id` etc.). O `google_key` nunca é gravado |
| Site (`SitecompraAtualizado`) | o corpo que o `server.ts` do site manda. O site **já** captura UTMs/fbclid/gclid e envia `atribuicao` — a perda era só no n8n |

Alternativa: chamar direto a função no nó Postgres que já faz o INSERT:
`SELECT registrar_origem_lead('<telefone>', '<origem jsonb>'::jsonb, '<ctwa_clid>');`

---

## Etapas → eventos

| Gatilho no CRM | Evento | Observação |
|---|---|---|
| carro (`vehicle_interest`/`interesse`), entrada (`valor_investimento`), troca (`carro_troca`) e prazo (`prazo_compra`) respondidos — o mesmo critério do selo "qualificado" das telas | `QualifiedLead` (CTWA: `LeadSubmitted`) | lidos via `to_jsonb`. Coluna inexistente, vazia ou "não consta" = não respondido; "Analisar Perfil" e "Lead Google - Não especificado" não contam como carro. "Sem entrada", "Sem troca" e "pesquisando" contam como resposta. Forma de pagamento não entra. Nomes em `fn_lead_qualificacao()` |
| status `scheduled` ou `visited` (ou que contenha "visita"), ou INSERT em `agendamentos` | `Schedule` | exceto cancelada/não compareceu. Mapa em `fn_meta_capi_evento_da_etapa()` |
| status `vendido` (ou `closed`/`venda`/`ganho`) | `Purchase` | lê `sales_manos_crm.sale_value` no envio: espera 2h, tenta até 24h pelo valor, depois envia com `value=0` |

> Em 15/10, nenhum lead dos últimos 30 dias tinha entrada e troca preenchidos. O evento
> começa a sair quando os vendedores usarem as perguntas da tela, e `prazo_compra` só existe
> depois da migration 20261014b da sessão do funil.

> **Fonte única:** o envio antigo em `updateLeadStatusAction` (`src/app/actions/leads.ts`) foi
> removido nesta branch. Ele fazia select de colunas inexistentes e nunca enviava; consertado,
> duplicaria os eventos da fila. Não recriar envio de funil fora da `meta_capi_queue`.

- Observadas: `leads_distribuicao_crm_26` e `leads_master` (os status divergem entre as duas)
  e `agendamentos`.
- Deduplicação: 1 evento por pessoa (chave de telefone) a cada 90 dias. O `event_id` é fixo
  por item (`crm_<evento>_<id>`), então reenvio não duplica na Meta.
- Os triggers só leem e nunca bloqueiam o UPDATE: erro vira `WARNING` no log do Postgres.

> Hoje o `/api/lead/finish` grava `sale_value: 0`. Enquanto a venda não tiver o valor
> lançado, o Purchase sai com `value=0`: conta como compra, mas sem valor.

---

## Cliente que voltou pelo WhatsApp

Migration `20261015_cliente_voltou_whatsapp.sql`.

O fluxo de IA do n8n só cria o lead na primeira conversa, e o `/api/webhook/whatsapp` não
recebe nada desde 03/07/2026. Por isso cliente antigo que voltava não reativava o lead.

O conserto roda no banco: o job `whatsapp-cliente-voltou` (pg_cron, 1 em 1 min) lê as
mensagens `human` novas de `concessionaria_mensagens` e liga cada uma ao telefone por
`dados_cliente.sessionid`.

| Situação | O que acontece |
|---|---|
| lead em crm26 perdido / frio / arquivado | volta como `received`, sobe no Inbox, "CLIENTE VOLTOU em dd/mm hh:mm — …" no topo do `handoff_summary`, alerta `cliente_voltou` para o dono |
| lead em crm26 parado há > 3 dias | sobe no Inbox (status mantido), ficha e alerta |
| lead `vendido` | status mantido, sobe no Inbox, alerta "cliente que JÁ COMPROU voltou" |
| conversa em andamento (mexido < 3 dias) | nada |
| só em `leads_master` | lead reaberto em crm26 (`received`, origem/veículo do master) e entra na distribuição |
| sem lead nenhum | nada (o n8n cria) |
| só "ok" / "obrigado" | nada |

- O título do alerta é o mesmo da rotina provisória "Acompanhamento de Leads" (Passo 1B):
  `Cliente voltou — lead #<id>`. As duas se deduplicam, e o Passo 1B pode ser desligado
  depois que o job estiver no ar.
- Mudar para `received` não aciona `trg_enqueue_reversal`, que só dispara quando o status
  muda para perdido/arquivado/lost.

---

## Ligando com segurança

1. Aplicar as migrations, nesta ordem: `20261014_origem_lead_meta_capi.sql` e depois
   `20261015_cliente_voltou_whatsapp.sql`. As duas foram ensaiadas juntas em produção, com
   rollback, em 15/10 e passaram em todos os cenários (~110 ms). O job de cliente que voltou
   funciona assim que a migration entra, sem depender do deploy.
2. Definir as variáveis acima com `META_CAPI_FUNNEL_MODE=off`. A fila já começa a acumular.
3. Ligar os nós do n8n. Conferir:
   `select utm_params->>'channel', count(*) from leads_distribuicao_crm_26 where created_at > now() - interval '1 day' group by 1;`
4. Teste: `META_CAPI_FUNNEL_MODE=test` + `META_TEST_EVENT_CODE`, ou uma chamada avulsa:
   `GET /api/cron/meta-capi-dispatch?test_event_code=TEST123&limit=5` com `Authorization: Bearer <CRON_SECRET>`.
   Conferir na aba "Testar eventos". Teste não consome a fila.
5. `META_CAPI_FUNNEL_MODE=live`.
6. Acompanhar `meta_conversions_log` e `GET /api/marketing/custo-por-resultado` (admin). O
   campo `ultimos_7_dias.pronto_para_trocar_otimizacao` fica `true` com ≥50 eventos de
   qualificado + visita na semana.

### Consultas úteis

```sql
-- fila
select event_name, status, canal, count(*) from meta_capi_queue group by 1,2,3 order by 1,2;
-- falhas recentes
select created_at, event_name, response_code, error_message from meta_conversions_log
 where status = 'FAILED' order by created_at desc limit 20;
-- custo por campanha, últimos 30 dias
select * from fn_custo_por_resultado(current_date - 30, current_date);
```

---

## LGPD

Para a Meta saem só:

- hash SHA-256 de telefone e e-mail (`ph`, `em`);
- `external_id` em hash;
- `country` em hash;
- os ids de clique da própria Meta (`ctwa_clid`, `fbc`, `lead_id`);
- valor da venda.

Não saem nome, cidade, veículo nem texto da conversa. Incluir `fn`/`ln`/`ct` em hash
aumentaria a taxa de correspondência, mas é mais dado pessoal: é decisão do dono.

`registrar_origem_lead`, `fn_meta_capi_perfil` e `fn_custo_por_resultado` só executam com
service_role. As tabelas novas têm RLS sem policy.
