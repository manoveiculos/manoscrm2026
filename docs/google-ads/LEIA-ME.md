# Vigia de anúncios do Google Ads

Script que confere a conta todo dia e manda um e-mail em português quando acha
problema. **Só lê a conta**: não pausa, não edita, não cria e não apaga nada.

Arquivo: [`vigia-anuncios-google.js`](vigia-anuncios-google.js)

## O que ele confere

| Verificação | Exemplo de problema que acha |
|---|---|
| Configuração | Campanha de Pesquisa com a Rede de Display ligada; local em "Presença ou interesse" (mostra o anúncio para quem mora fora da região) |
| Anúncios | Anúncio reprovado; grupo ativo sem nenhum anúncio no ar; força do anúncio "Ruim" |
| Links | Link do anúncio, da palavra-chave ou do sitelink com erro 4xx/5xx; página que mostra "Esse carro já foi vendido", "[VENDIDO]" ou "Olá, mundo!" |
| Gasto | Ontem gastou muito acima ou abaixo da média dos 13 dias anteriores; campanha que parou de gastar |
| Termos de pesquisa | Buscas que gastaram R$ 15 ou mais em 30 dias sem nenhuma conversão (candidatas a palavra negativa) |

Se uma verificação falhar (por exemplo, o Google recusar uma consulta), as outras
continuam e a falha aparece no e-mail como "Script".

## Como instalar (uns 5 minutos)

1. No Google Ads da Manos (conta 587-086-9611), vá em **Ferramentas → Ações em massa → Scripts**.
2. Clique no **+** e dê o nome **Vigia de anúncios**.
3. Apague o texto que vem de exemplo e cole o conteúdo de `vigia-anuncios-google.js`.
4. No começo do código, em `EMAILS`, troque `COLOQUE_SEU_EMAIL_AQUI` pelo e-mail de quem recebe o alerta.
5. Clique em **Autorizar** e aceite as permissões. Elas são necessárias para ler a conta, abrir as páginas dos anúncios e mandar o e-mail.
6. Clique em **Visualizar**. É um teste: ele lê tudo e mostra no registro o que acharia, sem mandar e-mail.
7. Se o resultado fizer sentido, clique em **Executar** uma vez e confira o e-mail.
8. Em **Frequência**, deixe **Diariamente, 8h**.

Na primeira semana deixe `ENVIAR_SE_TUDO_OK: true` (já vem assim): você recebe o e-mail
todo dia e sabe que o script está rodando. Depois mude para `false` e só receba quando houver problema.

## O que ajustar para a Manos

- **Textos de "carro vendido":** os de `TEXTOS_DE_PROBLEMA_NA_PAGINA` foram tirados do site novo
  (manosveiculoscompra.com). Os anúncios de hoje apontam para **manosveiculos.com.br**, que é outro
  site: abra, num carro vendido, a página que ele mostra e acrescente o texto exato à lista. Sem isso,
  o script só pega a página fora do ar (erro 404/500), não a que avisa que o carro saiu.
- **Limites de gasto:** `VARIACAO_GASTO` (0,6 = 60%) e `GASTO_MINIMO_MEDIA` (R$ 10 por dia).
- **Termos de pesquisa:** `GASTO_MINIMO_TERMO` (R$ 15) e `MAX_TERMOS` (15).
- **Links ignorados:** `DOMINIOS_IGNORADOS` (Instagram, WhatsApp etc. não são testados).

## Limites

- O Google dá cerca de 30 minutos de execução por script, por isso a verificação de links testa
  no máximo `MAX_URLS` páginas (60) por rodada.
- Links com parâmetro dinâmico (`{...}`) não são testados.
- O script não resolve nada sozinho: ele avisa. Cada correção (tirar a Rede de Display, trocar o
  local, arrumar um sitelink) é feita por uma pessoa ou proposta ao agente Tráfego, que pede aprovação.

## De onde vem

As ideias vêm dos scripts de monitoramento da Brainlabs
([github.com/Brainlabs-Digital/Google-Ads-Scripts](https://github.com/Brainlabs-Digital/Google-Ads-Scripts),
GPL-2.0, pasta `Monitoring`: `broken-destination-urls`, `landing-page-contents-checker`,
`change-in-campaign-spending-alert`, `check-for-empty-ad-groups`). O código foi escrito do zero para
a API atual do Google Ads (`AdsApp.search` com GAQL), porque os originais usam a API antiga
(`AdWordsApp`), que o Google está desligando. Nenhum código da Brainlabs foi copiado.

## Segunda parte, que é no n8n e não neste script

Os leads do Google chegam ao CRM sem origem (em 30 dias, 86 leads e nenhum com gclid ou UTM). Para o
Google aprender qual campanha e qual palavra trazem lead bom:

1. No Google Ads, em **Configurações da conta → Rastreamento → Sufixo do URL final**, coloque:
   `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}`
2. No fluxo do n8n que recebe o formulário do Google, repassar o `gcl_id` para o CRM. O CRM já lê
   `utm_params.gclid` e o envio de conversões offline ao Google usa esse campo quando existe.
