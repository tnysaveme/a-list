import { clearOfflineLibrary } from './offline-store.js';
const cacheName = 'alist-public-v1';
const assets = [
  '/offline.html',
  '/offline-reader.js',
  '/offline-store.js',
  '/offline.css',
  '/apple-touch-icon.png',
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith('alist-public-') && key !== cacheName)
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});
async function clear() {
  await clearOfflineLibrary().catch(() => {});
  for (const client of await self.clients.matchAll())
    client.postMessage({ type: 'offline-cleared' });
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (
    (url.pathname === '/auth/signout' &&
      event.request.headers.get('origin') === self.location.origin) ||
    url.pathname === '/login'
  ) {
    event.respondWith(clear().then(() => fetch(event.request)));
    return;
  }
  if (event.request.method !== 'GET') return;
  if (assets.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(cacheName)
        .then(async (cache) => (await cache.match(url.pathname)) || fetch(event.request)),
    );
    return;
  }
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.redirected && new URL(response.url).pathname === '/login') await clear();
          return response;
        })
        .catch(async () => (await caches.match('/offline.html')) || Response.error()),
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).then(async (response) => {
        if (response.status === 401 || (url.pathname === '/api/account/delete' && response.ok))
          await clear();
        return response;
      }),
    );
  }
});
