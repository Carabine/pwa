// Пути относительные — SW живёт в /app/, поэтому './' указывает на /app/.
// ВАЖНО: меняй номер версии при каждом деплое — иначе старый кеш не сбросится.
const CACHE_NAME = 'animei-cache-v0.0.403';
// Полный список генерит deploy/build-pwa.mjs из содержимого dist (страницы,
// css, js, libs; скрытая админка исключена) и подставляет сюда при сборке.
// В исходнике — только app-shell: без сборки SW тоже работает, офлайн беднее.
const urlsToCache = [
    './',
    './index.html',
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    // Set — страховка от дубликата в списке: addAll с повторяющимся URL
    // отвергается целиком, и установка SW молча падает (наступили 20.08).
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll([...new Set(urlsToCache)]))
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

    // Медиа-потоки (/proxy/…) отдаём мимо воркера. Chrome добавляет Range к
    // запросам <video> на сетевом уровне, и в обработчике его в request.headers
    // не видно — пересоздание Request ниже этот Range теряет, сервер отвечает
    // полными 200, и прямой mp4 не стартует (браузер не может дотянуться до moov
    // в хвосте у не-faststart файла). Кэшировать поток всё равно незачем, а
    // cache.put() на 206 просто бросает исключение.
    const url = new URL(request.url);
    if (url.pathname.startsWith('/proxy/') || request.destination === 'video'
        || request.destination === 'audio' || request.headers.has('range')) {
        return;
    }

    // cache: 'no-cache' — всегда спрашиваем сервер (ревалидация по ETag), а не
    // берём ресурс из HTTP-кеша браузера. Иначе «сеть в первую очередь» по факту
    // отдавала старый CSS/JS из HTTP-кеша, и правки не доезжали до установленного
    // приложения (в инкогнито HTTP-кеша нет — там обновлялось сразу).
    // Навигационные запросы (mode 'navigate') пересоздавать нельзя — Request
    // конструктор для них бросает исключение, поэтому их не трогаем.
    // Вендорные библиотеки (libs/) при деплое не меняются — им ревалидация не
    // нужна, пусть отдаются из HTTP-кеша по Cache-Control от nginx.
    const sameOrigin = url.origin === self.location.origin;
    const isVendorLib = url.pathname.includes('/libs/');
    const networkRequest = (sameOrigin && !isVendorLib && request.mode !== 'navigate')
        ? new Request(request, { cache: 'no-cache' })
        : request;

    event.respondWith(
        fetch(networkRequest)
            .then((response) => {
                // Обновляем офлайн-копию только для своих ресурсов.
                if (response.ok && sameOrigin) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
                }
                return response;
            })
            .catch(async () => {
                // Офлайн: сначала точная копия страницы/ресурса. Если её нет
                // (страницу ещё не открывали онлайн), для навигаций отдаём
                // app-shell — index.html, — вместо сетевой ошибки.
                const cached = await caches.match(request);
                if (cached) return cached;
                if (request.mode === 'navigate') {
                    return (await caches.match('./index.html')) || (await caches.match('./'));
                }
                return Response.error();
            })
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
