import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase para uso em Client Components.
 */
export const createClient = () =>
    createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

// Instância singleton para retrocompatibilidade simples se necessário
export const supabase = createClient();
