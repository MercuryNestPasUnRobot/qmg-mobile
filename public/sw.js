const CACHE_NAME = "qmg-mobile-complete-v6";
const OFFLINE_MANIFEST = "./offline-assets.json";
const BATCH_SIZE = 24;

self.addEventListener("install", (event) => {
  event.waitUntil(precacheCompleteGame());
  self.skipWaiting();
});

async function precacheCompleteGame() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch("./", { cache: "reload" });
  if (!indexResponse.ok) throw new Error("Unable to cache app entry");
  const html = await indexResponse.clone().text();
  await cache.put("./", indexResponse);

  const linkedAssets = Array.from(html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g), (match) => match[1]);
  const manifestResponse = await fetch(OFFLINE_MANIFEST, { cache: "no-store" });
  if (!manifestResponse.ok) throw new Error("Unable to load offline asset manifest");
  const imageAssets = await manifestResponse.json();
  const assets = [...new Set(["./manifest.webmanifest", OFFLINE_MANIFEST, ...linkedAssets, ...imageAssets])];

  for (let index = 0; index < assets.length; index += BATCH_SIZE) {
    await cache.addAll(assets.slice(index, index + BATCH_SIZE));
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("qmg-mobile-") && key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./", copy));
          return response;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
