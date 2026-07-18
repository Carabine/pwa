// Каталог: по умолчанию показываем популярные тайтлы, поиск — фильтр по названию.
// Данные с нашего бэкенда (Shikimori), переход в плеер по клику.

const searchInput = document.getElementById('search-input');
const resultsEl = document.getElementById('results');
const statusEl = document.getElementById('status');

// Автофокус поля поиска — ТОЛЬКО на десктопе (мышь). Раньше был HTML-атрибут
// autofocus, но на телефоне он при каждом заходе поднимал экранную клавиатуру.
// На тач-устройствах фокус ставит пользователь сам, тапнув по полю.
if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    searchInput.focus();
}
const headingEl = document.getElementById('heading');

let debounceTimer = null;
let lastQuery = '';
let popularItems = null;   // кэш популярного, чтобы не грузить повторно
let currentItems = [];     // что сейчас на экране (до фильтра) — для пере-рендера чипами
let diffFilter = 'all';    // 'all' | 'easy' — фильтр по сложности языка

// Запрос из поиска в шапке приходит как ?q=… — подставляем в поле и сразу ищем.
const initialQ = (new URLSearchParams(location.search).get('q') || '').trim();

function showStatus(key) {
    statusEl.textContent = t(key);
    statusEl.style.display = '';
}

function hideStatus() {
    statusEl.style.display = 'none';
}

// Мерцающие плейсхолдеры, пока идёт загрузка — как на стриминговых сайтах.
function renderSkeletons(n = 12) {
    hideStatus();
    resultsEl.innerHTML = Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
}

// Сложность языка тайтла из кураторской карты (anime-difficulty.js);
// неразмеченные — «средне», без бейджа.
function difficultyOf(anime) {
    return window.AnimeDifficulty ? window.AnimeDifficulty.map[anime.shikimoriId] : undefined;
}

function renderCards(items) {
    hideStatus();
    currentItems = items;
    resultsEl.innerHTML = '';

    const shown = diffFilter === 'easy' ? items.filter(a => difficultyOf(a) === 'easy') : items;
    if (!shown.length) {
        // Под фильтром «Полегче» — своё сообщение (подборка-пилюли остаётся видимой).
        showStatus(diffFilter === 'easy' ? 'catalog.easyEmpty' : 'catalog.empty');
        return;
    }

    shown.forEach((anime, i) => {
        const kind = I18N[getLang()]['kind.' + anime.kind] || anime.kind;
        const hasScore = anime.score && anime.score !== '0.0';
        const diff = difficultyOf(anime);

        const card = document.createElement('div');
        card.className = 'anime-card';
        card.style.animationDelay = Math.min(i * 30, 400) + 'ms';
        card.innerHTML = `
            <div class="anime-card__poster">
                ${anime.posterPreview ? `<img src="${anime.posterPreview}" alt="" loading="lazy">` : ''}
                <div class="anime-card__shade"></div>
            </div>
            ${kind ? '<span class="anime-card__kind"></span>' : ''}
            ${hasScore ? `<span class="anime-card__score">★ ${anime.score}</span>` : ''}
            ${diff ? `<span class="anime-card__diff anime-card__diff--${diff}"></span>` : ''}
            <button class="anime-card__play" tabindex="-1" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <div class="anime-card__info">
                <div class="anime-card__title"></div>
                <div class="anime-card__meta"></div>
            </div>`;

        if (kind) card.querySelector('.anime-card__kind').textContent = kind;
        if (diff) card.querySelector('.anime-card__diff').textContent = t('catalog.diff.' + diff);
        card.querySelector('.anime-card__title').textContent = anime.russian || anime.name;
        card.querySelector('.anime-card__meta').textContent = [
            anime.year,
            anime.episodes ? tEpisodes(anime.episodes) : null,
        ].filter(Boolean).join(' · ');

        card.addEventListener('click', () => {
            // Постер кэшируем для карточки «Продолжить» на главной: у плеера
            // своего постера нет, а тут он под рукой.
            try {
                if (anime.posterPreview) localStorage.setItem('animei:poster:' + anime.shikimoriId, anime.posterPreview);
            } catch { /* localStorage может быть недоступен */ }
            const params = new URLSearchParams({
                id: anime.shikimoriId,
                title: anime.russian || anime.name,
                name: anime.name,
            });
            window.location.href = './player.html?' + params.toString();
        });

        resultsEl.appendChild(card);
    });
}

// Популярное — стартовый экран каталога
async function loadPopular() {
    headingEl.style.display = '';
    headingEl.textContent = t('catalog.popular');
    renderSkeletons();

    try {
        const { data: res } = await client.get('catalog/popular');
        popularItems = res.data || [];

        // пока грузилось, пользователь мог начать искать — не перетираем результаты
        if (searchInput.value.trim().length >= 2) return;

        if (!popularItems.length) {
            resultsEl.innerHTML = '';
            showStatus('catalog.empty');
            return;
        }
        renderCards(popularItems);
    } catch (err) {
        console.error(err);
        resultsEl.innerHTML = '';
        showStatus('catalog.error');
    }
}

// Вернуться к популярному (когда очистили поиск)
function showPopular() {
    headingEl.style.display = '';
    headingEl.textContent = t('catalog.popular');

    if (popularItems) {
        if (popularItems.length) renderCards(popularItems);
        else showStatus('catalog.empty');
    } else {
        loadPopular();
    }
}

searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = searchInput.value.trim();

    if (q.length < 2) {
        lastQuery = '';
        showPopular();
        return;
    }

    debounceTimer = setTimeout(() => search(q), 400);
});

async function search(query) {
    lastQuery = query;
    headingEl.style.display = 'none';
    renderSkeletons();

    try {
        const { data: res } = await client.get('catalog/search', { params: { q: query } });
        if (query !== lastQuery) return;

        const items = res.data || [];
        if (window.animeiTrack) window.animeiTrack('search', query + ' → ' + items.length);
        if (!items.length) {
            resultsEl.innerHTML = '';
            showStatus('catalog.empty');
            return;
        }
        renderCards(items);
    } catch (err) {
        console.error(err);
        resultsEl.innerHTML = '';
        showStatus('catalog.error');
    }
}

// ---- Фильтр по сложности языка: чипы «Все / Полегче» + подборка для новичков.
// Разметка кураторская (anime-difficulty.js), поэтому фильтр честный: что не
// размечено как простое — под фильтром не показываем, но даём проверенные
// тайтлы пилюлями (тап = обычный поиск).
const chipsEl = document.getElementById('diff-chips');
const picksEl = document.getElementById('easy-picks');

function setDiffFilter(val) {
    diffFilter = val;
    if (chipsEl) {
        chipsEl.querySelectorAll('.catalog-chip').forEach(b =>
            b.classList.toggle('catalog-chip--active', b.dataset.val === val));
    }
    if (picksEl) picksEl.hidden = val !== 'easy';
    renderCards(currentItems);
    if (window.animeiTrack && val === 'easy') window.animeiTrack('catalog', 'filter:easy');
}

if (chipsEl) {
    chipsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.catalog-chip');
        if (btn && btn.dataset.val !== diffFilter) setDiffFilter(btn.dataset.val);
    });
}

if (picksEl && window.AnimeDifficulty) {
    for (const pick of window.AnimeDifficulty.easyPicks) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pick-chip';
        b.textContent = pick.label;
        b.addEventListener('click', () => {
            // Пилюля — навигация к конкретному тайтлу: фильтр снимаем, чтобы
            // сезоны/фильмы франшизы не прятались из-за неразмеченных id.
            setDiffFilter('all');
            searchInput.value = pick.q;
            search(pick.q);
        });
        picksEl.appendChild(b);
    }
}

if (initialQ.length >= 2) {
    searchInput.value = initialQ;
    search(initialQ);
} else {
    loadPopular();
}
