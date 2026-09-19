import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_a_LZCcUT50c9-2JspQf1aQ_-khIilRb';

/**
 * true = rodando com a SERVICE_ROLE_KEY de verdade (bypassa RLS).
 * false = caiu no fallback anon/publishable, e TODO insert em tabela com RLS
 * que so libera service_role vai ser rejeitado (ex: meta_conversions_log).
 */
export const supabaseAdminUsingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !supabaseServiceKey) {
    if (typeof window === 'undefined') {
        console.warn('⚠️ Supabase Admin credentials missing in server environment.');
    }
}

// O fallback anon existe pra nao explodir na avaliacao do modulo, mas no servidor
// ele silencia escritas em tabelas protegidas por RLS. Melhor gritar do que
// descobrir semanas depois com uma tabela de log vazia.
if (typeof window === 'undefined' && !supabaseAdminUsingServiceRole) {
    console.warn(
        '⚠️ [supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY ausente — usando fallback anon. ' +
        'Escritas em tabelas com RLS (meta_conversions_log, webhook_errors...) VAO falhar silenciosamente. ' +
        'Defina a variavel no .env.local e na Vercel.'
    );
}

/**
 * Supabase Admin client com SERVICE_ROLE_KEY (ou fallback anon no cliente).
 * Evita exceção 'supabaseKey is required' na avaliação de módulo do Next.js.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
