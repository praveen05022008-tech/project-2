/* EventoPro service worker — network-first, HTTP-cache-bypassing so code updates
   always propagate immediately, with an offline cache fallback for the app shell. */
const CACHE = 'eventpro-v6';
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
  const url = new URL(req.url);
  // Only handle same-origin GET requests. Cross-origin resources (Google Fonts,
  // gstatic, Razorpay, any CDN) MUST pass straight through to the network — if we
  // reconstruct them here they become CORS requests, fail on opaque responses, and
  // fall back to index.html, which is why the Material Icons font broke and icons
  // rendered as their ligature keywords ("store", "celebration", …).
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Network-first with cache:'reload' → bypass the browser HTTP cache entirely so
  // the freshest file is always fetched. Update the offline cache, fall back to it
  // only when the network is unavailable. The app-shell ('/') fallback applies only
  // to navigation requests — never to sub-resources like fonts, CSS or scripts.
  e.respondWith(
    fetch(new Request(req.url, { cache: 'reload', credentials: req.credentials }))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || (req.mode === 'navigate' ? caches.match('/') : undefined)))
  );
});
