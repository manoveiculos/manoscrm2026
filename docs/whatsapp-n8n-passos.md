# WhatsApp da loja no CRM — passo a passo no n8n

Para o Alexandre (quem administra o n8n). Fase 2 da repaginação, Growth 360.

**Objetivo:** toda mensagem do número da loja (47) 3300-1352 cair também no CRM
(`wa_conversas` / `wa_mensagens`), sem mexer no que a Laura faz hoje. É o
"modo sombra": o CRM grava, ninguém vê ainda e ninguém responde por ele.

**O que NÃO muda:** o webhook da Evolution continua apontando para o n8n. A Laura
continua respondendo igual. Se o CRM cair, a Laura não percebe (o nó novo segue
em frente mesmo com erro).

**Ordem:**

1. ✅ Migration aplicada (`supabase/migrations/20261104_wa_whatsapp_loja.sql`) e bucket `whatsapp-midia`
   criado em 05/11/2026, com o "aprovado" do Alexandre. Tabelas vazias; nada existente mudou.
2. Código do CRM publicado (deploy do branch `feat/crm-whatsapp-fase2-sem-e04`, que é a Fase 2 sobre o `main` sem o E04) — precisa de "aprovado" próprio,
   fora do horário comercial. Sem isso a rota `/api/wa/ingest` não existe no ar e o passo 4 não funciona.
3. Variáveis no servidor do CRM (passo 1), com `WA_INGEST_ATIVO=false`.
4. Nó novo no fluxo da Laura (passo 2) e teste com número interno (passo 4).
5. Ligar o modo sombra por 48 h (`WA_INGEST_ATIVO=true`) — aprovado pelo Alexandre em 05/11, depois do passo 4.
   **Atualização 06/11/2026:** a ingestão virou **PERMANENTE** (decisão do Alexandre).
   `WA_INGEST_ATIVO=true` continua ligado depois das 48 h: a tela Conversas e a Laura
   do CRM (`docs/laura-crm-ensaio.md`) dependem dela. Não desligar no fim do modo sombra.
6. A checagem "vendedor assumiu" antes da Laura responder (passo 3) pode entrar
   já: até a Fase 3 ninguém assume conversa, então ela sempre deixa a Laura responder.

---

## Passo 1 — variáveis no servidor do CRM (Hostinger)

| Variável | Valor | Para quê |
|---|---|---|
| `WHATSAPP_INGEST_SECRET` | um segredo novo e longo (ex.: 40 caracteres aleatórios) | o n8n manda no header; sem ele a rota recusa |
| `WA_LOJA_INSTANCIA` | `teste` (confirmado em 05/11: é o (47) 3300-1352, perfil "Manos Veiculos") | só eventos dessa instância são gravados; também é usada para baixar a mídia |
| `WA_LOJA_TOKEN` | o mesmo valor de `EVOLUTION_INSTANCE_TOKEN` (apikey da instância `teste`) | baixar foto/áudio/vídeo/documento |
| `WA_LOJA_EVOLUTION_URL` | opcional; só se a instância da loja estiver em outro servidor Evolution | sem ela usa `EVOLUTION_BASE_URL` |
| `WA_INGEST_ATIVO` | `false` agora; `true` para ligar o modo sombra | chave geral: com `false` a rota responde 200 e não grava |

> A instância `teste` é o número da loja **e** também é por ela que o CRM manda os
> avisos de lead/SLA aos vendedores (`EVOLUTION_INSTANCE_NAME`). Esses avisos chegam
> ao CRM como mensagem enviada e são gravados como autor **sistema** (não como Laura),
> com a marca `telefone_de_consultor`. A ingestão continua lendo a instância só de
> `WA_LOJA_INSTANCIA`, para as duas coisas poderem se separar no futuro.

Gerar um segredo (PowerShell):

```powershell
[Convert]::ToBase64String((1..30 | ForEach-Object { Get-Random -Maximum 256 }))
```

---

## Passo 2 — nó HTTP em paralelo, logo depois do webhook da Evolution

No fluxo da Laura (o que recebe o webhook da Evolution do número da loja):

1. Ache o primeiro nó, o **Webhook** que a Evolution chama.
2. Arraste uma **segunda saída** desse Webhook para um nó novo **HTTP Request**.
   A ligação que já existe (para a Laura) fica como está.
   - Ligue **direto no Webhook**, antes de qualquer IF/filtro da Laura: assim o
     CRM recebe também status (entregue/lido), edição e mensagem apagada.
   - Posicione o nó novo **abaixo** do ramo da Laura no canvas. O n8n roda os
     ramos de cima para baixo; assim a Laura nunca espera o CRM.
3. Configure o HTTP Request:

   | Campo | Valor |
   |---|---|
   | Nome | `CRM - ingestão WhatsApp` |
   | Method | `POST` |
   | URL | `https://manoscrm.com.br/api/wa/ingest` |
   | Authentication | None |
   | Send Headers | ligado → `x-ingest-secret` = o valor de `WHATSAPP_INGEST_SECRET` (de preferência numa credencial "Header Auth") |
   | Send Body | ligado → Body Content Type `JSON` → Specify Body `Using JSON` |
   | JSON | `{{ JSON.stringify($json.body) }}` |
   | Options → Timeout | `5000` |

   > O nó Webhook do n8n entrega `{ headers, params, query, body }`. O CRM quer o
   > `body` (o evento cru da Evolution). Se você mandar o item inteiro, o CRM
   > também entende — mas aí os headers do n8n viajam junto, por isso prefira o `body`.

4. **Settings** do nó HTTP Request:
   - **On Error → Continue** (o "continue on fail"). Erro no CRM nunca para o fluxo.
   - Retry On Fail: pode ligar com 1 tentativa; a ingestão é idempotente
     (mensagem repetida não duplica).
5. Salve e ative o fluxo.

### Eventos que a Evolution precisa mandar

Na configuração do webhook da instância da loja (Evolution → Instância → Webhook):

- `MESSAGES_UPSERT` — já está ligado (é o que a Laura usa).
- `SEND_MESSAGE` — **é o que traz as respostas da Laura** (mensagem enviada pela API).
- `MESSAGES_UPDATE` — entregue / lido.
- `MESSAGES_DELETE` — apagada para todos.

⚠️ Antes de ligar os 3 últimos, confira que o primeiro nó da Laura depois do
Webhook **ignora** evento que não seja `messages.upsert` de cliente
(`fromMe = false`). Se ela não filtra, não ligue: use a alternativa abaixo para
as respostas da Laura e fique sem status/edição por enquanto. Atenção redobrada:
com `SEND_MESSAGE` ligado, **cada aviso que o CRM manda a vendedor** pela instância
`teste` também passa a chegar no fluxo da Laura.

**Alternativa para as respostas da Laura (sem ligar `SEND_MESSAGE`):** depois de
**cada** nó que envia mensagem pela Evolution (sendText, sendMedia…), ponha outro
HTTP Request igual ao de cima, com este JSON:

```
{{ JSON.stringify({ event: 'send.message', instance: 'NOME_DA_INSTANCIA', data: $json }) }}
```

(`$json` ali é a resposta da Evolution ao envio, que já traz `key.id` e a mensagem.)

**Base64 da mídia (opcional):** se ligar "Webhook Base64" na instância, a Evolution
já manda o arquivo no evento e o CRM não precisa pedir de novo. Deixa o evento
pesado (áudio e vídeo); não é obrigatório.

---

## Passo 3 — checagem "vendedor assumiu?" antes da Laura responder

Contrato da Fase 3: quando um vendedor clica **Assumir** (ou manda a 1ª mensagem
pelo CRM), a conversa fica `status = 'humano'` por 7 dias. Nesse período a Laura
**não pode responder** aquele cliente, senão IA e vendedor falam ao mesmo tempo.

No fluxo da Laura, **antes do nó do agente de IA** (depois do filtro de mensagem de cliente):

1. Nó **Postgres** (a mesma credencial que grava a memória em `concessionaria_mensagens`):
   - Operation: Execute Query
   - Query:
     ```sql
     select public.wa_ia_pode_responder($1) as pode
     ```
   - Query Parameters (troque `Webhook` pelo nome do seu nó de entrada):
     `{{ $('Webhook').item.json.body.data.key.remoteJidAlt || $('Webhook').item.json.body.data.key.remoteJid }}`
     (o CRM limpa o `@s.whatsapp.net` sozinho; se a Laura já tem o telefone num campo, pode usar ele)
   - Settings → **On Error → Continue**.

   Se preferir nó HTTP no lugar do Postgres:
   - POST `https://<projeto>.supabase.co/rest/v1/rpc/wa_ia_pode_responder`
   - headers `apikey` e `Authorization: Bearer` com a **service key** (nunca a anon: a função não aceita anon)
   - body `{ "p_telefone": "<o mesmo telefone>" }` → resposta `true`/`false`.
2. Nó **IF**: condição `{{ $json.pode === false }}`.
   - **true** → nó **No Operation** (a Laura fica quieta; o vendedor está atendendo).
   - **false** → segue para a Laura, como hoje.

Por que `=== false` e não `== true`: se o CRM estiver fora ou a função ainda não
existir, o nó dá erro, `pode` vem vazio e a Laura **responde normalmente**.
Nenhum cliente fica sem resposta por causa do CRM.

---

## Passo 4 — teste com número interno (antes das 48 h)

1. `WA_INGEST_ATIVO=true` só durante o teste (ou já no início das 48 h, com o seu ok).
2. De um celular interno **que não esteja cadastrado como consultor** no CRM (senão
   as respostas da Laura para ele entram como `sistema`), mande para o (47) 3300-1352: um texto, uma foto
   com legenda, um áudio de voz e um documento PDF. Responda uma mensagem da Laura
   citando ("responder") e apague uma.
3. Confira no SQL Editor:

```sql
select m.criada_em, m.recebida_em - m.criada_em as atraso, m.autor, m.tipo,
       left(coalesce(m.texto, m.legenda, ''), 40) as texto,
       m.midia_path is not null as midia_salva, m.transcricao is not null as transcrito,
       m.citada_message_id is not null as citada, m.apagada_em is not null as apagada
  from wa_mensagens m
  join wa_conversas c on c.id = m.conversa_id
 where c.telefone_key = '47999999999'   -- DDD + número do celular do teste, com o 9
 order by m.criada_em;
```

Esperado: cada mensagem 1 vez, foto/áudio/PDF com `midia_salva`, áudio com
`transcrito`, atraso de poucos segundos, respostas da Laura com `autor = laura`.

Se algo falhar, o motivo está em:

```sql
select created_at, source, error_message from webhook_errors
 where source in ('wa_ingest', 'wa_midia') order by created_at desc limit 20;
```

---

## Passo 5 — modo sombra por 48 h: como medir o aceite

```sql
-- 1. ≥ 99% das mensagens de cliente em até 5 s
select count(*) as total,
       round(100.0 * count(*) filter (where recebida_em - criada_em <= interval '5 seconds') / nullif(count(*), 0), 1) as pct_ate_5s
  from wa_mensagens where origem = 'evolution' and criada_em > now() - interval '48 hours';

-- 2. cobertura: mensagens de cliente na memória da Laura × no CRM, mesmo período
select (select count(*) from concessionaria_mensagens
         where message->>'type' = 'human' and data > (now() at time zone 'UTC') - interval '48 hours') as laura_cliente,
       (select count(*) from wa_mensagens
         where origem = 'evolution' and autor = 'cliente' and criada_em > now() - interval '48 hours') as crm_cliente;

-- 3. zero duplicada (a constraint UNIQUE já garante; conferência)
select provider_message_id, count(*) from wa_mensagens group by 1 having count(*) > 1;

-- 4. toda mídia salva e todo áudio transcrito
select tipo,
       count(*) as total,
       count(*) filter (where midia_path is not null) as salvas,
       count(*) filter (where midia_erro is not null) as com_erro,
       count(*) filter (where tipo = 'audio' and transcricao is not null) as transcritos
  from wa_mensagens
 where origem = 'evolution' and tipo in ('imagem', 'audio', 'video', 'documento', 'figurinha')
   and criada_em > now() - interval '48 hours'
 group by tipo;
```

E no n8n: a aba **Executions** do fluxo da Laura não pode ter erro novo.

---

## Passo 6 — deixar cada fluxo disponível para o MCP

O conector do n8n hoje lista **0 fluxos**: cada fluxo precisa ser marcado como
disponível para o MCP para aparecer. Para cada fluxo que o CRM/Claude deve
enxergar (no mínimo o da Laura):

1. Abra o fluxo.
2. Menu **⋯** (canto superior direito) → **Settings**.
3. Ligue **"Available in MCP"** e salve.

(Se a opção não aparecer, o acesso MCP precisa estar ligado antes em
**Settings → MCP Access** da instância do n8n.)

Isso só dá leitura/execução sob demanda pelo conector. Não muda o funcionamento do fluxo.

---

## Como desligar (reversão)

Do mais rápido ao mais completo:

1. **Chave geral** (segundos, sem mexer no n8n): `WA_INGEST_ATIVO=false` no
   servidor do CRM. A rota responde 200 e não grava nada.
2. **n8n:** desative ou apague o nó `CRM - ingestão WhatsApp` (e os de
   `send.message`, se usou a alternativa) e o par Postgres/IF do passo 3.
   Mesmo ligado, o nó tem "On Error → Continue" e fica abaixo do ramo da Laura:
   CRM lento ou fora do ar não atrasa nem para a Laura.
3. **Código:** `git revert` do commit da Fase 2 no `main` (nunca push forçado).
4. **Banco:** bloco REVERSÃO no topo da migration (remove cron, gatilhos,
   tabelas `wa_*` e funções; o bucket se esvazia pela API do Storage e depois é
   apagado). Ensaiado em 05/11 dentro de transação desfeita.

O que o modo sombra **nunca faz**: enviar mensagem, responder cliente, marcar
como lida ou mexer em lead. A ingestão só lê o evento, grava em `wa_*`, baixa a
mídia da Evolution e transcreve áudio. Nada disso toca na Laura nem em
`concessionaria_mensagens`.

## Limitação conhecida

Mensagem com `fromMe` que chega pelo n8n é gravada como **Laura**. Se alguém
digitar direto no celular da loja, ela também aparece como "Laura" até a Fase 3
(quando o vendedor passa a responder pelo CRM e o envio já entra como `vendedor`).
