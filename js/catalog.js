// Каталог: по умолчанию показываем популярные тайтлы, поиск — фильтр по названию.
// Данные с нашего бэкенда (Shikimori), переход в плеер по клику.

const searchInput = document.getElementById('search-input');
const resultsEl = document.getElementById('results');
const statusEl = document.getElementById('status');
const headingEl = document.getElementById('heading');

let debounceTimer = null;
let lastQuery = '';
let popularItems = null;   // кэш популярного, чтобы не грузить повторно

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

function renderCards(items) {
    hideStatus();
    resultsEl.innerHTML = '';

    items.forEach((anime, i) => {
        const kind = I18N[getLang()]['kind.' + anime.kind] || anime.kind;
        const hasScore = anime.score && anime.score !== '0.0';

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
            <button class="anime-card__play" tabindex="-1" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <div class="anime-card__info">
                <div class="anime-card__title"></div>
                <div class="anime-card__meta"></div>
            </div>`;

        if (kind) card.querySelector('.anime-card__kind').textContent = kind;
        card.querySelector('.anime-card__title').textContent = anime.russian || anime.name;
        card.querySelector('.anime-card__meta').textContent = [
            anime.year,
            anime.episodes ? tEpisodes(anime.episodes) : null,
        ].filter(Boolean).join(' · ');

        card.addEventListener('click', () => {
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

loadPopular();
