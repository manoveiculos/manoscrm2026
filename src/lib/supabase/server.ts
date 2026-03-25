import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cliente Supabase para uso em Server Components, Server Actions e Route Handlers.
 * Compatível com Next.js 16 (React 19).
 */
export const createClient = async () => {
    const cookieStore = await cookies();

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // O método setAll foi chamado de um Server Component.
                        // Pode ser ignorado se houver middleware atualizando a sessão.
                    }
                },
            },
        }
    );
};
