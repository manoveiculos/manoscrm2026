# Laura dentro do CRM — etapa B (ENSAIO)

Growth 360 · 06/11/2026 · especificação: `D:\Agentes de marketing\docs\growth360\time-atendimento-crm.md`

**O que é:** a Laura passa a rodar também dentro do CRM, ao lado da Laura do n8n.
Nesta etapa ela **não envia nada ao cliente**: lê cada mensagem nova, escreve a
resposta que mandaria (rascunho) e grava tudo para comparar com o que o n8n
mandou de verdade. A decisão de passar para a etapa C (o CRM responde e o n8n
sai) é do Alexandre, com o relatório do ensaio na mão.

## Como funciona

```
Evolution → n8n → nó HTTP → POST /api/wa/ingest (grava em wa_mensagens)
                                  └─ depois de responder ao n8n (after):
                                     Laura do CRM (src/lib/whatsapp/ia/motor.ts)
```

1. Só roda com **as duas chaves**: `WA_IA_ATIVA=true` no servidor **e** o botão
   "Laura do CRM" em **Ensaio** (tela Conversas, só o admin muda).
2. Espera ~8 s para juntar mensagens seguidas. Se o cliente mandou outra nesse
   meio-tempo, quem responde é a rodada da mais nova.
3. Áudio: espera a transcrição (até 45 s).
4. Não roda se a conversa está com humano (`status='humano'`, mesma regra de
   `wa_ia_pode_responder`), se é mensagem de consultor ou reação, ou se passou do
   limite do dia (`WA_IA_LIMITE_DIA`, padrão 300 rodadas).
5. Trava por conversa: uma rodada por vez (índice único em `wa_ia_execucoes`).
6. Claude Sonnet 5.5 (`claude-sonnet-5-5`, esforço baixo, prompt em cache) com 5
   ferramentas:
   | ferramenta | no ensaio |
   |---|---|
   | `buscar_estoque` | lê o feed da Altimus (preço e km exatos) |
   | `enviar_fotos` | **só anota** as URLs das fotos reais do anúncio |
   | `salvar_ficha` | grava a ficha na conversa; **nome e cidade vão para o lead** (regras abaixo) |
   | `agendar_visita` | lista horários livres / valida o escolhido; **só anota** |
   | `passar_para_consultor` | **só anota** (no envio: conversa vai para humano + push ao vendedor) |
7. O texto final passa pelo filtro de regras (`src/lib/laura/guardrails.ts`):
   parcela, avaliação, fechamento, preço fora do anúncio e pedido de documento
   viram a resposta segura. Financiamento sempre com "sujeito a análise de crédito".
8. Grava em `wa_ia_execucoes`: rascunho, texto antes do filtro, violações,
   ferramentas chamadas, fotos/visita/passagem anotadas, ficha, tokens, custo
   (US$) e tempo.

### Nome do cliente (regra combinada em 06/11)

- A Laura pergunta o nome logo no começo (responde a dúvida em uma linha e
  pergunta o nome na mesma mensagem). O nome do perfil do WhatsApp é provisório.
- Só anota o nome se o primeiro nome **aparece na fala do cliente** (trava contra
  nome inventado).
- No lead (`leads_distribuicao_crm_26.nome` ou `leads_master.name`) o nome só
  substitui nome **vazio ou genérico** ("Analisar Perfil", "Lead …", telefone, o
  próprio nome do perfil) ou o que a própria IA gravou antes. **Nome que um
  consultor editou à mão fica** (`wa_conversas.nome_ia_no_lead` guarda o último
  nome da IA para saber a diferença). A gravação é condicional: se o nome mudou
  entre a leitura e a escrita, não grava.
- Cidade no lead só preenche quando está vazia.
- Na conversa: `wa_conversas.nome_cliente` (origem `ia`; se um dia vier `manual`,
  a IA não troca). A tela Conversas mostra esse nome no lugar do nome do perfil.
- O ajuste dos **leads antigos** (preencher nomes a partir das conversas) é
  separado e precisa de aprovação própria. Não está aqui.

## Ligar o ensaio (depois do "aprovado")

1. Aplicar a migration `supabase/migrations/20261106_wa_ia_ensaio.sql`
   (ensaiada em 06/11 em `BEGIN…ROLLBACK` com `supabase/tests/wa_ia_rls.test.sql`:
   22/22 ok, nada ficou). Ela nasce com o botão **desligado**.
2. Deploy do código (fora do horário comercial, fast-forward no `main`).
3. Na Hostinger: `WA_IA_ATIVA=true`. Conferir que `API_CLAUDE` existe (é a chave
   da Anthropic que o CRM já usa). **Não** criar `WA_IA_ENVIO_LIBERADO`.
4. Tela Conversas (login admin) → "Laura do CRM" → **Ligar ensaio**.
5. Ver as rodadas: abrir uma conversa → aba **Ensaio da Laura** (lado a lado:
   "Enviado de verdade" × "Rascunho do CRM", com tempo, custo, ferramentas e o
   que o filtro barrou).

### Variáveis

| Variável | Valor | Para quê |
|---|---|---|
| `WA_INGEST_ATIVO` | `true` (fica ligado) | ingestão permanente |
| `WA_IA_ATIVA` | `true` para o ensaio | chave geral da Laura do CRM; sem ela nada roda, nem com o botão ligado |
| `WA_IA_LIMITE_DIA` | opcional, padrão `300` | teto de rodadas por dia (custo) |
| `WA_IA_MODELO` | opcional, padrão `claude-sonnet-5-5` | troca de modelo sem deploy |
| `WA_IA_ESPERA_MS` | opcional, padrão `8000` | espera para juntar mensagens |
| `WA_IA_ENVIO_LIBERADO` | **não criar** | só na etapa C; sem ela o modo "envia" vira ensaio |

## Desligar (reversão)

- **Na hora, sem deploy:** botão "Desligar" na tela Conversas, ou
  `WA_IA_ATIVA=false` na Hostinger. A ingestão e a tela seguem normais.
- **Código:** reverter o commit do PR; a ingestão volta a só gravar.
- **Banco:** bloco REVERSÃO no topo da migration (apaga `wa_ia_*` e as colunas
  novas de `wa_conversas`). Nada de lead muda de estrutura.

## Relatório do ensaio (≥ 1 dia rodando)

```sql
-- números gerais desde o início do ensaio
select count(*) filter (where status = 'ok')                        as rascunhos,
       count(*) filter (where status in ('erro','abandonada'))      as erros,
       count(*) filter (where status = 'pulada')                    as puladas,
       count(*) filter (where cardinality(violacoes) > 0)           as barrados_pelo_filtro,
       round(avg(tempo_ms) filter (where status = 'ok'))            as tempo_medio_ms,
       round(sum(custo_usd), 4)                                     as custo_total_usd,
       count(distinct conversa_id) filter (where status in ('ok','erro')) as conversas,
       round(sum(custo_usd) / nullif(count(distinct conversa_id) filter (where status in ('ok','erro')), 0), 4) as custo_por_conversa_usd
  from wa_ia_execucoes
 where iniciada_em >= '<início do ensaio>';

-- violações por tipo
select v, count(*) from wa_ia_execucoes, unnest(violacoes) v
 where iniciada_em >= '<início do ensaio>' group by v order by 2 desc;
```

Exemplos lado a lado: tela Conversas → aba Ensaio da Laura. No relatório, **sem
dados pessoais** (nome, telefone, placa e cidade trocados por genéricos).

## O que está pronto para a etapa C (bloqueado)

O caminho de envio existe em `motor.ts` (`executarEnvio`): manda o texto e as
fotos pela Evolution, grava a visita em `agendamentos`, põe a conversa em
`humano` e avisa o vendedor por push. Ele só roda com `WA_IA_ENVIO_LIBERADO=true`
**e** o modo gravado em `envia` — e o botão da tela não oferece "envia". Antes
de liberar: desligar a Laura do n8n (senão o cliente recebe duas respostas).
