// Страница «Мои слова»: компактный список / карточки, сортировка, режим
// выбора (массово в колоду / из колоды / удалить), экспорт в меню «⋯» и
// импорт «известных слов» из Anki/списков (known-store.js).

// Экранируем пользовательский текст — он идёт и в разметку, и в атрибуты value.
// Экранирование — единое escHtml из app.js (вызов отложен: порядок загрузки).
function esc(s) {
    return escHtml(s ?? '');
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
// перечитываем список, чтобы значок ⏳ сам исчез, когда клип появится.
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

// Заглушка списка на время загрузки. Раньше здесь стояла одна строка
// «Загрузка…»: список приезжал совсем другой высоты и весь экран прыгал.
// Саму заглушку рисует инлайн-скрипт в words.html — ещё при разборе страницы,
// до первого кадра (см. window.animeiWordsSkeleton). Здесь — только страховка
// на случай, если тот скрипт почему-то не отработал.
function renderWordsSkeleton() {
    const el = document.querySelector('.words-list');
    if (!el || el.querySelector('.is-skel')) return;
    if (typeof window.animeiWordsSkeleton === 'function') window.animeiWordsSkeleton();
}

async function loadWords() {
    renderWordsSkeleton();

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

// Состояние клипа: ready — есть готовое видео (или клип гостя в браузере),
// pending — видео ещё режется на сервере (Video есть, url пуст), none — нет.
// Значок показываем только для pending: клип есть почти у каждого слова,
// поэтому «есть видео» ничего не сообщает.
function clipBadge(w) {
    if (videoSrcOf(w)) return 'ready';
    const expected = Number(w.videoEnd) > Number(w.videoStart);
    const isGuest = typeof w.id === 'string' && w.id.startsWith('local-');
    if (isGuest && expected) return 'ready';          // клип гостя лежит в IndexedDB
    if (w.Video && expected) return 'pending';        // сервер ещё готовит клип
    return 'none';
}

function clipBadgeHtml(w) {
    if (clipBadge(w) !== 'pending') return '';
    return `<span class="word-card__clip word-card__clip--pending" title="${esc(t('words.videoPreparing'))}">⏳</span>`;
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
let wordActionsLayer = null;

// Спрятать меню. history не трогаем — этим занимается AnimeiBack.
function hideWordActions() {
    wordActionsLayer = null;
    if (wordActionsCleanup) wordActionsCleanup();
    wordActionsCleanup = null;
    if (wordActionsEl) wordActionsEl.remove();
    wordActionsEl = null;
}

function closeWordActions() {
    if (wordActionsLayer) AnimeiBack.close(wordActionsLayer);
    else hideWordActions();
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
    // «Назад» на телефоне закрывает меню, а не уводит со страницы.
    wordActionsLayer = AnimeiBack.open(hideWordActions);
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

    // Значки: ⏳ готовящегося клипа + эмодзи колод. Повторы одного эмодзи
    // (две колоды с одним значком) сливаем в один, подсказки объединяем.
    const badges = [];
    if (clipBadge(wordData) === 'pending') badges.push({ emoji: '⏳', title: t('words.videoPreparing'), cls: 'word-card__clip word-card__clip--pending' });
    if (window.Decks) {
        for (const d of Decks.decksOf(wordData.id)) {
            const dup = badges.find((b) => b.emoji === d.emoji);
            if (dup) dup.title += `, ${d.name}`;
            else badges.push({ emoji: d.emoji, title: d.name, cls: '' });
        }
    }
    const badgesHtml = badges
        .map((b) => `<span${b.cls ? ` class="${b.cls}"` : ''} title="${esc(b.title)}">${b.emoji}</span>`)
        .join('');

    row.innerHTML = `
        ${selectMode ? `<span class="word-check${selected.has(wordData.id) ? ' is-on' : ''}">✓</span>` : ''}
        <div class="word-row__jp">
            <span class="word-row__kanji">${esc(wordData.kanji)}</span>
            ${wordData.kana ? `<span class="word-row__kana">${esc(wordData.kana)}</span>` : ''}
        </div>
        <div class="word-row__tr">${esc(wordData.translation || '')}</div>
        <div class="word-row__badges">${badgesHtml}</div>
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
        wordsListEl.className = 'words-list'
            + (wordsListEl.querySelector('.is-skel') ? ' anim-fade' : '');
        wordsListEl.innerHTML = `
            <div class="words-empty">
                <p style="color: var(--text-muted)">${t('words.empty')}</p>
                <a class="btn btn--primary" href="./catalog.html">${t('words.openCatalog')}</a>
            </div>`;
        renderBulkBar([]);
        return;
    }

    // Фильтр по активной колоде (если выбрана) поверх текстового поиска.
    const deckActive = window.DecksUI ? DecksUI.activeDeckId() : null;
    const words = sortWords(allWords
        .filter(matchesFilter)
        .filter((w) => (window.DecksUI ? DecksUI.visible(w) : true)));

    // Первая отрисовка приходит на место скелетона — её проявляем; повторные
    // (поиск, сортировка, фильтр по колоде) идут без анимации, иначе список
    // мигал бы на каждой набранной букве.
    const fromSkeleton = !!wordsListEl.querySelector('.is-skel');
    wordsListEl.className = 'words-list'
        + (viewMode === 'list' ? ' words-list--rows' : '')
        + (selectMode ? ' is-selecting' : '')
        + (fromSkeleton ? ' anim-fade' : '');
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

// Закрыть меню «⋯» снаружи. Пункт, который открывает модалку, ОБЯЗАН вызвать
// это сам и тут же открыть слой — в одном обработчике. Иначе меню закроется
// позже (на всплытии), и AnimeiBack.close снесёт всё, что над ним, вместе с
// новой модалкой; а закрыть меню раньше нельзя — между обработчиками браузер
// прогоняет микрозадачи, и отложенный history.go() уводит history из-под слоя.
let closeWordsMenu = () => {};

function initMenu() {
    const btn = document.getElementById('words-menu-btn');
    const menu = document.getElementById('words-menu');
    if (!btn || !menu) return;

    // «Назад» на телефоне закрывает выпадашку, а не уводит со страницы.
    let layer = null;
    const closeMenu = () => {
        if (layer) AnimeiBack.close(layer);
        else menu.hidden = true;
    };
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!menu.hidden) { closeMenu(); return; }
        menu.hidden = false;
        layer = AnimeiBack.open(() => { layer = null; menu.hidden = true; });
    });
    document.addEventListener('click', (e) => {
        if (!menu.hidden && !menu.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    menu.addEventListener('click', () => closeMenu());
    closeWordsMenu = closeMenu;
}

// ---------- Известные слова: импорт и просмотр ----------

// Общий каркас модалки в стиле редактора колод (оверлей + коробка).
function openModal(buildBody) {
    const overlay = document.createElement('div');
    overlay.className = 'deck-sheet__overlay';
    const box = document.createElement('div');
    box.className = 'deck-editor known-modal';
    const modal = modalLayer(overlay);
    buildBody(box, modal.close);
    overlay.appendChild(box);
    modal.open();
}

function openKnownImport() {
    if (!window.KnownWords) return;
    closeWordsMenu();
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
            <!-- WaniKani: по API-токену забираем выученную лексику (guru и выше). -->
            <div class="known-modal__wk">
                <input class="deck-editor__input" id="wk-token" type="password" autocomplete="off"
                       placeholder="${esc(t('known.wkToken'))}">
                <button class="btn btn--ghost" id="wk-load">${esc(t('known.wkLoad'))}</button>
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

        // ---- WaniKani: assignments (srs guru+) → subjects → characters ----
        // API отдаёт CORS для браузера; токен никуда, кроме api.wanikani.com,
        // не уходит. Слова кладём в textarea — их видно и можно править.
        const wkToken = box.querySelector('#wk-token');
        const wkBtn = box.querySelector('#wk-load');
        wkBtn.addEventListener('click', async () => {
            const token = wkToken.value.trim();
            if (!token) { wkToken.focus(); return; }
            wkBtn.disabled = true;
            const oldLabel = wkBtn.textContent;
            try {
                const headers = { Authorization: 'Bearer ' + token };
                const ids = [];
                let url = 'https://api.wanikani.com/v2/assignments'
                    + '?subject_types=vocabulary,kana_vocabulary&srs_stages=5,6,7,8,9&hidden=false';
                while (url) {
                    wkBtn.textContent = t('known.wkBusy').replace('{n}', ids.length);
                    const r = await fetch(url, { headers });
                    if (!r.ok) throw new Error('wanikani http ' + r.status);
                    const j = await r.json();
                    for (const a of j.data || []) ids.push(a.data.subject_id);
                    url = (j.pages && j.pages.next_url) || '';
                    if (ids.length > 20000) break;
                }
                const words = [];
                // ids в URL — батчами, чтобы адрес не разрастался за лимиты.
                for (let i = 0; i < ids.length; i += 300) {
                    wkBtn.textContent = t('known.wkBusy').replace('{n}', `${words.length}/${ids.length}`);
                    const r = await fetch('https://api.wanikani.com/v2/subjects?ids='
                        + ids.slice(i, i + 300).join(','), { headers });
                    if (!r.ok) throw new Error('wanikani http ' + r.status);
                    const j = await r.json();
                    for (const s of j.data || []) {
                        if (s.data && s.data.characters) words.push(s.data.characters);
                    }
                }
                apkgNotes = null;
                learnedRow.hidden = true;
                ta.value = words.join('\n');
                reparse();
            } catch (err) {
                console.error('WaniKani import failed:', err);
                showSnackbar(t('known.wkFail'), { duration: 4000, type: 'error' });
            } finally {
                wkBtn.textContent = oldLabel;
                wkBtn.disabled = false;
            }
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

// «Известные» → настоящая колода: создаём карточки (чтение и перевод тянем из
// словаря), складываем в новую колоду. Для слов, которые пользователь хочет
// всё-таки повторять, а не просто считать знакомыми.
async function knownToDeck(words, progress) {
    const lang = ['ru', 'uk'].includes(localStorage.getItem('animei:lang'))
        ? localStorage.getItem('animei:lang') : 'en';
    const ids = [];
    let i = 0;
    for (const w of words) {
        i++;
        progress(i, words.length);
        let kana = '';
        let translation = '';
        try {
            const { data: res } = await client.get('dictionary', { params: { q: w, lang } });
            const entries = (res && res.data) || [];
            const entry = entries.find((e) => e.word === w) || entries[0];
            if (entry) {
                kana = entry.reading || '';
                translation = shortTranslation(entry, 3);
            }
        } catch { /* словарь молчит — карточка будет из одного слова */ }
        try {
            const saved = await saveWord({ kanji: w, kana, translation });
            if (saved && saved.id) ids.push(saved.id);
        } catch (err) { console.error('Не удалось создать карточку', w, err); }
    }
    const deck = Decks.create(t('known.deckName'), '📚');
    Decks.addMany(deck.id, ids);
    allWords = await fetchWords();
    renderWords();
    return { deck, count: ids.length };
}

function openKnownManager() {
    if (!window.KnownWords) return;
    closeWordsMenu();
    openModal((box, close) => {
        box.innerHTML = `
            <div class="deck-editor__title">${esc(t('known.title'))} <span class="dictionary__count" id="known-total"></span></div>
            <p class="known-modal__hint" id="known-none" hidden>${esc(t('known.none'))}</p>
            <input class="deck-editor__input" id="known-filter" type="text" placeholder="${esc(t('words.filter'))}">
            <div class="known-modal__list" id="known-list"></div>
            <div class="deck-editor__actions">
                <button class="btn btn--ghost words-bulkbar__danger" id="known-clear">${esc(t('known.clear'))}</button>
                <button class="btn btn--success" id="known-deck">${esc(t('known.toDeck'))}</button>
                <button class="btn btn--ghost" id="known-close">${esc(t('words.close'))}</button>
            </div>
        `;
        const listEl = box.querySelector('#known-list');
        const filterEl = box.querySelector('#known-filter');
        const totalEl = box.querySelector('#known-total');
        const noneEl = box.querySelector('#known-none');
        const clearBtn = box.querySelector('#known-clear');
        const deckBtn = box.querySelector('#known-deck');
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
            deckBtn.hidden = empty || !window.Decks;
        };

        deckBtn.addEventListener('click', async () => {
            const all = KnownWords.all();
            const q = filterEl.value.trim();
            const matched = q ? all.filter((w) => w.includes(q)) : all;
            if (!matched.length) return;
            // Словарь опрашиваем по одному слову — большие пачки ограничиваем.
            const LIMIT = 100;
            const words = matched.slice(0, LIMIT);
            let msg = t('known.toDeckConfirm').replace('{n}', words.length);
            if (matched.length > LIMIT) msg += '\n' + t('known.toDeckLimit').replace('{n}', LIMIT);
            if (!confirm(msg)) return;

            deckBtn.disabled = true;
            clearBtn.disabled = true;
            try {
                const { deck, count } = await knownToDeck(words, (i, n) => {
                    deckBtn.textContent = `${i}/${n}…`;
                });
                showSnackbar(
                    t('known.toDeckDone').replace('{n}', count).replace('{d}', deck.name),
                    { duration: 4500, type: 'success' },
                );
                close();
            } catch (err) {
                console.error('Не удалось собрать колоду из известных:', err);
                showSnackbar(t('known.toDeckFail'), { duration: 3500, type: 'error' });
                deckBtn.textContent = t('known.toDeck');
                deckBtn.disabled = false;
                clearBtn.disabled = false;
            }
        });

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
// Полноценная колода: карточки с теми же полями, что у нас. Медиа сервер режет
// из клипа по окну trimStart..trimEnd — либо звук (лёгкая колода), либо сам
// видеофрагмент (Anki умеет видео тем же тегом [sound:...]). Гостевые клипы и
// локальный звук карточек лежат в браузере (IndexedDB) — прикладываем их к
// запросу файлами "<id>.clip.mp4" / "<id>.custom.<ext>".

// Что выгружать: все слова, конкретная наша колода или «Без колоды».
// Считаем по загруженному списку слов — так цифры совпадают с тем, что видно
// на странице (в колоде могли остаться id уже удалённых слов).
function ankiDeckOptions() {
    const decks = window.Decks ? Decks.all() : [];
    const opts = [{ id: '', label: t('words.exportAnki.deckAll'), n: allWords.length }];
    for (const d of decks) {
        opts.push({ id: d.id, label: `${d.emoji} ${d.name}`, n: allWords.filter((w) => Decks.has(d.id, w.id)).length });
    }
    const loose = window.Decks ? allWords.filter((w) => Decks.decksOf(w.id).length === 0).length : 0;
    if (decks.length && loose) opts.push({ id: '__none__', label: t('decks.noDeck'), n: loose });
    return decks.length ? opts : [];
}

// Выбор колоды и формата. Видео тяжелее в разы и собирается дольше — поэтому
// спрашиваем, а не решаем за пользователя; по умолчанию звук.
function openAnkiExport() {
    closeWordsMenu();
    openModal((box, close) => {
        const deckOpts = ankiDeckOptions();
        const active = (window.DecksUI && DecksUI.activeDeckId()) || '';
        const deckRow = deckOpts.length ? `
            <label class="anki-export__deck">
                <span>${esc(t('words.exportAnki.deck'))}</span>
                <select id="anki-deck">
                    ${deckOpts.map((o) => `<option value="${esc(o.id)}"${o.id === active ? ' selected' : ''}>${esc(o.label)} (${o.n})</option>`).join('')}
                </select>
            </label>` : '';
        box.innerHTML = `
            <div class="deck-editor__title">${esc(t('words.exportAnki'))}</div>
            ${deckRow}
            <div class="anki-export">
                <button class="anki-export__opt" id="anki-audio">
                    <span class="anki-export__name">${esc(t('words.exportAnki.audio'))}</span>
                    <span class="anki-export__hint">${esc(t('words.exportAnki.audioHint'))}</span>
                </button>
                <button class="anki-export__opt" id="anki-video">
                    <span class="anki-export__name">${esc(t('words.exportAnki.video'))}</span>
                    <span class="anki-export__hint">${esc(t('words.exportAnki.videoHint'))}</span>
                </button>
            </div>
            <p class="known-modal__hint anki-export__status" id="anki-status" hidden></p>
            <div class="deck-editor__actions deck-editor__actions--single">
                <button class="btn btn--ghost" id="anki-cancel">${esc(t('words.cancel'))}</button>
            </div>
        `;
        const statusEl = box.querySelector('#anki-status');
        const deckEl = box.querySelector('#anki-deck');
        const run = async (withVideo) => {
            const deckId = deckEl ? deckEl.value : '';
            box.querySelectorAll('button, select').forEach((b) => { b.disabled = true; });
            statusEl.hidden = false;
            statusEl.textContent = withVideo ? t('words.exportAnki.busyVideo') : t('words.exportAnki.busy');
            const ok = await exportAnki(withVideo, deckId);
            close();
            showSnackbar(ok ? t('words.exportAnki.done') : t('words.exportAnki.fail'),
                { duration: 4000, type: ok ? 'info' : 'error' });
        };
        box.querySelector('#anki-audio').addEventListener('click', () => run(false));
        box.querySelector('#anki-video').addEventListener('click', () => run(true));
        box.querySelector('#anki-cancel').addEventListener('click', close);
    });
}

// Собирает и скачивает .apkg. deckId — наша колода ('' = все слова,
// '__none__' = слова вне колод); её имя уезжает на сервер, чтобы карточки легли
// в подколоду «Animei::<имя>». true — колода ушла в загрузки.
async function exportAnki(withVideo, deckId) {
    const all = await fetchWords();
    const deck = (deckId && deckId !== '__none__' && window.Decks) ? Decks.get(deckId) : null;
    let words = all;
    if (deck) words = all.filter((w) => Decks.has(deck.id, w.id));
    else if (deckId === '__none__' && window.Decks) words = all.filter((w) => Decks.decksOf(w.id).length === 0);
    if (!words.length) {
        showSnackbar(t('words.empty'), { duration: 3000 });
        return false;
    }

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
        if (withVideo) fd.append('video', '1');
        if (deck) fd.append('deck', deck.name);

        // Сервер режет ffmpeg-ом медиа на каждое слово — большим коллекциям
        // нужно время, а перекодировать видео ещё дольше: таймаут щедрый.
        const { data } = await client.post('words/export/anki', fd, {
            responseType: 'blob', timeout: withVideo ? 1800000 : 300000,
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(data);
        // Имя файла по колоде: в загрузках сразу видно, что за колода.
        const slug = deck ? deck.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) : '';
        a.download = slug ? `animei-${slug}.apkg` : 'animei.apkg';
        a.click();
        URL.revokeObjectURL(a.href);
        return true;
    } catch (err) {
        console.error('Anki export failed:', err);
        return false;
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
    // Слой колод (необязательный): фильтр-селектор, кнопка «Учить», меню карточек.
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

    // Синк колод с аккаунтом закончился (мог принести колоды с другого
    // устройства) — перерисовываем чипы и карточки.
    document.addEventListener('decks:changed', () => renderWords());

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
    document.getElementById('export-anki-btn')?.addEventListener('click', openAnkiExport);
    document.getElementById('import-known-btn')?.addEventListener('click', openKnownImport);
    document.getElementById('known-btn')?.addEventListener('click', openKnownManager);
    updateKnownMenuLabel();
});
