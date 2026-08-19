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

// Удаление одного слова — всегда с подтверждением (раньше «×» удалял мгновенно).
function confirmRemove(wordData) {
    const name = wordData.kanji || wordData.kana || '';
    if (!confirm(t('words.deleteConfirmOne').replace('{w}', name))) return;
    removeWord(wordData);
}

// Открыть карточку слова: правка полей + «В колоды» и «Удалить» в самой модалке
// (на телефоне у строк списка нет своих кнопок — всё здесь).
function openWord(wordData) {
    AnimeiWordEdit.open(wordData, renderWords, {
        onDelete: () => confirmRemove(wordData),
        onDecks: window.DecksUI ? () => DecksUI.openSheet(wordData) : null,
    });
}

function toggleSelected(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    renderWords();
}

// ---------- Меню действий слова («⋯») ----------

// Текст для копирования: «слово（чтение） — перевод» + пример с переводом.
async function copyWordText(w) {
    const head = `${w.kanji || ''}${w.kana ? `（${w.kana}）` : ''}${w.translation ? ` — ${w.translation}` : ''}`;
    const lines = [head];
    if (w.sentence) lines.push(w.sentence);
    if (w.sentenceTranslation) lines.push(w.sentenceTranslation);
    const text = lines.join('\n');
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // Старый запасной путь: скрытая textarea + execCommand.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
    showSnackbar(t('words.copied'), { duration: 2000 });
}

// Всплывающее меню у «⋯» слова: Изменить / В колоды / Скопировать / Удалить.
// Живёт в body (список обрезал бы его overflow'ом), позиционируется у кнопки.
let wordActionsEl = null;
let wordActionsCleanup = null;

function closeWordActions() {
    if (wordActionsCleanup) wordActionsCleanup();
    wordActionsCleanup = null;
    if (wordActionsEl) wordActionsEl.remove();
    wordActionsEl = null;
}

function openWordActions(anchor, wordData) {
    closeWordActions();
    const menu = document.createElement('div');
    menu.className = 'words-menu word-actions';
    menu.innerHTML = `
        <button data-act="edit">${esc(t('words.edit'))}</button>
        <button data-act="decks">${esc(t('decks.add'))}</button>
        <button data-act="copy">${esc(t('words.copy'))}</button>
        <hr class="words-menu__hr">
        <button data-act="del" class="word-actions__danger">${esc(t('words.bulkDelete'))}</button>
    `;
    document.body.appendChild(menu);
    wordActionsEl = menu;

    // Правым краем к кнопке, вниз; если не влезает — вверх и в пределах экрана.
    const r = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.right = 'auto';
    let left = Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8));
    let top = r.bottom + 6;
    if (top + menu.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - menu.offsetHeight - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    menu.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        closeWordActions();
        if (act === 'edit') openWord(wordData);
        else if (act === 'decks' && window.DecksUI) DecksUI.openSheet(wordData);
        else if (act === 'copy') copyWordText(wordData);
        else if (act === 'del') confirmRemove(wordData);
    });

    const onDoc = (e) => { if (!menu.contains(e.target)) closeWordActions(); };
    const onEsc = (e) => { if (e.key === 'Escape') closeWordActions(); };
    const onAway = () => closeWordActions();
    // click дойдёт до document уже после открытия — вешаемся асинхронно.
    setTimeout(() => {
        document.addEventListener('click', onDoc);
        document.addEventListener('keydown', onEsc);
        document.addEventListener('scroll', onAway, true);
        window.addEventListener('resize', onAway);
    }, 0);
    wordActionsCleanup = () => {
        document.removeEventListener('click', onDoc);
        document.removeEventListener('keydown', onEsc);
        document.removeEventListener('scroll', onAway, true);
        window.removeEventListener('resize', onAway);
    };
}

// ---------- Отрисовка ----------

// Карточка (подробный вид): тап — открыть слово, «⋯» в углу — меню действий.
function buildCard(wordData) {
    const wordEl = document.createElement('div');
    wordEl.innerHTML = `
        <div class="word-card word-read-content${selected.has(wordData.id) ? ' is-selected' : ''}">
            <button class="word-card__menu" title="${esc(t('words.actions'))}" aria-label="${esc(t('words.actions'))}">⋯</button>
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
        </div>
    `;

    const card = wordEl.querySelector('.word-card');
    if (selectMode) {
        // В режиме выбора карточка целиком — переключатель отметки.
        card.insertAdjacentHTML('afterbegin',
            `<span class="word-check${selected.has(wordData.id) ? ' is-on' : ''}">✓</span>`);
        card.addEventListener('click', () => toggleSelected(wordData.id));
        return wordEl;
    }

    card.addEventListener('click', (e) => {
        if (e.target.closest('.word-card__menu')) return;
        openWord(wordData);
    });
    card.querySelector('.word-card__menu').addEventListener('click', (e) => {
        e.stopPropagation();
        openWordActions(e.currentTarget, wordData);
    });
    attachLongPress(card, wordData);

    // Мини-чипы колод внизу карточки.
    if (window.DecksUI) DecksUI.decorateCard(wordEl, wordData);
    return wordEl;
}

// Компактная строка списка: одна линия «слово · чтение … перевод · значки».
// Кнопки «⋯»/«×» есть только на устройствах с курсором и видны по hover;
// на телефоне действия живут в карточке слова (тап) и режиме выбора (лонг-тап).
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
        ${selectMode ? '' : `<span class="word-row__hover">
            <button class="word-row__more" title="${esc(t('words.actions'))}" aria-label="${esc(t('words.actions'))}">⋯</button>
        </span>`}
    `;

    if (selectMode) {
        row.addEventListener('click', () => toggleSelected(wordData.id));
        return row;
    }

    // Клик по строке — карточка слова (полный пример, клип, колоды, удаление).
    row.addEventListener('click', (e) => {
        if (e.target.closest('.word-row__hover')) return;
        openWord(wordData);
    });
    row.querySelector('.word-row__more').addEventListener('click', (e) => {
        e.stopPropagation();
        openWordActions(e.currentTarget, wordData);
    });
    attachLongPress(row, wordData);
    return row;
}

// Долгое нажатие по строке (телефон) — вход в режим выбора с этой строкой.
// После срабатывания список перерисовывается, поэтому «хвостовой» click гасим
// глобальным флагом (capture на document — см. initLongPressGuard).
let suppressNextClick = false;

function initLongPressGuard() {
    document.addEventListener('click', (e) => {
        if (!suppressNextClick) return;
        suppressNextClick = false;
        e.stopPropagation();
        e.preventDefault();
    }, true);
}

function attachLongPress(row, wordData) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    const cancel = () => { clearTimeout(timer); timer = null; };
    row.addEventListener('pointerdown', (e) => {
        if (selectMode || e.button) return;
        startX = e.clientX; startY = e.clientY;
        timer = setTimeout(() => {
            timer = null;
            suppressNextClick = true;
            if (navigator.vibrate) navigator.vibrate(15);
            enterSelect();
            toggleSelected(wordData.id);
        }, 450);
    });
    row.addEventListener('pointermove', (e) => {
        // Палец поехал (скролл) — это не лонг-тап.
        if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) cancel();
    });
    row.addEventListener('pointerup', cancel);
    row.addEventListener('pointercancel', cancel);
    // Системное меню по долгому тапу мешает нашему выбору.
    row.addEventListener('contextmenu', (e) => e.preventDefault());
}

function renderWords() {
    closeWordActions();   // меню могло висеть у строки, которой больше нет
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
        const msg = (deckActive && !wordsFilter)
            ? t(deckActive === '__none__' ? 'decks.noneEmpty' : 'decks.empty')
            : t('words.nothingFound');
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
    // «Из колоды» имеет смысл только для настоящей колоды (не для «Без колоды»).
    const active = window.DecksUI ? DecksUI.activeDeckId() : null;
    const deckActive = (active && window.Decks && Decks.get(active)) ? active : null;
    bar.innerHTML = `
        <span class="words-bulkbar__count">${n}</span>
        <button class="words-bulkbar__btn" id="bulk-all">${esc(t('words.selectAll'))}</button>
        <button class="words-bulkbar__btn words-bulkbar__btn--primary" id="bulk-deck" ${n ? '' : 'disabled'}>${esc(t('words.toDeck'))}</button>
        ${deckActive ? `<button class="words-bulkbar__btn" id="bulk-undeck" ${n ? '' : 'disabled'}>${esc(t('words.fromDeck'))}</button>` : ''}
        <button class="words-bulkbar__btn words-bulkbar__danger" id="bulk-delete" ${n ? '' : 'disabled'}>${esc(t('words.bulkDelete'))}</button>
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

// Пункты-переключатели в меню «⋯»: сортировка и вид (список/карточки).
// Низкочастотные настройки — им не место в тулбаре.
function renderMenuChoices() {
    const sortBox = document.getElementById('menu-sort');
    const viewBox = document.getElementById('menu-view');
    if (!sortBox || !viewBox) return;

    const item = (label, on, fn) => {
        const b = document.createElement('button');
        b.className = 'words-menu__item' + (on ? ' is-on' : '');
        b.innerHTML = `<span class="words-menu__tick">${on ? '✓' : ''}</span>${esc(label)}`;
        b.addEventListener('click', fn);
        return b;
    };

    sortBox.innerHTML = '';
    for (const [v, k] of [['new', 'words.sort.new'], ['old', 'words.sort.old'], ['az', 'words.sort.az']]) {
        sortBox.appendChild(item(t(k), sortMode === v, () => {
            sortMode = v;
            localStorage.setItem(SORT_KEY, v);
            renderMenuChoices();
            renderWords();
        }));
    }
    viewBox.innerHTML = '';
    for (const [v, k] of [['list', 'words.view.list'], ['cards', 'words.view.cards']]) {
        viewBox.appendChild(item(t(k), viewMode === v, () => {
            viewMode = v;
            localStorage.setItem(VIEW_KEY, v);
            renderMenuChoices();
            renderWords();
        }));
    }
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
            <label class="known-modal__learned" id="known-learned-row" hidden>
                <input type="checkbox" id="known-learned" checked>
                <span id="known-learned-label"></span>
            </label>
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
        const learnedRow = box.querySelector('#known-learned-row');
        const learnedCb = box.querySelector('#known-learned');
        let parsed = [];

        const reparse = () => {
            parsed = KnownWords.parseImport(ta.value);
            recognizedEl.textContent = parsed.length
                ? t('known.recognized').replace('{n}', parsed.length) : '';
            doBtn.disabled = parsed.length === 0;
        };
        ta.addEventListener('input', reparse);

        // ---- Колода .apkg: заметки с пометкой «изучено» от сервера ----
        // Извлечённые слова кладём в textarea (по одному в строке) — их видно
        // и можно поправить руками; галка переключает «изученные/все».
        // Поля заметки разделены \x1f — заменяем на таб, дальше parseImport.
        const notesToWords = (notes) => KnownWords.parseImport(
            notes.map((n) => String(n.flds || '').replace(/\x1f/g, '\t')).join('\n'));
        let apkgNotes = null;

        const applyApkg = () => {
            if (!apkgNotes) return;
            const chosen = learnedCb.checked ? apkgNotes.filter((n) => n.learned) : apkgNotes;
            ta.value = notesToWords(chosen).join('\n');
            reparse();
        };
        learnedCb.addEventListener('change', applyApkg);

        const handleApkg = async (f) => {
            recognizedEl.textContent = t('known.apkgReading');
            doBtn.disabled = true;
            try {
                apkgNotes = await KnownWords.readApkg(f);
                const learnedN = notesToWords(apkgNotes.filter((n) => n.learned)).length;
                const allN = notesToWords(apkgNotes).length;
                box.querySelector('#known-learned-label').textContent =
                    t('known.apkgLearnedOnly').replace('{k}', learnedN).replace('{n}', allN);
                learnedRow.hidden = false;
                // Всё «новое», ни одной изученной — сразу показываем все слова.
                if (!learnedN) learnedCb.checked = false;
                applyApkg();
            } catch (err) {
                console.error('apkg import failed:', err);
                apkgNotes = null;
                learnedRow.hidden = true;
                recognizedEl.textContent = '';
                showSnackbar(
                    String(err && err.message) === 'modern' ? t('known.apkgModern') : t('known.apkgFail'),
                    { duration: 6000, type: 'error' },
                );
            }
        };

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,.csv,.tsv,.apkg,.colpkg,text/plain';
        fileInput.hidden = true;
        box.appendChild(fileInput);
        box.querySelector('#known-file-btn').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            const f = fileInput.files && fileInput.files[0];
            if (!f) return;
            if (/\.(apkg|colpkg)$/i.test(f.name)) { handleApkg(f); return; }
            apkgNotes = null;
            learnedRow.hidden = true;
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
    // На узком экране длинный плейсхолдер обрезается посреди слова.
    if (filterInput && window.matchMedia('(max-width: 560px)').matches) {
        filterInput.placeholder = t('words.filterShort');
        // Чтобы смена языка тоже подставляла короткий вариант.
        filterInput.setAttribute('data-i18n-placeholder', 'words.filterShort');
    }
    filterInput?.addEventListener('input', () => {
        wordsFilter = filterInput.value.trim().toLowerCase();
        renderWords();
    });

    document.getElementById('select-btn')?.addEventListener('click', () => {
        if (selectMode) exitSelect();
        else enterSelect();
    });

    initLongPressGuard();
    initMenu();
    renderMenuChoices();
    document.getElementById('export-btn')?.addEventListener('click', exportWords);
    document.getElementById('export-anki-btn')?.addEventListener('click', exportAnki);
    document.getElementById('import-known-btn')?.addEventListener('click', openKnownImport);
    document.getElementById('known-btn')?.addEventListener('click', openKnownManager);
    updateKnownMenuLabel();
});
