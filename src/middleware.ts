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

    // IMPORTANTE: getUser() é mais seguro que getSession() no middleware
    // pois verifica o token contra o banco de dados do Supabase.
    const { data: { user } } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isLoginPage = path === '/login';
    const isPublicApi = path.startsWith('/api/auth');
    const isStaticAsset = path.includes('.') || path.startsWith('/_next');

    // Se for um asset estático ou API pública, ignoramos
    if (isStaticAsset || isPublicApi) {
        return supabaseResponse;
    }

    // Lógica de Redirecionamento
    if (!user && !isLoginPage) {
        // Redireciona para login se não estiver autenticado
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    if (user && isLoginPage) {
        // Se já estiver logado, não deixa entrar na tela de login
        const dashboardUrl = new URL('/', request.url);
        return NextResponse.redirect(dashboardUrl);
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
        '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
