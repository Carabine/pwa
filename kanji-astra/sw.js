'use strict';
// Область регистрации — только эта тетрадь; API и другие приложения не кэшируем.
// Общий worker сохраняет кэши с префиксом shell- при своём обновлении.
const CACHE = 'shell-animei-kanjiAstra';
const FILES = [
    './', './index.html', './style.css', './i18n.js', './core.js', './board.js', './app.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png',
    '../css/app.css',
    '../libs/axios/axios.min.js', '../js/snackbar.js', '../js/settings.js', '../js/i18n.js',
    '../js/i18n/uk.js', '../js/i18n/en.js', '../js/speech.js', '../js/axiosClient.js',
    '../js/video-store.js', '../js/words-store.js', '../js/freeze.js', '../js/decks-store.js'
];
const URLS = new Set(FILES.map(path => new URL(path, self.location.href).href));
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(Array.from(URLS))));
});
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    url.search = ''; url.hash = '';
    if (!URLS.has(url.href)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        try {
            const response = await fetch(event.request, { signal: controller.signal });
            if (!response.ok) throw new Error('unavailable');
            // Заполнение кэша не должно превращать успешный ответ сети в ошибку при квоте.
            event.waitUntil(cache.put(url.href, response.clone()).catch(() => {}));
            return response;
        } catch (_) {
            const saved = await cache.match(url.href);
            return saved || Response.error();
        } finally { clearTimeout(timer); }
    })());
});
