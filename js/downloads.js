// Загрузки для офлайна: видео карточек и ИИ-разборы на устройстве.
//
// Повторение должно работать без сети (метро, самолёт), а для этого на
// устройстве нужны клип каждой карточки (IndexedDB, video-store.js) и её
// ИИ-разбор. Здесь:
//  • реестр загрузок — что качается сейчас, что в очереди, что готово.
//    cacheMediaFromUrl (video-store.js) сам регистрирует каждый файл через
//    AnimeiDownloads.track, так что видны и докачка из учёбы, и прогрев после
//    сохранения слова;
//  • значок в шапке рядом со значком «Нет сети» — пока что-то грузится; по тапу
//    окно со списком;
//  • разборы: сервер считает их сам при сохранении слова, а сюда забираем уже
//    готовые пачкой (POST /explain/cached — без обращения к ИИ и без траты
//    лимита «Разобрать»);
//  • докачка при старте: видео и разборы ближайших карточек, которых на
//    устройстве ещё нет (прогрев после сохранения мог не успеть: клип режется
//    до минуты, а человек ушёл из плеера).
//
// Подключается после video-store.js, words-store.js и app.js (modalLayer).
(function () {
    const tasks = new Map();   // key → { key, kind, label, state, loaded, total, error, at }
    const RECENT_KEEP = 40;
    const ACTIVE_STATES = new Set(['queued', 'waiting', 'active']);

    const tt = (k, fb) => (typeof t === 'function' ? t(k) : fb || k);

    // ---------- Реестр ----------

    let renderQueued = false;
    function emit() {
        if (renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(() => { renderQueued = false; renderChip(); renderSheet(); });
    }

    function prune() {
        const done = [...tasks.values()].filter((x) => !ACTIVE_STATES.has(x.state))
            .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
        for (const x of done.slice(RECENT_KEEP)) tasks.delete(x.key);
    }

    function track(key, { kind = 'clip', label = '' } = {}) {
        let task = tasks.get(key);
        if (!task) {
            task = { key, kind, label, state: 'queued', loaded: 0, total: 0, error: null, at: Date.now() };
            tasks.set(key, task);
        } else {
            Object.assign(task, { state: 'queued', loaded: 0, total: 0, error: null, at: Date.now() });
            if (label) task.label = label;
        }
        emit();
        let lastEmit = 0;
        return {
            set(state) { task.state = state; emit(); },
            progress(loaded, total) {
                task.loaded = loaded;
                task.total = total;
                const now = Date.now();
                if (now - lastEmit > 250) { lastEmit = now; emit(); }
            },
            done(ok, error) {
                task.state = ok ? 'done' : (error === 'later' ? 'later' : 'error');
                task.error = ok ? null : (error || null);
                task.doneAt = Date.now();
                prune();
                emit();
                if (ok) mediaCountsStale = true;
            },
            // Убрать из списка совсем (пустая попытка — показывать нечего).
            drop() { tasks.delete(key); emit(); },
        };
    }

    const activeCount = () => [...tasks.values()].filter((x) => ACTIVE_STATES.has(x.state)).length;
    const online = () => navigator.onLine !== false && (!window.ANIMEI_NET || window.ANIMEI_NET.isOnline());
    const saveData = () => !!(navigator.connection && navigator.connection.saveData);
    const signedIn = () => typeof isSignedIn === 'function' && isSignedIn();
    const lang = () => (typeof getLang === 'function' ? getLang() : 'ru');
    const wordLabel = (w) => (w && (w.kanji || w.kana || w.word)) || '';
    // Слово, по которому карточка просит разбор (studyRunExplain: w.word ?? w.kanji).
    const explainWord = (w) => (w.word ?? w.kanji) || '';
    const explainTarget = (w) => (window.LearnLang && LearnLang.wordLang(w) === 'en' ? 'en' : 'ja');

    // ---------- ИИ-разборы ----------
    // Слова копим и забираем пачкой: колода из серии сохраняет десятки слов
    // разом, и запрос на каждое упёрся бы в лимит. Не готово (сервер ещё
    // считает) — пробуем ещё пару раз с паузой, дальше докачка при старте.
    const EXPLAIN_BATCH = 50;
    const EXPLAIN_RETRIES = [20000, 45000];
    const explainWanted = new Map();   // key → { item, word, tries }
    let explainTimer = null;
    let explainBusy = false;
    let explainBlockedUntil = 0;

    function explainItem(w) {
        if (!w || !w.sentence || !explainWord(w) || typeof explainKey !== 'function') return null;
        const item = { sentence: String(w.sentence).slice(0, 500), word: explainWord(w), lang: lang(), target: explainTarget(w) };
        return { key: explainKey(item.sentence, item.word, item.lang, item.target), item };
    }

    async function wantExplains(words, delay = 0) {
        for (const w of words || []) {
            const x = explainItem(w);
            if (!x || explainWanted.has(x.key)) continue;
            if (await hasExplain(x.key)) continue;
            explainWanted.set(x.key, { ...x, label: wordLabel(w), tries: 0 });
        }
        scheduleExplains(delay);
    }

    function scheduleExplains(delay) {
        if (!explainWanted.size) return;
        clearTimeout(explainTimer);
        explainTimer = setTimeout(flushExplains, Math.max(delay, explainBlockedUntil - Date.now(), 0));
    }

    async function flushExplains() {
        if (explainBusy || !explainWanted.size) return;
        if (!online() || typeof client === 'undefined') return;   // вернётся сеть — докачка при старте/следующем сохранении
        explainBusy = true;
        const batch = [...explainWanted.values()].slice(0, EXPLAIN_BATCH);
        const one = batch.length === 1;
        const task = track('explains:' + Date.now(), { kind: one ? 'explain' : 'explains', label: one ? batch[0].label : String(batch.length) });
        task.set('active');
        let got = 0;
        try {
            const { data: res } = await client.post('explain/cached', { items: batch.map((b) => b.item) }, { silentErrors: true, timeout: 30000 });
            const list = (res && res.data && res.data.explanations) || [];
            for (let i = 0; i < batch.length; i++) {
                const b = batch[i];
                if (list[i]) {
                    if (await putExplain(b.key, list[i])) got++;
                    explainWanted.delete(b.key);
                } else if (++b.tries > EXPLAIN_RETRIES.length) {
                    explainWanted.delete(b.key);   // не посчитан — заберём при следующей докачке
                }
            }
            task.progress(got, batch.length);
            if (got) task.done(true);
            else task.drop();   // ещё не посчитаны — повторим, в списке не мусорим
        } catch (err) {
            if (err && err.response && err.response.status === 429) explainBlockedUntil = Date.now() + 60000;
            task.done(false, err && err.message);
        } finally {
            explainBusy = false;
        }
        if (explainWanted.size) {
            const tries = Math.max(0, ...[...explainWanted.values()].map((b) => b.tries));
            scheduleExplains(EXPLAIN_RETRIES[Math.min(tries, EXPLAIN_RETRIES.length) - 1] || 1000);
        }
    }

    // Разбор с расчётом (гость: сервер его слова не видит и сам не посчитает).
    // Итог: 'ok' | 'skip' (уже есть/нечего разбирать) | 'limited' (лимит —
    // подождать) | 'off' (ИИ на сервере выключен) | 'error'.
    async function computeExplain(w) {
        const x = explainItem(w);
        if (!x || typeof client === 'undefined' || await hasExplain(x.key)) return 'skip';
        const task = track('explain:' + x.key, { kind: 'explain', label: wordLabel(w) });
        task.set('active');
        try {
            const params = { sentence: x.item.sentence, lang: x.item.lang, word: x.item.word };
            if (x.item.target === 'en') params.target = 'en';
            const { data: res } = await client.get('explain', { params, timeout: 90000, silentErrors: true });
            const ok = await putExplain(x.key, res && res.data && res.data.explanation);
            task.done(ok);
            return ok ? 'ok' : 'error';
        } catch (err) {
            const r = err && err.response;
            const reason = r && r.data && r.data.reason;
            task.done(false, err && err.message);
            if (r && (r.status === 429 || reason === 'limited')) return 'limited';
            if (reason === 'off') return 'off';
            return 'error';
        }
    }

    // ---------- Докачка при старте ----------
    // Берём ближайшее, что понадобится в повторении: новые слова (свежие
    // первыми) и карточки со сроком в ближайшие две недели. Потолки — чтобы
    // первый запуск на телефоне с тысячей слов не выкачивал гигабайт.
    const RESUME_DELAY = 4000;
    const HORIZON_DAYS = 14;
    const MAX_CLIPS = 60;
    const MAX_EXPLAINS = 300;
    const RECENT_UNCUT_MS = 3 * 24 * 3600 * 1000;
    let syncing = null;

    function dayKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function priorityWords() {
        const words = (typeof lsJson === 'function' ? lsJson('animei:wordsCache') : null);
        if (!Array.isArray(words)) return [];
        const schedule = (typeof lsJson === 'function' ? lsJson('srs:schedule:v2', {}) : {}) || {};
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + HORIZON_DAYS);
        const until = dayKey(horizon);
        const fresh = [];
        const due = [];
        for (const w of words) {
            if (!w || !w.id) continue;
            const s = schedule[w.id];
            if (!s) fresh.push(w);
            else if (s.due && s.due <= until) due.push({ w, due: s.due });
        }
        fresh.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        due.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
        // Сначала то, что повторять раньше всего, потом новые.
        return [...due.map((x) => x.w), ...fresh];
    }

    const clipUrlOf = (w) => (w && (w.Video ? w.Video.url : w.video)) || '';
    const hasVideoRange = (w) => Number(w.videoEnd) > Number(w.videoStart);

    async function storageTight() {
        try {
            const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
            return !!(est && est.quota && est.usage / est.quota > 0.8);
        } catch { return false; }
    }

    async function syncOffline({ manual = false } = {}) {
        if (syncing) return syncing;
        if (!signedIn() || !online() || (saveData() && !manual)) return { clips: 0, explains: 0, skipped: true };
        syncing = (async () => {
            const words = priorityWords();
            let clips = 0;
            // Разборы — дёшево (JSON, без ИИ): берём шире, чем видео.
            await wantExplains(words.slice(0, MAX_EXPLAINS));
            const pendingExplains = explainWanted.size;
            if (!(await storageTight())) {
                let fails = 0;
                for (const w of words) {
                    if (clips >= MAX_CLIPS || fails >= 3 || !online()) break;
                    let url = clipUrlOf(w);
                    if (!url && Number(w.videoEnd) > Number(w.videoStart)
                        && Date.now() - new Date(w.createdAt || 0) < RECENT_UNCUT_MS) {
                        // Сохранено недавно, а в кэше списка клипа нет — мог дорезаться.
                        try {
                            const { data: res } = await client.get(`words/${w.id}/clip`, { silentErrors: true });
                            url = (res && res.data && res.data.url) || '';
                            if (url && typeof rememberWordInCache === 'function') rememberWordInCache({ id: w.id, Video: { url } });
                        } catch { /* нет — значит, нет */ }
                    }
                    if (!url || await hasClip(w.id)) continue;
                    const ok = await cacheMediaFromUrl('clip', w.id, url, { label: wordLabel(w) });
                    if (ok) { clips++; fails = 0; } else fails++;
                }
            }
            return { clips, explains: pendingExplains };
        })().finally(() => { syncing = null; });
        return syncing;
    }

    // Автоматически — не в плеере: там видео серии, и докачка отнимала бы у
    // него канал. Плеер прогревает только что сохранённые слова сам.
    function autoResume() {
        if (/\/player\.html$/.test(location.pathname)) return;
        setTimeout(() => { syncOffline().catch(() => {}); }, RESUME_DELAY);
    }
    window.addEventListener('animei:network', (e) => {
        if (e.detail && e.detail.online) { scheduleExplains(1000); }
    });

    // ---------- Значок в шапке ----------
    const DL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><polyline points="7 10 12 15 17 10"/><path d="M5 20h14"/></svg>';
    let chip = null;

    function ensureChip() {
        if (chip && chip.isConnected) return chip;
        chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'offline-chip dl-chip';
        chip.innerHTML = '<span class="offline-chip__ico dl-chip__ico"></span><span class="dl-chip__count"></span>';
        chip.addEventListener('click', openSheet);
        const right = document.querySelector('.header__right');
        const anchor = right && (right.querySelector('.offline-chip:not(.dl-chip)') || right.querySelector('.profile-wrap'));
        if (right && anchor) right.insertBefore(chip, anchor);
        else if (right) right.appendChild(chip);
        else return null;
        return chip;
    }

    // Значок — только пока что-то РЕАЛЬНО качается: появляется, если работа
    // длится дольше SHOW_DELAY (короткие фоновые проверки — например, «нет ли
    // готовых разборов» при каждом запуске — его не дёргают), и уходит сразу,
    // как всё скачано, без галочки «готово».
    const SHOW_DELAY = 800;
    let showTimer = null;
    function renderChip() {
        const n = activeCount();
        if (n > 0 && !(chip && chip.isConnected)) {
            if (!showTimer) showTimer = setTimeout(() => { showTimer = null; if (activeCount()) renderChipNow(); }, SHOW_DELAY);
            return;
        }
        renderChipNow();
    }
    function renderChipNow() {
        const n = activeCount();
        if (n > 0) {
            const el = ensureChip();
            if (!el) return;
            const paused = !online();
            el.classList.toggle('is-busy', !paused);
            el.classList.toggle('is-done', false);
            el.classList.toggle('is-paused', paused);
            el.querySelector('.dl-chip__ico').innerHTML = DL_ICON;
            el.querySelector('.dl-chip__count').textContent = String(n);
            const label = tt('dl.title', 'Загрузки для офлайна') + ': ' + n + (paused ? ' — ' + tt('dl.state.paused', 'ждёт сеть') : '');
            el.title = label;
            el.setAttribute('aria-label', label);
        } else {
            // Всё скачано — значок уходит сразу (окно, если открыто, остаётся).
            clearTimeout(showTimer);
            showTimer = null;
            if (chip) { chip.remove(); chip = null; }
        }
    }

    // ---------- Окно со списком ----------
    let sheet = null;          // { overlay, body, modal }
    let mediaCounts = null;
    let mediaCountsStale = true;

    function fmtMb(bytes) {
        return (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0);
    }

    function kindLabel(x) {
        if (x.kind === 'explains') return tt('dl.kind.explains', 'ИИ-разборы');
        return tt('dl.kind.' + x.kind, x.kind);
    }

    function stateText(x) {
        if (x.state === 'active' && x.kind !== 'explains' && x.kind !== 'explain' && x.loaded) {
            const pct = x.total ? Math.round((x.loaded / x.total) * 100) + '% · ' : '';
            return pct + fmtMb(x.loaded) + (x.total ? ' / ' + fmtMb(x.total) : '') + ' ' + tt('dl.mb', 'МБ');
        }
        if (x.state === 'active' && !online()) return tt('dl.state.paused', 'ждёт сеть');
        if (x.kind === 'explains' && x.state === 'done') {
            return tt('dl.explainsGot', 'получено {n}').replace('{n}', String(x.loaded || 0));
        }
        return tt('dl.state.' + x.state, x.state);
    }

    function rowHtml(x) {
        const pct = x.state === 'active' && x.total ? Math.min(100, Math.round((x.loaded / x.total) * 100)) : 0;
        const label = x.kind === 'explains' && /^\d+$/.test(x.label)
            ? tt('dl.explainsN', '{n} слов').replace('{n}', x.label)
            : (x.label || '—');
        return `<li class="dl-row dl-row--${x.state}">` +
            `<span class="dl-row__mark" aria-hidden="true"></span>` +
            `<span class="dl-row__main"><span class="dl-row__label" lang="ja">${escHtml(label)}</span>` +
            `<span class="dl-row__meta">${escHtml(kindLabel(x))} · ${escHtml(stateText(x))}</span>` +
            (x.state === 'active' && x.total ? `<span class="dl-row__bar"><span style="width:${pct}%"></span></span>` : '') +
            `</span></li>`;
    }

    async function refreshCounts() {
        if (!mediaCountsStale && mediaCounts) return;
        mediaCountsStale = false;
        mediaCounts = typeof countMedia === 'function' ? await countMedia() : null;
        renderSheet();
    }

    function renderSheet() {
        if (!sheet) return;
        const all = [...tasks.values()];
        const now = all.filter((x) => ACTIVE_STATES.has(x.state))
            .sort((a, b) => (a.state === 'active' ? -1 : 0) - (b.state === 'active' ? -1 : 0) || a.at - b.at);
        const recent = all.filter((x) => !ACTIVE_STATES.has(x.state)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
        const counts = mediaCounts
            ? tt('dl.onDevice', 'На устройстве — видео: {clips}, ИИ-разборы: {explains}')
                .replace('{clips}', mediaCounts.clips).replace('{explains}', mediaCounts.explains)
            : '';
        let html = `<p class="dl-sheet__sub">${escHtml(tt('dl.sub'))}</p>`;
        if (counts) html += `<p class="dl-sheet__counts">${escHtml(counts)}</p>`;
        if (!online()) html += `<p class="dl-sheet__note">${escHtml(tt('dl.offline'))}</p>`;
        if (now.length) {
            html += `<div class="dl-sheet__h">${escHtml(tt('dl.now'))} · ${now.length}</div><ul class="dl-list">${now.map(rowHtml).join('')}</ul>`;
        } else {
            html += `<p class="dl-sheet__empty">${escHtml(tt('dl.empty'))}</p>`;
        }
        if (recent.length) {
            html += `<div class="dl-sheet__h">${escHtml(tt('dl.recent'))}</div><ul class="dl-list">${recent.slice(0, 15).map(rowHtml).join('')}</ul>`;
        }
        sheet.body.innerHTML = html;
        if (sheet.syncBtn) {
            sheet.syncBtn.hidden = !signedIn();
            sheet.syncBtn.disabled = !!syncing || !online();
        }
        if (mediaCountsStale) refreshCounts();
    }

    function openSheet() {
        if (sheet || typeof modalLayer !== 'function') return;
        const overlay = document.createElement('div');
        overlay.className = 'deck-sheet__overlay';
        const box = document.createElement('div');
        box.className = 'deck-editor dl-sheet';
        box.innerHTML = `<div class="deck-editor__title">${escHtml(tt('dl.title'))}</div><div class="dl-sheet__body"></div>` +
            `<div class="dl-sheet__foot"><button type="button" class="btn btn--ghost dl-sheet__sync">${escHtml(tt('dl.syncNow'))}</button>` +
            `<button type="button" class="btn btn--primary dl-sheet__close">${escHtml(tt('dl.close', 'Закрыть'))}</button></div>`;
        overlay.appendChild(box);
        const modal = modalLayer(overlay, { afterHide: () => { sheet = null; } });
        sheet = { overlay, body: box.querySelector('.dl-sheet__body'), modal, syncBtn: box.querySelector('.dl-sheet__sync') };
        box.querySelector('.dl-sheet__close').addEventListener('click', () => modal.close());
        sheet.syncBtn.addEventListener('click', async () => {
            const btn = sheet && sheet.syncBtn;
            if (btn) { btn.disabled = true; btn.textContent = tt('dl.syncing'); }
            const r = await syncOffline({ manual: true }).catch(() => null);
            if (sheet && sheet.syncBtn) sheet.syncBtn.textContent = tt('dl.syncNow');
            if (r && !r.clips && !r.explains && !activeCount() && sheet && typeof formMessage === 'function') {
                formMessage(sheet.syncBtn.parentElement, tt('dl.syncDone'), 'success');   // в самом окне
            }
            renderSheet();
        });
        mediaCountsStale = true;
        renderSheet();
        modal.open();
    }

    // ---------- «Загрузить всё» (настройки) ----------
    // В отличие от докачки при старте — без потолков и горизонта: ВСЕ видео,
    // звук и ИИ-разборы всех слов. Разборы, которых на сервере ещё нет,
    // досчитываются ИИ — это явная просьба пользователя. Темп — под лимиты
    // сервера: /explain 30 в минуту на IP, /explain/cached 20 в минуту.
    const EXPLAIN_PACE = 2500;          // ~24 расчёта в минуту
    const CACHED_PACE = 3500;           // ~17 пачек в минуту
    const LIMIT_PAUSE = 60000;
    const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

    async function allWords() {
        if (typeof fetchWords === 'function') {
            try { return (await fetchWords()) || []; } catch { /* офлайн — по копии */ }
        }
        const cached = typeof lsJson === 'function' ? lsJson('animei:wordsCache') : null;
        return Array.isArray(cached) ? cached : [];
    }

    // Что нужно и что уже есть — для строки состояния в настройках.
    async function offlineStatus(words) {
        words = words || await allWords();
        const keys = typeof mediaKeys === 'function' ? await mediaKeys() : { clips: new Set(), explains: new Set() };
        let clipsNeed = 0, clipsHave = 0, explainsNeed = 0, explainsHave = 0;
        const guest = !signedIn();
        for (const w of words) {
            if (!w || !w.id) continue;
            // У гостя клипы и так только на устройстве — считаем то, что есть.
            // У вошедшего нужен клип каждого слова с фрагментом видео — даже если
            // сервер его ещё режет (ссылки нет): иначе «всё на устройстве» врало бы.
            if (guest ? keys.clips.has(String(w.id)) : (clipUrlOf(w) || hasVideoRange(w))) {
                clipsNeed++;
                if (keys.clips.has(String(w.id))) clipsHave++;
            }
            const x = explainItem(w);
            if (x) {
                explainsNeed++;
                if (keys.explains.has(x.key)) explainsHave++;
            }
        }
        return { words: words.length, clipsNeed, clipsHave, explainsNeed, explainsHave };
    }

    let allRun = null;
    function downloadAll({ onProgress } = {}) {
        if (allRun) return allRun.promise;
        const run = { cancelled: false };
        allRun = run;
        const report = (p) => { if (onProgress) { try { onProgress(p); } catch { /* UI */ } } };
        run.promise = (async () => {
            if (!online()) return { ok: false, reason: 'offline' };
            // Просим браузер не вытеснять хранилище при нехватке места —
            // иначе «точно офлайн» не точно: видео могли стереть без спроса.
            try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* нет API */ }

            const words = await allWords();
            const keys = await mediaKeys();
            const clipJobs = signedIn()
                ? words.filter((w) => w && w.id && (clipUrlOf(w) || hasVideoRange(w)) && !keys.clips.has(String(w.id))) : [];
            const audioJobs = words.filter((w) => w && w.id && /^https?:\/\//.test(w.audio || '') && !keys.audios.has(String(w.id)));
            const explainJobs = words.map((w) => ({ w, x: explainItem(w) }))
                .filter((j) => j.x && !keys.explains.has(j.x.key));
            const total = clipJobs.length + audioJobs.length + explainJobs.length;
            let done = 0, failed = 0;
            const tick = (phase) => report({ phase, done, total, failed });
            tick('start');

            // 1) Видео и звук — по одному файлу.
            // Клип, которого нет на сервере (нарезка потерялась), сервер по
            // запросу GET /words/:id/clip дорезает сам (healing) — такие
            // откладываем и забираем в конце, дождавшись нарезки.
            const askClip = async (w) => {
                try {
                    const { data: res } = await client.get(`words/${w.id}/clip`, { silentErrors: true });
                    const url = (res && res.data && res.data.url) || '';
                    if (url && typeof rememberWordInCache === 'function') rememberWordInCache({ id: w.id, Video: { url } });
                    return { url, healing: !!(res && res.data && res.data.healing) };
                } catch { return { url: '', healing: false }; }
            };
            const healing = [];
            for (const w of clipJobs) {
                if (run.cancelled) break;
                if (await storageTight()) { failed += clipJobs.length - clipJobs.indexOf(w); break; }
                let url = clipUrlOf(w);
                if (!url) {
                    const r = await askClip(w);
                    url = r.url;
                    if (!url && r.healing) {
                        healing.push(w);
                        const task = track('clip:' + w.id, { kind: 'clip', label: wordLabel(w) });
                        task.set('waiting');
                        continue;
                    }
                }
                const ok = url ? await cacheMediaFromUrl('clip', w.id, url, { label: wordLabel(w) }) : false;
                done++; if (!ok) failed++;
                tick('clips');
            }
            // Ждём дорезку: до двух минут, опрос раз в 5 с.
            const healUntil = Date.now() + 120000;
            while (healing.length && !run.cancelled && Date.now() < healUntil) {
                tick('heal');
                await sleepMs(5000);
                for (const w of [...healing]) {
                    const { url } = await askClip(w);
                    if (!url) continue;
                    healing.splice(healing.indexOf(w), 1);
                    const ok = await cacheMediaFromUrl('clip', w.id, url, { label: wordLabel(w) });
                    done++; if (!ok) failed++;
                }
            }
            for (const w of healing) {
                track('clip:' + w.id, { kind: 'clip', label: wordLabel(w) }).done(false, 'later');
                done++; failed++;
            }
            tick('clips');
            for (const w of audioJobs) {
                if (run.cancelled) break;
                const ok = await cacheMediaFromUrl('audio', w.id, w.audio, { label: wordLabel(w) });
                done++; if (!ok) failed++;
                tick('audio');
            }

            // 2) Готовые разборы — пачками, без ИИ.
            for (let i = 0; i < explainJobs.length && !run.cancelled; i += EXPLAIN_BATCH) {
                const batch = explainJobs.slice(i, i + EXPLAIN_BATCH);
                const task = track('explains:all:' + i, { kind: 'explains', label: String(batch.length) });
                task.set('active');
                try {
                    const { data: res } = await client.post('explain/cached', { items: batch.map((j) => j.x.item) }, { silentErrors: true, timeout: 30000 });
                    const list = (res && res.data && res.data.explanations) || [];
                    let got = 0;
                    for (let k = 0; k < batch.length; k++) {
                        if (list[k] && await putExplain(batch[k].x.key, list[k])) { batch[k].have = true; got++; done++; }
                    }
                    task.progress(got, batch.length);
                    if (got) task.done(true); else task.drop();
                } catch (err) {
                    task.done(false, err && err.message);
                    if (err && err.response && err.response.status === 429) await sleepMs(LIMIT_PAUSE);
                }
                tick('explains');
                if (i + EXPLAIN_BATCH < explainJobs.length) await sleepMs(CACHED_PACE);
            }
            const rest = explainJobs.filter((j) => !j.have);

            // 3) Недостающие разборы — расчёт ИИ, по одному, в темпе лимита.
            for (let i = 0; i < rest.length; i++) {
                if (run.cancelled) break;
                let r = await computeExplain(rest[i].w);
                if (r === 'limited') {
                    tick('wait');
                    await sleepMs(LIMIT_PAUSE);
                    if (run.cancelled) break;
                    r = await computeExplain(rest[i].w);
                }
                if (r === 'off') { failed += rest.length - i; break; }   // ИИ на сервере выключен
                done++; if (r !== 'ok' && r !== 'skip') failed++;
                tick('compute');
                if (i + 1 < rest.length) await sleepMs(EXPLAIN_PACE);
            }
            mediaCountsStale = true;
            const result = { ok: !run.cancelled, cancelled: run.cancelled, done, total, failed };
            report({ phase: 'end', ...result });
            return result;
        })().finally(() => { if (allRun === run) allRun = null; });
        return run.promise;
    }
    function cancelDownloadAll() { if (allRun) allRun.cancelled = true; }

    window.AnimeiDownloads = {
        track,
        open: openSheet,
        // Разборы этих слов — забрать готовые с сервера (без ИИ). delay — дать
        // серверу досчитать разбор только что сохранённого слова.
        wantExplains,
        computeExplain,
        sync: syncOffline,
        status: offlineStatus,
        downloadAll,
        cancelAll: cancelDownloadAll,
        isDownloadingAll: () => !!allRun,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoResume);
    else autoResume();
})();
