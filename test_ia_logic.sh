# Teste de Evolução IA - Manos CRM

## Cenário 1: Lead em Fase Inicial (Poucas interações)
```bash
curl -X POST http://localhost:3000/api/analyze-chat \
  -H "Content-Type: application/json" \
  -d '{
    "leadName": "Cliente Teste Inicial",
    "chatText": "[09/03/2026 10:00:00] Vendedor: Olá! Vi seu interesse no Corolla.\n[09/03/2026 10:05:00] Cliente: Oi, tudo bem. Qual o valor?"
  }'
```
**Resultado Esperado:** `classificacao`: "FASE INICIAL DE ATENDIMENTO", `score`: < 30.

## Cenário 2: Lead em Negociação Progressiva (Timeline completa)
```bash
curl -X POST http://localhost:3000/api/analyze-chat \
  -H "Content-Type: application/json" \
  -d '{
    "leadName": "Ricardo Silva",
    "chatText": "[07/03/2026 09:00:00] Vendedor: Olá Ricardo! Vi que gostou da Hilux.\n[07/03/2026 09:10:00] Cliente: Sim, aceita troca?\n[07/03/2026 10:00:00] Vendedor: Sim, qual seu carro?\n[07/03/2026 11:00:00] Cliente: Um Compass 2022.\n[08/03/2026 14:00:00] Vendedor: Consigo pagar bem. Quer simular financiamento?\n[09/03/2026 08:00:00] Cliente: Quero sim, meu CPF é 123.456.789-00."
  }'
```
**Resultado Esperado:** `classificacao`: "HOT", `score`: > 80, `proxima_acao`: "Mandar simulação", `rigorosidade`: Identificar avanço na timeline.
