// VELO PWA Service Worker
// v3 — network-FIRST for code so a deploy is picked up immediately. The prior
// stale-while-revalidate strategy served the previously-cached JS bundle on
// load and only fetched the new one in the background, so users ran old code
// (with dead/mismatched event handlers) until they manually cleared cache.
// That is the "buttons don't work until I clear cookies" bug. Fixed: HTML and
// hashed JS/CSS are always fetched fresh; only static icons are cached.
const CACHE_NAME = 'velo-v3';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();   // activate the new SW immediately
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      // Wipe ALL old caches (velo-v2 etc.) so no stale bundle can survive.
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;
  // Cross-origin (RPC, Supabase, wallet, CDNs) and our /api functions: never touch.
  if (!sameOrigin || url.pathname.startsWith('/api/')) return;

  // SPA navigations (HTML): ALWAYS network-first so the freshest bundle hashes
  // are referenced. Fall back to a cached shell only when truly offline.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.match('/index.html') || await caches.match('/');
        return shell || new Response('', { status: 504, statusText: 'Offline' });
      })
    );
    return;
  }

  // JS / CSS / workers: NETWORK-FIRST. These are content-hashed by Vite, so a
  // new deploy has new filenames anyway — but network-first guarantees the
  // freshest code even if a name is ever reused, and never serves stale logic.
  if (['script', 'style', 'worker'].includes(request.destination) ||
      /\.(js|mjs|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match(request).then((c) => c || new Response('', { status: 504 })))
    );
    return;
  }

  // Everything else same-origin (icons, images, fonts): cache-first is fine —
  // these are static and safe to serve from cache.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => new Response('', { status: 504 })))
  );
});
