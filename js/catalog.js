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
let mode = 'popular';       // 'popular' | 'search' | 'easy' — что сейчас на экране
let popularItems = [];      // накопленные страницы популярного (для ленивой подгрузки)
let popularPage = 1;        // последняя загруженная страница популярного
let popularLoading = false; // идёт подгрузка следующей страницы
let popularDone = false;    // страницы кончились
let easyItems = null;       // кэш кураторских простых тайтлов («Полегче»)
let diffFilter = 'all';     // 'all' | 'easy' — активный чип фильтра

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
    resultsEl.innerHTML = Array.from({ length: n }, () => '<div class="skeleton skel"></div>').join('');
}

// Сложность языка тайтла из кураторской карты (anime-difficulty.js);
// размечены только уверенные 'easy'/'hard', всё остальное — 'medium' (жёлтая
// полоска). Карту заполняем по мере кураторства — со временем «средних» меньше.
function difficultyOf(anime) {
    const d = window.AnimeDifficulty && window.AnimeDifficulty.map[anime.shikimoriId];
    return d || 'medium';
}

// Одна карточка тайтла. Полоска сложности языка есть у каждой карточки:
// зелёная 'easy', жёлтая 'medium', красная 'hard'.
function buildCard(anime, i) {
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
        <span class="anime-card__diff anime-card__diff--${diff}"></span>
        <button class="anime-card__play" tabindex="-1" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <div class="anime-card__info">
            <div class="anime-card__title"></div>
            <div class="anime-card__meta"></div>
        </div>`;

    if (kind) card.querySelector('.anime-card__kind').textContent = kind;
    card.querySelector('.anime-card__diff').textContent = t('catalog.diff.' + diff);
    card.querySelector('.anime-card__title').textContent = animeTitle(anime);
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
            title: animeTitle(anime),
            name: anime.name,
        });
        window.location.href = './player.html?' + params.toString();
    });

    return card;
}

// append=false — заменить сетку; append=true — дописать (ленивая подгрузка).
function renderCards(items, append = false) {
    hideStatus();
    if (!append) resultsEl.innerHTML = '';

    if (!items.length) {
        if (!append) showStatus(mode === 'easy' ? 'catalog.easyEmpty' : 'catalog.empty');
        return;
    }

    items.forEach((anime, i) => resultsEl.appendChild(buildCard(anime, i)));
}

// ---- Ленивая подгрузка популярного: сентинел под сеткой, при подходе к нему
// снизу тянем следующую страницу и дописываем карточки.
let sentinel = null;
let observer = null;

function ensureObserver() {
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        resultsEl.after(sentinel);
    }
    if (!observer) {
        observer = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) loadMorePopular();
        }, { rootMargin: '600px' });
        observer.observe(sentinel);
    }
}

async function loadMorePopular() {
    if (mode !== 'popular' || popularLoading || popularDone) return;
    popularLoading = true;
    try {
        const next = popularPage + 1;
        const { data: res } = await client.get('catalog/popular', { params: { page: next } });
        const items = res.data || [];
        popularPage = next;
        if (items.length < 30) popularDone = true;

        // защита от дублей между страницами
        const seen = new Set(popularItems.map((a) => a.shikimoriId));
        const fresh = items.filter((a) => !seen.has(a.shikimoriId));
        if (fresh.length) {
            popularItems = popularItems.concat(fresh);
            if (mode === 'popular') renderCards(fresh, true);
        }
    } catch (err) {
        console.error(err);
    } finally {
        popularLoading = false;
    }
}

// Популярное — стартовый экран каталога (страница 1). Повторные заходы (снятие
// поиска/фильтра) перерисовывают уже загруженное без запроса.
async function loadPopular() {
    mode = 'popular';
    headingEl.style.display = '';
    headingEl.textContent = t('catalog.popular');

    if (popularItems.length) {
        renderCards(popularItems);
        ensureObserver();
        return;
    }

    renderSkeletons();
    popularPage = 1;
    popularDone = false;

    try {
        const { data: res } = await client.get('catalog/popular', { params: { page: 1 } });
        const items = res.data || [];

        // пока грузилось, пользователь мог начать искать — не перетираем результаты
        if (searchInput.value.trim().length >= 2) return;

        if (!items.length) {
            resultsEl.innerHTML = '';
            showStatus('catalog.empty');
            return;
        }
        popularItems = items;
        if (items.length < 30) popularDone = true;
        renderCards(popularItems);
        ensureObserver();
    } catch (err) {
        console.error(err);
        resultsEl.innerHTML = '';
        showStatus('catalog.error');
    }
}

searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = searchInput.value.trim();

    if (q.length < 2) {
        lastQuery = '';
        markChip('all');
        loadPopular();
        return;
    }

    debounceTimer = setTimeout(() => search(q), 400);
});

async function search(query) {
    mode = 'search';
    markChip('all');
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

// «Полегче» — реальная сетка кураторских простых тайтлов (грузим по id),
// а не фильтр по популярному (где простых почти нет — пустой список выглядел плохо).
async function loadEasy() {
    mode = 'easy';
    headingEl.style.display = '';
    headingEl.textContent = t('catalog.filter.easy');

    if (easyItems) {
        renderCards(easyItems);
        return;
    }

    renderSkeletons();
    try {
        const map = (window.AnimeDifficulty && window.AnimeDifficulty.map) || {};
        const ids = Object.keys(map).filter((id) => map[id] === 'easy');
        if (!ids.length) {
            resultsEl.innerHTML = '';
            showStatus('catalog.easyEmpty');
            return;
        }
        const { data: res } = await client.get('catalog/by-ids', { params: { ids: ids.join(',') } });
        if (mode !== 'easy') return;   // пока грузилось, могли переключиться

        easyItems = res.data || [];
        if (!easyItems.length) {
            resultsEl.innerHTML = '';
            showStatus('catalog.easyEmpty');
            return;
        }
        renderCards(easyItems);
    } catch (err) {
        console.error(err);
        resultsEl.innerHTML = '';
        showStatus('catalog.error');
    }
}

// ---- Фильтр по сложности языка: чипы «Все / Полегче» + подборка-ярлыки.
const chipsEl = document.getElementById('diff-chips');
const picksEl = document.getElementById('easy-picks');

// Только подсветка чипа/видимость подборки, без перезагрузки данных.
function markChip(val) {
    diffFilter = val;
    if (chipsEl) {
        chipsEl.querySelectorAll('.catalog-chip').forEach(b =>
            b.classList.toggle('catalog-chip--active', b.dataset.val === val));
    }
    if (picksEl) picksEl.hidden = val !== 'easy';
}

function setDiffFilter(val) {
    markChip(val);
    if (val === 'easy') {
        loadEasy();
        if (window.animeiTrack) window.animeiTrack('catalog', 'filter:easy');
    } else {
        // Назад к «Все»: если в поиске есть запрос — возвращаем его, иначе популярное.
        const q = searchInput.value.trim();
        if (q.length >= 2) search(q);
        else loadPopular();
    }
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
        b.textContent = getLang() === 'ru' ? pick.label : (pick.en || pick.q);
        b.addEventListener('click', () => {
            // Пилюля — навигация к конкретному тайтлу: фильтр снимаем, чтобы
            // сезоны/фильмы франшизы не прятались из-за неразмеченных id.
            markChip('all');
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
