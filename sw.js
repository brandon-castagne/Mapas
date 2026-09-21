/* Service worker de Mapa Sucre: guarda la app en el teléfono para usarla sin internet.
   Sube el número de VERSION cuando cambies archivos de la app (no hace falta al cambiar mapa.pmtiles). */
const VERSION = "v1";
const CACHE = "mapa-sucre-shell-" + VERSION;
const SHELL = [
  "./",
  "index.html",
  "app.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "lib/maplibre-gl.js",
  "lib/maplibre-gl.css",
  "lib/pmtiles.js",
  "data/search.json",
  "fonts/Noto%20Sans%20Italic/0-255.pbf",
  "fonts/Noto%20Sans%20Italic/256-511.pbf",
  "fonts/Noto%20Sans%20Italic/8192-8447.pbf",
  "fonts/Noto%20Sans%20Medium/0-255.pbf",
  "fonts/Noto%20Sans%20Medium/256-511.pbf",
  "fonts/Noto%20Sans%20Medium/8192-8447.pbf",
  "fonts/Noto%20Sans%20Regular/0-255.pbf",
  "fonts/Noto%20Sans%20Regular/256-511.pbf",
  "fonts/Noto%20Sans%20Regular/8192-8447.pbf"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("mapa-sucre-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith("/data/mapa.pmtiles")) return; // el mapa lo guarda la propia página
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const r = await net;
    if (r) return r;
    if (req.mode === "navigate") return (await cache.match("index.html")) || Response.error();
    return Response.error();
  })());
});
