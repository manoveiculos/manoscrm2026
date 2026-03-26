---
description: antigravity_rules_v2.md
---

# Project Rules â€” Manos CRM V2

## Context
CRM for Manos VeÃ­culos car dealership in Tijucas/SC, Brazil.
All UI text, comments and strings in Brazilian Portuguese (pt-BR).
Dark theme, red (#e50914) accent, glass-morphism cards.

## Stack
Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, Supabase, Framer Motion, Recharts, Lucide React, date-fns, OpenAI, Gemini.

## Critical Security Rules
- Admin role ALWAYS determined from `consultants.role` column in database. NEVER hardcode emails.
- NEVER use `NEXT_PUBLIC_` prefix for `SUPABASE_SERVICE_ROLE_KEY`.
- NEVER use service role key as fallback with anon key: `process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` is FORBIDDEN.
- ALL API routes require authentication EXCEPT `/api/webhook/*` and `/api/health`.
- Extension APIs (`/api/extension/*`) authenticate via Bearer token.
- RLS enabled on ALL tables. Admin sees all, consultant sees only assigned leads.
- Server Actions MUST verify admin role from database before executing.

## Code Style
- Components max 300 lines. Split into sub-components if exceeding.
- Service files max 500 lines. Split by domain.
- No `any` type without `// TODO: type properly` comment.
- Named exports for components. Default exports only for page.tsx.
- Use `clsx()` or `tailwind-merge` for conditional Tailwind classes.
- Monetary: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Phone: mask `(XX) XXXXX-XXXX`, strip country code 55.
- Dates: `date-fns` with `ptBR` locale.

## File Conventions
- Supabase browser client: `src/lib/supabase/client.ts`
- Supabase server client: `src/lib/supabase/server.ts`
- Supabase admin client: `src/lib/supabase/admin.ts` (server-only, never import from client components)
- Services: `src/lib/services/{domain}Service.ts`
- Hooks: `src/lib/hooks/use{Name}.ts`
- Types: `src/lib/types/{domain}.ts`
- AI prompts: `src/lib/ai/prompts.ts`
- Page components: `src/app/{route}/components/`
- Shared UI: `src/components/ui/`
- Layout: `src/components/layout/`

## Database
Single `leads` table (no more 3-table split). All tables without `_manos_crm` suffix.
Tables: consultants, leads, campaigns, inventory, sales, purchases, interactions, whatsapp_messages, lead_routing_rules, ai_analyses.

## Design
- Background: black/dark gray (#0a0a0a to #1a1a1a)
- Cards: `bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl`
- Primary: red `#e50914` with gradients
- Text: white for primary, white/40 for secondary, white/60 for labels
- Animations: Framer Motion `fadeIn`, `slideUp`, `staggerChildren`
- Font: Outfit for headings, system for body
- All icons from Lucide React

## Git
Commits in English: `feat:`, `fix:`, `refactor:`, `security:`, `chore:`, `docs:`
Never commit `.env.local`, `tmp/`, `*.log`, node_modules.
