/* Neural Ascent service worker — offline PWA */
const CACHE = 'neural-ascent-v2';
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
  './js/levels.js',
  './js/world.js',
  './js/physics.js',
  './js/renderer25d.js',
  './js/ui.js',
  './js/expert.js',
  './js/main.js',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
