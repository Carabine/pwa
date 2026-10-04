// «Сегодня» — дневной выпуск новостей под уровень. Данные готовит сервер
// (scripts/news-build.mjs по крону); здесь — выбор уровня, список историй с
// заголовками на этом уровне, прогресс «прочитано N из M», навигация по датам.

(function () {
    'use strict';

    const C = window.NewsCore;
    const el = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const state = { edition: null, level: C.getLevel() };

    function apiBase() {
        return (window.ANIMEI_ORIGIN || location.origin) + '/api/v1/';
    }

    async function loadEdition() {
        const params = new URLSearchParams(location.search);
        const date = params.get('date');
        const path = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? 'news/edition/' + date : 'news/today';
        const { data: res } = await client.get(path, { silentErrors: true });
        return res.data;
    }

    // Картинка проявляется целиком, когда загрузилась, — а не рисуется
    // полосами на чёрном квадрате (медленная сеть, телефон).
    function fadeInImages(root) {
        root.querySelectorAll('.news-card__media img').forEach((img) => {
            const done = () => img.classList.add('is-loaded');
            if (img.complete && img.naturalWidth) done();
            else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }
        });
    }

    function levelSeg() {
        const seg = el('news-level');
        seg.innerHTML = '';
        for (const lv of C.LEVELS) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = lv === state.level ? 'is-active' : '';
            b.dataset.level = lv;
            b.innerHTML = '<span class="news-level__ja">' + C.LEVEL_JA[lv] + '</span><span class="news-level__sub">' + esc(C.tr('news.level.' + lv)) + '</span>';
            b.addEventListener('click', () => {
                state.level = lv;
                C.setLevel(lv);
                levelSeg();
                renderStories();
            });
            seg.appendChild(b);
        }
    }

    function renderHead() {
        const e = state.edition;
        const dateEl = el('news-date');
        if (!e) { dateEl.textContent = ''; return; }
        const isToday = e.today ? e.date === e.today : true;
        dateEl.textContent = C.formatDate(e.date) + (isToday ? '' : '');
        const sub = el('news-subtitle');
        if (e.today && e.date !== e.today) sub.textContent = C.tr('news.stale');
        else sub.textContent = C.tr('news.subtitle');
    }

    function renderProgress() {
        const e = state.edition;
        const box = el('news-progress');
        if (!e || !e.stories.length) { box.hidden = true; return; }
        const done = e.stories.filter((s) => C.isDone(s.id)).length;
        const total = e.stories.length;
        box.hidden = false;
        const pct = Math.round((done / total) * 100);
        box.innerHTML =
            '<div class="news-progress__bar"><i style="width:' + pct + '%"></i></div>' +
            '<div class="news-progress__text">' + esc(done >= total ? C.tr('news.allDone') : C.tr('news.progress').replace('{done}', done).replace('{total}', total)) + '</div>';
    }

    function renderStories() {
        const e = state.edition;
        const list = el('news-list');
        list.innerHTML = '';
        if (!e || !e.stories.length) {
            list.innerHTML = '<div class="news-empty">' + esc(C.tr('news.noEdition')) + '</div>';
            renderProgress();
            return;
        }
        const lang = C.lang();
        e.stories.forEach((s, i) => {
            const a = document.createElement('a');
            a.className = 'news-card anim-in' + (C.isDone(s.id) ? ' news-card--done' : '');
            a.style.setProperty('--i', i);
            a.href = C.storyUrl(s.id, state.level);
            const gist = (s.trTitles[lang] || s.trTitles.ru || {})[state.level] || '';
            const meta = [C.categoryName(s.category), C.tr('news.readTime').replace('{n}', s.minutes[state.level] || 1), s.source.name].filter(Boolean);
            a.innerHTML =
                '<div class="news-card__media">' +
                    (s.photo ? '<img loading="lazy" alt="" src="' + apiBase() + 'news/img/' + esc(s.id) + '">' : '<div class="news-card__ph" data-cat="' + esc(s.category) + '"></div>') +
                '</div>' +
                '<div class="news-card__body">' +
                    '<div class="news-card__title">' + esc(s.titles[state.level]) + '</div>' +
                    (gist ? '<div class="news-card__gist">' + esc(gist) + '</div>' : '') +
                    '<div class="news-card__meta">' + meta.map(esc).join(' · ') + '</div>' +
                '</div>' +
                '<div class="news-card__check" aria-hidden="true">✓</div>';
            list.appendChild(a);
        });
        fadeInImages(list);
        renderProgress();
    }

    function renderNav() {
        const e = state.edition;
        const nav = el('news-nav');
        nav.innerHTML = '';
        if (!e) return;
        if (e.prev) {
            const a = document.createElement('a');
            a.className = 'news-nav__link';
            a.href = './news.html?date=' + e.prev;
            a.textContent = '← ' + C.formatDate(e.prev, { day: 'numeric', month: 'long' });
            nav.appendChild(a);
        }
        if (e.next) {
            const a = document.createElement('a');
            a.className = 'news-nav__link';
            a.href = e.today && e.next === e.today ? './news.html' : './news.html?date=' + e.next;
            a.textContent = C.formatDate(e.next, { day: 'numeric', month: 'long' }) + ' →';
            nav.appendChild(a);
        }
    }

    async function init() {
        levelSeg();
        try {
            state.edition = await loadEdition();
        } catch (err) {
            el('news-list').innerHTML = '<div class="news-empty">' + esc(C.tr('news.loadError')) + '</div>';
            el('news-progress').hidden = true;
            return;
        }
        renderHead();
        renderStories();
        renderNav();
        if (typeof animeiTrack === 'function') animeiTrack('news_open', (state.edition && state.edition.date) || '-');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
