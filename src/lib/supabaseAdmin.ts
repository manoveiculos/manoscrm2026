import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_a_LZCcUT50c9-2JspQf1aQ_-khIilRb';

if (!supabaseUrl || !supabaseServiceKey) {
    if (typeof window === 'undefined') {
        console.warn('⚠️ Supabase Admin credentials missing in server environment.');
    }
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
