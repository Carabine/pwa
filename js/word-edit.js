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
    // Экранирование — единое escHtml из app.js (вызов отложен: порядок загрузки).
    function esc(s) {
        return escHtml(s ?? '');
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

    // Блок «Озвучка»: генерируем звук карточки нейроголосом (слово + пример,
    // POST /words/tts) — для карточек без клипа из аниме. Хранится как обычный
    // звук карточки: у вошедшего на сервере, у гостя в браузере (IndexedDB).
    function buildTtsControl(wordData) {
        const box = document.createElement('div');
        box.className = 'word-audio';

        const title = document.createElement('div');
        title.className = 'clip-edit__title';
        title.textContent = t('words.tts');
        box.appendChild(title);

        const player = document.createElement('audio');
        player.className = 'word-audio__player';
        player.controls = true;
        player.hidden = true;

        const genBtn = document.createElement('button');
        genBtn.type = 'button';
        genBtn.className = 'btn btn--ghost';
        genBtn.textContent = t('words.ttsGen');

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn btn--ghost word-audio__remove';
        removeBtn.textContent = t('words.audioRemove');
        removeBtn.hidden = true;

        // refresh() зовётся многократно. Каждый getWordAudioUrl у гостя создаёт
        // новый blob-URL — старый освобождаем, иначе копятся до перезагрузки.
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
                genBtn.textContent = t('words.ttsRegen');
            } else {
                player.hidden = true;
                player.removeAttribute('src');
                removeBtn.hidden = true;
                genBtn.textContent = t('words.ttsGen');
            }
        }

        genBtn.addEventListener('click', async () => {
            // Голос читает само слово и, если есть, пример целиком.
            const text = [wordData.kanji, wordData.sentence]
                .map((s) => String(s || '').trim()).filter(Boolean).join('。');
            if (!text) return;
            genBtn.disabled = true;
            const oldLabel = genBtn.textContent;
            genBtn.textContent = t('words.ttsBusy');
            try {
                const { data } = await client.post('words/tts', { text }, {
                    responseType: 'blob', timeout: 60000,
                });
                const url = await setWordAudio(wordData, data);
                if (!url) throw new Error('audio not stored');
                await refresh();
                showSnackbar(t('words.ttsDone'), { duration: 2500, type: 'success' });
            } catch (err) {
                console.error('Не удалось сгенерировать озвучку:', err);
                genBtn.textContent = oldLabel;
                showSnackbar(t('words.ttsFail'), { duration: 3500, type: 'error' });
            } finally {
                genBtn.disabled = false;
            }
        });

        removeBtn.addEventListener('click', async () => {
            if (typeof clearWordAudio === 'function') await clearWordAudio(wordData);
            await refresh();
        });

        const row = document.createElement('div');
        row.className = 'word-audio__row';
        row.append(genBtn, removeBtn);
        box.append(row, player);
        refresh();
        return box;
    }

    // Редактирование карточки слова — модальным окном. onSaved зовём после
    // успешного сохранения (перерисовать список / карточку обучения). Правку
    // видео-фрагмента и звука монтируем внутрь: они сохраняются сами, отдельно.
    // opts.onDelete / opts.onDecks (необязательные) добавляют в подвал иконки
    // «Удалить» и «В колоды» — у компактного списка словаря нет своих кнопок.
    // Слева иконки, справа текстовые «Отмена»/«Сохранить»: четыре текстовые
    // кнопки не влезали в одну строку узкой модалки.
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
                        ${opts.onDelete ? `<button class="btn btn--ghost word-modal__ibtn word-modal__delete delete-btn" type="button" title="${esc(t('words.bulkDelete'))}" aria-label="${esc(t('words.bulkDelete'))}">🗑</button>` : ''}
                        ${opts.onDecks ? `<button class="btn btn--ghost word-modal__ibtn decks-btn" type="button" title="${esc(t('decks.add'))}" aria-label="${esc(t('decks.add'))}">📚</button>` : ''}
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

        // Видео-фрагмент (мини-плеер + правка начала/конца) и озвучка.
        if (window.AnimeiClipTrim) wrap.appendChild(window.AnimeiClipTrim.buildForWord(wordData));
        wrap.appendChild(buildTtsControl(wordData));

        // mousedown вместо click: выделение текста в поле, отпущенное на фоне,
        // не должно закрывать редактор. Удаляем без анимации (нет is-open стилей).
        const modal = modalLayer(overlay, {
            backdropEvent: 'mousedown',
            stopEsc: true,
            onHide: () => overlay.remove(),
        });
        const close = modal.close;
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

        modal.open();
        kanji.input.focus();
    }

    window.AnimeiWordEdit = { open };
})();
