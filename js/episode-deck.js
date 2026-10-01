// Колода из серии: кнопка в панели субтитров → автоотбор простых (N5–N4) слов
// из токенов текущей серии, список с галочками, «Создать колоду» — слова
// сохраняются в словарь и складываются в новую колоду (js/decks-store.js).
//
// Подключается ПОСЛЕ player.js (нужны state, saveWord, client, t и пр.) и
// decks-store.js (window.Decks). Уровень слова — по статичному словарю
// data/jlpt-n5n4.json (слово/канная форма -> 5|4), собранному из открытого
// набора JLPT-лексики; имена собственные в него не входят, поэтому отдельный
// фильтр имён не нужен.
(function () {
    const MAX_WORDS = 50;     // не больше — иначе список подавляет
    const SCAN_MAX = 8;       // «всё аниме»: сколько первых серий сканируем
    const DICT_POOL = 4;      // параллельных запросов к словарю (превью)
    const SAVE_POOL = 3;      // параллельных сохранений слов (клипы режет сервер)

    // Учим только содержательные части речи. Междометия (感動詞), союзы (接続詞)
    // и указательные 連体詞 (この/その) в колоду не берём.
    const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '副詞']);
    const KANJI = /[一-龯]/;

    // Служебный каркас языка: слова настолько базовые/грамматические, что
    // карточка из них — шум. Настоящую лексику N5 (числа месяцев, еду, семью…)
    // не трогаем — пусть решает пользователь галочкой.
    const STOPLIST = new Set([
        'する', 'ある', 'いる', 'なる', 'いう', '言う', 'やる', 'できる', 'ない',
        'こと', '事', 'もの', '物', 'よう', 'ん', 'の',
        'これ', 'それ', 'あれ', 'どれ', 'ここ', 'そこ', 'あそこ', 'どこ',
        'こう', 'そう', 'ああ', 'どう', 'こんな', 'そんな', 'あんな', 'どんな',
        '何', 'なに', 'なん', 'だれ', '誰', 'いつ', 'なぜ', 'どうして',
        'ください', '下さい', 'いただく', '頂く', 'くれる', 'もらう', '貰う',
    ]);

    const btn = document.getElementById('episode-deck-btn');
    // Показываем/прячем всю группу кнопок (колода + «⋯»), а не одну кнопку:
    // меню действий рядом живёт по тем же условиям (js/episode-known.js).
    const wrap = document.getElementById('episode-deck-wrap');
    const overlay = document.getElementById('edeck-overlay');
    if (!btn || !wrap || !overlay) return;

    const listEl = document.getElementById('edeck-list');
    const subEl = document.getElementById('edeck-sub');
    const countEl = document.getElementById('edeck-count');
    const allCb = document.getElementById('edeck-all');
    const createBtn = document.getElementById('edeck-create');
    const closeBtn = document.getElementById('edeck-close');
    const scopeSeg = document.getElementById('edeck-scope');
    const levelSeg = document.getElementById('edeck-level');
    const scanEl = document.getElementById('edeck-scan');

    let jlptMap = null;        // { слово|кана: 5|4 } — грузим при первом клике
    let jlptPromise = null;
    let candidates = [];       // текущий отбор для открытой модалки
    let creating = false;      // идёт сохранение — не закрываем и не пересобираем

    // Охват и уровень. «Эта серия» — токены state.cues (как раньше); «всё
    // аниме» — субтитры первых SCAN_MAX серий тайтла (см. buildCueSets).
    // Уровень по умолчанию: серия — N5+N4, всё аниме — N5 (фича для новичка);
    // тронутый руками уровень при переключении охвата не сбрасываем.
    let scope = 'episode';     // 'episode' | 'anime'
    let level = '54';          // '5' | '54' | '4'
    let levelTouched = false;
    let scanning = false;      // идёт скан серий — список пуст не потому, что слов нет
    let scanToken = 0;         // отмена устаревшего скана при переключениях
    const scanCache = new Map();   // '<номер серии>:<язык>' -> cues

    function levelAllows(lvl) {
        if (level === '54') return lvl === 5 || lvl === 4;
        return lvl === Number(level);
    }

    function loadJlpt() {
        if (jlptMap) return Promise.resolve(jlptMap);
        if (!jlptPromise) {
            jlptPromise = fetch('../data/jlpt-n5n4.json')
                .then((r) => { if (!r.ok) throw new Error('jlpt ' + r.status); return r.json(); })
                .then((data) => { jlptMap = data; return data; })
                .catch((err) => { jlptPromise = null; throw err; });
        }
        return jlptPromise;
    }

    // Тот же статичный словарь уровней нужен модалке «Уже известные слова»
    // (js/episode-known.js) — отдаём загрузчик наружу, чтобы не тянуть файл дважды.
    window.JlptLevels = {
        load: loadJlpt,
        level: (word) => (jlptMap && jlptMap[word]) || 0,
    };

    // Приход со страницы новичка («Из любимого аниме», ?autodeck=anime):
    // как только сабы загрузились — сами открываем модалку в режиме «всё
    // аниме» (уровень задефолтится в N5 внутри). Один раз за загрузку.
    let autoDeckPending = new URLSearchParams(location.search).get('autodeck') === 'anime';

    // Кнопка появляется, когда субтитры серии загружены. Прямого события у
    // плеера нет — дешёвый поллинг раз в секунду (и скрываем при смене серии).
    setInterval(() => {
        // state — глобальная const из player.js (мы подключены после него).
        const has = !!(state.cues && state.cues.length);
        if (wrap.hidden !== !has) wrap.hidden = !has;
        if (has && autoDeckPending) {
            autoDeckPending = false;
            scope = 'anime';
            scopeSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x.dataset.scope === 'anime'));
            setLevel('5', false);
            openModal();
        }
    }, 1000);

    // ---------- Отбор кандидатов ----------

    // Пример для карточки: короткая внятная реплика с переводом лучше длинной
    // простыни и обрывка. Клип режется по границам реплики — важна её длительность.
    function cueScore(cue) {
        const dur = cue.end - cue.start;
        const len = (cue.text || '').length;
        let s = 0;
        if (dur >= 1 && dur <= 10) s += 2;
        else if (dur > 10 && dur <= 16) s += 1;
        if (len >= 4 && len <= 30) s += 2;
        else if (len <= 45) s += 1;
        if (cue.translation) s += 1;
        return s;
    }

    // cueSets — источники реплик: одна запись на серию, { cues, epIndex,
    // epNumber, current }. У «этой серии» набор один, у «всего аниме» — по
    // отсканированным сериям; у каждого кандидата запоминаем серию его лучшего
    // примера (e.ep) — из неё потом режется клип.
    function collectCandidates(cueSets) {
        const byBase = new Map();
        for (const set of cueSets) {
            for (const cue of set.cues) {
                for (const tok of (cue.tokens || [])) {
                    if (!tok.learnable || !CONTENT_POS.has(tok.pos)) continue;
                    const base = tok.base || tok.surface;
                    if (STOPLIST.has(base)) continue;
                    // Однобуквенные обрывки каны (气/へ/め от неудачного разбора) — мимо.
                    if (base.length < 2 && !KANJI.test(base)) continue;
                    const lvl = jlptMap[base] || jlptMap[tok.surface] || 0;
                    if (!lvl || !levelAllows(lvl)) continue;
                    // Уже в словаре пользователя / отмечено «уже знаю» — не предлагаем.
                    if (state.knownWords.has(base) || state.knownWords.has(tok.surface)) continue;
                    // Список известных с сервера мог прийти уже после того, как плеер
                    // собрал state.knownWords (новое устройство/аккаунт) — сверяемся и с ним.
                    if (window.KnownWords && (KnownWords.has(base) || KnownWords.has(tok.surface))) continue;

                    let e = byBase.get(base);
                    if (!e) {
                        e = { base, level: lvl, count: 0, tok, cue, ep: set, cueScore: -1, dict: undefined, translation: '' };
                        byBase.set(e.base, e);
                    }
                    e.count++;
                    // Токен с чтением базовой формы ценнее (kana карточки будет верной).
                    if (!e.tok.baseReading && tok.baseReading) e.tok = tok;
                    const s = cueScore(cue);
                    if (s > e.cueScore) { e.cueScore = s; e.cue = cue; e.ep = set; }
                }
            }
        }
        // Полезность: частота в серии; при равной частоте N5 раньше N4 (сам
        // JLPT-уровень — прокси общей частотности: список и есть частая лексика).
        return [...byBase.values()]
            .sort((a, b) => (b.count + (b.level === 5 ? 0.3 : 0)) - (a.count + (a.level === 5 ? 0.3 : 0)))
            .slice(0, MAX_WORDS);
    }

    // ---------- Скан серий для «всего аниме» ----------

    function currentEpIndex() { return parseInt(episodeSelect.value, 10) || 0; }
    function epNumberOf(idx) {
        const ep = state.episodes[idx];
        return ep && ep.number != null ? ep.number : idx + 1;
    }

    async function buildCueSets(token) {
        const cur = currentEpIndex();
        if (scope === 'episode') {
            return [{ cues: state.cues, epIndex: cur, epNumber: epNumberOf(cur), current: true }];
        }
        const total = Math.min(state.episodes.length || 1, SCAN_MAX);
        const sets = [];
        for (let i = 0; i < total; i++) {
            if (token !== scanToken) return null;   // охват/уровень успели переключить
            const epNumber = epNumberOf(i);
            if (i === cur && state.cues.length) {
                sets.push({ cues: state.cues, epIndex: i, epNumber, current: true });
                continue;
            }
            scanEl.hidden = false;
            scanEl.textContent = t('edeck.scan').replace('{i}', i + 1).replace('{n}', total);
            const key = epNumber + ':' + subsLang();
            let cues = scanCache.get(key);
            if (cues === undefined) {
                try {
                    // Тот же подбор файла, что у плеера (jimaku + архив).
                    const { data: res } = await client.get('subtitles/episode', {
                        params: { title: titleRomaji, episode: epNumber, translate: subsLang() },
                        timeout: 180000,
                        silentErrors: true,
                    });
                    cues = (res.data && res.data.cues) || [];
                } catch { cues = []; /* серии без сабов просто пропускаем */ }
                scanCache.set(key, cues);
            }
            if (cues.length) sets.push({ cues, epIndex: i, epNumber, current: false });
        }
        scanEl.hidden = true;
        return sets;
    }

    // ---------- Перевод и чтение ----------

    // Короткий перевод для карточки — та же логика, что при сохранении из попапа:
    // общий shortTranslation (words-store.js).
    function buildTranslation(dict) {
        return shortTranslation(dict);
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const is429 = (err) => err && err.response && err.response.status === 429;

    async function fetchDict(entry) {
        // silentErrors: непрогретые слова словарь-прокси отдаёт 502, мы их сами
        // ретраим — глобальный снекбар «Словарь не отвечает» тут только пугал.
        const { data: res } = await client.get('dictionary', {
            params: { q: entry.base, lang: (typeof getLang === 'function') ? getLang() : 'ru' },
            silentErrors: true,
        });
        entry.dict = (res.data && res.data[0]) || null;
        entry.translation = buildTranslation(entry.dict);
    }

    function readingOf(entry) {
        const kana = (entry.dict && entry.dict.reading) || entry.tok.baseReading || entry.tok.reading || '';
        // В ромадзи-режиме показываем латиницу и для чисто-канных слов (как в
        // субтитрах): ひとつ → hitotsu. В кана-режиме дублировать кану незачем.
        if (state.readingMode === 'romaji' && typeof kanaToRomaji === 'function') {
            const rom = kanaToRomaji(kana || entry.base);
            return rom && rom !== entry.base ? rom : '';
        }
        if (!kana || kana === entry.base) return '';
        return kana;
    }

    // Пул: качаем переводы по DICT_POOL за раз, строки обновляются по мере прихода.
    function loadTranslations(entries) {
        let idx = 0;
        const failed = [];
        const run = async () => {
            while (idx < entries.length) {
                const e = entries[idx++];
                if (e.dict !== undefined) continue;
                try { await fetchDict(e); } catch { failed.push(e); continue; }
                if (candidates.includes(e)) updateRow(e);
            }
        };
        Promise.all(Array.from({ length: DICT_POOL }, run)).then(async () => {
            // Непрогретые слова словарь-прокси иногда отдаёт 502 (jisho) — один
            // повтор с паузой; кто не ожил, останется с прочерком.
            if (!failed.length) return;
            await new Promise((r) => setTimeout(r, 1500));
            for (const e of failed) {
                if (!candidates.includes(e)) return;   // модалка уже пересобрана
                try { await fetchDict(e); } catch { /* прочерк */ }
                updateRow(e);
            }
        });
    }

    // ---------- Модалка ----------

    function updateRow(entry) {
        const row = listEl.querySelector(`[data-base="${(window.CSS && CSS.escape) ? CSS.escape(entry.base) : entry.base}"]`);
        if (!row) return;
        const read = row.querySelector('.edeck-row__read');
        const tr = row.querySelector('.edeck-row__tr');
        read.textContent = readingOf(entry);
        tr.classList.remove('edeck-row__tr--loading');
        tr.textContent = entry.translation || '—';
    }

    function selectedEntries() {
        const out = [];
        listEl.querySelectorAll('.edeck-row input:checked').forEach((cb) => {
            const e = candidates[Number(cb.closest('.edeck-row').dataset.idx)];
            if (e) out.push(e);
        });
        return out;
    }

    function updateCount() {
        const n = selectedEntries().length;
        countEl.textContent = t('edeck.selected').replace('{n}', n).replace('{m}', candidates.length);
        createBtn.disabled = creating || n === 0;
        if (!creating) createBtn.textContent = t('edeck.create').replace('{n}', n);
        const all = n === candidates.length;
        allCb.checked = all;
        allCb.indeterminate = n > 0 && !all;
    }

    function renderList() {
        listEl.innerHTML = '';
        if (!candidates.length && !scanning) {
            const msg = document.createElement('div');
            msg.className = 'edeck__empty';
            msg.textContent = t('edeck.empty');
            listEl.appendChild(msg);
        }
        candidates.forEach((e, i) => {
            const row = document.createElement('label');
            row.className = 'edeck-row';
            row.dataset.idx = i;
            row.dataset.base = e.base;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.addEventListener('change', updateCount);
            row.appendChild(cb);

            const main = document.createElement('div');
            main.className = 'edeck-row__main';

            const top = document.createElement('div');
            top.className = 'edeck-row__top';
            const word = document.createElement('span');
            word.className = 'edeck-row__word';
            word.textContent = e.base;
            const read = document.createElement('span');
            read.className = 'edeck-row__read';
            read.textContent = readingOf(e);
            const badge = document.createElement('span');
            badge.className = 'edeck-row__badge edeck-row__badge--n' + e.level;
            badge.textContent = 'N' + e.level;
            top.appendChild(word);
            top.appendChild(read);
            top.appendChild(badge);
            if (e.count > 1) {
                const freq = document.createElement('span');
                freq.className = 'edeck-row__freq';
                freq.textContent = '×' + e.count;
                freq.title = t('edeck.freq.title');
                top.appendChild(freq);
            }
            // Во «всём аниме» подписываем, из какой серии пример (и клип).
            if (scope === 'anime' && e.ep && !e.ep.current) {
                const epTag = document.createElement('span');
                epTag.className = 'edeck-row__ep';
                epTag.textContent = t('edeck.ep').replace('{n}', e.ep.epNumber);
                top.appendChild(epTag);
            }
            main.appendChild(top);

            const tr = document.createElement('div');
            tr.className = 'edeck-row__tr';
            if (e.dict !== undefined) {
                tr.textContent = e.translation || '—';
            } else {
                tr.classList.add('edeck-row__tr--loading');
                tr.textContent = '…';
            }
            main.appendChild(tr);

            const sent = document.createElement('div');
            sent.className = 'edeck-row__sent';
            sent.textContent = e.cue.text;
            main.appendChild(sent);

            row.appendChild(main);
            listEl.appendChild(row);
        });
        updateCount();
    }

    function setBusy(on) {
        creating = on;
        overlay.classList.toggle('edeck--busy', on);
        allCb.disabled = on;
        closeBtn.disabled = on;
        listEl.querySelectorAll('input').forEach((cb) => { cb.disabled = on; });
    }

    // Кино-режим: на время показа оверлей живёт внутри fullscreen-элемента
    // (createFsPortal в app.js — общий с выбором известных слов).
    const fsPortal = createFsPortal(overlay);

    // «Назад» на телефоне закрывает модалку, а не уводит с плеера — слой живёт
    // в общем менеджере (AnimeiBack в app.js).
    let layer = null;

    function hideModal() {
        layer = null;
        scanToken++;            // висящий скан серий больше не нужен
        scanning = false;
        scanEl.hidden = true;
        overlay.hidden = true;
        fsPortal.restore();
    }

    function closeModal() {
        if (creating) return;                // во время сохранения не закрываем
        if (layer) AnimeiBack.close(layer);
        else hideModal();
    }

    // Пересобрать список под текущие охват/уровень. У «всего аниме» скан серий
    // асинхронный — устаревшие пересборки отменяет scanToken.
    async function rebuild() {
        const token = ++scanToken;
        scanning = scope === 'anime';
        candidates = [];
        renderList();
        const sets = await buildCueSets(token);
        if (token !== scanToken) return;
        scanning = false;
        candidates = sets ? collectCandidates(sets) : [];
        renderList();
        listEl.scrollTop = 0;
        if (candidates.length) loadTranslations(candidates);
    }

    async function openModal() {
        video.pause();
        btn.disabled = true;
        try {
            await loadJlpt();
        } catch (err) {
            console.error('Не удалось загрузить JLPT-словарь:', err);
            showSnackbar(t('edeck.error'), { duration: 3500, type: 'error' });
            btn.disabled = false;
            return;
        }
        btn.disabled = false;
        subEl.textContent = t(scope === 'anime' ? 'edeck.sub.anime' : 'edeck.sub');
        fsPortal.attach();
        overlay.hidden = false;
        layer = AnimeiBack.open(hideModal);
        await rebuild();
        if (window.animeiTrack) {
            window.animeiTrack('episode_deck', (scope === 'anime' ? 'anime_open:' : 'open:') + candidates.length);
        }
    }

    // ---------- Переключатели охвата и уровня ----------

    function setLevel(v, touched) {
        level = v;
        if (touched) levelTouched = true;
        levelSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x.dataset.level === v));
    }

    if (scopeSeg) scopeSeg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-scope]');
        if (!b || creating || b.dataset.scope === scope) return;
        scope = b.dataset.scope;
        scopeSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
        // Пока уровень не трогали руками, охват задаёт дефолт: серия — N5+N4,
        // всё аниме — N5 (колода «из любимого аниме» задумана для новичка).
        if (!levelTouched) setLevel(scope === 'anime' ? '5' : '54', false);
        subEl.textContent = t(scope === 'anime' ? 'edeck.sub.anime' : 'edeck.sub');
        rebuild();
    });

    if (levelSeg) levelSeg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-level]');
        if (!b || creating || b.dataset.level === level) return;
        setLevel(b.dataset.level, true);
        rebuild();
    });

    // ---------- Создание колоды ----------

    function deckName() {
        const title = String(titleRu || titleRomaji || 'Anime').trim();
        // Колода по всему тайтлу — просто его имя, без номера серии.
        if (scope === 'anime') return title.slice(0, 50);
        const ep = state.episodes[parseInt(episodeSelect.value, 10)];
        const epNum = ep && ep.number != null ? ep.number : (parseInt(episodeSelect.value, 10) + 1 || 1);
        // Лимит имени колоды — 50 символов (decks-store): длинный тайтл ужимаем,
        // чтобы номер серии не отрезался.
        const tail = ' — ' + t('hub.continue.ep') + ' ' + epNum;
        return title.slice(0, 50 - tail.length) + tail;
    }

    // ---------- Поток и сдвиг серии-источника ----------
    // Слова «всего аниме» приходят из разных серий: каждой нужен свой видеопоток
    // (сервер режет клип из него) и свой сдвиг субтитров. Текущая серия берёт их
    // из state (плюс дожидается автосинка); прочие резолвятся как в selectEpisode,
    // но без загрузки в плеер, а сдвиг — из сохранённого (серию уже смотрели) или
    // через серверный автосинк subtitles/align (результат кэшируется по seriesKey).

    function offsetKeyFor(epNumber) {
        const tr = selectedTrack();
        return 'animei:subsOffset:' + shikimoriId + ':' + (tr.id || tr.provider || 'k')
            + ':s' + state.seasonIndex + ':ep' + epNumber;
    }

    async function resolveEpisodeStream(epIndex) {
        const ep = state.episodes[epIndex];
        if (!ep) return '';
        const prov = PROVIDERS[state.provider];
        if (prov) {
            const { data: res } = await client.get(prov.endpoint, { params: prov.params(ep), silentErrors: true });
            const url = prov.qualities
                ? (res.data.auto || Object.values(res.data.qualities || {})[0])
                : prov.streamUrl(res.data);
            return url ? apiOrigin() + url : '';
        }
        const { data: res } = await client.get('catalog/stream', {
            params: { type: 'seria', id: ep.id, hash: ep.hash },
            silentErrors: true,
        });
        const url = res.data.hls || Object.values(res.data.qualities || {})[0] || '';
        return url ? apiOrigin() + url : '';
    }

    // Сдвиг реплики серии-источника: база + добавка её куска (segDelta — player.js).
    function setOff(set, cue) {
        return (set.offset || 0) + segDelta(set.segs, cue.start);
    }

    async function alignOffset(set, videoUrl) {
        const saved = parseFloat(localStorage.getItem(offsetKeyFor(set.epNumber)));
        if (Number.isFinite(saved)) return saved;
        try {
            const inWin = set.cues
                .filter((c) => Number.isFinite(c.start) && c.start >= 0 && c.start < 340)
                .slice(0, 260);
            if (inWin.length < 5) return 0;
            const trSel = selectedTrack();
            const audioLang = trackAudioLang(trSel);
            const { data: res } = await client.post('subtitles/align', {
                videoUrl,
                cues: inWin.map((c) => c.start),
                cueEnds: inWin.map((c) => (Number.isFinite(c.end) ? c.end : c.start + 2)),
                cueTexts: inWin.map((c) => (audioLang === 'ja' ? (c.text || '') : (c.translation || c.text || ''))),
                audioLang,
                seriesKey: shikimoriId + ':' + (trSel.id || trSel.provider || 'k') + ':s' + state.seasonIndex,
                introEnd: 0,
            }, { timeout: 130000, silentErrors: true });
            const { offset, confidence, matched } = res.data || {};
            // Пороги доверия — как у автосинка плеера (maybeAutoSync), но БЕЗ
            // отсечки «мелкий сдвиг не применять»: она про показ субтитров, а
            // здесь по сдвигу режутся клипы — секундный промах срезает начало
            // фразы (ловили на «Монстре»: −1.1с при уверенности 0.9).
            const strong = confidence >= 0.6;
            const okModerate = confidence >= 0.4 && (matched || 0) >= 12 && Math.abs(offset) <= 20;
            const okSmall = confidence >= 0.34 && (matched || 0) >= 20 && Math.abs(offset) <= 6;
            if (Number.isFinite(offset) && (strong || okModerate || okSmall)) {
                return offset;
            }
        } catch { /* синк не сложился — режем по таймингам сабов как есть */ }
        return 0;
    }

    // Контекст серии готовится один раз (promise в set.ready) и разделяется
    // всеми её словами — параллельные воркеры не резолвят поток дважды.
    function ensureEpContext(set) {
        if (set.ready) return set.ready;
        set.ready = (async () => {
            if (set.current) {
                try { await state.syncPromise; } catch { /* автосинк не критичен */ }
                set.videoUrl = state.currentVideoUrl || '';
                set.offset = state.offset || 0;
                set.segs = state.segs;
                return set;
            }
            scanEl.hidden = false;
            scanEl.textContent = t('edeck.sync').replace('{n}', set.epNumber);
            try { set.videoUrl = await resolveEpisodeStream(set.epIndex); } catch { set.videoUrl = ''; }
            set.offset = set.videoUrl ? await alignOffset(set, set.videoUrl) : 0;
            // Кусочный сдвиг — только если серию уже смотрели и он сохранён (см. cueOff).
            set.segs = loadSegs(offsetKeyFor(set.epNumber));

            // Контроль дрейфа (как в beginner-deck): сверяем одну реплику из
            // середины серии по звуку; не сошлось — слова серии без клипов.
            if (set.videoUrl) {
                try {
                    const mids = set.cues.filter((c) => c.start > 300 && (c.end - c.start) >= 1.6
                        && (c.end - c.start) <= 6 && String(c.text || '').length >= 8);
                    const probe = mids[Math.floor(mids.length / 2)];
                    if (probe) {
                        const { data: res } = await client.post('subtitles/verify-window', {
                            videoUrl: set.videoUrl,
                            start: Math.max(0, probe.start + setOff(set, probe) - 1),
                            duration: (probe.end - probe.start) + 3,
                            text: probe.text,
                        }, { timeout: 90000, silentErrors: true });
                        const sim = res.data && res.data.sim;
                        if (Number.isFinite(sim) && sim < 0.25) {
                            console.warn('Дрейф сабов, серия без клипов:', set.epNumber, res.data);
                            set.videoUrl = '';
                        }
                    }
                } catch { /* сверка best-effort */ }
            }
            return set;
        })();
        return set.ready;
    }

    async function saveEntry(entry) {
        if (entry.dict === undefined) {
            try {
                await fetchDict(entry);
            } catch (err) {
                // На лимите (429) не спешим сохранять карточку без перевода —
                // подождём окно и попробуем ещё раз; иначе сохраняем как есть.
                if (is429(err)) {
                    await sleep(10000);
                    try { await fetchDict(entry); } catch { /* без перевода */ }
                }
            }
        }
        const dict = entry.dict || null;
        const cue = entry.cue;
        // Поток и сдвиг серии, из которой взят пример (для «этой серии» — из
        // state, для других серий «всего аниме» — свой, см. ensureEpContext).
        const set = await ensureEpContext(entry.ep);
        const word = await saveWord({
            kanji: entry.base,
            kana: (dict && dict.reading) || entry.tok.baseReading || entry.tok.reading || '',
            romaji: '',
            translation: entry.translation || buildTranslation(dict),
            sentence: cue.text,
            sentenceTranslation: cue.translation || '',
            videoStart: Math.max(0, cue.start + setOff(set, cue)),
            videoEnd: cue.end + setOff(set, cue),
            videoUrl: set.videoUrl || '',
            hint: '',
        });
        state.knownWords.add(entry.base);
        if (typeof markKnownEverywhere === 'function') markKnownEverywhere(entry.base);
        return word;
    }

    createBtn.addEventListener('click', async () => {
        if (creating) return;
        const picked = selectedEntries();
        if (!picked.length) return;

        setBusy(true);
        createBtn.disabled = true;
        // Клипы режутся по синхронизированному времени — дожидаемся автосинка,
        // как и одиночное сохранение из попапа.
        try { await state.syncPromise; } catch { /* автосинк не критичен */ }

        // 📺, не 🎬: у слов серии всегда есть клип со значком 🎬 — в списке слов
        // два одинаковых эмодзи подряд читались как дубль. Аватарка колоды —
        // портрет главного персонажа тайтла (наш /catalog/deck-icon/<id>);
        // эмодзи остаётся фоллбэком, если картинка не загрузится.
        const animeId = new URLSearchParams(location.search).get('id');
        const icon = animeId && /^\d{1,10}$/.test(animeId) ? '/catalog/deck-icon/' + animeId : '';
        const deck = window.Decks.create(deckName(), '📺', icon);
        let done = 0;
        let failed = 0;
        const total = picked.length;
        const tick = () => {
            createBtn.textContent = t('edeck.creating').replace('{i}', done + failed).replace('{n}', total);
        };
        tick();

        let idx = 0;
        const worker = async () => {
            while (idx < picked.length) {
                const entry = picked[idx++];
                // Общий лимитер API (по IP, окно 60с) может срезать бурст
                // сохранений 429-ми: не роняем слово, а ждём, пока окно
                // освободится, и повторяем — до 3 попыток с ростом паузы.
                let attempt = 0;
                for (;;) {
                    try {
                        const word = await saveEntry(entry);
                        if (word && word.id) window.Decks.toggle(deck.id, word.id);
                        done++;
                    } catch (err) {
                        if (is429(err) && attempt < 3) {
                            attempt++;
                            await sleep(10000 * attempt);
                            continue;
                        }
                        console.error('Не удалось сохранить слово для колоды:', entry.base, err);
                        failed++;
                    }
                    break;
                }
                tick();
            }
        };
        await Promise.all(Array.from({ length: SAVE_POOL }, worker));
        scanEl.hidden = true;

        if (typeof updateCoverage === 'function') updateCoverage();
        setBusy(false);

        if (!done) {
            window.Decks.remove(deck.id);   // пустую колоду не оставляем
            updateCount();
            showSnackbar(t('edeck.error'), { duration: 4000, type: 'error' });
            return;
        }
        if (layer) AnimeiBack.close(layer); else hideModal();
        if (window.animeiTrack) {
            window.animeiTrack('episode_deck', (scope === 'anime' ? 'anime_created:' : 'created:') + done);
        }
        if (failed) {
            showSnackbar(t('edeck.partial').replace('{k}', done).replace('{n}', total), { duration: 5000, type: 'error' });
        } else {
            showSnackbar(t('edeck.done').replace('{name}', deck.name).replace('{n}', done), { duration: 5000 });
        }
    });

    // Затухание нижнего края списка (см. .edeck__list в player.css) снимаем,
    // когда прокрутили до конца — иначе последняя строка выглядит блёклой.
    listEl.addEventListener('scroll', () => {
        const atBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 2;
        listEl.classList.toggle('is-bottom', atBottom);
    });

    allCb.addEventListener('change', () => {
        listEl.querySelectorAll('.edeck-row input').forEach((cb) => { cb.checked = allCb.checked; });
        updateCount();
    });
    btn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });
})();
