/**
 * PISKA service worker — offline-friendly cache.
 *
 * Two-tier strategy so fresh deploys actually reach the player:
 *   - Navigation (HTML): **network-first**. The page document is always
 *     fetched from the server; a cached copy is used only if the network
 *     fails (true offline). This means a refresh after a deploy
 *     immediately picks up the new asset hashes referenced in index.html.
 *   - Assets (JS/CSS/images): **cache-first**. They have content-hashed
 *     filenames so a stale copy never collides with a new one — once a
 *     specific hash is cached it stays cached.
 *
 * Bump VERSION to invalidate previous caches on the next activate.
 */

const VERSION = 'piska-v22';
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

  const isHTML =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first for HTML: fresh deploys propagate on the very next
    // page load instead of being held back by a cached document that
    // still references the previous bundle hash.
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || caches.match('/piska/');
        }),
    );
    return;
  }

  // Cache-first for hashed assets — their URL is immutable per build, so
  // a cache hit is always correct.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req)
          .then((res) => {
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
