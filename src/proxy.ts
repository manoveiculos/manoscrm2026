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
    const isApi = path.startsWith('/api');

    /**
     * Resposta de API nunca pode ser cacheada por intermediario.
     *
     * O dominio de producao fica atras de um CDN (Server: hcdn / Hostinger) e as
     * rotas nao mandavam Cache-Control nenhum — ou seja, o CDN decidia sozinho.
     * Uma resposta autenticada guardada em cache pode ser entregue pra outra
     * pessoa; com /api/billing/records isso seria dado de cliente vazando por
     * cache mesmo com a rota ja protegida na origem.
     */
    if (isApi) {
        supabaseResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        supabaseResponse.headers.set('Pragma', 'no-cache');
    }

    /**
     * Rotas /api que NAO passam pela sessao do Supabase.
     *
     * Ate 19/09/2026 o matcher excluia /api inteiro, entao NENHUMA rota de API
     * exigia login — /api/billing/records devolvia 200 com dado de cliente pra
     * qualquer um. Agora o padrao e fechado e esta lista e a excecao.
     *
     * So entra aqui quem tem autenticacao propria (segredo/token) ou e chamado
     * por quem nao tem cookie de sessao: webhooks externos, crons, trigger do
     * banco, extensao do Chrome e o site do veiculo.
     */
    const PUBLIC_API_PREFIXES = [
        '/api/auth',                    // login
        '/api/health',                  // healthcheck
        '/api/webhook',                 // webhooks externos (Evolution, portais, Meta)
        '/api/cron',                    // crons — validam CRON_SECRET
        '/api/extension',               // extensao Chrome — valida EXTENSION_API_SECRET
        '/api/lead/fipe-search',        // idem (chamada pela extensao)
        '/api/lead/next-steps',         // idem (chamada pela extensao)
        '/api/meta-agent',              // valida META_AGENT_CONNECTOR_TOKEN
        '/api/meta-capi/vehicle',       // site do veiculo — valida META_CAPI_SITE_SECRET
        '/api/compras/webhooks',        // trigger do Postgres
        '/api/leads/rescue-stale',      // agendador externo, tem segredo proprio
    ];
    const isPublicApi = PUBLIC_API_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + '/'));
    const isEmbed = path === '/pipeline/embed';
    // Um ponto no caminho marcava "asset estatico" e pulava a autenticacao.
    // Em /api isso seria uma porta dos fundos (ex: /api/algo.json), entao a
    // regra do ponto nao vale pra API.
    const isStaticAsset = (!isApi && path.includes('.')) || path.startsWith('/_next');

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
    if (!user && isApi) {
        // Cliente de API nao entende redirect pra tela de login: receberia 200
        // com HTML e pareceria sucesso. Responde 401 JSON.
        return NextResponse.json(
            { error: 'Nao autenticado', detail: 'Esta rota exige sessao. Faca login no CRM.' },
            { status: 401, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' } }
        );
    }

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
                if (isApi) {
                    return NextResponse.json(
                        { error: 'Nao autorizado', detail: 'Usuario sem consultor ativo.' },
                        { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' } }
                    );
                }
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

        const isPaulo = user.email?.toLowerCase() === 'paulo@manoscrm.com';
        const isRestrictedBuyer = user.email?.toLowerCase() === 'ivo@acesso.com' || isPaulo;

        // Paulo tem seu próprio ecossistema mobile em /repasse (além do /compras).
        // Ivo acessa /compras e a Divisão de Lucro (é sócio; as APIs conferem a whitelist de sócios).
        if (isRestrictedBuyer) {
            const allowed = isPaulo
                ? (path.startsWith('/repasse') || path.startsWith('/compras'))
                : (path.startsWith('/compras') || path.startsWith('/divisaodelucro'));
            if (!allowed) {
                const homeUrl = new URL(isPaulo ? '/repasse' : '/compras', request.url);
                const redirectResponse = NextResponse.redirect(homeUrl);
                supabaseResponse.cookies.getAll().forEach((cookie) => {
                    redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
                });
                return redirectResponse;
            }
        }

        if (isLoginPage) {
            // Se já estiver logado e autorizado, não deixa entrar na tela de login
            const targetPath = isPaulo ? '/repasse' : (isRestrictedBuyer ? '/compras' : '/');
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
    // ATENCAO: /api NAO e mais excluido do matcher. A excecao agora e a
    // PUBLIC_API_PREFIXES no topo do arquivo — padrao fechado, excecao explicita.
    matcher: [
        /*
         * Corresponde a todos os caminhos, exceto arquivos estáticos conhecidos.
         * Usamos uma lógica mais abrangente para garantir segurança total.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
