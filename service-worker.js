const CACHE_NAME = 'animei-cache-v4';
const urlsToCache = [
    '/',
    '/index.html',
    '/pages/study.html',
    '/pages/custom-study.html',
    '/pages/watch.html',
    '/pages/words.html',
    '/pages/login.html',
    '/pages/feedback.html',
    '/css/app.css',
    '/css/watch.css',
    '/js/app.js',
    '/js/watch.js',
    '/js/axiosClient.js',
    '/data/data.json',
    '/data/data2.json',
    '/manifest.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
            )
        )
    );
});
