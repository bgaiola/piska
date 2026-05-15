/**
 * PISKA service worker — offline-first cache for the app shell + assets.
 *
 * Strategy: cache-first with network fallback. Successful same-origin GETs
 * are stored in the cache so subsequent visits work offline. If a request
 * fails and isn't cached, we fall back to the root index so deep links still
 * load the SPA shell.
 *
 * Bump VERSION to invalidate previous caches on the next activate.
 */

const VERSION = 'piska-v6';
const PRECACHE = ['/piska/'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req)
          .then((res) => {
            // Cache same-origin successful responses.
            if (res.ok && new URL(req.url).origin === self.location.origin) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => caches.match('/piska/')),
    ),
  );
});
