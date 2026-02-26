import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export default async function proxy(request: NextRequest) {
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

    // IMPORTANTE: Use getUser() em vez de getSession() para segurança e consistência no middleware
    const { data: { user } } = await supabase.auth.getUser();

    const isLoginPage = request.nextUrl.pathname.startsWith('/login');
    const isPublicRoute = isLoginPage || request.nextUrl.pathname.startsWith('/api/auth');

    // Se não houver usuário e não for uma rota pública, redireciona para login
    if (!user && !isPublicRoute) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    // Se houver usuário e tentar acessar login, redireciona para o dashboard
    if (user && isLoginPage) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        /*
         * Corresponde a todos os caminhos de solicitação, exceto:
         * - api (exceto as de auth)
         * - _next (arquivos internos do Next.js)
         * - favicon.ico (arquivo favicon)
         * - arquivos com extensões comuns (imagens, etc)
         */
        '/((?!api|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
