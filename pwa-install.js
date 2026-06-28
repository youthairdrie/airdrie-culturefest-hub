/*
 * ============================================================
 * CultureFest Hub — PWA Install Manager  (pwa-install.js)
 * ============================================================
 *
 * Responsibilities:
 *   1. Register the service worker (static assets only).
 *   2. Show a slide-up "Add to Home Screen" banner:
 *        • Android/Chrome — native install prompt via
 *          beforeinstallprompt. Install button triggers it.
 *        • iPhone/iPad/Safari — native prompt is not
 *          supported; show manual step-by-step instructions
 *          instead. No Install button is shown on iOS.
 *   3. Hide the banner once the app is already installed
 *      (display-mode: standalone or navigator.standalone).
 *   4. Show an offline notice banner when connectivity is lost.
 *   5. Disable login / admin / volunteer actions while offline.
 *
 * Authentication: Supabase auth is NOT touched here. The
 * service worker is registered on load and does not cache
 * any auth requests. password.html is unaffected.
 *
 * ============================================================
 */

(function () {
  'use strict';

  /* ── 1. Register Service Worker ──────────────────────────
   *
   * Registered on the 'load' event so it does not compete
   * with the initial page render. The SW caches static
   * assets only — Supabase, fonts, and CDN scripts are
   * always fetched from the network.
   * ─────────────────────────────────────────────────────── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('./service-worker.js')
        .then(function (reg) {
          console.log('[CultureFest PWA] Service worker registered. Scope:', reg.scope);
        })
        .catch(function (err) {
          console.warn('[CultureFest PWA] Service worker registration failed:', err);
        });
    });
  }

  /* ── 2. Environment detection ────────────────────────────
   *
   * isIos      — true for iPhone, iPad, iPod
   * isSafari   — true for Safari (excludes Chrome/Firefox
   *              on iOS, which also use WebKit but have their
   *              own UI)
   * isStandalone — true when already installed and running
   *              as a PWA (both Android and iOS)
   * ─────────────────────────────────────────────────────── */
  var ua           = navigator.userAgent;
  var isIos        = /iphone|ipad|ipod/i.test(ua);
  // On iOS, Chrome reports "CriOS", Firefox reports "FxiOS".
  // We only show the Safari-specific instructions when the
  // browser is Safari proper, because only Safari on iOS
  // supports "Add to Home Screen" in the share sheet.
  var isSafari     = /safari/i.test(ua) && !/chrome|crios|fxios|edgios/i.test(ua);
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                     navigator.standalone === true;

  /* ── 3. State ────────────────────────────────────────────*/
  var deferredPrompt = null;   // holds the beforeinstallprompt event (Android)

  /* ── 4. Install prompt handling ─────────────────────────
   *
   * beforeinstallprompt fires on Android/Chrome (and some
   * other Chromium browsers) when the browser decides the
   * site is installable. We cancel the automatic mini-infobar
   * and show our own banner instead.
   *
   * This event does NOT fire on iPhone/iPad/Safari. Do not
   * wait for it on iOS. The iOS path shows the banner via a
   * timeout below.
   * ─────────────────────────────────────────────────────── */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();     // suppress browser's mini-infobar
    deferredPrompt = e;
    showInstallBanner();
  });

  // Once the user has installed via the native prompt, hide
  // any banner that may still be visible.
  window.addEventListener('appinstalled', function () {
    var banner = document.getElementById('cf-pwa-banner');
    if (banner) dismissBanner(banner);
    deferredPrompt = null;
    console.log('[CultureFest PWA] App installed successfully.');
  });

  /* ── 5. iOS Safari install banner ───────────────────────
   *
   * Safari on iOS does not fire beforeinstallprompt and does
   * not support the native install prompt. We show manual
   * instructions after a short delay to let the page render.
   * ─────────────────────────────────────────────────────── */
  if (isIos && isSafari && !isStandalone) {
    setTimeout(showInstallBanner, 1400);
  }

  /* ── 6. Do nothing if already installed ─────────────────*/
  // Checked above; guard also inside showInstallBanner.

  /* ── 7. Offline / online detection ──────────────────────
   *
   * When offline:
   *   • Show a persistent offline notice bar at the top.
   *   • Add a 'cf-offline' class to <body> that CSS in
   *     index.html can use to disable interactive elements.
   *
   * Note: The service worker serves the cached index.html
   * shell when offline, so public schedule content that was
   * previously loaded may still be visible. Actions that
   * require the network (login, sign-up, admin writes,
   * attendance tracking, CSV export) are disabled.
   * ─────────────────────────────────────────────────────── */
  function updateOnlineStatus() {
    var offline = !navigator.onLine;
    document.body.classList.toggle('cf-offline', offline);

    var existing = document.getElementById('cf-offline-bar');

    if (offline) {
      if (!existing) {
        injectStyles();
        var bar = document.createElement('div');
        bar.id = 'cf-offline-bar';
        bar.setAttribute('role', 'alert');
        bar.setAttribute('aria-live', 'polite');
        bar.innerHTML =
          '<span class="cf-offline-icon">&#x26A0;&#xFE0F;</span>' +
          '<span>You\'re offline. Live data, sign-in, and admin features are unavailable.</span>';
        document.body.insertBefore(bar, document.body.firstChild);
      }
    } else {
      if (existing) existing.remove();
    }
  }

  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  // Check immediately on load (page may have loaded while already offline)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateOnlineStatus);
  } else {
    updateOnlineStatus();
  }

  /* ── 8. Build and inject the install banner ──────────── */
  function showInstallBanner() {
    // Don't show if already installed or banner already present.
    if (isStandalone) return;
    if (document.getElementById('cf-pwa-banner')) return;

    injectStyles();

    var banner = document.createElement('div');
    banner.id = 'cf-pwa-banner';
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'Install CultureFest App');

    if (isIos) {
      /* ── iOS Safari — manual instructions only ─────────
       *
       * Safari does not support the native install prompt.
       * We show three clear steps using the share icon (⬆)
       * that matches the actual Safari share button.
       * No "Install" button is shown because we cannot
       * trigger the browser prompt programmatically on iOS.
       * ─────────────────────────────────────────────────── */
      banner.innerHTML =
        '<div class="cf-pwa-inner">' +
          '<img src="./icons/icon-192.png" alt="" class="cf-pwa-icon" aria-hidden="true">' +
          '<div class="cf-pwa-text">' +
            '<strong class="cf-pwa-title">Add CultureFest to Your Home Screen</strong>' +
            '<ol class="cf-pwa-steps">' +
              '<li>Tap the <strong>Share</strong> button ' +
                '<span class="cf-pwa-share-glyph" aria-label="Share icon">\u2191</span>' +
                ' at the bottom of Safari.</li>' +
              '<li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>' +
              '<li>Tap <strong>Add</strong> in the top-right corner.</li>' +
            '</ol>' +
          '</div>' +
          '<button class="cf-pwa-close" aria-label="Dismiss install prompt">&times;</button>' +
        '</div>';

    } else {
      /* ── Android / Chrome — native install prompt ──────
       *
       * The Install button triggers the browser's native
       * install prompt (deferredPrompt.prompt()). The button
       * is only visible on browsers that fired
       * beforeinstallprompt. It is hidden once the user
       * installs or dismisses.
       * ─────────────────────────────────────────────────── */
      banner.innerHTML =
        '<div class="cf-pwa-inner">' +
          '<img src="./icons/icon-192.png" alt="" class="cf-pwa-icon" aria-hidden="true">' +
          '<div class="cf-pwa-text">' +
            '<strong class="cf-pwa-title">Add CultureFest App to Home Screen</strong>' +
            '<p class="cf-pwa-sub">Quick access to schedules &amp; info — no app store needed.</p>' +
          '</div>' +
          '<div class="cf-pwa-actions">' +
            '<button class="cf-pwa-install-btn" id="cf-pwa-install-btn">Install</button>' +
            '<button class="cf-pwa-close" aria-label="Dismiss install prompt">&times;</button>' +
          '</div>' +
        '</div>';
    }

    document.body.appendChild(banner);

    // Animate in after paint
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner.classList.add('cf-pwa-visible');
      });
    });

    // Close / dismiss
    banner.querySelector('.cf-pwa-close').addEventListener('click', function () {
      dismissBanner(banner);
    });

    // Android: wire up the Install button
    var installBtn = document.getElementById('cf-pwa-install-btn');
    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (choice) {
          if (choice.outcome === 'accepted') {
            dismissBanner(banner);
          }
          deferredPrompt = null;
        });
      });
    }
  }

  function dismissBanner(banner) {
    banner.classList.remove('cf-pwa-visible');
    banner.addEventListener('transitionend', function () {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, { once: true });
  }

  /* ── 9. Inject CSS ───────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('cf-pwa-styles')) return;

    var style = document.createElement('style');
    style.id = 'cf-pwa-styles';
    style.textContent = [

      /* ── Offline body class ────────────────────────────
       * When .cf-offline is on <body>, disable interactive
       * elements that require network. The app's own JS
       * also guards these actions, but this provides a
       * visual layer on top of the service worker's shell.
       */
      'body.cf-offline .cf-requires-network { opacity: 0.4; pointer-events: none; cursor: not-allowed; }',

      /* ── Offline notice bar ─────────────────────────── */
      '#cf-offline-bar {',
        'position: sticky;',
        'top: 0;',
        'z-index: 10000;',
        'background: #1a2540;',
        'border-bottom: 1px solid rgba(245,166,35,0.4);',
        'color: #f5a623;',
        'font-family: "DM Sans", sans-serif;',
        'font-size: 0.8rem;',
        'font-weight: 500;',
        'padding: 9px 16px;',
        'display: flex;',
        'align-items: center;',
        'gap: 8px;',
        'text-align: left;',
      '}',
      '.cf-offline-icon { font-size: 1rem; flex-shrink: 0; }',

      /* ── Install banner ─────────────────────────────── */
      '#cf-pwa-banner {',
        'position: fixed;',
        'bottom: 0;',
        'left: 0;',
        'right: 0;',
        'z-index: 9999;',
        'background: #161f32;',
        'border-top: 1px solid rgba(245,166,35,0.35);',
        'box-shadow: 0 -4px 32px rgba(0,0,0,0.55);',
        'transform: translateY(100%);',
        'transition: transform 0.38s cubic-bezier(0.22,1,0.36,1);',
      '}',

      '#cf-pwa-banner.cf-pwa-visible { transform: translateY(0); }',

      '.cf-pwa-inner {',
        'display: flex;',
        'align-items: flex-start;',
        'gap: 12px;',
        'padding: 14px 16px;',
        /* Respect iOS home indicator */
        'padding-bottom: max(14px, env(safe-area-inset-bottom, 14px));',
        'max-width: 640px;',
        'margin: 0 auto;',
      '}',

      '.cf-pwa-icon {',
        'width: 44px;',
        'height: 44px;',
        'border-radius: 10px;',
        'flex-shrink: 0;',
        'margin-top: 2px;',
        'display: block;',
      '}',

      '.cf-pwa-text { flex: 1; min-width: 0; }',

      '.cf-pwa-title {',
        'display: block;',
        'font-family: "Syne", sans-serif;',
        'font-size: 0.92rem;',
        'font-weight: 700;',
        'color: #f0f4ff;',
        'line-height: 1.3;',
        'margin-bottom: 5px;',
      '}',

      '.cf-pwa-sub {',
        'font-size: 0.78rem;',
        'color: #a8b4cc;',
        'line-height: 1.45;',
        'margin: 0;',
      '}',

      /* iOS step list */
      '.cf-pwa-steps {',
        'margin: 4px 0 0 17px;',
        'padding: 0;',
        'font-size: 0.78rem;',
        'color: #a8b4cc;',
        'line-height: 1.7;',
      '}',
      '.cf-pwa-steps strong { color: #f0f4ff; }',

      '.cf-pwa-share-glyph {',
        'display: inline-flex;',
        'align-items: center;',
        'justify-content: center;',
        'background: rgba(56,189,248,0.15);',
        'color: #38bdf8;',
        'border-radius: 4px;',
        'padding: 1px 5px;',
        'font-weight: 700;',
        'font-size: 0.9em;',
        'line-height: 1.4;',
        'vertical-align: middle;',
      '}',

      /* Android action area */
      '.cf-pwa-actions {',
        'display: flex;',
        'flex-direction: column;',
        'align-items: flex-end;',
        'gap: 6px;',
        'flex-shrink: 0;',
        'margin-top: 2px;',
      '}',

      '.cf-pwa-install-btn {',
        'background: linear-gradient(135deg, #f5a623 0%, #ff6b6b 100%);',
        'color: #0b1120;',
        'font-family: "DM Sans", sans-serif;',
        'font-weight: 700;',
        'font-size: 0.82rem;',
        'border: none;',
        'border-radius: 9999px;',
        'padding: 7px 18px;',
        'cursor: pointer;',
        'white-space: nowrap;',
        'transition: opacity 0.15s, transform 0.1s;',
      '}',
      '.cf-pwa-install-btn:hover  { opacity: 0.88; }',
      '.cf-pwa-install-btn:active { transform: scale(0.96); }',

      '.cf-pwa-close {',
        'background: transparent;',
        'border: none;',
        'color: #637189;',
        'font-size: 1.4rem;',
        'line-height: 1;',
        'padding: 2px 4px;',
        'cursor: pointer;',
        'flex-shrink: 0;',
        'align-self: flex-start;',
        'transition: color 0.15s;',
      '}',
      '.cf-pwa-close:hover { color: #f0f4ff; }',

      /* Narrow screens: stack install button below text */
      '@media (max-width: 400px) {',
        '.cf-pwa-inner { flex-wrap: wrap; }',
        '.cf-pwa-actions {',
          'flex-direction: row;',
          'align-items: center;',
          'width: 100%;',
          'justify-content: flex-end;',
          'margin-top: 8px;',
        '}',
      '}'

    ].join('\n');

    document.head.appendChild(style);
  }

})();
