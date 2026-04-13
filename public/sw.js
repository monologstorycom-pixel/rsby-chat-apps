self.addEventListener('install', (e) => {
    e.waitUntil(caches.open('v4').then((cache) => cache.addAll(['/', '/index.html', '/style.css', '/script.js'])));
});
self.addEventListener('fetch', (e) => {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});