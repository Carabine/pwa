// Версия приложения — единый источник. Бампится вместе с CACHE_NAME в
// service-worker.js при каждом деплое (последнее число). Формат v0.0.N —
// показывается в футере сайдбара, чтобы визуально валидировать, что деплой доехал.
const APP_VERSION = 'v0.0.74';

// Иконки для пунктов меню (сайдбар + профиль). Единый набор, вставляется JS —
// так не дублируем svg в каждой HTML-странице и покрываем динамические пункты.
const NAV_ICONS = {
    'nav.home': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/></svg>',
    'nav.catalog': '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
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
}

function addSidebarIcons() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.querySelectorAll('a[data-i18n]').forEach(iconifyLink);
}

// ========== Service Worker ==========

if ('serviceWorker' in navigator) {
    // Когда новый SW берёт управление (после skipWaiting + clients.claim) —
    // один раз перезагружаем страницу, чтобы свежие CSS/JS применились сразу,
    // без ручного перезапуска приложения. Флаг защищает от цикла перезагрузок.
    let swReloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (swReloading) return;
        swReloading = true;
        window.location.reload();
    });

    window.addEventListener('load', () => {
        // updateViaCache: 'none' — браузер не берёт сам скрипт SW из HTTP-кеша
        // при проверке обновлений, поэтому новая версия SW находится сразу.
        navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
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

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

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
        console.error('Error fetching data:', error);
        localStorage.setItem('words', '[]');
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

    // Версия в сайдбаре — маркер того, какой деплой сейчас в приложении.
    // Элемент захардкожен в HTML сразу под шапкой (гарантированно виден даже
    // при старом app.js); здесь только обновляем его текст из APP_VERSION —
    // единого источника. Если элемента нет (старый HTML) — создаём.
    if (sidebar) {
        let ver = sidebar.querySelector('.sidebar__version');
        if (!ver) {
            ver = document.createElement('div');
            ver.className = 'sidebar__version';
            const brand = sidebar.querySelector('.sidebar__brand');
            if (brand) brand.insertAdjacentElement('afterend', ver);
            else sidebar.appendChild(ver);
        }
        ver.textContent = APP_VERSION;
    }

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

    if (menuBtn && sidebar && overlay) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.add('open');
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        });
    }

    // Profile dropdown
    const profileBtn = document.querySelector('.profile-btn');
    const profileMenu = document.getElementById('profile-menu');

    if (profileBtn && profileMenu) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('open');
        });

        document.addEventListener('click', () => {
            profileMenu.classList.remove('open');
        });
    }

    // Профиль: показываем «Войти» гостю и почту + «Выйти» вошедшему.
    renderAuthState();

    // На главной — живой счётчик учёбы на карточке «Учёба».
    renderHomeProgress();
});

// «Сегодня: 5 к повторению · 3 новых · 🔥 4 дня подряд» — чтобы было видно,
// зачем заходить каждый день. Работает только на главной (там есть элемент).
async function renderHomeProgress() {
    const el = document.getElementById('study-progress');
    if (!el || typeof srsSummary !== 'function') return;

    try {
        await fetchDataFromServer();
        if (typeof mergeServerSchedule === 'function') mergeServerSchedule();
        const s = srsSummary();
        if (!s.total) return; // слов ещё нет — нечего показывать

        if (s.due + s.fresh === 0) {
            el.textContent = t('home.allClear');
            el.classList.add('hub-card__progress--clear');
        } else {
            const parts = [];
            if (s.due) parts.push(s.due + ' ' + t('home.due'));
            if (s.fresh) parts.push(s.fresh + ' ' + t('home.new'));
            let text = t('home.today') + ' ' + parts.join(' · ');
            if (s.streak > 1) text += ' · 🔥 ' + tStreak(s.streak);
            el.textContent = text;
        }
        el.hidden = false;
    } catch { /* не вышло посчитать — карточка просто без счётчика */ }
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
