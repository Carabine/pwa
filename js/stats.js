// Своя мини-статистика: при открытии страницы шлём один «хит», а также
// умеем трекать действия (сохранение слова, просмотр, учёба) через
// window.animeiTrack('event', 'деталь'). Никаких кук и внешних сервисов —
// только случайный анонимный id в localStorage. IP пишет бэкенд.
(function () {
    // Канонический origin API из axiosClient.js (грузится раньше на всех страницах).
    var domain = window.ANIMEI_ORIGIN || window.location.origin;

    var KEY = 'animei:visitorId';
    var visitorId = localStorage.getItem(KEY);
    if (!visitorId) {
        visitorId = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : Date.now() + '-' + Math.random().toString(16).slice(2);
        localStorage.setItem(KEY, visitorId);
    }

    // id аккаунта (если вошёл) — достаём из access-токена (JWT), чтобы связывать
    // события с пользователем. Токен уже лежит в localStorage у axiosClient.
    function currentUserId() {
        try {
            var token = localStorage.getItem('animei:accessToken');
            if (!token) return null;
            var part = token.split('.')[1];
            if (!part) return null;
            var json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
            var payload = JSON.parse(json);
            return payload && payload.userId ? String(payload.userId).slice(0, 64) : null;
        } catch (e) { return null; }
    }

    // Кого не считаем вовсе (надёжные признаки, а не эвристики):
    //  - автоматизация: navigator.webdriver выставляют puppeteer/playwright/
    //    selenium по стандарту WebDriver — это наши же тест-прогоны и скрейперы;
    //  - устройство владельца: помечается в админке (animei:owner).
    function isOwnerDevice() {
        try { return localStorage.getItem('animei:owner') === '1'; } catch (e) { return false; }
    }
    var automated = navigator.webdriver === true;

    function send(event, page) {
        if (automated || isOwnerDevice()) return;
        var body = { event: event, page: page, visitorId: visitorId };
        var uid = currentUserId();
        if (uid) body.userId = uid;
        fetch(domain + '/api/v1/stats/hit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            keepalive: true
        }).catch(function () { /* статистика не должна мешать приложению */ });
    }

    // Пометить/снять «это моё устройство» (кнопка в админке). Перед тем как
    // замолчать, устройство один раз сообщает серверу 'owner' — так из
    // статистики пропадёт и вся его прошлая история.
    window.animeiSetOwnerDevice = function (on) {
        try {
            if (on) {
                localStorage.removeItem('animei:owner');
                send('owner', 'marked');
                localStorage.setItem('animei:owner', '1');
            } else {
                localStorage.removeItem('animei:owner');
            }
        } catch (e) { /* localStorage недоступен */ }
    };
    window.animeiIsOwnerDevice = isOwnerDevice;

    // Доказательство «здесь человек»: первый настоящий жест на устройстве
    // (isTrusted — событие от пользователя, не из скрипта). Шлём один раз
    // на устройство. Сервер не считает новые устройства без него — так
    // отсеиваются краулеры, которые исполняют JS, но ничего не трогают.
    (function () {
        var HK = 'animei:human';
        try { if (localStorage.getItem(HK)) return; } catch (e) { return; }
        var kinds = ['pointerdown', 'touchstart', 'keydown', 'wheel'];
        function onGesture(e) {
            if (!e.isTrusted) return;
            kinds.forEach(function (k) { window.removeEventListener(k, onGesture, true); });
            try { localStorage.setItem(HK, '1'); } catch (err) { /* ок */ }
            send('human', e.type);
        }
        kinds.forEach(function (k) { window.addEventListener(k, onGesture, { capture: true, passive: true }); });
    })();

    // Публичный трекер действий: window.animeiTrack('save_word', '食べる')
    window.animeiTrack = function (event, detail) {
        if (!event) return;
        // Объект в деталях раньше уходил как «[object Object]» (JP News) — пишем
        // его читаемо: «id=… level=…».
        if (detail && typeof detail === 'object') {
            detail = Object.keys(detail).map(function (k) { return k + '=' + detail[k]; }).join(' ');
        }
        send(String(event).slice(0, 40), String(detail || '-').slice(0, 200) || '-');
    };

    // Авто-хит открытия страницы: /pages/catalog.html -> app/catalog. Приложения
    // в своих папках — по папке: /kanji/ -> app/kanji, /street/walk.html ->
    // app/street/walk (иначе Прописи писались бы как главная, app/index).
    function pageName() {
        var parts = location.pathname.split('/').filter(Boolean);
        var last = location.pathname.slice(-1) === '/' ? '' : (parts.pop() || '');
        var file = last.replace('.html', '');
        var dir = parts[parts.length - 1] || '';
        if (dir && dir !== 'pages' && dir !== 'app') {
            return 'app/' + dir + (file && file !== 'index' ? '/' + file : '');
        }
        return 'app/' + (file || 'index');
    }
    var PAGE = pageName();
    send('page', PAGE);

    // Короткие метки вместо utm_source: ?r=lj в ссылке не выглядит рекламным
    // хвостом, а в панели разворачивается в понятное имя площадки. Неизвестный
    // код проходит как есть; ?r=tg-name — это канал tg_name, ?r=rd-name — сабреддит reddit_name.
    var REF_CODES = {
        lj: 'reddit_learnjapanese', sp: 'reddit_sideproject', hn: 'hn', ph: 'ph',
        ih: 'ih', hb: 'habr', vc: 'vc', at: 'alternativeto', un: 'uneed'
    };
    function refCode(v) {
        v = v.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
        if (!v) return null;
        if (REF_CODES[v]) return REF_CODES[v];
        if (v.indexOf('tg-') === 0) return 'tg_' + v.slice(3);
        if (v.indexOf('rd-') === 0) return 'reddit_' + v.slice(3);
        return v;
    }

    // Откуда пришёл посетитель: метка из адреса, иначе домен реферера.
    // Переход внутри своего же сайта (лендинг -> приложение) источником не
    // считается — это 'direct', как и заход по закладке или из установленной PWA.
    function refSource() {
        try {
            var q = new URLSearchParams(location.search);
            var utm = q.get('r') || q.get('utm_source');
            if (utm) return refCode(utm);
            if (!document.referrer) return 'direct';
            var host = new URL(document.referrer).hostname.replace(/^www\./, '').toLowerCase();
            var own = location.hostname.replace(/^www\./, '').toLowerCase();
            return (!host || host === own) ? 'direct' : host.slice(0, 40);
        } catch (e) { return null; }
    }

    // Один раз на вкладку-сессию: иначе каждая открытая страница накручивала бы
    // источнику лишний заход.
    try {
        if (!sessionStorage.getItem('animei:refTracked')) {
            sessionStorage.setItem('animei:refTracked', '1');
            var src = refSource();
            if (src) send('ref', src);
        }
    } catch (e) { /* sessionStorage может быть недоступен */ }

    // «Сейчас онлайн»: пока вкладка на виду, раз в минуту шлём пинг. В базу он
    // не пишется — сервер держит только память «кто и где был последние
    // пару минут». Без пинга человек, смотрящий серию, выглядел бы ушедшим:
    // за 20 минут просмотра других событий может не быть вовсе.
    var PING_MS = 60 * 1000;
    var lastPing = 0;
    function ping() {
        if (automated || isOwnerDevice() || document.visibilityState !== 'visible') return;
        lastPing = Date.now();
        var body = { visitorId: visitorId, page: PAGE };
        // В плеере — что смотрит (плеер пишет тайтл в заголовок вкладки).
        if (PAGE === 'app/player') body.title = String(document.title || '').replace(/\s*—\s*Animei\s*$/, '').slice(0, 80);
        var uid = currentUserId();
        if (uid) body.userId = uid;
        fetch(domain + '/api/v1/stats/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            keepalive: true
        }).catch(function () {});
    }
    ping();
    setInterval(ping, PING_MS);

    // «Вышел из приложения»: вкладку/PWA закрыли, свернули или переключились —
    // страница скрылась НЕ из-за перехода внутри приложения. Переход по своим
    // страницам тоже скрывает страницу, поэтому его помечаем заранее: событие
    // navigate (Navigation API — ссылки, location.href, перезагрузка) и, где
    // его нет, клик по ссылке на свой же сайт. Вернулся — 'return' с временем
    // отсутствия (короткие отлучки таймлайн в админке схлопывает).
    // Пометка живёт несколько секунд: клик по ссылке-скачиванию страницу не
    // уводит, и вечная пометка съела бы настоящий уход позже.
    var NAV_GRACE_MS = 5000;
    var navAt = 0;
    var hiddenAt = 0;
    if (window.navigation && typeof window.navigation.addEventListener === 'function') {
        window.navigation.addEventListener('navigate', function (e) {
            // pushState/якорь — страница остаётся на месте, это не переход.
            if (e.hashChange || (e.destination && e.destination.sameDocument)) return;
            navAt = Date.now();
        });
    }
    document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a || a.target === '_blank' || a.hasAttribute('download') || e.defaultPrevented) return;
        try { if (new URL(a.href, location.href).origin === location.origin) navAt = Date.now(); } catch (err) { /* ок */ }
    }, true);
    // Вернулись назад из bfcache — прежний переход уже не наш «уход».
    window.addEventListener('pageshow', function () { navAt = 0; });

    // Вернулся на вкладку — сразу отмечаемся, не дожидаясь таймера.
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            if (Date.now() - navAt < NAV_GRACE_MS) return;
            hiddenAt = Date.now();
            send('leave', PAGE);
            return;
        }
        if (hiddenAt) {
            send('return', String(Math.round((Date.now() - hiddenAt) / 1000)));
            hiddenAt = 0;
        }
        if (Date.now() - lastPing > 15000) ping();
    });
})();
