// Service worker do app Manos CRM (PWA), no modelo do GarimpoCar.
//
// Regras:
//  - NUNCA guarda páginas nem respostas de API: o CRM tem dado de cliente e
//    cada vendedor vê só o que é dele. Página e /api vêm sempre do servidor.
//  - Sem internet, a navegação mostra /offline.html.
//  - Guarda só arquivos fixos com versão no nome (/_next/static/*) e os ícones,
//    para o app abrir mais rápido.
//  - Notificação (push): mostra o aviso e, ao tocar, abre o CRM na tela certa.
//    O servidor nunca manda nome nem telefone de cliente (aparece na tela
//    bloqueada).
const CACHE = 'manos-crm-v2';
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

// ── Notificação no celular ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data && event.data.text() }; }
  const url = typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/fila';
  event.waitUntil(self.registration.showNotification(d.title || 'Manos CRM', {
    body: d.body || 'Tem novidade na sua fila.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    vibrate: [120, 60, 120],
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || '/fila', self.location.origin).href;
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const j of janelas) {
      if (new URL(j.url).origin === self.location.origin && 'focus' in j) {
        await j.focus();
        if ('navigate' in j) await j.navigate(destino);
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});
