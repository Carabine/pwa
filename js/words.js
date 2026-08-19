// Страница «Мои слова»: компактный список / карточки, сортировка, режим
// выбора (массово в колоду / из колоды / удалить), экспорт в меню «⋯» и
// импорт «известных слов» из Anki/списков (known-store.js).

// Экранируем пользовательский текст — он идёт и в разметку, и в атрибуты value.
function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
}

const VIEW_KEY = 'animei:wordsView';   // list | cards
const SORT_KEY = 'animei:wordsSort';   // new | old | az

let allWords = [];       // все слова коллекции (кэш, чтобы фильтровать без перезагрузки)
let wordsFilter = '';    // строка поиска (в нижнем регистре)
let viewMode = localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list';
let sortMode = ['new', 'old', 'az'].includes(localStorage.getItem(SORT_KEY))
    ? localStorage.getItem(SORT_KEY) : 'new';

// Режим выбора: копим id отмеченных слов, внизу — панель массовых действий.
let selectMode = false;
const selected = new Set();

// Пока сервер дорезает клип, слово помечено «готовится». Несколько раз тихо
// перечитываем список, чтобы значок сам сменился на 🎬, когда клип появится.
let clipRefreshLeft = 3;
let clipRefreshScheduled = false;

function scheduleClipRefresh() {
    if (clipRefreshScheduled || clipRefreshLeft <= 0) return;
    clipRefreshScheduled = true;
    setTimeout(async () => {
        clipRefreshScheduled = false;
        clipRefreshLeft--;
        try { allWords = await fetchWords(); } catch { /* оставим что было */ }
        renderWords();
    }, 8000);
}

async function loadWords() {
    const wordsListEl = document.querySelector('.words-list');
    wordsListEl.innerHTML = `<p style="color: var(--text-muted)">${t('words.loading')}</p>`;

    try {
        allWords = await fetchWords();
    } catch (err) {
        console.error('Failed to load words:', err);
        allWords = [];
    }
    // Чистим из колод «мёртвые» id — слова, которых уже нет в коллекции.
    if (window.Decks) Decks.sanitize(allWords.map((w) => w.id));
    renderWords();
}

function updateCount(n) {
    const countEl = document.getElementById('words-count');
    if (!countEl) return;
    countEl.textContent = n;
    countEl.hidden = n === 0;
}

// Слово подходит под фильтр, если строка встречается в написании, чтении или переводе
function matchesFilter(w) {
    if (!wordsFilter) return true;
    return [w.kanji, w.kana, w.romaji, w.translation, w.sentence]
        .some((f) => String(f ?? '').toLowerCase().includes(wordsFilter));
}

// Сортировка: по дате добавления (у гостя её нет — тогда по порядку записи)
// или по алфавиту (чтение, японская локаль).
function sortWords(list) {
    const idx = new Map(allWords.map((w, i) => [w.id, i]));
    const ts = (w) => {
        const time = Date.parse(w.createdAt || '');
        return Number.isFinite(time) ? time : idx.get(w.id);
    };
    const arr = list.slice();
    if (sortMode === 'az') {
        arr.sort((a, b) => String(a.kana || a.kanji || '').localeCompare(String(b.kana || b.kanji || ''), 'ja'));
    } else if (sortMode === 'old') {
        arr.sort((a, b) => ts(a) - ts(b));
    } else {
        arr.sort((a, b) => ts(b) - ts(a));
    }
    return arr;
}

// Прямая ссылка на клип (у вошедшего — Video.url; старое поле video оставляем).
function videoSrcOf(w) {
    return w.Video ? w.Video.url : (w.video || '');
}

// Состояние клипа для значка в списке:
//   ready   — есть готовое видео (или клип гостя в браузере),
//   pending — видео ещё режется на сервере (Video есть, url пуст),
//   none    — клипа нет.
function clipBadge(w) {
    if (videoSrcOf(w)) return 'ready';
    const expected = Number(w.videoEnd) > Number(w.videoStart);
    const isGuest = typeof w.id === 'string' && w.id.startsWith('local-');
    if (isGuest && expected) return 'ready';          // клип гостя лежит в IndexedDB
    if (w.Video && expected) return 'pending';        // сервер ещё готовит клип
    return 'none';
}

function clipBadgeHtml(w) {
    const badge = clipBadge(w);
    if (badge === 'ready') return `<span class="word-card__clip" title="${esc(t('words.clip'))}">🎬</span>`;
    if (badge === 'pending') return `<span class="word-card__clip word-card__clip--pending" title="${esc(t('words.videoPreparing'))}">⏳</span>`;
    return '';
}

async function removeWord(wordData) {
    await deleteWord(wordData.id);
    if (window.Decks) Decks.forgetWord(wordData.id);   // и из всех колод
    selected.delete(wordData.id);
    allWords = allWords.filter((w) => w.id !== wordData.id);
    renderWords();
}

function toggleSelected(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    renderWords();
}

// ---------- Отрисовка ----------

// Карточка (прежний подробный вид). Возвращает корневой элемент.
function buildCard(wordData) {
    const wordEl = document.createElement('div');
    wordEl.innerHTML = `
        <div class="word-card word-read-content${selected.has(wordData.id) ? ' is-selected' : ''}">
            <button class="word-card__delete" title="${esc(t('words.delete.title'))}">&times;</button>
            <div class="word-card__head">
                <span class="word-card__kanji">${esc(wordData.kanji)}</span>
                ${wordData.kana ? `<span class="word-card__kana">${esc(wordData.kana)}</span>` : ''}
                ${clipBadgeHtml(wordData)}
            </div>
            ${wordData.translation ? `<div class="word-card__meaning">${esc(wordData.translation)}</div>` : ''}
            ${wordData.sentence ? `<div class="word-card__sentence">${esc(wordData.sentence)}${
                wordData.sentenceTranslation ? `<span class="word-card__sentence-tr">${esc(wordData.sentenceTranslation)}</span>` : ''
            }</div>` : ''}
            ${wordData.hint ? `<div class="word-card__tag">${esc(wordData.hint)}</div>` : ''}
            <div class="word-card__actions">
                <button class="btn btn--ghost edit-btn">${t('words.edit')}</button>
            </div>
        </div>
    `;

    if (selectMode) {
        // В режиме выбора карточка целиком — переключатель отметки.
        const card = wordEl.querySelector('.word-card');
        card.insertAdjacentHTML('afterbegin',
            `<span class="word-check${selected.has(wordData.id) ? ' is-on' : ''}">✓</span>`);
        card.addEventListener('click', () => toggleSelected(wordData.id));
        return wordEl;
    }

    wordEl.querySelector('.word-card__delete').addEventListener('click', () => removeWord(wordData));
    wordEl.querySelector('.edit-btn').addEventListener('click', () => {
        AnimeiWordEdit.open(wordData, renderWords);
    });

    // Мини-чипы колод + кнопка «в колоды» на карточке.
    if (window.DecksUI) DecksUI.decorateCard(wordEl, wordData);
    return wordEl;
}

// Компактная строка списка: слово + чтение, перевод, значки, «⋯» и «×».
function buildRow(wordData) {
    const row = document.createElement('div');
    row.className = 'word-row' + (selected.has(wordData.id) ? ' is-selected' : '');

    const deckEmojis = window.Decks
        ? Decks.decksOf(wordData.id).map((d) => `<span title="${esc(d.name)}">${d.emoji}</span>`).join('')
        : '';

    row.innerHTML = `
        ${selectMode ? `<span class="word-check${selected.has(wordData.id) ? ' is-on' : ''}">✓</span>` : ''}
        <div class="word-row__jp">
            <span class="word-row__kanji">${esc(wordData.kanji)}</span>
            ${wordData.kana ? `<span class="word-row__kana">${esc(wordData.kana)}</span>` : ''}
        </div>
        <div class="word-row__tr">${esc(wordData.translation || '')}</div>
        <div class="word-row__badges">${clipBadgeHtml(wordData)}${deckEmojis}</div>
        ${selectMode ? '' : `
            <button class="word-row__more" title="${esc(t('decks.add'))}" aria-label="${esc(t('decks.add'))}">⋯</button>
            <button class="word-row__x" title="${esc(t('words.delete.title'))}" aria-label="${esc(t('words.delete.title'))}">×</button>`}
    `;

    if (selectMode) {
        row.addEventListener('click', () => toggleSelected(wordData.id));
        return row;
    }

    // Клик по строке — редактирование (там же полный текст примера и клип).
    row.addEventListener('click', (e) => {
        if (e.target.closest('.word-row__more, .word-row__x')) return;
        AnimeiWordEdit.open(wordData, renderWords);
    });
    row.querySelector('.word-row__more').addEventListener('click', () => {
        if (window.DecksUI) DecksUI.openSheet(wordData);
    });
    row.querySelector('.word-row__x').addEventListener('click', () => removeWord(wordData));
    return row;
}

function renderWords() {
    const wordsListEl = document.querySelector('.words-list');
    updateCount(allWords.length);
    updateKnownMenuLabel();

    if (allWords.length === 0) {
        // Пустая коллекция — сразу зовём туда, где слова добавляются
        wordsListEl.className = 'words-list';
        wordsListEl.innerHTML = `
            <div class="words-empty">
                <p style="color: var(--text-muted)">${t('words.empty')}</p>
                <a class="btn btn--success" href="./catalog.html">${t('words.openCatalog')}</a>
            </div>`;
        renderBulkBar([]);
        return;
    }

    // Фильтр по активной колоде (если выбрана) поверх текстового поиска.
    const deckActive = window.DecksUI ? DecksUI.activeDeckId() : null;
    const words = sortWords(allWords
        .filter(matchesFilter)
        .filter((w) => (window.DecksUI ? DecksUI.visible(w) : true)));

    wordsListEl.className = 'words-list'
        + (viewMode === 'list' ? ' words-list--rows' : '')
        + (selectMode ? ' is-selecting' : '');
    wordsListEl.innerHTML = '';

    if (words.length === 0) {
        // Пустая колода — своя формулировка, а не «ничего не нашлось».
        const msg = (deckActive && !wordsFilter) ? t('decks.empty') : t('words.nothingFound');
        wordsListEl.innerHTML = `<p class="words-nothing">${msg}</p>`;
        if (window.DecksUI) DecksUI.refresh();
        renderBulkBar(words);
        return;
    }

    for (const wordData of words) {
        wordsListEl.appendChild(viewMode === 'list' ? buildRow(wordData) : buildCard(wordData));
    }

    // Обновляем чипы/счётчики колод под текущую коллекцию.
    if (window.DecksUI) DecksUI.refresh();
    renderBulkBar(words);

    // Есть слова с ещё не готовым клипом — тихо перепроверим их чуть позже.
    if (words.some((w) => clipBadge(w) === 'pending')) scheduleClipRefresh();
}

// ---------- Режим выбора и массовые действия ----------

function enterSelect() {
    selectMode = true;
    selected.clear();
    renderWords();
}

function exitSelect() {
    selectMode = false;
    selected.clear();
    renderWords();
}

// Панель действий внизу: «В колоду», «Из колоды» (при активной колоде),
// «Удалить», «Все», «Готово». visibleWords — что сейчас на экране (для «Все»).
function renderBulkBar(visibleWords) {
    let bar = document.getElementById('words-bulkbar');
    const selectBtn = document.getElementById('select-btn');
    if (selectBtn) selectBtn.classList.toggle('is-active', selectMode);

    if (!selectMode) {
        if (bar) bar.remove();
        return;
    }
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'words-bulkbar';
        bar.className = 'words-bulkbar';
        document.body.appendChild(bar);
    }

    const n = selected.size;
    const deckActive = window.DecksUI ? DecksUI.activeDeckId() : null;
    bar.innerHTML = `
        <span class="words-bulkbar__count">${esc(t('words.selectedN').replace('{n}', n))}</span>
        <button class="btn btn--ghost" id="bulk-all">${esc(t('words.selectAll'))}</button>
        <button class="btn btn--success" id="bulk-deck" ${n ? '' : 'disabled'}>${esc(t('words.toDeck'))}</button>
        ${deckActive ? `<button class="btn btn--ghost" id="bulk-undeck" ${n ? '' : 'disabled'}>${esc(t('words.fromDeck'))}</button>` : ''}
        <button class="btn btn--ghost words-bulkbar__danger" id="bulk-delete" ${n ? '' : 'disabled'}>${esc(t('words.bulkDelete'))}</button>
        <button class="words-bulkbar__x" id="bulk-cancel" title="${esc(t('words.cancel'))}">×</button>
    `;

    bar.querySelector('#bulk-cancel').addEventListener('click', exitSelect);
    bar.querySelector('#bulk-all').addEventListener('click', () => {
        // «Все» — все видимые (с учётом поиска/колоды); повторный клик снимает.
        const ids = visibleWords.map((w) => w.id);
        const allOn = ids.length && ids.every((id) => selected.has(id));
        for (const id of ids) { if (allOn) selected.delete(id); else selected.add(id); }
        renderWords();
    });
    bar.querySelector('#bulk-deck').addEventListener('click', () => {
        if (!selected.size || !window.DecksUI) return;
        DecksUI.openBulkSheet([...selected], () => { exitSelect(); });
    });
    bar.querySelector('#bulk-undeck')?.addEventListener('click', () => {
        if (!selected.size || !window.Decks) return;
        const removed = Decks.removeMany(deckActive, [...selected]);
        showSnackbar(t('words.removedFromDeckN').replace('{n}', removed), { duration: 2500 });
        exitSelect();
    });
    bar.querySelector('#bulk-delete').addEventListener('click', async () => {
        const count = selected.size;
        if (!count) return;
        if (!confirm(t('words.bulkDeleteConfirm').replace('{n}', count))) return;
        const gone = [];
        for (const id of [...selected]) {
            try {
                await deleteWord(id);
                if (window.Decks) Decks.forgetWord(id);
                gone.push(id);
            } catch (err) { console.error('Не удалось удалить слово', id, err); }
        }
        const goneSet = new Set(gone);
        allWords = allWords.filter((w) => !goneSet.has(w.id));
        showSnackbar(t('words.bulkDeleted').replace('{n}', gone.length), { duration: 3000 });
        exitSelect();
    });
}

// ---------- Меню «⋯» ----------

function updateKnownMenuLabel() {
    const el = document.getElementById('known-count');
    if (!el || !window.KnownWords) return;
    const n = KnownWords.count();
    el.textContent = n ? String(n) : '';
    el.hidden = !n;
}

function initMenu() {
    const btn = document.getElementById('words-menu-btn');
    const menu = document.getElementById('words-menu');
    if (!btn || !menu) return;

    const closeMenu = () => { menu.hidden = true; };
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', (e) => {
        if (!menu.hidden && !menu.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    menu.addEventListener('click', () => closeMenu());
}

// ---------- Известные слова: импорт и просмотр ----------

// Общий каркас модалки в стиле редактора колод (оверлей + коробка).
function openModal(buildBody) {
    const overlay = document.createElement('div');
    overlay.className = 'deck-sheet__overlay';
    const box = document.createElement('div');
    box.className = 'deck-editor known-modal';
    const close = () => {
        overlay.classList.remove('is-open');
        document.removeEventListener('keydown', onEsc);
        setTimeout(() => overlay.remove(), 180);
    };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onEsc);
    buildBody(box, close);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
}

function openKnownImport() {
    if (!window.KnownWords) return;
    openModal((box, close) => {
        box.innerHTML = `
            <div class="deck-editor__title">${esc(t('known.import'))}</div>
            <p class="known-modal__hint">${esc(t('known.hint'))}</p>
            <textarea class="known-modal__paste" rows="6" placeholder="${esc(t('known.paste'))}"></textarea>
            <div class="known-modal__filerow">
                <button class="btn btn--ghost" id="known-file-btn">${esc(t('known.file'))}</button>
                <span class="known-modal__recognized" id="known-recognized"></span>
            </div>
            <div class="deck-editor__actions">
                <button class="btn btn--ghost" id="known-cancel">${esc(t('words.cancel'))}</button>
                <button class="btn btn--success" id="known-do" disabled>${esc(t('known.importDo'))}</button>
            </div>
        `;
        const ta = box.querySelector('.known-modal__paste');
        const recognizedEl = box.querySelector('#known-recognized');
        const doBtn = box.querySelector('#known-do');
        let parsed = [];

        const reparse = () => {
            parsed = KnownWords.parseImport(ta.value);
            recognizedEl.textContent = parsed.length
                ? t('known.recognized').replace('{n}', parsed.length) : '';
            doBtn.disabled = parsed.length === 0;
        };
        ta.addEventListener('input', reparse);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,.csv,.tsv,text/plain';
        fileInput.hidden = true;
        box.appendChild(fileInput);
        box.querySelector('#known-file-btn').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            const f = fileInput.files && fileInput.files[0];
            if (!f) return;
            ta.value = await f.text();
            reparse();
        });

        box.querySelector('#known-cancel').addEventListener('click', close);
        doBtn.addEventListener('click', () => {
            const added = KnownWords.addMany(parsed);
            showSnackbar(
                added ? t('known.imported').replace('{n}', added) : t('known.nothingNew'),
                { duration: 3500 },
            );
            updateKnownMenuLabel();
            close();
        });
    });
}

function openKnownManager() {
    if (!window.KnownWords) return;
    openModal((box, close) => {
        box.innerHTML = `
            <div class="deck-editor__title">${esc(t('known.title'))} <span class="dictionary__count" id="known-total"></span></div>
            <p class="known-modal__hint" id="known-none" hidden>${esc(t('known.none'))}</p>
            <input class="deck-editor__input" id="known-filter" type="text" placeholder="${esc(t('words.filter'))}">
            <div class="known-modal__list" id="known-list"></div>
            <div class="deck-editor__actions">
                <button class="btn btn--ghost words-bulkbar__danger" id="known-clear">${esc(t('known.clear'))}</button>
                <button class="btn btn--ghost" id="known-close">${esc(t('words.close'))}</button>
            </div>
        `;
        const listEl = box.querySelector('#known-list');
        const filterEl = box.querySelector('#known-filter');
        const totalEl = box.querySelector('#known-total');
        const noneEl = box.querySelector('#known-none');
        const clearBtn = box.querySelector('#known-clear');
        const SHOW_MAX = 300;   // список может быть на тысячи слов — не рисуем всё

        const renderList = () => {
            const all = KnownWords.all();
            totalEl.textContent = all.length;
            const q = filterEl.value.trim();
            const matched = q ? all.filter((w) => w.includes(q)) : all;
            listEl.innerHTML = '';
            for (const w of matched.slice(0, SHOW_MAX)) {
                const chip = document.createElement('span');
                chip.className = 'known-chip';
                chip.innerHTML = `${esc(w)}<button class="known-chip__x" aria-label="${esc(t('words.delete.title'))}">×</button>`;
                chip.querySelector('.known-chip__x').addEventListener('click', () => {
                    KnownWords.remove(w);
                    updateKnownMenuLabel();
                    renderList();
                });
                listEl.appendChild(chip);
            }
            if (matched.length > SHOW_MAX) {
                const more = document.createElement('span');
                more.className = 'known-modal__more';
                more.textContent = t('known.more').replace('{n}', matched.length - SHOW_MAX);
                listEl.appendChild(more);
            }
            const empty = all.length === 0;
            noneEl.hidden = !empty;
            filterEl.hidden = empty;
            clearBtn.hidden = empty;
        };

        filterEl.addEventListener('input', renderList);
        clearBtn.addEventListener('click', () => {
            if (!confirm(t('known.clearConfirm').replace('{n}', KnownWords.count()))) return;
            KnownWords.clear();
            updateKnownMenuLabel();
            showSnackbar(t('known.cleared'), { duration: 2500 });
            renderList();
        });
        box.querySelector('#known-close').addEventListener('click', close);
        renderList();
    });
}

// ---------- Экспорт в Anki (.apkg) ----------
// Полноценная колода: карточки с теми же полями, что у нас, но вместо видео —
// аудио, которое сервер вырезает из клипа по окну trimStart..trimEnd. Гостевые
// клипы и локальный звук карточек лежат в браузере (IndexedDB) — прикладываем
// их к запросу файлами "<id>.clip.mp4" / "<id>.custom.<ext>".

function audioBlobExt(blob) {
    const t = String(blob?.type || '').toLowerCase();
    if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
    if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
    if (t.includes('ogg')) return 'ogg';
    if (t.includes('wav')) return 'wav';
    return 'webm';
}

async function exportAnki() {
    const btn = document.getElementById('export-anki-btn');
    const words = await fetchWords();
    if (!words.length) {
        showSnackbar(t('words.empty'), { duration: 3000 });
        return;
    }

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = t('words.exportAnki.busy');
    try {
        const fd = new FormData();
        const payload = [];
        for (const w of words) {
            payload.push({
                id: w.id, kanji: w.kanji, kana: w.kana, romaji: w.romaji,
                translation: w.translation, sentence: w.sentence,
                sentenceTranslation: w.sentenceTranslation, hint: w.hint,
                trimStart: w.trimStart, trimEnd: w.trimEnd,
                clipUrl: videoSrcOf(w) || '',
                audioUrl: typeof w.audio === 'string' ? w.audio : '',
            });
            // Клип гостя лежит только в браузере — шлём файлом.
            if (!videoSrcOf(w) && typeof getClip === 'function') {
                const clip = await getClip(w.id);
                if (clip) fd.append('media', clip, `${w.id}.clip.mp4`);
            }
            // Локальный звук карточки (не переносился на сервер) — тоже файлом.
            if (!w.audio && typeof getAudio === 'function') {
                const au = await getAudio(w.id);
                if (au) fd.append('media', au, `${w.id}.custom.${audioBlobExt(au)}`);
            }
        }
        fd.append('words', JSON.stringify(payload));

        // Сервер режет ffmpeg-ом аудио на каждое слово — большим коллекциям
        // нужно время, поэтому таймаут щедрый.
        const { data } = await client.post('words/export/anki', fd, {
            responseType: 'blob', timeout: 300000,
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(data);
        a.download = 'animei.apkg';
        a.click();
        URL.revokeObjectURL(a.href);
        showSnackbar(t('words.exportAnki.done'), { duration: 4000 });
    } catch (err) {
        console.error('Anki export failed:', err);
        showSnackbar(t('words.exportAnki.fail'), { duration: 4000 });
    } finally {
        btn.disabled = false;
        btn.textContent = oldText;
    }
}

// ---------- Экспорт (текст) ----------
// Формат — простой текст с табуляцией: слово, чтение, значение, предложение,
// перевод предложения. Резервная копия; Anki такой файл тоже принимает.

async function exportWords() {
    const words = await fetchWords();
    if (!words.length) {
        showSnackbar(t('words.empty'), { duration: 3000 });
        return;
    }

    const clean = (s) => String(s ?? '').replace(/[\t\n]+/g, ' ').trim();
    const lines = words.map(w => [
        clean(w.kanji), clean(w.kana), clean(w.translation),
        clean(w.sentence), clean(w.sentenceTranslation),
    ].join('\t'));

    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'animei-words.txt';
    a.click();
    URL.revokeObjectURL(a.href);
}

// ---------- Переключатели тулбара ----------

function applyViewToggle() {
    const btn = document.getElementById('view-toggle');
    if (!btn) return;
    // Иконка показывает, КУДА переключимся (сейчас список → покажем сетку).
    const toCards = viewMode === 'list';
    btn.title = t(toCards ? 'words.view.cards' : 'words.view.list');
    btn.innerHTML = toCards
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="0.5"/><circle cx="4" cy="12" r="0.5"/><circle cx="4" cy="18" r="0.5"/></svg>';
}

window.addEventListener('DOMContentLoaded', () => {
    // Слой колод (необязательный): чип-фильтр, кнопка «Учить», меню карточек.
    if (window.DecksUI) {
        DecksUI.init({
            chips: document.getElementById('deck-chips'),
            study: document.getElementById('deck-study'),
            hint: document.getElementById('deck-hint'),
            getWords: () => allWords,
            onChange: () => renderWords(),
        });
    }

    loadWords();

    const filterInput = document.getElementById('words-filter');
    filterInput?.addEventListener('input', () => {
        wordsFilter = filterInput.value.trim().toLowerCase();
        renderWords();
    });

    const sortSel = document.getElementById('words-sort');
    if (sortSel) {
        sortSel.value = sortMode;
        sortSel.addEventListener('change', () => {
            sortMode = sortSel.value;
            localStorage.setItem(SORT_KEY, sortMode);
            renderWords();
        });
    }

    const viewBtn = document.getElementById('view-toggle');
    applyViewToggle();
    viewBtn?.addEventListener('click', () => {
        viewMode = viewMode === 'list' ? 'cards' : 'list';
        localStorage.setItem(VIEW_KEY, viewMode);
        applyViewToggle();
        renderWords();
    });

    document.getElementById('select-btn')?.addEventListener('click', () => {
        if (selectMode) exitSelect();
        else enterSelect();
    });

    initMenu();
    document.getElementById('export-btn')?.addEventListener('click', exportWords);
    document.getElementById('export-anki-btn')?.addEventListener('click', exportAnki);
    document.getElementById('import-known-btn')?.addEventListener('click', openKnownImport);
    document.getElementById('known-btn')?.addEventListener('click', openKnownManager);
    updateKnownMenuLabel();
});
