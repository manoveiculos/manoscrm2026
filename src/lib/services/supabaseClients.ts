import { supabase as browserSupabase, supabaseAdmin as adminSupabase } from '@/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

let activeClient: SupabaseClient = browserSupabase;

export const supabase = new Proxy({} as SupabaseClient, {
    get(target, prop) {
        // Redireciona chamadas para o cliente ativo (ajustável via setGlobalClient)
        return (activeClient as any)[prop];
    }
});

export const supabaseAdmin = adminSupabase;

export function setGlobalClient(client: SupabaseClient) {
    activeClient = client;
}

export function getGlobalClient() {
    return activeClient;
}
