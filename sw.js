/* Neural Ascent service worker v7 — network-first for JS so updates apply */
const CACHE = 'neural-ascent-v7';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/theme.css',
  './css/layout.css',
  './css/game.css',
  './css/responsive.css',
  './js/config.js',
  './js/utils.js',
  './js/rng.js',
  './js/network.js',
  './js/nn/model.js',
  './js/nn/features.js',
  './js/nn/buffer.js',
  './js/nn/train.js',
  './js/nn/imitate.js',
  './js/levels.js',
  './js/world.js',
  './js/physics.js',
  './js/renderer25d.js',
  './js/ui.js',
  './js/expert.js',
  './js/debug.js',
  './js/tilt.js',
  './js/main.js',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Network-first for scripts and HTML so deploys are visible immediately
  if (url.includes('/js/') || url.endsWith('.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
