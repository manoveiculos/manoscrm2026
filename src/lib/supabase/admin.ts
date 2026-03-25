import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase com SERVICE_ROLE_KEY para ignorar RLS.
 * USE EXCLUSIVAMENTE NO SERVIDOR. NUNCA EXPOR AO CLIENTE.
 */
export const createClient = () => createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);
