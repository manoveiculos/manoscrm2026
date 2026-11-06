// Service worker do app Manos CRM (PWA), no modelo do GarimpoCar.
//
// Regras:
//  - NUNCA guarda páginas nem respostas de API: o CRM tem dado de cliente e
//    cada vendedor vê só o que é dele. Página e /api vêm sempre do servidor.
//  - Sem internet, a navegação mostra /offline.html.
//  - Guarda só arquivos fixos com versão no nome (/_next/static/*) e os ícones,
//    para o app abrir mais rápido.
//  - Notificação (push) fica para a 2ª etapa.
const CACHE = 'manos-crm-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([OFFLINE, '/icons/icon-192.png']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Páginas: sempre do servidor; sem internet, o aviso de offline.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Arquivos fixos com versão no nome e ícones: do cache primeiro.
  const fixo = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
  if (fixo) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      }))
    );
  }
  // Todo o resto (API, imagens de fora, etc.): rede, sem cache.
});
