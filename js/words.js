// Экранируем пользовательский текст — он идёт и в разметку, и в атрибуты value.
function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
}

let allWords = [];       // все слова коллекции (кэш, чтобы фильтровать без перезагрузки)
let wordsFilter = '';    // строка поиска (в нижнем регистре)

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

// Редактирование карточки (форма + звук + правка видео-фрагмента) вынесено в
// общий модуль js/word-edit.js (AnimeiWordEdit.open) — используется и здесь, и в
// режиме обучения (study-core.js), чтобы правка была одинаковой.
function renderWords() {
    const wordsListEl = document.querySelector('.words-list');
    updateCount(allWords.length);

    if (allWords.length === 0) {
        // Пустая коллекция — сразу зовём туда, где слова добавляются
        wordsListEl.innerHTML = `
            <div class="words-empty">
                <p style="color: var(--text-muted)">${t('words.empty')}</p>
                <a class="btn btn--success" href="./catalog.html">${t('words.openCatalog')}</a>
            </div>`;
        return;
    }

    // Фильтр по активной колоде (если выбрана) поверх текстового поиска.
    const deckActive = window.DecksUI ? DecksUI.activeDeckId() : null;
    const words = allWords
        .filter(matchesFilter)
        .filter((w) => (window.DecksUI ? DecksUI.visible(w) : true));
    wordsListEl.innerHTML = '';

    if (words.length === 0) {
        // Пустая колода — своя формулировка, а не «ничего не нашлось».
        const msg = (deckActive && !wordsFilter) ? t('decks.empty') : t('words.nothingFound');
        wordsListEl.innerHTML = `<p class="words-nothing">${msg}</p>`;
        if (window.DecksUI) DecksUI.refresh();
        return;
    }

    for (const wordData of words) {
        const wordEl = document.createElement('div');
        const badge = clipBadge(wordData);
        const badgeHtml = badge === 'ready'
            ? `<span class="word-card__clip" title="${esc(t('words.clip'))}">🎬</span>`
            : badge === 'pending'
                ? `<span class="word-card__clip word-card__clip--pending" title="${esc(t('words.videoPreparing'))}">⏳</span>`
                : '';

        wordEl.innerHTML = `
            <div class="word-card word-read-content">
                <button class="word-card__delete" title="${esc(t('words.delete.title'))}">&times;</button>
                <div class="word-card__head">
                    <span class="word-card__kanji">${esc(wordData.kanji)}</span>
                    ${wordData.kana ? `<span class="word-card__kana">${esc(wordData.kana)}</span>` : ''}
                    ${badgeHtml}
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

        wordEl.querySelector('.word-card__delete').addEventListener('click', async () => {
            await deleteWord(wordData.id);
            if (window.Decks) Decks.forgetWord(wordData.id);   // и из всех колод
            allWords = allWords.filter((w) => w.id !== wordData.id);
            renderWords();
        });

        wordEl.querySelector('.edit-btn').addEventListener('click', () => {
            AnimeiWordEdit.open(wordData, renderWords);
        });

        // Мини-чипы колод + кнопка «в колоды» на карточке.
        if (window.DecksUI) DecksUI.decorateCard(wordEl, wordData);

        wordsListEl.appendChild(wordEl);
    }

    // Обновляем чипы/счётчики колод под текущую коллекцию.
    if (window.DecksUI) DecksUI.refresh();

    // Есть слова с ещё не готовым клипом — тихо перепроверим их чуть позже.
    if (words.some((w) => clipBadge(w) === 'pending')) scheduleClipRefresh();
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
    filterInput?.addEventListener('input', () => {
        wordsFilter = filterInput.value.trim().toLowerCase();
        renderWords();
    });

    document.getElementById('export-btn')?.addEventListener('click', exportWords);
    document.getElementById('export-anki-btn')?.addEventListener('click', exportAnki);
});
