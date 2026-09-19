# Meta Conversions API — eventos de catálogo (ViewContent / AddToCart / Purchase)

Pixel/dataset: **995826668986455** · Catálogo: **Altimus_Veiculos** (`712583511204994`)
Endpoint Graph: `POST https://graph.facebook.com/v26.0/995826668986455/events`

---

## 1. A regra de ouro: `content_ids` = `retailer_id`

`content_ids` **tem** que ser o mesmo ID do feed do catálogo do Facebook. Onde isso foi
conferido, item por item:

| Fonte | Valor |
|---|---|
| XML da Altimus (`<veiculo><id>`) | `3563862` |
| `retailer_id` no catálogo do Facebook | `3563862` |
| `<valor>` no XML | `219900.0` |
| `price` no catálogo | `219900.00 BRL` |

Ou seja: o campo `id_externo` que o [`altimusInventory`](../src/lib/services/altimusInventory.ts)
já parseia **é** o `retailer_id`. Não tem conversão, não tem prefixo, não tem ID paralelo.

Quem garante isso é [`metaCatalog.ts`](../src/lib/services/metaCatalog.ts):

1. `vehicle_id` explícito → já é o `retailer_id` (aceita também a URL da página, extrai o ID do fim);
2. texto livre (`vehicle_interest`) → **match estrito** no feed: marca + modelo em token
   inteiro, e só vale se houver **um único** candidato;
3. não deu pra provar → o evento vai **sem** `content_ids`.

> Por que o passo 3 existe: mandar o ID errado é pior que não mandar. Suja o catálogo e
> quebra o remarketing dinâmico. O `findMatch()` do `altimusInventory` **não** é usado aqui
> de propósito — ele é frouxo (casa por substring, "sei lá, algum carro" vira um Corolla
> porque "la" está dentro de "corolla"). Serve pra sugerir estoque no WhatsApp, não pra
> decidir um ID de catálogo.

---

## 2. Onde os 3 eventos são disparados

| Evento | Gatilho | Arquivo |
|---|---|---|
| `ViewContent` | Abriu a página de detalhe do veículo | `POST /api/meta-capi/vehicle` |
| `AddToCart` | Clicou em "Tenho interesse" / WhatsApp / contato | `POST /api/meta-capi/vehicle` + [`webhook/universal`](../src/app/api/webhook/universal/route.ts) |
| `Purchase` | Lead marcado como vendido no CRM | [`metaConversionService.trackDealWon`](../src/lib/services/metaConversionService.ts) |

Todos saem com:

```json
{
  "event_name": "ViewContent",
  "event_time": 1789817736,
  "action_source": "website",
  "event_source_url": "https://.../estoque/...-3563862",
  "event_id": "...",
  "user_data": {
    "em": ["<sha256>"], "ph": ["<sha256>"],
    "fbp": "fb.1...", "fbc": "fb.1...",
    "client_ip_address": "200.150.10.20",
    "client_user_agent": "Mozilla/5.0 ...",
    "external_id": ["<sha256>"], "country": ["<sha256>"]
  },
  "custom_data": {
    "content_type": "product",
    "content_ids": ["3563862"],
    "value": 219900,
    "currency": "BRL"
  }
}
```

### Obrigatórios num evento de site (doc da Meta)

A [doc da Conversions API](https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters)
lista três campos como obrigatórios quando `action_source: "website"`:

| Campo | De onde vem |
|---|---|
| `action_source` | fixo `"website"` |
| `client_user_agent` | o site repassa o UA **do visitante** (em chamada server-to-server, o header traz o UA do servidor dele — por isso o snippet manda explícito) |
| `event_source_url` | URL da página do veículo |

Faltando algum, o `meta-service` registra no log em vez de deixar passar batido. **Não
fabricamos** user agent nem URL: dado inventado é pior que ausente.

Além de `content_ids`, mandamos `contents` — a forma detalhada da doc:

```json
"content_ids": ["3563862"],
"contents": [{ "id": "3563862", "quantity": 1, "item_price": 219900 }]
```

O `id` do `contents` é o mesmo `retailer_id` do `content_ids`. Carro é sempre `quantity: 1`.

`em`, `ph`, `external_id` e `country` são SHA256 (e-mail em minúsculo/trim, telefone
normalizado pra E.164 `55DDDNNNNNNNNN`). `fbp`/`fbc` vão crus, como a Meta exige.

### ⚠️ A página do veículo NÃO está neste repositório

`manosveiculos.com.br` é WordPress e o estoque é servido pela Altimus
(`manosveiculoscompra.com/estoque/...`). Não existe aqui a "rota/controller que renderiza a
página do veículo" — este projeto é o CRM. Por isso `ViewContent` e `AddToCart` foram
entregues como **endpoint server-side que o site chama**: o `access_token` nunca sai do
servidor e a chamada pra Graph API acontece aqui. Falta só pendurar o gatilho no site
(seção 5).

`Purchase` é diferente: o fluxo de venda já vive no CRM, então foi ligado direto no código.

---

## 3. Variáveis de ambiente

**Não foi criada `META_CAPI_ACCESS_TOKEN`** — o token já existe neste projeto como
`META_ACCESS_TOKEN` (em `.env.local` e na Vercel). É esse que está em uso.

| Variável | Status | Pra que serve |
|---|---|---|
| `META_PIXEL_ID` | já existe (`995826668986455`) | dataset de destino |
| `META_ACCESS_TOKEN` | **já existe** | token da Graph API |
| `META_API_VERSION` | já existe (`v26.0`) | versão da Graph API |
| `META_TEST_EVENT_CODE` | nova, opcional | modo teste **global** — deixe vazio em produção |
| `META_CAPI_SITE_SECRET` | nova, recomendada | exige `X-Meta-Capi-Secret` no endpoint |
| `META_CAPI_ALLOWED_ORIGINS` | nova, opcional | CORS; vazio = domínios da Mano's |

Coloque os valores em **`.env.local`** (local) e em **Vercel → Settings → Environment
Variables** (produção).

> `META_CAPI_SITE_SECRET` vazio deixa o endpoint aberto: qualquer um consegue injetar
> `Purchase` no pixel e estragar a otimização das campanhas. Gere um valor e mande o mesmo
> no header a partir do site.

---

## 4. Modo teste (validar no Gerenciador de Eventos antes de produção)

> ### 🚨 ANTES DE RODAR QUALQUER CURL: nada disso está no ar ainda
>
> Domínio real do CRM: **`manoscrm.com.br`**. `crm.manosveiculos.com.br` **não existe**
> (NXDOMAIN) — era um fallback errado no código, já corrigido. Qualquer comando apontando
> pra lá falha na resolução de DNS, e não por causa do código.
>
> Estado medido em 19/09/2026 contra produção:
>
> | Rota | Produção |
> |---|---|
> | `/api/meta-capi` (antiga) | 405 → existe |
> | `/api/admin/meta-conversions` | **404 → não deployada** |
> | `/api/meta-capi/vehicle` (nova) | **404 → não deployada** |
>
> Os curls abaixo só funcionam **depois** de commit + deploy. Rodar antes disso devolve 404
> e faz parecer que o código está quebrado quando ele só não subiu.

No Gerenciador de Eventos → dataset 995826668986455 → aba **Testar eventos**, copie o
código (formato `TEST12345`) e mande em `test_event_code`. Evento com `test_event_code`
aparece na aba de teste e **não** conta como conversão de produção.

**a) Direto no endpoint do site:**

```bash
curl -X POST https://manoscrm.com.br/api/meta-capi/vehicle \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ViewContent",
    "vehicle_id": "3563862",
    "test_event_code": "TEST12345",
    "user_data": { "email": "teste@manosveiculos.com.br", "phone": "47999998888" }
  }'
```

Resposta:

```json
{ "success": true, "event": "ViewContent", "content_ids": ["3563862"],
  "value": 219900, "currency": "BRL", "matched_by": "explicit_id",
  "vehicle": "BMW Z4 Roadster sDRIVE 20i 2.0 16V 2p Aut.", "test_mode": true }
```

**b) Pelo painel admin** (pega sozinho um `retailer_id` real do feed vivo):

```bash
curl -X POST https://manoscrm.com.br/api/admin/meta-conversions \
  -H "Content-Type: application/json" \
  -d '{ "action": "test-catalog", "eventName": "AddToCart", "testEventCode": "TEST12345" }'
```

**c) Diagnóstico rápido** — `GET /api/meta-capi/vehicle` mostra pixel, versão, se o token
está configurado, se o segredo é exigido e se o modo teste global está ligado.

Troque `eventName` por `ViewContent`, `AddToCart` ou `Purchase`. Confira na aba
**Testar eventos** se cada um chega com `content_ids` batendo com o veículo.

---

## 5. O que falta fazer no site (WordPress / Altimus)

### 5.1 ViewContent — na página de detalhe do veículo

```php
<?php
// functions.php do tema — roda no servidor, no render da página do veículo.
function manos_capi_view_content($retailer_id, $preco) {
    $payload = [
        'event'            => 'ViewContent',
        'vehicle_id'       => (string) $retailer_id,   // o MESMO ID do feed
        'value'            => (float) $preco,
        'currency'         => 'BRL',
        'event_source_url' => home_url(add_query_arg([], $GLOBALS['wp']->request)),
        'event_id'         => 'vc_' . $retailer_id . '_' . time(),
        'user_data'        => [
            // Repassar o IP/UA DO VISITANTE — senão a Meta recebe os do servidor.
            'client_ip_address' => $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null,
            'client_user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            'fbp'               => $_COOKIE['_fbp'] ?? null,
            'fbc'               => $_COOKIE['_fbc'] ?? null,
        ],
    ];

    wp_remote_post('https://manoscrm.com.br/api/meta-capi/vehicle', [
        'timeout'  => 5,
        'blocking' => false, // não segura o carregamento da página
        'headers'  => [
            'Content-Type'        => 'application/json',
            'X-Meta-Capi-Secret'  => MANOS_CAPI_SECRET, // = META_CAPI_SITE_SECRET
        ],
        'body' => wp_json_encode($payload),
    ]);
}
```

O `retailer_id` está no fim da URL do estoque
(`.../nissan-frontier-...-2013-2014-3700622` → `3700622`). Se for mais fácil, mande a URL
inteira em `vehicle_id` — o endpoint extrai o ID.

### 5.2 AddToCart — no botão "Tenho interesse" / WhatsApp

```js
// Roda no navegador: IP, user-agent e cookies vão automáticos na requisição.
document.querySelectorAll('[data-manos-interesse]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const retailerId = btn.dataset.retailerId;   // MESMO ID do feed
    const eventId = 'atc_' + retailerId + '_' + Date.now();

    // Pixel do navegador com o mesmo event_id → a Meta deduplica
    if (window.fbq) {
      fbq('track', 'AddToCart', {
        content_type: 'product',
        content_ids: [retailerId],
        value: Number(btn.dataset.preco),
        currency: 'BRL',
      }, { eventID: eventId });
    }

    fetch('https://manoscrm.com.br/api/meta-capi/vehicle', {
      method: 'POST',
      credentials: 'include',            // manda os cookies _fbp/_fbc
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'AddToCart',
        vehicle_id: retailerId,
        value: Number(btn.dataset.preco),
        currency: 'BRL',
        event_source_url: location.href,
        event_id: eventId,
      }),
      keepalive: true,                   // sobrevive ao redirect pro WhatsApp
    }).catch(() => {});
  });
});
```

> Se usar o `META_CAPI_SITE_SECRET`, **não** coloque o segredo nesse JS (fica visível no
> navegador). Nesse caso dispare o AddToCart pelo lado servidor (como em 5.1) ou deixe o
> endpoint sem segredo e restrinja por `META_CAPI_ALLOWED_ORIGINS`.

### 5.3 AddToCart pelo webhook (alternativa sem tocar no front)

Se o botão já joga o lead em `/api/webhook/universal`, basta o payload trazer o ID do
veículo — o webhook dispara o `AddToCart` sozinho, em lead novo e em re-entrada:

```json
{ "name": "João", "phone": "47999998888", "vehicle": "BMW Z4",
  "source": "Site - Tenho Interesse", "vehicle_id": "3563862", "value": 219900 }
```

---

## 6. Purchase: a pegadinha do veículo vendido

`trackDealWon` resolve o `content_ids` nesta ordem: `vehicleId` explícito → match estrito
do `vehicle_interest` no feed vivo → sem `content_ids`.

**Veículo vendido sai do feed da Altimus.** Se a venda for lançada dias depois, o match no
feed falha e o `Purchase` vai sem `content_ids` (com aviso no log). Pra resolver de vez,
o caminho é guardar o `retailer_id` no lead no momento do `ViewContent`/`AddToCart` e
passá-lo adiante:

```ts
await dispatchMetaConversionForStatusChange(lead, 'vendido', valor, undefined, undefined, retailerIdDoVeiculo);
```

Isso exige uma coluna nova no lead (ex.: `meta_content_id`) — **não** foi criada aqui,
porque migration é decisão do dono. Enquanto não existir, `Purchase` acerta o
`content_ids` só quando o carro ainda está no estoque ou quando o ID é passado na mão.

## 7. `action_source` por evento

| Evento | `action_source` | Por quê |
|---|---|---|
| `ViewContent` | `website` | veio do navegador, tem UA e URL da página |
| `AddToCart` | `website` | idem |
| `Purchase` | `physical_store` | fecha na loja e é lançado no CRM — não existe navegador |

O `Purchase` era `website` na primeira versão. A [doc da Meta](https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters)
exige `client_user_agent` e `event_source_url` em evento `website`, e a venda lançada no
CRM não tem nenhum dos dois: marcar como `website` seria declarar uma origem que não
existe e derrubar a qualidade do sinal.

Continua trocável, caso a venda passe a ter contexto de navegador:

```ts
trackDealWon(lead, valor, testCode, vehicleId, 'website');
```
