// Версия приложения — единый источник. Бампится вместе с CACHE_NAME в
// service-worker.js при каждом деплое (последнее число). Формат v0.0.N —
// показывается в футере сайдбара, чтобы визуально валидировать, что деплой доехал.
const APP_VERSION = 'v0.0.148';

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
        // Кнопка меню переключает .open. На телефоне это выезжающая шторка (с
        // затемняющим оверлеем), на десктопе — та же .open раскрывает постоянную
        // рейку из «только иконки» в «иконки + подписи» (оверлей там скрыт CSS,
        // поэтому его класс ни на что не влияет). Toggle, а не add — чтобы на
        // десктопе повторное нажатие сворачивало рейку обратно.
        menuBtn.addEventListener('click', () => {
            const open = sidebar.classList.toggle('open');
            overlay.classList.toggle('open', open);
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        });
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
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('open');
        });

        document.addEventListener('click', () => {
            profileMenu.classList.remove('open');
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
                title: anime.russian || anime.name,
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
                a.querySelector('.header__search-ac-title').textContent = anime.russian || anime.name;
                a.querySelector('.header__search-ac-meta').textContent = [anime.year, kind].filter(Boolean).join(' · ');
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

    // На главной — живой счётчик учёбы на карточке «Учёба».
    renderHomeProgress();

    // Гость с лендинга ещё не набрал свою коллекцию — «Повторить всё» ему не по
    // делу и только распыляет. Прячем карточку; после входа в аккаунт вернётся.
    const customCard = document.getElementById('custom-study-card');
    if (customCard && localStorage.getItem('animei:fromLanding') === '1'
        && !(typeof isLoggedIn === 'function' && isLoggedIn())) {
        // display:none, а не hidden: у .hub-card свой display, он перебил бы [hidden]
        customCard.style.display = 'none';
    }
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
