// Service worker: the app works offline after the first visit.
// App files: cache first (bump VERSION on every release).
// City packs: show the cached copy at once, refresh it in the background.
// Map tiles: never stored here (OpenStreetMap's tile policy; the browser's own cache still helps).
const VERSION = "tp-2026-10-24-2";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "engine.js",
  "manifest.webmanifest",
  "cities/index.json",
  "vendor/leaflet/leaflet.js",
  "vendor/leaflet/leaflet.css",
  "icons/icon.svg",
  "icons/icon-192.png",
  "fonts/overpass-latin-400-normal.woff2",
  "fonts/overpass-latin-700-normal.woff2",
  "fonts/overpass-latin-800-normal.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // tiles and links: straight to network

  if (url.pathname.includes("/cities/")) {
    e.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(e.request);
        const fresh = fetch(e.request)
          .then((res) => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(e.request).then((res) => {
          if (res.ok && url.pathname.match(/\.(js|css|woff2|png|svg|html|json|webmanifest)$/)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
    )
  );
});
