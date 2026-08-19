// UI колод на экране словаря: чип-ряд фильтра, кнопка «Учить», меню карточки
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

    function esc(s) {
        return String(s ?? '').replace(/[&<>"]/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
        ));
    }

    function h(tag, cls, html) {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (html != null) el.innerHTML = html;
        return el;
    }

    const HINT_KEY = 'animei:decksHintDismissed';

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
            const ids = new Set((this._ctx.getWords() || []).map(w => w.id));
            return deck.wordIds.filter(id => ids.has(id)).length;
        },

        refresh() {
            if (!this._ctx || !window.Decks) return;
            this._renderChips();
            this._renderStudyRow();
            this._renderHint();
        },

        // ---- Чип-ряд фильтра --------------------------------------------------
        _renderChips() {
            const box = this._ctx.chips;
            if (!box) return;
            const decks = Decks.all();

            // Активную колоду удалили извне — откатываемся на «Все».
            if (this._activeId && this._activeId !== '__none__'
                && !decks.some(d => d.id === this._activeId)) this._activeId = null;

            box.innerHTML = '';

            if (decks.length === 0) {
                // Колод ещё нет — только приглашающий чип, без фильтра «Все».
                const add = h('button', 'deck-chip deck-chip--add', '＋ ' + esc(t('decks.createFirst')));
                add.addEventListener('click', () => this._openEditor({ mode: 'create' }));
                box.appendChild(add);
                box.hidden = false;
                return;
            }

            // «Все» + колоды листаются, кнопка «＋» вынесена вправо и не скроллится.
            const scroll = h('div', 'deck-chips__scroll');
            const all = h('button', 'deck-chip' + (this._activeId ? '' : ' deck-chip--active'), esc(t('decks.all')));
            all.addEventListener('click', () => this._setActive(null));
            scroll.appendChild(all);

            for (const d of decks) {
                const active = d.id === this._activeId;
                const chip = h('button', 'deck-chip' + (active ? ' deck-chip--active' : ''),
                    `<span class="deck-chip__emoji">${d.emoji}</span>` +
                    `<span class="deck-chip__name">${esc(d.name)}</span>` +
                    `<span class="deck-chip__count">${d.wordIds.length}</span>`);
                chip.addEventListener('click', () => this._setActive(active ? null : d.id));
                scroll.appendChild(chip);
            }

            // «Без колоды» — сколько слов коллекции ещё не разложено.
            const loose = (this._ctx.getWords() || [])
                .filter(w => Decks.decksOf(w.id).length === 0).length;
            if (loose > 0) {
                const noneActive = this._activeId === '__none__';
                const none = h('button', 'deck-chip' + (noneActive ? ' deck-chip--active' : ''),
                    `<span class="deck-chip__name">${esc(t('decks.noDeck'))}</span>` +
                    `<span class="deck-chip__count">${loose}</span>`);
                none.addEventListener('click', () => this._setActive(noneActive ? null : '__none__'));
                scroll.appendChild(none);
            } else if (this._activeId === '__none__') {
                this._activeId = null;
            }
            box.appendChild(scroll);

            const add = h('button', 'deck-chip deck-chip--add deck-chip--pinned', '＋');
            add.title = t('decks.createFirst');
            add.addEventListener('click', () => this._openEditor({ mode: 'create' }));
            box.appendChild(add);
            box.hidden = false;

            // Затухание правого края — только когда чипы реально скроллятся.
            requestAnimationFrame(() => {
                scroll.classList.toggle('is-scrollable', scroll.scrollWidth > scroll.clientWidth + 1);
            });
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

            const more = h('button', 'btn btn--ghost deck-study__more', '⋯');
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
            const show = Decks.all().length === 0 && localStorage.getItem(HINT_KEY) !== '1';
            el.hidden = !show;
            if (show) el.textContent = t('decks.hint');
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
                const chip = h('span', 'word-deck-chip', `${d.emoji}<span>${esc(d.name)}</span>`);
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
            const close = () => {
                overlay.classList.remove('is-open');
                document.removeEventListener('keydown', onEsc);
                setTimeout(() => overlay.remove(), 180);
            };
            const onEsc = (e) => { if (e.key === 'Escape') close(); };
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
            document.addEventListener('keydown', onEsc);

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
            const decks = Decks.all();
            if (!decks.length) list.appendChild(h('div', 'deck-sheet__empty', esc(t('decks.noneYet'))));
            for (const d of decks) {
                const row = h('button', 'deck-sheet__row',
                    `<span class="deck-sheet__emoji">${d.emoji}</span>` +
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
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('is-open'));
        },

        // ---- Bottom sheet «Добавить в колоды» ---------------------------------
        _openSheet(word) {
            const overlay = h('div', 'deck-sheet__overlay');
            const sheet = h('div', 'deck-sheet');
            let statusTimer = null;

            const close = () => {
                overlay.classList.remove('is-open');
                document.removeEventListener('keydown', onEsc);
                setTimeout(() => overlay.remove(), 180);
                this.refresh();          // счётчики чипов
                this._ctx.onChange();    // мини-чипы на карточках
            };
            const onEsc = (e) => { if (e.key === 'Escape') close(); };
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
            document.addEventListener('keydown', onEsc);

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
                const decks = Decks.all();
                if (!decks.length) {
                    list.appendChild(h('div', 'deck-sheet__empty', esc(t('decks.noneYet'))));
                }
                for (const d of decks) {
                    const on = Decks.has(d.id, word.id);
                    const row = h('button', 'deck-sheet__row' + (on ? ' is-on' : ''),
                        `<span class="deck-sheet__emoji">${d.emoji}</span>` +
                        `<span class="deck-sheet__name">${esc(d.name)}</span>` +
                        `<span class="deck-sheet__check">${on ? '✓' : ''}</span>`);
                    row.addEventListener('click', () => {
                        const nowOn = Decks.toggle(d.id, word.id);
                        row.classList.toggle('is-on', nowOn);
                        row.querySelector('.deck-sheet__check').textContent = nowOn ? '✓' : '';
                        this.refresh();
                        status(nowOn ? t('decks.added') : t('decks.removed'));
                    });
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
            document.body.appendChild(overlay);
            renderList();
            requestAnimationFrame(() => overlay.classList.add('is-open'));
        },

        // ---- Редактор колоды: создание и управление (имя, значок, удаление) ---
        _openEditor({ mode, id, then }) {
            const editing = mode === 'manage';
            const deck = editing ? Decks.get(id) : null;
            if (editing && !deck) return;

            let chosen = deck ? deck.emoji : Decks.EMOJIS[0];

            const overlay = h('div', 'deck-sheet__overlay');
            const box = h('div', 'deck-editor');
            const finish = (result) => {
                overlay.classList.remove('is-open');
                document.removeEventListener('keydown', onEsc);
                setTimeout(() => overlay.remove(), 180);
                if (then) then(result || null);
            };
            const onEsc = (e) => { if (e.key === 'Escape') finish(null); };
            overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
            document.addEventListener('keydown', onEsc);

            box.appendChild(h('div', 'deck-editor__title', esc(editing ? t('decks.manage') : t('decks.newTitle'))));

            const palette = h('div', 'deck-editor__emojis');
            Decks.EMOJIS.forEach((e) => {
                const b = h('button', 'deck-editor__emoji' + (e === chosen ? ' is-sel' : ''), e);
                b.addEventListener('click', () => {
                    chosen = e;
                    palette.querySelectorAll('.deck-editor__emoji').forEach(x => x.classList.remove('is-sel'));
                    b.classList.add('is-sel');
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
                    this.refresh();
                    this._ctx.onChange();
                    finish(Decks.get(id));
                } else {
                    const created = Decks.create(name, chosen);
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

            if (editing) {
                const del = h('button', 'deck-editor__delete', esc(t('decks.delete')));
                del.addEventListener('click', () => {
                    if (!confirm(t('decks.deleteConfirm'))) return;
                    Decks.remove(id);
                    if (this._activeId === id) this._activeId = null;
                    snack(t('decks.deleted'));
                    this.refresh();
                    this._ctx.onChange();
                    finish(null);
                });
                box.appendChild(del);
            }

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => { overlay.classList.add('is-open'); input.focus(); });
        },
    };

    window.DecksUI = UI;
})();
