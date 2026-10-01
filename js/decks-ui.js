// UI колод на экране словаря: кнопка выбора колоды, кнопка «Учить», меню карточки
// «в колоды» (bottom sheet) и управление активной колодой. Данные — window.Decks.
//
// Экран словаря остаётся плоским и знакомым; колоды — необязательный слой поверх,
// а не второй режим приложения. Точки интеграции с words.js:
//   DecksUI.init({chips, study, hint, getWords, onChange})
//   DecksUI.visible(word)       — проходит ли слово фильтр по активной колоде
//   DecksUI.decorateCard(el, w) — мини-чипы членства + кнопка «в колоды» на карточке
//   DecksUI.refresh()           — перерисовать чипы/кнопку/подсказку
(function () {
    function t(k) { return typeof window.t === 'function' ? window.t(k) : k; }
    function snack(msg) { if (typeof showSnackbar === 'function') showSnackbar(msg, { duration: 2000 }); }

    // Экранирование — единое escHtml из app.js (вызов отложен: порядок загрузки).
    function esc(s) {
        return escHtml(s ?? '');
    }

    function h(tag, cls, html) {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (html != null) el.innerHTML = html;
        return el;
    }

    const HINT_KEY = 'animei:decksHintDismissed';

    // Значок «все колоды/все слова» — SVG-«слои» в стиле остальных иконок
    // интерфейса (эмодзи 🗂 читался плохо, стопка-прямоугольники выглядела как
    // «копировать»). Тот же значок у «В колоды» в модалке слова (word-edit.js).
    // Размеры задаёт CSS (.deck-pick__emoji svg / .deck-sheet__emoji svg).
    const STACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>';

    // Карандаш на кнопке «⋯» рядом с «Учить»: раньше там были три точки, но
    // открывалась ими не менюшка, а редактор колоды — значок обещал не то.
    // Три точки переехали внутрь редактора, к действиям (заморозить, удалить).
    const PENCIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>';
    // Значки пунктов меню — те же, что в меню слова (js/word-edit.js).
    const MENU_ICON = (inner) => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
    const FREEZE_ICON = MENU_ICON('<path d="M12 2v20"/><path d="m20 7-16 10"/><path d="m4 7 16 10"/><path d="m9 4 3 3 3-3"/><path d="m9 20 3-3 3 3"/>');
    const TRASH_ICON = MENU_ICON('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>');

    // Кнопка-фильтр справа от пилюли: воронка, открывает шторку выбора колоды.
    const FILTER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';

    const UI = {
        _activeId: null,
        _ctx: null,   // { chips, study, hint, getWords, onChange }

        init(ctx) {
            this._ctx = ctx;
            this.refresh();
        },

        activeDeckId() { return this._activeId; },

        // Проходит ли слово текущий фильтр по колоде. '__none__' — виртуальный
        // фильтр «Без колоды»: слова, не попавшие ни в одну (удобно раскладывать).
        visible(word) {
            if (!this._activeId) return true;
            if (!window.Decks) return true;
            if (this._activeId === '__none__') return Decks.decksOf(word.id).length === 0;
            return Decks.has(this._activeId, word.id);
        },

        // Сколько слов активной колоды реально есть в коллекции (мёртвые id не в счёт).
        _availableCount(deckId) {
            const deck = Decks.get(deckId);
            if (!deck) return 0;
            // Явно замороженные слова прогон колоды пропускает (deck-study.js) —
            // не обещаем их в счётчике.
            const ids = new Set((this._ctx.getWords() || [])
                .filter(w => !(window.Freeze && Freeze.isWord(w))).map(w => w.id));
            return deck.wordIds.filter(id => ids.has(id)).length;
        },

        refresh() {
            if (!this._ctx || !window.Decks) return;
            this._renderChips();
            this._renderStudyRow();
            this._renderHint();
        },

        // ---- Кнопка выбора колоды --------------------------------------------
        // Раньше здесь был горизонтальный ряд чипов. На телефоне в него влезала
        // ровно одна колода, а обрезанный край читался как конец списка — что
        // ряд листается вбок, никто не догадывался. Теперь фильтр — одна кнопка
        // во всю ширину, а весь список колод открывается шторкой.
        _renderChips() {
            const box = this._ctx.chips;
            if (!box) return;
            const decks = Decks.visible();

            // Активную колоду удалили извне — откатываемся на «Все».
            if (this._activeId && this._activeId !== '__none__'
                && !decks.some(d => d.id === this._activeId)) this._activeId = null;

            box.innerHTML = '';

            if (decks.length === 0) {
                // Колод ещё нет — только приглашающий чип, без фильтра.
                const add = h('button', 'deck-chip deck-chip--add', '＋ ' + esc(t('decks.createFirst')));
                add.addEventListener('click', () => this._openEditor({ mode: 'create' }));
                box.appendChild(add);
                box.hidden = false;
                return;
            }

            const loose = this._looseCount();
            if (this._activeId === '__none__' && loose === 0) this._activeId = null;

            const active = this._activeId && this._activeId !== '__none__' ? Decks.get(this._activeId) : null;
            let emoji = STACK_ICON;
            let name = t('decks.pickAll');
            let count = decks.length;
            if (active) {
                emoji = Decks.iconHtml(active);
                name = (active.frozen ? '❄ ' : '') + active.name;
                count = active.wordIds.length;
            }
            else if (this._activeId === '__none__') { emoji = '·'; name = t('decks.noDeck'); count = loose; }

            const pick = h('button', 'deck-pick' + (this._activeId ? ' deck-pick--on' : ''),
                `<span class="deck-pick__emoji">${emoji}</span>` +
                `<span class="deck-pick__name">${esc(name)}</span>` +
                `<span class="deck-pick__count">${count}</span>` +
                '<span class="deck-pick__caret"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>');
            pick.setAttribute('aria-haspopup', 'dialog');
            pick.addEventListener('click', () => this._openPicker());
            box.appendChild(pick);

            // Пилюля слева отвечает за колоду, воронка — за остальной показ
            // списка (сортировка, вид): её модалку даёт страница через onFilters.
            const label = this._ctx.onFilters ? t('words.filters') : t('decks.pickTitle');
            const filter = h('button', 'deck-chip deck-chip--pinned deck-chip--filter', FILTER_ICON);
            filter.title = label;
            filter.setAttribute('aria-label', label);
            filter.classList.toggle('deck-chip--filter-on',
                !!(this._ctx.filtersActive && this._ctx.filtersActive()));
            filter.addEventListener('click', () => {
                if (this._ctx.onFilters) this._ctx.onFilters();
                else this._openPicker();
            });
            box.appendChild(filter);
            box.hidden = false;
        },

        // Сколько слов коллекции ещё не разложено ни в одну колоду.
        _looseCount() {
            return (this._ctx.getWords() || []).filter(w => Decks.decksOf(w.id).length === 0).length;
        },

        // ---- Шторка выбора колоды (фильтр словаря) ---------------------------
        _openPicker() {
            const overlay = h('div', 'deck-sheet__overlay');
            const sheet = h('div', 'deck-sheet');
            const modal = modalLayer(overlay);
            const close = modal.close;

            const head = h('div', 'deck-sheet__head',
                `<div><div class="deck-sheet__title">${esc(t('decks.pickTitle'))}</div></div>`);
            const x = h('button', 'deck-sheet__x', '×');
            x.addEventListener('click', close);
            head.appendChild(x);
            sheet.appendChild(head);

            const list = h('div', 'deck-sheet__list');
            const total = (this._ctx.getWords() || []).length;

            // Строка списка: значок, имя, счётчик и галочка у текущего фильтра.
            // ico начинается с '<' — это доверенная SVG (STACK_ICON), не экранируем.
            const addRow = (id, ico, label, n) => {
                const on = this._activeId === id;
                const row = h('button', 'deck-sheet__row' + (on ? ' is-on' : ''),
                    `<span class="deck-sheet__emoji">${ico.startsWith('<') ? ico : esc(ico)}</span>` +
                    `<span class="deck-sheet__name">${esc(label)}</span>` +
                    `<span class="deck-chip__count">${n}</span>` +
                    `<span class="deck-sheet__check">${on ? '✓' : ''}</span>`);
                row.addEventListener('click', () => { close(); this._setActive(id); });
                list.appendChild(row);
            };

            addRow(null, STACK_ICON, t('decks.allWords'), total);
            for (const d of Decks.visible()) {
                addRow(d.id, Decks.iconHtml(d), (d.frozen ? '❄ ' : '') + d.name, d.wordIds.length);
            }
            const loose = this._looseCount();
            if (loose > 0) addRow('__none__', '·', t('decks.noDeck'), loose);

            const create = h('button', 'deck-sheet__create', '＋ ' + esc(t('decks.create')));
            create.addEventListener('click', () => {
                this._openEditor({ mode: 'create', then: (deck) => { if (deck) { close(); this._setActive(deck.id); } } });
            });

            sheet.appendChild(list);
            sheet.appendChild(create);
            overlay.appendChild(sheet);
            modal.open();
        },

        _setActive(id) {
            this._activeId = id;
            this.refresh();
            this._ctx.onChange();   // перерисовать список словаря под новый фильтр
        },

        // ---- Кнопка «Учить (N)» + управление активной колодой -----------------
        _renderStudyRow() {
            const row = this._ctx.study;
            if (!row) return;
            row.innerHTML = '';
            const deck = this._activeId ? Decks.get(this._activeId) : null;
            if (!deck) { row.hidden = true; return; }

            const n = this._availableCount(deck.id);
            const learn = h('button', 'btn btn--success deck-study__go', `▶ ${esc(t('decks.study'))} (${n})`);
            learn.disabled = n === 0;
            learn.addEventListener('click', () => {
                location.href = 'deck-study.html?deck=' + encodeURIComponent(deck.id);
            });

            const more = h('button', 'btn btn--ghost deck-study__more', PENCIL_ICON);
            more.title = t('decks.manage');
            more.setAttribute('aria-label', t('decks.manage'));
            more.addEventListener('click', () => this._openEditor({ mode: 'manage', id: deck.id }));

            row.appendChild(learn);
            row.appendChild(more);
            row.hidden = false;
        },

        // ---- Ненавязчивая подсказка первого запуска ---------------------------
        _renderHint() {
            const el = this._ctx.hint;
            if (!el) return;
            const show = Decks.visible().length === 0 && localStorage.getItem(HINT_KEY) !== '1';
            el.hidden = !show;
            // У вошедшего колоды синхронизируются с аккаунтом, у гостя — локальные.
            const signedIn = typeof isLoggedIn === 'function' && isLoggedIn();
            if (show) el.textContent = t(signedIn ? 'decks.hintSynced' : 'decks.hint');
        },

        // ---- Украшаем карточку словаря: мини-чипы колод внизу карточки.
        // Кнопки здесь больше нет — действия живут в меню «⋯» самой карточки.
        decorateCard(wordEl, word) {
            if (!window.Decks) return;
            const card = wordEl.querySelector('.word-card');
            if (!card) return;

            const member = Decks.decksOf(word.id);
            if (!member.length) return;
            const wrap = h('div', 'word-card__decks');
            for (const d of member) {
                const chip = h('span', 'word-deck-chip', `${Decks.iconHtml(d)}<span>${esc(d.name)}</span>`);
                chip.title = d.name;
                wrap.appendChild(chip);
            }
            card.appendChild(wrap);
        },

        // Публичная обёртка для words.js (компактный список зовёт sheet сам).
        openSheet(word) { this._openSheet(word); },

        // ---- Массовое добавление: выбранные слова → одна колода ---------------
        // wordIds — id выбранных слов; onDone(added, deck) — после добавления.
        openBulkSheet(wordIds, onDone) {
            const ids = (wordIds || []).slice();
            if (!ids.length) return;

            const overlay = h('div', 'deck-sheet__overlay');
            const sheet = h('div', 'deck-sheet');
            const modal = modalLayer(overlay);
            const close = modal.close;

            const finishAdd = (deck) => {
                const added = Decks.addMany(deck.id, ids);
                snack(t('decks.addedN').replace('{n}', added));
                close();
                this.refresh();
                if (onDone) onDone(added, deck);
            };

            const head = h('div', 'deck-sheet__head',
                `<div><div class="deck-sheet__title">${esc(t('decks.sheetTitle'))}</div>` +
                `<div class="deck-sheet__word">${esc(t('words.selectedN').replace('{n}', ids.length))}</div></div>`);
            const x = h('button', 'deck-sheet__x', '×');
            x.addEventListener('click', close);
            head.appendChild(x);
            sheet.appendChild(head);

            const list = h('div', 'deck-sheet__list');
            const decks = Decks.visible();
            if (!decks.length) list.appendChild(h('div', 'deck-sheet__empty', esc(t('decks.noneYet'))));
            for (const d of decks) {
                const row = h('button', 'deck-sheet__row',
                    `<span class="deck-sheet__emoji">${Decks.iconHtml(d)}</span>` +
                    `<span class="deck-sheet__name">${esc(d.name)}</span>` +
                    `<span class="deck-chip__count">${d.wordIds.length}</span>`);
                row.addEventListener('click', () => finishAdd(d));
                list.appendChild(row);
            }

            const create = h('button', 'deck-sheet__create', '＋ ' + esc(t('decks.create')));
            create.addEventListener('click', () => {
                this._openEditor({ mode: 'create', then: (deck) => { if (deck) finishAdd(deck); } });
            });

            sheet.appendChild(list);
            sheet.appendChild(create);
            overlay.appendChild(sheet);
            modal.open();
        },

        // ---- Bottom sheet «Добавить в колоды» ---------------------------------
        _openSheet(word) {
            const overlay = h('div', 'deck-sheet__overlay');
            const sheet = h('div', 'deck-sheet');
            let statusTimer = null;

            const modal = modalLayer(overlay, {
                afterHide: () => {
                    this.refresh();          // счётчики чипов
                    this._ctx.onChange();    // мини-чипы на карточках
                },
            });
            const close = modal.close;

            const head = h('div', 'deck-sheet__head',
                `<div><div class="deck-sheet__title">${esc(t('decks.sheetTitle'))}</div>` +
                `<div class="deck-sheet__word">${esc(word.kanji || '')}</div></div>`);
            const x = h('button', 'deck-sheet__x', '×');
            x.addEventListener('click', close);
            head.appendChild(x);
            sheet.appendChild(head);

            const list = h('div', 'deck-sheet__list');
            const statusEl = h('div', 'deck-sheet__status');
            const status = (msg) => {
                statusEl.textContent = msg;
                statusEl.classList.add('is-show');
                clearTimeout(statusTimer);
                statusTimer = setTimeout(() => statusEl.classList.remove('is-show'), 1400);
            };

            const renderList = () => {
                list.innerHTML = '';
                const decks = Decks.visible();
                if (!decks.length) {
                    list.appendChild(h('div', 'deck-sheet__empty', esc(t('decks.noneYet'))));
                }
                for (const d of decks) {
                    const on = Decks.has(d.id, word.id);
                    // Слово из АКТИВНОЙ колоды не даём выкинуть отсюда: фильтр
                    // открыт по ней, и случайный тап убирал бы слово из-под ног.
                    const locked = on && d.id === this._activeId;
                    const row = h('button', 'deck-sheet__row' + (on ? ' is-on' : '') + (locked ? ' is-locked' : ''),
                        `<span class="deck-sheet__emoji">${Decks.iconHtml(d)}</span>` +
                        `<span class="deck-sheet__name">${esc(d.name)}</span>` +
                        `<span class="deck-sheet__check">${on ? '✓' : ''}</span>`);
                    if (locked) {
                        row.disabled = true;
                        row.title = t('decks.lockedActive');
                    } else {
                        row.addEventListener('click', () => {
                            const nowOn = Decks.toggle(d.id, word.id);
                            row.classList.toggle('is-on', nowOn);
                            row.querySelector('.deck-sheet__check').textContent = nowOn ? '✓' : '';
                            this.refresh();
                            status(nowOn ? t('decks.added') : t('decks.removed'));
                        });
                    }
                    list.appendChild(row);
                }
            };

            const create = h('button', 'deck-sheet__create', '＋ ' + esc(t('decks.create')));
            create.addEventListener('click', () => {
                this._openEditor({
                    mode: 'create',
                    then: (deck) => {
                        if (deck) { Decks.toggle(deck.id, word.id); renderList(); this.refresh(); status(t('decks.added')); }
                    },
                });
            });

            sheet.appendChild(list);
            sheet.appendChild(statusEl);
            sheet.appendChild(create);
            overlay.appendChild(sheet);
            renderList();
            modal.open();
        },

        // ---- Меню «⋯» в шапке редактора: действия над колодой ----------------
        // Живёт рядом с кнопкой (position: absolute внутри обёртки), как меню
        // слова. Пункты применяются сразу — это действия, а не поля формы.
        _toggleDeckMenu(wrap, id, opts) {
            const open = wrap.querySelector('.words-menu');
            if (open) { open.remove(); return; }

            const menu = h('div', 'words-menu word-actions', [
                `<button data-act="freeze">${FREEZE_ICON}${esc(t(opts.isFrozen() ? 'decks.unfreeze' : 'decks.freeze'))}</button>`,
                '<hr class="words-menu__hr">',
                `<button data-act="delete" class="word-actions__danger">${TRASH_ICON}${esc(t('decks.delete'))}</button>`,
            ].join(''));

            const close = () => {
                menu.remove();
                document.removeEventListener('click', onDoc, true);
            };
            const onDoc = (e) => {
                if (!e.target.closest('.words-menu') && !e.target.closest('.deck-editor__kebab')) close();
            };

            menu.addEventListener('click', (e) => {
                const act = e.target.closest('[data-act]');
                if (!act) return;
                close();
                if (act.dataset.act === 'freeze') opts.onFreeze();
                else if (act.dataset.act === 'delete') opts.onDelete();
            });

            wrap.appendChild(menu);
            document.addEventListener('click', onDoc, true);
        },

        // ---- Редактор колоды: создание и управление (имя, значок, удаление) ---
        _openEditor({ mode, id, then }) {
            const editing = mode === 'manage';
            const deck = editing ? Decks.get(id) : null;
            if (editing && !deck) return;

            let chosen = deck ? deck.emoji : Decks.EMOJIS[0];
            // Аватарка тайтла (колоды серий): первая ячейка палитры. Выбор
            // эмодзи её не удаляет, а выключает — вернуть можно в любой момент.
            const avatarSrc = deck ? Decks.iconSrc(deck) : '';
            let useIcon = deck ? Decks.iconEnabled(deck) : false;

            const overlay = h('div', 'deck-sheet__overlay');
            const box = h('div', 'deck-editor');
            let pending = null;               // результат, с которым закрываемся
            const modal = modalLayer(overlay, {
                // Esc и клик по фону закрывают без результата (pending остаётся null).
                afterHide: () => {
                    const result = pending; pending = null;
                    if (then) then(result || null);
                },
            });
            const finish = (result) => {
                pending = result || null;
                modal.close();
            };

            let frozen = !!(deck && deck.frozen);

            // Шапка: слева название, справа «⋯» с действиями над колодой и
            // крестик — ровно как в шапке карточки слова. Сами действия
            // (заморозить, удалить) живут под точками, а не отдельными блоками
            // в теле: тело редактора — это то, что правят и сохраняют.
            const head = h('div', 'deck-editor__head');
            head.appendChild(h('span', 'deck-editor__head-title',
                esc(editing ? t('decks.manage') : t('decks.newTitle'))));
            const headActions = h('span', 'deck-editor__head-actions');
            let kebabWrap = null;
            if (editing) {
                kebabWrap = h('span', 'deck-editor__kebab-wrap');
                const kebab = h('button', 'deck-editor__hbtn deck-editor__kebab', '⋯');
                kebab.type = 'button';
                kebab.title = t('words.actions');
                kebab.setAttribute('aria-label', t('words.actions'));
                kebab.setAttribute('aria-haspopup', 'menu');
                kebabWrap.appendChild(kebab);
                headActions.appendChild(kebabWrap);
                kebab.addEventListener('click', () => this._toggleDeckMenu(kebabWrap, id, {
                    isFrozen: () => frozen,
                    onFreeze: () => {
                        frozen = !frozen;
                        Decks.setFrozen(id, frozen);
                        note.hidden = !frozen;
                        this.refresh();
                        this._ctx.onChange();
                        snack(t(frozen ? 'decks.frozenOn' : 'decks.frozenOff'));
                    },
                    onDelete: async () => {
                        if (!(await confirmDialog({ title: t('decks.deleteConfirm'), ok: t('decks.delete'), danger: true }))) return;
                        Decks.remove(id);
                        if (this._activeId === id) this._activeId = null;
                        snack(t('decks.deleted'));
                        this.refresh();
                        this._ctx.onChange();
                        finish(null);
                    },
                }));
            }
            const closeBtn = h('button', 'deck-editor__hbtn deck-editor__close', '×');
            closeBtn.type = 'button';
            closeBtn.setAttribute('aria-label', t('words.cancel'));
            closeBtn.addEventListener('click', () => finish(null));
            headActions.appendChild(closeBtn);
            head.appendChild(headActions);
            box.appendChild(head);

            // Строка состояния — только у замороженной колоды: постоянный
            // тумблер с пояснением занимал полредактора ради настройки, к
            // которой возвращаются раз в жизни.
            const note = h('div', 'deck-editor__note',
                '<span class="deck-editor__note-ico">\u2744</span>'
                + `<span>${esc(t('decks.frozenNote'))}</span>`);
            note.hidden = !frozen;
            box.appendChild(note);

            const palette = h('div', 'deck-editor__emojis');
            const select = (b) => {
                palette.querySelectorAll('.deck-editor__emoji').forEach(x => x.classList.remove('is-sel'));
                b.classList.add('is-sel');
            };
            if (avatarSrc) {
                const b = h('button', 'deck-editor__emoji deck-editor__avatar' + (useIcon ? ' is-sel' : ''),
                    `<img src="${avatarSrc}" alt="" title="${esc(t('decks.avatar'))}">`);
                b.addEventListener('click', () => { useIcon = true; select(b); });
                palette.appendChild(b);
            }
            Decks.EMOJIS.forEach((e) => {
                const b = h('button', 'deck-editor__emoji' + (!useIcon && e === chosen ? ' is-sel' : ''), e);
                b.addEventListener('click', () => {
                    chosen = e;
                    useIcon = false;
                    select(b);
                });
                palette.appendChild(b);
            });
            box.appendChild(palette);

            const input = h('input', 'deck-editor__input');
            input.type = 'text';
            input.maxLength = 50;
            input.placeholder = t('decks.namePlaceholder');
            if (deck) input.value = deck.name;
            box.appendChild(input);

            const actions = h('div', 'deck-editor__actions');
            const save = h('button', 'btn btn--success', esc(editing ? t('decks.save') : t('decks.create')));
            save.addEventListener('click', () => {
                const name = input.value.trim();
                if (!name) { input.focus(); return; }
                if (editing) {
                    Decks.rename(id, name);
                    Decks.setEmoji(id, chosen);
                    Decks.setIconEnabled(id, useIcon);
                    this.refresh();
                    this._ctx.onChange();
                    finish(Decks.get(id));
                } else {
                    const created = Decks.create(name, chosen);
                    if (window.animeiTrack) animeiTrack('deck', 'create');
                    localStorage.setItem(HINT_KEY, '1');
                    snack(t('decks.created'));
                    this.refresh();
                    finish(created);
                }
            });

            const cancel = h('button', 'btn btn--ghost', esc(t('words.cancel')));
            cancel.addEventListener('click', () => finish(null));

            actions.appendChild(cancel);
            actions.appendChild(save);
            box.appendChild(actions);

            overlay.appendChild(box);
            modal.open();
            // Автофокус имени — только с физической клавиатурой: на таче он
            // сразу выдвигал экранную клавиатуру поверх модалки.
            if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
                requestAnimationFrame(() => input.focus());
            }
        },
    };

    window.DecksUI = UI;
})();
