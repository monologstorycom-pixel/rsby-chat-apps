const CACHE_NAME = 'rsby-v5';
const ASSETS = ['/', '/index.html', '/style.css', '/script.js'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// Terima push notifikasi dari server
self.addEventListener('push', (e) => {
    const data = e.data ? e.data.json() : { title: 'RSBY Chat', body: 'Ada pesan baru' };
    e.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: 'https://cdn-icons-png.flaticon.com/512/2111/2111646.png',
            badge: 'https://cdn-icons-png.flaticon.com/512/2111/2111646.png',
            tag: data.tag || 'rsby-chat',
            renotify: true,
            vibrate: [200, 100, 200],
            data: { url: data.url || '/' }
        })
    );
});

// Klik notif -> buka/focus tab app
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            const existing = list.find(c => c.url.includes(self.location.origin));
            if (existing) return existing.focus();
            return clients.openWindow(e.notification.data.url || '/');
        })
    );
});