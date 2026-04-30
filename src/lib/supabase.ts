import { createBrowserClient } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials missing. Check your .env file.');
}

// ── Singleton pattern para evitar múltiplos clientes competindo pelo auth lock ──
// O createBrowserClient criado em nível de módulo pode ser instanciado múltiplas
// vezes pelo React (Strict Mode + HMR), causando o erro:
// "Lock broken by another request with the 'steal' option."
// A solução é garantir UMA única instância global no browser.
let _browserClientInstance: ReturnType<typeof createBrowserClient> | null = null;

function getBrowserClient() {
    if (typeof window === 'undefined') {
        // SSR: sempre cria novo (sem lock de Web API)
        return createBrowserClient(supabaseUrl, supabaseAnonKey);
    }
    if (!_browserClientInstance) {
        _browserClientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            }
        });
    }
    return _browserClientInstance;
}

export const supabase = getBrowserClient();

// Admin client for server-side operations (bypasses RLS)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (typeof window === 'undefined' && !supabaseServiceKey) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY missing on server! RLS bypass will fail.');
}

export const supabaseAdmin = typeof window === 'undefined'
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    })
    : (null as any); // Should not be accessible on client
