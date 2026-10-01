(function () {
    'use strict';
    const C = window.KanjiCore, I = window.KANJI_I18N;
    const tr = (key, values) => I.text(key, values);
    const main = document.getElementById('ka-main');
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let words = [], sources = [], selected = 'all', board = null, session = null, stage = '', view = 'loading';
    let errors = 0, hints = 0, completed = false, preparing = false, notices = [], loadingId = 0;
    const stored = C.read('preferences', {}) || {};
    let preferences = {
        queue: ['today', 'new', 'free'].includes(stored.queue) ? stored.queue : 'today',
        size: [5, 10, 20].includes(stored.size) ? stored.size : 10,
        mode: stored.mode === 'memory' ? 'memory' : 'guided'
    };
    const button = (label, action, primary) => `<button type="button" class="btn ${primary ? 'btn--primary' : 'btn--ghost'}" data-action="${action}">${esc(tr(label))}</button>`;
    function vibrate(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {} }
    function destroyBoard() { if (board) { board.destroy(); board = null; } }
    function focusMain() { main.focus({ preventScroll: true }); }
    function noticeMarkup() { return notices.map(message => `<p class="ka-notice">${esc(message)}</p>`).join(''); }
    function buildSources() {
        const decks = window.Decks ? Decks.visible().filter(d => d.lang !== 'en') : [];
        const activeIds = new Set(), frozenIds = new Set();
        decks.forEach(d => (d.wordIds || []).forEach(id => (d.frozen ? frozenIds : activeIds).add(String(id))));
        const eligible = words.filter(w => w && w.lang !== 'en' && !Freeze.isWord(w));
        const byId = new Map(eligible.map(w => [String(w.id), w]));
        sources = [{ id: 'all', name: tr('all'), icon: '字', items: C.extract(eligible.filter(w => !frozenIds.has(String(w.id)) || activeIds.has(String(w.id)))) }];
        decks.forEach(d => {
            const items = C.extract((d.wordIds || []).map(id => byId.get(String(id))).filter(Boolean));
            sources.push({ id: String(d.id), name: d.name, icon: Decks.iconHtml(d), frozen: d.frozen, items });
        });
        if (!sources.some(s => s.id === selected && !s.frozen)) selected = 'all';
    }
    function source() { return sources.find(s => s.id === selected) || sources[0]; }
    function options(values, current) { return values.map(([value, label]) => `<option value="${value}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join(''); }
    function home() {
        destroyBoard(); session = null; view = 'home'; buildSources();
        const current = source(), stats = C.stats(current.items);
        main.setAttribute('aria-busy', 'false');
        main.innerHTML = `<section class="ka-hero"><div><p class="ka-eyebrow">${esc(tr('eyebrow'))}</p><h1>${esc(tr('hero'))}</h1><p class="ka-muted">${esc(tr('intro'))}</p></div><div class="ka-seal" aria-hidden="true">永</div></section>
            <div class="ka-layout"><section><h2>${esc(tr('source'))}</h2><div class="ka-sources">${sources.map((s, i) => `<button type="button" class="ka-source" data-source="${i}" aria-pressed="${s.id === selected}" ${s.frozen ? 'disabled' : ''}><span class="ka-source-icon" aria-hidden="true">${s.icon || '字'}</span><span class="ka-source-copy"><span class="ka-source-name">${esc(s.name)}</span><span class="ka-source-stats">${esc(tr('stats', C.stats(s.items)))}${s.frozen ? ' · ' + esc(tr('frozen')) : ''}</span></span></button>`).join('')}</div>
            <p class="ka-note">${esc(tr('rules'))}</p><div class="ka-chars" aria-label="${esc(tr('preview'))}">${current.items.slice(0, 30).map(item => `<span class="ka-char ${((C.progress(item.char) || {}).interval >= 7) ? 'is-learned' : ''}">${esc(item.char)}</span>`).join('')}</div></section>
            <section class="ka-panel"><p class="ka-eyebrow">${esc(tr('title'))}</p><h2>${esc(tr('setup'))}</h2><div class="ka-counts">${['due', 'fresh', 'learned'].map(key => `<div><strong>${stats[key]}</strong><span>${esc(tr(key))}</span></div>`).join('')}</div>
            <div class="ka-field"><label for="ka-queue">${esc(tr('queue'))}</label><select id="ka-queue">${options([['today', tr('today')], ['new', tr('onlyNew')], ['free', tr('free')]], preferences.queue)}</select></div>
            <div class="ka-field"><label for="ka-size">${esc(tr('size'))}</label><select id="ka-size">${options([5, 10, 20].map(n => [n, n]), preferences.size)}</select></div>
            <div class="ka-field"><label for="ka-mode">${esc(tr('mode'))}</label><select id="ka-mode">${options([['guided', tr('guided')], ['memory', tr('direct')]], preferences.mode)}</select></div>
            <button type="button" id="ka-start" class="btn btn--primary ka-wide" data-action="start" ${!current.items.length ? 'disabled' : ''}>${esc(tr('start'))}</button>
            <p id="ka-queue-note" class="ka-note">${esc(tr('freeNote'))}</p>
            ${!current.items.length ? `<p class="ka-empty">${esc(tr('empty'))}</p>` : ''}<div id="ka-notices" role="status">${noticeMarkup()}</div></section></div>`;
    }
    async function load() {
        const id = ++loadingId; view = 'loading'; notices = [];
        main.setAttribute('aria-busy', 'true');
        main.innerHTML = `<p class="ka-loading">${esc(tr('loading'))}</p>`;
        let timer;
        try {
            const result = await Promise.race([fetchWords(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 18000); })]);
            if (id !== loadingId) return;
            if (!Array.isArray(result)) throw new Error('invalid words');
            words = result; home();
        } catch (_) {
            if (id !== loadingId) return;
            main.setAttribute('aria-busy', 'false');
            main.innerHTML = `<div class="ka-empty"><h1>${esc(tr('title'))}</h1><p>${esc(tr('loadError'))}</p>${button('retry', 'reload', true)}</div>`;
        } finally { clearTimeout(timer); }
    }
    async function start() {
        if (preparing) return;
        preferences = { queue: document.getElementById('ka-queue').value, size: Number(document.getElementById('ka-size').value), mode: document.getElementById('ka-mode').value };
        C.write('preferences', preferences);
        const candidates = C.queue(source().items, preferences.queue);
        notices = [];
        if (!candidates.length) { notices.push(tr('noQueue')); home(); return; }
        preparing = true;
        main.querySelectorAll('button, select').forEach(el => { el.disabled = true; });
        document.getElementById('ka-start').textContent = tr('preparing');
        main.setAttribute('aria-busy', 'true');
        const entries = [], missing = [], unavailable = [];
        let cacheOnly = false;
        try {
            // Загружаем только будущие задания; неизвестные знаки заменяем следующими из очереди.
            for (let i = 0; i < candidates.length && entries.length < preferences.size;) {
                const batch = candidates.slice(i, i + preferences.size - entries.length);
                i += batch.length;
                const data = await C.strokes(batch.map(item => item.char), cacheOnly);
                missing.push(...data.missing); unavailable.push(...data.unavailable);
                batch.forEach(item => { if (data.result.has(item.char)) entries.push({ ...item, data: data.result.get(item.char), retry: false }); });
                // При сбое сети не заставляем пользователя ждать таймаут для каждой следующей пачки.
                if (data.unavailable.length) cacheOnly = true;
            }
            if (missing.length) notices.push(tr('missing', { chars: missing.join(' ') }));
            if (unavailable.length) notices.push(tr('unavailable', { chars: unavailable.join(' ') }));
            if (!entries.length) { home(); return; }
            session = { entries, index: 0, results: new Map(), sourceName: source().name, free: preferences.queue === 'free', initial: entries.length };
            openEntry();
        } finally { preparing = false; main.setAttribute('aria-busy', 'false'); }
    }
    function currentEntry() { return session.entries[session.index]; }
    function openEntry() {
        errors = 0; hints = 0; completed = false;
        renderExercise(preferences.mode === 'guided' && !currentEntry().retry ? 'study' : 'memory');
        focusMain();
    }
    function contextMarkup(entry, concealed, limit) {
        return entry.words.slice(0, limit || 4).map((word, i) => {
            const hide = value => concealed ? String(value || '').split(entry.char).join('＿') : String(value || '');
            return `<div class="ka-context"><div class="ka-word" lang="ja">${esc(hide(word.kanji))}</div><p class="ka-reading" lang="ja">${esc(hide(word.kana || word.romaji))}</p><p class="ka-muted">${esc(hide(word.translation))}</p><button type="button" class="btn btn--ghost" data-speak="${i}">▷ ${esc(tr('speak'))}</button></div>`;
        }).join('');
    }
    function renderExercise(nextStage) {
        destroyBoard(); view = 'exercise'; stage = nextStage;
        const entry = currentEntry(), concealed = stage === 'memory';
        main.innerHTML = `<div class="ka-session-head"><div><p class="ka-eyebrow">${esc(entry.retry ? tr('repeat') : tr('session'))}</p><h1>${esc(tr('title'))}</h1></div><span class="ka-muted">${esc(tr('position', { done: session.index + 1, total: session.entries.length }))}</span>${button('exit', 'finish')}</div>
            <div class="ka-progress" aria-hidden="true"><span style="width:${session.index / session.entries.length * 100}%"></span></div>
            ${noticeMarkup()}<div class="ka-work"><section><div id="ka-prompt" class="ka-prompt">${contextMarkup(entry, concealed, 1)}</div><div class="ka-stage">${['study', 'trace', 'memory'].map((key, i) => `<span class="${stage === key ? 'is-current' : ''}" ${stage === key ? 'aria-current="step"' : ''}>${i + 1} · ${esc(tr(key))}</span>`).join('')}</div>
            <div class="ka-board-top"><span>${esc(tr(stage))}</span><span id="ka-stroke"></span></div><div id="ka-board" class="ka-paper"></div>
            <p id="ka-feedback" class="ka-feedback" role="status" aria-live="polite">${esc(tr(stage === 'study' ? 'watchHelp' : stage === 'trace' ? 'traceHelp' : 'memoryHelp'))}</p>
            <div id="ka-actions" class="ka-tools">${stage === 'study' ? button('replay', 'replay') + button('beginTrace', 'trace', true) : button('hint', 'hint') + button('clear', 'clear')}</div>
            <div id="ka-score"></div>
            ${stage !== 'study' ? `<div class="ka-tools" id="ka-secondary">${button('show', 'show')}${button('skip', 'skip')}</div>` : ''}
            </section><aside><p class="ka-eyebrow">${esc(tr('context'))}</p><div id="ka-context">${contextMarkup(entry, concealed)}</div>
            ${!concealed ? `<h3>${esc(tr('parts'))}</h3><div class="ka-parts">${Array.isArray(entry.data.parts) && entry.data.parts.length ? entry.data.parts.map(part => `<span class="ka-part" lang="ja">${esc(part)}</span>`).join('') : `<p class="ka-note">${esc(tr('noParts'))}</p>`}</div>` : ''}
            <p class="ka-note">${esc(tr(session.free ? 'freeNote' : 'memoryHelp'))}</p></aside></div>`;
        try {
            board = new KanjiBoard(document.getElementById('ka-board'), entry.data, {
                label: tr(stage), step: index => updateStroke(index + 1),
                error: (reason, index) => {
                    if (stage === 'memory') errors++;
                    feedback(tr('error' + reason, { n: index + 1 }), 'error'); vibrate([15, 35, 15]);
                },
                accept: (count, done) => {
                    vibrate(12); updateStroke(Math.min(count + 1, entry.data.s.length));
                    if (done) {
                        if (stage === 'trace') {
                            feedback(tr('traced'), 'success');
                            document.getElementById('ka-actions').innerHTML = button('beginMemory', 'memory', true);
                            document.getElementById('ka-secondary').hidden = true;
                        } else complete(errors === 0 && hints === 0 ? 'independent' : errors <= 2 && hints === 0 ? 'effort' : 'assisted');
                    } else feedback(tr('accepted'), 'success');
                }
            });
            board.setMode(stage); updateStroke(1);
        } catch (_) {
            destroyBoard();
            feedback(tr('unavailable', { chars: entry.char }), 'error');
            document.getElementById('ka-actions').innerHTML = button('next', 'unavailable', true);
            const secondary = document.getElementById('ka-secondary'); if (secondary) secondary.hidden = true;
        }
    }
    function updateStroke(n) {
        const node = document.getElementById('ka-stroke');
        if (node && session) node.textContent = tr('stroke', { n, total: currentEntry().data.s.length });
    }
    function feedback(message, tone) {
        const node = document.getElementById('ka-feedback');
        if (node) { node.textContent = message; node.dataset.tone = tone || ''; }
    }
    function reviewText(p) {
        if (!p) return tr('practice');
        return tr('nextReview', { date: p.interval === 0 ? tr('inTen') : new Intl.DateTimeFormat(I.lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(p.due) });
    }
    function complete(grade) {
        if (completed) return;
        completed = true;
        const entry = currentEntry();
        if (board) { board.cancel(); board.mode = 'study'; board.host.classList.add('is-study'); }
        const p = session.free ? null : C.record(entry.char, grade);
        session.results.set(entry.char, { char: entry.char, grade, progress: p });
        if ((grade === 'assisted' || grade === 'skipped') && !entry.retry) session.entries.push({ ...entry, retry: true });
        feedback(tr(grade), grade === 'independent' ? 'success' : '');
        document.getElementById('ka-actions').innerHTML = button('next', 'next', true);
        const secondary = document.getElementById('ka-secondary'); if (secondary) secondary.hidden = true;
        document.getElementById('ka-score').innerHTML = `<div class="ka-score"><strong lang="ja">${esc(entry.char)}</strong> · ${esc(tr(grade))}<p class="ka-note">${esc(reviewText(p))}</p></div>`;
        document.getElementById('ka-context').innerHTML = contextMarkup(entry, false);
        document.getElementById('ka-prompt').innerHTML = contextMarkup(entry, false, 1);
        if (grade === 'independent') vibrate([18, 40, 25]);
    }
    function next() {
        session.index++;
        if (session.index >= session.entries.length) finish(); else openEntry();
    }
    function finish() {
        if (!session) return;
        destroyBoard(); view = 'results';
        const results = Array.from(session.results.values());
        main.innerHTML = `<section class="ka-panel"><p class="ka-eyebrow">${esc(tr('results'))}</p><h1>${esc(tr('finished'))}</h1><p class="ka-muted">${esc(tr('summary', { done: results.length, good: results.filter(r => r.grade === 'independent').length }))}</p><p class="ka-note">${esc(tr('saved'))}</p>
            <ul class="ka-result-list">${results.map(r => `<li><span class="ka-char" lang="ja">${esc(r.char)}</span><div class="ka-result-copy"><strong>${esc(tr(r.grade))}</strong><p class="ka-note">${esc(reviewText(r.progress))}</p></div></li>`).join('')}</ul>${button('back', 'home', true)}</section>`;
        focusMain();
    }
    main.addEventListener('change', event => {
        if (view !== 'home') return;
        const field = { 'ka-queue': 'queue', 'ka-size': 'size', 'ka-mode': 'mode' }[event.target.id];
        if (field) preferences[field] = field === 'size' ? Number(event.target.value) : event.target.value;
    });
    main.addEventListener('click', async event => {
        const target = event.target.closest('button');
        if (!target || target.disabled) return;
        if (target.dataset.source !== undefined) {
            selected = sources[Number(target.dataset.source)].id; notices = []; home();
            const active = main.querySelector('.ka-source[aria-pressed="true"]'); if (active) active.focus({ preventScroll: true });
            return;
        }
        if (target.dataset.speak !== undefined && session) {
            const word = currentEntry().words[Number(target.dataset.speak)];
            try { if (typeof window.speakJa !== 'function' || !window.speechSynthesis) throw new Error('no speech'); await window.speakJa(word.kana || word.kanji); }
            catch (_) { feedback(tr('noSpeech'), 'error'); }
            return;
        }
        switch (target.dataset.action) {
            case 'reload': load(); break;
            case 'home': notices = []; home(); focusMain(); break;
            case 'start': await start(); break;
            case 'finish': finish(); break;
            case 'replay': if (board) board.play(); break;
            case 'trace': renderExercise('trace'); break;
            case 'memory': renderExercise('memory'); break;
            case 'hint':
                if (!board || completed) break;
                board.cancel(); if (stage === 'memory') hints++;
                board.hint(); feedback(tr(stage === 'memory' ? 'hinted' : 'traceHelp')); break;
            case 'clear':
                if (!board || completed) break;
                if (stage === 'memory') hints++;
                board.setMode(stage); updateStroke(1); feedback(tr(stage === 'memory' ? 'hinted' : 'traceHelp')); break;
            case 'show': hints++; renderExercise('study'); break;
            case 'skip': complete('skipped'); break;
            case 'next': next(); break;
            case 'unavailable': next(); break;
        }
    });
    window.addEventListener('kanji:storage-error', () => {
        const node = document.getElementById('ka-storage'); node.textContent = tr('storageError'); node.hidden = false;
    });
    document.addEventListener('decks:changed', () => { if (view === 'home' && !preparing) home(); });
    window.addEventListener('storage', event => {
        if (event.key && event.key.startsWith('animei:kanjiAstra:progress:') && view === 'home' && !preparing) home();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && board) board.cancel(); });
    let shellReady = false, shellFailed = false;
    function networkStatus() { document.getElementById('ka-offline').textContent = navigator.onLine === false ? tr('offline') : shellReady ? tr('offlineReady') : shellFailed ? tr('offlineFailed') : ''; }
    window.addEventListener('online', networkStatus); window.addEventListener('offline', networkStatus); networkStatus();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).then(registration => {
            const ready = () => { if (registration.active) { shellReady = true; networkStatus(); } };
            ready();
            const worker = registration.installing || registration.waiting;
            if (worker) worker.addEventListener('statechange', () => {
                ready(); if (worker.state === 'redundant' && !registration.active) { shellFailed = true; networkStatus(); }
            });
        }).catch(() => { shellFailed = true; networkStatus(); });
    }
    load();
})();
