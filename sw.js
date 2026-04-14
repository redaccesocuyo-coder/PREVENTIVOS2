// ── SERVICE WORKER — Preventivos Pro v2 ──
const CACHE_NAME = 'preven-v2';

const ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
];

// INSTALL — cachea todo
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ACTIVATE — limpia caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH — cache first, fallback a red
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        fetch(event.request).then(r => {
          if (r && r.status === 200)
            caches.open(CACHE_NAME).then(c => c.put(event.request, r));
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then(r => {
        if (r && r.status === 200) {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return r;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
