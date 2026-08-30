# Integração Meta Lead Ads → n8n → CRM

**Última validação:** 2026-08-19 (ponta a ponta, com execução real em production)

Este documento existe porque a cadeia tem um intermediário **proposital** que não é
óbvio olhando só o código: o n8n. Quem mexer no app do Facebook ou na URL de callback
sem saber disso derruba a entrada de leads sem entender o porquê.

---

## A cadeia

```
Facebook Lead Ads
  │  app: ManosN8N · assinatura do campo `leadgen`
  ▼
n8n                https://n8n.drivvoo.com/webhook/facebook-crm2026
  │  repassa o corpo CRU do Facebook (não normaliza)
  ▼
CRM                https://manoscrm.com.br/api/webhook/facebook-leads
  │  busca os campos no Graph, grava em leads_compra
  ▼
Distribuição       slaEngine → vendedor com check-in (Victor, Sergio, Wilson)
```

### Por que o n8n está no meio

Decisão do dono (2026-08-19): é onde o fluxo fica **visível e editável sem deploy**.
Tecnicamente o Facebook poderia chamar o CRM direto — e o CRM continua aceitando isso,
porque o n8n repassa o payload cru.

---

## IDs e endereços

| O quê | Valor |
|---|---|
| Página do Facebook | Mano's veículos — `1791690130892776` |
| Conjunto de dados (CAPI) | Formulario Leads CRM — `1397712305554437` |
| Conta de anúncios | Anúncios BR - Manos WhatsApp — `1093800428784023` |
| App do Facebook | ManosN8N |
| Webhook n8n (entrada) | `https://n8n.drivvoo.com/webhook/facebook-crm2026` |
| Webhook CRM (entrada) | `https://manoscrm.com.br/api/webhook/facebook-leads` |
| Campo assinado | `leadgen` |

### Variáveis de ambiente usadas

| Var | Onde | Para quê |
|---|---|---|
| `FACEBOOK_VERIFY_TOKEN` | CRM | handshake `GET` do webhook (default: `manos_crm_leadgen_2026`) |
| `META_ACCESS_TOKEN` | CRM | busca do lead no Graph. Precisa de `leads_retrieval` |
| `META_PIXEL_ID` | CRM | pixel do **site** (não é o dataset de CRM) |
| `NEXT_PUBLIC_META_ACCESS_TOKEN` | CRM | ⚠️ **remover** — com prefixo `NEXT_PUBLIC` o token vai no bundle que o navegador baixa |

---

## O formato que o CRM espera

O parse em `src/app/api/webhook/facebook-leads/route.ts` exige o formato **nativo**
do Facebook:

```json
{
  "object": "page",
  "entry": [{
    "changes": [{
      "field": "leadgen",
      "value": { "leadgen_id": "123456789" }
    }]
  }]
}
```

> **Se o n8n passar a normalizar o payload** (mandar `{nome, telefone, ...}` já
> mastigado), o CRM responde 200 com `ignored: true` e **o lead não entra**. Isso é
> registrado no log como *"Payload não reconhecido"* — foi feito assim de propósito
> para o sumiço não ser silencioso. Ao mexer no n8n, confira esse log.

O CRM usa só o `leadgen_id` do corpo; o resto (nome, telefone, respostas do
formulário, campanha) ele busca no Graph com o próprio `META_ACCESS_TOKEN`.

---

## O que é gravado

Migration `20260819_meta_leadgen_ids.sql`, tabela `leads_compra`:

| Coluna | Conteúdo |
|---|---|
| `meta_leadgen_id` | **chave que casa o lead com o Meta** — vai em `user_data.lead_id` na CAPI |
| `meta_campaign_id` / `meta_campaign_name` | filtro por campanha (aba admin, relatórios) |
| `meta_adset_id` / `meta_ad_id` / `meta_form_id` | atribuição fina |
| `meta_platform` | facebook ou instagram |
| `meta_raw` | `field_data` cru — preserva as respostas de qualificação (troca, forma de pagamento, prazo) que o parser não mapeia em coluna própria |

**Proteções:**

- Índice único parcial em `meta_leadgen_id`, mais uma checagem antes do insert: o Meta
  reenvia a notificação quando não recebe 200, e sem isso a reentrega criava lead duplicado.
- Se as colunas `meta_*` não existirem (migration pendente), o lead é gravado **sem** elas
  e o log avisa. Perder o lead seria pior que perder a atribuição.

---

## Armadilhas conhecidas

**1. O dataset é compartilhado com o fluxo do site.**
`1397712305554437` já recebe `funnel_start`, `view_vehicle`, `select_vehicle`,
`lead_parcial`, `contato_direto` — que vêm do site via n8n, **não do CRM**. Existe um
evento `lead` (minúsculo) lá que **não é** o `Lead` (maiúsculo) que o CRM emite: para o
Meta são eventos diferentes. Ao escolher o evento de qualidade numa campanha, marcar o
errado faz otimizar pelo funil de navegação do site em vez do CRM.

**2. Qualidade de correspondência não é a mesma coisa nos dois fluxos.**
O alerta de `funnel_start` em 3.7/10 vale para os eventos **web**, que casam pessoa por
`fbp`/`fbc`/IP/e-mail hasheado. Os eventos de **Lead Ads** casam por `lead_id`, que é
determinístico — não passam por essa pontuação. Melhorar o EMQ ajuda o site e as
campanhas de WhatsApp; não é pré-requisito para a CAPI de leads.

**3. `META_ACCESS_TOKEN` precisa de `leads_retrieval`.**
Sem essa permissão a notificação chega, mas a busca no Graph falha e o webhook devolve
500 — o Meta reenvia por um tempo e depois desiste.

---

## Como testar sem esperar cliente real

1. **Ferramenta de teste de Lead Ads** do Meta (Gerenciador → Formulários → Visualizar):
   gera um lead falso que percorre a cadeia inteira.
2. Confirmar no n8n que a execução aparece em *production* (não só em *test*).
3. Conferir no CRM: o lead novo deve ter `meta_leadgen_id` preenchido.
   Se entrou mas veio sem esse campo, a migration não foi aplicada.

---

## A volta: CRM → n8n → CAPI

A entrada (acima) já roda. Esta é a **saída** — o CRM devolvendo ao Meta o que
aconteceu com o lead depois. É isso que faz a campanha otimizar por lead que
presta em vez de lead barato.

```
CRM  (vendedor mexe no lead)
  │  POST  N8N_CAPI_WEBHOOK_URL      ← env do CRM, ainda a definir
  ▼
n8n  monta o payload e assina com o token
  │  POST  graph.facebook.com/v21.0/1397712305554437/events
  ▼
Meta dataset "Formulario Leads CRM"
```

### O que o CRM manda para o n8n

Contrato fixo — o n8n pode ser montado contra isto antes de o CRM existir:

```json
{
  "evento": "QualifiedLead",
  "lead": {
    "uid": "leads_compra:8f3c...",
    "leadgen_id": "1234567890123456",
    "campaign_id": "120210000000000000",
    "campaign_name": "MANOS_LEADS_HAVALH6GT_FRIA_20260830",
    "nome": "Fulano de Tal"
  },
  "custom_data": {
    "value": 228900,
    "currency": "BRL"
  },
  "event_time": 1755691200,
  "teste": false
}
```

`nome` vai só para você identificar a execução no n8n — **não** deve ser
repassado ao Meta. `teste: true` marca disparo manual feito pela aba de admin.

### O que o n8n manda para o Meta

```json
POST https://graph.facebook.com/v21.0/1397712305554437/events

{
  "data": [{
    "event_name": "QualifiedLead",
    "event_time": 1755691200,
    "action_source": "system_generated",
    "user_data": {
      "lead_id": 1234567890123456
    },
    "custom_data": {
      "value": 228900,
      "currency": "BRL",
      "event_source": "crm",
      "lead_event_source": "Manos CRM"
    }
  }],
  "access_token": "<token do usuário de sistema>"
}
```

**Os quatro detalhes que quebram a integração em silêncio:**

1. `lead_id` **numérico**, não string. Como string o Meta aceita com 200 e
   descarta a correspondência.
2. `action_source` tem de ser `system_generated`. Qualquer outro valor faz o
   evento ser tratado como web e exigir `fbp`/`fbc`/IP, que não existem aqui.
3. `custom_data.event_source: "crm"` + `lead_event_source` são o que marcam o
   evento como vindo de CRM. Sem eles o evento entra, mas não alimenta a meta
   de leads qualificados.
4. Para lead de formulário, **`lead_id` sozinho basta** — não mande telefone
   nem e-mail. Menos dado pessoal trafegando, mesma atribuição (o match é
   determinístico, não estatístico).

### Eventos previstos

| Evento | Quando | Serve para |
|---|---|---|
| `QualifiedLead` | regra de qualificação atingida | **é o que a campanha otimiza** |
| `Schedule` | visita agendada | sinal forte, volume baixo |
| `Purchase` | venda fechada, com valor real | atribuição de receita |
| `DisqualifiedLead` | perdido / descarte | ensina o algoritmo o que evitar |

> Não use `Lead` na volta: o evento nativo do Lead Ads já dispara na entrada, e
> o dataset ainda tem um `lead` minúsculo vindo do site — três coisas com o
> mesmo nome viram relatório impossível de ler.

---

## Histórico

| Data | O que mudou |
|---|---|
| 2026-08-19 | Cadeia validada ponta a ponta. CRM passa a gravar os IDs do Meta (`20260819_meta_leadgen_ids`), com proteção contra reentrega duplicada |
| 2026-08-19 | Dataset `1397712305554437` confirmado como já vinculado à Página — não é preciso criar outro |
| 2026-08-20 | Contrato da volta (CRM → n8n → CAPI) definido, para o nó do n8n ser montado em paralelo |
