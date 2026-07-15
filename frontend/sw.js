/* EventoPro service worker — network-first, HTTP-cache-bypassing so code updates
   always propagate immediately, with an offline cache fallback for the app shell. */
const CACHE = 'eventpro-v5';
const SHELL = ['/', '/css/style.css', '/js/app.js', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Never intercept API calls — always hit the network directly.
  if (req.method !== 'GET' || req.url.includes('/api/')) return;

  // Network-first with cache:'reload' → bypass the browser HTTP cache entirely so
  // the freshest file is always fetched. Update the offline cache, fall back to it
  // only when the network is unavailable.
  e.respondWith(
    fetch(new Request(req.url, { cache: 'reload', credentials: req.credentials }))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match('/')))
  );
});
