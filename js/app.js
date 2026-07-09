// Версия приложения — единый источник. Бампится вместе с CACHE_NAME в
// service-worker.js при каждом деплое. Показывается в футере сайдбара
// (см. ниже), чтобы визуально валидировать, что деплой доехал.
const APP_VERSION = 'v51';

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

    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        const email = localStorage.getItem('animei:email');
        menu.innerHTML =
            (email ? `<span class="profile-menu__email">${email}</span>` : '') +
            '<a href="#" id="logout-btn" data-i18n="nav.logout">Log out</a>';
    } else {
        menu.innerHTML =
            `<a href="${loginUrl}" id="login-link" data-i18n="nav.login">Log in</a>`;
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
