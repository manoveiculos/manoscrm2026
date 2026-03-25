import { NextRequest, NextResponse } from 'next/server';

/**
 * Verifica o token de autenticação da extensão Chrome.
 * O token deve ser enviado no header: Authorization: Bearer <EXTENSION_API_SECRET>
 * Retorna NextResponse com 401 se inválido, ou null se válido.
 */
export function verifyExtensionToken(req: NextRequest): NextResponse | null {
    const secret = process.env.EXTENSION_API_SECRET;

    // Se o secret não estiver configurado, bloqueia tudo em produção
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            return NextResponse.json({ error: 'Extensão não configurada' }, { status: 503 });
        }
        // Em desenvolvimento sem secret configurado, permite (aviso no log)
        console.warn('[extensionAuth] EXTENSION_API_SECRET não definido — acesso liberado em dev');
        return null;
    }

    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    return null; // autorizado
}
