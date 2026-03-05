import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    if (typeof window === 'undefined') {
        console.warn('⚠️ Supabase Admin credentials missing in server environment.');
    }
}

/**
 * Supabase Admin client using the SERVICE_ROLE_KEY.
 * Use this EXCLUSIVELY in server-side code (API routes, Server Actions, etc.)
 * to bypass RLS and perform administrative tasks.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
