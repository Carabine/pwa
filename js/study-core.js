// ============================================================================
//  Study core — shared flashcard engine for the daily SRS (study.html)
//  and the cram deck (custom-study.html).
//
//  Two modes, one engine:
//    • scheduled  → real spaced repetition, progress saved per word id,
//                   intervals grow (1 → 3 → 7 → 16 … days).
//    • cram        → go through every word once, no schedule touched.
//
//  Public entry point:  startStudy({ scheduled: true|false })
// ============================================================================

(function () {
    'use strict';

    // ---- Tunables ----------------------------------------------------------
    const NEW_PER_DAY = 20;      // how many brand-new words to introduce per day
    const NEW_STEPS   = 2;       // correct answers needed to graduate a new/lapsed card
    const CRAM_STEPS  = 1;       // correct answers needed to clear a card in cram mode
    const MAX_INTERVAL = 365;    // cap on the review interval, in days
    const SCHEDULE_KEY = 'srs:schedule:v2';
    const DAYS_KEY = 'srs:days';       // days the user actually studied (for the streak)

    // ---- ИИ-разбор предложения на обороте карточки -------------------------
    let studyAiAvailable = false;
    const studyExplainCache = new Map();   // разбор по тексту предложения — на сессию
    if (typeof client !== 'undefined') {
        client.get('explain/status')
            .then(({ data }) => { studyAiAvailable = !!data?.data?.available; })
            .catch(() => {});
    }

    function studyRenderExplain(out, data) {
        out.innerHTML = '';
        out.classList.remove('hidden');
        const section = (title, node) => {
            const sec = document.createElement('div');
            sec.className = 'explain__section';
            const h = document.createElement('div');
            h.className = 'explain__title';
            h.textContent = title;
            sec.append(h, node);
            out.appendChild(sec);
        };
        if (data.translation) {
            const p = document.createElement('div');
            p.className = 'explain__translation';
            p.textContent = data.translation;
            section(t('explain.translation'), p);
        }
        if (data.breakdown?.length) {
            const list = document.createElement('div');
            for (const b of data.breakdown) {
                const row = document.createElement('div');
                row.className = 'explain__part';
                const jp = document.createElement('span');
                jp.className = 'explain__jp';
                jp.textContent = b.part;
                const rd = document.createElement('span');
                rd.className = 'explain__reading';
                rd.textContent = b.reading && b.reading !== b.part ? ' ' + b.reading : '';
                const mean = document.createElement('div');
                mean.className = 'explain__meaning';
                mean.textContent = b.meaning;
                row.append(jp, rd, mean);
                list.appendChild(row);
            }
            section(t('explain.parts'), list);
        }
        if (data.grammar?.length) {
            const list = document.createElement('div');
            for (const g of data.grammar) {
                const row = document.createElement('div');
                row.className = 'explain__part';
                const point = document.createElement('span');
                point.className = 'explain__jp';
                point.textContent = g.point;
                const expl = document.createElement('div');
                expl.className = 'explain__meaning';
                expl.textContent = g.explanation;
                row.append(point, expl);
                list.appendChild(row);
            }
            section(t('explain.grammar'), list);
        }
    }

    // Модалка ИИ-разбора: один оверлей на всё приложение, переиспользуем его.
    // Раньше разбор раскрывался прямо в карточке и ломал её вёрстку/скролл —
    // теперь показываем в отдельном окне со своим скроллом.
    let explainModal = null;
    function getExplainModal() {
        if (explainModal) return explainModal;
        const overlay = document.createElement('div');
        overlay.className = 'explain-modal';
        overlay.hidden = true;
        overlay.innerHTML =
            '<div class="explain-modal__dialog" role="dialog" aria-modal="true">' +
                '<div class="explain-modal__head">' +
                    '<span class="explain-modal__title"></span>' +
                    '<button class="explain-modal__close" type="button" aria-label="Закрыть">✕</button>' +
                '</div>' +
                '<div class="explain-modal__body"></div>' +
            '</div>';
        overlay.querySelector('.explain-modal__title').textContent = t('words.explain');
        document.body.appendChild(overlay);

        const body = overlay.querySelector('.explain-modal__body');
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        function close() {
            overlay.hidden = true;
            document.removeEventListener('keydown', onKey);
        }
        // Клик по затемнённому фону (но не по диалогу) — закрыть.
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.explain-modal__close').addEventListener('click', close);

        explainModal = {
            body,
            open() {
                overlay.hidden = false;
                body.scrollTop = 0;
                document.addEventListener('keydown', onKey);
            },
        };
        return explainModal;
    }

    async function studyRunExplain(sentence, btn) {
        const modal = getExplainModal();
        const cached = studyExplainCache.get(sentence);
        if (cached) { studyRenderExplain(modal.body, cached); modal.open(); return; }
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = t('words.explaining');
        try {
            const { data: res } = await client.get('explain', { params: { sentence }, timeout: 60000 });
            const data = res.data.explanation;
            studyExplainCache.set(sentence, data);
            studyRenderExplain(modal.body, data);
            modal.open();
        } catch (err) {
            console.error(err);
            const limited = err.response?.data?.reason === 'limited' || err.response?.status === 429;
            showSnackbar(limited ? t('popup.explainLimited') : t('words.explainError'), { duration: 3500, type: 'error' });
        } finally {
            // Кнопку не убираем — разбор можно открыть снова (из кэша, мгновенно).
            btn.disabled = false;
            btn.textContent = label;
        }
    }

    // ---- Date helpers (day granularity) ------------------------------------
    function todayStart() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    }

    // A stable "YYYY-MM-DD" key so scheduling never depends on timezones/time.
    function dayKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // ---- Schedule storage --------------------------------------------------
    // schedule = { [wordId]: { interval, reps, lapses, due } }  (due is a dayKey)
    function loadSchedule() {
        try {
            const raw = JSON.parse(localStorage.getItem(SCHEDULE_KEY) ?? '{}');
            return (raw && typeof raw === 'object') ? raw : {};
        } catch {
            return {};
        }
    }

    function saveSchedule(schedule) {
        localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
    }

    // Next interval after a successful graduation.
    function nextInterval(prevInterval) {
        if (prevInterval <= 0) return 1;
        if (prevInterval === 1) return 3;
        return Math.min(Math.round(prevInterval * 2.2), MAX_INTERVAL);
    }

    // ---- Study days & streak ------------------------------------------------
    function loadStudyDays() {
        try {
            const raw = JSON.parse(localStorage.getItem(DAYS_KEY) ?? '[]');
            return Array.isArray(raw) ? raw : [];
        } catch {
            return [];
        }
    }

    function markStudiedToday() {
        const today = dayKey(todayStart());
        const days = loadStudyDays();
        if (days[days.length - 1] === today) return;
        days.push(today);
        localStorage.setItem(DAYS_KEY, JSON.stringify(days.slice(-400)));
    }

    // Сколько дней подряд занимались (сегодня или вчера — серия ещё жива).
    function studyStreak() {
        const days = new Set(loadStudyDays());
        let cursor = todayStart();
        if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
        let streak = 0;
        while (days.has(dayKey(cursor))) {
            streak++;
            cursor = addDays(cursor, -1);
        }
        return streak;
    }

    // ---- Server sync ---------------------------------------------------------
    // Прогресс повторений уходит на сервер, чтобы не потеряться при смене
    // устройства. Гостевые слова (id вида local-*) живут только в браузере.
    function canSync() {
        return typeof isLoggedIn === 'function' && isLoggedIn() && typeof client !== 'undefined';
    }

    function pushSrsToServer(wordId, entry) {
        if (!canSync() || String(wordId).startsWith('local-')) return;
        client.post('words/srs', {
            updates: [{ id: wordId, ...entry }],
        }).catch(() => { /* нет сети — локальная копия расписания всё равно есть */ });
    }

    // На новом устройстве локального расписания нет — берём его с сервера
    // (поля srs* приходят вместе со словами). Если есть и то и другое,
    // выигрывает вариант с бОльшим числом повторений, при равенстве — с более
    // поздней датой показа.
    function mergeServerSchedule() {
        const words = JSON.parse(localStorage.getItem('words') ?? '[]');
        const schedule = loadSchedule();
        let changed = false;

        for (const w of words) {
            if (!w || !w.id || !w.srsDue) continue;
            const server = {
                interval: w.srsInterval ?? 0,
                reps: w.srsReps ?? 0,
                lapses: w.srsLapses ?? 0,
                due: w.srsDue,
            };
            const local = schedule[w.id];
            const serverWins = !local
                || server.reps > (local.reps ?? 0)
                || (server.reps === (local.reps ?? 0) && server.due > (local.due ?? ''));
            if (serverWins && (!local || local.due !== server.due || local.reps !== server.reps)) {
                schedule[w.id] = server;
                changed = true;
            }
        }
        if (changed) saveSchedule(schedule);
    }

    // ---- Сводка для главной страницы ----------------------------------------
    // Сколько сегодня ждёт повторений и новых слов + серия дней.
    function srsSummary() {
        const words = JSON.parse(localStorage.getItem('words') ?? '[]').filter(w => w && w.id);
        const schedule = loadSchedule();
        const today = dayKey(todayStart());

        let due = 0, fresh = 0;
        for (const w of words) {
            const s = schedule[w.id];
            if (!s) fresh++;
            else if (s.due <= today) due++;
        }
        return {
            due,
            fresh: Math.min(fresh, NEW_PER_DAY),
            total: words.length,
            streak: studyStreak(),
        };
    }
    window.srsSummary = srsSummary;
    window.mergeServerSchedule = mergeServerSchedule;

    // ---- Word field accessors (data.json and data2.json differ slightly) ---
    function videoSrcOf(word) {
        return word.Video ? word.Video.url : (word.video ?? '');
    }

    // ========================================================================
    //  Session engine
    // ========================================================================
    function startStudy(config) {
        const scheduled = !!config.scheduled;
        const steps = scheduled ? NEW_STEPS : CRAM_STEPS;
        // Готовая колода вместо коллекции пользователя (режим для новичков):
        // слова берём из config.deck, расписание не трогаем, на карточках
        // есть кнопка «В коллекцию».
        const deck = Array.isArray(config.deck) ? config.deck : null;
        const collectable = !!config.collectable;
        const savedKanji = new Set(); // что уже добавили в коллекцию за сессию

        const els = {
            front:    document.querySelector('.front-side'),
            back:     document.querySelector('.back-side'),
            buttons:  document.querySelector('.buttons'),
            stats:    document.querySelector('.study-stats'),
            progress: document.querySelector('.study-progress__bar'),
            hintBtn:  document.querySelector('.hint-btn'),
            modalContent: document.querySelector('#modal-content'),
        };

        let schedule = loadSchedule();
        let queue = [];       // array of session items (see buildItem)
        let current = null;
        let graduated = 0;    // cards finished this session
        let total = 0;        // cards in this session at the start

        // ---- Build the deck for this session -------------------------------
        function buildItem(word, isNew) {
            return {
                id: word.id,
                word,
                isNew,
                seen: false,       // answered at least once this session
                failed: false,     // pressed "Again" at least once this session
                left: isNew ? steps : 1,   // review cards graduate on first correct answer
            };
        }

        function buildDeck() {
            if (deck) {
                // Готовая колода: проходим один раз, как cram.
                return shuffle(deck.map(w => buildItem(w, true)));
            }

            const words = JSON.parse(localStorage.getItem('words') ?? '[]')
                .filter(w => w && w.id);

            if (!scheduled) {
                // Cram: every word, no schedule involved.
                return shuffle(words.map(w => buildItem(w, true)));
            }

            const today = dayKey(todayStart());
            const due = [];
            const fresh = [];

            for (const word of words) {
                const s = schedule[word.id];
                if (!s) {
                    fresh.push(word);              // never studied
                } else if (s.due <= today) {
                    due.push(buildItem(word, false)); // review is due
                }
            }

            // Introduce a limited number of new words per day.
            const newItems = shuffle(fresh).slice(0, NEW_PER_DAY).map(w => buildItem(w, true));
            return shuffle([...due, ...newItems]);
        }

        // ---- Re-queue a card so it comes back later, not immediately --------
        function reinsert(item, gap) {
            const at = Math.min(queue.length, gap);
            queue.splice(at, 0, item);
        }

        // ---- Persist a graduated card's next review date -------------------
        function graduate(item) {
            if (scheduled) {
                const prev = schedule[item.id] ?? { interval: 0, reps: 0, lapses: 0 };
                const interval = item.failed ? 1 : nextInterval(prev.interval);
                schedule[item.id] = {
                    interval,
                    reps: item.failed ? 0 : (prev.reps ?? 0) + 1,
                    lapses: (prev.lapses ?? 0) + (item.failed ? 1 : 0),
                    due: dayKey(addDays(todayStart(), interval)),
                };
                saveSchedule(schedule);
                pushSrsToServer(item.id, schedule[item.id]);
                markStudiedToday();
            }
            graduated++;
        }

        // ---- Answer handlers ----------------------------------------------
        function answerAgain() {
            current.failed = true;
            current.seen = true;
            current.left = steps;      // restart the learning steps
            reinsert(current, 1);      // show again soon (after the next card)
            advance();
        }

        function answerGood() {
            current.seen = true;
            current.left -= 1;
            if (current.left <= 0) {
                graduate(current);     // done for this session
            } else {
                reinsert(current, 3);  // one more step, a few cards later
            }
            advance();
        }

        function advance() {
            current = queue.shift() ?? null;
            render();
        }

        // ---- Counts for the header ----------------------------------------
        function counts() {
            let fresh = 0, learning = 0, review = 0;
            for (const it of queue) {
                if (it.seen) learning++;
                else if (it.isNew) fresh++;
                else review++;
            }
            if (current) {
                if (current.seen) learning++;
                else if (current.isNew) fresh++;
                else review++;
            }
            return { fresh, learning, review };
        }

        // ========================================================================
        //  Rendering
        // ========================================================================
        function renderStats() {
            if (!els.stats) return;
            const c = counts();
            if (scheduled) {
                els.stats.innerHTML = `
                    <span class="stat stat--new"><b>${c.fresh}</b><small>${t('study.new')}</small></span>
                    <span class="stat stat--learn"><b>${c.learning}</b><small>${t('study.learning')}</small></span>
                    <span class="stat stat--due"><b>${c.review}</b><small>${t('study.review')}</small></span>`;
            } else {
                const remaining = c.fresh + c.learning + c.review;
                els.stats.innerHTML = `
                    <span class="stat stat--learn"><b>${remaining}</b><small>${t('study.remaining')}</small></span>
                    <span class="stat stat--new"><b>${graduated}</b><small>${t('study.doneCount')}</small></span>`;
            }
            if (els.progress) {
                const pct = total ? Math.round((graduated / total) * 100) : 0;
                els.progress.style.width = pct + '%';
            }
        }

        function makeButton(label, className, handler) {
            const btn = document.createElement('button');
            btn.className = className;
            btn.textContent = label;
            btn.addEventListener('click', handler);
            return btn;
        }

        function renderFront() {
            els.back.innerHTML = '';
            els.back.classList.remove('back-side--visible');
            els.front.innerHTML = '';
            els.front.classList.remove('hidden');
            if (els.hintBtn) els.hintBtn.classList.add('hidden');

            const wordEl = document.createElement('div');
            wordEl.className = 'word';
            wordEl.textContent = current.word.word ?? current.word.kanji ?? '';
            els.front.appendChild(wordEl);

            els.buttons.innerHTML = '';
            els.buttons.appendChild(makeButton(t('study.showAnswer'), 'show-btn', renderBack));
        }

        function addLine(cls, text) {
            if (!text) return;
            const el = document.createElement('div');
            el.className = cls;
            el.textContent = text;
            els.back.appendChild(el);
        }

        // Кнопка озвучки: без видео с оригинальным звуком голос синтеза —
        // лучший способ услышать слово ещё раз.
        function addSpeakButton(target, text) {
            if (!text || typeof canSpeakJa !== 'function' || !canSpeakJa()) return;
            const btn = document.createElement('button');
            btn.className = 'speak-btn';
            btn.type = 'button';
            btn.textContent = '🔊';
            btn.title = t('study.listen');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                speakJa(text);
            });
            target.appendChild(btn);
        }

        // Свой мини-плеер вместо нативных браузерных контролов: короткий клип
        // сам зациклен, поэтому нужны только Play/Pause по центру и кнопка звука.
        function makeClipVideo(src) {
            const ICONS = {
                play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.55.88l10.8-6.86a1.04 1.04 0 0 0 0-1.76L9.55 4.26A1.04 1.04 0 0 0 8 5.14z"/></svg>',
                volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.3 5.7a9 9 0 0 1 0 12.6"/></svg>',
                muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/></svg>',
            };

            const wrap = document.createElement('div');
            wrap.className = 'clip-player';

            const video = document.createElement('video');
            video.src = src;
            video.autoplay = true;
            // Проигрываем клип один раз и останавливаемся — без зацикливания.
            video.loop = false;
            video.playsInline = true;
            wrap.appendChild(video);

            const playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.className = 'clip-player__play';
            playBtn.setAttribute('aria-label', 'Play/pause');
            playBtn.innerHTML = ICONS.play;
            wrap.appendChild(playBtn);

            const muteBtn = document.createElement('button');
            muteBtn.type = 'button';
            muteBtn.className = 'clip-player__mute';
            muteBtn.setAttribute('aria-label', 'Sound');
            muteBtn.innerHTML = ICONS.volume;
            wrap.appendChild(muteBtn);

            const toggle = () => { video.paused ? video.play().catch(() => {}) : video.pause(); };
            const sync = () => wrap.classList.toggle('is-paused', video.paused);

            video.addEventListener('play', sync);
            video.addEventListener('pause', sync);
            // Клип доиграл (loop выключен) — показываем кнопку Play, чтобы можно
            // было пересмотреть. Событие 'pause' на естественном завершении не
            // приходит, поэтому синхронизируем состояние отдельно по 'ended'.
            video.addEventListener('ended', sync);
            video.addEventListener('click', toggle);
            playBtn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
            muteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                video.muted = !video.muted;
                muteBtn.innerHTML = video.muted ? ICONS.muted : ICONS.volume;
            });
            sync();

            return wrap;
        }

        function renderBack() {
            const w = current.word;
            els.back.innerHTML = '';
            els.back.classList.add('back-side--visible');

            const src = videoSrcOf(w);
            if (src) {
                els.back.appendChild(makeClipVideo(src));
            } else if (typeof getClipUrl === 'function' && w.id) {
                // Клип гостя лежит в IndexedDB — тянем асинхронно и ставим сверху,
                // если карточка ещё та же самая.
                const wid = w.id;
                getClipUrl(wid).then((url) => {
                    if (!url || !current || current.word.id !== wid) return;
                    if (!els.back.classList.contains('back-side--visible')) return;
                    els.back.insertBefore(makeClipVideo(url), els.back.firstChild);
                });
            }
            if (w.audio) {
                const audio = document.createElement('audio');
                audio.src = w.audio;
                audio.controls = true;
                audio.volume = 0.4;
                els.back.appendChild(audio);
            }

            addLine('meaning', w.meaning ?? w.translation ?? '');

            const kanaLine = document.createElement('div');
            kanaLine.className = 'hiragana';
            kanaLine.textContent = w.kana ?? '';
            if (kanaLine.textContent) els.back.appendChild(kanaLine);

            const sentenceLine = document.createElement('div');
            sentenceLine.className = 'sentence';
            sentenceLine.textContent = w.sentence ?? '';
            if (sentenceLine.textContent) els.back.appendChild(sentenceLine);

            addLine('translatedSentence', w.translatedSentence ?? w.sentenceTranslation ?? '');

            // ИИ-разбор предложения — по кнопке (если у слова есть предложение и ИИ
            // включён). Результат открывается в модалке (studyRunExplain), а не
            // растягивает саму карточку.
            if (studyAiAvailable && w.sentence) {
                const explainBtn = makeButton(
                    t('words.explain'),
                    'card-explain-btn',
                    () => studyRunExplain(w.sentence, explainBtn),
                );
                els.back.appendChild(explainBtn);
            }

            if (w.anime) addLine('card-anime', t('starter.fromAnime') + ' ' + w.anime);

            // В готовой колоде слово можно забрать к себе в коллекцию
            if (collectable && w._card && typeof saveWord === 'function') {
                const already = savedKanji.has(w.kanji)
                    || (window.starterSavedKanji && window.starterSavedKanji.has(w.kanji));
                const btn = makeButton(
                    already ? t('starter.addedOne') : t('starter.addOne'),
                    'starter-save-btn',
                    async () => {
                        btn.disabled = true;
                        btn.textContent = t('popup.saving');
                        try {
                            await saveWord(starterWordPayload(w._card));
                            savedKanji.add(w.kanji);
                            if (window.starterSavedKanji) window.starterSavedKanji.add(w.kanji);
                            btn.textContent = t('starter.addedOne');
                            showSnackbar(t('popup.savedSnack'), { duration: 2500 });
                        } catch (err) {
                            console.error(err);
                            btn.disabled = false;
                            btn.textContent = t('starter.addOne');
                            showSnackbar(t('popup.saveError'), { duration: 3000, type: 'error' });
                        }
                    }
                );
                btn.disabled = already;
                els.back.appendChild(btn);
            }

            els.buttons.innerHTML = '';
            els.buttons.appendChild(makeButton(t('study.again'), 'keep-word-btn', answerAgain));
            els.buttons.appendChild(makeButton(t('study.good'), 'bury-word-btn', answerGood));

            if (w.hint && els.hintBtn && els.modalContent) {
                els.hintBtn.classList.remove('hidden');
                els.modalContent.innerHTML = w.hint;
            }
        }

        // Коллекция пустая — предлагаем готовую колоду, а не тупик
        function renderStarterOffer() {
            els.front.classList.add('hidden'); // пустой фронт даёт лишнюю линию-разделитель
            els.back.innerHTML = `
                <div class="done">
                    <div class="done__check done__check--starter">🌱</div>
                    <div class="done__title">${t('starter.offer.title')}</div>
                    <div class="done__text">${t('starter.offer.text')}</div>
                </div>`;
            els.back.classList.add('back-side--visible');

            const addBtn = makeButton(t('starter.add'), 'btn btn--primary', async () => {
                addBtn.disabled = true;
                addBtn.textContent = t('popup.saving');
                try {
                    const n = await addStarterWords(STARTER_CORE_COUNT);
                    showSnackbar(t('starter.added') + ' ' + n, { duration: 3000 });
                    restart();
                } catch (err) {
                    console.error(err);
                    addBtn.disabled = false;
                    addBtn.textContent = t('starter.add');
                }
            });
            els.buttons.appendChild(addBtn);

            const openBtn = makeButton(t('starter.open'), 'btn btn--ghost', () => {
                window.location.href = './beginner.html';
            });
            els.buttons.appendChild(openBtn);
            renderStats();
        }

        function renderDone() {
            current = null;
            if (els.hintBtn) els.hintBtn.classList.add('hidden');
            els.front.innerHTML = '';
            els.front.classList.add('hidden'); // пустой фронт даёт лишнюю линию-разделитель
            els.back.classList.remove('back-side--visible');
            els.buttons.innerHTML = '';

            // Слов нет совсем — вместо «нечего повторять» предлагаем стартовый набор
            if (total === 0 && !deck && typeof STARTER_DECK !== 'undefined') {
                const words = JSON.parse(localStorage.getItem('words') ?? '[]');
                if (!words.length) {
                    renderStarterOffer();
                    return;
                }
            }

            // Итог сессии: сколько пройдено, что ждёт завтра и серия дней —
            // маленький повод вернуться.
            const lines = [];
            if (total === 0) {
                lines.push(scheduled ? t('study.nothingDue') : t('study.noWords'));
            } else {
                lines.push(`${t('study.reviewed')} ${total}`);
            }
            if (scheduled) {
                const tomorrow = dayKey(addDays(todayStart(), 1));
                const dueTomorrow = Object.values(loadSchedule()).filter(s => s.due <= tomorrow).length;
                if (total > 0) lines.push(`${t('study.tomorrow')} ${dueTomorrow}`);
                const streak = studyStreak();
                if (streak > 1 && typeof tStreak === 'function') lines.push('🔥 ' + tStreak(streak));
            }

            els.back.innerHTML = `
                <div class="done">
                    <div class="done__check">✓</div>
                    <div class="done__title">${t('study.allDone')}</div>
                    ${lines.map(l => `<div class="done__text">${l}</div>`).join('')}
                </div>`;
            els.back.classList.add('back-side--visible');

            els.buttons.appendChild(makeButton(t('study.restart'), 'show-btn', restart));

            // Готовая колода: можно забрать все слова разом
            if (deck && collectable && typeof addStarterWords === 'function') {
                const allBtn = makeButton(t('starter.addAll'), 'btn btn--primary', async () => {
                    allBtn.disabled = true;
                    allBtn.textContent = t('popup.saving');
                    try {
                        const n = await addStarterWords(Infinity);
                        showSnackbar(t('starter.added') + ' ' + n, { duration: 3000 });
                        allBtn.textContent = t('starter.addedOne');
                    } catch (err) {
                        console.error(err);
                        allBtn.disabled = false;
                        allBtn.textContent = t('starter.addAll');
                    }
                });
                els.buttons.appendChild(allBtn);
            }
            renderStats();
        }

        function render() {
            renderStats();
            if (!current) {
                renderDone();
                return;
            }
            renderFront();
        }

        // ---- (Re)start a session ------------------------------------------
        function restart() {
            schedule = loadSchedule();
            queue = buildDeck();
            total = queue.length;
            graduated = 0;
            current = queue.shift() ?? null;
            render();
        }

        // ---- Keyboard shortcuts -------------------------------------------
        function onKey(e) {
            if (!current) return;                       // let buttons work normally on the done screen
            if (e.target.matches('input, textarea')) return;
            const back = els.back.classList.contains('back-side--visible');
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                back ? answerGood() : renderBack();
            } else if (back && (e.key === '1' || e.code === 'ArrowLeft')) {
                answerAgain();
            } else if (back && (e.key === '2' || e.code === 'ArrowRight')) {
                answerGood();
            }
        }

        // ---- Wiring --------------------------------------------------------
        function wireModal() {
            const overlay = document.getElementById('modal-overlay');
            const openBtn = document.getElementById('open-modal-btn');
            const closeBtn = document.getElementById('close-modal-btn');
            if (!overlay || !openBtn || !closeBtn) return;
            openBtn.addEventListener('click', () => overlay.classList.remove('hidden'));
            closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.classList.add('hidden');
            });
        }

        function wireRefresh() {
            const btn = document.querySelector('.refresh-btn');
            if (btn) btn.addEventListener('click', restart);
        }

        // ---- Bootstrap -----------------------------------------------------
        wireModal();
        wireRefresh();
        document.addEventListener('keydown', onKey);

        window.addEventListener('load', async () => {
            await fetchDataFromServer();   // makes sure `words` is in localStorage
            mergeServerSchedule();         // на новом устройстве подтянет расписание с сервера
            if (window.animeiTrack) window.animeiTrack('study', scheduled ? 'srs' : 'cram');
            restart();
        });
    }

    window.startStudy = startStudy;
})();
