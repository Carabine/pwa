// Виджет статистики — монтируется в контейнер (в админке, без отдельной страницы
// и без iframe). Вся вёрстка/логика перенесены из бывшей stats.html; DOM-запросы
// scoped к root (gid/root.querySelectorAll), поэтому id/классы не конфликтуют с
// хост-страницей. Доступ — по сессии админа (Bearer) или ключу STATS_KEY.
(function () {
    var CSS = ".statsview .wrap { max-width: 900px; margin: 0 auto; }\n.statsview h1 { font-size: 22px; margin: 0 0 4px; }\n.statsview .sub { color: var(--muted); font-size: 13px; margin-bottom: 20px; }\n.statsview .periods { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }\n.statsview .periods button { background: var(--card); color: var(--text); border: 1px solid var(--border);\n        padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; }\n.statsview .periods button.active { background: var(--accent); border-color: var(--accent); color: #0f1115; font-weight: 600; }\n.statsview .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 28px; }\n.statsview .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }\n.statsview .card .label { color: var(--muted); font-size: 12px; margin-bottom: 6px; }\n.statsview .card .value { font-size: 28px; font-weight: 700; }\n.statsview .section-title { font-size: 15px; margin: 0 0 12px; color: var(--text); }\n.statsview .chart { display: flex; align-items: flex-end; gap: 3px; height: 180px; padding: 12px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow-x: auto; }\n.statsview .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-width: 16px; flex: 1; height: 100%; }\n.statsview .bar { width: 70%; background: var(--accent); border-radius: 3px 3px 0 0; min-height: 2px; transition: height .2s; }\n.statsview .bar.empty { background: var(--accent2); }\n.statsview .bar-date { color: var(--muted); font-size: 9px; margin-top: 6px; white-space: nowrap; transform: rotate(-60deg); transform-origin: center; height: 28px; }\n.statsview table { width: 100%; border-collapse: collapse; margin-top: 28px; background: var(--card); border-radius: 12px; overflow: hidden; }\n.statsview th, .statsview td { text-align: left; padding: 10px 14px; font-size: 13px; border-bottom: 1px solid var(--border); }\n.statsview th { color: var(--muted); font-weight: 500; background: var(--card2); }\n.statsview td.num, .statsview th.num { text-align: right; }\n.statsview .pct { color: var(--muted); font-size: 11px; }\n.statsview tr:last-child td { border-bottom: none; }\n.statsview .msg { color: var(--muted); padding: 40px 0; text-align: center; }\n.statsview .visitor { background: var(--card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 10px; overflow: hidden; }\n.statsview .visitor__head { display: flex; align-items: center; gap: 12px; padding: 12px 14px; cursor: pointer; flex-wrap: wrap; }\n.statsview .visitor__head:hover { background: var(--card2); }\n.statsview .visitor__ip { font-weight: 600; font-size: 14px; font-family: ui-monospace, monospace; }\n.statsview .visitor__meta { color: var(--muted); font-size: 12px; }\n.statsview .visitor__spacer { flex: 1; }\n.statsview .visitor__caret { color: var(--accent); font-size: 12px; white-space: nowrap; }\n.statsview .visitor__caret::after { content: ' ▾'; display: inline-block; transition: transform .15s; }\n.statsview .visitor.open .visitor__caret::after { transform: rotate(180deg); }\n.statsview .visitor__geo { color: var(--muted); font-size: 12px; }\n.statsview .visitor__dev { color: var(--muted); font-size: 11px; }\n.statsview .visitor__body { display: none; padding: 4px 14px 14px; border-top: 1px solid var(--border); }\n.statsview .visitor.open .visitor__body { display: block; }\n.statsview /* Сводка «что делал» — вторая строка шапки посетителя, .statsview чипы по типам действий */\n    .visitor__digest { width: 100%; font-size: 12px; line-height: 2; }\n.statsview .visitor__digest .dg { background: var(--card2); border: 1px solid var(--border); color: var(--text);\n        padding: 2px 9px; border-radius: 20px; margin-right: 6px; display: inline-block;\n        max-width: 100%; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }\n.statsview .visitor__digest .dg--idle { color: var(--muted); }\n.statsview .tl { list-style: none; margin: 8px 0 0; padding: 0; }\n.statsview .tl li { display: flex; gap: 10px; padding: 5px 0; font-size: 12px; border-bottom: 1px solid var(--border); }\n.statsview .tl li:last-child { border-bottom: none; }\n.statsview .tl__time { color: var(--muted); white-space: nowrap; min-width: 54px; }\n.statsview .tl__act { color: var(--text); word-break: break-word; }\n.statsview .tl__tag { display: inline-block; min-width: 92px; color: var(--accent); }\n.statsview /* Открытия страниц приглушаем — глаз цепляется за реальные действия */\n    .tl li.pg .tl__tag, .statsview .tl li.pg .tl__act { color: var(--muted); }\n.statsview .tl__rep { color: var(--accent); white-space: nowrap; }\n.statsview /* Сессии посетителя: каждая — отдельный визит с путём (что куда нажимал). */\n    .session { border: 1px solid var(--border); border-radius: 10px; margin: 10px 0; overflow: hidden; }\n.statsview .session__head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; padding: 8px 12px; background: var(--card2); font-size: 12px; }\n.statsview .session__n { font-weight: 600; color: var(--text); }\n.statsview .session__dev { color: var(--muted); font-size: 11px; }\n.statsview .session__time { color: var(--muted); }\n.statsview .session__count { color: var(--accent); margin-left: auto; white-space: nowrap; }\n.statsview .session .tl { margin: 0; padding: 4px 12px 8px; }\n.statsview /* Итог сессии одной строкой: что реально сделал за визит */\n    .session__sum { padding: 8px 12px 0; font-size: 12px; color: var(--text); line-height: 1.6; }\n.statsview /* Стрелка-путь: краткий маршрут по страницам вверху сессии */\n    .session__path { padding: 8px 12px 0; font-size: 12px; color: var(--muted); line-height: 1.7; }\n.statsview .session__path b { color: var(--text); font-weight: 500; }\n.statsview .session__path .arr { color: var(--accent2); margin: 0 5px; }\n.statsview /* Ворота ключа: инлайн-поле вместо window.prompt (в PWA prompt ненадёжен). */\n    .key-gate { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(10, 12, 16, 0.94); padding: 20px; }\n.statsview .key-gate[hidden] { display: none; }\n.statsview .key-gate__box { width: 100%; max-width: 340px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 22px; display: flex; flex-direction: column; gap: 12px; }\n.statsview .key-gate__title { font-size: 18px; font-weight: 700; }\n.statsview .key-gate__hint { color: var(--muted); font-size: 13px; margin-top: -8px; }\n.statsview .key-gate__input { width: 100%; padding: 12px 14px; font-size: 16px; border-radius: 10px; border: 1px solid var(--border); background: var(--card2); color: var(--text); }\n.statsview .key-gate__input:focus { outline: none; border-color: var(--accent); }\n.statsview .key-gate__btn { padding: 12px; font-size: 15px; font-weight: 600; border: none; border-radius: 10px; background: var(--accent); color: #0f1115; cursor: pointer; }\n.statsview .key-gate__err { color: #ff7b7b; font-size: 13px; }\n.statsview /* Что посетитель собрал: у гостя это единственный след — слова из его же событий */\n    .vwords { margin: 6px 0 10px; font-size: 12px; }\n.statsview .vwords__head { color: var(--muted); margin-bottom: 6px; }\n.statsview .vwords__head i { opacity: .75; }\n.statsview .vwords__chip { display: inline-block; background: var(--card2); border: 1px solid var(--border);\n        border-radius: 20px; padding: 2px 9px; margin: 0 6px 6px 0; }\n.statsview .vwords__chip span { color: var(--muted); }\n.statsview .vwords details { display: inline; }\n.statsview .vwords summary { display: inline-block; cursor: pointer; color: var(--accent); margin-bottom: 6px; }\n.statsview .vwords details.gdeck { display: block; margin: 0 0 6px; }\n.statsview .gdeck summary { color: var(--text); }";
    var MARKUP = '<div class="wrap">\n    <h1>Статистика Animei</h1>\n    <div class="sub" id="sub">Загрузка…</div>\n\n    <div class="periods">\n        <button data-days="7">7 дней</button>\n        <button data-days="30" class="active">30 дней</button>\n        <button data-days="90">90 дней</button>\n    </div>\n\n    <div class="periods" id="botFilter">\n        <button id="humansBtn" class="active">👤 Только люди</button>\n        <button id="allBtn">🤖 Показать ботов</button>\n    </div>\n\n    <div class="cards" id="cards"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Здоровье сервиса</h2>\n    <div class="sub" id="health-sub"></div>\n    <div class="periods" id="health"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Петля по неделям: смотрел + повторял</h2>\n    <div class="sub">Вошедшие пользователи · неделя с понедельника · «оба» — и смотрел аниме, и завершил повторение</div>\n    <div id="weekly"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Открытия по дням</h2>\n    <div class="chart" id="chart"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Топ страниц</h2>\n    <div id="pages"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Источники</h2>\n    <div class="sub">Откуда пришли: метка ?r= / utm_source из ссылки, иначе домен реферера, иначе «direct». Воронка считается по новым устройствам источника: дошли до приложения → сделали что-то настоящее → зарегистрировались</div>\n    <div id="sources"></div>\n\n    <h2 class="section-title" style="margin-top:28px">Посетители</h2>\n    <div class="sub" id="visitors-sub"></div>\n    <div class="periods" id="countryFilter"></div>\n    <div id="visitors"></div>\n</div>\n\n<div id="keyGate" class="key-gate" hidden>\n    <form class="key-gate__box" id="keyForm">\n        <div class="key-gate__title">🔑 Ключ владельца</div>\n        <div class="key-gate__hint">Введите ключ, чтобы открыть статистику</div>\n        <input id="keyInput" class="key-gate__input" type="text" inputmode="text"\n               autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false"\n               placeholder="ключ">\n        <button type="submit" class="key-gate__btn">Открыть</button>\n        <div class="key-gate__err" id="keyErr" hidden>Неверный ключ — попробуй ещё раз</div>\n    </form>\n</div>';
    window.StatsView = {
        mount: function (root) {
            if (!root || root.__statsMounted) return;
            root.__statsMounted = true;
            if (!document.getElementById('statsview-css')) {
                var st = document.createElement('style');
                st.id = 'statsview-css'; st.textContent = CSS +
                    '\n.statsview .story { list-style: none; margin: 4px 0 0; padding: 4px 12px 10px; }' +
                    '\n.statsview .story__row { display: flex; gap: 10px; align-items: baseline; padding: 5px 0; border-bottom: 1px solid var(--border); font-size: 13px; }' +
                    '\n.statsview .story__row:last-child { border-bottom: none; }' +
                    '\n.statsview .story__time { color: var(--muted); font-size: 11.5px; min-width: 42px; }' +
                    '\n.statsview .story__icon { width: 18px; text-align: center; flex-shrink: 0; }' +
                    '\n.statsview .story__body { flex: 1; min-width: 0; }' +
                    '\n.statsview .story__body b { font-weight: 600; }' +
                    '\n.statsview .story__dur { color: var(--accent); font-style: normal; font-size: 11.5px; }' +
                    '\n.statsview .story__sub { display: block; color: var(--muted); font-size: 11.5px; line-height: 1.5; word-break: break-word; }' +
                    '\n.statsview .story__row--sub { padding-left: 26px; }' +
                    '\n.statsview .story__row--sub .story__time { opacity: .55; }' +
                    '\n.statsview .story__row--dim { opacity: .62; }' +
                    '\n.statsview .story__warn { color: #ffb4b4; font-weight: 600; }' +
                    '\n.statsview .session__src { color: var(--accent2); font-size: 11.5px; }' +
                    '\n.statsview .session__steps { margin: 0; }' +
                    '\n.statsview .session__steps > summary { list-style: none; cursor: pointer; padding: 8px 12px; color: var(--muted); font-size: 12px; user-select: none; }' +
                    '\n.statsview .session__steps > summary::-webkit-details-marker { display: none; }' +
                    '\n.statsview .session__steps[open] > summary { color: var(--accent); }' +
                    '\n.statsview .session__steps > summary:hover { color: var(--text); }' +
                    // Скролл-обёртка таблиц: на телефоне широкая таблица едет по
                    // горизонтали внутри неё, а не распирает страницу.
                    '\n.statsview .tblwrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 28px; border: 1px solid var(--border); border-radius: 12px; }' +
                    '\n.statsview .tblwrap table { margin-top: 0; border-radius: 0; }' +
                    '\n@media (max-width: 640px) {' +
                    '\n.statsview .cards { grid-template-columns: repeat(2, 1fr); gap: 8px; }' +
                    '\n.statsview .card { padding: 12px; }' +
                    '\n.statsview .card .value { font-size: 22px; }' +
                    '\n.statsview th, .statsview td { padding: 8px 10px; font-size: 12px; }' +
                    '\n.statsview td { word-break: break-word; }' +
                    '\n.statsview .tl__tag { min-width: 70px; }' +
                    '\n.statsview .visitor__head { padding: 10px 12px; gap: 8px; }' +
                    '\n.statsview .chart { height: 150px; }' +
                    '\n.statsview .periods button { flex: 1 1 auto; padding: 10px 8px; }' +
                    '\n.statsview .session__head { gap: 4px 10px; }' +
                    '\n.statsview .pct { display: block; }' +
                    '\n}';
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
            'За ' + data.days + ' дн. · ' + mode + hidden + ' · ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        gid('cards').innerHTML =
            card('Открытий', data.totalHits) +
            card('Людей', data.totalVisitors) +
            card('Откр. сегодня', data.today.hits) +
            card('Людей сегодня', data.today.visitors);

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
                return '<tr><td>' + esc(PAGE_LABELS[p.page] || p.page) + '</td><td class="num">' + fmt(p.hits) +
                       '</td><td class="num">' + fmt(p.visitors) + '</td></tr>';
            }).join('');
            gid('pages').innerHTML =
                '<div class="tblwrap"><table><thead><tr><th>Страница</th><th class="num">Открытий</th><th class="num">Людей</th></tr></thead><tbody>' +
                rows + '</tbody></table></div>';
        }

        // Источники: событие 'ref' — один раз на визит, значение utm_source/домен
        var sources = data.topSources || [];
        if (!sources.length) {
            gid('sources').innerHTML = '<div class="msg">Пока нет данных</div>';
        } else {
            // Воронка — по устройствам, для которых источник был ПЕРВЫМ за окно.
            var srows = sources.map(function (s) {
                var n = s.firstTouch || 0;
                function step(v) {
                    return fmt(v) + (n && v ? ' <span class="pct">' + Math.round(v / n * 100) + '%</span>' : '');
                }
                return '<tr><td title="' + esc(s.source) + '">' + esc(srcName(s.source)) +
                       '</td><td class="num">' + fmt(n) + '</td><td class="num">' + step(s.app || 0) +
                       '</td><td class="num">' + step(s.active || 0) + '</td><td class="num">' + step(s.registered || 0) + '</td></tr>';
            }).join('');
            gid('sources').innerHTML =
                '<div class="tblwrap"><table><thead><tr><th>Откуда</th>' +
                '<th class="num" title="Устройства, для которых этот источник — первый за период">Новые</th>' +
                '<th class="num" title="Открыли приложение (не только лендинг)">В прил.</th>' +
                '<th class="num" title="Включили серию, сохранили слово или открыли повторение">Делали</th>' +
                '<th class="num" title="Зарегистрировались">Рег.</th></tr></thead><tbody>' +
                srows + '</tbody></table></div>';
        }
    }

    // Человеческие названия действий и страниц для таймлайна.
    var EVENT_LABELS = {
        page: 'открыл', session: 'вошёл', save_word: 'сохранил слово', play: 'смотрел',
        study: 'учил', search: 'искал', voiceover: 'озвучка', chibi_hidden: 'скрыл доп.',
        autosync: 'автосинк', explain: 'разбор', onboarding: 'онбординг',
        setting: 'настройка', password_change: 'сменил пароль',
        srs_review: 'повторил', resume: 'продолжил', session_card: 'итог сессии',
        episode_end: 'досмотрел серию', daily_plan: 'план дня', catalog: 'каталог',
        // Было без подписей, хотя события шлются давно:
        install: 'установка', beginner_deck: 'колода новичка', episode_deck: 'колода серии',
        known_word: 'уже знаю', known_pick: 'разбор известных', streak_milestone: 'рубеж стрика',
        // Фичи, появившиеся после первой версии статистики:
        deck: 'колода', words_bulk: 'массово в словаре', anki_export: 'экспорт Anki',
        known_import: 'импорт известных', tts: 'озвучка карточки', clip_recut: 'пересобрал клип',
        subs_precise: 'точный подбор сабов', subs_missing: 'НЕТ СУБТИТРОВ',
        video_error: 'ВИДЕО НЕ ПОШЛО', offline: 'офлайн', auth: 'аккаунт',
        ref: 'пришёл', leave: 'вышел из приложения', return: 'вернулся',
        // Лендинг: клики по кнопкам и демо-плеер (data-stat в landing/*.html)
        cta_header: 'кнопка в шапке', cta_hero: 'кнопка на первом экране',
        cta_hero_deck: 'кнопка «колода» на первом экране', cta_final: 'кнопка внизу',
        cta_install: 'кнопка «установить»', cta_webapp_header: 'кнопка в шапке (webapp)',
        cta_webapp_hero: 'кнопка на первом экране (webapp)', cta_webapp_final: 'кнопка внизу (webapp)',
        cta_companion_header: 'кнопка «расширение»', cta_support_header: 'кнопка «поддержка»',
        cta_privacy_header: 'кнопка «политика»', demo_to_study: 'из демо в приложение',
        demo_play: 'включил демо', demo_word_click: 'клик по слову в демо',
        demo_word_saved: 'сохранил слово из демо',
        demo_autoplay: 'демо само заиграло (телефон)', demo_unmute: 'включил звук в демо',
        // Подписи, добавленные 04.10.2026 (события шли без них):
        human: 'живой человек (служебное)', learn_lang: 'язык изучения',
        offline_all: 'скачать всё для офлайна', word_freeze: 'заморозка слова', words_delete: 'удалил слова',
        kanji_session: 'прописи: занятие', kanji_write: 'прописи: иероглиф',
        news_open: 'открыл JP News', news_story: 'читал историю', news_done: 'дочитал историю',
        news_quiz: 'тест к истории', news_word_saved: 'слово из новости',
        subs_segments: 'сабы: кусочный сдвиг', subs_refsync: 'сабы: синк по источнику',
        word_open: 'открыл слово', word_skip: 'закрыл слово без сохранения',
        hint: 'подсказка в плеере'
    };
    var PAGE_LABELS = {
        'app/index': 'главная', 'app/catalog': 'каталог', 'app/player': 'плеер',
        'app/watch': 'свой файл', 'app/words': 'словарь', 'app/study': 'повторение',
        'app/custom-study': 'своя учёба', 'app/beginner': 'для новичка',
        'app/settings': 'настройки', 'app/login': 'вход', 'app/feedback': 'отзыв',
        'app/stats': 'статистика', 'landing/index': 'лендинг',
        'app/progress': 'прогресс', 'app/apps': 'приложения', 'app/deck-study': 'колода', 'app/reset': 'сброс пароля',
        'landing/webapp': 'лендинг · веб', 'landing/companion': 'лендинг · расширение',
        'landing/support': 'лендинг · поддержка', 'landing/privacy': 'лендинг · политика',
        'app/news': 'JP News', 'app/news-story': 'JP News · история', 'app/kanji': 'прописи',
        'app/street/walk': 'улица слов'
    };
    var KANJI_GO = { review: 'повторение', learn: 'новые иероглифы' };
    var KANJI_SCOPE = { all: 'все слова', deck: 'колода' };
    // Настройки (js/settings.js DEFAULTS + язык интерфейса) — по-человечески.
    var SETTING_LABELS = {
        theme: 'тема', subSize: 'размер субтитров', playerTranslation: 'перевод в субтитрах',
        autoSyncSubs: 'автоподгон субтитров', autopause: 'пауза после реплики', loopClips: 'повтор клипов',
        newPerDay: 'новых карточек в день', studyTranscription: 'транскрипция',
        studySentenceRomaji: 'ромадзи над фразой', studyAutoplayClip: 'автозапуск клипа',
        learnLang: 'язык изучения', language: 'язык интерфейса'
    };
    var SETTING_VALUES = {
        'true': 'вкл', 'false': 'выкл', kana: 'кана', romaji: 'ромадзи', dark: 'тёмная', light: 'светлая',
        system: 'как в системе', sm: 'мелкий', md: 'средний', lg: 'крупный', ja: 'японский', en: 'английский',
        ru: 'русский', uk: 'украинский'
    };
    var KANJI_GRADE = { easy: 'легко', good: 'хорошо', hard: 'трудно', again: 'не вышло' };
    // Реферер-приложения приходят именем пакета — показываем по-человечески.
    // Метки ?r=rd-<код> из _promo/posts/reddit-ladder.md → имя сабреддита.
    var REDDIT_SUBS = {
        novice: 'LearnJapaneseNovice', learnjapanese: 'LearnJapanese', sideproject: 'SideProject',
        webdev: 'webdev', javascript: 'javascript', pwa: 'PWA', jpres: 'JapaneseResources', ajatt: 'ajatt',
        refold: 'Refold', anki: 'Anki', iib: 'InternetIsBeautiful', wanikani: 'WaniKani',
        abu: 'alphaandbetausers', ih: 'indiehackers', languagelearning: 'languagelearning'
    };
    function srcName(src) {
        var s = String(src || '').replace(/^www\./, '');
        var rd = s.match(/^reddit_(.+)$/);
        if (rd) return 'reddit · r/' + (REDDIT_SUBS[rd[1]] || rd[1]);
        // ?r=seo-<страница> — кнопка на SEO-странице лендинга (/en/anime/<тайтл>/, /en/phrases/…)
        var seo = s.match(/^seo-(.+)$/);
        if (seo) return 'SEO · ' + seo[1].replace(/^phrase-/, 'фраза ').replace(/-hub$/, ' (список)');
        if (/googlequicksearchbox|^com\.google\.android/.test(s)) return 'google app';
        if (/telegram/.test(s)) return 'telegram';
        if (/^(android-app|com|org)\./.test(s)) return s.split('.').slice(-1)[0];
        return s.replace(/\.com$/, '');
    }
    var STUDY_LABELS = { srs: 'повторение', cram: 'зубрёжка' };
    // Подсказки в плеере (v0.0.696): показ и крестик; нажатие видно по word_open / episode_deck
    var HINT_LABELS = {
        'word:shown': 'увидел подсказку «нажми на слово»', 'word:close': 'закрыл подсказку «нажми на слово»',
        'deck:shown': 'увидел подсказку «Авто-колода»', 'deck:close': 'закрыл подсказку «Авто-колода»'
    };

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
            case 'words_bulk': {
                var mb = p.match(/^(to_deck|from_deck|delete):(\d+)$/);
                if (!mb) return p;
                if (mb[1] === 'to_deck') return 'отправил ' + mb[2] + ' сл. в колоду';
                if (mb[1] === 'from_deck') return 'убрал ' + mb[2] + ' сл. из колоды';
                return 'удалил ' + mb[2] + ' сл.';
            }
            case 'anki_export': {
                var ma = p.match(/^(video|audio):(\d+)$/);
                return ma ? ('выгрузил ' + ma[2] + ' карт. ' + (ma[1] === 'video' ? 'с видео' : 'со звуком')) : p;
            }
            case 'known_import': return 'добавил ' + p + ' известных слов';
            case 'deck': return p === 'create' ? 'создал колоду' : p;
            case 'beginner_deck': {
                if (p === 'core') return '15 сцен с видео';
                if (p === 'full') return 'все 50 слов';
                if (p === 'anime_search') return 'искал своё аниме';
                var mbd = p.match(/^anime_(created|scan):(.+)$/);
                if (mbd) return mbd[1] === 'created' ? ('собрал колоду: ' + mbd[2] + ' сл.') : ('сканировал серии (' + mbd[2] + ')');
                return p;
            }
            case 'tts': return 'озвучил карточку';
            case 'clip_recut': return 'пересобрал клип';
            case 'subs_precise':
                return { ok: 'точный подбор помог', consensus: 'сдвиг взят у соседних серий',
                    wrong_file: 'файл оказался от другой серии', 'no-match': 'совпадений не нашлось',
                    lost: 'подбор оборвался', busy: 'подбор был занят' }[p] || p;
            case 'subs_missing': return 'субтитров нет: ' + p;
            case 'video_error': return 'видео не поднялось (' + p + ')';
            case 'offline': return p === 'on' ? 'потерял сеть' : 'сеть вернулась';
            case 'leave': return PAGE_LABELS[p] ? 'со страницы «' + PAGE_LABELS[p] + '»' : '';
            case 'return': return 'через ' + awayText(p);
            case 'auth':
                return { login: 'вошёл', register: 'зарегистрировался', logout: 'вышел',
                    forgot_request: 'запросил сброс пароля', forgot_done: 'сбросил пароль',
                    login_google: 'вошёл через Google', register_google: 'зарегистрировался через Google' }[p] || p;
            case 'install':
                return { installed: 'приложение установлено', click: 'нажал «установить»', accepted: 'согласился установить',
                    dismissed: 'отказался от установки', dismiss: 'закрыл предложение установить' }[p] || p;
            case 'explain':
                return { player: 'из плеера', player_cue: 'из списка реплик' }[p] || (p === '-' ? '' : p);
            case 'episode_deck': {
                var me = p.match(/^(anime_)?(open|created):(\d+)$/);
                if (!me) return p;
                var whole = me[1] ? ' (по всему аниме)' : '';
                return me[2] === 'open' ? 'открыл подбор колоды' + whole + ': ' + me[3] + ' сл.' : 'собрал колоду' + whole + ': ' + me[3] + ' сл.';
            }
            case 'hint': return HINT_LABELS[p] || p;
            case 'learn_lang': return { ja: 'японский', en: 'английский' }[p] || p;
            case 'kanji_session': {
                var mk = p.split(':');
                return (KANJI_GO[mk[1]] || mk[1] || '') + (mk[0] ? ' (' + (KANJI_SCOPE[mk[0]] || mk[0]) + ')' : '');
            }
            case 'kanji_write': return KANJI_GRADE[p] || p;
            case 'word_freeze': return p === 'on' ? 'заморозил слово' : 'разморозил слово';
            case 'words_delete': return 'удалил ' + p + ' сл.';
            case 'offline_all': return 'начал скачивать всё для офлайна';
            case 'subs_segments': case 'subs_refsync': return p + ' кус.';
            case 'news_open': return p === '-' || p === '[object Object]' ? '' : 'выпуск ' + p;
            case 'news_story': case 'news_done': case 'news_quiz': case 'news_word_saved':
                return p === '[object Object]' ? '' : p;   // до 04.10.2026 детали терялись
            case 'setting': {
                var i = p.indexOf(':'), k = i < 0 ? p : p.slice(0, i), v = i < 0 ? '' : p.slice(i + 1);
                return (SETTING_LABELS[k] || k) + (v ? ' → ' + (SETTING_VALUES[v] || v) : '');
            }
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
        // Кэш пишем один раз после всей пачки, а не после каждого IP —
        // иначе N сериализаций растущего словаря подряд.
        function finish() {
            try { localStorage.setItem(GEO_LS, JSON.stringify(geoCache)); } catch (e) {}
            done();
        }
        Promise.all([worker(), worker(), worker(), worker()]).then(finish, finish);
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

    // ---------- Путь по приложению: шаг за шагом ----------
    // Сырой лог читать нельзя: одно открытие страницы даёт три записи
    // (ref + session + page), «увидел кнопку продолжить» стоит наравне с
    // сохранением слова, а смена серии внутри плеера каждый раз повторяет
    // «открыл плеер». Здесь оставляем КАЖДОЕ осмысленное действие отдельным
    // шагом (это и есть путь), но пишем его человеческой фразой, выбрасываем
    // техническую шелуху и схлопываем подряд идущие одинаковые шаги.
    var STEP_SKIP = {
        ref: 1, session: 1,                   // техника открытия страницы
        install: 1, chibi_hidden: 1, daily_plan: 1, streak_milestone: 1, onboarding: 1,
        // Больше не шлются (показы/автоматика/дубли страниц), но лежат в старых данных:
        autosync: 1, offline: 1, password_change: 1, progress: 1
    };
    // Шаги, которые относятся к текущему просмотру — рисуем с отступом.
    var UNDER_WATCH = {
        voiceover: 1, subs_missing: 1, subs_precise: 1, autosync: 1,
        video_error: 1, resume: 1, episode_end: 1, explain: 1, tts: 1, clip_recut: 1, hint: 1
    };

    function mmss(sec) {
        var n = Math.max(0, Math.round(Number(sec) || 0));
        var m = Math.floor(n / 60), r = n % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    // Длительность шага — только осмысленная (от минуты).
    function durText(from, to) {
        var ms = new Date(to) - new Date(from);
        if (!isFinite(ms) || ms < 60000) return '';
        var min = Math.round(ms / 60000);
        if (min < 60) return min + ' мин';
        return (min / 60).toFixed(1).replace('.0', '') + ' ч';
    }

    // В деталях событий встречаются HTML-сущности: название дорожки клиент шлёт
    // как оно стоит в разметке («Anku &amp; mutagenb»). Разворачиваем перед показом.
    function deent(x) {
        return String(x).replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }

    // Одно событие → один человеческий шаг: { icon, text, under }.
    // null — шаг не показываем (мусор или показ интерфейса, а не действие).
    function stepOf(ev, p) {
        switch (ev) {
            case 'page': return { icon: '📄', text: 'перешёл: ' + (PAGE_LABELS[p] || p), page: p, dim: true };
            case 'play': {
                var t = p.split(' · эп ')[0], ep = p.split(' · эп ')[1] || '';
                return { icon: '▶', text: 'включил ' + deent(t) + (ep ? ' · эп ' + ep : ''), watch: true };
            }
            case 'voiceover': return { icon: '🎧', text: 'дорожка: ' + deent(p) };
            case 'subs_missing': return { icon: '⚠', text: 'субтитров к серии не нашлось', warn: true };
            case 'video_error': return { icon: '⚠', text: 'видео не поднялось (' + p + ')', warn: true };
            case 'episode_end': return { icon: '🏁', text: 'досмотрел серию' };
            case 'resume':
                if (p.indexOf('seek:') === 0) return { icon: '⏩', text: 'перемотал на ' + mmss(p.slice(5)) };
                if (p === 'click') return { icon: '⏩', text: 'нажал «продолжить»' };
                return null;                       // «увидел кнопку» — не действие
            case 'autosync': return { icon: '🎚', text: 'подгонял субтитры: ' + detailText({ event: ev, page: p }) };
            case 'subs_precise': return { icon: '🎚', text: detailText({ event: ev, page: p }) };
            case 'save_word': return { icon: '💾', text: 'сохранил слово ' + p, key: 'save' };
            case 'word_open': return { icon: '👆', text: 'открыл слово ' + p, dim: true };
            case 'hint': return { icon: '💬', text: HINT_LABELS[p] || 'подсказка: ' + p, dim: true };
            case 'word_skip': return { icon: '↩', text: 'закрыл слово ' + p + ' без сохранения', dim: true };
            case 'known_word': return { icon: '✅', text: 'отметил «уже знаю»: ' + p, key: 'known' };
            case 'explain': {
                var ex = detailText({ event: ev, page: p });
                return { icon: '💡', text: 'открыл разбор' + (ex ? ' ' + ex : '') };
            }
            case 'tts': return { icon: '🔊', text: 'озвучил карточку' };
            case 'clip_recut': return { icon: '✂️', text: 'пересобрал клип' };
            case 'search': return { icon: '🔎', text: 'искал ' + detailText({ event: ev, page: p }) };
            case 'catalog': return { icon: '📚', text: 'каталог: ' + p };
            case 'study': return { icon: '📚', text: 'открыл ' + (STUDY_LABELS[p] || p) };
            case 'srs_review':
                return p === 'graduated'
                    ? { icon: '🎓', text: 'закончил повторение' }
                    : { icon: '🔁', text: 'прошёл карточку' + (p && p !== '-' ? ' ' + p : '') };
            case 'session_card':
                if (/_shown/.test(p)) return null;  // показ карточки, а не действие (старые данные)
                return { icon: '🧾', text: detailText({ event: ev, page: p }), dim: true };
            case 'beginner_deck': return { icon: '🌱', text: 'колода новичка: ' + detailText({ event: ev, page: p }) };
            case 'episode_deck': return { icon: '🗂', text: 'колода из серии: ' + detailText({ event: ev, page: p }) };
            case 'deck': return { icon: '🗂', text: detailText({ event: ev, page: p }) };
            case 'words_bulk': return { icon: '✏️', text: detailText({ event: ev, page: p }) };
            case 'anki_export': return { icon: '📤', text: detailText({ event: ev, page: p }) };
            case 'known_import': return { icon: '📥', text: detailText({ event: ev, page: p }) };
            case 'auth': return { icon: '🔑', text: detailText({ event: ev, page: p }) };
            case 'setting': return { icon: '⚙️', text: 'настройка: ' + detailText({ event: ev, page: p }) };
            case 'password_change': return { icon: '🔑', text: 'сменил пароль' };
            case 'human': return null;           // служебная отметка «не бот», не действие
            case 'news_open': case 'news_story': case 'news_done': case 'news_quiz': case 'news_word_saved': {
                var nd = detailText({ event: ev, page: p });
                return { icon: '📰', text: EVENT_LABELS[ev] + (nd ? ': ' + nd : '') };
            }
            case 'kanji_session': case 'kanji_write':
                return { icon: '✍️', text: EVENT_LABELS[ev] + ' — ' + detailText({ event: ev, page: p }) };
            case 'word_freeze': return { icon: '❄️', text: detailText({ event: ev, page: p }) };
            case 'words_delete': return { icon: '🗑', text: detailText({ event: ev, page: p }) };
            case 'install': return { icon: '📲', text: detailText({ event: ev, page: p }) };
            case 'learn_lang': return { icon: '🌐', text: 'выбрал язык изучения: ' + detailText({ event: ev, page: p }) };
            case 'subs_segments': case 'subs_refsync':
                return { icon: '🎚', text: EVENT_LABELS[ev] + ' (' + detailText({ event: ev, page: p }) + ')', dim: true };
            case 'leave': return { icon: '🚪', text: 'вышел из приложения' + (PAGE_LABELS[p] ? ' (' + PAGE_LABELS[p] + ')' : '') };
            case 'return': return { icon: '↩', text: 'вернулся через ' + awayText(p), dim: true };
            case 'offline': return { icon: '📴', text: p === 'on' ? 'потерял сеть' : 'сеть вернулась', warn: p === 'on' };
            default: {
                // Незнакомое событие показываем как есть — лучше непонятная
                // строка, чем потерянный шаг (и сразу видно, что нужна подпись).
                var ico = ev.indexOf('cta_') === 0 ? '👆'
                    : ev === 'demo_play' ? '▶'
                        : ev === 'demo_word_click' ? '👆'
                            : ev === 'demo_word_saved' ? '💾'
                                : ev === 'demo_to_study' ? '➡'
                                    : ev === 'feedback' ? '✉️' : '•';
                var lbl = EVENT_LABELS[ev] || ev;
                var det = detailText({ event: ev, page: p });
                if (/^(app|landing)\//.test(det)) det = '';
                return { icon: ico, text: lbl + (det && det !== lbl ? ': ' + det : '') };
            }
        }
    }

    // Сколько отсутствовал: секунды из события 'return' → «5 мин», «2 ч».
    function awayText(sec) {
        var n = Math.max(0, Math.round(Number(sec) || 0));
        if (n < 3600) return Math.max(1, Math.round(n / 60)) + ' мин';
        return (n / 3600).toFixed(1).replace('.0', '') + ' ч';
    }

    // Свернул на минуту и вернулся — не уход: пару leave/return убираем, иначе
    // каждое переключение вкладки превращалось бы в два шага.
    var SHORT_TRIP_SEC = 60;
    function dropShortTrips(events) {
        var out = [];
        (events || []).forEach(function (e) {
            if (e.event === 'return' && (Number(e.page) || 0) < SHORT_TRIP_SEC) {
                if (out.length && out[out.length - 1].event === 'leave') out.pop();
                return;
            }
            out.push(e);
        });
        return out;
    }

    function buildSteps(events, endAt) {
        var out = [];
        var lastPage = null, lastPageAt = 0, inWatch = false;

        (events || []).forEach(function (e) {
            var ev = e.event;
            var p = String(e.page == null ? '' : e.page);
            if (STEP_SKIP[ev]) return;

            var st = stepOf(ev, p);
            if (!st) return;

            if (ev === 'page') {
                // Плеер пишет «открыл плеер» на каждую смену серии. Повтор той
                // же страницы подряд показываем, только если человек реально
                // отсутствовал (больше двух минут) — иначе это внутренняя
                // перерисовка, а не шаг пути.
                var t = new Date(e.at).getTime();
                if (p === lastPage && t - lastPageAt < 120000) { lastPageAt = t; return; }
                lastPage = p; lastPageAt = t;
                inWatch = false;
            }
            if (st.watch) inWatch = true;
            st.at = e.at;
            st.under = inWatch && !!UNDER_WATCH[ev];

            // Подряд идущие одинаковые шаги — одной строкой с ×N.
            var last = out[out.length - 1];
            if (last && last.icon === st.icon && last.text === st.text) {
                last.n = (last.n || 1) + 1;
                last.lastAt = e.at;
                return;
            }
            // Однотипные шаги без текста-различия («прошёл карточку») тоже
            // считаем повтором, если различается только слово в конце.
            out.push(st);
        });

        out.forEach(function (st, i) {
            st.until = out[i + 1] ? out[i + 1].at : (endAt || st.at);
        });
        return out;
    }

    function stepsHtml(steps, pageSeq) {
        if (!steps.length) {
            var where = (pageSeq && pageSeq.length) ? pageSeq.join(' → ') : '';
            return '<ul class="story"><li class="story__row">' +
                '<span class="story__time"></span><span class="story__icon">👀</span>' +
                '<span class="story__body"><b>только зашёл</b>' +
                (where ? '<span class="story__sub">' + esc(where) + '</span>' : '') +
                '</span></li></ul>';
        }
        var rows = steps.map(function (st) {
            var cls = 'story__row' + (st.under ? ' story__row--sub' : '') + (st.dim ? ' story__row--dim' : '');
            var txt = esc(st.text);
            if (st.warn) txt = '<b class="story__warn">' + txt + '</b>';
            else if (st.watch) txt = '<b>' + txt + '</b>';
            if (st.n > 1) txt += ' <i class="story__dur">×' + st.n + '</i>';
            // Длительность имеет смысл только у просмотра: остальные шаги мгновенные.
            if (st.watch) {
                var d = durText(st.at, st.until);
                if (d) txt += ' <i class="story__dur">' + d + '</i>';
            }
            return '<li class="' + cls + '">' +
                '<span class="story__time">' + fmtHM(st.at) + '</span>' +
                '<span class="story__icon">' + st.icon + '</span>' +
                '<span class="story__body">' + txt + '</span></li>';
        }).join('');
        return '<ul class="story">' + rows + '</ul>';
    }

    // Одна сессия = один визит: итог одной строкой, краткий путь по страницам,
    // ниже — хронология действий (повторы схлопнуты, открытия страниц приглушены).
    function renderSession(s, num) {
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

        var collapsed = collapseEvents(dropShortTrips(s.events));
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

        // Устройства визита: сессия больше не рвётся при смене id, и в одном визите
        // их бывает несколько (телефон в режиме «версия для ПК» шлёт другой UA).
        var devs = (s.uas && s.uas.length ? s.uas : (s.ua ? [s.ua] : [])).map(uaShort)
            .filter(function (d, i, a) { return a.indexOf(d) === i; });
        var dev = devs.length ? devs.join(' + ') : String(s.visitorId || '—').slice(0, 8);
        // Пересказ действий — главное в сессии: по строке на дело, техника
        // свёрнута в пометки. Сырой лог остаётся ниже под спойлером.
        var steps2 = buildSteps(dropShortTrips(s.events), s.end);
        var storyBlock = stepsHtml(steps2, pageSeq);

        // Откуда пришёл: событие ref шлётся один раз за визит.
        var ref = (s.events || []).filter(function (e) { return e.event === 'ref'; })[0];
        var src = ref ? '<span class="session__src">↘ ' + esc(ref.page) + '</span>' : '';

        return '<div class="session">' +
            '<div class="session__head">' +
                '<span class="session__n">Сессия #' + num + '</span>' +
                '<span class="session__dev" title="' + esc((s.uas || [s.ua || s.visitorId || '']).join(' | ')) + '">' + esc(dev) + '</span>' +
                '<span class="session__time">' + range + '</span>' + src +
                '<span class="session__count">' + steps2.length + ' ' +
                    plural(steps2.length, 'шаг', 'шага', 'шагов') + '</span>' +
            '</div>' + sumHtml + path + storyBlock +
            (s.truncated ? '<div class="session__path">показаны первые ' + (s.events || []).length + ' из ' + s.count + ' действий</div>' : '') +
            (steps ? '<details class="session__steps"><summary>▸ сырой лог (' + collapsed.length + ')</summary><ul class="tl">' + steps + '</ul></details>' : '') +
            '</div>';
    }

    // Что посетитель собрал за окно. Для гостя это единственный доступный след:
    // словарь и колоды незарегистрированного лежат у него в localStorage и на
    // сервер не уходят, а вот сохранение слова летит в статистику ВМЕСТЕ со
    // словом — по этим событиям список и восстанавливается. Состава колод в
    // событиях нет, поэтому по ним честно показываем только количества.
    function wordChips(list) {
        function chip(it) {
            return '<span class="vwords__chip" title="' + esc(fmtTime(it.last)) + '"><b>' + esc(it.word) + '</b>' +
                (it.n > 1 ? ' <span>×' + it.n + '</span>' : '') + '</span>';
        }
        var head = list.slice(0, 24).map(chip).join('');
        if (list.length <= 24) return head;
        return head + '<details><summary>ещё ' + (list.length - 24) + '</summary>' +
            list.slice(24).map(chip).join('') + '</details>';
    }

    function plural(n, one, few, many) {
        var m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
        return many;
    }

    // Коллекция гостя как она есть у него в браузере: снимок присылает сам
    // клиент (см. pwa/js/guest-mirror.js), у вошедших его нет — их слова видно
    // точнее во вкладке «Пользователи».
    function guestDecks(v) {
        return (v.guests || []).map(function (g) {
            var decks = (g.decks || []).map(function (d) {
                var chips = (d.words || []).map(function (x) {
                    return '<span class="vwords__chip" title="' + esc(x.translation || '') + '"><b>' +
                        esc(x.kanji || x.kana) + '</b></span>';
                }).join('');
                return '<details class="gdeck"><summary>' + esc(d.emoji || '📦') + ' ' + esc(d.name) +
                    ' · ' + d.total + ' сл.</summary>' + (chips || '<span class="vwords__head">пусто</span>') + '</details>';
            }).join('');
            var dn = (g.decks || []).length;
            return '<div class="vwords"><div class="vwords__head">🗂 Коллекция гостя: ' + g.words + ' сл. · ' +
                dn + ' ' + plural(dn, 'колода', 'колоды', 'колод') + ' · вне колод ' + g.looseWords +
                ' <i>— снимок из браузера, обновлён ' + esc(fmtTime(g.updatedAt)) + '</i></div>' +
                (decks || '<span class="vwords__head">колод нет</span>') + '</div>';
        }).join('');
    }

    function visitorWords(v) {
        var w = v.words || {};
        var saved = w.saved || [];
        var known = w.known || [];
        var guest = guestDecks(v);
        if (!saved.length && !known.length && !w.decksCreated && !guest) return '';
        var out = guest;
        // total — сколько разных слов всего, list — сколько реально приехало
        // (сервер отдаёт последние 300): не выдаём срез за полную картину.
        function head(icon, total, list) {
            return '<div class="vwords__head">' + icon + ': ' + total +
                (list.length < total ? ' <i>— показаны последние ' + list.length + '</i>' : '') + '</div>';
        }
        if (saved.length) {
            out += '<div class="vwords">' + head('💾 Сохранил слов', w.savedTotal || saved.length, saved) +
                wordChips(saved) + '</div>';
        }
        if (known.length) {
            out += '<div class="vwords">' + head('🧠 Отметил «уже знаю»', w.knownTotal || known.length, known) +
                wordChips(known) + '</div>';
        }
        if (w.decksCreated) {
            // Счётчик из событий — история за всё окно (в снимке только текущее
            // состояние). Оговорку про «состав только в браузере» показываем,
            // лишь когда снимка нет: иначе она противоречит колодам выше.
            out += '<div class="vwords"><div class="vwords__head">📦 Колод собрал за период: ' + w.decksCreated +
                (w.deckWords ? ' · слов в авто-колодах: ' + w.deckWords : '') +
                (guest ? '' : ' <i>— состав колод гостя хранится только в его браузере</i>') + '</div></div>';
        }
        return out;
    }

    // Список посетителей с учётом фильтра по стране.
    // Время в приложении за окно (копит пинг раз в минуту, пока вкладка видна).
    function durSec(sec) {
        var m = Math.round((sec || 0) / 60);
        if (m < 1) return '<1 мин';
        if (m < 60) return m + ' мин';
        return Math.floor(m / 60) + ' ч' + (m % 60 ? ' ' + (m % 60) + ' м' : '');
    }

    // «1 IP» — адрес целиком; несколько — счётчик, адреса во всплывашке.
    function ipsText(v) {
        var ips = v.ips || (v.ip ? [v.ip] : []);
        var n = v.ipCount || ips.length;
        if (n <= 1) return esc(ips[0] || '—');
        return '<span title="' + esc(ips.join(', ') + (n > ips.length ? ' …' : '')) + '">' + n + ' IP</span>';
    }

    function renderVisitorList() {
        if (!visitorsData) return;
        var data = visitorsData;

        var list = data.visitors.filter(function (v) {
            return !countryFilter || countryOf(v.ip).code === countryFilter;
        });

        var subEl = gid('visitors-sub');
        // Карточка = человек: вошедший со всеми своими устройствами или гость
        // (одно устройство). IP — только списком внутри: мобильный оператор
        // меняет адрес одного телефона на каждом заходе.
        subEl.textContent = data.count + ' ' + plural(data.count, 'человек', 'человека', 'человек') +
            (data.devices ? ' · ' + data.devices + ' устр.' : '') +
            (data.ipCount ? ' · ' + data.ipCount + ' IP' : '') + ' за ' + data.days + ' дн.' +
            (countryFilter ? ' · по фильтру: ' + list.length + '.' : '') +
            ' Клик раскрывает сессии: итог, путь по страницам и действия по порядку.';

        if (!list.length) {
            gid('visitors').innerHTML = '<div class="msg">Пока нет данных</div>';
            return;
        }

        gid('visitors').innerHTML = list.map(function (v) {
            var sessions = (v.sessions || []);
            var body = sessions.length
                // Сессии приходят свежими сверху; номер — по порядку визитов, так что
                // у верхней он наибольший (раньше верхняя была «#1» — нумерация задом наперёд).
                ? sessions.map(function (s, si) { return renderSession(s, (v.sessionCount || sessions.length) - si); }).join('')
                : '<div class="msg">Нет сессий</div>';

            // Устройства человека — короткие подписи из уникальных User-Agent'ов
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
                '<span class="visitor__ip">' + (v.email ? '👤 ' + esc(v.email) : 'гость') + '</span>' +
                geoLine +
                '<span class="visitor__meta">' + (v.sessionCount != null ? v.sessionCount : sessions.length) + ' сессий · ' + v.hits + ' действий · ' +
                v.visitors + ' устр. · ' + ipsText(v) + (v.seconds ? ' · ⏱ ' + durSec(v.seconds) : '') + ' · ' +
                fmtTime(v.firstSeen) + ' → ' + fmtTime(v.lastSeen) + '</span>' +
                devLine +
                '<span class="visitor__spacer"></span>' +
                '<span class="visitor__caret">путь</span>' +
                '<div class="visitor__digest">' + visitorDigest(v) + '</div>' +
                '</div>' +
                '<div class="visitor__body">' + visitorWords(v) + body + '</div></div>';
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
                return esc(String(u.email).split('@')[0]) + ' <span class="pct">' + u.watched + '/' + u.reviewed + '</span>';
            }).join(', ');
            return '<tr><td>' + r.week.slice(8) + '.' + r.week.slice(5, 7) + '</td><td class="num">' + fmt(r.watched) +
                '</td><td class="num">' + fmt(r.reviewed) +
                '</td><td class="num"><b>' + fmt(r.both) + '</b></td><td>' + (who || '—') + '</td></tr>';
        }).join('');
        el.innerHTML =
            '<div class="tblwrap"><table><thead><tr><th>Нед.</th><th class="num">Смотр.</th>' +
            '<th class="num">Повт.</th><th class="num">Оба</th><th title="смотрел/повторял">Кто</th></tr></thead><tbody>' +
            rows + '</tbody></table></div>';
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
