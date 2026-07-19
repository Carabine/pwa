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
    const NEW_PER_DAY_DEFAULT = 20;  // сколько новых слов вводить в день, если настройка не менялась

    // Дневной лимит новых карточек — настройка (settings.html), а не константа:
    // «сохранил 100 слов за серию» не должно взрывать завтрашнее повторение.
    function newPerDay() {
        const v = Number(window.AnimeiSettings ? window.AnimeiSettings.get('newPerDay') : NEW_PER_DAY_DEFAULT);
        return Number.isFinite(v) && v > 0 ? v : NEW_PER_DAY_DEFAULT;
    }
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
                // Чтение из ИИ всегда хираганой. В ромадзи-режиме показываем латиницей
                // даже для чисто-канных слов (やっている → yatteiru); в режиме каны —
                // только фуригана к словам с кандзи.
                let readingText;
                const romajiMode = studyPref('studyTranscription') === 'romaji'
                    && typeof window.kanaToRomaji === 'function';
                if (romajiMode) {
                    const rom = window.kanaToRomaji(b.reading || b.part);
                    readingText = rom && rom !== b.part ? rom : '';
                } else {
                    readingText = b.reading && b.reading !== b.part ? b.reading : '';
                }
                rd.textContent = readingText ? ' ' + readingText : '';
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

    // indicator — элемент, показывающий «идёт загрузка» (искорка у предложения).
    // Может не иметь .btn-label — тогда просто крутим CSS-класс is-loading.
    async function studyRunExplain(sentence, indicator) {
        const modal = getExplainModal();
        const cached = studyExplainCache.get(sentence);
        if (cached) { studyRenderExplain(modal.body, cached); modal.open(); return; }
        if (indicator && indicator._busy) return;
        if (indicator) { indicator._busy = true; indicator.classList.add('is-loading'); }
        const labelEl = indicator && indicator.querySelector ? indicator.querySelector('.btn-label') : null;
        let savedLabel;
        if (labelEl) { savedLabel = labelEl.textContent; labelEl.textContent = t('words.explaining'); }
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
            if (indicator) { indicator._busy = false; indicator.classList.remove('is-loading'); }
            if (labelEl) labelEl.textContent = savedLabel;
        }
    }

    // ---- Настройки обучения (см. js/settings.js) ---------------------------
    function studyPref(key) {
        return window.AnimeiSettings ? window.AnimeiSettings.get(key) : undefined;
    }

    // Иконка ИИ (спарклы) для кнопки «ИИ-разбор предложения».
    const AI_ICON = '<svg class="ai-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 2 9.15 6.15 5 8l4.15 1.85L11 14l1.85-4.15L17 8l-4.15-1.85L11 2Zm7.5 9-1.1 2.4-2.4 1.1 2.4 1.1 1.1 2.4 1.1-2.4 2.4-1.1-2.4-1.1L18.5 11Z"/></svg>';

    const GEAR_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

    // Карандаш — ненавязчивая кнопка правки карточки в углу карточки.
    const PENCIL_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

    // Ромадзи предложения: тянем токены с бэкенда (/analyze, MeCab) и переводим
    // их кану в ромадзи. Кэш на сессию, чтобы не дёргать сеть повторно.
    const sentenceRomajiCache = new Map();
    async function fetchSentenceRomaji(sentence) {
        if (!sentence) return '';
        if (sentenceRomajiCache.has(sentence)) return sentenceRomajiCache.get(sentence);
        if (typeof client === 'undefined' || typeof window.kanaToRomaji !== 'function') return '';
        try {
            const { data: res } = await client.post('analyze', { text: [sentence], merge: true }, { timeout: 20000 });
            const tokens = res?.data?.[0] || [];
            const romaji = tokens
                .map((tk) => window.kanaToRomaji(READING_OVERRIDES[tk.surface] || tk.reading || tk.kana || tk.surface || ''))
                .filter(Boolean)
                .join(' ')
                .replace(/\s+([,.])/g, '$1')
                .trim();
            sentenceRomajiCache.set(sentence, romaji);
            return romaji;
        } catch {
            return '';
        }
    }

    // Токены предложения с бэкенда (/analyze, MeCab) — для пословной раскладки с
    // ромадзи над каждым словом (как в плеере аниме). Кэш на сессию.
    const sentenceTokensCache = new Map();
    async function fetchSentenceTokens(sentence) {
        if (!sentence) return [];
        if (sentenceTokensCache.has(sentence)) return sentenceTokensCache.get(sentence);
        if (typeof client === 'undefined') return [];
        try {
            // merge:true — морфемы склеены в слова (行き+まし+た → 行きました), чтобы
            // ромадзи стояла над СЛОВОМ, а не над каждым морфемом/символом.
            const { data: res } = await client.post('analyze', { text: [sentence], merge: true }, { timeout: 20000 });
            const tokens = res?.data?.[0] || [];
            sentenceTokensCache.set(sentence, tokens);
            return tokens;
        } catch {
            return [];
        }
    }

    // Некоторые ateji/выдуманные слова из аниме MeCab не знает и отдаёт без чтения
    // (напр. 喰種 «гуль» из Tokyo Ghoul читается グール, но словаря нет) — над ними
    // не рисуется фуригана/ромадзи. Задаём чтение вручную по поверхностной форме.
    const READING_OVERRIDES = { '喰種': 'グール' };

    // Пословная раскладка предложения: над каждым словом — ромадзи его чтения.
    // Токены /analyze (MeCab): чтение лежит в feature.reading КАТАКАНОЙ
    // (kanaToRomaji сам приводит катакану к ромадзи). BOS/EOS пропускаем.
    function buildReadingCells(tokens) {
        return tokens
            .filter((tk) => tk && tk.surface && tk.surface !== 'BOS' && tk.surface !== 'EOS')
            .map((tk) => {
                const surface = tk.surface;
                const kana = READING_OVERRIDES[surface]
                    || ((tk.feature && tk.feature.reading && tk.feature.reading !== '*')
                        ? tk.feature.reading
                        : (tk.kana || tk.reading || ''));
                const cell = document.createElement('span');
                cell.className = 'read-cell';
                const romaji = (kana && typeof window.kanaToRomaji === 'function')
                    ? window.kanaToRomaji(kana)
                    : '';
                // Знаки препинания / чисто-канные без чтения — строку сверху не рисуем.
                if (romaji && romaji !== surface) {
                    const rm = document.createElement('span');
                    rm.className = 'read-cell__romaji';
                    rm.textContent = romaji;
                    cell.appendChild(rm);
                }
                const jp = document.createElement('span');
                jp.className = 'read-cell__jp';
                jp.textContent = surface;
                cell.appendChild(jp);
                return cell;
            });
    }

    // Слова, сохранённые с лендинга (animei:guestWords с fromLanding). Приводим
    // к виду карточки обучения; самые свежие — первыми. Наружу для beginner-study.
    function landingWordsForStudy() {
        let raw = [];
        try { raw = JSON.parse(localStorage.getItem('animei:guestWords') || '[]'); } catch { raw = []; }
        return raw
            .filter((w) => w && w.fromLanding)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .map((w) => ({
                ...w,
                word: w.kanji,
                meaning: w.translation,
                translatedSentence: w.sentenceTranslation,
            }));
    }
    window.landingWordsForStudy = landingWordsForStudy;

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

    // Отправки сериализуем в одну цепочку: без этого два POST'а по одному слову
    // могли уйти параллельно и прийти на сервер в обратном порядке, затерев
    // свежий прогресс старым (сервер пишет последним-выигравшим, без версии).
    let srsQueue = Promise.resolve();
    function pushSrsToServer(wordId, entry) {
        if (!canSync() || String(wordId).startsWith('local-')) return;
        srsQueue = srsQueue.then(() =>
            client.post('words/srs', {
                updates: [{ id: wordId, ...entry }],
            }).catch(() => { /* нет сети — локальная копия расписания всё равно есть */ })
        );
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
            fresh: Math.min(fresh, newPerDay()),
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
        const ordered = !!config.ordered;   // не перемешивать колоду (онбординг)
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
        let queuedNew = 0;    // новые слова сверх дневного лимита — ждут следующих дней

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
                // Готовая колода: проходим один раз, как cram. При ordered
                // (онбординг с лендинга) порядок сохраняем — сохранённое слово первым.
                const items = deck.map(w => buildItem(w, true));
                return ordered ? items : shuffle(items);
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
            const landing = [];   // слова с лендинга — показываем первыми

            for (const word of words) {
                const s = schedule[word.id];
                if (!s) {
                    if (word.fromLanding) landing.push(word);
                    else fresh.push(word);         // never studied
                } else if (s.due <= today) {
                    due.push(buildItem(word, false)); // review is due
                }
            }

            // Слова, сохранённые с лендинга, идут первыми (самое свежее — первым),
            // чтобы пользователь сразу увидел то, что только что добавил.
            landing.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            const landingItems = landing.map(w => buildItem(w, true));

            // Слова, отмеченные «повторить сейчас» в итогах сессии просмотра
            // (srs:pickedFirst), гарантированно входят в сегодняшние новые —
            // дневной лимит их не вытесняет. Список одноразовый: использовали
            // при сборке колоды — очистили (удалённые/битые id тоже).
            let picked = [];
            try {
                const pickedIds = JSON.parse(localStorage.getItem('srs:pickedFirst') || '[]');
                if (Array.isArray(pickedIds) && pickedIds.length) {
                    const idSet = new Set(pickedIds.map(String));
                    picked = fresh.filter(w => idSet.has(String(w.id)));
                    const inPicked = new Set(picked.map(w => String(w.id)));
                    for (let i = fresh.length - 1; i >= 0; i--) {
                        if (inPicked.has(String(fresh[i].id))) fresh.splice(i, 1);
                    }
                    localStorage.removeItem('srs:pickedFirst');
                }
            } catch { /* localStorage может быть недоступен */ }

            // Introduce a limited number of new words per day.
            const newLimit = Math.max(newPerDay(), picked.length);
            const allNew = [...picked, ...shuffle(fresh)];
            queuedNew = Math.max(0, allNew.length - newLimit);
            const newItems = allNew
                .slice(0, newLimit)
                .map(w => buildItem(w, true));
            return [...landingItems, ...shuffle([...due, ...newItems])];
        }

        // ---- Re-queue a card so it comes back later, not immediately --------
        function reinsert(item, gap) {
            const at = Math.min(queue.length, gap);
            queue.splice(at, 0, item);
        }

        // ---- Persist a graduated card's next review date -------------------
        let reviewTracked = false;   // событие srs_review — один раз за сессию
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
                // 'study' летит при открытии сессии; srs_review — по ФАКТУ первого
                // реально завершённого повторения. На нём строится недельный отчёт
                // «смотрел + повторял» в статистике.
                if (!reviewTracked) {
                    reviewTracked = true;
                    if (window.animeiTrack) window.animeiTrack('srs_review', 'graduated');
                }
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

        // Триаж новой карточки: «уже знаю» убирает слово из очереди надолго,
        // не гоняя его через учебные шаги. Спасает от лавины катакана-заимствований
        // и слов, знакомых до Animei. Интервал большой, но конечный — слово ещё
        // вернётся один раз для подтверждения.
        const KNOWN_TRIAGE_INTERVAL = 120;   // дней до контрольного показа
        function answerKnown() {
            if (scheduled && current) {
                schedule[current.id] = {
                    interval: KNOWN_TRIAGE_INTERVAL,
                    reps: 3,   // «как будто повторил» — при merge с сервером выигрывает бОльший reps
                    lapses: 0,
                    due: dayKey(addDays(todayStart(), KNOWN_TRIAGE_INTERVAL)),
                };
                saveSchedule(schedule);
                pushSrsToServer(current.id, schedule[current.id]);
                markStudiedToday();
            }
            graduated++;
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

        // Кнопка оценки памяти: подпись + мелкая подсказка-следствие под ней
        // («когда увижу снова»), чтобы «Забыл/Помню» читались как оценка, а не
        // как красное/зелёное «удалить/подтвердить».
        function makeRateButton(label, hint, key, className, handler) {
            const btn = document.createElement('button');
            btn.className = className;
            btn.type = 'button';
            if (key) btn.dataset.key = key;    // «1»/«2» — CSS покажет только на десктопе
            btn.addEventListener('click', handler);
            const main = document.createElement('span');
            main.className = 'rate__label';
            main.textContent = label;
            btn.appendChild(main);
            if (hint) {
                const sub = document.createElement('span');
                sub.className = 'rate__hint';
                sub.textContent = hint;
                btn.appendChild(sub);
            }
            return btn;
        }

        function formatDueHint(days) {
            if (days <= 0) return t('study.hint.soon');
            if (days === 1) return t('study.hint.tomorrow');
            return t('study.hint.days').replace('{n}', days);
        }

        // Что произойдёт с текущей карточкой при каждой оценке. «Забыл» всегда
        // возвращает её почти сразу; «Помню» — либо ещё в этой сессии (идут шаги
        // обучения), либо через реальный интервал повторения (дни). В cram-режиме
        // расписания нет — у «Помню» подсказки нет.
        function ratingHints() {
            // Cram-режим — расписания нет; подсказки-интервалы не показываем вовсе,
            // чтобы обе кнопки были одинаковой (однострочной) высоты.
            if (!scheduled || !current) return { again: '', good: '' };
            const again = t('study.hint.min');
            const nextLeft = current.left - 1;
            if (nextLeft > 0) return { again, good: t('study.hint.soon') };
            const prev = schedule[current.id] ?? { interval: 0 };
            const days = current.failed ? 1 : nextInterval(prev.interval);
            return { again, good: formatDueHint(days) };
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

            // Чтение на лицевой стороне — в транскрипции из настроек учёбы
            // (тогл «кана/ромадзи»): новичок, не читающий кандзи, видит, КАК
            // слово звучит, ещё на вопросе. Чисто-канное слово в режиме каны
            // не дублируем (чтение совпало бы с самим словом).
            {
                const w = current.word;
                const kana = w.kana || '';
                const romajiMode = studyPref('studyTranscription') === 'romaji';
                const reading = romajiMode
                    ? ((w.romaji && String(w.romaji).trim())
                        || (typeof window.kanaToRomaji === 'function' ? window.kanaToRomaji(kana) : ''))
                    : kana;
                const face = wordEl.textContent;
                if (reading && reading !== face) {
                    const r = document.createElement('div');
                    r.className = 'front-reading';
                    r.textContent = reading;
                    els.front.appendChild(r);
                }
            }

            els.buttons.innerHTML = '';
            els.buttons.appendChild(makeButton(t('study.showAnswer'), 'show-btn', renderBack));

            // Новая, ещё не тронутая карточка в SRS-режиме: даём отсеять уже
            // знакомое слово одним тапом, не проходя учебные шаги.
            if (scheduled && current.isNew && !current.seen) {
                els.buttons.appendChild(makeButton(t('study.alreadyKnow'), 'know-btn', answerKnown));
            }
        }

        function addLine(cls, text) {
            if (!text) return;
            const el = document.createElement('div');
            el.className = cls;
            el.textContent = text;
            els.back.appendChild(el);
        }

        // Транскрипция слова с учётом настройки studyTranscription: kana (по
        // умолчанию) или romaji. Старые значения both/none убраны из настроек —
        // если такое сохранилось, показываем кану.
        function renderTranscription(w) {
            const mode = studyPref('studyTranscription') === 'romaji' ? 'romaji' : 'kana';
            const kana = w.kana || '';
            const romaji = (w.romaji && String(w.romaji).trim())
                ? String(w.romaji).trim()
                : (typeof window.kanaToRomaji === 'function' ? window.kanaToRomaji(kana) : '');
            const text = mode === 'romaji' ? (romaji || kana) : kana;
            if (!text) return;

            const chip = document.createElement('div');
            chip.className = 'hiragana';
            chip.textContent = text;

            // Тап по чтению — озвучка слова (совет Codex): произношение под рукой,
            // без похода в шестерёнку. Озвучиваем кану (однозначное чтение).
            if (typeof canSpeakJa === 'function' && canSpeakJa()) {
                const speakText = kana || w.word || w.kanji || text;
                chip.classList.add('hiragana--speak');
                chip.setAttribute('role', 'button');
                chip.setAttribute('tabindex', '0');
                chip.title = t('study.listen');
                const spk = document.createElement('span');
                spk.className = 'hiragana__speak';
                spk.textContent = '🔊';
                chip.appendChild(spk);
                chip.addEventListener('click', () => speakJa(speakText));
                // Enter — озвучить; stopPropagation, чтобы глобальный onKey не оценил
                // карточку тем же нажатием. Space оставляем оценке (см. onKey).
                chip.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); speakJa(speakText); }
                });
            }

            els.back.appendChild(chip);
        }

        // Панель настроек обучения (шестерёнка в углу карточки). Меняет настройки
        // через AnimeiSettings и перерисовывает текущую карточку сразу.
        function reapplyCard() {
            if (!current) return;
            if (els.back.classList.contains('back-side--visible')) renderBack();
            else renderFront();
        }

        // Ненавязчивая правка карточки прямо в обучении: маленький карандаш в углу
        // карточки открывает ту же модалку, что и в словаре (общий модуль
        // AnimeiWordEdit). После сохранения пересобираем производные поля (их читает
        // карточка) и перерисовываем текущую сторону, чтобы правка была видна сразу.
        let cardEditBtn = null;
        function mountCardEdit() {
            const cardArea = document.querySelector('.card-area');
            if (!cardArea || !window.AnimeiWordEdit || cardArea.querySelector('.card-edit-btn')) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'card-edit-btn';
            btn.hidden = true;
            btn.setAttribute('aria-label', t('study.editCard'));
            btn.title = t('study.editCard');
            btn.innerHTML = PENCIL_ICON;
            btn.addEventListener('click', () => {
                if (!current || !current.word || !current.word.id) return;
                window.AnimeiWordEdit.open(current.word, () => {
                    const w = current.word;
                    // Карточка читает производные поля — держим их в синхроне с правкой.
                    w.word = w.kanji;
                    w.meaning = w.translation;
                    w.translatedSentence = w.sentenceTranslation;
                    reapplyCard();
                });
            });
            cardArea.appendChild(btn);
            cardEditBtn = btn;
        }
        // Карандаш виден только на реальной (сохранённой) карточке — не на экранах
        // «всё пройдено» / пустой колоды.
        function refreshEditBtn() {
            if (cardEditBtn) cardEditBtn.hidden = !(current && current.word && current.word.id);
        }

        function mountStudySettings() {
            const main = document.querySelector('.main.study');
            if (!main || !window.AnimeiSettings || main.querySelector('.study-settings-btn')) return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'study-settings-btn';
            btn.setAttribute('aria-label', t('study.settings.open'));
            btn.innerHTML = GEAR_ICON;

            const panel = document.createElement('div');
            panel.className = 'study-settings-panel';
            panel.hidden = true;

            const title = document.createElement('div');
            title.className = 'study-set-title';
            title.textContent = t('study.settings.title');
            panel.appendChild(title);

            // Сегмент «транскрипция слова»
            const trRow = document.createElement('div');
            trRow.className = 'study-set-row';
            const trLabel = document.createElement('span');
            trLabel.textContent = t('study.transcription');
            const seg = document.createElement('div');
            seg.className = 'seg';
            // Только кана/ромадзи: «Обе» и «Скрыть» убраны (сохранённое старое
            // значение трактуется как кана — см. renderTranscription).
            const curTr = studyPref('studyTranscription') === 'romaji' ? 'romaji' : 'kana';
            [['kana', t('study.transcription.kana')], ['romaji', t('study.transcription.romaji')]]
                .forEach(([val, label]) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = label;
                    b.dataset.val = val;
                    b.classList.toggle('is-active', curTr === val);
                    b.addEventListener('click', () => {
                        window.AnimeiSettings.set('studyTranscription', val);
                        seg.querySelectorAll('button').forEach((x) => x.classList.remove('is-active'));
                        b.classList.add('is-active');
                        reapplyCard();
                    });
                    seg.appendChild(b);
                });
            trRow.append(trLabel, seg);
            panel.appendChild(trRow);

            // Тумблеры
            function toggleRow(key, label, defOn) {
                const row = document.createElement('label');
                row.className = 'study-set-row study-set-toggle';
                const span = document.createElement('span');
                span.textContent = label;
                const inp = document.createElement('input');
                inp.type = 'checkbox';
                // defOn=true → включено по умолчанию (значение хранится только когда его меняли).
                inp.checked = defOn ? studyPref(key) !== false : !!studyPref(key);
                inp.addEventListener('change', () => {
                    window.AnimeiSettings.set(key, inp.checked);
                    reapplyCard();
                });
                row.append(span, inp);
                return row;
            }
            panel.appendChild(toggleRow('studySentenceRomaji', t('study.sentenceRomaji'), true));
            panel.appendChild(toggleRow('studyAutoplayClip', t('study.autoplayClip'), true));

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                panel.hidden = !panel.hidden;
            });
            document.addEventListener('click', (e) => {
                if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) panel.hidden = true;
            });

            main.appendChild(btn);
            main.appendChild(panel);
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

        // «Совсем без скролла» и без прыжков: высота оборота фиксирована
        // (стабильная сцена), а место под клип РЕЗЕРВИРУЕТСЯ сразу при отрисовке —
        // из свободной высоты оборота, потолка из CSS и оценки кадра 16:9 от
        // ширины. Видео потом просто появляется в уже отведённом месте, поэтому
        // текст под ним не прыгает ни при загрузке метаданных, ни при подгонке.
        // Поздние изменения (ромадзи-ячейки, аудио, не-16:9 кадр) двигают слот
        // плавным transition (см. .back-media--reserved). Пол — 120px читаемости;
        // внутренний скролл оборота остаётся страховкой для крайности
        // «крохотный экран + очень длинный текст».
        function fitBackMedia() {
            const back = els.back;
            if (!back.classList.contains('back-side--visible')) return;
            const slot = back.querySelector('.back-media');
            if (!slot) return;
            const clipEl = slot.querySelector('.clip-player, .clip-pending');
            if (!clipEl) {
                // Клипа нет и не будет (только аудио или пусто) — слот живёт
                // своим естественным размером.
                slot.classList.remove('back-media--reserved');
                slot.style.height = '';
                return;
            }
            const video = slot.querySelector('.clip-player video');

            // Стартовая точка анимации — фактически отрисованная высота слота.
            const wasReserved = slot.classList.contains('back-media--reserved');
            const renderedH = wasReserved ? slot.getBoundingClientRect().height : 0;

            // Пробы ниже меряются с выключенной анимацией и в кадр не попадают
            // (всё синхронно до ближайшего paint).
            slot.style.transition = 'none';
            if (video) video.style.transition = 'none';

            // Остальной контент слота (аудио-плеер) резервируем поверх видео.
            let extras = 0;
            for (const child of slot.children) {
                if (child === clipEl) continue;
                if (child.offsetHeight > 0) extras += child.offsetHeight + 6;
            }

            // Потолок из CSS (clamp зависит от вьюпорта): читаем computed без inline.
            let ceil = 340; // клип ещё едет — потолок как на ПК
            if (video) {
                video.style.maxHeight = '';
                const parsed = parseFloat(getComputedStyle(video).maxHeight);
                if (Number.isFinite(parsed)) ceil = parsed;
            }

            // Проба «минимальный клип»: ставим слот на пол и смотрим, сколько
            // свободного места остаётся под ним. Если высота оборота при этом
            // изменилась — оборот НЕ ограничен снаружи (карточка растёт под
            // контент), и бюджет не ограничивает клип.
            const naturalClient = back.clientHeight;
            slot.style.height = (120 + extras) + 'px';
            if (video) video.style.maxHeight = '120px';
            const probeClient = back.clientHeight;
            let h = Infinity;
            if (probeClient === naturalClient) {
                // offsetTop/offsetHeight — координаты раскладки (не трогает
                // transform каскадной анимации появления строк).
                let bottom = 0;
                for (const child of back.children) {
                    if (child.offsetHeight > 0) {
                        bottom = Math.max(bottom, child.offsetTop + child.offsetHeight);
                    }
                }
                const slack = back.offsetTop + probeClient - bottom;
                h = 120 + slack - 2;
            }
            h = Math.min(h, ceil);
            // Оценка кадра от ширины: не резервируем пустоту под широкий 16:9.
            const w = slot.clientWidth || back.clientWidth;
            if (w > 0) h = Math.min(h, Math.round(w * 9 / 16));
            // Метаданные уже есть — точная высота вместо оценки.
            if (video && video.videoWidth > 0) {
                h = Math.min(h, Math.ceil(w * video.videoHeight / video.videoWidth));
            }
            h = Math.max(120, Math.floor(h));

            slot.classList.add('back-media--reserved');
            if (wasReserved && renderedH > 0) {
                // Возврат к отрисованной высоте + принудительный reflow: следующая
                // установка поедет плавным transition от неё, а не скачком.
                slot.style.height = renderedH + 'px';
                if (video) video.style.maxHeight = Math.max(120, Math.round(renderedH - extras)) + 'px';
                void slot.offsetHeight;
                slot.style.transition = '';
                if (video) video.style.transition = '';
                slot.style.height = (h + extras) + 'px';
                if (video) video.style.maxHeight = h + 'px';
            } else {
                // Первая резервация — мгновенно: transition включаем только ПОСЛЕ
                // reflow с финальной высотой, иначе стартом анимации станет
                // пробное значение (слот на полу 120px) и слот «подъезжал» бы.
                slot.style.height = (h + extras) + 'px';
                if (video) video.style.maxHeight = h + 'px';
                void slot.offsetHeight;
                slot.style.transition = '';
                if (video) video.style.transition = '';
            }
        }
        let fitBackScheduled = false;
        function scheduleFitBack() {
            if (fitBackScheduled) return;
            fitBackScheduled = true;
            requestAnimationFrame(() => {
                fitBackScheduled = false;
                fitBackMedia();
            });
        }
        window.addEventListener('resize', scheduleFitBack);

        // Свой мини-плеер вместо нативных браузерных контролов: короткий клип
        // сам зациклен, поэтому нужны только Play/Pause по центру и кнопка звука.
        function makeClipVideo(src, w) {
            const ICONS = {
                play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.55.88l10.8-6.86a1.04 1.04 0 0 0 0-1.76L9.55 4.26A1.04 1.04 0 0 0 8 5.14z"/></svg>',
                volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.3 5.7a9 9 0 0 1 0 12.6"/></svg>',
                volumeLow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
                muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/></svg>',
            };

            const wrap = document.createElement('div');
            wrap.className = 'clip-player';
            // Пока не пришли метаданные, у <video> нет своих размеров и браузер
            // рисует его дефолтным блоком 300×150 — при загрузке кадр «прыгал»,
            // разрастаясь до реального размера (и на миг вызывал скролл оборота).
            // Держим клип стабильным 16:9-боксом на всю ширину (клипы аниме и так
            // 16:9), а на loadedmetadata отдаём размер настоящему кадру — для 16:9
            // тот же, поэтому появление кадра проходит без скачка.
            wrap.classList.add('clip-player--sizing');

            const video = document.createElement('video');
            video.src = src;
            video.addEventListener('loadedmetadata',
                () => wrap.classList.remove('clip-player--sizing'), { once: true });
            // blob-URL из IndexedDB освобождаем, как только видео загрузило данные
            // (элемент дальше держит blob сам) — иначе URL'ы копились бы до
            // перезагрузки вкладки. Для http-ссылок revoke — безвредный no-op.
            if (typeof src === 'string' && src.startsWith('blob:')) {
                video.addEventListener('loadeddata', () => URL.revokeObjectURL(src), { once: true });
            }
            // Стартом/остановкой управляем вручную (нужно окно [tStart..tEnd]).
            video.autoplay = false;
            video.loop = false;
            video.playsInline = true;
            wrap.appendChild(video);

            // Окно воспроизведения внутри клипа. Клип режется с запасом ±2с,
            // а играем только реальное слово — эти границы можно двигать ±1с.
            let tStart = Number.isFinite(Number(w && w.trimStart)) ? Math.max(0, Number(w.trimStart)) : 0;
            let tEnd = Number.isFinite(Number(w && w.trimEnd)) ? Number(w.trimEnd) : null;
            const autoPlay = studyPref('studyAutoplayClip') !== false;
            const loopClip = !!studyPref('loopClips');

            const playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.className = 'clip-player__play';
            playBtn.setAttribute('aria-label', 'Play/pause');
            playBtn.innerHTML = ICONS.play;
            wrap.appendChild(playBtn);

            // Регулятор звука: кнопка (клик — вкл/выкл звук) + ползунок громкости.
            // На десктопе ползунок выезжает по ховеру, на тач-экране виден всегда
            // (см. .clip-player__vol в media.css). Громкость общая с плеером —
            // ключ animei:volume, поэтому уровень запоминается между карточками.
            const volGroup = document.createElement('div');
            volGroup.className = 'clip-player__vol';

            const volSlider = document.createElement('input');
            volSlider.type = 'range';
            volSlider.className = 'clip-player__vol-slider';
            volSlider.min = '0';
            volSlider.max = '1';
            volSlider.step = '0.05';
            volSlider.setAttribute('aria-label', 'Volume');
            volGroup.appendChild(volSlider);

            const muteBtn = document.createElement('button');
            muteBtn.type = 'button';
            muteBtn.className = 'clip-player__mute';
            muteBtn.setAttribute('aria-label', 'Sound');
            muteBtn.innerHTML = ICONS.volume;
            volGroup.appendChild(muteBtn);

            wrap.appendChild(volGroup);

            // Стартовая громкость — из общего ключа (как в плеере), по умолчанию полная.
            const VOLUME_KEY = 'animei:volume';
            const savedVol = parseFloat(localStorage.getItem(VOLUME_KEY));
            if (isFinite(savedVol) && savedVol >= 0 && savedVol <= 1) video.volume = savedVol;

            const volIcon = () => {
                if (video.muted || video.volume === 0) return ICONS.muted;
                return video.volume < 0.5 ? ICONS.volumeLow : ICONS.volume;
            };
            const updateVolUi = () => {
                muteBtn.innerHTML = volIcon();
                const v = video.muted ? 0 : video.volume;
                volSlider.value = String(v);
                volSlider.style.setProperty('--vol', (v * 100) + '%'); // заливка дорожки
            };

            const toggle = () => {
                if (video.paused) {
                    // Доиграли до конца окна — начинаем сначала окна, не с конца клипа.
                    if (tEnd != null && video.currentTime >= tEnd - 0.05) video.currentTime = tStart;
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            };
            const sync = () => wrap.classList.toggle('is-paused', video.paused);

            function startPlayback() {
                // currentTime применяется асинхронно. Раньше play() вызывался
                // в ту же микрозадачу, и на части mp4 браузер успевал начать с
                // нуля, а не с ручной обрезки. Сначала ждём seeked — так первый
                // кадр и звук всегда начинаются ровно с trimStart.
                let settled = false;
                const afterSeek = () => {
                    if (settled) return;
                    settled = true;
                    if (autoPlay) video.play().catch(() => {});
                    sync();
                };
                if (tStart > 0 && Number.isFinite(video.duration) && video.duration > tStart) {
                    video.addEventListener('seeked', afterSeek, { once: true });
                    try {
                        video.currentTime = tStart;
                        // Отдельные браузеры не шлют seeked, если кадр уже в
                        // буфере: не оставляем клип в состоянии «загрузка».
                        setTimeout(afterSeek, 700);
                        return;
                    } catch { /* fallback ниже */ }
                }
                afterSeek();
            }
            if (video.readyState >= 1) startPlayback();
            else video.addEventListener('loadedmetadata', startPlayback, { once: true });

            // Реальные размеры кадра известны только после метаданных — тогда
            // и подгоняем высоту клипа под свободное место оборота.
            video.addEventListener('loadedmetadata', scheduleFitBack, { once: true });

            // Держим воспроизведение в пределах окна [tStart, tEnd].
            video.addEventListener('timeupdate', () => {
                if (tEnd == null) return;
                if (video.currentTime >= tEnd - 0.02) {
                    if (loopClip) { video.currentTime = tStart; }
                    else { video.pause(); }
                }
            });

            video.addEventListener('play', sync);
            video.addEventListener('pause', sync);
            video.addEventListener('ended', sync);
            video.addEventListener('click', toggle);
            playBtn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
            // На тач-экране ползунок скрыт и ВЫЕЗЖАЕТ по тапу на кнопку звука
            // (иначе он висел всегда и перекрывал кадр). Держим открытым, пока
            // с ним работают, и авто-прячем через паузу бездействия.
            const isTouch = window.matchMedia('(hover: none)').matches;
            let volHideTimer = null;
            const revealVol = () => {
                volGroup.classList.add('is-vol-open');
                clearTimeout(volHideTimer);
                volHideTimer = setTimeout(() => volGroup.classList.remove('is-vol-open'), 3000);
            };

            volSlider.addEventListener('input', () => {
                video.volume = parseFloat(volSlider.value);
                video.muted = video.volume === 0;
                localStorage.setItem(VOLUME_KEY, String(video.volume));
                if (isTouch) revealVol();
            });
            // Клик по регулятору не должен переключать воспроизведение видео.
            volGroup.addEventListener('click', (e) => e.stopPropagation());
            muteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Первый тап на телефоне только показывает ползунок (не мьютит).
                if (isTouch && !volGroup.classList.contains('is-vol-open')) {
                    revealVol();
                    return;
                }
                if (video.muted || video.volume === 0) {
                    if (video.volume === 0) video.volume = 0.5; // с нуля — до слышимой
                    video.muted = false;
                } else {
                    video.muted = true;
                }
                localStorage.setItem(VOLUME_KEY, String(video.volume));
                if (isTouch) revealVol();
            });
            video.addEventListener('volumechange', updateVolUi);
            updateVolUi();
            sync();

            // Правку окна клипа (±1с к началу/концу) перенесли в редактирование
            // карточки в словаре (js/clip-trim.js) — в обучении её больше нет.
            return wrap;
        }

        // Заглушка вместо пустоты, пока клип грузится (гость) или ещё режется на
        // сервере (вошедший) — чтобы «пропавшее» видео читалось как «готовится».
        function makeClipPending(msgKey, spinner = true) {
            const box = document.createElement('div');
            box.className = 'clip-pending';
            if (spinner) {
                const sp = document.createElement('span');
                sp.className = 'clip-spinner';
                box.appendChild(sp);
            }
            const txt = document.createElement('span');
            txt.textContent = t(msgKey);
            box.appendChild(txt);
            return box;
        }

        function renderBack() {
            const w = current.word;
            els.back.innerHTML = '';
            els.back.classList.add('back-side--visible');

            // Ядро ответа сразу под словом: перевод (главный акцент) + чтение
            // (тап — озвучка). Это и есть проверка припоминания — держим её на
            // верху, чтобы клип не вклинивался между словом и переводом.
            addLine('meaning', w.meaning ?? w.translation ?? '');
            renderTranscription(w);

            // Медиа-контекст (клип/озвучка) — ниже ядра, как «награда», а не
            // преграда (совет Codex). Один слот: асинхронная подгрузка не должна
            // раскидывать элементы по карточке.
            const mediaSlot = document.createElement('div');
            mediaSlot.className = 'back-media';
            els.back.appendChild(mediaSlot);

            const src = videoSrcOf(w);
            const expectsClip = !!src || Number(w.videoEnd) > Number(w.videoStart);
            if (src) {
                mediaSlot.appendChild(makeClipVideo(src, w));
            } else if (w.noClip) {
                // Карточка курируемой колоды, для которой видео ещё не подобрали.
                mediaSlot.appendChild(makeClipPending('clip.soon', false));
            } else if (typeof getClipUrl === 'function' && w.id) {
                const wid = w.id;
                const isGuest = typeof wid === 'string' && wid.startsWith('local-');
                // Пока тянем из IndexedDB / ждём серверную нарезку — показываем статус.
                let pending = null;
                if (expectsClip) {
                    pending = makeClipPending(isGuest ? 'clip.loading' : 'clip.preparing');
                    mediaSlot.appendChild(pending);
                }
                getClipUrl(wid).then((url) => {
                    if (!current || current.word.id !== wid) return;
                    if (!els.back.classList.contains('back-side--visible')) return;
                    if (url) {
                        if (pending) pending.remove();
                        mediaSlot.insertBefore(makeClipVideo(url, w), mediaSlot.firstChild);
                        // Синхронно, а не через rAF: иначе только что вставленное
                        // видео успевает отрисоваться в свой потолочный размер (CSS
                        // max-height), и лишь СЛЕДУЮЩИМ кадром fitBackMedia ужимает
                        // его под бюджет оборота — виден скачок «большое → меньше».
                        fitBackMedia();
                    } else if (pending && isGuest) {
                        // У гостя клипа в браузере нет — значит нарезать не удалось.
                        pending.replaceWith(makeClipPending('clip.unavailable', false));
                    }
                    // Вошедший: клипа ещё нет в IndexedDB — оставляем «готовится».
                });
            }

            // Свой звук карточки (добавляется в словаре): у вошедшего — с сервера
            // (w.audio), у гостя — из IndexedDB. getWordAudioUrl прячет это отличие.
            if (w.id) {
                const wid = w.id;
                const audioUrlP = typeof getWordAudioUrl === 'function'
                    ? getWordAudioUrl(w)
                    : Promise.resolve(w.audio || '');
                audioUrlP.then((url) => {
                    if (!url || !current || current.word.id !== wid) return;
                    if (!els.back.classList.contains('back-side--visible')) return;
                    const audio = document.createElement('audio');
                    audio.src = url;
                    if (typeof url === 'string' && url.startsWith('blob:')) {
                        audio.addEventListener('loadeddata', () => URL.revokeObjectURL(url), { once: true });
                    }
                    audio.controls = true;
                    audio.className = 'study-audio';
                    audio.volume = 0.9;
                    mediaSlot.appendChild(audio);
                    // Синхронно: аудио добавляет высоту слоту — пересчитываем клип
                    // в том же кадре, чтобы оборот не переполнился на кадр и видео
                    // не «дёрнулось» под появившийся плеер звука.
                    fitBackMedia();
                });
            }

            // «Источник» — титр сразу под кадром (подпись к сцене, из которой
            // слово), а не одинокой строкой в самом низу. Без клипа титру там не
            // место (всплыл бы над разбором) — тогда оставляем его внизу (ниже).
            if (w.anime && expectsClip) addLine('card-anime', t('starter.fromAnime') + ' ' + w.anime);

            // Предложение. Если выбрана ромадзи-транскрипция (тот же выбор, что и для
            // слова) — раскладываем пословно с ромадзи над каждым словом, как в плеере;
            // тумблер studySentenceRomaji позволяет это отключить. ИИ-разбор интегрирован
            // органично: сама фраза кликабельна и помечена искоркой ИИ.
            const sentenceLine = document.createElement('div');
            sentenceLine.className = 'sentence';
            sentenceLine.textContent = w.sentence ?? '';
            if (w.sentence) {
                els.back.appendChild(sentenceLine);

                const wid = current && current.word.id;
                const romajiMode = studyPref('studyTranscription') === 'romaji';
                const withRomaji = romajiMode && studyPref('studySentenceRomaji') !== false;
                if (withRomaji) {
                    fetchSentenceTokens(w.sentence).then((tokens) => {
                        if (!tokens.length || !current || current.word.id !== wid) return;
                        if (!els.back.classList.contains('back-side--visible')) return;
                        // сохраняем искорку ИИ (если была добавлена ниже), заменяем только текст
                        const spark = sentenceLine.querySelector('.sentence__spark');
                        sentenceLine.textContent = '';
                        sentenceLine.classList.add('sentence--cells');
                        buildReadingCells(tokens).forEach((c) => sentenceLine.appendChild(c));
                        if (spark) sentenceLine.appendChild(spark);
                        // Ромадзи-ячейки выше плоской строки — перемеряем оборот
                        // синхронно, чтобы клип ужался в том же кадре, без скачка.
                        fitBackMedia();
                    });
                }

                if (studyAiAvailable) {
                    sentenceLine.classList.add('sentence--ai');
                    sentenceLine.title = t('words.explain');
                    // Настоящая <button>: фокусируется с клавиатуры, Enter/Space
                    // работают нативно (у span[role=button] их не было); клик
                    // всплывает до обработчика на самой фразе ниже.
                    const spark = document.createElement('button');
                    spark.type = 'button';
                    spark.className = 'sentence__spark';
                    spark.setAttribute('aria-label', t('words.explain'));
                    // Иконка + подпись «Разбор» — чтобы кнопка ИИ была заметной и
                    // сразу понятной (не просто искорка).
                    const sparkLabel = document.createElement('span');
                    sparkLabel.className = 'sentence__spark-label';
                    sparkLabel.textContent = t('words.explainShort');
                    spark.innerHTML = AI_ICON;
                    spark.appendChild(sparkLabel);
                    sentenceLine.appendChild(spark);
                    sentenceLine.addEventListener('click', () => studyRunExplain(w.sentence, spark));
                }
            }

            addLine('translatedSentence', w.translatedSentence ?? w.sentenceTranslation ?? '');

            // Карточка без клипа — титр аниме внизу (под клипом его нет).
            if (w.anime && !expectsClip) addLine('card-anime', t('starter.fromAnime') + ' ' + w.anime);

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

            // Резервируем высоту слота СИНХРОННО, до первого кадра рендера: раньше
            // это шло через requestAnimationFrame и один кадр оборот жил без
            // зарезервированного места — мелькал скролл. Стабильный 16:9-бокс клипа
            // (класс clip-player--sizing) + синхронная резервация = без прыжка.
            fitBackMedia();

            const hints = ratingHints();
            els.buttons.innerHTML = '';
            els.buttons.appendChild(makeRateButton(t('study.again'), hints.again, '1', 'keep-word-btn', answerAgain));
            els.buttons.appendChild(makeRateButton(t('study.good'), hints.good, '2', 'bury-word-btn', answerGood));

            // Кнопку-подсказку (ⓘ) убрали из интерфейса карточки — не показываем.
            if (els.hintBtn) els.hintBtn.classList.add('hidden');
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
                // Новые слова сверх дневного лимита не пропали — честно говорим,
                // что они ждут в очереди (стеки Queued/Active, как у Satori Reader).
                if (queuedNew > 0) lines.push(`${t('study.queuedNew')} ${queuedNew}`);
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
            refreshEditBtn();
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
            if (document.querySelector('.word-modal')) return;   // идёт правка карточки — не мешаем
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

        // ---- Свайпы оценки на телефоне -------------------------------------
        // Карточка следует за пальцем; у края проступает подсказка действия
        // (влево — «Забыл», вправо — «Помню»). На вопросе любой горизонтальный
        // свайп раскрывает ответ. Вертикаль отдаём прокрутке (порог + доминанта
        // оси). Свайпы, начатые на интерактиве (видео/аудио/кнопки/ИИ-фраза),
        // игнорируем — у них своя механика (перемотка, тап-разбор).
        function wireSwipe() {
            const card = document.querySelector('.card-area');
            if (!card) return;

            const againHint = document.createElement('div');
            againHint.className = 'swipe-hint swipe-hint--again';
            againHint.textContent = '↺';
            const goodHint = document.createElement('div');
            goodHint.className = 'swipe-hint swipe-hint--good';
            goodHint.textContent = '✓';
            card.appendChild(againHint);
            card.appendChild(goodHint);

            const DEAD = 10;       // мёртвая зона — отсечь тапы/микродвижения
            const PREVIEW = 40;    // порог, с которого подсвечиваем цель
            const COMMIT = 70;     // порог срабатывания оценки
            let startX = 0, startY = 0, dx = 0, tracking = false;

            function blocked(target) {
                return target.closest(
                    'button, a, input, textarea, audio, video, .clip-player, .sentence--ai, .study-audio');
            }

            function reset(animate) {
                card.style.transition = animate ? 'transform 0.2s ease' : 'none';
                card.style.transform = '';
                card.classList.remove('is-swipe-again', 'is-swipe-good');
                tracking = false;
                dx = 0;
            }

            card.addEventListener('touchstart', (e) => {
                if (!current || e.touches.length !== 1 || blocked(e.target)) return;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                dx = 0;
                tracking = true;
                card.style.transition = 'none';
            }, { passive: true });

            card.addEventListener('touchmove', (e) => {
                if (!tracking) return;
                dx = e.touches[0].clientX - startX;
                const dy = e.touches[0].clientY - startY;
                // Вертикальное намерение — отдаём странице прокрутку, свайп отменяем.
                if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DEAD) { reset(false); return; }
                if (Math.abs(dx) < DEAD) return;
                card.style.transform = `translateX(${dx * 0.5}px)`;
                if (els.back.classList.contains('back-side--visible')) {
                    card.classList.toggle('is-swipe-good', dx > PREVIEW);
                    card.classList.toggle('is-swipe-again', dx < -PREVIEW);
                }
            }, { passive: true });

            card.addEventListener('touchend', () => {
                if (!tracking) return;
                const back = els.back.classList.contains('back-side--visible');
                const dir = dx;                   // фиксируем до reset() — он обнуляет dx
                const committed = Math.abs(dir) > COMMIT;
                reset(true);
                if (!committed) return;
                if (!back) renderBack();          // вопрос: свайп раскрывает ответ
                else if (dir > 0) answerGood();
                else answerAgain();
            });

            card.addEventListener('touchcancel', () => reset(true));
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

        // ---- Bootstrap -----------------------------------------------------
        wireModal();
        wireSwipe();
        mountStudySettings();
        mountCardEdit();
        document.addEventListener('keydown', onKey);

        async function bootstrap() {
            await fetchDataFromServer();   // makes sure `words` is in localStorage
            mergeServerSchedule();         // на новом устройстве подтянет расписание с сервера
            if (window.animeiTrack) window.animeiTrack('study', scheduled ? 'srs' : 'cram');
            restart();
        }
        // startStudy может вызываться и ПОСЛЕ события load (выбор колоды новичка
        // на beginner.html) — тогда слушатель 'load' уже никогда не сработает и
        // сессия не стартует (пустая карточка). Если страница загружена — сразу.
        if (document.readyState === 'complete') bootstrap();
        else window.addEventListener('load', bootstrap);
    }

    window.startStudy = startStudy;
})();
