import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware central de autenticação e proteção de rotas.
 * Compatível com Next.js padrão (middleware.ts) e ambientes customizados (proxy.ts).
 */
export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    // Middleware logic continues below

    const path = request.nextUrl.pathname;
    const isLoginPage = path === '/login';
    const isPublicApi = path.startsWith('/api/auth') || path.startsWith('/api/webhook') || path.startsWith('/api/health') || path.startsWith('/api/extension') || path.startsWith('/api/cron');
    const isEmbed = path === '/pipeline/embed';
    const isStaticAsset = path.includes('.') || path.startsWith('/_next');

    // Se for um asset estático, API pública ou Embed, ignoramos
    if (isStaticAsset || isPublicApi || isEmbed) {
        return supabaseResponse;
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // IMPORTANTE: getUser() é mais seguro que getSession() no proxy
    // pois verifica o token contra o banco de dados do Supabase.
    const { data: { user } } = await supabase.auth.getUser();

    // Lógica de Redirecionamento
    if (!user && !isLoginPage) {
        // Redireciona para login se não estiver autenticado
        const loginUrl = new URL('/login', request.url);
        const redirectResponse = NextResponse.redirect(loginUrl);
        supabaseResponse.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
        });
        return redirectResponse;
    }

    if (user) {
        // Se estiver autenticado, verificar se o e-mail não é o admin e se está ativo na tabela de consultores
        if (user.email?.toLowerCase() !== 'alexandre_gorges@hotmail.com') {
            const { data: consultant } = await supabase
                .from('consultants_manos_crm')
                .select('status')
                .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
                .maybeSingle();

            if (!consultant || consultant.status !== 'active') {
                // Usuário não autorizado ou não ativo: desloga e redireciona
                const loginUrl = new URL('/login?error=unauthorized', request.url);
                const redirectResponse = NextResponse.redirect(loginUrl);
                
                // Limpar os cookies de autenticação do Supabase
                // Isso efetivamente desloga o usuário no middleware
                request.cookies.getAll().forEach(cookie => {
                    if (cookie.name.includes('auth-token') || cookie.name.startsWith('sb-')) {
                        redirectResponse.cookies.delete(cookie.name);
                    }
                });
                return redirectResponse;
            }
        }

        // Restrição para o Ivo: Só pode acessar caminhos que comecem com /compras
        if (user.email?.toLowerCase() === 'ivo@acesso.com') {
            if (!path.startsWith('/compras')) {
                const comprasUrl = new URL('/compras', request.url);
                const redirectResponse = NextResponse.redirect(comprasUrl);
                supabaseResponse.cookies.getAll().forEach((cookie) => {
                    redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
                });
                return redirectResponse;
            }
        }

        if (isLoginPage) {
            // Se já estiver logado e autorizado, não deixa entrar na tela de login
            const targetPath = user.email?.toLowerCase() === 'ivo@acesso.com' ? '/compras' : '/';
            const redirectUrl = new URL(targetPath, request.url);
            const redirectResponse = NextResponse.redirect(redirectUrl);
            supabaseResponse.cookies.getAll().forEach((cookie) => {
                redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
            });
            return redirectResponse;
        }
    }

    return supabaseResponse;
}

// Exportação padrão necessária pelo compilador em alguns ambientes
export default middleware;

// Exportação nomeada 'proxy' solicitada em alguns logs de build
export const proxy = middleware;

export const config = {
    matcher: [
        /*
         * Corresponde a todos os caminhos, exceto arquivos estáticos conhecidos.
         * Usamos uma lógica mais abrangente para garantir segurança total.
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
