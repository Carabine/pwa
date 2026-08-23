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
    const MIN_WORDS = 5;      // меньше — колода не имеет смысла
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
    const overlay = document.getElementById('edeck-overlay');
    if (!btn || !overlay) return;

    const listEl = document.getElementById('edeck-list');
    const subEl = document.getElementById('edeck-sub');
    const countEl = document.getElementById('edeck-count');
    const allCb = document.getElementById('edeck-all');
    const createBtn = document.getElementById('edeck-create');
    const closeBtn = document.getElementById('edeck-close');

    let jlptMap = null;        // { слово|кана: 5|4 } — грузим при первом клике
    let jlptPromise = null;
    let candidates = [];       // текущий отбор для открытой модалки
    let creating = false;      // идёт сохранение — не закрываем и не пересобираем

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

    // Кнопка появляется, когда субтитры серии загружены. Прямого события у
    // плеера нет — дешёвый поллинг раз в секунду (и скрываем при смене серии).
    setInterval(() => {
        // state — глобальная const из player.js (мы подключены после него).
        const has = !!(state.cues && state.cues.length);
        if (btn.hidden === !has) return;
        btn.hidden = !has;
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

    function collectCandidates() {
        const byBase = new Map();
        for (const cue of state.cues) {
            for (const tok of (cue.tokens || [])) {
                if (!tok.learnable || !CONTENT_POS.has(tok.pos)) continue;
                const base = tok.base || tok.surface;
                if (STOPLIST.has(base)) continue;
                // Однобуквенные обрывки каны (气/へ/め от неудачного разбора) — мимо.
                if (base.length < 2 && !KANJI.test(base)) continue;
                const level = jlptMap[base] || jlptMap[tok.surface] || 0;
                if (!level) continue;
                // Уже в словаре пользователя / отмечено «уже знаю» — не предлагаем.
                if (state.knownWords.has(base) || state.knownWords.has(tok.surface)) continue;

                let e = byBase.get(base);
                if (!e) {
                    e = { base, level, count: 0, tok, cue, cueScore: -1, dict: undefined, translation: '' };
                    byBase.set(e.base, e);
                }
                e.count++;
                // Токен с чтением базовой формы ценнее (kana карточки будет верной).
                if (!e.tok.baseReading && tok.baseReading) e.tok = tok;
                const s = cueScore(cue);
                if (s > e.cueScore) { e.cueScore = s; e.cue = cue; }
            }
        }
        // Полезность: частота в серии; при равной частоте N5 раньше N4 (сам
        // JLPT-уровень — прокси общей частотности: список и есть частая лексика).
        return [...byBase.values()]
            .sort((a, b) => (b.count + (b.level === 5 ? 0.3 : 0)) - (a.count + (a.level === 5 ? 0.3 : 0)))
            .slice(0, MAX_WORDS);
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
        const { data: res } = await client.get('dictionary', {
            params: { q: entry.base, lang: (typeof getLang === 'function') ? getLang() : 'ru' },
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

    // В кино-режиме раскладка уходит в реальный fullscreen, а браузер показывает
    // только fullscreen-элемент и его потомков — модалка из body там была бы
    // невидимой (так же переносят словарный попап, см. player-ui.js). Поэтому на
    // время показа переносим оверлей внутрь fullscreen-элемента и возвращаем назад.
    let overlayHome = null;

    function attachOverlay() {
        const fs = document.fullscreenElement;
        if (!fs || fs.contains(overlay)) return;
        overlayHome = { parent: overlay.parentNode, next: overlay.nextSibling };
        fs.appendChild(overlay);
    }

    function restoreOverlay() {
        if (!overlayHome) return;
        overlayHome.parent.insertBefore(overlay, overlayHome.next);
        overlayHome = null;
    }

    // Вышли из кино-режима с открытой модалкой — возвращаем оверлей в документ
    // (иначе он остался бы висеть внутри бывшего fullscreen-элемента).
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) restoreOverlay();
    });

    // «Назад» на телефоне закрывает модалку, а не уводит с плеера — слой живёт
    // в общем менеджере (AnimeiBack в app.js).
    let layer = null;

    function hideModal() {
        layer = null;
        overlay.hidden = true;
        restoreOverlay();
    }

    function closeModal() {
        if (creating) return;                // во время сохранения не закрываем
        if (layer) AnimeiBack.close(layer);
        else hideModal();
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
        candidates = collectCandidates();
        btn.disabled = false;
        if (candidates.length < MIN_WORDS) {
            showSnackbar(t('edeck.fewWords'), { duration: 4000 });
            return;
        }
        subEl.textContent = t('edeck.sub');
        renderList();
        attachOverlay();
        overlay.hidden = false;
        layer = AnimeiBack.open(hideModal);
        listEl.scrollTop = 0;
        if (window.animeiTrack) window.animeiTrack('episode_deck', 'open:' + candidates.length);
        loadTranslations(candidates);
    }

    // ---------- Создание колоды ----------

    function deckName() {
        const title = String(titleRu || titleRomaji || 'Anime').trim();
        const ep = state.episodes[parseInt(episodeSelect.value, 10)];
        const epNum = ep && ep.number != null ? ep.number : (parseInt(episodeSelect.value, 10) + 1 || 1);
        // Лимит имени колоды — 50 символов (decks-store): длинный тайтл ужимаем,
        // чтобы номер серии не отрезался.
        const tail = ' — ' + t('hub.continue.ep') + ' ' + epNum;
        return title.slice(0, 50 - tail.length) + tail;
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
        const word = await saveWord({
            kanji: entry.base,
            kana: (dict && dict.reading) || entry.tok.baseReading || entry.tok.reading || '',
            romaji: '',
            translation: entry.translation || buildTranslation(dict),
            sentence: cue.text,
            sentenceTranslation: cue.translation || '',
            videoStart: Math.max(0, cue.start + state.offset),
            videoEnd: cue.end + state.offset,
            videoUrl: state.currentVideoUrl || '',
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

        const deck = window.Decks.create(deckName(), '🎬');
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

        if (typeof updateCoverage === 'function') updateCoverage();
        setBusy(false);

        if (!done) {
            window.Decks.remove(deck.id);   // пустую колоду не оставляем
            updateCount();
            showSnackbar(t('edeck.error'), { duration: 4000, type: 'error' });
            return;
        }
        if (layer) AnimeiBack.close(layer); else hideModal();
        if (window.animeiTrack) window.animeiTrack('episode_deck', 'created:' + done);
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
