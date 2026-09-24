// Версия приложения — единый источник. Бампится вместе с CACHE_NAME в
// service-worker.js при каждом деплое (последнее число). Формат v0.0.N —
// показывается в футере сайдбара, чтобы визуально валидировать, что деплой доехал.
const APP_VERSION = 'v0.0.498';

// Путь от корня приложения (/app/), одинаково работающий с главной и с
// подстраниц /app/pages/*. Относительный путь, собранный без этой поправки,
// однажды уже сломал регистрацию SW с подстраницы (см. registerServiceWorker).
function appUrl(rel) {
    return (window.location.pathname.includes('/pages/') ? '../' : './') + rel;
}

/* ========== Кнопка «Назад» закрывает открытый слой ==========
   Сайдбар, модалки, шторки и выпадающие меню — «слои» поверх страницы. На
   телефоне системная кнопка/жест «назад» должна закрывать верхний открытый слой,
   а не уводить со страницы. Механика одна на всё приложение: открытие слоя кладёт
   запись в history, закрытие — снимает её, а popstate закрывает всё, что оказалось
   выше текущей глубины. Слои стыкуются (сайдбар → модалка → вложенная шторка):
   каждая запись помнит свою глубину в state.animeiLayer.

   Использование:
       const layer = AnimeiBack.open(() => { ...спрятать слой... });
       ...
       AnimeiBack.close(layer);   // крестик / Esc / клик по фону

   Важно: close-колбэк ТОЛЬКО прячет слой и не трогает history — иначе запись
   снимется дважды и «назад» перепрыгнет через страницу. */
const AnimeiBack = (() => {
    const stack = [];          // открытые слои снизу вверх

    // Глубина, на которой мы сейчас стоим в history (0 = слоёв нет).
    const depth = () => {
        const s = history.state;
        return (s && typeof s.animeiLayer === 'number') ? s.animeiLayer : 0;
    };

    // Спрятать слои выше уровня n, сверху вниз. Только DOM — history не трогаем.
    function hideAbove(n) {
        while (stack.length > n) {
            const layer = stack.pop();
            try { layer.close(); } catch (err) { console.error(err); }
        }
    }

    // Свои записи из history снимаем одним history.go: закрытие слоя может по
    // цепочке закрыть соседний (сохранение в редакторе колоды закрывает и шторку
    // над ним), а несколько подряд идущих go(-1) браузеры склеивают в один шаг.
    // Копим шаги и делаем один переход в микрозадаче.
    let pendingSteps = 0;
    let flushQueued = false;
    function unwind(steps) {
        if (steps <= 0) return;
        pendingSteps += steps;
        if (flushQueued) return;
        flushQueued = true;
        Promise.resolve().then(() => {
            flushQueued = false;
            const n = pendingSteps;
            pendingSteps = 0;
            if (n > 0) history.go(-n);
        });
    }

    // Системный «назад» (или наш собственный history.go выше): приводим стек в
    // соответствие с глубиной, на которую откатился history. Если мы уже закрыли
    // слои сами, здесь просто нечего делать — сверка идемпотентна.
    window.addEventListener('popstate', () => hideAbove(depth()));

    return {
        // Зарегистрировать открытый слой. close — как его спрятать.
        open(close) {
            const layer = { close };
            stack.push(layer);
            const state = { animeiLayer: stack.length };
            if (pendingSteps > 0) {
                // Слой открылся вместо только что закрытого (пункт меню открывает
                // модалку). Занимаем запись, которую собирались снять, — иначе
                // отложенный go() снял бы уже новую.
                pendingSteps--;
                history.replaceState(state, '');
            } else {
                history.pushState(state, '');
            }
            return layer;
        },

        // Закрыть слой по кнопке/Esc/клику по фону. Прячем сразу (без мигания),
        // а свои записи из history снимаем следом — popstate увидит, что стек уже
        // сошёлся, и ничего не сделает.
        close(layer) {
            const i = stack.indexOf(layer);
            if (i < 0) return;
            const steps = stack.length - i;      // сам слой + всё, что над ним
            hideAbove(i);
            unwind(steps);
        },

        // Слой ещё открыт?
        isOpen(layer) { return !!layer && stack.indexOf(layer) >= 0; },

        count() { return stack.length; },

        // Уход со страницы при открытых слоях. Сначала снимаем свои записи из
        // history, и только потом переходим — иначе они останутся висеть, и
        // «назад» с новой страницы вернёт сюда с лишней пустой записью.
        navigate(url) {
            const steps = stack.length;
            hideAbove(0);
            if (!steps && !pendingSteps) { window.location.href = url; return; }
            let done = false;
            const go = () => { if (done) return; done = true; window.location.href = url; };
            window.addEventListener('popstate', go, { once: true });
            setTimeout(go, 150);                 // страховка, если popstate не придёт
            unwind(steps);
        },
    };
})();

// Перенос оверлея внутрь fullscreen-элемента на время показа: в реальном
// fullscreen браузер показывает только fullscreen-элемент и его потомков,
// поэтому модалка из body там была бы невидимой. attach() при открытии,
// restore() при закрытии; выход из fullscreen с открытой модалкой возвращает
// оверлей на место сам. Используют модалки плеера (episode-deck, episode-known);
// у player-ui свой, более развитый перенос (moveIn/moveBack с целями).
function createFsPortal(overlay) {
    let home = null;
    function attach() {
        const fs = document.fullscreenElement;
        if (!fs || fs.contains(overlay)) return;
        home = { parent: overlay.parentNode, next: overlay.nextSibling };
        fs.appendChild(overlay);
    }
    function restore() {
        if (!home) return;
        home.parent.insertBefore(overlay, home.next);
        home = null;
    }
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) restore();
    });
    return { attach, restore };
}

// Каркас модалки-оверлея (words, decks-ui, word-edit — раньше по копии в каждой).
// Слой регистрируется в AnimeiBack («назад» на телефоне закрывает модалку, а не
// страницу), Esc и клик/тап по фону закрывают; закрытие снимает слушатель
// клавиатуры и прячет оверлей (по умолчанию — снять is-open и удалить после
// анимации). Использование: const modal = modalLayer(overlay); …наполнить,
// кнопкам отдать modal.close…; modal.open() — добавит в body и покажет.
//   onHide    — полная замена умолчального скрытия (word-edit удаляет сразу);
//   afterHide — доп. действия после скрытия (обновить счётчики, отдать результат);
//   backdropEvent — 'mousedown' для форм: выделение текста, отпущенное на фоне,
//                   не должно закрывать модалку по click;
//   stopEsc   — не пускать Esc дальше (когда у страницы свой обработчик).
function modalLayer(overlay, { backdropEvent = 'click', stopEsc = false, onHide, afterHide } = {}) {
    let layer = null;
    const hide = () => {
        layer = null;
        document.removeEventListener('keydown', onEsc);
        if (onHide) {
            onHide();
        } else {
            overlay.classList.remove('is-open');
            setTimeout(() => overlay.remove(), 180);
        }
        if (afterHide) afterHide();
    };
    const close = () => { if (layer) AnimeiBack.close(layer); else hide(); };
    const onEsc = (e) => { if (e.key === 'Escape') { if (stopEsc) e.stopPropagation(); close(); } };
    const open = () => {
        overlay.addEventListener(backdropEvent, (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', onEsc);
        document.body.appendChild(overlay);
        layer = AnimeiBack.open(hide);
        requestAnimationFrame(() => overlay.classList.add('is-open'));
    };
    return { open, close };
}

// Обычные ссылки внутри открытых слоёв (пункты сайдбара — основной случай)
// уводят со страницы. Перехватываем на всплытии и уходим через navigate(), чтобы
// записи слоёв не оставались в history.
document.addEventListener('click', (e) => {
    if (!AnimeiBack.count()) return;
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) return;
    e.preventDefault();
    AnimeiBack.navigate(a.href);
});

// Иконки для пунктов меню (сайдбар + профиль). Единый набор, вставляется JS —
// так не дублируем svg в каждой HTML-странице и покрываем динамические пункты.
const NAV_ICONS = {
    'nav.home': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/></svg>',
    'nav.catalog': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    'nav.news': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13v14a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1z"/><line x1="7" y1="9" x2="14" y2="9"/><line x1="7" y1="13" x2="14" y2="13"/><line x1="7" y1="17" x2="11" y2="17"/></svg>',
    'nav.watch': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="10 9 16 12 10 15 10 9" fill="currentColor" stroke="none"/></svg>',
    'nav.dictionary': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    'nav.feedback': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/></svg>',
    'nav.settings': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    'nav.progress': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>',
    'nav.account': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    'nav.logout': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    'nav.login': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
    'nav.site': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>',
};

// Обернуть пункт меню иконкой: data-i18n переносим на внутренний span (иначе
// applyI18n затрёт текстом наш svg), иконку ставим первой.
function iconifyLink(a) {
    if (!a || a.querySelector('svg')) return;
    const key = a.getAttribute('data-i18n');
    const icon = NAV_ICONS[key];
    if (!icon) return;
    const label = a.textContent;
    a.removeAttribute('data-i18n');
    a.textContent = '';
    a.insertAdjacentHTML('afterbegin', icon);
    const span = document.createElement('span');
    span.className = 'nav-label';
    if (key) span.setAttribute('data-i18n', key);
    span.textContent = label;
    a.appendChild(span);
    // «NEW» на JP News — сосед подписи (не внутри неё: applyI18n затирает
    // textContent у data-i18n при смене языка и стёр бы бейдж). В свёрнутой
    // рейке прячется по opacity вместе с nav-label — см. .nav-new в nav.css.
    if (key === 'nav.news') {
        const badge = document.createElement('span');
        badge.className = 'nav-new';
        badge.textContent = 'NEW';
        a.appendChild(badge);
    }
}

function addSidebarIcons() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.querySelectorAll('a[data-i18n]').forEach(iconifyLink);
}

// Ссылка «Админка» в сайдбаре — только для админ-аккаунта. Понять, админ ли
// текущий пользователь, можно лишь у сервера (в токене только userId): дёргаем
// /admin/whoami с Bearer-токеном. Кэш animei:isAdmin показывает ссылку мгновенно
// (без мигания), фоновая проверка подтверждает/убирает. Сама админка всё равно
// закрыта сервером, поэтому кэш — только для UI и не даёт лишнего доступа.
function maybeAddAdminLink() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || typeof isSignedIn !== 'function' || !isSignedIn()) return;

    const href = appUrl('pages/admin.html');
    const addLink = () => {
        if (sidebar.querySelector('.sidebar__admin')) return;
        const a = document.createElement('a');
        a.className = 'sidebar__admin';
        a.href = href;
        a.insertAdjacentHTML('afterbegin',
            '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5l-8-3z"/><path d="m9 12 2 2 4-4"/></svg>');
        const span = document.createElement('span');
        span.className = 'nav-label';
        span.textContent = (typeof t === 'function' ? t('nav.admin') : 'Admin');
        a.appendChild(span);
        const before = sidebar.querySelector('.sidebar__settings')
            || sidebar.querySelector('.sidebar__site');
        if (before) sidebar.insertBefore(a, before); else sidebar.appendChild(a);
    };
    let cached, token;
    try { cached = localStorage.getItem('animei:isAdmin'); } catch { /* приватный режим */ }
    try { token = localStorage.getItem('animei:accessToken'); } catch { /* приватный режим */ }
    if (cached === 'yes') addLink();
    if (!token) return;

    const base = window.ANIMEI_ORIGIN || location.origin;
    fetch(base + '/api/v1/admin/whoami', { headers: { Authorization: 'Bearer ' + token } })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
            // whoami отдаёт 200 {admin:true} ТОЛЬКО админу; не-админ и протухший
            // access-токен одинаково дают 403 → null. Поэтому при неуспехе ссылку
            // НЕ снимаем и 'no' НЕ кэшируем — иначе у админа с протухшим токеном
            // (его позже освежит axiosClient) ссылка пропадала навсегда. Показываем
            // при подтверждении; снятие — только при логауте (чистит кэш isAdmin).
            if (j && j.admin) {
                try { localStorage.setItem('animei:isAdmin', 'yes'); } catch { /* приватный режим */ }
                addLink();
            }
        })
        .catch(() => { /* сеть недоступна — оставляем как есть */ });
}

// ========== Service Worker ==========

if ('serviceWorker' in navigator) {
    // Когда новый SW берёт управление (после skipWaiting + clients.claim) —
    // один раз перезагружаем страницу, чтобы свежие CSS/JS применились сразу,
    // без ручного перезапуска приложения. Флаг защищает от цикла перезагрузок.
    let swReloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (swReloading) return;
        // НЕ перезагружаем, пока видео ИГРАЕТ (плеер): reload обрывал загрузку
        // HLS («видео не грузится с первого раза»). Раньше условием было простое
        // наличие <video> на странице, но в карточке обучения он есть почти
        // всегда (клип и его прогрев) — из-за этого установленное приложение
        // могло неделями сидеть на старой версии.
        const playing = Array.prototype.some.call(
            document.querySelectorAll('video'),
            (v) => !v.paused && !v.ended && v.readyState > 2,
        );
        if (playing) return;
        // НЕ перезагружаем сразу после захода. Приложение многостраничное с
        // network-first — свежие CSS/JS приходят при КАЖДОЙ загрузке страницы, а
        // reload на старте лишь показывал лоадер второй раз («двойной лоадер»:
        // главная → снова лоадер). controllerchange при заходе — это первичная
        // активация/обновление SW, ресурсы уже свежие, перезагрузка не нужна.
        // Перезагружаем ТОЛЬКО если обновление прилетело, пока пользователь уже
        // давно в приложении (открытая вкладка пережила деплой).
        if (performance.now() < 15000) return;
        swReloading = true;
        window.location.reload();
    });

    // Установленное приложение живёт в фоне неделями: событие load случается
    // там раз в запуск, а вместе с ним и единственная проверка обновления.
    // Поэтому проверяем ещё и при каждом возвращении в приложение — не чаще
    // раза в минуту, чтобы не дёргать сеть на каждое переключение вкладок.
    let lastSwCheck = 0;
    function checkSwUpdate() {
        if (document.visibilityState !== 'visible') return;
        const now = Date.now();
        if (now - lastSwCheck < 60000) return;
        lastSwCheck = now;
        navigator.serviceWorker.getRegistration()
            .then((reg) => { if (reg) reg.update(); })
            .catch(() => { /* нет сети — проверим в следующий раз */ });
    }
    document.addEventListener('visibilitychange', checkSwUpdate);
    window.addEventListener('focus', checkSwUpdate);

    window.addEventListener('load', () => {
        // updateViaCache: 'none' — браузер не берёт сам скрипт SW из HTTP-кеша
        // при проверке обновлений, поэтому новая версия SW находится сразу.
        // SW лежит в /app/. С относительным './' на страницах из /app/pages/ путь
        // резолвился в /app/pages/service-worker.js → 404, и SW там не регистрировался
        // (офлайн-кэш и авто-перезагрузка после деплоя не работали при заходе сразу
        // на подстраницу). Берём путь от корня приложения — работает с любой страницы.
        const swUrl = appUrl('service-worker.js');
        navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' })
            .then((reg) => {
                console.log('SW registered');
                // Принудительно проверяем обновление при каждом запуске —
                // не ждём периодической проверки браузера.
                reg.update();
            })
            .catch(err => console.log('SW registration failed:', err));
    });
}

// ========== Индикатор «нет сети» ==========

// Без него офлайн выглядел как «сайт подглючивает»: на главной молча пропадают
// «продолжить смотреть» и рекомендации, каталог показывает кэшированный список,
// который не открывается, плеер бесконечно «переподключается». Приложение при
// этом РАБОТАЕТ — повторение и сохранённые карточки доступны, — поэтому под
// шапкой стоит короткая подпись: что случилось и что осталось можно.
//
// Это статус, а не тревога: раньше здесь была полоса во всю ширину в
// предупреждающем цвете, в две строки на телефоне. Теперь — значок в самой
// шапке, рядом с языком, как индикатор в статус-баре телефона: он ничего не
// сдвигает, ничего не накрывает и не выглядит отдельным блоком поверх страницы.
// Полная фраза не потерялась: она в подсказке значка, по тапу — снекбаром,
// и таким же снекбаром один раз при пропаже сети.
(function offlineBar() {
    let bar = null;

    const OFFLINE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.7"/><path d="M18.7 12.7A10 10 0 0 0 13.6 10"/><path d="M1.4 9.2a15 15 0 0 1 5.5-3.6"/><path d="M22.6 9.2A15 15 0 0 0 12 5"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

    function fullText() {
        return typeof t === 'function' ? t('offline.bar')
            : 'Нет сети. Повторение и сохранённые карточки работают';
    }

    function ensureBar() {
        if (bar && bar.isConnected) return bar;
        bar = document.createElement('button');
        bar.type = 'button';
        bar.className = 'offline-chip';
        bar.innerHTML = '<span class="offline-chip__ico">' + OFFLINE_ICON + '</span>'
            + '<span class="offline-chip__text"></span>';
        // Полную фразу показываем по тапу: на телефоне у значка нет подписи, и
        // это единственный способ узнать, что именно осталось работать.
        bar.addEventListener('click', () => {
            if (typeof showSnackbar === 'function') showSnackbar(fullText(), { duration: 3500 });
        });
        // Встаём в правую группу шапки, перед профилем: рядом с языком, как
        // индикатор в статус-баре. Шапки нет (редкая страница) — прячемся сверху.
        const right = document.querySelector('.header__right');
        const profile = right && right.querySelector('.profile-wrap');
        if (right && profile) right.insertBefore(bar, profile);
        else if (right) right.appendChild(bar);
        else document.body.prepend(bar);
        return bar;
    }

    function render(offline) {
        if (offline) {
            const el = ensureBar();
            el.querySelector('.offline-chip__text').textContent =
                typeof t === 'function' ? t('offline.chip') : 'Нет сети';
            el.title = fullText();
            el.setAttribute('aria-label', fullText());
        } else if (bar) {
            bar.remove();
            bar = null;
        }
    }

    let shown = false;
    function setState(offline) {
        if (offline === shown) return;
        shown = offline;
        if (window.animeiTrack) animeiTrack('offline', offline ? 'on' : 'off');
        render(offline);
        if (typeof showSnackbar !== 'function' || typeof t !== 'function') return;
        if (offline) {
            // Один раз объясняем, что случилось и что осталось можно: значок в
            // шапке дальше держит статус, но сам по себе он этого не расскажет.
            showSnackbar(fullText(), { duration: 3500 });
        } else {
            // Тихо подтверждаем возврат: пользователь мог ждать именно этого,
            // чтобы открыть аниме или каталог.
            showSnackbar(t('offline.back'), { duration: 2500 });
        }
    }

    // Главный сигнал — РЕАЛЬНЫЕ запросы приложения (animei:network из
    // axiosClient.js): navigator.onLine говорит лишь про сетевой интерфейс и
    // остаётся true на вайфае без интернета, поэтому одному ему верить нельзя.
    window.addEventListener('animei:network', (e) => setState(!e.detail.online));
    // Системные события — быстрая подсказка: «offline» показываем сразу,
    // «online» же только снимаем полосу, если запросы уже проходят.
    window.addEventListener('offline', () => setState(true));
    window.addEventListener('online', () => {
        if (!window.ANIMEI_NET || window.ANIMEI_NET.isOnline()) setState(false);
    });

    // Стартовое состояние (страницу могли открыть уже без сети).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (!navigator.onLine) setState(true); });
    } else if (!navigator.onLine) {
        setState(true);
    }
})();

// ========== PWA Install ==========

// Событие ловим и придерживаем: нативную мини-плашку Chrome гасим, вместо неё
// показываем свою тихую строку внизу главной (renderInstallHint).
let deferredPrompt;

const INSTALL_DISMISS_KEY = 'animei:installDismissed';
// Скрытие по крестику — НЕ навсегда: раньше писали '1' и плашка пропадала
// безвозвратно (один случайный тап — и предложения установить больше нет).
// Теперь запоминаем момент отказа и через INSTALL_DISMISS_DAYS показываем снова.
const INSTALL_DISMISS_DAYS = 14;

function installDismissedRecently() {
    const raw = localStorage.getItem(INSTALL_DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    // Легаси-значение '1' (бессрочное скрытие) не поддерживаем — покажем снова.
    if (!Number.isFinite(ts) || String(ts) !== raw) return false;
    return (Date.now() - ts) < INSTALL_DISMISS_DAYS * 864e5;
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Событие приходит асинхронно и часто уже после DOMContentLoaded —
    // поэтому строку показываем отсюда, а не только при отрисовке главной.
    renderInstallHint();
});

// Установили — приглашать больше не о чем (в standalone его и так не видно,
// но вкладка в браузере может остаться открытой).
window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const el = document.getElementById('install-hint');
    if (el) el.hidden = true;
    if (window.animeiTrack) window.animeiTrack('install', 'installed');
});

// Уже установленное приложение: и в standalone-режиме Chrome/Android, и в
// «на экран Домой» на iOS (там свой нестандартный navigator.standalone).
function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

function isIOS() {
    const ua = navigator.userAgent;
    // iPadOS 13+ представляется как Mac — отличаем по тач-экрану.
    return /iPhone|iPad|iPod/i.test(ua)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Тихая строка «Установить приложение» внизу главной. Показываем только когда
// установка реально возможна, иначе кнопка вела бы в никуда:
//   Android/Chrome — есть придержанный beforeinstallprompt, зовём его нативно;
//   iOS — такого события нет вообще, разворачиваем инструкцию про «Поделиться».
function renderInstallHint() {
    const el = document.getElementById('install-hint');
    if (!el || isAppInstalled()) return;
    if (installDismissedRecently()) return;

    const ios = isIOS();
    if (!deferredPrompt && !ios) return; // установка недоступна — молчим

    el.hidden = false;
    // Обработчики вешаем один раз: beforeinstallprompt может прийти повторно
    // (например, после отказа в нативном диалоге) и снова дёрнуть эту функцию.
    if (el.dataset.wired === '1') return;
    el.dataset.wired = '1';
    if (window.animeiTrack) window.animeiTrack('install', ios ? 'shown-ios' : 'shown');

    document.getElementById('install-hint-btn').addEventListener('click', async () => {
        if (window.animeiTrack) window.animeiTrack('install', 'click');
        if (ios) {
            const tip = document.getElementById('install-hint-ios');
            tip.hidden = !tip.hidden;
            return;
        }
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        // Промпт одноразовый: повторно этот же объект вызвать нельзя, браузер
        // пришлёт новый beforeinstallprompt сам.
        deferredPrompt = null;
        if (window.animeiTrack) window.animeiTrack('install', outcome);
        // Прячем при любом исходе: согласился — установилось, отказался — не
        // навязываемся. Насовсем не запоминаем, вернётся в следующий заход.
        el.hidden = true;
    });

    document.getElementById('install-hint-close').addEventListener('click', () => {
        try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch { /* недоступен */ }
        el.hidden = true;
        if (window.animeiTrack) window.animeiTrack('install', 'dismiss');
    });
}

// ========== Data Fetching ==========

async function fetchDataFromServer() {
    try {
        // Вошёл — слова с сервера; гость — из локального хранилища.
        const raw = await fetchWords();

        const allWords = raw.map(d => ({
            ...d,
            word: d.kanji,
            meaning: d.translation,
            translatedSentence: d.sentenceTranslation
        }));

        localStorage.setItem('words', JSON.stringify(allWords));
    } catch (error) {
        // Нет сети/сервер упал — оставляем локальную копию слов нетронутой,
        // иначе ошибка загрузки выглядит как исчезновение коллекции.
        console.error('Error fetching data:', error);
        if (localStorage.getItem('words') === null) localStorage.setItem('words', '[]');
    }
}

// ========== Shuffle ==========

function shuffle(array) {
    let currentIndex = array.length;
    while (currentIndex !== 0) {
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

// ========== UI: Sidebar ==========

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuBtn = document.querySelector('.menu-btn');

    // Версию деплоя в пользовательском сайдбаре не показываем — она живёт в
    // настройках («О приложении»). Захардкоженный в HTML элемент убираем,
    // чтобы старые страницы из кэша тоже не светили версию.
    sidebar?.querySelector('.sidebar__version')?.remove();

    // Ссылка «Настройки» в сайдбаре — единый источник, не дублируем в каждой
    // HTML-странице. Вставляем перед ссылкой «На сайт» (её добавляет i18n.js).
    if (sidebar && !sidebar.querySelector('.sidebar__settings')) {
        const a = document.createElement('a');
        a.className = 'sidebar__settings';
        a.href = appUrl('pages/settings.html');
        a.setAttribute('data-i18n', 'nav.settings');
        a.textContent = (typeof t === 'function') ? t('nav.settings') : 'Settings';
        const siteLink = sidebar.querySelector('.sidebar__site');
        if (siteLink) sidebar.insertBefore(a, siteLink);
        else sidebar.appendChild(a);
    }

    // Иконки ко всем пунктам сайдбара (статические из HTML + «Настройки» и «На
    // сайт», добавленные выше и из i18n.js). i18n.js регистрирует свой
    // DOMContentLoaded раньше — к этому моменту «На сайт» уже в DOM.
    addSidebarIcons();
    maybeAddAdminLink();

    if (menuBtn && sidebar && overlay) {
        // Кнопка меню переключает .open. На телефоне это выезжающая шторка (с
        // затемняющим оверлеем), на десктопе — та же .open раскрывает постоянную
        // рейку из «только иконки» в «иконки + подписи» (оверлей там скрыт CSS,
        // поэтому его класс ни на что не влияет). Toggle, а не add — чтобы на
        // десктопе повторное нажатие сворачивало рейку обратно.
        //
        // Шторкой сайдбар работает только на телефоне — там его и регистрируем
        // слоем для кнопки «назад». На десктопе .open просто раскрывает рейку, и
        // забирать себе системный «назад» ради неё было бы неожиданно.
        const isDrawer = () => window.matchMedia('(max-width: 767px)').matches;
        let sidebarLayer = null;

        const hideSidebar = () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        };
        const closeSidebar = () => {
            if (sidebarLayer) AnimeiBack.close(sidebarLayer);   // снимет запись из history
            else hideSidebar();
        };

        menuBtn.addEventListener('click', () => {
            if (sidebar.classList.contains('open')) { closeSidebar(); return; }
            sidebar.classList.add('open');
            overlay.classList.add('open');
            if (isDrawer()) {
                sidebarLayer = AnimeiBack.open(() => { sidebarLayer = null; hideSidebar(); });
            }
        });

        overlay.addEventListener('click', closeSidebar);
    }

    // Ховер-подсматривание рейки (десктоп): при наведении на бургер или саму рейку
    // временно раскрываем её (.peek), НЕ сдвигая контент — рейка наезжает поверх.
    // Небольшая задержка на уход курсора перекрывает «щель» между бургером в шапке
    // и рейкой ниже, чтобы переход бургер→рейка не мигал. На тач/узких экранах
    // класс .peek ни на что не влияет (CSS-правила только для min-width:768px).
    if (menuBtn && sidebar) {
        let peekTimer;
        const canPeek = () => window.matchMedia('(hover: hover) and (min-width: 768px)').matches;
        const peekOn = () => {
            clearTimeout(peekTimer);
            if (canPeek() && !sidebar.classList.contains('open')) sidebar.classList.add('peek');
        };
        const peekOff = () => {
            clearTimeout(peekTimer);
            peekTimer = setTimeout(() => sidebar.classList.remove('peek'), 140);
        };
        menuBtn.addEventListener('mouseenter', peekOn);
        menuBtn.addEventListener('mouseleave', peekOff);
        sidebar.addEventListener('mouseenter', peekOn);
        sidebar.addEventListener('mouseleave', peekOff);
    }

    // Клик по логотипу «Animei» в шапке — на главную. Логотип одинаков на всех
    // страницах (это div, а не ссылка), поэтому вешаем обработчик здесь и считаем
    // относительный путь так же, как для ссылок «Настройки»/«Войти» ниже.
    const headerLogo = document.querySelector('.header__logo');
    if (headerLogo) {
        const homeUrl = appUrl('index.html');
        headerLogo.classList.add('header__logo--link');
        headerLogo.setAttribute('role', 'link');
        headerLogo.setAttribute('tabindex', '0');
        headerLogo.setAttribute('aria-label', 'Animei');
        const goHome = () => { window.location.href = homeUrl; };
        headerLogo.addEventListener('click', goHome);
        headerLogo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); }
        });
    }

    // Profile dropdown
    const profileBtn = document.querySelector('.profile-btn');
    const profileMenu = document.getElementById('profile-menu');

    if (profileBtn && profileMenu) {
        // Выпадашка профиля — тоже слой: «назад» на телефоне закрывает её, а не
        // уводит со страницы.
        let profileLayer = null;
        const closeProfile = () => {
            if (profileLayer) AnimeiBack.close(profileLayer);
            else profileMenu.classList.remove('open');
        };

        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (profileMenu.classList.contains('open')) { closeProfile(); return; }
            profileMenu.classList.add('open');
            profileLayer = AnimeiBack.open(() => {
                profileLayer = null;
                profileMenu.classList.remove('open');
            });
        });

        document.addEventListener('click', () => {
            if (profileMenu.classList.contains('open')) closeProfile();
        });
    }

    // Поиск аниме в шапке (общий для всех страниц). На десктопе — поле ввода,
    // сабмит уходит нативным GET на catalog.html?q=…; на телефоне свёрнут до
    // иконки-лупы, по тапу поле выезжает. Каталог читает ?q= и сразу ищет.
    const searchForm = document.querySelector('.header__search');
    if (searchForm) {
        searchForm.action = appUrl('pages/catalog.html');
        const searchInput = searchForm.querySelector('.header__search-input');
        const searchToggle = searchForm.querySelector('.header__search-toggle');
        const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

        // Автокомплит: ищем прямо во время ввода и показываем результаты выпадающим
        // списком под полем; клик по результату ведёт сразу в плеер. Enter (сабмит)
        // остаётся как «показать все результаты» на странице каталога.
        const acList = document.createElement('div');
        acList.className = 'header__search-ac';
        acList.hidden = true;
        searchForm.appendChild(acList);

        const playerHref = (anime) => {
            const params = new URLSearchParams({
                id: anime.shikimoriId,
                title: animeTitle(anime),
                name: anime.name,
            });
            // Путь строим через appUrl: он сам знает, лежим мы в /app/ или в
            // /app/pages/. (Раньше здесь читалась несуществующая переменная
            // inPages — ReferenceError падал внутрь catch в runAc, и список
            // подсказок не показывался вообще никогда.)
            return appUrl('pages/player.html') + '?' + params.toString();
        };
        const hideAc = () => { acList.hidden = true; };
        const renderAc = (items) => {
            acList.innerHTML = '';
            const top = (items || []).slice(0, 6);
            if (!top.length) { hideAc(); return; }
            const lang = (typeof getLang === 'function') ? getLang() : 'ru';
            top.forEach((anime) => {
                const a = document.createElement('a');
                a.className = 'header__search-ac-item';
                a.href = playerHref(anime);
                const kind = (typeof I18N !== 'undefined' && I18N[lang] && I18N[lang]['kind.' + anime.kind]) || anime.kind || '';
                a.innerHTML =
                    (anime.posterPreview
                        ? '<img src="' + anime.posterPreview + '" alt="" loading="lazy">'
                        : '<span class="header__search-ac-noimg"></span>') +
                    '<span class="header__search-ac-txt"><span class="header__search-ac-title"></span><span class="header__search-ac-meta"></span></span>';
                a.querySelector('.header__search-ac-title').textContent = animeTitle(anime);
                a.querySelector('.header__search-ac-meta').textContent = [anime.year, kind].filter(Boolean).join(' · ');
                // Постер кэшируем для карточки «Продолжить» на главной.
                a.addEventListener('click', () => {
                    try {
                        if (anime.posterPreview) localStorage.setItem('animei:poster:' + anime.shikimoriId, anime.posterPreview);
                    } catch { /* localStorage может быть недоступен */ }
                });
                acList.appendChild(a);
            });
            acList.hidden = false;
        };

        let acTimer = null;
        let acLastQ = '';
        const runAc = async (q) => {
            if (typeof client === 'undefined') return;   // нет axios на странице — только сабмит
            let items;
            try {
                const { data: res } = await client.get('catalog/search', { params: { q } });
                items = res.data || [];
            } catch {
                hideAc();                                  // сеть молчит — просто без подсказок
                return;
            }
            if (q !== acLastQ) return;                     // пришёл устаревший ответ
            // Отрисовка — вне try: ошибку разметки глотать нельзя, иначе она
            // тихо оставляет список пустым (так и жил сломанный автокомплит).
            renderAc(items);
        };

        // Выбор стрелками: ↓/↑ ходят по подсказкам, Enter открывает выбранную
        // (без выбора Enter отправляет форму — «показать все в каталоге»).
        const acItems = () => [...acList.querySelectorAll('.header__search-ac-item')];
        const acActive = () => acList.querySelector('.header__search-ac-item--active');
        const acMove = (step) => {
            const items = acItems();
            if (!items.length) return;
            const cur = items.indexOf(acActive());
            const next = cur < 0
                ? (step > 0 ? 0 : items.length - 1)
                : (cur + step + items.length) % items.length;
            items.forEach((el) => el.classList.remove('header__search-ac-item--active'));
            items[next].classList.add('header__search-ac-item--active');
            items[next].scrollIntoView({ block: 'nearest' });
        };

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const q = searchInput.value.trim();
                acLastQ = q;
                clearTimeout(acTimer);
                if (q.length < 2) { hideAc(); return; }
                acTimer = setTimeout(() => runAc(q), 250);
            });
            searchInput.addEventListener('focus', () => {
                if (acList.children.length && searchInput.value.trim().length >= 2) acList.hidden = false;
            });
            searchInput.addEventListener('keydown', (e) => {
                if (acList.hidden) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    acMove(e.key === 'ArrowDown' ? 1 : -1);
                } else if (e.key === 'Enter') {
                    const active = acActive();
                    // click() — чтобы отработал обработчик строки (кэш постера),
                    // переход делаем сами: программный клик по ссылке не везде
                    // уводит со страницы.
                    if (active) { e.preventDefault(); active.click(); location.href = active.href; }
                }
            });
        }

        // Пустой запрос не отправляем.
        searchForm.addEventListener('submit', (e) => {
            if (!searchInput || searchInput.value.trim() === '') e.preventDefault();
        });

        // Раскрытый поиск — слой для системной «Назад» (AnimeiBack): кнопка
        // назад сворачивает поле, а не уводит со страницы.
        let searchLayer = null;
        const closeSearch = () => {
            searchForm.classList.remove('is-open');
            if (searchToggle) searchToggle.setAttribute('aria-expanded', 'false');
            hideAc();
        };
        const closeSearchLayer = () => {
            if (searchLayer && typeof AnimeiBack !== 'undefined') AnimeiBack.close(searchLayer);
            else closeSearch();
        };

        // Тап по лупе на телефоне раскрывает поле; повторный тап (когда уже
        // раскрыто и пусто) — сворачивает.
        if (searchToggle) {
            searchToggle.addEventListener('click', (e) => {
                if (!isMobile()) return;
                e.stopPropagation();
                const open = !searchForm.classList.contains('is-open');
                if (open) {
                    searchForm.classList.add('is-open');
                    searchToggle.setAttribute('aria-expanded', 'true');
                    if (searchInput) searchInput.focus();
                    if (typeof AnimeiBack !== 'undefined') {
                        searchLayer = AnimeiBack.open(() => { searchLayer = null; closeSearch(); });
                    }
                } else {
                    closeSearchLayer();
                }
            });
        }

        // Клик вне формы и Escape — сворачиваем раскрытое поле и прячем автокомплит.
        document.addEventListener('click', (e) => {
            if (!searchForm.contains(e.target)) {
                if (searchForm.classList.contains('is-open')) closeSearchLayer();
                else hideAc();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (searchForm.classList.contains('is-open')) closeSearchLayer();
                else hideAc();
            }
        });
    }

    // Профиль: показываем «Войти» гостю и почту + «Выйти» вошедшему.
    renderAuthState();
    showPendingLogoutToast();

    // На главной — «Продолжить просмотр», компактная строка «Слова из последнего
    // просмотра» (полная карточка с чекбоксами убрана по просьбе в v0.0.231),
    // план дня и живой счётчик учёбы на карточке «Учёба».
    renderContinueCard();
    renderSessionCard();
    renderDailyPlan();
    renderWeekActivity();
    // На iOS beforeinstallprompt не бывает — там строку показывает уже этот
    // вызов; на Android её обычно поднимет пришедшее позже событие.
    renderInstallHint();

    // Гость с лендинга ещё не набрал свою коллекцию — «Повторить всё» ему не по
    // делу и только распыляет. Прячем карточку; после входа в аккаунт вернётся.
    const customCard = document.getElementById('custom-study-card');
    if (customCard && localStorage.getItem('animei:fromLanding') === '1'
        && !(typeof isLoggedIn === 'function' && isLoggedIn())) {
        // display:none, а не hidden: у .mini-card свой display, он перебил бы [hidden]
        customCard.style.display = 'none';
    }
});

// ---- Слоты главной: скелетон → данные ---------------------------------------
// Блоки ленты стоят в разметке сразу, в состоянии .is-skel (место занято ещё
// до первой отрисовки — см. скрипт-резерватор в <head> index.html). Здесь мы
// только подменяем содержимое: показ данных не должен ничего двигать.

// Слот не понадобился (условие резерватора и рендера разошлись) — убираем его
// совсем, а не оставляем вечно мерцающую заглушку.
function dropSlot(el) {
    if (!el) return;
    el.classList.remove('is-skel');
    el.removeAttribute('aria-hidden');
    el.hidden = true;
}

// Данные готовы: снимаем заглушку и проявляем содержимое на её месте.
// stagger — номер блока в ленте, чтобы они проступали лесенкой, а не разом.
function fillSlot(el, html, stagger) {
    if (!el) return;
    const wasSkel = el.classList.contains('is-skel');
    el.innerHTML = html;
    el.classList.remove('is-skel');
    el.removeAttribute('aria-hidden');
    el.hidden = false;
    // Повторный рендер (обновление после синка) не анимируем — мигание на
    // месте читается как ошибка, а не как появление.
    if (!wasSkel) return;
    el.style.setProperty('--i', String(stagger || 0));
    el.classList.remove('anim-fade');
    void el.offsetWidth;   // рестарт анимации, если класс уже висел
    el.classList.add('anim-fade');
}

// «Продолжить просмотр» — первый блок главной: последний тайтл, серия и
// таймкод (пишет плеер в animei:lastWatch). Возврат в просмотр — один тап;
// сезон/серию/время плеер восстановит сам по своим ключам.
function renderContinueCard() {
    const el = document.getElementById('continue-card');
    if (!el) return;
    const lw = lsJson('animei:lastWatch');
    if (!lw || !lw.id || !lw.title) { dropSlot(el); return; }

    const p = new URLSearchParams({ id: lw.id, title: lw.title, name: lw.name || lw.title });
    el.href = './pages/player.html?' + p.toString();

    const mm = Math.floor((lw.time || 0) / 60);
    const ss = String(Math.floor((lw.time || 0) % 60)).padStart(2, '0');
    const meta = t('hub.continue.ep') + ' ' + lw.epNum + (lw.time > 0 ? ' · ' + mm + ':' + ss : '');

    fillSlot(el,
        '<div class="continue-card__poster">' + (lw.poster ? '<img src="" alt="" loading="lazy">' : '') + '</div>' +
        '<div class="continue-card__info">' +
        '<span class="continue-card__label" data-i18n="hub.continue"></span>' +
        '<span class="continue-card__title"></span>' +
        '<span class="continue-card__meta"></span>' +
        '</div>' +
        '<span class="continue-card__play"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
        '<button class="continue-card__close" type="button" aria-label="Close">×</button>', 0);
    if (lw.poster) el.querySelector('.continue-card__poster img').src = lw.poster;
    el.querySelector('.continue-card__label').textContent = t('hub.continue');
    el.querySelector('.continue-card__title').textContent = lw.title;
    el.querySelector('.continue-card__meta').textContent = meta;

    // Крестик убирает карточку с главной (указатель lastWatch). Позицию
    // просмотра (watchPos) не трогаем: если открыть тайтл заново, плеер
    // всё равно продолжит с того же места.
    el.querySelector('.continue-card__close').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.removeItem('animei:lastWatch'); } catch { /* недоступен */ }
        el.hidden = true;
        if (window.animeiTrack) window.animeiTrack('resume', 'dismiss');
    });

    if (window.animeiTrack) window.animeiTrack('resume', 'shown');
    el.addEventListener('click', () => {
        if (window.animeiTrack) window.animeiTrack('resume', 'click');
    });
}

// Слова прошлой сессии просмотра (пишет плеер в animei:lastSession) — тихий
// чип-таблетка «Слова из серии: N · Повторить». Не карточка: в ленте хаба уже
// две плашки в рамках («Продолжить просмотр» и план дня), третья читалась как
// стопка одинаковых блоков. Тап уводит все слова сессии в начало сегодняшних
// новых (srs:pickedFirst) и открывает учёбу; выбор по одному остаётся в панели
// конца серии в плеере. Полную карточку с чекбоксами убирали в v0.0.231.
function renderSessionCard() {
    const el = document.getElementById('session-card');
    if (!el) return;
    const s = lsJson('animei:lastSession');
    if (!s || s.processed || !Array.isArray(s.words) || !s.words.length) { dropSlot(el); return; }

    fillSlot(el,
        '<span class="session-card__chip">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
        '<span class="session-card__txt"></span>' +
        '<span class="session-card__go"></span>' +
        '<button class="session-card__close" type="button" aria-label="Close">×</button>' +
        '</span>', 1);

    el.querySelector('.session-card__txt').textContent =
        t('session.chip').replace('{n}', s.words.length);
    el.querySelector('.session-card__go').textContent = t('session.repeat');

    const markProcessed = () => {
        try {
            s.processed = true;
            localStorage.setItem('animei:lastSession', JSON.stringify(s));
        } catch { /* недоступен */ }
    };

    el.addEventListener('click', () => {
        try {
            const picked = lsJson('srs:pickedFirst', []);
            for (const w of s.words) if (!picked.includes(w.id)) picked.push(w.id);
            localStorage.setItem('srs:pickedFirst', JSON.stringify(picked));
        } catch { /* недоступен */ }
        markProcessed();
        if (window.animeiTrack) window.animeiTrack('session_card', 'home_compact:' + s.words.length);
    });

    // Крестик = «Позже»: сессия помечается обработанной, слова остаются в «Моих словах».
    el.querySelector('.session-card__close').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        markProcessed();
        el.hidden = true;
        if (window.animeiTrack) window.animeiTrack('session_card', 'home_later');
    });

    if (window.animeiTrack) window.animeiTrack('session_card', 'home_shown:' + s.words.length);
}

// ---- Дневной план -----------------------------------------------------------
// Ядро новой главной: учёба показана как конечная порция на сегодня
// («≈5 мин · 8 повторений · 5 новых → Начать»), а после выполнения — явное «на
// сегодня всё ✓» с CTA обратно к просмотру. Данные (due/fresh/streak) уже
// считает srsSummary().

// m:ss для плеера и watch-страницы; null/NaN → 0:00 (метаданные ещё не пришли).
function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
}

function escHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function dayKeyOf(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
        + '-' + String(d.getDate()).padStart(2, '0');
}

// Грубая оценка времени порции: повторение ≈10 c, новое слово ≈35 c.
function estimateMinutes(due, fresh) {
    return Math.max(1, Math.round((due * 10 + fresh * 35) / 60));
}

// Цель на сегодня фиксируем один раз за день — чтобы у кольца/полосы был
// знаменатель («8 из 13 сделано»). Если днём добавились слова и осталось больше
// цели — поднимаем планку.
function dailyTarget(remaining) {
    const day = dayKeyOf(new Date());
    const saved = lsJson('srs:planTarget');
    let target = (saved && saved.day === day) ? (saved.total || 0) : 0;
    if (!target || remaining > target) target = remaining;
    try { localStorage.setItem('srs:planTarget', JSON.stringify({ day, total: target })); } catch { /* недоступен */ }
    return target;
}

// Ссылка на незаконченный просмотр (для состояния «на сегодня всё»).
function resumeHref() {
    try {
        const lw = lsJson('animei:lastWatch');
        if (lw && lw.id && lw.title) {
            const p = new URLSearchParams({ id: lw.id, title: lw.title, name: lw.name || lw.title });
            return './pages/player.html?' + p.toString();
        }
    } catch { /* нет данных */ }
    return '';
}

function ringHTML(frac, label) {
    const r = 29, C = 2 * Math.PI * r;
    const off = C * (1 - Math.max(0, Math.min(1, frac)));
    return '<div class="daily-plan__ring">' +
        '<svg viewBox="0 0 64 64">' +
        '<circle class="dp-ring-bg" cx="32" cy="32" r="' + r + '"></circle>' +
        '<circle class="dp-ring-fg" cx="32" cy="32" r="' + r + '" stroke-dasharray="' +
        C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"></circle>' +
        '</svg>' +
        (label ? '<span class="daily-plan__ring-label">' + escHtml(label) + '</span>' : '') +
        '</div>';
}

// План рисуем СРАЗУ по локальной копии (srsSummary читает только localStorage),
// а сеть догоняет фоном. Раньше рендер ждал fetchDataFromServer — карточка
// появлялась через секунды после остальной ленты и сдвигала всё под собой.
function renderDailyPlan() {
    const el = document.getElementById('daily-plan');
    if (!el || typeof srsSummary !== 'function') return;

    // Вошедший без локальной копии слов (новое устройство, чистый кэш): по
    // локальным данным план выглядит «пустым», а после синка станет обычным —
    // это схлопывание и обратное разворачивание карточки. Такому держим
    // скелетон до ответа сервера: он уже занимает нужное место.
    const cached = lsJson('words');
    const waitForSync = !(Array.isArray(cached) && cached.length)
        && typeof isLoggedIn === 'function' && isLoggedIn();

    if (waitForSync) {
        // Заглушку держим не дольше пары секунд: у axios таймаут 5 минут, и
        // залипшая сеть иначе оставила бы мерцающее место вместо плана.
        setTimeout(() => { if (el.classList.contains('is-skel')) paintDailyPlan(el); }, 2500);
    } else {
        paintDailyPlan(el);
    }

    // Догоняем сервером: слова и расписание могли измениться на другом
    // устройстве. Отказ сети не должен ломать уже показанный план.
    (async () => {
        try {
            await fetchDataFromServer();
            if (typeof mergeServerSchedule === 'function') mergeServerSchedule();
        } catch { /* нет сети — остаёмся на локальной копии */ }
        paintDailyPlan(el);
    })();
}

// Один раз за загрузку отправляем состояние плана в аналитику. Флагом служит
// отдельная переменная, а не наличие скелетона: у вошедшего первая заливка
// может прийти уже после синка, и событие бы потерялось.
let planTracked = false;

// Отрисовка состояния плана по текущей локальной сводке. Вызывается один-два
// раза (сразу и/или после синка) — повторный раз молча, без анимации.
function paintDailyPlan(el) {
    let s;
    try { s = srsSummary(); } catch {
        // Локальная копия слов испорчена — вечно мерцающая заглушка хуже, чем
        // отсутствие блока: убираем слот и ждём следующей загрузки.
        dropSlot(el);
        return;
    }
    const first = el.classList.contains('is-skel');
    // className переписываем целиком (состояния плана взаимоисключающие), но
    // служебные классы сохраняем: is-skel до первой заливки, anim-fade — чтобы
    // быстрый ответ сервера не оборвал уже идущее появление.
    const keep = first ? ' is-skel' : (el.classList.contains('anim-fade') ? ' anim-fade' : '');

    // Ещё нет слов — первым делом предлагаем ГОТОВУЮ стартовую колоду
    // (beginner.html: 15 карточек со сценами, «В коллекцию» на каждой), а не
    // отправляем новичка сразу искать аниме: его первое действие — попробовать
    // учёбу на готовом, как было до редизайна главной.
    if (!s.total) {
        el.href = './pages/beginner.html?deck=core';
        el.className = 'daily-plan daily-plan--empty' + keep;
        fillSlot(el,
            '<div class="daily-plan__body">' +
            '<span class="daily-plan__eyebrow">' + escHtml(t('plan.title')) + '</span>' +
            '<span class="daily-plan__headline">' + escHtml(t('plan.empty.title')) + '</span>' +
            '<span class="daily-plan__sub">' + escHtml(t('plan.empty.sub')) + '</span>' +
            '</div>' +
            '<span class="daily-plan__cta">' + escHtml(t('plan.empty.cta')) + '</span>', 2);
        return;
    }

    const remaining = s.due + s.fresh;
    const target = dailyTarget(remaining);
    const doneCount = Math.max(0, target - remaining);
    const frac = target > 0 ? Math.min(1, doneCount / target) : 1;

    if (remaining === 0) {
        // На сегодня всё — зелёное состояние, CTA обратно к просмотру.
        el.href = resumeHref() || './pages/catalog.html';
        el.className = 'daily-plan daily-plan--done' + keep;
        fillSlot(el,
            ringHTML(1, '✓') +
            '<div class="daily-plan__body">' +
            // Надзаголовок «План на сегодня» здесь молчит: делать нечего, и
            // заголовок сам говорит про сегодня — лишняя строка только росла.
            '<span class="daily-plan__headline">' + escHtml(t('plan.done.title')) + '</span>' +
            '<span class="daily-plan__sub">' + escHtml(t('plan.done.sub')) + '</span>' +
            '</div>' +
            '<span class="daily-plan__cta">' + escHtml(t('plan.done.cta')) + '</span>', 2);
        if (!planTracked && window.animeiTrack) { planTracked = true; window.animeiTrack('daily_plan', 'done'); }
        return;
    }

    // Есть что делать: время + разбивка + прогресс.
    el.href = './pages/study.html';
    el.className = 'daily-plan daily-plan--plan' + keep;
    const mins = estimateMinutes(s.due, s.fresh);
    const chips = [];
    if (s.due) chips.push('<span class="dp-chip dp-chip--due">' + s.due + ' ' + escHtml(t('plan.reviews')) + '</span>');
    if (s.fresh) chips.push('<span class="dp-chip dp-chip--new">' + s.fresh + ' ' + escHtml(t('home.new')) + '</span>');
    fillSlot(el,
        ringHTML(frac, doneCount + '/' + target) +
        '<div class="daily-plan__body">' +
        '<span class="daily-plan__eyebrow">' + escHtml(t('plan.title')) + '</span>' +
        '<span class="daily-plan__headline">≈ ' + mins + ' ' + escHtml(t('plan.min')) + '</span>' +
        '<div class="daily-plan__chips">' + chips.join('') + '</div>' +
        '</div>' +
        '<span class="daily-plan__cta">' + escHtml(doneCount > 0 ? t('plan.resume') : t('plan.start')) + '</span>', 2);
    if (!planTracked && window.animeiTrack) { planTracked = true; window.animeiTrack('daily_plan', 'shown:' + remaining); }
}

// Небольшая недельная активность: последние 7 дней + серия занятий (🔥).
// Дни занятий пишет study-core в srs:days ('YYYY-MM-DD').
function renderWeekActivity() {
    const el = document.getElementById('week-strip');
    if (!el) return;
    const days = lsJson('srs:days', []);
    const active = new Set(Array.isArray(days) ? days : []);
    if (!active.size) { dropSlot(el); return; } // ещё ни одного дня занятий — нечего показывать

    const letters = (t('week.days') || 'Su,Mo,Tu,We,Th,Fr,Sa').split(',');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayK = dayKeyOf(today);

    let cells = '';
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const k = dayKeyOf(d);
        const cls = 'week-day'
            + (active.has(k) ? ' week-day--active' : '')
            + (k === todayK ? ' week-day--today' : '');
        cells += '<span class="' + cls + '">' + escHtml(letters[d.getDay()] || '') + '</span>';
    }

    // Серия дней подряд, заканчивая сегодня (или вчера — тогда сегодня ещё можно продолжить).
    let streak = 0;
    const cur = new Date(today);
    if (!active.has(dayKeyOf(cur))) cur.setDate(cur.getDate() - 1);
    while (active.has(dayKeyOf(cur))) { streak++; cur.setDate(cur.getDate() - 1); }

    fillSlot(el,
        '<div class="week-strip__days">' + cells + '</div>' +
        (streak > 1 && typeof tStreak === 'function'
            ? '<span class="week-strip__streak">🔥 ' + escHtml(tStreak(streak)) + '</span>'
            : ''), 3);

    // Праздник рубежа серии: 3/7/14/30/50/100 дней подряд. Показываем один раз
    // на рубеж (последний отмеченный — в localStorage), с маленькой анимацией.
    const MILESTONES = [100, 50, 30, 14, 7, 3];
    let celebrated = 0;
    try { celebrated = Number(localStorage.getItem('animei:streakMilestone')) || 0; } catch { /* нет localStorage */ }
    const hit = MILESTONES.find((m) => streak >= m && m > celebrated);
    if (hit && typeof tStreak === 'function') {
        try { localStorage.setItem('animei:streakMilestone', String(hit)); } catch { /* ок */ }
        const banner = document.createElement('div');
        banner.className = 'week-strip__milestone';
        banner.innerHTML = '🎉 <b>' + escHtml(tStreak(hit)) + '</b> — ' + escHtml(t('week.milestone'));
        el.appendChild(banner);
        if (window.animeiTrack) window.animeiTrack('streak_milestone', String(hit));
    }
}

// Подтверждение выхода. Само нажатие «Выйти» перезагружает страницу, поэтому
// сообщение ставится в очередь флагом и показывается уже после загрузки —
// иначе на страницах, которые от выхода внешне не меняются (настройки, учёба),
// нажатие выглядело безответным.
function showPendingLogoutToast() {
    let pending = null;
    try { pending = localStorage.getItem('animei:loggedOut'); } catch { /* нет localStorage */ }
    if (!pending) return;
    try { localStorage.removeItem('animei:loggedOut'); } catch { /* ок, покажем ещё раз */ }
    if (typeof showSnackbar === 'function') showSnackbar(t('auth.loggedOut'), { duration: 2600 });
}

function renderAuthState() {
    const menu = document.getElementById('profile-menu');
    if (!menu) return;

    const loginUrl = appUrl('pages/login.html');
    const settingsUrl = appUrl('pages/settings.html');
    // «Мой прогресс» живёт в меню профиля: это разговор про себя, а не про
    // приложение. Гостю показываем тоже — прогресс до входа считается локально.
    const progressUrl = appUrl('pages/progress.html');
    const progressItem = `<a href="${progressUrl}">${NAV_ICONS['nav.progress']}<span class="nav-label" data-i18n="nav.progress">My progress</span></a>`;

    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        const email = localStorage.getItem('animei:email');
        // Экранируем почту — она попадает в innerHTML (защита от порчи localStorage).
        const safeEmail = email ? email.replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) : '';
        menu.innerHTML =
            (safeEmail ? `<span class="profile-menu__email">${safeEmail}</span>` : '') +
            progressItem +
            `<a href="${settingsUrl}#account">${NAV_ICONS['nav.account']}<span class="nav-label" data-i18n="nav.account">Account settings</span></a>` +
            `<a href="#" id="logout-btn">${NAV_ICONS['nav.logout']}<span class="nav-label" data-i18n="nav.logout">Log out</span></a>`;
    } else {
        menu.innerHTML =
            `<a href="${loginUrl}" id="login-link">${NAV_ICONS['nav.login']}<span class="nav-label" data-i18n="nav.login">Log in</span></a>` +
            progressItem +
            `<a href="${settingsUrl}">${NAV_ICONS['nav.settings']}<span class="nav-label" data-i18n="nav.settings">Settings</span></a>`;
    }

    // Если на странице подключён i18n — переведём только что вставленные пункты.
    if (typeof applyI18n === 'function') applyI18n();

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            // Сначала гасим сессию на сервере (иначе refresh-токен остаётся
            // рабочим ещё 90 дней), потом чистим локально. Нет сети — выходим
            // всё равно: revokeCurrentSession ждёт не дольше 4 секунд.
            if (window.animeiTrack) animeiTrack('auth', 'logout');
            if (typeof revokeCurrentSession === 'function') await revokeCurrentSession();
            logout();
            // Флаг переживает перезагрузку, снекбар — нет: показать его прямо
            // здесь бессмысленно, страница тут же перезагрузится и убьёт его.
            // Раньше выход так и выглядел «ничего не произошло»: на настройках
            // и в учёбе после перезагрузки тот же экран и никакого ответа на
            // нажатие. Сообщение показывает уже новая страница (см.
            // showPendingLogoutToast).
            try { localStorage.setItem('animei:loggedOut', '1'); } catch { /* приватный режим */ }
            window.location.reload();
        });
    }
}

// ---------- Ленивый hls.js ----------
// hls.min.js весит 530 КБ и нужен только когда реально играем HLS-поток —
// прямые mp4 (AnimeJoy/KAA) и сама загрузка страницы обходятся без него.
// Скрипт подтягиваем один раз при первом обращении.
let hlsLoadPromise = null;
function loadHlsJs() {
    if (typeof Hls !== 'undefined') return Promise.resolve();
    if (!hlsLoadPromise) {
        hlsLoadPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = appUrl('libs/hls/hls.min.js');
            s.onload = () => resolve();
            s.onerror = () => {
                hlsLoadPromise = null; // дать шанс повторной попытке
                reject(new Error('hls.js не загрузился'));
            };
            document.head.appendChild(s);
        });
    }
    return hlsLoadPromise;
}
