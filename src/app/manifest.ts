import type { MetadataRoute } from 'next';

/**
 * Manifesto do app instalável (PWA), no mesmo modelo do GarimpoCar:
 * ícone na tela inicial, abre em tela cheia e em pé.
 *
 * start_url = "/": cada um cai na própria tela inicial (vendedor e gestor na
 * Minha Fila, admin no War Room — ver src/lib/perfil.ts). O "?app=1" só marca
 * que a abertura veio do ícone.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Manos CRM',
        short_name: 'Manos CRM',
        description: 'Minha Fila, agenda e leads da Manos Veículos no celular.',
        lang: 'pt-BR',
        id: '/',
        start_url: '/?app=1',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0C0C0F',
        theme_color: '#0C0C0F',
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
}
