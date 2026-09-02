// «Мой прогресс» — единственный экран, который отвечает на вопрос «сколько я уже
// прошёл». Раньше видимого прогресса не было вовсе: на главной жила только
// недельная полоска, а всё остальное (сколько выучено, покрытие JLPT, как рос
// словарь) считалось где-то внутри и наружу не показывалось.
//
// Всё считается на клиенте из уже лежащих локально данных — снимка слов,
// расписания повторений и дней занятий. Своего запроса у страницы нет: только
// обновление снимка слов, которое и так делает главная.

(function () {
    // Карточка считается выученной, когда интервал дорос до трёх недель — это
    // и есть граница «помню надолго», а не «зазубрил вчера».
    const MATURE_DAYS = 21;
    const CAL_WEEKS = 12;     // календарь занятий: три месяца назад
    const CHART_WEEKS = 8;    // пополнение словаря: два месяца

    const el = (id) => document.getElementById(id);
    const tr = (key, fallback) => (typeof t === 'function' ? t(key) : fallback) || fallback;
    const esc = (s) => String(s == null ? '' : s)
        .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // ---- Даты -------------------------------------------------------------
    function dayKey(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
            + '-' + String(d.getDate()).padStart(2, '0');
    }
    function todayStart() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }
    function addDays(d, n) {
        const c = new Date(d);
        c.setDate(c.getDate() + n);
        return c;
    }
    // Понедельник недели, в которую попадает дата (неделя у нас начинается с пн).
    function weekStart(d) {
        const c = new Date(d);
        c.setHours(0, 0, 0, 0);
        c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
        return c;
    }

    // ---- Сбор данных ------------------------------------------------------
    function readWords() {
        const raw = lsJson('words', []);
        return Array.isArray(raw) ? raw.filter((w) => w && w.id) : [];
    }
    function readSchedule() {
        const raw = lsJson('srs:schedule:v2', {});
        return (raw && typeof raw === 'object') ? raw : {};
    }
    function readDays() {
        const raw = lsJson('srs:days', []);
        return new Set(Array.isArray(raw) ? raw : []);
    }

    // Текущая серия (сегодня или вчера — она ещё жива) и рекорд за всю историю.
    function streaks(days) {
        let current = 0;
        let cursor = todayStart();
        if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
        while (days.has(dayKey(cursor))) { current++; cursor = addDays(cursor, -1); }

        const sorted = [...days].sort();
        let best = 0;
        let run = 0;
        let prev = null;
        for (const key of sorted) {
            const d = new Date(key + 'T00:00:00');
            run = (prev && Math.round((d - prev) / 86400000) === 1) ? run + 1 : 1;
            if (run > best) best = run;
            prev = d;
        }
        return { current, best: Math.max(best, current) };
    }

    // ---- Блоки страницы ---------------------------------------------------
    function tilesHtml(stats) {
        const tile = (value, label, mod) =>
            `<div class="prg-tile${mod ? ' prg-tile--' + mod : ''}">` +
            `<div class="prg-tile__value">${value}</div>` +
            `<div class="prg-tile__label">${esc(label)}</div></div>`;

        return '<div class="prg-tiles">'
            + tile(stats.total, tr('progress.tile.words', 'Слов'))
            + tile(stats.learned, tr('progress.tile.learned', 'Выучено'), 'accent')
            + tile(stats.learning, tr('progress.tile.learning', 'Изучается'))
            + tile(stats.streak.current, tr('progress.tile.streak', 'Дней подряд'), 'streak')
            + '</div>';
    }

    function splitHtml(stats) {
        const total = Math.max(1, stats.total);
        const pct = (n) => (n / total * 100).toFixed(2) + '%';
        const legend = (mod, label, n) =>
            `<span class="prg-legend__item"><i class="prg-legend__dot prg-legend__dot--${mod}"></i>${esc(label)} — ${n}</span>`;

        return section(tr('progress.split.title', 'Состав словаря'),
            stats.total + ' ' + tr('progress.split.note', 'карточек'),
            '<div class="prg-split">'
            + `<div class="prg-split__part prg-split__part--learned" style="width:${pct(stats.learned)}"></div>`
            + `<div class="prg-split__part prg-split__part--learning" style="width:${pct(stats.learning)}"></div>`
            + `<div class="prg-split__part prg-split__part--fresh" style="width:${pct(stats.fresh)}"></div>`
            + (stats.frozen ? `<div class="prg-split__part prg-split__part--frozen" style="width:${pct(stats.frozen)}"></div>` : '')
            + '</div>'
            + '<div class="prg-legend">'
            + legend('learned', tr('progress.tile.learned', 'Выучено'), stats.learned)
            + legend('learning', tr('progress.tile.learning', 'Изучается'), stats.learning)
            + legend('fresh', tr('progress.split.fresh', 'Ещё не начато'), stats.fresh)
            + (stats.frozen ? legend('frozen', tr('progress.split.frozen', 'Заморожено'), stats.frozen) : '')
            + '</div>');
    }

    // Календарь занятий: столбец — неделя, строка — день недели (как «трава»
    // на гитхабе). Дни будущей недели рисуем блёклыми, чтобы не выглядели
    // пропущенными.
    function calendarHtml(days) {
        const today = todayStart();
        const start = addDays(weekStart(today), -(CAL_WEEKS - 1) * 7);
        const todayK = dayKey(today);

        let weeks = '';
        let studied = 0;
        for (let w = 0; w < CAL_WEEKS; w++) {
            let cells = '';
            for (let d = 0; d < 7; d++) {
                const date = addDays(start, w * 7 + d);
                const key = dayKey(date);
                const on = days.has(key);
                if (on) studied++;
                const cls = 'prg-cal__day'
                    + (on ? ' prg-cal__day--on' : '')
                    + (key === todayK ? ' prg-cal__day--today' : '')
                    + (date > today ? ' prg-cal__day--future' : '');
                cells += `<span class="${cls}" title="${key}"></span>`;
            }
            weeks += '<div class="prg-cal__week">' + cells + '</div>';
        }

        const note = tr('progress.cal.note', 'занимались {n} дней из {of}')
            .replace('{n}', studied).replace('{of}', CAL_WEEKS * 7);
        return section(tr('progress.cal.title', 'Занятия'), note,
            '<div class="prg-cal">' + weeks + '</div>');
    }

    // Пополнение словаря по неделям. У слов, сохранённых до появления этой
    // страницы (и у старых гостевых), даты создания нет — они просто не попадают
    // в столбики, поэтому пишем, по скольким словам построен график.
    function growthHtml(words) {
        const today = todayStart();
        const first = addDays(weekStart(today), -(CHART_WEEKS - 1) * 7);
        const buckets = new Array(CHART_WEEKS).fill(0);
        let dated = 0;

        for (const w of words) {
            if (!w.createdAt) continue;
            const d = new Date(w.createdAt);
            if (isNaN(d)) continue;
            dated++;
            const idx = Math.floor((weekStart(d) - first) / (7 * 86400000));
            if (idx >= 0 && idx < CHART_WEEKS) buckets[idx]++;
        }

        if (!dated) return '';

        const max = Math.max(1, ...buckets);
        const bars = buckets.map((n, i) => {
            const date = addDays(first, i * 7);
            const label = date.getDate() + '.' + String(date.getMonth() + 1).padStart(2, '0');
            const h = Math.round(n / max * 100);
            return '<div class="prg-bar">'
                + `<span class="prg-bar__value">${n || ''}</span>`
                + `<span class="prg-bar__fill${n ? '' : ' prg-bar__fill--empty'}" style="height:${n ? Math.max(h, 4) : 2}%"></span>`
                + `<span class="prg-bar__label">${label}</span>`
                + '</div>';
        }).join('');

        const total = buckets.reduce((a, b) => a + b, 0);
        const note = tr('progress.growth.note', '+{n} за 8 недель').replace('{n}', total);
        return section(tr('progress.growth.title', 'Пополнение словаря'), note,
            '<div class="prg-bars">' + bars + '</div>');
    }

    // Покрытие JLPT: сколько слов уровня уже освоено. Две доли в одной шкале —
    // «знаю» (выучено или помечено «уже знаю») и «в работе» (карточка есть, но
    // ещё учится): иначе полоса врала бы в одну или другую сторону.
    function jlptHtml(levels, words, schedule, known) {
        if (!levels) return '';

        const state = new Map();   // слово уровня → 'known' | 'learning'
        const mark = (word, value) => {
            if (!word || !(word in levels)) return;
            if (value === 'known' || !state.has(word)) state.set(word, value);
        };

        for (const w of known) mark(w, 'known');
        for (const w of words) {
            const s = schedule[w.id];
            const value = (s && s.interval >= MATURE_DAYS) ? 'known' : 'learning';
            mark(w.kanji, value);
            if (w.kana && w.kana !== w.kanji) mark(w.kana, value);
        }

        const totals = {};
        for (const lvl of Object.values(levels)) totals[lvl] = (totals[lvl] || 0) + 1;

        const counted = {};
        for (const [word, value] of state) {
            const lvl = levels[word];
            counted[lvl] = counted[lvl] || { known: 0, learning: 0 };
            counted[lvl][value]++;
        }

        const rows = [5, 4, 3].map((lvl) => {
            const all = totals[lvl] || 0;
            if (!all) return '';
            const c = counted[lvl] || { known: 0, learning: 0 };
            const pk = (c.known / all * 100).toFixed(1);
            const pl = (c.learning / all * 100).toFixed(1);
            const note = c.learning
                ? `${c.known} / ${all} <span style="opacity:.7">+${c.learning}</span>`
                : `${c.known} / ${all}`;
            return '<div class="prg-jlpt">'
                + '<div class="prg-jlpt__head">'
                + `<span class="prg-jlpt__name">N${lvl}</span>`
                + `<span class="prg-jlpt__count">${note}</span>`
                + '</div>'
                + '<div class="prg-jlpt__track">'
                + `<div class="prg-jlpt__fill" style="width:${pk}%"></div>`
                + `<div class="prg-jlpt__fill prg-jlpt__fill--soft" style="width:${pl}%"></div>`
                + '</div></div>';
        }).join('');

        return section(tr('progress.jlpt.title', 'Покрытие JLPT'),
            tr('progress.jlpt.note', 'знаю + в работе'), rows);
    }

    // Что ждёт впереди — чтобы страница не была только про прошлое.
    function aheadHtml(words, schedule) {
        const today = dayKey(todayStart());
        const weekEnd = dayKey(addDays(todayStart(), 7));
        // Замороженные слова в учёбу не придут — и в прогнозе их быть не должно.
        const live = window.Freeze ? Freeze.forStudy(words) : words;
        let due = 0;
        let week = 0;
        for (const w of live) {
            const s = schedule[w.id];
            if (!s) continue;
            if (s.due <= today) due++;
            else if (s.due <= weekEnd) week++;
        }
        const text = tr('progress.ahead.text', 'Сегодня к повторению: {due}. За ближайшую неделю подойдёт ещё {week}.')
            .replace('{due}', due).replace('{week}', week);
        return section(tr('progress.ahead.title', 'Что впереди'), '',
            `<p class="prg-section__note" style="margin:0">${esc(text)}</p>`);
    }

    function section(title, note, body) {
        return '<div class="prg-section">'
            + '<div class="prg-section__head">'
            + `<span class="prg-section__title">${esc(title)}</span>`
            + (note ? `<span class="prg-section__note">${note}</span>` : '')
            + '</div>' + body + '</div>';
    }

    function emptyHtml() {
        return '<div class="prg-section prg-empty">'
            + `<p class="prg-empty__text">${esc(tr('progress.empty', 'Пока нечего показывать — соберите первые слова из аниме, и здесь появится прогресс.'))}</p>`
            + `<a class="btn btn--primary" href="./catalog.html">${esc(tr('progress.emptyCta', 'Выбрать аниме'))}</a>`
            + '</div>';
    }

    // Список JLPT — 5 тысяч слов, качаем только на этой странице и только один
    // раз; нет файла (офлайн, старый кеш) — просто не показываем блок.
    async function loadLevels() {
        try {
            const res = await fetch('../data/jlpt-n5n3.json');
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    async function render() {
        const words = readWords();
        const schedule = readSchedule();
        const days = readDays();
        const known = (window.KnownWords && KnownWords.all) ? KnownWords.all() : [];

        if (!words.length && !known.length && !days.size) {
            el('prg-body').innerHTML = emptyHtml();
            return;
        }

        // Замороженные считаем отдельной долей: иначе они молча копились бы в
        // «ещё не начато» и полоса врала бы про заброшенную учёбу.
        const deckFrozen = window.Freeze ? Freeze.frozenByDecks() : new Set();
        let learned = 0;
        let learning = 0;
        let frozen = 0;
        for (const w of words) {
            if (w.frozen || deckFrozen.has(w.id)) { frozen++; continue; }
            const s = schedule[w.id];
            if (!s) continue;
            if (s.interval >= MATURE_DAYS) learned++;
            else learning++;
        }
        const stats = {
            total: words.length,
            learned,
            learning,
            frozen,
            fresh: words.length - learned - learning - frozen,
            streak: streaks(days),
        };

        const levels = await loadLevels();

        el('prg-body').innerHTML =
            tilesHtml(stats)
            + (stats.total ? splitHtml(stats) : '')
            + calendarHtml(days)
            + growthHtml(words)
            + jlptHtml(levels, words, schedule, known)
            + (stats.total ? aheadHtml(words, schedule) : '');

        if (stats.streak.best > stats.streak.current) {
            // Число дней склоняет tStreak — «2 дней подряд» в подзаголовке
            // выглядело бы как недоделка.
            const n = typeof tStreak === 'function'
                ? tStreak(stats.streak.best)
                : stats.streak.best + ' дн.';
            el('prg-subtitle').textContent = tr('progress.record', 'Рекорд серии: {n}').replace('{n}', n);
        }
        if (window.animeiTrack) animeiTrack('progress', 'view:' + stats.total);
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof applyI18n === 'function') applyI18n();
        // Рисуем сразу по локальному снимку — страница не должна ждать сеть.
        render();
        // Потом обновляем снимок слов (у вошедшего он мог устареть на другом
        // устройстве) и перерисовываем.
        if (typeof fetchDataFromServer === 'function') {
            try {
                await fetchDataFromServer();
                if (typeof mergeServerSchedule === 'function') mergeServerSchedule();
                render();
            } catch { /* нет сети — остаёмся на локальном снимке */ }
        }
    });
})();
