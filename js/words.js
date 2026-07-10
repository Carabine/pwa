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
    // Меняем только текстовую подпись, чтобы иконка ИИ в кнопке не пропадала.
    const labelEl = btn.querySelector('.btn-label') || btn;
    const label = labelEl.textContent;
    labelEl.textContent = t('words.explaining');
    if (window.animeiTrack) window.animeiTrack('explain', 'dictionary');

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
        labelEl.textContent = label;
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

// Одна строка формы (label + input/textarea). Значение ставим через .value —
// безопасно к любому пользовательскому тексту.
function editField(labelKey, value, cls, textarea) {
    const g = document.createElement('div');
    g.className = 'form-group';
    const label = document.createElement('label');
    label.textContent = t(labelKey);
    const input = document.createElement(textarea ? 'textarea' : 'input');
    if (!textarea) input.type = 'text';
    input.className = cls;
    input.value = value ?? '';
    g.append(label, input);
    return { g, input };
}

// Блок «Свой звук» карточки: загрузить аудиофайл или записать с микрофона.
// Хранится в браузере (video-store.js: putAudio/getAudio) по id слова.
function buildAudioControl(wordData) {
    const box = document.createElement('div');
    box.className = 'word-audio';

    const title = document.createElement('div');
    title.className = 'clip-edit__title';
    title.textContent = t('words.audio');
    box.appendChild(title);

    const player = document.createElement('audio');
    player.className = 'word-audio__player';
    player.controls = true;
    player.hidden = true;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.hidden = true;

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'btn btn--ghost';
    uploadBtn.textContent = t('words.audioUpload');

    const recordBtn = document.createElement('button');
    recordBtn.type = 'button';
    recordBtn.className = 'btn btn--ghost word-audio__record';
    recordBtn.textContent = t('words.audioRecord');

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn--ghost word-audio__remove';
    removeBtn.textContent = t('words.audioRemove');
    removeBtn.hidden = true;

    async function refresh() {
        if (typeof getWordAudioUrl !== 'function') return;
        const url = await getWordAudioUrl(wordData);
        if (url) {
            player.src = url;
            player.hidden = false;
            removeBtn.hidden = false;
        } else {
            player.hidden = true;
            player.removeAttribute('src');
            removeBtn.hidden = true;
        }
    }

    async function store(blob) {
        if (!blob || !blob.size || typeof setWordAudio !== 'function') {
            showSnackbar(t('words.audioError'), { duration: 3000, type: 'error' });
            return;
        }
        try {
            const url = await setWordAudio(wordData, blob);
            if (url) {
                await refresh();
                showSnackbar(t('words.audioSaved'), { duration: 2000, type: 'success' });
                return;
            }
        } catch (err) {
            console.error('Не удалось сохранить звук:', err);
        }
        showSnackbar(t('words.audioError'), { duration: 3000, type: 'error' });
    }

    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        const f = fileInput.files[0];
        fileInput.value = '';
        if (f) store(f);
    });

    // Запись с микрофона — только если браузер умеет MediaRecorder.
    let recorder = null;
    let chunks = [];
    const canRecord = typeof MediaRecorder !== 'undefined'
        && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (!canRecord) recordBtn.hidden = true;
    recordBtn.addEventListener('click', async () => {
        if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recorder = new MediaRecorder(stream);
            chunks = [];
            recorder.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) chunks.push(e.data); });
            recorder.addEventListener('stop', () => {
                stream.getTracks().forEach((tr) => tr.stop());
                recordBtn.classList.remove('is-recording');
                recordBtn.textContent = t('words.audioRecord');
                store(new Blob(chunks, { type: (chunks[0] && chunks[0].type) || 'audio/webm' }));
            });
            recorder.start();
            recordBtn.classList.add('is-recording');
            recordBtn.textContent = t('words.audioStop');
        } catch {
            showSnackbar(t('words.audioMicError'), { duration: 3000, type: 'error' });
        }
    });

    removeBtn.addEventListener('click', async () => {
        if (typeof clearWordAudio === 'function') await clearWordAudio(wordData);
        await refresh();
    });

    const row = document.createElement('div');
    row.className = 'word-audio__row';
    row.append(uploadBtn, recordBtn, removeBtn);
    box.append(row, player, fileInput);
    refresh();
    return box;
}

// Редактирование карточки слова — модальным окном. onSaved зовём после
// успешного PATCH (перерисовать список). Правку видео-фрагмента и звука
// монтируем внутрь: они сохраняются сами, отдельными действиями.
function openWordEditModal(wordData, onSaved) {
    const overlay = document.createElement('div');
    overlay.className = 'word-modal';
    overlay.innerHTML = `
        <div class="word-modal__dialog" role="dialog" aria-modal="true" aria-label="${esc(t('words.edit'))}">
            <div class="word-modal__head">
                <span class="word-modal__title">${esc(t('words.edit'))}</span>
                <button class="word-modal__close" type="button" aria-label="${esc(t('words.cancel'))}">&times;</button>
            </div>
            <div class="word-modal__body"><div class="word-edit"></div></div>
            <div class="word-modal__foot">
                <button class="btn btn--danger cancel-btn" type="button">${esc(t('words.cancel'))}</button>
                <button class="btn btn--success save-btn" type="button">${esc(t('words.save'))}</button>
            </div>
        </div>`;

    const wrap = overlay.querySelector('.word-edit');
    const kanji = editField('words.word', wordData.kanji, 'edit-kanji');
    const kana = editField('words.reading', wordData.kana, 'edit-kana');
    const translation = editField('words.meaning', wordData.translation, 'edit-translation');
    const sentence = editField('words.sentence', wordData.sentence, 'edit-sentence');
    const sentenceTr = editField('words.sentenceTranslation', wordData.sentenceTranslation, 'edit-sentenceTranslation');
    const hint = editField('words.hint', wordData.hint, 'edit-hint', true);
    wrap.append(kanji.g, kana.g, translation.g, sentence.g, sentenceTr.g, hint.g);

    // Видео-фрагмент (мини-плеер + правка начала/конца) и свой звук.
    if (window.AnimeiClipTrim) wrap.appendChild(window.AnimeiClipTrim.buildForWord(wordData));
    wrap.appendChild(buildAudioControl(wordData));

    function close() {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.word-modal__close').addEventListener('click', close);
    overlay.querySelector('.cancel-btn').addEventListener('click', close);
    overlay.querySelector('.save-btn').addEventListener('click', async () => {
        const patch = {
            kanji: kanji.input.value,
            kana: kana.input.value,
            translation: translation.input.value,
            sentence: sentence.input.value,
            sentenceTranslation: sentenceTr.input.value,
            hint: hint.input.value,
        };
        await updateWord(wordData.id, patch);
        Object.assign(wordData, patch);   // держим кэш свежим для фильтра/перерисовки
        close();
        if (onSaved) onSaved();
        showSnackbar(t('words.savedSnack'), { duration: 3000, type: 'success' });
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    kanji.input.focus();
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
                ${wordData.sentence ? `<div class="word-card__explain-out hidden"></div>` : ''}
                <div class="word-card__actions">
                    <button class="btn btn--ghost edit-btn">${t('words.edit')}</button>
                    ${wordData.sentence ? `<button class="btn btn--ghost word-card__explain has-ai-icon" ${aiAvailable ? '' : 'hidden'}><svg class="ai-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 2 9.15 6.15 5 8l4.15 1.85L11 14l1.85-4.15L17 8l-4.15-1.85L11 2Zm7.5 9-1.1 2.4-2.4 1.1 2.4 1.1 1.1 2.4 1.1-2.4 2.4-1.1-2.4-1.1L18.5 11Z"/></svg><span class="btn-label">${t('words.explain')}</span></button>` : ''}
                </div>
            </div>
        `;

        wordEl.querySelector('.word-card__delete').addEventListener('click', async () => {
            await deleteWord(wordData.id);
            allWords = allWords.filter((w) => w.id !== wordData.id);
            renderWords();
        });

        wordEl.querySelector('.edit-btn').addEventListener('click', () => {
            openWordEditModal(wordData, renderWords);
        });

        const explainBtn = wordEl.querySelector('.word-card__explain');
        if (explainBtn) {
            const out = wordEl.querySelector('.word-card__explain-out');
            explainBtn.addEventListener('click', () => runWordExplain(wordData, explainBtn, out));
        }

        wordsListEl.appendChild(wordEl);
    }

    // Есть слова с ещё не готовым клипом — тихо перепроверим их чуть позже.
    if (words.some((w) => clipBadge(w) === 'pending')) scheduleClipRefresh();
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
