// Версия приложения — единый источник. Бампится вместе с CACHE_NAME в
// service-worker.js при каждом деплое (последнее число). Формат v0.0.N —
// показывается в футере сайдбара, чтобы визуально валидировать, что деплой доехал.
const APP_VERSION = 'v0.0.301';

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

    const inPages = window.location.pathname.includes('/pages/');
    const href = (inPages ? './' : './pages/') + 'admin.html';
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

    const base = ['localhost', '127.0.0.1', ''].includes(location.hostname)
        ? 'http://localhost:3005' : location.origin;
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
        // НЕ перезагружаем страницу с видео (плеер): reload обрывал загрузку HLS
        // («видео не грузится с первого раза»).
        if (document.querySelector('video')) return;
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

    window.addEventListener('load', () => {
        // updateViaCache: 'none' — браузер не берёт сам скрипт SW из HTTP-кеша
        // при проверке обновлений, поэтому новая версия SW находится сразу.
        // SW лежит в /app/. С относительным './' на страницах из /app/pages/ путь
        // резолвился в /app/pages/service-worker.js → 404, и SW там не регистрировался
        // (офлайн-кэш и авто-перезагрузка после деплоя не работали при заходе сразу
        // на подстраницу). Берём путь от корня приложения — работает с любой страницы.
        const swUrl = (window.location.pathname.includes('/pages/') ? '../' : './') + 'service-worker.js';
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

async function fetchAndDecode(url) {
    const response = await fetch(url);
    const data = await response.json();

    const decodeHTML = (str) => {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = str;
        return textarea.value;
    };

    return JSON.parse(JSON.stringify(data), (_, value) =>
        typeof value === 'string' ? decodeHTML(value) : value
    );
}

function dataPath(file) {
    const inPages = window.location.pathname.includes('/pages/');
    return (inPages ? '../' : './') + 'data/' + file;
}

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
        const inPages = window.location.pathname.includes('/pages/');
        a.href = (inPages ? './' : './pages/') + 'settings.html';
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
        const inPages = window.location.pathname.includes('/pages/');
        const homeUrl = (inPages ? '../' : './') + 'index.html';
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
        const inPages = window.location.pathname.includes('/pages/');
        searchForm.action = (inPages ? './' : './pages/') + 'catalog.html';
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
            return (inPages ? './' : './pages/') + 'player.html?' + params.toString();
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
            try {
                const { data: res } = await client.get('catalog/search', { params: { q } });
                if (q !== acLastQ) return;                 // пришёл устаревший ответ
                renderAc(res.data || []);
            } catch { hideAc(); }
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
        }

        // Пустой запрос не отправляем.
        searchForm.addEventListener('submit', (e) => {
            if (!searchInput || searchInput.value.trim() === '') e.preventDefault();
        });

        // Тап по лупе на телефоне раскрывает поле; повторный тап (когда уже
        // раскрыто и пусто) — сворачивает.
        if (searchToggle) {
            searchToggle.addEventListener('click', (e) => {
                if (!isMobile()) return;
                e.stopPropagation();
                const open = !searchForm.classList.contains('is-open');
                searchForm.classList.toggle('is-open', open);
                searchToggle.setAttribute('aria-expanded', String(open));
                if (open && searchInput) searchInput.focus();
                if (!open) hideAc();
            });
        }

        // Клик вне формы и Escape — сворачиваем раскрытое поле и прячем автокомплит.
        document.addEventListener('click', (e) => {
            if (!searchForm.contains(e.target)) {
                searchForm.classList.remove('is-open');
                if (searchToggle) searchToggle.setAttribute('aria-expanded', 'false');
                hideAc();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchForm.classList.remove('is-open');
                if (searchToggle) searchToggle.setAttribute('aria-expanded', 'false');
                hideAc();
            }
        });
    }

    // Профиль: показываем «Войти» гостю и почту + «Выйти» вошедшему.
    renderAuthState();

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
        // display:none, а не hidden: у .hub-card свой display, он перебил бы [hidden]
        customCard.style.display = 'none';
    }
});

// «Продолжить просмотр» — первый блок главной: последний тайтл, серия и
// таймкод (пишет плеер в animei:lastWatch). Возврат в просмотр — один тап;
// сезон/серию/время плеер восстановит сам по своим ключам.
function renderContinueCard() {
    const el = document.getElementById('continue-card');
    if (!el) return;
    let lw = null;
    try { lw = JSON.parse(localStorage.getItem('animei:lastWatch') || 'null'); } catch { /* битый JSON */ }
    if (!lw || !lw.id || !lw.title) return;

    const p = new URLSearchParams({ id: lw.id, title: lw.title, name: lw.name || lw.title });
    el.href = './pages/player.html?' + p.toString();

    const mm = Math.floor((lw.time || 0) / 60);
    const ss = String(Math.floor((lw.time || 0) % 60)).padStart(2, '0');
    const meta = t('hub.continue.ep') + ' ' + lw.epNum + (lw.time > 0 ? ' · ' + mm + ':' + ss : '');

    el.innerHTML =
        '<div class="continue-card__poster">' + (lw.poster ? '<img src="" alt="" loading="lazy">' : '') + '</div>' +
        '<div class="continue-card__info">' +
        '<span class="continue-card__label" data-i18n="hub.continue"></span>' +
        '<span class="continue-card__title"></span>' +
        '<span class="continue-card__meta"></span>' +
        '</div>' +
        '<span class="continue-card__play"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
        '<button class="continue-card__close" type="button" aria-label="Close">×</button>';
    if (lw.poster) el.querySelector('.continue-card__poster img').src = lw.poster;
    el.querySelector('.continue-card__label').textContent = t('hub.continue');
    el.querySelector('.continue-card__title').textContent = lw.title;
    el.querySelector('.continue-card__meta').textContent = meta;
    el.hidden = false;

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
    let s = null;
    try { s = JSON.parse(localStorage.getItem('animei:lastSession') || 'null'); } catch { /* битый JSON */ }
    if (!s || s.processed || !Array.isArray(s.words) || !s.words.length) return;

    el.innerHTML =
        '<span class="session-card__chip">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
        '<span class="session-card__txt"></span>' +
        '<span class="session-card__go"></span>' +
        '<button class="session-card__close" type="button" aria-label="Close">×</button>' +
        '</span>';

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
            const picked = JSON.parse(localStorage.getItem('srs:pickedFirst') || '[]');
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

    el.hidden = false;
    if (window.animeiTrack) window.animeiTrack('session_card', 'home_shown:' + s.words.length);
}

// ---- Дневной план -----------------------------------------------------------
// Ядро новой главной: учёба показана как конечная порция на сегодня
// («≈5 мин · 8 повторений · 5 новых → Начать»), а после выполнения — явное «на
// сегодня всё ✓» с CTA обратно к просмотру. Данные (due/fresh/streak) уже
// считает srsSummary(). Три визуальных варианта переключаются ?hub=1|2|3.

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
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('srs:planTarget') || 'null'); } catch { /* битый JSON */ }
    let target = (saved && saved.day === day) ? (saved.total || 0) : 0;
    if (!target || remaining > target) target = remaining;
    try { localStorage.setItem('srs:planTarget', JSON.stringify({ day, total: target })); } catch { /* недоступен */ }
    return target;
}

// Ссылка на незаконченный просмотр (для состояния «на сегодня всё»).
function resumeHref() {
    try {
        const lw = JSON.parse(localStorage.getItem('animei:lastWatch') || 'null');
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

async function renderDailyPlan() {
    const el = document.getElementById('daily-plan');
    if (!el || typeof srsSummary !== 'function') return;

    // Вариант оформления: ?hub=1|2|3 (по умолчанию 1). Класс вешаем на .hub.
    const hub = document.getElementById('hub');
    if (hub) {
        const v = new URLSearchParams(location.search).get('hub');
        hub.classList.add('hub--v' + (['1', '2', '3'].includes(v) ? v : '1'));
    }

    // srsSummary читает localStorage, так что план строится и без сети.
    // Серверную синхронизацию пробуем, но её отказ не должен прятать план.
    try {
        await fetchDataFromServer();
        if (typeof mergeServerSchedule === 'function') mergeServerSchedule();
    } catch { /* нет сети — считаем по локальной копии расписания */ }

    let s;
    try { s = srsSummary(); } catch { return; }

    // Ещё нет слов — первым делом предлагаем ГОТОВУЮ стартовую колоду
    // (beginner.html: 15 карточек со сценами, «В коллекцию» на каждой), а не
    // отправляем новичка сразу искать аниме: его первое действие — попробовать
    // учёбу на готовом, как было до редизайна главной.
    if (!s.total) {
        el.className = 'daily-plan daily-plan--empty';
        el.href = './pages/beginner.html?deck=core';
        el.innerHTML =
            '<div class="daily-plan__body">' +
            '<span class="daily-plan__eyebrow">' + escHtml(t('plan.title')) + '</span>' +
            '<span class="daily-plan__headline">' + escHtml(t('plan.empty.title')) + '</span>' +
            '<span class="daily-plan__sub">' + escHtml(t('plan.empty.sub')) + '</span>' +
            '</div>' +
            '<span class="daily-plan__cta">' + escHtml(t('plan.empty.cta')) + '</span>';
        el.hidden = false;
        return;
    }

    const remaining = s.due + s.fresh;
    const target = dailyTarget(remaining);
    const doneCount = Math.max(0, target - remaining);
    const frac = target > 0 ? Math.min(1, doneCount / target) : 1;

    if (remaining === 0) {
        // На сегодня всё — зелёное состояние, CTA обратно к просмотру.
        el.className = 'daily-plan daily-plan--done';
        el.href = resumeHref() || './pages/catalog.html';
        el.innerHTML =
            ringHTML(1, '✓') +
            '<div class="daily-plan__body">' +
            '<span class="daily-plan__eyebrow">' + escHtml(t('plan.title')) + '</span>' +
            '<span class="daily-plan__headline">' + escHtml(t('plan.done.title')) + '</span>' +
            '<span class="daily-plan__sub">' + escHtml(t('plan.done.sub')) + '</span>' +
            '</div>' +
            '<span class="daily-plan__cta">' + escHtml(t('plan.done.cta')) + '</span>';
        el.hidden = false;
        if (window.animeiTrack) window.animeiTrack('daily_plan', 'done');
        return;
    }

    // Есть что делать: время + разбивка + прогресс.
    el.className = 'daily-plan daily-plan--plan';
    el.href = './pages/study.html';
    const mins = estimateMinutes(s.due, s.fresh);
    const chips = [];
    if (s.due) chips.push('<span class="dp-chip dp-chip--due">' + s.due + ' ' + escHtml(t('plan.reviews')) + '</span>');
    if (s.fresh) chips.push('<span class="dp-chip dp-chip--new">' + s.fresh + ' ' + escHtml(t('home.new')) + '</span>');
    el.innerHTML =
        ringHTML(frac, doneCount + '/' + target) +
        '<div class="daily-plan__body">' +
        '<span class="daily-plan__eyebrow">' + escHtml(t('plan.title')) + '</span>' +
        '<span class="daily-plan__headline">≈ ' + mins + ' ' + escHtml(t('plan.min')) + '</span>' +
        '<div class="daily-plan__chips">' + chips.join('') + '</div>' +
        '<div class="daily-plan__bar"><span style="width:' + Math.round(frac * 100) + '%"></span></div>' +
        '</div>' +
        '<span class="daily-plan__cta">' + escHtml(doneCount > 0 ? t('plan.resume') : t('plan.start')) + '</span>';
    el.hidden = false;
    if (window.animeiTrack) window.animeiTrack('daily_plan', 'shown:' + remaining);
}

// Небольшая недельная активность: последние 7 дней + серия занятий (🔥).
// Дни занятий пишет study-core в srs:days ('YYYY-MM-DD').
function renderWeekActivity() {
    const el = document.getElementById('week-strip');
    if (!el) return;
    let days = [];
    try { days = JSON.parse(localStorage.getItem('srs:days') || '[]'); } catch { /* битый JSON */ }
    const active = new Set(Array.isArray(days) ? days : []);
    if (!active.size) return; // ещё ни одного дня занятий — нечего показывать

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

    el.innerHTML =
        '<div class="week-strip__days">' + cells + '</div>' +
        (streak > 1 && typeof tStreak === 'function'
            ? '<span class="week-strip__streak">🔥 ' + escHtml(tStreak(streak)) + '</span>'
            : '');
    el.hidden = false;

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

function renderAuthState() {
    const menu = document.getElementById('profile-menu');
    if (!menu) return;

    const isInPages = window.location.pathname.includes('/pages/');
    const loginUrl = isInPages ? './login.html' : './pages/login.html';
    const settingsUrl = isInPages ? './settings.html' : './pages/settings.html';

    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        const email = localStorage.getItem('animei:email');
        // Экранируем почту — она попадает в innerHTML (защита от порчи localStorage).
        const safeEmail = email ? email.replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) : '';
        menu.innerHTML =
            (safeEmail ? `<span class="profile-menu__email">${safeEmail}</span>` : '') +
            `<a href="${settingsUrl}">${NAV_ICONS['nav.account']}<span class="nav-label" data-i18n="nav.account">Account settings</span></a>` +
            `<a href="#" id="logout-btn">${NAV_ICONS['nav.logout']}<span class="nav-label" data-i18n="nav.logout">Log out</span></a>`;
    } else {
        menu.innerHTML =
            `<a href="${loginUrl}" id="login-link">${NAV_ICONS['nav.login']}<span class="nav-label" data-i18n="nav.login">Log in</span></a>` +
            `<a href="${settingsUrl}">${NAV_ICONS['nav.settings']}<span class="nav-label" data-i18n="nav.settings">Settings</span></a>`;
    }

    // Если на странице подключён i18n — переведём только что вставленные пункты.
    if (typeof applyI18n === 'function') applyI18n();

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
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
            const inPages = location.pathname.includes('/pages/');
            s.src = (inPages ? '../' : './') + 'libs/hls/hls.min.js';
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
