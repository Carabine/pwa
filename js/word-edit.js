// Общий модуль редактирования карточки слова: модалка с полями (слово, чтение,
// значение, предложение, перевод, подсказка) + правка видео-фрагмента и своего
// звука. Используется и в словаре (words.js), и в режиме обучения (study-core.js),
// чтобы правка была одинаковой везде.
//
// Зависимости (глобальные, подключать ПЕРЕД этим файлом): i18n.js (t),
// words-store.js (updateWord, getWordAudioUrl/setWordAudio/clearWordAudio),
// snackbar.js (showSnackbar), clip-trim.js (window.AnimeiClipTrim).
(function () {
    'use strict';

    // Экранируем пользовательский текст — он идёт и в разметку, и в атрибуты value.
    function esc(s) {
        return String(s ?? '').replace(/[&<>"]/g, (c) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
        ));
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

        // refresh() зовётся многократно (загрузка/запись/удаление звука). Каждый
        // getWordAudioUrl у гостя создаёт новый blob-URL — старый освобождаем,
        // иначе они копятся до перезагрузки страницы.
        let currentAudioUrl = null;
        function releaseAudioUrl() {
            if (currentAudioUrl && currentAudioUrl.startsWith('blob:')) URL.revokeObjectURL(currentAudioUrl);
            currentAudioUrl = null;
        }
        async function refresh() {
            if (typeof getWordAudioUrl !== 'function') return;
            const url = await getWordAudioUrl(wordData);
            releaseAudioUrl();
            if (url) {
                currentAudioUrl = url;
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
    // успешного сохранения (перерисовать список / карточку обучения). Правку
    // видео-фрагмента и звука монтируем внутрь: они сохраняются сами, отдельно.
    // opts.onDelete / opts.onDecks (необязательные) добавляют в подвал кнопки
    // «Удалить» и «В колоды» — у компактного списка словаря нет своих кнопок.
    function open(wordData, onSaved, opts) {
        opts = opts || {};
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
                    <span class="word-modal__foot-left">
                        ${opts.onDelete ? `<button class="btn btn--ghost word-modal__delete delete-btn" type="button">${esc(t('words.bulkDelete'))}</button>` : ''}
                        ${opts.onDecks ? `<button class="btn btn--ghost decks-btn" type="button">${esc(t('decks.add'))}</button>` : ''}
                    </span>
                    <button class="btn btn--ghost cancel-btn" type="button">${esc(t('words.cancel'))}</button>
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
        function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.word-modal__close').addEventListener('click', close);
        overlay.querySelector('.cancel-btn').addEventListener('click', close);
        overlay.querySelector('.delete-btn')?.addEventListener('click', () => { close(); opts.onDelete(); });
        overlay.querySelector('.decks-btn')?.addEventListener('click', () => opts.onDecks());
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

    window.AnimeiWordEdit = { open };
})();
