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

    // IMPORTANTE: Use getUser() em vez de getSession() para segurança e consistência no middleware
    const { data: { user } } = await supabase.auth.getUser();

    const isLoginPage = request.nextUrl.pathname.startsWith('/login');
    const isPublicRoute = isLoginPage || request.nextUrl.pathname.startsWith('/api/auth/callback');

    // Se não houver usuário e não for uma rota pública, redireciona para login
    if (!user && !isPublicRoute) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        // Mantém parâmetros de busca (query params) se houver
        return NextResponse.redirect(url);
    }

    // Se houver usuário e tentar acessar login, redireciona para o dashboard
    if (user && isLoginPage) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
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
