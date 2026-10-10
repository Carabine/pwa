// Пути относительные — SW живёт в /app/, поэтому './' указывает на /app/.
// ВАЖНО: меняй номер версии при каждом деплое — иначе старый кеш не сбросится.
const CACHE_NAME = 'animei-cache-v0.0.709';
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
// SW живёт в /app/ — это ограничивает, какие СТРАНИЦЫ он контролирует, но
// перехватывает он ВСЕ их запросы, включая /api/... (раньше здесь было написано
// обратное). Благодаря этому офлайн работают каталог и словарь: GET-ответы API
// лежат в том же кеше. Ответ, отданный из кеша, помечаем заголовком — по нему
// приложение понимает, что сети нет, и показывает полосу (без пометки офлайн
// каталог выглядел как живой).
// Копия ответа с пометкой «это из офлайн-кеша». Заголовки Response неизменяемы,
// поэтому пересобираем ответ целиком; тело читаем через blob — так проходят и
// страницы, и JSON API.
async function markCached(res) {
    try {
        const headers = new Headers(res.headers);
        headers.set('X-Animei-Cache', '1');
        return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
    } catch {
        return res;   // не смогли пересобрать — лучше отдать как есть, чем ошибку
    }
}

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

    // ЛИЧНЫЕ ответы API мимо кэша. Ключ Cache API — это URL, пользователя он не
    // различает, поэтому закэшированные карточки, колоды и профиль одного
    // аккаунта доставались следующему, кто сядет за этот браузер и потеряет
    // сеть. Офлайн-копия личных данных живёт в самом приложении
    // (animei:wordsCache и прочее) и чистится при смене аккаунта.
    // Безличное (каталог, субтитры, словарь) кэшируем как раньше — на нём
    // держится офлайн-каталог.
    // Админские ответы и любой запрос с Authorization — тоже личные.
    if (/^\/api\/v1\/(words|decks|users|auth|stats|admin)(\/|$)/.test(url.pathname)
        || request.headers.has('Authorization')) {
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
                if (cached) return markCached(cached);
                if (request.mode === 'navigate') {
                    const shell = (await caches.match('./index.html')) || (await caches.match('./'));
                    return shell ? markCached(shell) : Response.error();
                }
                return Response.error();
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                // Cache Storage общий на весь origin: рядом живут кэши JP News
                // (shell-*/data-*, см. nihongo-news/public/sw.js) — их не трогаем.
                names.filter((name) => name !== CACHE_NAME && !/^(shell|data)-/.test(name))
                    .map((name) => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});
