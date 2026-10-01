// Прописи — интерфейс: главная, экран колоды, сессия письма, итог.
//
// Поток сессии для НОВОГО знака: смотри (анимация порядка штрихов) →
// обведи (призрак под пальцем) → по памяти (только слово с пропуском).
// Для знака на повторении — сразу «по памяти»; провалил — вернётся в хвост
// сессии через обводку. Оценку ставим сами по числу ошибок и подсказок на
// этапе «по памяти»: пользователю не нужно ничего нажимать, кроме «Дальше».
(function () {
    const S = window.KanjiStore;
    const C = window.KanjiCore;
    const HAN = /\p{Script=Han}/u;

    const $ = (sel, root = document) => root.querySelector(sel);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // t() с подстановкой {n}
    const tt = (key, vars) => {
        let s = t(key);
        if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        return s;
    };
    const buzz = (ms) => { if (S.settings.get('vibrate') && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* не поддерживается */ } } };
    const trackEvent = (name, meta) => { if (typeof window.animeiTrack === 'function') window.animeiTrack(name, meta); };

    const screens = {
        home: $('#kj-home'), deck: $('#kj-deck'), session: $('#kj-session'), summary: $('#kj-summary'),
    };
    function show(name) {
        for (const k in screens) screens[k].hidden = k !== name;
        document.body.dataset.screen = name;
        window.scrollTo(0, 0);
    }

    // ------------------------------------------------------------------
    // Данные: слова → знаки
    // ------------------------------------------------------------------
    let allWords = [];

    async function loadWords() {
        try {
            const ws = await fetchWords();
            // Только японские записи: у английских слов иероглифов нет.
            allWords = (window.LearnLang ? LearnLang.filter(ws, 'ja') : ws).filter((w) => w && w.kanji);
        } catch (e) {
            allWords = [];
        }
    }

    // Уникальные иероглифы в порядке первого появления; к каждому — слова,
    // где он встречается (контекст на карточке).
    function itemsFromWords(words) {
        const map = new Map();
        for (const w of words) {
            for (const ch of String(w.kanji)) {
                if (!HAN.test(ch)) continue;
                if (!map.has(ch)) map.set(ch, { ch, words: [] });
                map.get(ch).words.push(w);
            }
        }
        return [...map.values()];
    }

    function scopeFromDeck(deck) {
        const byId = new Map(allWords.map((w) => [w.id, w]));
        const words = deck.wordIds.map((id) => byId.get(id)).filter(Boolean);
        return { kind: 'deck', id: deck.id, name: deck.name, icon: Decks.iconHtml(deck), items: itemsFromWords(words) };
    }
    function scopeAll() {
        return { kind: 'all', id: 'all', name: t('kanji.allWords'), icon: '📚', items: itemsFromWords(allWords) };
    }
    function scopeKana(kind) {
        const list = kind === 'hira' ? S.KANA.hira : S.KANA.kata;
        return {
            kind, id: kind, name: t(kind === 'hira' ? 'kanji.hiragana' : 'kanji.katakana'),
            icon: kind === 'hira' ? 'あ' : 'ア',
            items: list.map((k) => ({ ch: k.ch, words: [], roma: k.roma })),
        };
    }
    function scopeById(id) {
        if (id === 'all') return scopeAll();
        if (id === 'hira' || id === 'kata') return scopeKana(id);
        const deck = window.Decks ? Decks.get(id) : null;
        return deck ? scopeFromDeck(deck) : null;
    }

    // ------------------------------------------------------------------
    // Главная
    // ------------------------------------------------------------------
    function statLine(items) {
        const s = S.srs.stats(items.map((i) => i.ch));
        const parts = [tt('kanji.nChars', { n: s.total })];
        if (s.due) parts.push(tt('kanji.nDue', { n: s.due }));
        if (s.fresh) parts.push(tt('kanji.nNew', { n: s.fresh }));
        return { s, text: parts.join(' · ') };
    }

    function sourceRow(scope, { big } = {}) {
        const { s, text } = statLine(scope.items);
        const pct = s.total ? Math.round(s.learned / s.total * 100) : 0;
        return `<button class="kj-row${big ? ' kj-row--big' : ''}" data-scope="${esc(scope.id)}">
            <span class="kj-row__ico">${scope.icon}</span>
            <span class="kj-row__body">
                <span class="kj-row__name">${esc(scope.name)}</span>
                <span class="kj-row__meta">${esc(text)}</span>
                <span class="kj-bar"><span class="kj-bar__fill" style="width:${pct}%"></span></span>
            </span>
            ${s.due ? `<span class="kj-row__due">${s.due}</span>` : ''}
            <span class="kj-row__chev">›</span>
        </button>`;
    }

    function renderHome() {
        const el = screens.home;
        const all = scopeAll();
        const stats = S.srs.stats(all.items.map((i) => i.ch));
        const today = S.days.today();
        const streak = S.days.streak();
        let hero;
        if (!all.items.length) {
            hero = `<div class="kj-hero kj-hero--empty">
                <div class="kj-hero__glyph">書</div>
                <p class="kj-hero__text">${esc(t('kanji.emptyText'))}</p>
                <a class="btn btn--ghost" href="../pages/catalog.html">${esc(t('kanji.emptyGo'))}</a>
            </div>`;
        } else {
            const cta = stats.due
                ? `<button class="btn btn--primary kj-hero__cta" data-go="review" data-scope="all">${esc(tt('kanji.reviewN', { n: stats.due }))}</button>`
                : (stats.fresh
                    ? `<button class="btn btn--primary kj-hero__cta" data-go="learn" data-scope="all">${esc(t('kanji.learnNew'))}</button>`
                    : `<button class="btn btn--ghost kj-hero__cta" data-go="cram" data-scope="all">${esc(t('kanji.cram'))}</button>`);
            hero = `<div class="kj-hero">
                <div class="kj-hero__tiles">
                    <div class="kj-tile"><b>${stats.due}</b><span>${esc(t('kanji.tileDue'))}</span></div>
                    <div class="kj-tile"><b>${stats.learned}<small>/${stats.total}</small></b><span>${esc(t('kanji.tileLearned'))}</span></div>
                    <div class="kj-tile"><b>${today.w}</b><span>${esc(t('kanji.tileToday'))}</span></div>
                </div>
                ${cta}
                ${streak > 1 ? `<div class="kj-hero__streak">🔥 ${esc(tt('kanji.streak', { n: streak }))}</div>` : ''}
            </div>`;
        }

        // Главная без списка колод: одна умная кнопка по всем знакам и три
        // компактных входа (все знаки, хирагана, катакана). Колоду по-прежнему
        // можно открыть с её страницы (кнопка «Sumi» → ?deck=id).
        const quick = (scope) => {
            const { s } = statLine(scope.items);
            return `<button class="kj-quick__btn" data-scope="${esc(scope.id)}">
                <span class="kj-quick__ico">${scope.icon}</span>
                <span class="kj-quick__name">${esc(scope.name)}</span>
                <span class="kj-quick__meta">${s.due ? `<b>${s.due}</b> · ` : ''}${s.total}</span>
            </button>`;
        };
        el.innerHTML = hero
            + `<div class="kj-quick">`
            + (all.items.length ? quick(all) : '')
            + quick(scopeKana('hira')) + quick(scopeKana('kata'))
            + `</div>
            <p class="kj-note">${esc(t('kanji.deviceNote'))}</p>`;

        el.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
            const sc = scopeById(b.dataset.scope);
            if (!sc) return;
            if (b.dataset.go) startSession(sc, b.dataset.go);
            else openDeck(sc);
        }));
        show('home');
    }

    // ------------------------------------------------------------------
    // Экран колоды: сетка знаков
    // ------------------------------------------------------------------
    let currentScope = null;

    function levelClass(ch) {
        if (S.srs.isNew(ch)) return 'is-new';
        const l = S.srs.level(ch);
        if (l >= S.srs.LEARNED_LEVEL) return 'is-learned';
        return 'is-seen';
    }

    function openDeck(scope, { replace } = {}) {
        currentScope = scope;
        const el = screens.deck;
        const stats = S.srs.stats(scope.items.map((i) => i.ch));
        const now = Date.now();
        el.innerHTML = `
            <div class="kj-deckhead">
                <button class="kj-back" data-back>‹ ${esc(t('kanji.title'))}</button>
                <div class="kj-deckhead__title"><span class="kj-row__ico">${scope.icon}</span>${esc(scope.name)}</div>
                <div class="kj-deckhead__meta">${esc(tt('kanji.deckMeta', { n: stats.total, l: stats.learned }))}</div>
            </div>
            <div class="kj-actions">
                <button class="btn ${stats.due ? 'btn--primary' : 'btn--ghost'}" data-go="review" ${stats.due ? '' : 'disabled'}>${esc(tt('kanji.reviewN', { n: stats.due }))}</button>
                <button class="btn ${!stats.due && stats.fresh ? 'btn--primary' : 'btn--ghost'}" data-go="learn" ${stats.fresh ? '' : 'disabled'}>${esc(tt('kanji.learnNewN', { n: Math.min(stats.fresh, S.settings.get('newPerSession')) }))}</button>
                <button class="btn btn--ghost" data-go="cram">${esc(t('kanji.cram'))}</button>
            </div>
            <div class="kj-grid">
                ${scope.items.map((it) => `<button class="kj-cell ${levelClass(it.ch)}${S.srs.isDue(it.ch, now) ? ' is-due' : ''}" data-ch="${esc(it.ch)}">${esc(it.ch)}</button>`).join('')}
            </div>
            <div class="kj-legend">
                <span><i class="kj-cell is-new"></i>${esc(t('kanji.legendNew'))}</span>
                <span><i class="kj-cell is-seen"></i>${esc(t('kanji.legendSeen'))}</span>
                <span><i class="kj-cell is-learned"></i>${esc(t('kanji.legendLearned'))}</span>
                <span><i class="kj-cell is-due"></i>${esc(t('kanji.legendDue'))}</span>
            </div>`;
        el.querySelector('[data-back]').addEventListener('click', () => { history.back(); });
        el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => startSession(scope, b.dataset.go)));
        el.querySelectorAll('.kj-cell[data-ch]').forEach((b) => b.addEventListener('click', () => openCharSheet(scope, b.dataset.ch)));
        show('deck');
        const url = '?deck=' + encodeURIComponent(scope.id);
        if (replace) history.replaceState({ screen: 'deck', id: scope.id }, '', url);
        else history.pushState({ screen: 'deck', id: scope.id }, '', url);
    }

    // Карточка знака: анимация, слова, прогресс.
    async function openCharSheet(scope, ch) {
        const item = scope.items.find((i) => i.ch === ch);
        if (!item) return;
        const rec = S.srs.get(ch);
        const sheet = openSheet(`
            <div class="kj-sheet__char">
                <div class="kj-board kj-board--mini"><div class="kj-board__host"></div></div>
                <div class="kj-sheet__info">
                    <div class="kj-sheet__big">${esc(ch)}</div>
                    <div class="kj-sheet__meta" data-meta></div>
                    <div class="kj-sheet__level">${rec ? esc(tt('kanji.levelLine', { l: rec.l, max: S.srs.MAX_LEVEL, due: fmtDue(rec.due) })) : esc(t('kanji.notStarted'))}</div>
                </div>
            </div>
            <div class="kj-sheet__words">${item.words.slice(0, 5).map((w) => wordLine(w, ch)).join('')}${item.roma ? `<div class="kj-word"><b>${esc(item.roma)}</b></div>` : ''}</div>
            <div class="kj-sheet__actions">
                <button class="btn btn--primary" data-write>${esc(t('kanji.write'))}</button>
                <button class="btn btn--ghost" data-replay>▶ ${esc(t('kanji.replay'))}</button>
                ${rec ? `<button class="btn btn--ghost kj-danger" data-reset>${esc(t('kanji.resetChar'))}</button>` : ''}
            </div>`);
        const board = new C.Board(sheet.querySelector('.kj-board__host'));
        const got = await S.strokes.ensure([ch]);
        const data = got.get(ch);
        const meta = sheet.querySelector('[data-meta]');
        if (!data) {
            meta.textContent = t('kanji.noStrokes');
            sheet.querySelector('[data-write]').disabled = true;
        } else {
            board.setGlyph(data);
            board.animate({ withNumbers: S.settings.get('numbers') });
            meta.textContent = tt('kanji.strokesN', { n: data.s.length }) + (data.p && data.p.length ? ' · ' + t('kanji.parts') + ' ' + data.p.join(' ') : '');
        }
        sheet.querySelector('[data-replay]').addEventListener('click', () => data && board.animate({ withNumbers: S.settings.get('numbers') }));
        sheet.querySelector('[data-write]').addEventListener('click', () => {
            closeSheet();
            startSession({ ...scope, items: [item] }, 'cram');
        });
        const reset = sheet.querySelector('[data-reset]');
        if (reset) reset.addEventListener('click', () => {
            S.srs.reset(ch);
            closeSheet();
            openDeck(scope, { replace: true });
        });
    }

    function fmtDue(ts) {
        const diff = ts - Date.now();
        if (diff <= 0) return t('kanji.dueNow');
        const h = Math.round(diff / 3600000);
        if (h < 24) return tt('kanji.inHours', { n: Math.max(1, h) });
        return tt('kanji.inDays', { n: Math.round(diff / 86400000) });
    }

    function wordLine(w, ch, { hide } = {}) {
        const kanji = [...String(w.kanji)].map((c) => (hide && c === ch)
            ? '<span class="kj-blank">?</span>' : esc(c)).join('');
        const tr = w.translation ? esc(w.translation) : '';
        return `<div class="kj-word"><b lang="ja">${kanji}</b>${w.kana && w.kana !== w.kanji ? `<i lang="ja">${esc(w.kana)}</i>` : ''}${tr ? `<span>${tr}</span>` : ''}</div>`;
    }

    // ------------------------------------------------------------------
    // Bottom sheet (свой: app.js с modalLayer тут не подключён)
    // ------------------------------------------------------------------
    let sheetEl = null;
    function openSheet(html) {
        closeSheet();
        const ov = document.createElement('div');
        ov.className = 'kj-overlay';
        ov.innerHTML = `<div class="kj-sheet" role="dialog"><div class="kj-sheet__grip"></div>${html}</div>`;
        ov.addEventListener('click', (e) => { if (e.target === ov) closeSheet(); });
        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('is-open'));
        sheetEl = ov;
        return ov.firstElementChild;
    }
    function closeSheet() {
        if (!sheetEl) return;
        const el = sheetEl;
        sheetEl = null;
        el.classList.remove('is-open');
        setTimeout(() => el.remove(), 220);
    }

    // ------------------------------------------------------------------
    // Настройки
    // ------------------------------------------------------------------
    function openSettings() {
        const st = S.settings.all();
        const seg = (key, opts) => `<div class="kj-seg" data-key="${key}">${opts.map(([v, label]) =>
            `<button class="${String(st[key]) === String(v) ? 'is-on' : ''}" data-v="${v}">${esc(label)}</button>`).join('')}</div>`;
        const tog = (key, label) => `<label class="kj-toggle"><span>${esc(label)}</span><input type="checkbox" data-key="${key}" ${st[key] ? 'checked' : ''}><i></i></label>`;
        const sheet = openSheet(`
            <h3 class="kj-sheet__title">${esc(t('kanji.settings'))}</h3>
            <div class="kj-field"><span>${esc(t('kanji.tolerance'))}</span>${seg('tolerance', [['strict', t('kanji.tolStrict')], ['normal', t('kanji.tolNormal')], ['loose', t('kanji.tolLoose')]])}</div>
            <div class="kj-field"><span>${esc(t('kanji.newPerSession'))}</span>${seg('newPerSession', [[3, '3'], [5, '5'], [10, '10']])}</div>
            <div class="kj-field"><span>${esc(t('kanji.maxPerSession'))}</span>${seg('maxPerSession', [[10, '10'], [15, '15'], [25, '25']])}</div>
            <div class="kj-field"><span>${esc(t('kanji.snap'))}</span>${seg('snap', [['true', t('kanji.snapOn')], ['false', t('kanji.snapOff')]])}</div>
            ${tog('numbers', t('kanji.optNumbers'))}
            ${tog('speak', t('kanji.optSpeak'))}
            ${tog('vibrate', t('kanji.optVibrate'))}
            <p class="kj-note">${esc(t('kanji.credits'))}</p>`);
        sheet.querySelectorAll('.kj-seg').forEach((seg) => seg.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            const key = seg.dataset.key;
            const raw = b.dataset.v;
            const v = raw === 'true' ? true : raw === 'false' ? false : (isNaN(raw) ? raw : Number(raw));
            S.settings.set(key, v);
            seg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
        }));
        sheet.querySelectorAll('input[type=checkbox]').forEach((i) => i.addEventListener('change', () => S.settings.set(i.dataset.key, i.checked)));
    }

    // ------------------------------------------------------------------
    // Сессия
    // ------------------------------------------------------------------
    let session = null;
    let board = null;
    const ui = {};

    // Очередь: на повторении — просроченные, потом новые (в порядке колоды).
    function buildQueue(scope, go) {
        const now = Date.now();
        const maxN = S.settings.get('maxPerSession');
        const newN = S.settings.get('newPerSession');
        let due = [], fresh = [], rest = [];
        for (const it of scope.items) {
            if (S.srs.isNew(it.ch)) fresh.push(it);
            else if (S.srs.isDue(it.ch, now)) due.push(it);
            else rest.push(it);
        }
        let picked;
        if (go === 'review') picked = due.slice(0, maxN).map((it) => ({ item: it, stages: ['recall'], fresh: false }));
        else if (go === 'learn') {
            picked = due.slice(0, Math.max(0, maxN - newN)).map((it) => ({ item: it, stages: ['recall'], fresh: false }))
                .concat(fresh.slice(0, newN).map((it) => ({ item: it, stages: ['watch', 'trace', 'recall'], fresh: true })));
        } else {
            // cram: всё подряд, новые — с показом, остальные по памяти
            picked = scope.items.slice(0, Math.max(maxN, 50)).map((it) => ({
                item: it, fresh: S.srs.isNew(it.ch),
                stages: S.srs.isNew(it.ch) ? ['watch', 'trace', 'recall'] : ['recall'],
            }));
        }
        return picked.map((q) => ({ ...q, attempts: 0 }));
    }

    async function startSession(scope, go) {
        const queue = buildQueue(scope, go);
        if (!queue.length) { showSnackbar(t('kanji.nothingToDo')); return; }
        session = { scope, go, queue, pos: 0, stage: 0, results: [], startedAt: Date.now() };
        trackEvent('kanji_session', scope.kind + ':' + go);

        renderSessionShell();
        show('session');
        history.pushState({ screen: 'session' }, '', '?deck=' + encodeURIComponent(scope.id) + '&go=' + go);

        ui.ctx.innerHTML = `<div class="kj-loading">${esc(t('kanji.loading'))}</div>`;
        const got = await S.strokes.ensure(queue.map((q) => q.item.ch));
        // Знаки без штрихов в справочнике — выкидываем молча (редкость: редкие
        // формы, ошибки парсера).
        session.queue = queue.filter((q) => got.get(q.item.ch));
        for (const q of session.queue) q.data = got.get(q.item.ch);
        if (!session.queue.length) {
            showSnackbar(t('kanji.noStrokes'), { type: 'error' });
            renderHome();
            return;
        }
        nextGlyph();
    }

    function renderSessionShell() {
        const el = screens.session;
        el.innerHTML = `
            <div class="kj-sess__top">
                <button class="kj-top__btn" data-quit aria-label="${esc(t('kanji.quit'))}">✕</button>
                <div class="kj-progress"><div class="kj-progress__bar"></div></div>
                <span class="kj-sess__count"></span>
            </div>
            <div class="kj-ctx"></div>
            <div class="kj-board"><div class="kj-board__host"></div><div class="kj-board__msg" hidden></div></div>
            <div class="kj-tools"></div>`;
        ui.quit = el.querySelector('[data-quit]');
        ui.bar = el.querySelector('.kj-progress__bar');
        ui.count = el.querySelector('.kj-sess__count');
        ui.ctx = el.querySelector('.kj-ctx');
        ui.msg = el.querySelector('.kj-board__msg');
        ui.tools = el.querySelector('.kj-tools');
        board = new C.Board(el.querySelector('.kj-board__host'), { onStroke });
        ui.quit.addEventListener('click', () => {
            if (session && session.results.length) finishSession();
            else { session = null; history.back(); }
        });
    }

    function cur() { return session.queue[session.pos]; }
    function stageName() { return cur().stages[session.stage]; }

    function nextGlyph() {
        const q = cur();
        if (!q) { finishSession(); return; }
        session.glyph = { idx: 0, misses: 0, hints: 0, streakMiss: 0, startedAt: Date.now() };
        session.stage = 0;
        renderStage();
    }

    function renderStage() {
        const q = cur();
        const st = stageName();
        const g = session.glyph;
        g.idx = 0; g.streakMiss = 0;
        if (st !== 'recall') { g.misses = 0; g.hints = 0; }

        board.setGlyph(q.data);
        board.showGhost(st === 'trace');
        board.setEnabled(st !== 'watch');
        ui.msg.hidden = true;
        ui.msg.className = 'kj-board__msg';

        const done = session.pos;
        ui.bar.style.width = Math.round(done / session.queue.length * 100) + '%';
        ui.count.textContent = (done + 1) + '/' + session.queue.length;

        renderContext(q, st);
        renderTools(st);

        if (st === 'watch') {
            board.animate({ withNumbers: S.settings.get('numbers') }).then(() => {
                // После показа — тушь остаётся, чтобы знак не исчезал перед обводкой.
            });
        }
    }

    function renderContext(q, st) {
        const it = q.item;
        const hide = st === 'recall';
        const label = t(st === 'watch' ? 'kanji.stageWatch' : st === 'trace' ? 'kanji.stageTrace' : st === 'done' ? 'kanji.stageDone' : 'kanji.stageRecall');
        let main;
        if (it.roma) {
            main = `<div class="kj-ctx__main"><b class="kj-ctx__roma">${esc(it.roma)}</b><span>${esc(session.scope.name)}</span></div>`;
        } else {
            const w = it.words[0];
            const others = it.words.slice(1, 3);
            main = `<div class="kj-ctx__main">${w ? wordLine(w, it.ch, { hide }) : `<div class="kj-word"><b lang="ja">${hide ? '<span class="kj-blank">?</span>' : esc(it.ch)}</b></div>`}</div>`
                + (others.length ? `<div class="kj-ctx__others">${others.map((o) => wordLine(o, it.ch, { hide })).join('')}</div>` : '');
        }
        const parts = (!hide && q.data.p && q.data.p.length) ? `<div class="kj-ctx__parts">${esc(t('kanji.parts'))} ${q.data.p.map((p) => `<span lang="ja">${esc(p)}</span>`).join('')}</div>` : '';
        ui.ctx.innerHTML = `<div class="kj-ctx__head"><span class="kj-chip kj-chip--${st}">${esc(label)}</span><span class="kj-ctx__strokes" data-strokes></span></div>${main}${parts}`;
        updateStrokeCount();
    }

    function updateStrokeCount() {
        const el = ui.ctx.querySelector('[data-strokes]');
        if (el) el.textContent = session.glyph.idx + '/' + cur().data.s.length;
    }

    function renderTools(st) {
        const b = (data, cls, label, title) => `<button class="kj-tool ${cls || ''}" data-act="${data}" ${title ? `aria-label="${esc(title)}" title="${esc(title)}"` : ''}>${label}</button>`;
        if (st === 'watch') {
            ui.tools.innerHTML = b('replay', '', '▶ ' + esc(t('kanji.replay')))
                + b('go-trace', 'kj-tool--primary', esc(t('kanji.goWrite')) + ' →');
        } else {
            ui.tools.innerHTML = b('undo', '', '↶', t('kanji.undo'))
                + b('hint', '', '💡', t('kanji.hint'))
                + b('replay', '', '▶', t('kanji.replay'))
                + b('clear', '', '⟲', t('kanji.clear'))
                + b('skip', 'kj-tool--text', esc(t('kanji.skip')) + ' →');
        }
        ui.tools.querySelectorAll('[data-act]').forEach((x) => x.addEventListener('click', () => onTool(x.dataset.act)));
    }

    function onTool(act) {
        const g = session.glyph;
        const st = stageName();
        if (act === 'replay') {
            // На этапе «по памяти» показ — это подсказка на весь знак.
            if (st === 'recall') { g.hints += 2; }
            board.animate({ withNumbers: S.settings.get('numbers') });
            board.setEnabled(st !== 'watch');
        } else if (act === 'go-trace') {
            session.stage += 1;
            renderStage();
        } else if (act === 'hint') {
            if (g.idx >= cur().data.s.length) return;
            if (st === 'recall') g.hints += 1;
            board.hint(g.idx);
            setMsg(tt('kanji.hintStroke', { n: g.idx + 1 }), 'hint');
        } else if (act === 'undo') {
            if (g.idx === 0) return;
            g.idx -= 1;
            board.uncommit();
            board.clearHint();
            updateStrokeCount();
        } else if (act === 'clear') {
            renderStageKeepScore();
        } else if (act === 'skip') {
            // Пропуск на повторении = «не помню».
            if (st === 'recall' && !cur().fresh) S.srs.rate(cur().item.ch, 'again');
            session.results.push({ ch: cur().item.ch, grade: 'skip' });
            session.pos += 1;
            nextGlyph();
        }
    }

    // «Заново»: сбрасывает штрихи, но ошибки на этапе «по памяти» остаются
    // (иначе чистить доску было бы способом обнулить счёт).
    function renderStageKeepScore() {
        const { misses, hints } = session.glyph;
        renderStage();
        session.glyph.misses = misses;
        session.glyph.hints = hints;
    }

    function setMsg(text, kind) {
        ui.msg.textContent = text;
        ui.msg.className = 'kj-board__msg' + (kind ? ' is-' + kind : '');
        ui.msg.hidden = false;
        clearTimeout(ui.msgTimer);
        ui.msgTimer = setTimeout(() => { ui.msg.hidden = true; }, 2200);
    }

    function onStroke(points) {
        const q = cur();
        const g = session.glyph;
        const st = stageName();
        if (st === 'watch' || g.idx >= q.data.s.length) return;
        // Случайное касание — не штрих, не считаем ошибкой.
        if (points.length < 2 && q.data.s.length > 1 && C.samplePath(q.data.s[g.idx]).len > 12) return;

        const tol = C.TOL[S.settings.get('tolerance')] || C.TOL.normal;
        const r = C.recognize(points, q.data.s, g.idx, tol);
        if (r.ok) {
            board.clearHint();
            board.commit(g.idx, S.settings.get('snap') ? null : points);
            g.idx += 1;
            g.streakMiss = 0;
            buzz(8);
            updateStrokeCount();
            if (g.idx >= q.data.s.length) onGlyphDone();
            return;
        }

        g.misses += 1;
        g.streakMiss += 1;
        board.flashWrong(points);
        buzz([20, 40, 20]);
        if (r.reason === 'order') setMsg(tt('kanji.errOrder', { n: g.idx + 1, m: r.which + 1 }), 'err');
        else if (r.reason === 'reversed') setMsg(t('kanji.errDirection'), 'err');
        else setMsg(tt('kanji.errShape', { n: g.idx + 1 }), 'err');
        // Со второй ошибки подряд показываем, какой штрих ждём; с третьей —
        // рисуем его сами, чтобы не застрять.
        if (g.streakMiss >= 2) board.hint(g.idx);
        if (g.streakMiss >= 3) {
            setTimeout(() => {
                if (!session || cur() !== q || g.idx >= q.data.s.length) return;
                board.clearHint();
                board.commit(g.idx);
                g.idx += 1;
                g.streakMiss = 0;
                if (st === 'recall') g.hints += 1;
                updateStrokeCount();
                if (g.idx >= q.data.s.length) onGlyphDone();
            }, 500);
        }
    }

    function onGlyphDone() {
        const q = cur();
        const g = session.glyph;
        const st = stageName();
        board.setEnabled(false);
        board.clearHint();
        buzz([10, 30, 10]);

        if (st === 'trace') {
            // Этап пройден — коротко ✓ и дальше, по памяти.
            setMsg('✓ ' + t('kanji.traceDone'), 'ok');
            setTimeout(() => {
                if (!session || cur() !== q) return;
                session.stage += 1;
                renderStage();
            }, 800);
            return;
        }

        // «По памяти»: оценка по ошибкам и подсказкам.
        const score = g.misses + 2 * g.hints;
        let grade;
        if (score === 0) grade = q.fresh ? 'good' : 'easy';
        else if (score <= 3) grade = 'good';
        else if (score <= 6) grade = 'hard';
        else grade = 'again';

        const w = q.item.words[0];
        if (w && S.settings.get('speak') && typeof speakJa === 'function') speakJa(w.kanji);
        S.days.add(score === 0);
        S.srs.rate(q.item.ch, grade);
        session.results.push({ ch: q.item.ch, grade, misses: g.misses, hints: g.hints });
        trackEvent('kanji_write', grade);

        // Контекст раскрываем: пропуск заполняется знаком.
        renderContext(q, 'done');
        updateStrokeCount();

        const label = t('kanji.grade_' + grade);
        const detail = score === 0 ? t('kanji.perfect')
            : [g.misses ? tt('kanji.missesN', { n: g.misses }) : '', g.hints ? tt('kanji.hintsN', { n: g.hints }) : ''].filter(Boolean).join(' · ');
        const requeue = grade === 'again' && q.attempts < 1;
        ui.tools.innerHTML = `<div class="kj-result kj-result--${grade}"><b>${esc(label)}</b><span>${esc(detail)}${requeue ? ' · ' + esc(t('kanji.willRepeat')) : ''}</span></div>`
            + `<button class="kj-tool" data-act="again">↺ ${esc(t('kanji.again'))}</button>`
            + `<button class="kj-tool kj-tool--primary" data-act="next">${esc(t('kanji.next'))} →</button>`;
        ui.tools.querySelector('[data-act=again]').addEventListener('click', () => {
            session.results.pop();
            session.glyph = { idx: 0, misses: 0, hints: 0, streakMiss: 0, startedAt: Date.now() };
            renderStage();
        });
        ui.tools.querySelector('[data-act=next]').addEventListener('click', () => {
            if (requeue) {
                session.queue.push({ ...q, stages: ['trace', 'recall'], attempts: q.attempts + 1 });
            }
            session.pos += 1;
            nextGlyph();
        });
    }

    function finishSession() {
        const res = session.results;
        const perfect = res.filter((r) => r.grade === 'easy' || (r.grade === 'good' && !r.misses && !r.hints)).length;
        const hard = res.filter((r) => r.grade === 'hard' || r.grade === 'again' || r.grade === 'skip').length;
        const mins = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
        const scope = session.scope;
        screens.summary.innerHTML = `
            <div class="kj-sum">
                <div class="kj-sum__glyph">${esc(res.length ? res[res.length - 1].ch : '書')}</div>
                <h2>${esc(t('kanji.sessionDone'))}</h2>
                <div class="kj-hero__tiles">
                    <div class="kj-tile"><b>${res.length}</b><span>${esc(t('kanji.sumWritten'))}</span></div>
                    <div class="kj-tile"><b>${perfect}</b><span>${esc(t('kanji.sumPerfect'))}</span></div>
                    <div class="kj-tile"><b>${hard}</b><span>${esc(t('kanji.sumHard'))}</span></div>
                </div>
                <div class="kj-sum__chars">${res.map((r) => `<span class="kj-cell is-${r.grade}">${esc(r.ch)}</span>`).join('')}</div>
                <p class="kj-note">${esc(tt('kanji.sumTime', { n: mins }))}</p>
                <div class="kj-actions">
                    <button class="btn btn--primary" data-more>${esc(t('kanji.oneMore'))}</button>
                    <button class="btn btn--ghost" data-home>${esc(t('kanji.toHome'))}</button>
                </div>
            </div>`;
        screens.summary.querySelector('[data-more]').addEventListener('click', () => {
            const sc = scopeById(scope.id) || scope;
            const stats = S.srs.stats(sc.items.map((i) => i.ch));
            startSession(sc, stats.due ? 'review' : (stats.fresh ? 'learn' : 'cram'));
        });
        screens.summary.querySelector('[data-home]').addEventListener('click', () => {
            history.replaceState({ screen: 'home' }, '', location.pathname);
            renderHome();
        });
        session = null;
        show('summary');
        history.replaceState({ screen: 'summary' }, '', '?done=1');
    }

    // ------------------------------------------------------------------
    // Навигация по истории: кнопка «назад» телефона закрывает экран, а не
    // уводит с приложения.
    // ------------------------------------------------------------------
    window.addEventListener('popstate', () => {
        if (sheetEl) { closeSheet(); }
        session = null;
        if (board) board.stopAnimation();
        const p = new URLSearchParams(location.search);
        const id = p.get('deck');
        const sc = id ? scopeById(id) : null;
        if (sc && !p.get('go')) openDeck(sc, { replace: true });
        else renderHome();
    });

    // ------------------------------------------------------------------
    // Старт
    // ------------------------------------------------------------------
    async function init() {
        if (typeof applyI18n === 'function') applyI18n();
        document.title = t('kanji.title') + ' — Animei';
        $('#kj-settings-btn').addEventListener('click', openSettings);
        await loadWords();
        document.addEventListener('decks:changed', () => {
            if (document.body.dataset.screen === 'home') renderHome();
        });

        const p = new URLSearchParams(location.search);
        const sc = p.get('deck') ? scopeById(p.get('deck')) : null;
        history.replaceState({ screen: 'home' }, '', location.pathname);
        renderHome();
        if (sc) {
            openDeck(sc);
            if (p.get('go')) startSession(sc, p.get('go'));
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
