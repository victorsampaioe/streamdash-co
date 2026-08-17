// Service worker mínimo: não intercepta requisições (evita quebra de assets por cache antigo).
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpa qualquer cache criado por versões anteriores deste service worker
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Sem handler de 'fetch': o navegador busca os assets diretamente na rede/CDN.
