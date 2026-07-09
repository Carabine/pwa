// Пути относительные — SW живёт в /app/, поэтому './' указывает на /app/.
// ВАЖНО: меняй номер версии при каждом деплое — иначе старый кеш не сбросится.
const CACHE_NAME = 'animei-cache-v48';
const urlsToCache = [
    './',
    './index.html',
    './pages/study.html',
    './pages/custom-study.html',
    './pages/beginner.html',
    './pages/watch.html',
    './pages/words.html',
    './pages/login.html',
    './pages/feedback.html',
    './css/app.css',
    './css/watch.css',
    './js/app.js',
    './js/video-store.js',
    './js/study-core.js',
    './js/study.js',
    './js/custom-study.js',
    './js/starter-deck.js',
    './js/beginner-study.js',
    './js/player-ui.js',
    './js/watch.js',
    './js/axiosClient.js',
    './js/words-store.js',
    './js/stats.js',
    './img/logo.svg',
    './manifest.json',
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
    );
});

// Стратегия «сеть в первую очередь» для нашего кода и страниц: пока есть
// интернет, пользователь всегда получает свежую версию, а закешированная копия —
// только запасной вариант в офлайне. Так исправления доезжают сразу после
// деплоя, без ручного сброса кеша у каждого пользователя.
//
// SW живёт в /app/, поэтому перехватывает только запросы к приложению;
// вызовы к /api/... сюда не попадают. Кешируем лишь свои GET-запросы.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    // cache: 'no-cache' — всегда спрашиваем сервер (ревалидация по ETag), а не
    // берём ресурс из HTTP-кеша браузера. Иначе «сеть в первую очередь» по факту
    // отдавала старый CSS/JS из HTTP-кеша, и правки не доезжали до установленного
    // приложения (в инкогнито HTTP-кеша нет — там обновлялось сразу).
    // Навигационные запросы (mode 'navigate') пересоздавать нельзя — Request
    // конструктор для них бросает исключение, поэтому их не трогаем.
    const sameOrigin = new URL(request.url).origin === self.location.origin;
    const networkRequest = (sameOrigin && request.mode !== 'navigate')
        ? new Request(request, { cache: 'no-cache' })
        : request;

    event.respondWith(
        fetch(networkRequest)
            .then((response) => {
                // Обновляем офлайн-копию только для своих ресурсов.
                if (response.ok && new URL(request.url).origin === self.location.origin) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});
