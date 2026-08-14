self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Service worker básico para PWA
  event.respondWith(fetch(event.request));
});