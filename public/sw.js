// VELO PWA Service Worker
// v2 — only caches same-origin GET assets, never third-party / extension
// requests, and always returns a valid Response for navigations.
const CACHE_NAME = 'velo-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever touch http(s) GET requests. This skips chrome-extension://,
  // ws://, data:, etc. — the source of the "scheme unsupported" cache errors.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;

  // Let the browser handle anything cross-origin (RPCs, Supabase, CORS proxies,
  // wallet infra, fonts, CDNs) and our own /api functions natively — never cache.
  if (!sameOrigin || url.pathname.startsWith('/api/')) return;

  // SPA navigations: network-first, fall back to the cached shell, and ALWAYS
  // resolve to a real Response (never undefined → no "Failed to convert" error).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.match('/');
        return shell || new Response('', { status: 504, statusText: 'Offline' });
      })
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate, caching only clean
  // same-origin 200s (response.type 'basic').
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
