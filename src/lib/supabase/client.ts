import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase para uso em Client Components.
 * Singleton global — garante uma única instância no browser para evitar
 * o erro "Lock broken by another request with the 'steal' option."
 */
let _instance: ReturnType<typeof createBrowserClient> | null = null;

export const createClient = () => {
    if (typeof window === 'undefined') {
        // SSR: sem lock, pode criar instância nova
        return createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
    }
    if (!_instance) {
        _instance = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
    }
    return _instance;
};

// Instância singleton para retrocompatibilidade simples se necessário
export const supabase = createClient();

