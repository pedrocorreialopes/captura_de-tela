/* ==========================================================================
   Print Fácil — service worker
   Estratégia:
   - Navegação: rede primeiro, cache como reserva (funciona offline).
   - Estáticos: cache primeiro com revalidação em segundo plano.
   As capturas ficam no IndexedDB e nunca passam por aqui.
   ========================================================================== */
'use strict';

const VERSION = 'printfacil-v1';
const APP_SHELL = [
  './',
  './index.html',
  './android.html',
  './css/style.css',
  './js/utils.js',
  './js/db.js',
  './js/settings.js',
  './js/capture.js',
  './js/fab.js',
  './js/gallery.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
        fetch(request)
          .then((response) => {
            if (response && response.ok) {
              caches.open(VERSION).then((cache) => cache.put(request, response.clone())).catch(() => undefined);
            }
          })
          .catch(() => undefined);
        return hit;
      }
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      });
    })
  );
});
