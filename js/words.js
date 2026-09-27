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
const FREEZE_KEY = 'animei:wordsFreeze';   // all | active | frozen

let allWords = [];       // все слова коллекции (кэш, чтобы фильтровать без перезагрузки)
let wordsFilter = '';    // строка поиска (в нижнем регистре)
let viewMode = localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list';
let sortMode = ['new', 'old', 'az'].includes(localStorage.getItem(SORT_KEY))
    ? localStorage.getItem(SORT_KEY) : 'new';
// Показ замороженных: по умолчанию видны наравне со всеми.
let freezeMode = ['all', 'active', 'frozen'].includes(localStorage.getItem(FREEZE_KEY))
    ? localStorage.getItem(FREEZE_KEY) : 'all';

// Режим выбора: копим id отмеченных слов, внизу — панель массовых действий.
let selectMode = false;
const selected = new Set();

function readingMode() {
    // Общая настройка транскрипции (js/settings.js) — та же, что тогл «あ | A»
    // в плеере и «Транскрипция» в настройках. Зеркальные ключи — на случай,
    // если settings.js почему-то не загрузился.
    const S = window.AnimeiSettings;
    if (S) return S.get('studyTranscription') === 'kana' ? 'kana' : 'romaji';
    const saved = localStorage.getItem('animei:readingMode');
    if (saved === 'romaji' || saved === 'kana') return saved;
    return localStorage.getItem('animei:romaji') === 'off' ? 'kana' : 'romaji';
}

// Готовый ромадзи берём из карточки, а если его нет — переводим кану сами
// (romaji.js подключён на странице слов).
function readingOf(wordData) {
    const kana = wordData.kana || '';
    // Английское слово: в kana лежит транскрипция — показываем как есть.
    if (window.LearnLang && LearnLang.wordLang(wordData) === 'en') return kana;
    if (readingMode() !== 'romaji') return kana;
    if (wordData.romaji) return wordData.romaji;
    return (typeof kanaToRomaji === 'function' && kana) ? kanaToRomaji(kana) : kana;
}

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
        try { allWords = ownLang(await fetchWords()); } catch { /* оставим что было */ }
        renderWords();
    }, 8000);
}

// На странице — только слова текущего изучаемого языка (LearnLang, settings.js).
function ownLang(words) {
    return window.LearnLang ? LearnLang.filter(words) : words;
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

    let all = [];
    try {
        all = await fetchWords();
    } catch (err) {
        console.error('Failed to load words:', err);
    }
    // Чистим из колод «мёртвые» id — слова, которых уже нет в коллекции
    // (по ПОЛНОЙ коллекции: слова другого языка живы, просто не показаны).
    if (window.Decks) Decks.sanitize(all.map((w) => w.id));
    allWords = ownLang(all);
    renderWords();
}

function updateCount(n) {
    const countEl = document.getElementById('words-count');
    if (!countEl) return;
    countEl.textContent = n;
    countEl.hidden = n === 0;
}

// Слово подходит под фильтр, если строка встречается в написании, чтении или переводе
// Показ по заморозке: по умолчанию видно всё — замороженное слово прячут от
// учёбы, а не от глаз («пусть будет»).
function matchesFreeze(w) {
    if (freezeMode === 'active') return !isFrozen(w);
    if (freezeMode === 'frozen') return isFrozen(w);
    return true;
}

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
        onFreeze: window.Freeze ? () => toggleFreeze(wordData) : null,
    });
}

function toggleSelected(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    renderWords();
}

// ---------- Меню действий слова («⋯») ----------

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
    const ico = AnimeiWordEdit.menuIcons;
    const frozen = !!wordData.frozen;
    menu.innerHTML = `
        <button data-act="edit">${ico.edit}${esc(t('words.edit'))}</button>
        <button data-act="decks">${ico.decks}${esc(t('decks.add'))}</button>
        <button data-act="freeze">${ico.freeze}${esc(t(frozen ? 'words.unfreeze' : 'words.freeze'))}</button>
        <button data-act="copy">${ico.copy}${esc(t('words.copy'))}</button>
        <hr class="words-menu__hr">
        <button data-act="del" class="word-actions__danger">${ico.del}${esc(t('words.bulkDelete'))}</button>
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
        else if (act === 'freeze') toggleFreeze(wordData);
        else if (act === 'copy') AnimeiWordEdit.copyWord(wordData);
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

// Заморозить/вернуть слово. Список перерисовываем сразу (снежинка на строке),
// не дожидаясь сервера: правка переживёт офлайн в ящике правок.
async function toggleFreeze(wordData) {
    if (!window.Freeze) return;
    const next = !wordData.frozen;
    wordData.frozen = next;
    const inList = allWords.find((w) => w.id === wordData.id);
    if (inList) inList.frozen = next;
    renderWords();
    if (window.animeiTrack) animeiTrack('word_freeze', next ? 'on' : 'off');
    try {
        await Freeze.setWord(wordData.id, next);
        showSnackbar(t(next ? 'words.frozenOne' : 'words.unfrozenOne'), { duration: 2500 });
    } catch (err) {
        console.error('Не удалось изменить заморозку слова', err);
        wordData.frozen = !next;
        if (inList) inList.frozen = !next;
        renderWords();
        showSnackbar(t('words.freezeFailed'), { duration: 3500, type: 'error' });
    }
}

// ---------- Отрисовка ----------

// Карточка (подробный вид): тап — открыть слово, «⋯» в углу — меню действий.
function buildCard(wordData) {
    const wordEl = document.createElement('div');
    wordEl.innerHTML = `
        <div class="word-card word-read-content${selected.has(wordData.id) ? ' is-selected' : ''}${isFrozen(wordData) ? ' is-frozen' : ''}">
            <button class="word-card__menu" title="${esc(t('words.actions'))}" aria-label="${esc(t('words.actions'))}">⋯</button>
            <div class="word-card__head">
                <span class="word-card__kanji">${esc(wordData.kanji)}</span>
                ${readingOf(wordData) ? `<span class="word-card__kana">${esc(readingOf(wordData))}</span>` : ''}
                ${isFrozen(wordData) ? `<span class="word-row__frozen" title="${esc(t('words.frozenBadge'))}">❄</span>` : ''}
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

// В строке — только первое значение перевода: списки значений («важный,
// дорогой») раздувают строку, полный перевод есть в карточке слова и в title.
function firstMeaning(tr) {
    return String(tr || '').split(/[,;；、]/)[0].trim();
}

// Компактная строка списка: одна линия «слово · чтение … перевод · значки».
// Кнопки «⋯»/«×» есть только на устройствах с курсором и видны по hover;
// на телефоне действия живут в карточке слова (тап) и режиме выбора (лонг-тап).
function buildRow(wordData) {
    const row = document.createElement('div');
    row.className = 'word-row' + (selected.has(wordData.id) ? ' is-selected' : '')
        + (isFrozen(wordData) ? ' is-frozen' : '');

    // Значки: ⏳ готовящегося клипа + значки колод (аватарка тайтла или эмодзи).
    // Повторы одного значка (две колоды с одним эмодзи) сливаем в один,
    // подсказки объединяем.
    const badges = [];
    if (isFrozen(wordData)) badges.push({ emoji: '❄', title: t('words.frozenBadge'), cls: 'word-row__frozen' });
    if (clipBadge(wordData) === 'pending') badges.push({ emoji: '⏳', title: t('words.videoPreparing'), cls: 'word-card__clip word-card__clip--pending' });
    if (window.Decks) {
        for (const d of Decks.decksOf(wordData.id)) {
            const ico = Decks.iconHtml(d);
            const dup = badges.find((b) => b.emoji === ico);
            if (dup) dup.title += `, ${d.name}`;
            else badges.push({ emoji: ico, title: d.name, cls: '' });
        }
    }
    const badgesHtml = badges
        .map((b) => `<span${b.cls ? ` class="${b.cls}"` : ''} title="${esc(b.title)}">${b.emoji}</span>`)
        .join('');

    row.innerHTML = `
        ${selectMode ? `<span class="word-check${selected.has(wordData.id) ? ' is-on' : ''}">✓</span>` : ''}
        <div class="word-row__jp">
            <span class="word-row__kanji">${esc(wordData.kanji)}</span>
            ${readingOf(wordData) ? `<span class="word-row__kana">${esc(readingOf(wordData))}</span>` : ''}
        </div>
        <div class="word-row__tr" title="${esc(wordData.translation || '')}">${esc(firstMeaning(wordData.translation))}</div>
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

// Затухание нижней строки списка: только пока есть куда крутить. Скролл живёт
// внутри .words-list лишь на ПК (css/app/pages.css); на телефоне список не
// прокручивается сам по себе и условие просто не срабатывает.
function updateListFade() {
    const el = document.querySelector('.words-list');
    if (!el) return;
    el.classList.toggle('is-fade', el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    el.classList.toggle('is-fade-top', el.scrollTop > 4);
}

// Слова, замороженные не сами по себе, а целиком колодой. Пересчитываем раз на
// отрисовку: на каждую строку это был бы обход всех колод.
let frozenByDecks = new Set();

function isFrozen(w) {
    return !!(w && (w.frozen || frozenByDecks.has(w.id)));
}

function renderWords() {
    closeWordActions();   // меню могло висеть у строки, которой больше нет
    frozenByDecks = window.Freeze ? Freeze.frozenByDecks() : new Set();
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
        updateListFade();
        return;
    }

    // Фильтр по активной колоде (если выбрана) поверх текстового поиска.
    const deckActive = window.DecksUI ? DecksUI.activeDeckId() : null;
    const words = sortWords(allWords
        .filter(matchesFilter)
        .filter(matchesFreeze)
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
        updateListFade();
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

    updateListFade();
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
    // Кнопка одна на оба действия: если ВСЁ выбранное уже заморожено — она
    // размораживает, иначе замораживает. Смешанный выбор трактуем как «заморозить»
    // (общее состояние понятнее, чем переключение каждого по отдельности).
    const bulkUnfreeze = n > 0 && [...selected].every((id) => {
        const w = allWords.find((x) => x.id === id);
        return !!(w && w.frozen);
    });
    // «Из колоды» имеет смысл только для настоящей колоды (не для «Без колоды»).
    const active = window.DecksUI ? DecksUI.activeDeckId() : null;
    const deckActive = (active && window.Decks && Decks.get(active)) ? active : null;
    bar.innerHTML = `
        <span class="words-bulkbar__count">${n}</span>
        <button class="words-bulkbar__btn" id="bulk-all">${esc(t('words.selectAll'))}</button>
        <button class="words-bulkbar__btn words-bulkbar__btn--primary" id="bulk-deck" ${n ? '' : 'disabled'}>
            <span class="bb-wide">${esc(t('words.toDeck'))}</span><span class="bb-narrow">${esc(t('words.toDeckShort'))}</span>
        </button>
        ${deckActive ? `<button class="words-bulkbar__btn" id="bulk-undeck" ${n ? '' : 'disabled'}>
            <span class="bb-wide">${esc(t('words.fromDeck'))}</span><span class="bb-narrow">${esc(t('words.fromDeckShort'))}</span>
        </button>` : ''}
        <button class="words-bulkbar__btn" id="bulk-freeze" ${n ? '' : 'disabled'}>
            <span class="bb-wide">${esc(t(bulkUnfreeze ? 'words.unfreeze' : 'words.freeze'))}</span><span class="bb-narrow">❄</span>
        </button>
        <button class="words-bulkbar__btn words-bulkbar__danger" id="bulk-delete" ${n ? '' : 'disabled'}>
            <span class="bb-wide">${esc(t('words.bulkDelete'))}</span><span class="bb-narrow">${AnimeiWordEdit.menuIcons.del}</span>
        </button>
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
        if (window.animeiTrack) animeiTrack('words_bulk', 'to_deck:' + selected.size);
        DecksUI.openBulkSheet([...selected], () => { exitSelect(); });
    });
    bar.querySelector('#bulk-undeck')?.addEventListener('click', () => {
        if (!selected.size || !window.Decks) return;
        const removed = Decks.removeMany(deckActive, [...selected]);
        if (window.animeiTrack) animeiTrack('words_bulk', 'from_deck:' + removed);
        showSnackbar(t('words.removedFromDeckN').replace('{n}', removed), { duration: 2500 });
        exitSelect();
    });
    bar.querySelector('#bulk-freeze').addEventListener('click', async (e) => {
        const ids = [...selected];
        if (!ids.length || !window.Freeze) return;
        const btn = e.currentTarget;
        btn.disabled = true;
        const next = !bulkUnfreeze;
        let done = 0;
        for (const id of ids) {
            const w = allWords.find((x) => x.id === id);
            if (!w || !!w.frozen === next) continue;
            try { await Freeze.setWord(id, next); w.frozen = next; done++; }
            catch (err) { console.error('Не удалось изменить заморозку слова', id, err); }
        }
        if (window.animeiTrack) animeiTrack('words_bulk', (next ? 'freeze:' : 'unfreeze:') + done);
        showSnackbar(t(next ? 'words.frozenN' : 'words.unfrozenN').replace('{n}', done), { duration: 2500 });
        exitSelect();
    });
    bar.querySelector('#bulk-delete').addEventListener('click', async (e) => {
        const ids = [...selected];
        if (!ids.length) return;
        if (!confirm(t('words.bulkDeleteConfirm').replace('{n}', ids.length))) return;

        // Удаляем ПАЧКАМИ и сразу убираем удалённое с экрана. Раньше цикл шёл
        // строго по одному и перерисовывал список только в самом конце: на
        // полусотне слов это больше десяти секунд, в которые ничего не
        // происходит — выглядело как «кнопка не работает», хотя слова уже
        // удалялись (после перезагрузки их не было).
        const btn = e.currentTarget;
        btn.disabled = true;
        let done = 0;
        let failed = 0;
        const tick = () => {
            // Подписи две (широкая и узкая) — прогресс пишем в обе.
            const label = t('words.bulkDeleting').replace('{i}', done).replace('{n}', ids.length);
            btn.querySelectorAll('.bb-wide, .bb-narrow').forEach((el) => { el.textContent = label; });
        };
        tick();

        const queue = [...ids];
        const drop = (id) => {
            allWords = allWords.filter((w) => w.id !== id);
            selected.delete(id);
        };
        // Четыре параллельных удаления: сервер справляется, а ждать полминуты
        // на большом наборе незачем. Больше не берём — это чужая база и диск.
        const workers = Array.from({ length: 4 }, async () => {
            for (let id = queue.shift(); id; id = queue.shift()) {
                try {
                    await deleteWord(id);
                    if (window.Decks) Decks.forgetWord(id);
                    drop(id);
                    done++;
                } catch (err) {
                    console.error('Не удалось удалить слово', id, err);
                    failed++;
                }
                tick();
                // Перерисовываем не на каждое слово, а каждые четыре: список
                // тает на глазах, но и не дёргается на каждый ответ сервера.
                if ((done + failed) % 4 === 0) renderWords();
            }
        });
        await Promise.all(workers);
        if (window.animeiTrack) animeiTrack('words_bulk', 'delete:' + done);

        showSnackbar(t('words.bulkDeleted').replace('{n}', done), { duration: 3000 });
        if (failed) showSnackbar(t('words.bulkDeleteFailed').replace('{n}', failed), { duration: 4000, type: 'error' });
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

// ---------- Модалка «Фильтры» ----------
// Здесь собрано всё, что ОТБИРАЕТ слова: сортировка и заморозка. Вид
// (список/карточки) живёт в меню «⋯» — он ничего не отбирает. Колода —
// отдельно, на пилюле слева:
// это не «настройка показа», а навигация по коллекции, и её выбор виден прямо
// в тулбаре без открытия чего-либо.

const SORT_OPTS = [['new', 'words.sort.new'], ['old', 'words.sort.old'], ['az', 'words.sort.az']];
const VIEW_OPTS = [['list', 'words.view.list'], ['cards', 'words.view.cards']];
// Значки пунктов «⋯» — в манере меню слова (js/word-edit.js): 16px, обводка.
const MENU_SVG = (inner) => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
const VIEW_ICONS = {
    list: MENU_SVG('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>'
        + '<line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>'
        + '<line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
    cards: MENU_SVG('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>'
        + '<rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
};
const FREEZE_OPTS = [['all', 'words.freeze.all'], ['active', 'words.freeze.active'], ['frozen', 'words.freeze.frozen']];

// Отличается ли показ от умолчаний — по этому воронка получает точку. Вид
// (список/карточки) сюда не входит: он переехал в меню «⋯» и слова не отбирает.
function filtersActive() {
    return sortMode !== 'new' || freezeMode !== 'all';
}

function visibleCount() {
    return allWords.filter(matchesFilter)
        .filter(matchesFreeze)
        .filter((w) => (window.DecksUI ? DecksUI.visible(w) : true)).length;
}

function openFilters() {
    const overlay = document.createElement('div');
    overlay.className = 'deck-sheet__overlay';
    const sheet = document.createElement('div');
    sheet.className = 'deck-sheet wfilters';
    const modal = modalLayer(overlay);

    // Перерисовываем содержимое на месте: выбор применяется сразу к списку под
    // модалкой, поэтому «ОК» не нужен — внизу только закрытие со счётчиком
    // результата. «Сбросить» появляется, только когда есть что сбрасывать:
    // серая мёртвая кнопка при каждом открытии выглядела поломкой.
    const draw = () => {
        const seg = (opts, cur, group) => opts.map(([v, k]) =>
            `<button class="wfilters__seg${v === cur ? ' is-on' : ''}" data-group="${group}" data-val="${v}">${esc(t(k))}</button>`).join('');

        sheet.innerHTML =
            `<div class="deck-sheet__head">
                <div class="deck-sheet__title">${esc(t('words.filters'))}</div>
                <button class="deck-sheet__x" data-act="close">×</button>
            </div>
            <div class="deck-sheet__list wfilters__list">
                <div class="wfilters__label">${esc(t('words.filters.sort'))}</div>
                <div class="wfilters__segs">${seg(SORT_OPTS, sortMode, 'sort')}</div>
                <div class="wfilters__label">${esc(t('words.filters.freeze'))}</div>
                <div class="wfilters__segs">${seg(FREEZE_OPTS, freezeMode, 'freeze')}</div>
            </div>
            <div class="wfilters__foot">
                ${filtersActive() ? `<button class="btn btn--ghost" data-act="reset">${esc(t('words.filters.reset'))}</button>` : ''}
                <button class="btn btn--primary" data-act="close">${esc(t('words.filters.done').replace('{n}', visibleCount()))}</button>
            </div>`;
    };

    sheet.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.dataset.act === 'close') { modal.close(); return; }
        if (btn.dataset.act === 'reset') {
            sortMode = 'new';
            freezeMode = 'all';
            localStorage.setItem(SORT_KEY, sortMode);
            localStorage.setItem(FREEZE_KEY, freezeMode);
            renderWords();
            draw();
            return;
        }
        if (btn.dataset.group === 'sort') {
            sortMode = btn.dataset.val;
            localStorage.setItem(SORT_KEY, sortMode);
        } else if (btn.dataset.group === 'freeze') {
            freezeMode = btn.dataset.val;
            localStorage.setItem(FREEZE_KEY, freezeMode);
        } else return;
        renderWords();
        draw();
    });

    draw();
    overlay.appendChild(sheet);
    modal.open();
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
    // Вид списка (список/карточки) живёт здесь, а не в «Фильтрах»: он не
    // отбирает слова, а решает, как их показать, — и в модалке фильтров его
    // искали в последнюю очередь. Пункт с галочкой — та же манера, что была у
    // групп меню раньше (.words-menu__group в pages.css).
    const viewGroup = document.createElement('div');
    viewGroup.className = 'words-menu__group';
    const drawView = () => {
        viewGroup.innerHTML = '';
        for (const [val, key] of VIEW_OPTS) {
            const item = document.createElement('button');
            item.type = 'button';
            // Активный вид — подсвеченный пункт, а не галочка: галочка читается
            // как «включено», а тут выбор одного из двух.
            item.className = 'words-menu__item' + (viewMode === val ? ' is-on' : '');
            const label = document.createElement('span');
            label.textContent = t(key);
            item.innerHTML = VIEW_ICONS[val];
            item.append(label);
            item.addEventListener('click', () => {
                if (viewMode === val) return;
                viewMode = val;
                localStorage.setItem(VIEW_KEY, viewMode);
                renderWords();
                drawView();
            });
            viewGroup.appendChild(item);
        }
    };
    drawView();
    const viewHr = document.createElement('hr');
    viewHr.className = 'words-menu__hr';
    menu.prepend(viewGroup, viewHr);

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
            if (window.animeiTrack) animeiTrack('known_import', String(added));
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
    allWords = ownLang(await fetchWords());
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
            <div class="anki-export" role="radiogroup">
                <button class="anki-export__opt is-sel" data-video="0" role="radio" aria-checked="true">
                    <span class="anki-export__name">${esc(t('words.exportAnki.audio'))}</span>
                    <span class="anki-export__hint">${esc(t('words.exportAnki.audioHint'))}</span>
                </button>
                <button class="anki-export__opt" data-video="1" role="radio" aria-checked="false">
                    <span class="anki-export__name">${esc(t('words.exportAnki.video'))}</span>
                    <span class="anki-export__hint">${esc(t('words.exportAnki.videoHint'))}</span>
                </button>
            </div>
            <p class="known-modal__hint anki-export__status" id="anki-status" hidden></p>
            <div class="deck-editor__actions">
                <button class="btn btn--ghost" id="anki-cancel">${esc(t('words.cancel'))}</button>
                <button class="btn btn--success" id="anki-go">${esc(t('words.export.download'))}</button>
            </div>
        `;
        const statusEl = box.querySelector('#anki-status');
        const deckEl = box.querySelector('#anki-deck');
        // Формат — переключатель-карточка (звук по умолчанию), сборка — кнопкой:
        // раньше сами карточки запускали экспорт, и это read как «два действия».
        let withVideo = false;
        box.querySelectorAll('.anki-export__opt').forEach((opt) => {
            opt.addEventListener('click', () => {
                withVideo = opt.dataset.video === '1';
                box.querySelectorAll('.anki-export__opt').forEach((o) => {
                    const sel = o === opt;
                    o.classList.toggle('is-sel', sel);
                    o.setAttribute('aria-checked', sel ? 'true' : 'false');
                });
            });
        });
        box.querySelector('#anki-go').addEventListener('click', async () => {
            const deckId = deckEl ? deckEl.value : '';
            box.querySelectorAll('button, select').forEach((b) => { b.disabled = true; });
            statusEl.hidden = false;
            statusEl.textContent = withVideo ? t('words.exportAnki.busyVideo') : t('words.exportAnki.busy');
            const ok = await exportAnki(withVideo, deckId);
            close();
            showSnackbar(ok ? t('words.exportAnki.done') : t('words.exportAnki.fail'),
                { duration: 4000, type: ok ? 'info' : 'error' });
        });
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
        // Экспорт в Anki: со звуком или с видео и сколько карточек ушло.
        if (window.animeiTrack) animeiTrack('anki_export', (withVideo ? 'video:' : 'audio:') + payload.length);
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

// deckId — как у exportAnki: '' = все слова, '__none__' = вне колод, иначе id.
async function exportWords(deckId) {
    const all = await fetchWords();
    const deck = (deckId && deckId !== '__none__' && window.Decks) ? Decks.get(deckId) : null;
    let words = all;
    if (deck) words = all.filter((w) => Decks.has(deck.id, w.id));
    else if (deckId === '__none__' && window.Decks) words = all.filter((w) => Decks.decksOf(w.id).length === 0);
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
    a.download = deck ? `animei-${deck.name.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.txt` : 'animei-words.txt';
    a.click();
    URL.revokeObjectURL(a.href);
}

// Текстовый экспорт: если есть колоды — сперва спрашиваем, какую выгружать
// (тем же селектом, что у Anki-экспорта); без колод качаем сразу.
function openTextExport() {
    closeWordsMenu();
    const deckOpts = ankiDeckOptions();
    if (!deckOpts.length) { exportWords(''); return; }
    openModal((box, close) => {
        const active = (window.DecksUI && DecksUI.activeDeckId()) || '';
        box.innerHTML = `
            <div class="deck-editor__title">${esc(t('words.export'))}</div>
            <label class="anki-export__deck">
                <span>${esc(t('words.exportAnki.deck'))}</span>
                <select id="text-deck">
                    ${deckOpts.map((o) => `<option value="${esc(o.id)}"${o.id === active ? ' selected' : ''}>${esc(o.label)} (${o.n})</option>`).join('')}
                </select>
            </label>
            <div class="deck-editor__actions">
                <button class="btn btn--ghost" id="text-cancel">${esc(t('words.cancel'))}</button>
                <button class="btn btn--success" id="text-go">${esc(t('words.export.download'))}</button>
            </div>
        `;
        box.querySelector('#text-cancel').addEventListener('click', close);
        box.querySelector('#text-go').addEventListener('click', () => {
            exportWords(box.querySelector('#text-deck').value);
            close();
        });
    });
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
            // Воронка открывает модалку показа списка (сортировка, вид).
            onFilters: openFilters,
            filtersActive,
        });
    }

    loadWords();

    // Синк колод с аккаунтом закончился (мог принести колоды с другого
    // устройства) — перерисовываем чипы и карточки.
    document.addEventListener('decks:changed', () => renderWords());

    // Короткий плейсхолдер для узкого экрана ставит инлайн-скрипт в words.html
    // (до первой отрисовки), i18n дальше сам берёт ключ из data-i18n-placeholder.
    const filterInput = document.getElementById('words-filter');
    filterInput?.addEventListener('input', () => {
        wordsFilter = filterInput.value.trim().toLowerCase();
        renderWords();
    });

    document.getElementById('select-btn')?.addEventListener('click', () => {
        if (selectMode) exitSelect();
        else enterSelect();
    });

    document.querySelector('.words-list')?.addEventListener('scroll', updateListFade, { passive: true });
    window.addEventListener('resize', updateListFade);

    initLongPressGuard();
    initMenu();
    document.getElementById('export-btn')?.addEventListener('click', openTextExport);
    document.getElementById('export-anki-btn')?.addEventListener('click', openAnkiExport);
    document.getElementById('import-known-btn')?.addEventListener('click', openKnownImport);
    document.getElementById('known-btn')?.addEventListener('click', openKnownManager);
    updateKnownMenuLabel();
});
