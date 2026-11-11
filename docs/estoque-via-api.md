# Estoque sempre pela API da Altimus

Decisão do Alexandre (06/11/2026). Especificação: `docs/growth360/estoque-via-api.md` (pasta do Growth 360).

## O que mudou
- **Função única:** `src/lib/estoque/index.ts` sobre `altimusInventory` (feed da Altimus).
  - Cache de **10 min**.
  - Altimus fora do ar → **última cópia boa**, com `desatualizado: true` (e nova tentativa em 1 min).
  - **Nunca** volta para a tabela `estoque`.
- **Trocados** (nenhum `from('estoque')` sobra no código): `api/laura/_auth.ts`, `qualificacaoService`,
  `fila/carregarFila.ts`, `whatsapp/ia/motor.ts`, `services/inventoryService.ts`, `api/intelligent-analysis`,
  `LeadProfileModalV2` (agora usa `GET /api/estoque`, com login) e `api/v2/inventory/sold-notify`
  (deixou de escrever na tabela; carro vendido sai do feed sozinho).
- **Rota nova para o n8n:** `GET /api/laura/estoque?busca=&id=&limite=` com `Authorization: Bearer <LAURA_API_KEY>`
  (o mesmo segredo de `salvar_qualificacao`). Devolve por carro: `id`, `descricao`, `marca`, `modelo`, `versao`, `ano`,
  `km`, `cor`, `cambio`, `combustivel`, `preco`, `opcionais`, `fotos`, `link`; e no topo `desatualizado`,
  `atualizado_em`, `total_no_estoque`. Nada achado = `carros: []`.
- `supabase/migrations/20261107_estoque_obsoleto.sql`: só um COMMENT na tabela (NÃO aplicada).
- Ainda fora desta entrega (limpeza futura): `estoque_sincronizado` (cron sync-inventory, inventoryMatcher).

## Aceite (feed real de 06/11, 38 carros) — `npm run test:estoque` + consulta ao vivo
- Os carros que faltavam respondem: Compass Limited 2019, Cruze Sport LTZ 2018, HR-V 2020, Z4, Frontier, Captur,
  HB20S, Nivus 2021, Civic LXS, PCX, Biz, Fluo.
- Os que saíram não aparecem: Uno, Compass Longitude.
- Onix Premier 2025 = **R$ 88.900**.
- Com a Altimus fora (simulada): usa a última cópia e marca `desatualizado`.

## n8n (o Alexandre faz)
Ferramenta `busca_estoque2`: trocar a tabela por um nó HTTP Request
`GET https://manoscrm.com.br/api/laura/estoque?busca={{ $fromAI('busca') }}` + header `Authorization: Bearer <LAURA_API_KEY>`.
Testar "onix", "compass" e "cruze".

## Reversão
Reverter o commit. A tabela `estoque` não foi apagada nem alterada.
