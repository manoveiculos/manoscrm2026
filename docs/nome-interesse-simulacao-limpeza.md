# Limpeza dos leads antigos — relatório de SIMULAÇÃO (nome e carro)

11/11/2026 · Growth 360. **Nada foi gravado.** Este relatório só lê o banco e roda o extrator em memória.
Sem nome completo de cliente, sem telefone, sem CPF: só contagens e primeiros nomes.
A aplicação real é **separada** e só roda com o "aprovado" do Alexandre (ver "Como aplicar").

## 1. Tamanho do problema (banco, 11/11)

| | crm26 (`leads_distribuicao_crm_26`) | master (`leads_master`) |
|---|---|---|
| Leads | 1.985 | 4.018 |
| Nome "Lead W…" / "Lead WhatsApp" | 456 | 877 |
| Interesse "Analisar Perfil" | 374 | 759 |
| Interesse "Lead Google - Não especificado" | 270 | 535 |
| Interesse vazio | 24 | 255 |

(O master espelha o crm26 e tem leads antigos próprios; a limpeza é feita pelo telefone, nos dois.)

## 2. Nome — o que a simulação achou

Base: os leads de nome genérico no crm26 (458 com "Lead W…", "Lead WhatsApp" ou "Analisar Perfil").
- **453 têm conversa da Laura do n8n** registrada (ligação por `dados_cliente.telefone → sessionid → concessionaria_mensagens`).
- **122** têm uma resposta do cliente logo depois de a Laura pedir o nome, ou uma frase "meu nome é/me chamo/sou o".
- Rodei o extrator (`src/lib/identificacao/nome.ts`) em **120** dessas respostas reais (as outras 2 trazem documento pessoal e foram deixadas de fora de propósito):

| Resultado | Quantidade |
|---|---|
| **Nome identificado** | **68** (57%) |
| Sem nome (a resposta era pergunta, "bom dia", modelo de carro, "ok", emoji, boleto…) | 52 |

- Amostra (só o primeiro nome): Luana, Ricardo, Jessica, Felipe, Geovani, Juliano, Talita, Clovis, Claudio, Patrícia, Ronaldo.
- **Para revisão manual:** 3 nomes com 4 ou mais palavras (nome longo). Entram como "duvidosos" e **não** são aplicados sozinhos.
- **Ficam de fora (o extrator prefere errar para menos):**
  - nome e endereço na mesma linha ("Fulano cidade de… bairro…");
  - "Fulano meu nome" (verbo no fim);
  - nome de uma palavra na 2ª linha depois de uma frase longa (para não confundir com cidade).
- **Corrigidos pela simulação** (viraram testes): "Já comprei" e "Ta" não são nome; "Noite / Rodrigo" e "Nome é Fulano" são.

Estimativa para a limpeza: **cerca de 65 a 70 nomes** recuperáveis no crm26 (a estimativa anterior, ~90, contava respostas que não eram nome). O restante só melhora com a conversa nova.

## 3. Carro — estimativa (simulação de texto ainda não rodada)

- ~**138** leads sem carro definido citam um modelo na conversa (medição da Auditoria, 06/11).
- A regra: interesse vazio/genérico → substitui pelo nome exato do feed da Altimus; carro de troca nunca entra; fora do estoque entra como `em_estoque = false`.
- **Falta:** rodar `carrosCitados()` sobre as mensagens desses 138 para separar "certo", "fora do estoque" e "duvidoso". Faço junto com a aplicação, em modo simulação, antes de gravar.

## 4. Como aplicar (só com o "aprovado")

1. Aplicar a migration `20261107_nome_interesse_auto.sql` (ensaiada em produção: 33/33, nada ficou).
2. Rodar a limpeza **em transação**, só nos leads com nome ou interesse genérico, chamando `atualizar_nome_lead()` e `registrar_interesse_lead()`:
   - nunca toca nome ou carro digitado por consultor (a função decide: sem histórico e nome não genérico = manual);
   - grava `lead_nome_historico` com `por = 'limpeza'`, o que permite **desfazer**;
   - não mexe em status (a guarda do gatilho garante).
3. Conferir por amostra (primeiros nomes) e só então confirmar a transação.

## 5. Reversão
- Cada troca de nome fica no histórico: `desfazer_nome_lead(<id>)` devolve o nome anterior.
- Carros: `lead_veiculos_interesse` guarda o texto que já estava (`origem = 'anterior'`); recompor o campo é só reexecutar a função.
