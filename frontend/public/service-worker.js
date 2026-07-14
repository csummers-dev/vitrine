/*
 * vitrine service worker — offline app shell (v1.3 S6-4).
 *
 * Caches the app SHELL only: the server-rendered navigation document plus
 * the content-hashed static assets (JS / CSS / fonts / icons), so the app
 * boots with no network. It deliberately does NOT cache API/data
 * responses (listing JSON, previews, thumbnails) — stale file data and
 * cached auth-scoped responses are footguns we explicitly avoid (locked
 * S6-4 decision). When offline the shell loads from cache and the app's
 * own per-view error states (S6-5) + the global "You're offline" banner
 * take over.
 *
 * Hand-rolled rather than Workbox-generated because the app is served
 * through a bespoke Go-templated pipeline (dynamic BaseURL + StaticURL),
 * so a build-time precache manifest wouldn't match the served URLs. This
 * worker derives everything from runtime request URLs instead.
 */

// Bump the suffix to invalidate every previously-cached entry on deploy.
const CACHE = "vitrine-shell-v1";

// One canonical key for the shell document, so an offline navigation to
// ANY route can fall back to it (the SPA routes client-side anyway).
const SHELL_KEY = "__fbp_app_shell__";

self.addEventListener("install", () => {
  // Take over as soon as this build's worker is installed rather than
  // waiting for every existing tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches left by older worker versions.
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  // Optional update hook: the page can post { type: "SKIP_WAITING" } to
  // activate a freshly-installed worker without a manual reload.
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

const isStaticAsset = (url) =>
  url.origin === self.location.origin && url.pathname.includes("/static/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Only same-origin (skip extensions, external CDNs, etc.).
  if (url.origin !== self.location.origin) return;

  // Never intercept API / data — no data caching by design.
  if (url.pathname.includes("/api/")) return;

  // Navigations (the server-rendered HTML shell): network-first, so an
  // ONLINE user always gets a fresh document (and a fresh config/JWT
  // bootstrap); fall back to the cached shell only when unreachable.
  if (req.mode === "navigate") {
    event.respondWith(navigationStrategy(req));
    return;
  }

  // Content-hashed static assets: cache-first. Because filenames carry a
  // build hash, a new deploy = new names = automatic cache miss, so this
  // never serves stale code.
  if (isStaticAsset(url)) {
    event.respondWith(assetStrategy(req));
    return;
  }

  // Anything else: straight to the network (don't intercept).
});

async function navigationStrategy(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    // Only stash a genuine same-origin 200 as the offline shell fallback.
    if (res && res.ok && res.type === "basic") {
      cache.put(SHELL_KEY, res.clone());
    }
    return res;
  } catch {
    const cached = await cache.match(SHELL_KEY);
    if (cached) return cached;
    // Never cached yet (first visit happened offline) — minimal fallback.
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title>" +
        '<body style="font-family:system-ui;padding:2rem;color:#18181b">' +
        "<h1>You're offline</h1><p>This app hasn't been cached yet. " +
        "Reconnect and reload, then it'll be available offline.</p></body>",
      {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}

async function assetStrategy(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // Offline with nothing cached — let the request surface as a failure.
    return Response.error();
  }
}
