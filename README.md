# Manos Veículos - Lead Platform

Plataforma profissional de distribuição e controle de leads com inteligência artificial.

## 🚀 Tecnologias
- **Frontend**: Next.js 14 (App Router, Tailwind CSS, Framer Motion)
- **Database**: Supabase (PostgreSQL)
- **Automação**: n8n
- **IA**: Google AI Studio (Gemini 1.5 Pro)

## 📁 Estrutura do Projeto
- `/admin-panel`: Painel administrativo web para gestão de leads e ROI.
- `/supabase`: Migrações do banco de dados e políticas de segurança.
- `/n8n`: Templates de fluxos de automação para captura e enriquecimento.

## 🛠️ Como Iniciar

### 1. Banco de Dados
1. Crie um projeto no [Supabase](https://supabase.com).
2. Execute o SQL contido em `supabase/migrations/20240224000000_initial_schema.sql` no SQL Editor do Supabase.

### 2. Automação (n8n)
1. Importe o arquivo `n8n/lead_capture_workflow.json` no seu n8n.
2. Configure as credenciais do Supabase e Google AI Studio no n8n.

### 3. Painel Administrativo
1. Acesse a pasta `admin-panel`.
2. Renomeie `.env.example` para `.env.local` e preencha as chaves.
3. Instale as dependências: `npm install`.
4. Inicie o servidor: `npm run dev`.

## 🧠 Lógica de Distribuição
A plataforma utiliza uma lógica de **Round Robin** aprimorada por performance. O n8n verifica qual consultor está disponível e tem o menor tempo médio de resposta para atribuir o lead imediatamente via WhatsApp.

## 📊 Business Intelligence
O cálculo de ROI é feito cruzando os dados de investimento das APIs de Ads (Meta/Google) com o fechamento de vendas registrado na tabela `sales`.
