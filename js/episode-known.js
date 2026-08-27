// Меню «⋯» рядом с авто-колодой и модалка «Уже известные слова».
//
// Отмечать знакомое слово по одному через попап — долго: у зрителя с базой в
// пару тысяч слов половина серии уже знакома. Здесь вся лексика серии одним
// экраном плитками: тап по слову = «это я знаю». Отметки уходят в known-store
// (localStorage): слово сразу подсвечивается как знакомое, поднимает процент
// покрытия серии и больше не предлагается в авто-колоде.
//
// Слова, на которые уже заведена карточка, в список не попадают: сделать с
// ними здесь всё равно нечего (снять «знаю» = удалить карточку, а карточки
// живут на странице «Мои слова»), и нетронутые плитки только сбивали.
//
// Переводы намеренно НЕ тянем: это сотни запросов к словарю (общий лимит — 300
// за минуту на IP) ради слов, которые пользователь и так узнаёт в лицо. Чтение
// и уровень JLPT берём локально — из токенов сабов и data/jlpt-n5n4.json.
//
// Подключается ПОСЛЕ player.js (state, video, t, kanaToRomaji, renderTranscript)
// и episode-deck.js (window.JlptLevels).
(function () {
    const MAX_WORDS = 1200;   // защитный потолок на DOM; серия столько не даёт

    const wrap = document.getElementById('episode-deck-wrap');
    const menuBtn = document.getElementById('episode-deck-more');
    const menu = document.getElementById('episode-deck-menu');
    const overlay = document.getElementById('kwords-overlay');
    if (!wrap || !menuBtn || !menu || !overlay || !window.KnownWords) return;

    const knownItem = document.getElementById('edeck-menu-known');
    const listEl = document.getElementById('kwords-list');
    const filtersEl = document.getElementById('kwords-filters');
    const allBtn = document.getElementById('kwords-all');
    const saveBtn = document.getElementById('kwords-save');
    const closeBtn = document.getElementById('kwords-close');

    // ---------- Меню «⋯» ----------

    let menuLayer = null;   // «Назад» на телефоне закрывает выпадашку, а не страницу

    function closeMenu() {
        if (menuLayer) { AnimeiBack.close(menuLayer); return; }
        menu.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
    }

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!menu.hidden) { closeMenu(); return; }
        menu.hidden = false;
        menuBtn.setAttribute('aria-expanded', 'true');
        menuLayer = AnimeiBack.open(() => {
            menuLayer = null;
            menu.hidden = true;
            menuBtn.setAttribute('aria-expanded', 'false');
        });
    });

    document.addEventListener('click', (e) => {
        if (!menu.hidden && !menu.contains(e.target)) closeMenu();
    });
    menu.addEventListener('click', () => closeMenu());

    // Сменили серию — группа кнопок прячется, открытое меню должно уйти с ней.
    new MutationObserver(() => { if (wrap.hidden && !menu.hidden) closeMenu(); })
        .observe(wrap, { attributes: true, attributeFilter: ['hidden'] });

    // ---------- Слова серии ----------

    let words = [];          // [{ base, reading, romaji, count, level }]
    let picked = new Set();  // отмечено сейчас (включая уже известные до открытия)
    let initial = new Set(); // что было известно на момент открытия — с ним и сверяем
    let filter = 'all';
    let skipped = 0;         // слов серии, отсеянных как «уже есть карточка»

    function collectWords() {
        const byBase = new Map();
        for (const cue of state.cues) {
            for (const tok of (cue.tokens || [])) {
                if (!tok.learnable) continue;
                const base = tok.base || tok.surface;
                if (!base) continue;
                let e = byBase.get(base);
                if (!e) {
                    e = { base, reading: '', romaji: '', count: 0, level: 0 };
                    byBase.set(base, e);
                }
                e.count++;
                // Чтение базовой формы (知らない → しる), а не поверхностной; у
                // неизменяемых слов подойдёт и чтение самой формы.
                if (!e.reading) {
                    e.reading = tok.baseReading || (tok.surface === base ? tok.reading : '') || '';
                }
            }
        }
        // Слова, на которые уже заведена карточка, в список не берём вовсе.
        // Раньше они показывались нетронутыми плитками, и это только сбивало:
        // непонятно, почему не нажимаются (переключать их нельзя — снять «знаю»
        // здесь означало бы удалить карточку, а карточки живут на странице
        // «Мои слова»). Отметки known-store, наоборот, снимаются свободно.
        const list = [...byBase.values()]
            .filter((e) => !(state.knownWords.has(e.base) && !KnownWords.has(e.base)));
        skipped = byBase.size - list.length;
        for (const e of list) {
            e.level = window.JlptLevels ? JlptLevels.level(e.base) : 0;
            if (typeof kanaToRomaji === 'function') {
                e.romaji = kanaToRomaji(e.reading || e.base).toLowerCase();
            }
        }
        // Частые слова первыми: их выгоднее отметить (или, наоборот, выучить).
        list.sort((a, b) => b.count - a.count || a.base.localeCompare(b.base, 'ja'));
        return list.slice(0, MAX_WORDS);
    }

    function readingOf(e) {
        if (state.readingMode === 'romaji' && e.romaji) {
            return e.romaji !== e.base ? e.romaji : '';
        }
        if (!e.reading || e.reading === e.base) return '';
        return e.reading;
    }

    function matches(e) {
        if (filter === 'new' && picked.has(e.base)) return false;
        if (filter === 'known' && !picked.has(e.base)) return false;
        return true;
    }

    // ---------- Отрисовка ----------

    function changes() {
        let added = 0;
        let removed = 0;
        for (const b of picked) if (!initial.has(b)) added++;
        for (const b of initial) if (!picked.has(b)) removed++;
        return { added, removed };
    }

    // Счётчики у вкладок — они же заменяют бывшую подпись «отмечено N из M»:
    // «Знаю» и есть число отмеченных, «Все» — сколько слов в серии. Числа
    // живые: тап по плитке списка не перерисовывает, поэтому обновляем здесь.
    function updateTabs() {
        const known = words.filter((e) => picked.has(e.base)).length;
        const n = { all: words.length, new: words.length - known, known };
        filtersEl.querySelectorAll('.kwords__filter').forEach((b) => {
            b.querySelector('i').textContent = n[b.dataset.filter];
        });
    }

    function updateFoot() {
        updateTabs();
        const { added, removed } = changes();
        const n = added + removed;
        saveBtn.disabled = n === 0;
        saveBtn.textContent = n ? t('kwords.save').replace('{n}', n) : t('kwords.saveIdle');
    }

    function chipFor(e) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'kw-chip' + (picked.has(e.base) ? ' is-on' : '');
        chip.dataset.base = e.base;

        const word = document.createElement('span');
        word.className = 'kw-chip__word';
        word.textContent = e.base;
        chip.appendChild(word);

        const read = readingOf(e);
        if (read) {
            const r = document.createElement('span');
            r.className = 'kw-chip__read';
            r.textContent = read;
            chip.appendChild(r);
        }
        if (e.level) {
            const badge = document.createElement('span');
            badge.className = 'kw-chip__badge kw-chip__badge--n' + e.level;
            badge.textContent = 'N' + e.level;
            chip.appendChild(badge);
        }
        if (e.count > 1) {
            const freq = document.createElement('span');
            freq.className = 'kw-chip__freq';
            freq.textContent = '×' + e.count;
            chip.appendChild(freq);
        }
        return chip;
    }

    // Список перерисовываем только при смене фильтра. По тапу меняем
    // класс самой плитки: иначе под фильтром «Новые» слово исчезало бы прямо
    // из-под пальца, и попасть в соседнее было бы невозможно.
    function renderList() {
        const visible = words.filter(matches);
        listEl.innerHTML = '';
        if (!visible.length) {
            const empty = document.createElement('div');
            empty.className = 'kwords__empty';
            empty.textContent = t('kwords.empty');
            listEl.appendChild(empty);
        } else {
            const frag = document.createDocumentFragment();
            for (const e of visible) frag.appendChild(chipFor(e));
            listEl.appendChild(frag);
        }
        // Кнопка-массовка работает по видимым: пока хоть одно не отмечено —
        // «отметить», когда отмечены все — «снять».
        const allOn = visible.length > 0 && visible.every((e) => picked.has(e.base));
        allBtn.hidden = visible.length === 0;
        allBtn.dataset.mode = allOn ? 'off' : 'on';
        allBtn.textContent = allOn ? t('kwords.unmarkVisible') : t('kwords.markVisible');
        updateFoot();
    }

    listEl.addEventListener('click', (e) => {
        const chip = e.target.closest('.kw-chip');
        if (!chip) return;
        const base = chip.dataset.base;
        if (picked.has(base)) picked.delete(base);
        else picked.add(base);
        chip.classList.toggle('is-on', picked.has(base));
        updateFoot();
    });

    allBtn.addEventListener('click', () => {
        const on = allBtn.dataset.mode === 'on';
        for (const e of words.filter(matches)) {
            if (on) picked.add(e.base);
            else picked.delete(e.base);
        }
        renderList();
    });

    filtersEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.kwords__filter');
        if (!btn) return;
        filter = btn.dataset.filter;
        filtersEl.querySelectorAll('.kwords__filter')
            .forEach((b) => b.classList.toggle('is-on', b === btn));
        listEl.scrollTop = 0;
        renderList();
    });

    // Затухание нижнего края списка (.edeck__list) снимаем на самом низу —
    // иначе последний ряд плиток выглядит блёклым.
    listEl.addEventListener('scroll', () => {
        const atBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 2;
        listEl.classList.toggle('is-bottom', atBottom);
    });

    // ---------- Открытие и закрытие ----------

    // В кино-режиме раскладка уходит в реальный fullscreen: браузер показывает
    // только fullscreen-элемент и его потомков — на время показа переносим
    // оверлей внутрь (так же поступают попап словаря и авто-колода).
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

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) restoreOverlay();
    });

    let layer = null;

    function hideModal() {
        layer = null;
        overlay.hidden = true;
        restoreOverlay();
    }

    function closeModal() {
        if (layer) AnimeiBack.close(layer);
        else hideModal();
    }

    // Открываем СИНХРОННО, без await до AnimeiBack.open. Пункт меню, по которому
    // сюда пришли, закрывает выпадашку — а та снимает свою запись из history
    // отложенным history.go(-1). Пока мы ждали загрузку уровней JLPT, «назад»
    // успевал сработать, и пришедший popstate закрывал только что открытую
    // модалку (открывалась и тут же исчезала). Слой должен встать в стек в том
    // же такте, что и клик: тогда AnimeiBack отдаст ему запись закрытого меню.
    function openModal() {
        if (typeof video !== 'undefined' && video) video.pause();

        words = collectWords();
        if (!words.length) {
            // Пусто по двум разным причинам: субтитры ещё не разобраны или на
            // все слова серии уже заведены карточки — второе стоит сказать
            // отдельно, иначе выглядит как поломка.
            showSnackbar(t(skipped ? 'kwords.allCards' : 'kwords.none'), { duration: 3500 });
            return;
        }
        picked = new Set(words.filter((e) => state.knownWords.has(e.base)).map((e) => e.base));
        initial = new Set(picked);
        // Незнакомые — наверх: работа идёт именно с ними, а уже известные (и
        // те, на что есть карточка) внизу — просто для сверки. Порядок считаем
        // один раз при открытии: иначе отмеченное слово прыгало бы вниз списка
        // при первом же поиске, и глаз терял бы место.
        words.sort((a, b) => (initial.has(a.base) ? 1 : 0) - (initial.has(b.base) ? 1 : 0));
        filter = 'all';
        filtersEl.querySelectorAll('.kwords__filter')
            .forEach((b) => b.classList.toggle('is-on', b.dataset.filter === 'all'));
        renderList();

        attachOverlay();
        overlay.hidden = false;
        layer = AnimeiBack.open(hideModal);
        listEl.scrollTop = 0;
        if (window.animeiTrack) window.animeiTrack('known_pick', 'open:' + words.length);

        // Уровень JLPT — украшение: словарь мог ещё не загрузиться (первое
        // открытие за сессию). Догружаем фоном и перерисовываем плашки, если
        // модалку не успели закрыть; не загрузился — просто без плашек.
        if (window.JlptLevels) {
            JlptLevels.load().then(() => {
                if (overlay.hidden) return;
                let changed = false;
                for (const e of words) {
                    const lv = JlptLevels.level(e.base);
                    if (lv !== e.level) { e.level = lv; changed = true; }
                }
                if (!changed) return;
                const top = listEl.scrollTop;
                renderList();
                listEl.scrollTop = top;
            }).catch(() => { /* без плашек */ });
        }
    }

    // Меню закрываем ДО открытия модалки, вручную. Свой обработчик у .edeck-menu
    // сработал бы позже нашего (всплытие), а AnimeiBack.close(menuLayer) закрывает
    // не только сам слой, но и всё, что успело открыться выше, — то есть только
    // что открытую модалку. В этом же порядке работает и передача записи history:
    // закрытый слой оставляет свою запись новому, и «назад» не перепрыгивает.
    knownItem?.addEventListener('click', () => {
        closeMenu();
        openModal();
    });
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    // ---------- Сохранение ----------

    saveBtn.addEventListener('click', () => {
        const added = [...picked].filter((b) => !initial.has(b));
        const removed = [...initial].filter((b) => !picked.has(b));
        if (!added.length && !removed.length) return;

        KnownWords.addMany(added);
        for (const b of removed) KnownWords.remove(b);
        for (const b of added) state.knownWords.add(b);
        for (const b of removed) state.knownWords.delete(b);

        // Снятая отметка убирает подсветку — это видно только после пере-рендера
        // списка; на добавлениях обходимся точечной покраской (скролл на месте).
        if (removed.length && typeof renderTranscript === 'function') renderTranscript();
        else if (typeof markKnownEverywhere === 'function') added.forEach((b) => markKnownEverywhere(b));
        if (typeof updateNowCue === 'function') updateNowCue(state.activeCueIndex);
        if (typeof updateCoverage === 'function') updateCoverage();

        closeModal();
        if (window.animeiTrack) window.animeiTrack('known_pick', 'saved:' + added.length);
        let msg;
        if (added.length && removed.length) {
            msg = t('kwords.savedMixed').replace('{a}', added.length).replace('{r}', removed.length);
        } else if (added.length) {
            msg = t('kwords.saved').replace('{a}', added.length);
        } else {
            msg = t('kwords.savedRemoved').replace('{r}', removed.length);
        }
        showSnackbar(msg, { duration: 4000 });
    });
})();
