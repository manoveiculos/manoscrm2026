# Laura — qualificação no primeiro contato

A Laura (IA de WhatsApp) roda no **n8n**; a memória da conversa fica em
`concessionaria_mensagens`. O CRM agora oferece duas ferramentas HTTP para o
agente e o prompt pronto. Nada disso entra no ar até o fluxo do n8n ser
ajustado (passos abaixo).

## 1. Variável de ambiente (CRM)

```
LAURA_API_KEY=<chave longa e aleatória>
```

As rotas `/api/laura/*` só respondem com `Authorization: Bearer <LAURA_API_KEY>`.

## 2. Prompt do agente

Copie `LAURA_SYSTEM_PROMPT` de `src/lib/laura/playbook.ts` para o
"System Message" do nó AI Agent. Resumo:

- 4 perguntas, uma ou duas por mensagem: carro/faixa de valor → entrada em R$
  → carro na troca → prazo (esta semana / este mês / 1 a 3 meses / só pesquisando).
- Com as 4 respondidas, oferecer horário de visita.
- **Nunca** avaliar carro, dar preço diferente do anunciado, simular parcela
  ou fechar negócio. Financiamento sempre "sujeito a análise de crédito".

## 3. Ferramenta `salvar_qualificacao`

`POST /api/laura/qualificacao`

```json
{ "telefone": "5547999998888", "carro": "Onix até 60 mil", "entrada": "10 mil", "troca": "Sem troca", "prazo": "essa semana" }
```

Mande só o que o cliente respondeu (os outros campos podem ficar fora). O
prazo aceita texto livre ("mês que vem", "só olhando").

Resposta (sem nome nem telefone do cliente):

```json
{
  "ok": true, "lead": "#4321", "selo": "quente", "completa": true,
  "faltando": [], "proximas_perguntas": [],
  "horarios_visita": ["amanhã às 10h", "sex 17/10 às 10h", "sáb 18/10 às 10h"],
  "prazo_nao_entendido": false, "campos_ignorados": [], "alerta_carro": "nao_se_aplica"
}
```

- `proximas_perguntas`: no máximo 2, na ordem do playbook.
- `horarios_visita`: só vem quando a qualificação está completa.
- `alerta_carro: "criado"`: o cliente pediu carro abaixo do estoque e virou
  alerta na Central de Compras (o vendedor dono é avisado quando aparecer).

## 4. Ferramenta `revisar_resposta`

`POST /api/laura/revisar` — `{ "texto": "...", "telefone": "..." }`

Devolve `{ ok, violacoes, texto_seguro }`. **Sempre envie `texto_seguro`.**
Se a mensagem simular parcela, avaliar carro, fechar negócio, pedir CPF ou
citar valor que não é preço anunciado nem número dito pelo cliente, ela é
trocada por um convite para a visita. Se falar de financiamento sem a frase,
o filtro acrescenta "(sujeito a análise de crédito)".

## 5. Onde aparece no CRM

Os campos gravados alimentam o selo (Quente / Morno / Fora do perfil / Sem
qualificação) no perfil do lead, no Kanban de Atendimento e na Inbox, e o
alerta "lead Quente sem resposta humana há 15 min".
