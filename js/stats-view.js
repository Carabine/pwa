// Виджет статистики — монтируется в контейнер (в админке, без отдельной страницы
// и без iframe). Вся вёрстка/логика перенесены из бывшей stats.html; DOM-запросы
// scoped к root (gid/root.querySelectorAll), поэтому id/классы не конфликтуют с
// хост-страницей. Доступ — по сессии админа (Bearer) или ключу STATS_KEY.
(function () {
    var CSS = ".statsview .wrap { max-width: 900px; margin: 0 auto; }\n.statsview h1 { font-size: 22px; margin: 0 0 4px; }\n.statsview .sub { color: var(--muted); font-size: 13px; margin-bottom: 20px; }\n.statsview .periods { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }\n.statsview .periods button { background: var(--card); color: var(--text); border: 1px solid var(--border);\n        padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; }\n.statsview .periods button.active { background: var(--accent); border-color: var(--accent); color: #0f1115; font-weight: 600; }\n.statsview .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 28px; }\n.statsview .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }\n.statsview .card .label { color: var(--muted); font-size: 12px; margin-bottom: 6px; }\n.statsview .card .value { font-size: 28px; font-weight: 700; }\n.statsview .section-title { font-size: 15px; margin: 0 0 12px; color: var(--text); }\n.statsview .chart { display: flex; align-items: flex-end; gap: 3px; height: 180px; padding: 12px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow-x: auto; }\n.statsview .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-width: 16px; flex: 1; height: 100%; }\n.statsview .bar { width: 70%; background: var(--accent); border-radius: 3px 3px 0 0; min-height: 2px; transition: height .2s; }\n.statsview .bar.empty { background: var(--accent2); }\n.statsview .bar-date { color: var(--muted); font-size: 9px; margin-top: 6px; white-space: nowrap; transform: rotate(-60deg); transform-origin: center; height: 28px; }\n.statsview table { width: 100%; border-collapse: collapse; margin-top: 28px; background: var(--card); border-radius: 12px; overflow: hidden; }\n.statsview th, .statsview td { text-align: left; padding: 10px 14px; font-size: 13px; border-bottom: 1px solid var(--border); }\n.statsview th { color: var(--muted); font-weight: 500; background: var(--card2); }\n.statsview td.num, .statsview th.num { text-align: right; }\n.statsview tr:last-child td { border-bottom: none; }\n.statsview .msg { color: var(--muted); padding: 40px 0; text-align: center; }\n.statsview .visitor { background: var(--card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 10px; overflow: hidden; }\n.statsview .visitor__head { display: flex; align-items: center; gap: 12px; padding: 12px 14px; cursor: pointer; flex-wrap: wrap; }\n.statsview .visitor__head:hover { background: var(--card2); }\n.statsview .visitor__ip { font-weight: 600; font-size: 14px; font-family: ui-monospace, monospace; }\n.statsview .visitor__meta { color: var(--muted); font-size: 12px; }\n.statsview .visitor__spacer { flex: 1; }\n.statsview .visitor__caret { color: var(--accent); font-size: 12px; white-space: nowrap; }\n.statsview .visitor__caret::after { content: ' ▾'; display: inline-block; transition: transform .15s; }\n.statsview .visitor.open .visitor__caret::after { transform: rotate(180deg); }\n.statsview .visitor__geo { color: var(--muted); font-size: 12px; }\n.statsview .visitor__dev { color: var(--muted); font-size: 11px; font-family: ui-monospace, monospace; }\n.statsview .visitor__body { display: none; padding: 4px 14px 14px; border-top: 1px solid var(--border); }\n.statsview .visitor.open .visitor__body { display: block; }\n.statsview /* Сводка «что делал» — вторая строка шапки посетителя, .statsview чипы по типам действий */\n    .visitor__digest { width: 100%; font-size: 12px; line-height: 2; }\n.statsview .visitor__digest .dg { background: var(--card2); border: 1px solid var(--border); color: var(--text);\n        padding: 2px 9px; border-radius: 20px; margin-right: 6px; display: inline-block;\n        max-width: 100%; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }\n.statsview .visitor__digest .dg--idle { color: var(--muted); }\n.statsview .tl { list-style: none; margin: 8px 0 0; padding: 0; }\n.statsview .tl li { display: flex; gap: 10px; padding: 5px 0; font-size: 12px; border-bottom: 1px solid var(--border); }\n.statsview .tl li:last-child { border-bottom: none; }\n.statsview .tl__time { color: var(--muted); white-space: nowrap; min-width: 54px; }\n.statsview .tl__act { color: var(--text); word-break: break-word; }\n.statsview .tl__tag { display: inline-block; min-width: 92px; color: var(--accent); }\n.statsview /* Открытия страниц приглушаем — глаз цепляется за реальные действия */\n    .tl li.pg .tl__tag, .statsview .tl li.pg .tl__act { color: var(--muted); }\n.statsview .tl__rep { color: var(--accent); white-space: nowrap; }\n.statsview /* Сессии посетителя: каждая — отдельный визит с путём (что куда нажимал). */\n    .session { border: 1px solid var(--border); border-radius: 10px; margin: 10px 0; overflow: hidden; }\n.statsview .session__head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; padding: 8px 12px; background: var(--card2); font-size: 12px; }\n.statsview .session__n { font-weight: 600; color: var(--text); }\n.statsview .session__dev { font-family: ui-monospace, monospace; color: var(--muted); font-size: 11px; }\n.statsview .session__time { color: var(--muted); }\n.statsview .session__count { color: var(--accent); margin-left: auto; white-space: nowrap; }\n.statsview .session .tl { margin: 0; padding: 4px 12px 8px; }\n.statsview /* Итог сессии одной строкой: что реально сделал за визит */\n    .session__sum { padding: 8px 12px 0; font-size: 12px; color: var(--text); line-height: 1.6; }\n.statsview /* Стрелка-путь: краткий маршрут по страницам вверху сессии */\n    .session__path { padding: 8px 12px 0; font-size: 12px; color: var(--muted); line-height: 1.7; }\n.statsview .session__path b { color: var(--text); font-weight: 500; }\n.statsview .session__path .arr { color: var(--accent2); margin: 0 5px; }\n.statsview /* Ворота ключа: инлайн-поле вместо window.prompt (в PWA prompt ненадёжен). */\n    .key-gate { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(10, 12, 16, 0.94); padding: 20px; }\n.statsview .key-gate[hidden] { display: none; }\n.statsview .key-gate__box { width: 100%; max-width: 340px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 22px; display: flex; flex-direction: column; gap: 12px; }\n.statsview .key-gate__title { font-size: 18px; font-weight: 700; }\n.statsview .key-gate__hint { color: var(--muted); font-size: 13px; margin-top: -8px; }\n.statsview .key-gate__input { width: 100%; padding: 12px 14px; font-size: 16px; border-radius: 10px; border: 1px solid var(--border); background: var(--card2); color: var(--text); }\n.statsview .key-gate__input:focus { outline: none; border-color: var(--accent); }\n.statsview .key-gate__btn { padding: 12px; font-size: 15px; font-weight: 600; border: none; border-radius: 10px; background: var(--accent); color: #0f1115; cursor: pointer; }\n.statsview .key-gate__err { color: #ff7b7b; font-size: 13px; }";
    var MARKUP = '<div class="wrap">\n    <h1>Статистика Animei</h1>\n    <div class="sub" id="sub">Загрузка…</div>\n\n    <div class="periods">\n        <button data-days="7">7 дней</button>\n        <button data-days="30" class="active">30 дней</button>\n        <button data-days="90">90 дней</button>\n    </div>\n\n    <div class="periods" id="botFilter">\n        <button id="humansBtn" class="active">👤 Только люди</button>\n        <button id="allBtn">🤖 Показать ботов</button>\n    </div>\n\n    <div class="cards" id="cards"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Здоровье сервиса</h2>\n    <div class="sub" id="health-sub"></div>\n    <div class="periods" id="health"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Петля по неделям: смотрел + повторял</h2>\n    <div class="sub">Вошедшие пользователи · неделя с понедельника · «оба» — и смотрел аниме, и завершил повторение</div>\n    <div id="weekly"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Открытия по дням</h2>\n    <div class="chart" id="chart"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Топ страниц</h2>\n    <div id="pages"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Посетители по IP</h2>\n    <div class="sub" id="visitors-sub"></div>\n    <div class="periods" id="countryFilter"></div>\n    <div id="visitors"></div>\n</div>\n\n<div id="keyGate" class="key-gate" hidden>\n    <form class="key-gate__box" id="keyForm">\n        <div class="key-gate__title">🔑 Ключ владельца</div>\n        <div class="key-gate__hint">Введите ключ, чтобы открыть статистику</div>\n        <input id="keyInput" class="key-gate__input" type="text" inputmode="text"\n               autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false"\n               placeholder="ключ">\n        <button type="submit" class="key-gate__btn">Открыть</button>\n        <div class="key-gate__err" id="keyErr" hidden>Неверный ключ — попробуй ещё раз</div>\n    </form>\n</div>';
    window.StatsView = {
        mount: function (root) {
            if (!root || root.__statsMounted) return;
            root.__statsMounted = true;
            if (!document.getElementById('statsview-css')) {
                var st = document.createElement('style');
                st.id = 'statsview-css'; st.textContent = CSS +
                    '\n.statsview .session__steps { margin: 0; }' +
                    '\n.statsview .session__steps > summary { list-style: none; cursor: pointer; padding: 8px 12px; color: var(--muted); font-size: 12px; user-select: none; }' +
                    '\n.statsview .session__steps > summary::-webkit-details-marker { display: none; }' +
                    '\n.statsview .session__steps[open] > summary { color: var(--accent); }' +
                    '\n.statsview .session__steps > summary:hover { color: var(--text); }';
                document.head.appendChild(st);
            }
            root.classList.add('statsview');
            root.innerHTML = MARKUP;
            var gid = function (id) { return root.querySelector('#' + id); };
            (function () {
    // Тот же хост, что и приложение (nginx проксирует /api на бэкенд).
    var apiBase = ['localhost', '127.0.0.1', ''].includes(location.hostname)
        ? 'http://localhost:3005'
        : location.origin;

    // Лёгкий ключ владельца: ?key=… один раз в адресе — дальше живёт в
    // localStorage. Без него бэкенд (STATS_KEY) отдаёт 403 и страница пуста.
    var urlKey = new URLSearchParams(location.search).get('key');
    if (urlKey) { try { localStorage.setItem('animei:statsKey', urlKey); } catch (e) {} }
    var statsKey = urlKey || (function () { try { return localStorage.getItem('animei:statsKey') || ''; } catch (e) { return ''; } })();
    function keyQ() { return statsKey ? '&key=' + encodeURIComponent(statsKey) : ''; }

    // Владелец мог войти в приложение как админ (admin@animei.space) — тогда ключ
    // не нужен: шлём Bearer-токен, сервер пускает по сессии админа. Так вкладка
    // «Статистика» в админке больше не просит ключ.
    function statsAuth() {
        try {
            var t = localStorage.getItem('animei:accessToken');
            if (t) return { Authorization: 'Bearer ' + t };
        } catch (e) {}
        return {};
    }

    // Бэкенд ответил 403 — нет доступа (ни сессии админа, ни ключа). Показываем
    // инлайн-поле ключа (window.prompt в PWA ненадёжен). Сама админ-сессия ключа
    // не требует — сюда попадаем, только если пользователь не админ и без ключа.
    function showKeyGate(wrong) {
        var gate = gid('keyGate');
        var wasHidden = gate.hidden;
        gate.hidden = false;
        if (wrong) gid('keyErr').hidden = false;
        if (wasHidden) { var i = gid('keyInput'); i.value = ''; i.focus(); }
    }
    function requireKey(r) {
        if (r.status !== 403) return r.json();
        showKeyGate(!!statsKey);
        throw new Error('403');
    }
    gid('keyForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var k = gid('keyInput').value.trim();
        if (!k) return;
        try { localStorage.setItem('animei:statsKey', k); } catch (e2) {}
        location.reload();
    });

    var currentDays = 30;
    var showBots = false;   // по умолчанию — только люди; кнопка включает ботов

    function fmt(n) { return (n ?? 0).toLocaleString('ru-RU'); }

    function card(label, value) {
        return '<div class="card"><div class="label">' + label + '</div><div class="value">' + fmt(value) + '</div></div>';
    }

    function render(data) {
        var mode = data.withBots ? 'с ботами' : 'только люди';
        var hidden = (!data.withBots && data.botHits) ? ' · скрыто ботов: ' + fmt(data.botHits) : '';
        gid('sub').textContent =
            'За ' + data.days + ' дн. · ' + mode + hidden + ' · обновлено ' + new Date().toLocaleString('ru-RU');

        gid('cards').innerHTML =
            card('Всего открытий', data.totalHits) +
            card('Уникальных посетителей', data.totalVisitors) +
            card('Сегодня открытий', data.today.hits) +
            card('Сегодня посетителей', data.today.visitors);

        // График по дням
        var max = Math.max(1, ...data.perDay.map(function (d) { return d.hits; }));
        gid('chart').innerHTML = data.perDay.map(function (d) {
            var h = Math.round((d.hits / max) * 100);
            var cls = d.hits === 0 ? 'bar empty' : 'bar';
            var label = d.date.slice(5); // ММ-ДД
            return '<div class="bar-col" title="' + d.date + ': ' + d.hits + ' открытий, ' + d.visitors + ' посетителей">' +
                   '<div class="' + cls + '" style="height:' + h + '%"></div>' +
                   '<div class="bar-date">' + label + '</div></div>';
        }).join('');

        // Топ страниц
        if (!data.topPages.length) {
            gid('pages').innerHTML = '<div class="msg">Пока нет данных</div>';
        } else {
            var rows = data.topPages.map(function (p) {
                return '<tr><td>' + p.page + '</td><td class="num">' + fmt(p.hits) +
                       '</td><td class="num">' + fmt(p.visitors) + '</td></tr>';
            }).join('');
            gid('pages').innerHTML =
                '<table><thead><tr><th>Страница</th><th class="num">Открытия</th><th class="num">Посетители</th></tr></thead><tbody>' +
                rows + '</tbody></table>';
        }
    }

    // Человеческие названия действий и страниц для таймлайна.
    var EVENT_LABELS = {
        page: 'открыл', session: 'вошёл', save_word: 'сохранил слово', play: 'смотрел',
        study: 'учил', search: 'искал', voiceover: 'озвучка', chibi_hidden: 'скрыл доп.',
        autosync: 'автосинк', explain: 'разбор', onboarding: 'онбординг',
        setting: 'настройка', password_change: 'сменил пароль',
        srs_review: 'повторил', resume: 'продолжил', session_card: 'итог сессии',
        episode_end: 'досмотрел серию', daily_plan: 'план дня', catalog: 'каталог'
    };
    var PAGE_LABELS = {
        'app/index': 'главная', 'app/catalog': 'каталог', 'app/player': 'плеер',
        'app/watch': 'свой файл', 'app/words': 'словарь', 'app/study': 'повторение',
        'app/custom-study': 'своя учёба', 'app/beginner': 'для новичка',
        'app/settings': 'настройки', 'app/login': 'вход', 'app/feedback': 'отзыв',
        'app/stats': 'статистика', 'landing/index': 'лендинг'
    };
    var STUDY_LABELS = { srs: 'повторение', cram: 'зубрёжка' };

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    // Расшифровка «технических» деталей события в человеческий текст.
    function detailText(item) {
        var p = String(item.page);
        switch (item.event) {
            case 'page': return PAGE_LABELS[p] || p;
            case 'session': return 'на странице «' + (PAGE_LABELS[p] || p) + '»';
            case 'study': return STUDY_LABELS[p] || p;
            case 'srs_review': return p === 'graduated' ? 'закончил сессию повторения' : p;
            case 'search': {
                var m = p.match(/^(.*) → (\d+)$/);
                return m ? '«' + m[1] + '» — найдено: ' + m[2] : '«' + p + '»';
            }
            case 'resume':
                return { shown: 'увидел кнопку «продолжить»', click: 'нажал «продолжить»', dismiss: 'закрыл «продолжить»' }[p]
                    || (p.indexOf('seek:') === 0 ? 'перемотка на ' + p.slice(5) + ' с' : p);
            case 'session_card':
                if (p.indexOf('home_shown') === 0) return 'увидел итог сессии на главной (' + (p.split(':')[1] || '?') + ' слов)';
                if (p.indexOf('player_shown') === 0) return 'увидел итог сессии в плеере (' + (p.split(':')[1] || '?') + ' слов)';
                if (p.indexOf('home_pick') === 0 || p.indexOf('player_pick') === 0) return 'забрал слова из итога (' + (p.split(':')[1] || '?') + ')';
                if (p === 'home_later') return 'отложил итог на потом';
                return p;
            case 'daily_plan':
                if (p === 'done') return 'план на день выполнен';
                if (p.indexOf('shown') === 0) return 'увидел план на день (осталось ' + (p.split(':')[1] || '?') + ')';
                return p;
            case 'onboarding':
                return p.indexOf('from_landing') === 0 ? 'пришёл с лендинга (' + (p.split(':')[1] || '?') + ' фраз)' : p;
            case 'autosync': return 'сдвиг субтитров ' + p;
            case 'catalog': return p === 'filter:easy' ? 'фильтр «полегче»' : p;
            default: return p;
        }
    }

    function fmtTime(iso) {
        var d = new Date(iso);
        return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function fmtHM(iso) {
        return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function fmtDate(iso) {
        return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    }

    // Короткое описание устройства из User-Agent: «📱 Android · Chrome».
    function uaShort(ua) {
        if (!ua) return '';
        var os = /iPhone|iPod/.test(ua) ? 'iPhone'
            : /iPad/.test(ua) ? 'iPad'
            : /Android/.test(ua) ? 'Android'
            : /Windows/.test(ua) ? 'Windows'
            : /Mac OS X/.test(ua) ? 'macOS'
            : /Linux/.test(ua) ? 'Linux' : '?';
        var br = /YaBrowser/.test(ua) ? 'Яндекс'
            : /Edg\//.test(ua) ? 'Edge'
            : /OPR\/|Opera/.test(ua) ? 'Opera'
            : /Firefox/.test(ua) ? 'Firefox'
            : /Chrome/.test(ua) ? 'Chrome'
            : /Safari/.test(ua) ? 'Safari' : '?';
        var mob = /Mobile|iPhone|Android/.test(ua) ? '📱' : '🖥';
        return mob + ' ' + os + ' · ' + br;
    }

    // ---------- Гео по IP + фильтр по странам ----------
    // Тянем гео (ipwho.is, бесплатно) для ВСЕХ IP списка сразу, кешируем в
    // localStorage навсегда (гео IP почти не меняется) — фильтр по странам
    // строится из этих данных.
    var GEO_LS = 'animei:statsGeo';
    var geoCache = {};
    try { geoCache = JSON.parse(localStorage.getItem(GEO_LS)) || {}; } catch (e) {}

    function isPrivateIp(ip) {
        return !ip || ip === 'неизвестно' || /^(127\.|10\.|192\.168\.|::1)/.test(ip);
    }

    function fetchGeo(ip) {
        if (geoCache[ip]) return Promise.resolve(geoCache[ip]);
        if (isPrivateIp(ip)) return Promise.resolve(null);
        return fetch('https://ipwho.is/' + ip + '?lang=ru')
            .then(function (r) { return r.json(); })
            .then(function (g) {
                if (!g || !g.success) return null;
                geoCache[ip] = {
                    flag: (g.flag && g.flag.emoji) || '🌐',
                    country: g.country || '?',
                    code: g.country_code || '??',
                    city: g.city || '',
                    isp: (g.connection && g.connection.isp) || ''
                };
                try { localStorage.setItem(GEO_LS, JSON.stringify(geoCache)); } catch (e) {}
                return geoCache[ip];
            })
            .catch(function () { return null; }); // сетевые ошибки не кешируем — доберём в след. раз
    }

    // По 4 запроса параллельно, чтобы не душить бесплатный ipwho.is.
    function prefetchGeo(ips, done) {
        var queue = ips.filter(function (ip) { return !geoCache[ip] && !isPrivateIp(ip); });
        if (!queue.length) { done(); return; }
        var i = 0;
        function worker() {
            if (i >= queue.length) return Promise.resolve();
            return fetchGeo(queue[i++]).then(worker);
        }
        Promise.all([worker(), worker(), worker(), worker()]).then(done, done);
    }

    // Страна посетителя для фильтра; без гео — отдельная корзина «❓».
    function countryOf(ip) {
        var g = geoCache[ip];
        return g ? { code: g.code, name: g.country, flag: g.flag }
                 : { code: '??', name: 'без гео', flag: '❓' };
    }

    var visitorsData = null;   // последний ответ /stats/visitors
    var countryFilter = '';    // '' = все страны, иначе код ('RU', '??'...)

    // Кнопки-фильтр: «Все» + каждая страна, встретившаяся в списке, с числом IP.
    function renderCountryFilter() {
        var el = gid('countryFilter');
        if (!visitorsData || !visitorsData.visitors.length) { el.innerHTML = ''; return; }

        var byCode = new Map();
        visitorsData.visitors.forEach(function (v) {
            var c = countryOf(v.ip);
            var cur = byCode.get(c.code) || { name: c.name, flag: c.flag, n: 0 };
            cur.n++;
            byCode.set(c.code, cur);
        });
        if (countryFilter && !byCode.has(countryFilter)) countryFilter = '';

        var buttons = [...byCode.entries()]
            .sort(function (a, b) { return b[1].n - a[1].n; })
            .map(function (pair) {
                var code = pair[0], c = pair[1];
                return '<button data-country="' + esc(code) + '"' +
                    (countryFilter === code ? ' class="active"' : '') + '>' +
                    c.flag + ' ' + esc(c.name) + ' (' + c.n + ')</button>';
            });
        el.innerHTML = '<button data-country=""' + (countryFilter === '' ? ' class="active"' : '') +
            '>🌍 Все (' + visitorsData.visitors.length + ')</button>' + buttons.join('');

        el.querySelectorAll('button').forEach(function (b) {
            b.addEventListener('click', function () {
                countryFilter = b.dataset.country;
                renderCountryFilter();
                renderVisitorList();
            });
        });
    }

    // ---------- Сводка «что делал» ----------
    // Из событий собираем человеческий пересказ: какие тайтлы смотрел, какие
    // слова сохранял, учился ли, что искал. counts (если есть) — полные счётчики
    // с сервера: сессии в payload обрезаны, а числа должны быть честные.
    function buildDigest(events, counts) {
        var titles = [], words = [], queries = [];
        var reviews = 0, studies = 0, episodes = 0, saved = 0;
        events.forEach(function (e) {
            var p = String(e.page);
            if (e.event === 'play') {
                var t = p.split(' · эп ')[0];
                if (t && titles.indexOf(t) < 0) titles.push(t);
            } else if (e.event === 'episode_end') episodes++;
            else if (e.event === 'save_word') { saved++; if (words.indexOf(p) < 0) words.push(p); }
            else if (e.event === 'search') {
                var q = p.split(' → ')[0];
                if (q && queries.indexOf(q) < 0) queries.push(q);
            }
            else if (e.event === 'srs_review') reviews++;
            else if (e.event === 'study') studies++;
        });
        if (counts) {
            saved = counts.save_word || saved;
            episodes = counts.episode_end || episodes;
            studies = counts.study || studies;
            reviews = counts.srs_review || reviews;
        }

        function cut(arr, n) {
            var s = arr.slice(0, n).join(', ');
            return arr.length > n ? s + ' и ещё ' + (arr.length - n) : s;
        }

        var parts = [];
        if (titles.length) parts.push('▶ смотрел: ' + cut(titles, 2));
        if (episodes) parts.push('🏁 досмотрел серий: ' + episodes);
        if (saved) parts.push('💾 слова (' + saved + '): ' + cut(words, 4));
        if (studies) parts.push('📚 открывал повторение ×' + studies);
        if (reviews) parts.push('✅ закончил повторение ×' + reviews);
        if (queries.length) parts.push('🔎 искал: ' + cut(queries, 2));
        return parts;
    }

    // Сводка по посетителю: имена — из сессий, счётчики — из полных v.events.
    function visitorDigest(v) {
        var all = [];
        (v.sessions || []).forEach(function (s) { all = all.concat(s.events || []); });
        var counts = {};
        (v.events || []).forEach(function (e) { counts[e.event] = e.count; });
        var parts = buildDigest(all, counts);
        if (!parts.length) {
            // Ничего «продуктового» не делал — показываем, какие страницы листал.
            var top = (v.pages || []).slice(0, 3).map(function (p) {
                return (PAGE_LABELS[p.page] || p.page) + ' ×' + p.count;
            });
            return '<span class="dg dg--idle">👀 только листал: ' + esc(top.join(', ') || '—') + '</span>';
        }
        return parts.map(function (t) { return '<span class="dg">' + esc(t) + '</span>'; }).join('');
    }

    // Подряд идущие одинаковые события схлопываем в одно с «×N»:
    // 30 строк «смотрел Frieren» превращаются в «смотрел Frieren ×30 до 14:47».
    function collapseEvents(events) {
        var out = [];
        events.forEach(function (e) {
            var last = out[out.length - 1];
            if (last && last.event === e.event && last.page === e.page) {
                last.n++;
                last.to = e.at;
            } else {
                out.push({ at: e.at, to: e.at, event: e.event, page: e.page, n: 1 });
            }
        });
        return out;
    }

    // Одна сессия = один визит: итог одной строкой, краткий путь по страницам,
    // ниже — хронология действий (повторы схлопнуты, открытия страниц приглушены).
    function renderSession(s, idx) {
        var sum = buildDigest(s.events || [], null).join(' · ');
        var sumHtml = sum ? '<div class="session__sum">' + esc(sum) + '</div>' : '';

        // Путь по страницам: подряд идущие одинаковые страницы схлопываем, чтобы
        // маршрут читался (главная → каталог → плеер), а не «главная ×5».
        var pageSeq = [];
        (s.events || []).forEach(function (e) {
            if (e.event !== 'page') return;
            var lbl = PAGE_LABELS[e.page] || e.page;
            if (pageSeq[pageSeq.length - 1] !== lbl) pageSeq.push(lbl);
        });
        var path = pageSeq.length
            ? '<div class="session__path">' + pageSeq.map(function (x) { return '<b>' + esc(x) + '</b>'; }).join('<span class="arr">→</span>') + '</div>'
            : '';

        var collapsed = collapseEvents(s.events || []);
        var steps = collapsed.map(function (item) {
            var verb = EVENT_LABELS[item.event] || item.event;
            var rep = '';
            if (item.n > 1) {
                var to = fmtHM(item.to);
                rep = ' <span class="tl__rep">×' + item.n + (to !== fmtHM(item.at) ? ' до ' + to : '') + '</span>';
            }
            return '<li' + (item.event === 'page' ? ' class="pg"' : '') + '>' +
                '<span class="tl__time">' + fmtHM(item.at) + '</span>' +
                '<span class="tl__tag">' + esc(verb) + '</span>' +
                '<span class="tl__act">' + esc(detailText(item)) + rep + '</span></li>';
        }).join('');

        // Показываем дату конца, только если сессия перешла на другой день
        // (иначе — просто время конца; midnight-переход не теряет дату).
        var sameDay = fmtDate(s.start) === fmtDate(s.end);
        var range = fmtDate(s.start) + ' ' + fmtHM(s.start) + '–' +
            (sameDay ? '' : fmtDate(s.end) + ' ') + fmtHM(s.end);

        var dev = s.ua ? uaShort(s.ua) : String(s.visitorId || '—').slice(0, 8);
        return '<div class="session">' +
            '<div class="session__head">' +
                '<span class="session__n">Сессия #' + (idx + 1) + '</span>' +
                '<span class="session__dev" title="' + esc(s.ua || s.visitorId || '') + '">' + esc(dev) + '</span>' +
                '<span class="session__time">' + range + '</span>' +
                '<span class="session__count">' + (s.count || 0) + ' шаг.</span>' +
            '</div>' + sumHtml + path +
            // Подробную хронологию прячем под спойлер — на виду остаётся итог и путь,
            // чтобы «что делал» читалось сразу, а не тонуло в стене шагов.
            (steps ? '<details class="session__steps"><summary>▸ по шагам (' + collapsed.length + ')</summary><ul class="tl">' + steps + '</ul></details>' : '') +
            '</div>';
    }

    // Список посетителей с учётом фильтра по стране.
    function renderVisitorList() {
        if (!visitorsData) return;
        var data = visitorsData;

        var list = data.visitors.filter(function (v) {
            return !countryFilter || countryOf(v.ip).code === countryFilter;
        });

        var subEl = gid('visitors-sub');
        subEl.textContent = data.count + ' уникальных IP за ' + data.days + ' дн.' +
            (countryFilter ? ' · по фильтру: ' + list.length + '.' : '') +
            ' Клик по строке раскрывает сессии: итог, путь по страницам и действия по порядку.';

        if (!list.length) {
            gid('visitors').innerHTML = '<div class="msg">Пока нет данных</div>';
            return;
        }

        gid('visitors').innerHTML = list.map(function (v) {
            var sessions = (v.sessions || []);
            var body = sessions.length
                ? sessions.map(function (s, si) { return renderSession(s, si); }).join('')
                : '<div class="msg">Нет сессий</div>';

            // Устройства этого IP — короткие подписи из уникальных User-Agent'ов
            var devices = (v.uas || []).map(uaShort);
            devices = devices.filter(function (d, di) { return d && devices.indexOf(d) === di; });
            var devLine = devices.length
                ? '<span class="visitor__dev">' + devices.map(esc).join(' | ') + '</span>'
                : '';

            var g = geoCache[v.ip];
            var geoLine = g
                ? '<span class="visitor__geo" title="' + esc(g.isp || '') + '">' +
                  esc(g.flag + ' ' + g.country + (g.city ? ', ' + g.city : '')) + '</span>'
                : '<span class="visitor__geo"></span>';

            return '<div class="visitor">' +
                '<div class="visitor__head" onclick="this.parentNode.classList.toggle(\'open\')">' +
                '<span class="visitor__ip">' + esc(v.ip) + '</span>' +
                geoLine +
                '<span class="visitor__meta">' + (v.sessionCount != null ? v.sessionCount : sessions.length) + ' сессий · ' + v.hits + ' действий · ' +
                v.visitors + ' устр. · ' + fmtTime(v.firstSeen) + ' → ' + fmtTime(v.lastSeen) + '</span>' +
                devLine +
                '<span class="visitor__spacer"></span>' +
                '<span class="visitor__caret">путь</span>' +
                '<div class="visitor__digest">' + visitorDigest(v) + '</div>' +
                '</div>' +
                '<div class="visitor__body">' + body + '</div></div>';
        }).join('');
    }

    function renderVisitors(data) {
        visitorsData = data;
        renderCountryFilter();
        renderVisitorList();
        // Дотягиваем гео для новых IP и перерисовываем — появятся флаги и фильтр.
        prefetchGeo(data.visitors.map(function (v) { return v.ip; }), function () {
            renderCountryFilter();
            renderVisitorList();
        });
    }

    function load(days) {
        currentDays = days;
        root.querySelectorAll('.periods button[data-days]').forEach(function (b) {
            b.classList.toggle('active', Number(b.dataset.days) === days);
        });
        gid('sub').textContent = 'Загрузка…';

        var botsQ = showBots ? '&bots=1' : '';

        fetch(apiBase + '/api/v1/stats/summary?days=' + days + botsQ + keyQ(), { headers: statsAuth() })
            .then(requireKey)
            .then(render)
            .catch(function () {
                gid('sub').textContent = 'Не удалось загрузить статистику';
            });

        fetch(apiBase + '/api/v1/stats/visitors?days=' + days + botsQ + keyQ(), { headers: statsAuth() })
            .then(requireKey)
            .then(renderVisitors)
            .catch(function () {
                gid('visitors').innerHTML = '<div class="msg">Не удалось загрузить посетителей</div>';
            });
    }

    // Недельная петля «смотрел + повторял»: главная продуктовая метрика.
    // Абсолютные числа и поимённый список — не проценты (людей пока десятки).
    function renderWeekly(data) {
        var el = gid('weekly');
        if (!data.rows || !data.rows.length) {
            el.innerHTML = '<div class="msg">Пока нет данных</div>';
            return;
        }
        var rows = data.rows.map(function (r) {
            var who = r.users.filter(function (u) { return u.both; }).map(function (u) {
                return esc(u.email) + ' (' + u.watched + '▶ ' + u.reviewed + '📚)';
            }).join(', ');
            return '<tr><td>' + r.week + '</td><td class="num">' + fmt(r.watched) +
                '</td><td class="num">' + fmt(r.reviewed) +
                '</td><td class="num"><b>' + fmt(r.both) + '</b></td><td>' + (who || '—') + '</td></tr>';
        }).join('');
        el.innerHTML =
            '<table><thead><tr><th>Неделя</th><th class="num">Смотрели</th>' +
            '<th class="num">Повторяли</th><th class="num">Оба</th><th>Кто (оба)</th></tr></thead><tbody>' +
            rows + '</tbody></table>';
    }

    fetch(apiBase + '/api/v1/stats/weekly?weeks=8' + keyQ(), { headers: statsAuth() })
        .then(requireKey)
        .then(renderWeekly)
        .catch(function () {
            gid('weekly').innerHTML = '<div class="msg">Не удалось загрузить</div>';
        });

    // Здоровье сервиса: сводку пишет cron на VPS (healthcheck.sh) в
    // /static/health-status.json — API, каталог, словарь, News + возраст бэкапа.
    fetch('/static/health-status.json?ts=' + Date.now())
        .then(function (r) { return r.json(); })
        .then(function (h) {
            var names = { health: 'API+БД', popular: 'Каталог', dictionary: 'Словарь', news: 'News' };
            var chips = Object.keys(h.checks || {}).map(function (k) {
                var ok = h.checks[k] === 'ok';
                return '<button style="cursor:default;border-color:' + (ok ? '#2e7d32' : '#c62828') + '">' +
                    (ok ? '✅ ' : '🔴 ') + (names[k] || k) + '</button>';
            }).join('');
            var bk = (h.backupAgeHours != null && h.backupAgeHours >= 0)
                ? '💾 бэкап ' + h.backupAgeHours + ' ч назад' : '💾 бэкапа нет';
            chips += '<button style="cursor:default">' + bk + '</button>';
            gid('health').innerHTML = chips;
            gid('health-sub').textContent =
                'Проверка каждые 15 мин · последняя: ' + new Date(h.at).toLocaleString('ru-RU') +
                (h.overall === 'ok' ? '' : ' · ЕСТЬ ПРОБЛЕМЫ');
        })
        .catch(function () {
            gid('health-sub').textContent = 'Статус недоступен (cron ещё не отработал?)';
        });

    // Период (7/30/90 дней)
    root.querySelectorAll('.periods button[data-days]').forEach(function (b) {
        b.addEventListener('click', function () { load(Number(b.dataset.days)); });
    });

    // Фильтр люди / боты
    function setBots(on) {
        showBots = on;
        gid('humansBtn').classList.toggle('active', !on);
        gid('allBtn').classList.toggle('active', on);
        load(currentDays);
    }
    gid('humansBtn').addEventListener('click', function () { setBots(false); });
    gid('allBtn').addEventListener('click', function () { setBots(true); });

    load(30);
            })();
        }
    };
})();
