// Общее для страниц «Сегодня» (news.html) и читалки (news-story.html):
// уровень и режим фуриганы читателя, локальный прогресс по историям,
// отрисовка токенов с руби, форматирование даты выпуска.
//
// Прогресс пока живёт в localStorage (гость и аккаунт одинаково):
//   animei:news:progress = { [storyId]: { level, doneAt, score, total } }
//   animei:news:days     = ['YYYY-MM-DD', …]   — дни, когда прочитана хоть одна история

(function () {
    'use strict';

    const LEVELS = ['easy', 'mid', 'orig'];
    const LEVEL_JA = { easy: 'やさしい', mid: 'ふつう', orig: '原文' };
    // Порог «слово знакомо по уровню»: в режиме фуриганы «Новые» руби прячем
    // у слов не выше этого уровня JLPT (5 = N5 … 1 = N1).
    const LEVEL_KNOWN_JLPT = { easy: 4, mid: 3, orig: 2 };

    const K_LEVEL = 'animei:news:level';
    const K_FURI = 'animei:news:furi';
    const K_PROGRESS = 'animei:news:progress';
    const K_DAYS = 'animei:news:days';

    const ls = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } },
    };

    function getLevel() {
        const v = ls.get(K_LEVEL);
        return LEVELS.includes(v) ? v : 'easy';
    }
    function setLevel(v) { if (LEVELS.includes(v)) ls.set(K_LEVEL, v); }

    function getFuri() {
        const v = ls.get(K_FURI);
        return ['all', 'new', 'none'].includes(v) ? v : 'all';
    }
    function setFuri(v) { ls.set(K_FURI, v); }

    function progress() {
        const raw = (typeof lsJson === 'function') ? lsJson(K_PROGRESS, {}) : null;
        return raw && typeof raw === 'object' ? raw : {};
    }
    function isDone(storyId) { return !!progress()[storyId]; }
    function markDone(storyId, info) {
        const p = progress();
        p[storyId] = { ...(p[storyId] || {}), ...info, doneAt: new Date().toISOString() };
        ls.set(K_PROGRESS, JSON.stringify(p));
        const day = dayKey(new Date());
        const days = (typeof lsJson === 'function') ? lsJson(K_DAYS, []) : [];
        const list = Array.isArray(days) ? days : [];
        if (!list.includes(day)) { list.push(day); ls.set(K_DAYS, JSON.stringify(list.slice(-400))); }
    }
    function dayKey(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    const tr = (key, fallback) => (typeof t === 'function' ? t(key) : fallback) || fallback || key;
    const lang = () => (typeof getLang === 'function' ? getLang() : 'ru');

    // «1 октября, среда» на языке интерфейса.
    function formatDate(iso, opts) {
        const [y, m, d] = String(iso).split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const locale = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US' }[lang()] || 'ru-RU';
        try {
            return new Intl.DateTimeFormat(locale, opts || { day: 'numeric', month: 'long', weekday: 'long' }).format(date);
        } catch (e) { return iso; }
    }

    // ---- Отрисовка токенов ----
    // token = { s, r, b, p, l, j, f:[{t, rt}], br? }
    // Учебное слово → <span class="ntok ntok--learnable" data-b data-j>, с
    // <ruby> по сегментам. Известность считаем на клиенте: known-store или
    // слово не выше уровня (для режима «Новые» — класс ntok--easy).
    function tokenEl(tk, ctx) {
        const el = document.createElement('span');
        el.className = 'ntok';
        if (tk.l) {
            el.classList.add('ntok--learnable');
            el.dataset.b = tk.b;
            el.dataset.j = String(tk.j || 0);
            const known = ctx.known && (ctx.known.has(tk.b) || ctx.known.has(tk.s));
            if (known) el.classList.add('ntok--known');
            if (tk.j && tk.j >= ctx.knownJlpt) el.classList.add('ntok--easy');
            if (ctx.saved && ctx.saved.has(tk.b)) el.classList.add('ntok--saved');
        }
        for (const seg of tk.f || [{ t: tk.s }]) {
            if (seg.rt) {
                const ruby = document.createElement('ruby');
                ruby.appendChild(document.createTextNode(seg.t));
                const rt = document.createElement('rt');
                rt.textContent = seg.rt;
                ruby.appendChild(rt);
                el.appendChild(ruby);
            } else {
                el.appendChild(document.createTextNode(seg.t));
            }
        }
        return el;
    }

    function renderTokens(tokens, ctx) {
        const frag = document.createDocumentFragment();
        for (const tk of tokens || []) frag.appendChild(tokenEl(tk, ctx));
        return frag;
    }

    function knownSet() {
        const set = new Set();
        try {
            if (window.KnownWords) for (const w of KnownWords.all()) set.add(w);
        } catch (e) { /* known-store не подключён */ }
        return set;
    }
    // Слова, которые уже в карточках (у гостя — guestWords, у вошедшего — снимок words).
    function savedSet() {
        const set = new Set();
        try {
            const list = (typeof lsJson === 'function') ? (lsJson('words', []) || []) : [];
            for (const w of list) if (w && w.kanji) set.add(w.kanji);
            const guest = (typeof lsJson === 'function') ? (lsJson('animei:guestWords', []) || []) : [];
            for (const w of guest) if (w && w.kanji) set.add(w.kanji);
        } catch (e) { /* нет данных */ }
        return set;
    }

    function ctxFor(level) {
        return { known: knownSet(), saved: savedSet(), knownJlpt: LEVEL_KNOWN_JLPT[level] || 4 };
    }

    // Название рубрики на языке интерфейса.
    function categoryName(cat) {
        return tr('news.cat.' + cat, cat);
    }

    function storyUrl(id, level) {
        return './news-story.html?id=' + encodeURIComponent(id) + (level ? '&level=' + level : '');
    }

    window.NewsCore = {
        LEVELS, LEVEL_JA, LEVEL_KNOWN_JLPT,
        getLevel, setLevel, getFuri, setFuri,
        progress, isDone, markDone, dayKey,
        formatDate, renderTokens, ctxFor, categoryName, storyUrl, tr, lang,
    };
})();
