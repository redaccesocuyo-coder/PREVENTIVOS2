const CACHE_NAME = 'preven-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './icon.png',
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
  );
});

// Activar Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker activado');
});

// Estrategia de Cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
