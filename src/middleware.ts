import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value;
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value,
                        ...options,
                    });
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    });
                    response.cookies.set({
                        name,
                        value,
                        ...options,
                    });
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value: '',
                        ...options,
                    });
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    });
                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    });
                },
            },
        }
    );

    const {
        data: { session },
    } = await supabase.auth.getSession();

    console.log('Middleware Path:', request.nextUrl.pathname);
    console.log('Session exists:', !!session);

    // Se estiver tentando acessar rotas protegidas sem sessão, redireciona para login
    const isLoginPage = request.nextUrl.pathname.startsWith('/login');
    const isPublicRoute = isLoginPage || request.nextUrl.pathname.startsWith('/api/auth/callback');

    if (!session && !isPublicRoute) {
        console.log('Redirecting to login: no session');
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Se já estiver logado e tentar acessar a página de login, redireciona para o dashboard
    if (session && isLoginPage) {
        console.log('Redirecting to dashboard: session found on login page');
        return NextResponse.redirect(new URL('/', request.url));
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Corresponde a todos os caminhos de solicitação, exceto:
         * - api (exceto as de auth especificadas)
         * - _next/static (arquivos estáticos)
         * - _next/image (arquivos de otimização de imagem)
         * - favicon.ico (arquivo favicon)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
