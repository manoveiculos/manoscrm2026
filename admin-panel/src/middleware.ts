import { NextResponse } from 'next/server';

export async function middleware() {
    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Corresponde a todos os caminhos de solicitação, exceto:
         * - api (rotas de API)
         * - _next/static (arquivos estáticos)
         * - _next/image (arquivos de otimização de imagem)
         * - favicon.ico (arquivo favicon)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
