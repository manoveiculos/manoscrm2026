import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      // ── Security headers para todas as rotas ──────────────────
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },

      // ── CORS para extensão Chrome ──────────────────────────────
      // Manter Access-Control-Allow-Origin: * pois extensões Chrome
      // usam origem dinâmica (chrome-extension://ID). A autenticação
      // real é feita via Authorization: Bearer <EXTENSION_API_SECRET>.
      {
        source: '/api/extension/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },

      // ── Pulse-alerts (embed WhatsApp) ─────────────────────────
      {
        source: '/api/v2/pulse-alerts',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },

      // ── Embed do pipeline (dentro do WhatsApp Web) ────────────
      {
        source: '/v2/pipeline/embed',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://web.whatsapp.com",
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
