/*
 * ============================================================
 * CultureFest Hub — Service Worker
 * ============================================================
 *
 * CACHE VERSION
 * ─────────────
 * Bump CACHE_VERSION on every production deploy that changes
 * any static asset. This causes the old cache to be deleted
 * on activation and all assets to be re-fetched from the
 * network. Use semantic versioning so it is easy to track.
 *
 * Format:  'culturefest-pwa-vMAJOR.MINOR.PATCH'
 * Example: bump to 'culturefest-pwa-v1.0.1' after any change
 *          to index.html, pwa-install.js, icons, etc.
 *
 * ============================================================
 *
 * CACHING STRATEGY
 * ────────────────
 * • NEVER cached — Supabase auth, REST API, realtime, CSV
 *   exports, password reset tokens, password.html auth flow,
 *   any CDN scripts (Supabase JS, Google Fonts).
 *
 * • Cache-first — own static assets: index.html, manifest,
 *   service-worker.js, pwa-install.js, icons, logo images.
 *
 * • Offline fallback — if the network is unavailable and the
 *   requested page is not cached, serve the offline notice
 *   embedded in OFFLINE_HTML below.
 *
 * ============================================================
 */

'use strict';

/* ── Cache identity ──────────────────────────────────────── */
// ⚠ BUMP THIS on every deploy that changes static assets.
const CACHE_VERSION = 'culturefest-pwa-v1.0.0';
const CACHE_NAME    = CACHE_VERSION;

/* ── Static assets to pre-cache at install time ─────────── */
// Only files that live in this repository. CDN and Supabase
// URLs are deliberately excluded — they are network-only.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './service-worker.js',
  './pwa-install.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
  // If ACF_Logo_HR.png is served from the repo, add:
  // './ACF_Logo_HR.png'
  //
  // Do NOT add password.html here — its auth token handling
  // must always go to the network.
];

/* ── Patterns that must ALWAYS go to the network ─────────── */
//
// Rule: if ANY of these strings appear anywhere in the request
// URL, the request bypasses the cache entirely.
//
// Covered:
//   • Supabase REST API   (/rest/v1/*)
//   • Supabase Auth       (/auth/v1/*)
//   • Supabase Realtime   (/realtime/v1/*)
//   • Supabase Storage    (/storage/v1/*)
//   • Supabase Edge Fns   (/functions/v1/*)
//   • Supabase domains    (*.supabase.co, *.supabase.in)
//   • CSV export URLs     (any URL with format=csv or .csv)
//   • Password/auth pages (password.html, token params)
//   • CDN scripts         (jsdelivr, Google Fonts/gstatic)
//   • Anything with auth tokens in query string
//
const NETWORK_ONLY_PATTERNS = [
  // Supabase domains
  'supabase.co',
  'supabase.in',

  // Supabase path segments (catches any host with these paths)
  '/rest/v1/',
  '/auth/v1/',
  '/realtime/v1/',
  '/storage/v1/',
  '/functions/v1/',

  // CSV exports
  'format=csv',
  '.csv',

  // Password / auth flow pages and their query params
  'password.html',
  'type=recovery',
  'type=invite',
  'access_token',
  'refresh_token',

  // CDN scripts — should always be latest, never stale
  'cdn.jsdelivr.net',
  'jsdelivr.net',
  'googleapis.com',
  'gstatic.com'
];

function isNetworkOnly(url) {
  return NETWORK_ONLY_PATTERNS.some(pattern => url.includes(pattern));
}

/* ── Offline fallback page ───────────────────────────────── */
// Served when the user is offline and the requested resource
// is not in the cache. Matches the app's dark theme.
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CultureFest — Offline</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'DM Sans', system-ui, sans-serif;
    background: #0b1120;
    color: #f0f4ff;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    gap: 16px;
  }
  .icon { font-size: 3.5rem; }
  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, #f5a623, #ff6b6b);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  p { color: #a8b4cc; font-size: 0.95rem; max-width: 320px; line-height: 1.6; }
  button {
    margin-top: 8px;
    background: linear-gradient(135deg, #f5a623 0%, #ff6b6b 100%);
    color: #0b1120;
    font-weight: 700;
    font-size: 0.9rem;
    border: none;
    border-radius: 9999px;
    padding: 12px 28px;
    cursor: pointer;
  }
  .note {
    font-size: 0.78rem;
    color: #637189;
    max-width: 280px;
  }
</style>
</head>
<body>
  <div class="icon">🌐</div>
  <h1>You're offline</h1>
  <p>CultureFest needs a connection to load live schedules and volunteer features.</p>
  <button onclick="window.location.reload()">Try again</button>
  <p class="note">Sign-in, attendance tracking, and admin actions are not available offline.</p>
</body>
</html>`;

const OFFLINE_URL = '__cf-offline__';

/* ── Install: pre-cache static assets ───────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Pre-cache known static assets
      await cache.addAll(PRECACHE_URLS);
      // Store the offline fallback page under a synthetic key
      await cache.put(
        OFFLINE_URL,
        new Response(OFFLINE_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate: delete old caches ─────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: route all requests ───────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // Only intercept GET — POST/PUT/DELETE always go to network.
  if (request.method !== 'GET') return;

  // Non-http(s) schemes (chrome-extension:, blob:, data:)
  if (!url.startsWith('http')) return;

  // Network-only: Supabase, auth, CSV, CDN — never cache.
  if (isNetworkOnly(url)) return;

  // Cache-first strategy for all other GET requests.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          // Only cache successful, same-origin, non-opaque responses.
          if (
            response.ok &&
            response.type === 'basic' &&
            response.status === 200
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback — navigation requests get the offline page.
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          // For other assets (images, scripts) let the failure surface.
        });
    })
  );
});
