// Экранируем пользовательский текст — он идёт и в разметку, и в атрибуты value.
function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
}

let allWords = [];       // все слова коллекции (кэш, чтобы фильтровать без перезагрузки)
let wordsFilter = '';    // строка поиска (в нижнем регистре)

// ИИ-разбор предложения прямо в карточке слова
let aiAvailable = false;
const explainCache = new Map();   // разбор по тексту предложения — на время сессии

// Узнаём один раз, настроен ли на сервере ИИ; если да — показываем кнопки разбора
if (typeof client !== 'undefined') {
    client.get('explain/status')
        .then(({ data: res }) => {
            aiAvailable = !!res?.data?.available;
            if (aiAvailable) {
                document.querySelectorAll('.word-card__explain[hidden]').forEach((b) => { b.hidden = false; });
            }
        })
        .catch(() => {});
}

function renderExplainInto(out, data) {
    out.innerHTML = '';
    out.classList.remove('hidden');

    const section = (title, node) => {
        const sec = document.createElement('div');
        sec.className = 'explain__section';
        const h = document.createElement('div');
        h.className = 'explain__title';
        h.textContent = title;
        sec.appendChild(h);
        sec.appendChild(node);
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

async function runWordExplain(wordData, btn, out) {
    const sentence = wordData.sentence;
    if (!sentence) return;

    const cached = explainCache.get(sentence);
    if (cached) { renderExplainInto(out, cached); btn.hidden = true; return; }

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = t('words.explaining');

    try {
        const { data: res } = await client.get('explain', { params: { sentence }, timeout: 60000 });
        const data = res.data.explanation;
        explainCache.set(sentence, data);
        renderExplainInto(out, data);
        btn.hidden = true;
    } catch (err) {
        console.error(err);
        const limited = err.response?.data?.reason === 'limited' || err.response?.status === 429;
        showSnackbar(limited ? t('popup.explainLimited') : t('words.explainError'), { duration: 3500, type: 'error' });
        btn.disabled = false;
        btn.textContent = label;
    }
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

    const words = allWords.filter(matchesFilter);
    wordsListEl.innerHTML = '';

    if (words.length === 0) {
        wordsListEl.innerHTML = `<p class="words-nothing">${t('words.nothingFound')}</p>`;
        return;
    }

    for (const wordData of words) {
        const wordEl = document.createElement('div');
        const hasClip = !!wordData.video || Number(wordData.videoEnd) > Number(wordData.videoStart);

        wordEl.innerHTML = `
            <div class="word-card word-read-content">
                <button class="word-card__delete" title="${esc(t('words.delete.title'))}">&times;</button>
                <div class="word-card__head">
                    <span class="word-card__kanji">${esc(wordData.kanji)}</span>
                    ${wordData.kana ? `<span class="word-card__kana">${esc(wordData.kana)}</span>` : ''}
                    ${hasClip ? `<span class="word-card__clip" title="${esc(t('words.clip'))}">🎬</span>` : ''}
                </div>
                ${wordData.translation ? `<div class="word-card__meaning">${esc(wordData.translation)}</div>` : ''}
                ${wordData.sentence ? `<div class="word-card__sentence">${esc(wordData.sentence)}${
                    wordData.sentenceTranslation ? `<span class="word-card__sentence-tr">${esc(wordData.sentenceTranslation)}</span>` : ''
                }</div>` : ''}
                ${wordData.hint ? `<div class="word-card__tag">${esc(wordData.hint)}</div>` : ''}
                ${wordData.sentence ? `<div class="word-card__explain-out hidden"></div>` : ''}
                <div class="word-card__actions">
                    <button class="btn btn--ghost edit-btn">${t('words.edit')}</button>
                    ${wordData.sentence ? `<button class="btn btn--ghost word-card__explain" ${aiAvailable ? '' : 'hidden'}>${t('words.explain')}</button>` : ''}
                </div>
            </div>
            <div class="word-card word-edit-content hidden">
                <div class="word-edit">
                    <div class="form-group">
                        <label>${t('words.word')}</label>
                        <input type="text" class="edit-kanji" value="${esc(wordData.kanji)}">
                    </div>
                    <div class="form-group">
                        <label>${t('words.reading')}</label>
                        <input type="text" class="edit-kana" value="${esc(wordData.kana)}">
                    </div>
                    <div class="form-group">
                        <label>${t('words.meaning')}</label>
                        <input type="text" class="edit-translation" value="${esc(wordData.translation)}">
                    </div>
                    <div class="form-group">
                        <label>${t('words.sentence')}</label>
                        <input type="text" class="edit-sentence" value="${esc(wordData.sentence)}">
                    </div>
                    <div class="form-group">
                        <label>${t('words.sentenceTranslation')}</label>
                        <input type="text" class="edit-sentenceTranslation" value="${esc(wordData.sentenceTranslation)}">
                    </div>
                    <div class="form-group">
                        <label>${t('words.hint')}</label>
                        <textarea class="edit-hint">${esc(wordData.hint)}</textarea>
                    </div>
                    <div class="word-edit__actions">
                        <button class="btn btn--danger cancel-btn">${t('words.cancel')}</button>
                        <button class="btn btn--success save-btn">${t('words.save')}</button>
                    </div>
                </div>
            </div>
        `;

        wordEl.querySelector('.word-card__delete').addEventListener('click', async () => {
            await deleteWord(wordData.id);
            allWords = allWords.filter((w) => w.id !== wordData.id);
            renderWords();
        });

        wordEl.querySelector('.edit-btn').addEventListener('click', () => {
            wordEl.querySelector('.word-edit-content').classList.remove('hidden');
            wordEl.querySelector('.word-read-content').classList.add('hidden');
        });

        const explainBtn = wordEl.querySelector('.word-card__explain');
        if (explainBtn) {
            const out = wordEl.querySelector('.word-card__explain-out');
            explainBtn.addEventListener('click', () => runWordExplain(wordData, explainBtn, out));
        }

        wordEl.querySelector('.cancel-btn').addEventListener('click', () => {
            wordEl.querySelector('.word-edit-content').classList.add('hidden');
            wordEl.querySelector('.word-read-content').classList.remove('hidden');
        });

        wordEl.querySelector('.save-btn').addEventListener('click', async () => {
            const patch = {
                kanji: wordEl.querySelector('.edit-kanji').value,
                kana: wordEl.querySelector('.edit-kana').value,
                translation: wordEl.querySelector('.edit-translation').value,
                sentence: wordEl.querySelector('.edit-sentence').value,
                sentenceTranslation: wordEl.querySelector('.edit-sentenceTranslation').value,
                hint: wordEl.querySelector('.edit-hint').value,
            };
            await updateWord(wordData.id, patch);
            Object.assign(wordData, patch);   // обновляем кэш, чтобы фильтр/перерисовка были свежими
            renderWords();
            showSnackbar(t('words.savedSnack'), { duration: 3000, type: 'success' });
        });

        wordsListEl.appendChild(wordEl);
    }
}

// ---------- Экспорт и импорт ----------
// Формат — простой текст с табуляцией: слово, чтение, значение, предложение,
// перевод предложения. Такой файл Anki принимает без настройки.

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

async function importWords(file) {
    let text;
    try {
        text = await file.text();
    } catch {
        showSnackbar(t('words.importError'), { duration: 3500, type: 'error' });
        return;
    }

    const existing = new Set((await fetchWords()).map(w => w.kanji));
    let added = 0;

    for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
        const [kanji, kana, translation, sentence, sentenceTranslation] = line.split('\t');
        if (!kanji || !kanji.trim() || existing.has(kanji.trim())) continue;
        try {
            await saveWord({
                kanji: kanji.trim(),
                kana: (kana ?? '').trim(),
                translation: (translation ?? '').trim(),
                sentence: (sentence ?? '').trim(),
                sentenceTranslation: (sentenceTranslation ?? '').trim(),
            });
            existing.add(kanji.trim());
            added++;
        } catch (err) {
            console.error('Не удалось импортировать слово:', kanji, err);
        }
    }

    if (added) {
        showSnackbar(`${t('words.imported')} ${added}`, { duration: 3500, type: 'success' });
        loadWords();
    } else {
        showSnackbar(t('words.importNothing'), { duration: 3500 });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    loadWords();

    const filterInput = document.getElementById('words-filter');
    filterInput?.addEventListener('input', () => {
        wordsFilter = filterInput.value.trim().toLowerCase();
        renderWords();
    });

    document.getElementById('export-btn')?.addEventListener('click', exportWords);

    const fileInput = document.getElementById('import-file');
    document.getElementById('import-btn')?.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', () => {
        if (fileInput.files[0]) importWords(fileInput.files[0]);
        fileInput.value = '';
    });
});
