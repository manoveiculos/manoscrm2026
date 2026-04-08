import { NextRequest, NextResponse } from 'next/server';

/**
 * Verifica o token de autenticação da extensão Chrome.
 * O token deve ser enviado no header: Authorization: Bearer <EXTENSION_API_SECRET>
 * Retorna NextResponse com 401 se inválido, ou null se válido.
 */
export function verifyExtensionToken(req: NextRequest): NextResponse | null {
    const secret = process.env.EXTENSION_API_SECRET;
    const origin = req.headers.get('origin') || 'unknown-origin';
    const ua = (req.headers.get('user-agent') || 'unknown-ua').slice(0, 80);

    // Se o secret não estiver configurado, bloqueia tudo em produção
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error(
                `[Auth Fail] EXTENSION_API_SECRET ausente no servidor (prod) — origin=${origin} ua=${ua}`
            );
            return NextResponse.json(
                {
                    success: false,
                    error: 'server_misconfigured',
                    message: 'EXTENSION_API_SECRET não configurado no servidor.',
                },
                { status: 503 }
            );
        }
        // Em desenvolvimento sem secret configurado, permite (aviso no log)
        console.warn('[extensionAuth] EXTENSION_API_SECRET não definido — acesso liberado em dev');
        return null;
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
        console.error(
            `[Auth Fail] Extensão tentou conectar sem header Authorization — origin=${origin} ua=${ua}`
        );
        return NextResponse.json(
            {
                success: false,
                error: 'missing_authorization_header',
                message: 'Header Authorization ausente. Envie "Authorization: Bearer <EXTENSION_API_SECRET>".',
            },
            { status: 401 }
        );
    }

    if (authHeader !== `Bearer ${secret}`) {
        // Log do shape do header recebido (sem vazar o secret) p/ facilitar debug
        // no console do Chrome: sabemos se veio o formato certo e qual o prefixo do token.
        const headerPreview = authHeader.startsWith('Bearer ')
            ? `Bearer ${authHeader.slice(7, 11)}…(${authHeader.length - 7} chars)`
            : `raw:${authHeader.slice(0, 10)}…`;
        console.error(
            `[Auth Fail] Extensão tentou conectar com token inválido — origin=${origin} ua=${ua} received=${headerPreview}`
        );
        return NextResponse.json(
            {
                success: false,
                error: 'invalid_extension_token',
                message: 'Token da extensão inválido. Verifique EXTENSION_API_SECRET nas configurações.',
            },
            { status: 401 }
        );
    }

    return null; // autorizado
}
