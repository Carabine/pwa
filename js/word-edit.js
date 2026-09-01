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
                if (window.animeiTrack) animeiTrack('tts', 'card');
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

    // Иконки пунктов меню действий над словом — общие для меню «⋯» модалки
    // и меню «⋯» строк списка (words.js берёт их из AnimeiWordEdit.menuIcons).
    const ICON = (inner) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
    const MENU_ICONS = {
        edit: ICON('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>'),
        decks: ICON('<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="M2 12.65l9.17 4.16a2 2 0 0 0 1.66 0l4.5-2.04"/><path d="M2 17.65l9.17 4.16a2 2 0 0 0 1.66 0l4.5-2.04"/><path d="M20.5 13.5v6"/><path d="M17.5 16.5h6"/>'),
        copy: ICON('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
        del: ICON('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>'),
    };

    // Скопировать карточку текстом: «слово（чтение） — перевод» + пример.
    // Живёт здесь, чтобы и меню модалки, и меню «⋯» списка (words.js)
    // пользовались одним кодом.
    async function copyWord(w) {
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

    // Редактирование карточки слова — модальным окном. onSaved зовём после
    // успешного сохранения (перерисовать список / карточку обучения). Правку
    // видео-фрагмента и звука монтируем внутрь: они сохраняются сами, отдельно.
    // Действия над словом (В колоды/Скопировать/Удалить) — в меню «⋯» рядом с
    // крестиком, как у строк списка: шапка остаётся чистой (заголовок + ⋯ + ×).
    // opts.onDelete / opts.onDecks (необязательные) добавляют свои пункты.
    function open(wordData, onSaved, opts) {
        opts = opts || {};
        const overlay = document.createElement('div');
        overlay.className = 'word-modal';
        overlay.innerHTML = `
            <div class="word-modal__dialog" role="dialog" aria-modal="true" aria-label="${esc(t('words.edit'))}">
                <div class="word-modal__head">
                    <span class="word-modal__title">${esc(t('words.edit'))}</span>
                    <span class="word-modal__head-actions">
                        <span class="word-modal__kebab-wrap">
                            <button class="word-modal__hbtn word-modal__kebab kebab-btn" type="button" title="${esc(t('words.actions'))}" aria-label="${esc(t('words.actions'))}" aria-haspopup="menu">⋯</button>
                        </span>
                        <button class="word-modal__close" type="button" aria-label="${esc(t('words.cancel'))}">&times;</button>
                    </span>
                </div>
                <div class="word-modal__body"><div class="word-edit"></div></div>
                <div class="word-modal__foot">
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
            onHide: () => { closeMenu(); overlay.remove(); },
        });
        const close = modal.close;
        overlay.querySelector('.word-modal__close').addEventListener('click', close);
        overlay.querySelector('.cancel-btn').addEventListener('click', close);

        // Меню «⋯»: В колоды / Скопировать / Удалить. Разметка и стили те же,
        // что у меню строк списка (.words-menu), якорь — обёртка кнопки.
        const kebab = overlay.querySelector('.kebab-btn');
        let menuEl = null;
        const onDocClick = (e) => {
            if (!e.target.closest('.words-menu') && !e.target.closest('.kebab-btn')) closeMenu();
        };
        function closeMenu() {
            if (!menuEl) return;
            menuEl.remove();
            menuEl = null;
            document.removeEventListener('click', onDocClick, true);
        }
        kebab.addEventListener('click', () => {
            if (menuEl) { closeMenu(); return; }
            menuEl = document.createElement('div');
            menuEl.className = 'words-menu word-actions';
            menuEl.innerHTML = [
                opts.onDecks ? `<button data-act="decks">${MENU_ICONS.decks}${esc(t('decks.add'))}</button>` : '',
                `<button data-act="copy">${MENU_ICONS.copy}${esc(t('words.copy'))}</button>`,
                opts.onDelete ? `<hr class="words-menu__hr"><button data-act="delete" class="word-actions__danger">${MENU_ICONS.del}${esc(t('words.bulkDelete'))}</button>` : '',
            ].join('');
            menuEl.addEventListener('click', (e) => {
                const act = e.target.closest('[data-act]')?.dataset.act;
                if (!act) return;
                closeMenu();
                if (act === 'decks') opts.onDecks();
                else if (act === 'copy') copyWord(wordData);
                else if (act === 'delete') { close(); opts.onDelete(); }
            });
            kebab.parentElement.appendChild(menuEl);
            document.addEventListener('click', onDocClick, true);
        });
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
        // Автофокус — только там, где есть физическая клавиатура: на таче он
        // сразу выдвигал экранную клавиатуру поверх модалки.
        if (matchMedia('(hover: hover) and (pointer: fine)').matches) kanji.input.focus();
    }

    window.AnimeiWordEdit = { open, copyWord, menuIcons: MENU_ICONS };
})();
