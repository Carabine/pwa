// Отладочная выгрузка текущей дорожки в mp4 — кнопка ТОЛЬКО для владельца.
//
// Зачем: разбор проблем с источниками требует самого файла. Какой РЕАЛЬНО язык
// звука (метка «SUB» у источника врёт — на этом сгорел solarmovies/embedmaster),
// где именно уехали субтитры, что вжато в кадр. До этого приходилось ходить по
// ssh на VPS и гонять ffmpeg по прокси-ссылке руками.
//
// Кнопка — УДОБСТВО, а не защита: и тикет (/admin/stream-dump/ticket), и сам
// стрим (/proxy/dump) закрыты на сервере через hasOwnerAccess. Кто угодно может
// снять hidden в DevTools — и получит 403. Публичной кнопки «скачать серию»
// здесь нет намеренно: это не функция изучения языка.
//
// Подключать ПОСЛЕ player.js (нужны state, client, t) и app.js (AnimeiBack).
(function () {
    'use strict';

    const btn = document.getElementById('ctrl-dump');
    if (!btn) return;

    // Сколько выгружать от текущей позиции. dur: null = до конца серии.
    const RANGES = [
        { key: 's30', dur: 30 },
        { key: 'm2', dur: 120 },
        { key: 'full', dur: null },
    ];

    function tr(key, fallback) {
        const s = typeof t === 'function' ? t(key) : key;
        return s === key ? fallback : s;
    }

    function snack(msg) {
        if (typeof showSnackbar === 'function') showSnackbar(msg, { duration: 2200 });
    }

    // Имя файла для разбора: по нему сразу видно тайтл, серию и ИСТОЧНИК —
    // без источника скачанные куски не отличить друг от друга, а вся отладка
    // как раз про «у какого провайдера что не так».
    function dumpName() {
        const select = document.getElementById('episode-select');
        const ep = state.episodes && select ? state.episodes[parseInt(select.value, 10)] : null;
        const title = (typeof titleRomaji === 'string' && titleRomaji) || 'anime';
        const parts = [title];
        if (state.seasonIndex) parts.push('s' + (state.seasonIndex + 1));
        if (ep && ep.number != null) parts.push('ep' + ep.number);
        parts.push(state.provider || 'kodik');
        return parts.join('_');
    }

    async function startDump(dur) {
        if (!state.currentVideoUrl) { snack(tr('dump.noStream', 'Поток ещё не загружен')); return; }

        // Целую серию берём с начала: «с текущей позиции до конца» для разбора
        // почти никогда не нужно, а промахнуться позицией — легко.
        const start = dur == null ? 0 : Math.floor(video.currentTime || 0);

        try {
            const { data: res } = await client.post('admin/stream-dump/ticket', {
                url: state.currentVideoUrl,
                start,
                dur,
                name: dumpName(),
            });

            const url = (window.ANIMEI_ORIGIN || location.origin)
                + '/proxy/dump?t=' + encodeURIComponent(res.data.ticket);

            // Отдаём родному загрузчику: файл пишется сразу на диск, с прогрессом,
            // и серия не висит гигабайтным blob'ом в памяти вкладки.
            // Если сервер откажет (429 «уже идёт выгрузка»), в загрузки упадёт
            // крошечный файл с текстом ошибки — плеер при этом не страдает.
            const a = document.createElement('a');
            a.href = url;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            a.remove();

            snack(dur == null
                ? tr('dump.startedFull', 'Выгрузка серии началась')
                : tr('dump.started', 'Выгрузка фрагмента началась'));
        } catch (err) {
            const code = err && err.response && err.response.status;
            snack(code === 403
                ? tr('dump.denied', 'Нет доступа к выгрузке')
                : tr('dump.error', 'Не удалось начать выгрузку'));
        }
    }

    // ---------- Меню (стиль и поведение — как у меню качества) ----------

    const wrap = document.createElement('div');
    wrap.className = 'player-ui__dump-wrap';
    // Скрыта по умолчанию: показываем только владельцу (в самом низу файла).
    // Прячем ОБЁРТКУ, а не кнопку: hidden на кнопке снялся бы вместе с её
    // показом, а меню осталось бы в потоке.
    wrap.hidden = true;
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);
    btn.hidden = false;   // видимостью управляет обёртка

    const menu = document.createElement('div');
    menu.className = 'player-ui__dump-menu';
    wrap.appendChild(menu);

    let layer = null;
    const hideMenu = () => { layer = null; wrap.classList.remove('is-open'); };
    const closeMenu = () => { if (layer) AnimeiBack.close(layer); else hideMenu(); };

    function buildMenu() {
        menu.innerHTML = '';
        RANGES.forEach((r) => {
            const opt = document.createElement('button');
            opt.type = 'button';
            opt.className = 'player-ui__dump-opt';
            opt.textContent = tr('dump.range.' + r.key, r.dur == null
                ? 'Серия целиком'
                : (r.dur < 60 ? r.dur + ' с отсюда' : (r.dur / 60) + ' мин отсюда'));
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                closeMenu();
                startDump(r.dur);
            });
            menu.appendChild(opt);
        });
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wrap.classList.contains('is-open')) { closeMenu(); return; }
        // Не держим два меню плеера открытыми сразу (качество/скорость/звук).
        document.dispatchEvent(new CustomEvent('animei:player-menu', { detail: wrap }));
        buildMenu();
        wrap.classList.add('is-open');
        layer = AnimeiBack.open(hideMenu);
    });

    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target) && wrap.classList.contains('is-open')) closeMenu();
    });
    document.addEventListener('animei:player-menu', (e) => {
        if (e.detail !== wrap && wrap.classList.contains('is-open')) closeMenu();
    });

    // ---------- Показ кнопки ----------
    // Кэш animei:isAdmin ведёт app.js (он же рисует ссылку на админку). Читаем
    // его, а не дёргаем whoami ещё раз: лишний запрос на каждом открытии плеера
    // не нужен, а ошибиться кэш может только в сторону «показали лишнюю кнопку»,
    // которая без ключа/сессии всё равно вернёт 403.
    try {
        if (localStorage.getItem('animei:isAdmin') === 'yes') wrap.hidden = false;
    } catch { /* приватный режим — кнопки не будет, это нормально */ }
})();
