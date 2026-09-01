// Опциональные колоды карточек — ярлык-группа поверх общего пула слов.
// Колода НЕ хранит сами слова, только их id (many-to-many: одно слово может
// лежать в нескольких колодах и всегда остаётся в общем словаре).
//
// Хранилище — localStorage, привязано к устройству. В отличие от самих слов,
// которые у вошедшего живут на сервере, колоды пока не синхронизируются между
// устройствами (об этом честно сказано в подсказке UI). Формат версионируем,
// чтобы будущая миграция/синхронизация прошла без боли.
(function () {
    const KEY = 'animei:decks';
    const VERSION = 1;
    const NAME_MAX = 50;
    // Мини-палитра значков вместо тяжёлого эмодзи-пикера.
    const EMOJIS = ['📚', '🎬', '📺', '🌸', '🔥', '⭐', '🍜', '🗾', '🎌', '🐱', '⚔️', '💬', '🎯'];

    function makeId() {
        return 'deck-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function normalizeName(name) {
        return String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    }

    // Аватарка колоды — только наш путь /catalog/deck-icon/<shikimoriId>
    // (портрет главного персонажа, см. catalog.routes.js); всё прочее — мусор.
    // Префикс «off:» — аватарка выключена юзером (показывается эмодзи), но
    // путь сохранён, чтобы её можно было вернуть в редакторе колоды.
    const ICON_RE = /^(off:)?\/catalog\/deck-icon\/\d{1,10}$/;
    function sanitizeIcon(v) {
        return typeof v === 'string' && ICON_RE.test(v) ? v : '';
    }
    function iconEnabled(d) {
        return !!(d && d.icon && !d.icon.startsWith('off:'));
    }

    // Читаем и чиним данные: терпим отсутствие ключа, битый JSON и мусор в полях.
    function load() {
        const parsed = lsJson(KEY);
        const raw = (parsed && Array.isArray(parsed.decks)) ? parsed.decks : [];
        const out = [];
        for (const d of raw) {
            if (!d || typeof d.id !== 'string') continue;
            const ids = Array.isArray(d.wordIds) ? d.wordIds.filter(x => typeof x === 'string') : [];
            out.push({
                id: d.id,
                name: normalizeName(d.name) || (typeof t === 'function' ? t('decks.untitled') : 'Deck'),
                emoji: EMOJIS.includes(d.emoji) ? d.emoji : EMOJIS[0],
                icon: sanitizeIcon(d.icon),
                wordIds: [...new Set(ids)],          // без дублей
                createdAt: Number(d.createdAt) || Date.now(),
                updatedAt: Number(d.updatedAt) || Number(d.createdAt) || Date.now(),
            });
        }
        return out;
    }

    let decks = load();

    function save() {
        try {
            localStorage.setItem(KEY, JSON.stringify({ version: VERSION, decks }));
        } catch (err) {
            console.warn('Не удалось сохранить колоды:', err);
        }
    }

    function find(id) { return decks.find(d => d.id === id) || null; }
    function clone(d) { return d ? { ...d, wordIds: d.wordIds.slice() } : null; }

    // ---------- Синк с аккаунтом ----------
    // У вошедшего колоды зеркалятся на сервер (PUT/DELETE по клиентскому id).
    // Очереди в localStorage переживают офлайн: dirty — колоды с неотправленными
    // правками, deleted — неотправленные удаления, synced — id, про которые
    // известно, что они есть на сервере (отличаем «новую локальную» колоду от
    // «удалённой на другом устройстве»). Гость живёт полностью локально.
    const DIRTY_KEY = 'animei:decksDirty';
    const DELETED_KEY = 'animei:decksDeleted';
    const SYNCED_KEY = 'animei:decksSynced';

    function signedIn() { return typeof isLoggedIn === 'function' && isLoggedIn(); }
    function idSet(key) {
        const arr = lsJson(key, []);
        return new Set(Array.isArray(arr) ? arr : []);
    }
    function saveIdSet(key, set) {
        try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* тесно — не страшно */ }
    }

    let pushTimer = null;
    function markDirty(id) {
        if (!signedIn() || !id) return;
        const s = idSet(DIRTY_KEY); s.add(id); saveIdSet(DIRTY_KEY, s);
        clearTimeout(pushTimer);
        pushTimer = setTimeout(flushQueues, 800);   // батчим серию кликов
    }

    function queueDelete(id) {
        if (!signedIn() || !id) return;
        const del = idSet(DELETED_KEY); del.add(id); saveIdSet(DELETED_KEY, del);
        const dirty = idSet(DIRTY_KEY); dirty.delete(id); saveIdSet(DIRTY_KEY, dirty);
        clearTimeout(pushTimer);
        pushTimer = setTimeout(flushQueues, 800);
    }

    // Отправить очереди на сервер. Ошибки глотаем: офлайн-правки доедут при
    // следующей попытке (очереди лежат в localStorage).
    // Разгрузку зовут теперь из нескольких мест (правка колоды, возврат связи,
    // системный `online`, старт страницы), а браузер на восстановление сети шлёт
    // сразу два события — без этого флага одна и та же колода уходила на сервер
    // по три раза подряд (проверено на проде).
    let flushInFlight = null;
    function flushQueues() {
        if (!flushInFlight) flushInFlight = runFlush().finally(() => { flushInFlight = null; });
        return flushInFlight;
    }

    async function runFlush() {
        if (!signedIn() || typeof client === 'undefined') return;
        const deleted = idSet(DELETED_KEY);
        for (const id of deleted) {
            try {
                await client.delete('decks/' + encodeURIComponent(id));
                deleted.delete(id); saveIdSet(DELETED_KEY, deleted);
                const synced = idSet(SYNCED_KEY); synced.delete(id); saveIdSet(SYNCED_KEY, synced);
            } catch { /* сеть — повторим позже */ }
        }
        const dirty = idSet(DIRTY_KEY);
        for (const id of dirty) {
            const d = find(id);
            if (!d) { dirty.delete(id); saveIdSet(DIRTY_KEY, dirty); continue; }
            try {
                await client.put('decks/' + encodeURIComponent(id), {
                    name: d.name, emoji: d.emoji, icon: d.icon || '', wordIds: d.wordIds, createdAt: d.createdAt,
                });
                dirty.delete(id); saveIdSet(DIRTY_KEY, dirty);
                const synced = idSet(SYNCED_KEY); synced.add(id); saveIdSet(SYNCED_KEY, synced);
            } catch { /* сеть — повторим позже */ }
        }
    }

    let syncInFlight = null;
    function syncWithServer() {
        if (!signedIn() || typeof client === 'undefined') return Promise.resolve();
        if (!syncInFlight) syncInFlight = runSync().finally(() => { syncInFlight = null; });
        return syncInFlight;
    }

    async function runSync() {
        await flushQueues();               // сначала свои недоехавшие правки
        let server;
        try {
            const { data: res } = await client.get('decks');
            server = Array.isArray(res.data) ? res.data : [];
        } catch { return; }                // офлайн — живём по локальной копии
        const dirty = idSet(DIRTY_KEY);    // недоехавшая правка локально главнее
        const synced = idSet(SYNCED_KEY);
        const serverById = new Map(server.map((d) => [d.id, d]));
        let changed = false;

        // Сервер → локально: новые колоды и чужие правки (кроме dirty).
        for (const sd of server) {
            synced.add(sd.id);
            if (dirty.has(sd.id)) continue;
            const incoming = {
                id: sd.id,
                name: normalizeName(sd.name) || 'Deck',
                emoji: EMOJIS.includes(sd.emoji) ? sd.emoji : EMOJIS[0],
                icon: sanitizeIcon(sd.icon),
                wordIds: [...new Set((sd.wordIds || []).filter((x) => typeof x === 'string'))],
                createdAt: Number(sd.createdAt) || Date.now(),
                updatedAt: Number(sd.updatedAt) || Date.now(),
            };
            const local = find(sd.id);
            if (!local) { decks.push(incoming); changed = true; }
            else if (JSON.stringify(local) !== JSON.stringify(incoming)) {
                Object.assign(local, incoming); changed = true;
            }
        }

        // Локальные без серверной копии: раньше на сервере была → удалена на
        // другом устройстве (убираем и у себя); не была → новая, отправляем.
        for (const d of [...decks]) {
            if (serverById.has(d.id)) continue;
            if (synced.has(d.id)) {
                decks = decks.filter((x) => x.id !== d.id);
                synced.delete(d.id);
                changed = true;
            } else {
                markDirty(d.id);
            }
        }
        saveIdSet(SYNCED_KEY, synced);
        if (changed) {
            save();
            document.dispatchEvent(new CustomEvent('decks:changed'));
        }
    }

    const Decks = {
        EMOJIS,

        // Копии — чтобы наружу не утекала мутируемая ссылка на внутреннее состояние.
        all() { return decks.map(clone); },
        get(id) { return clone(find(id)); },
        count(id) { const d = find(id); return d ? d.wordIds.length : 0; },

        create(name, emoji, icon) {
            const now = Date.now();
            const deck = {
                id: makeId(),
                name: normalizeName(name) || (typeof t === 'function' ? t('decks.untitled') : 'Deck'),
                emoji: EMOJIS.includes(emoji) ? emoji : EMOJIS[0],
                icon: sanitizeIcon(icon),
                wordIds: [],
                createdAt: now,
                updatedAt: now,
            };
            decks.push(deck);
            save();
            markDirty(deck.id);
            return clone(deck);
        },

        // Абсолютный URL аватарки (и выключенной тоже — для превью в
        // редакторе); '' если аватарки нет.
        iconSrc(d) {
            const p = ((d && d.icon) || '').replace(/^off:/, '');
            if (!/^\/catalog\/deck-icon\/\d{1,10}$/.test(p)) return '';
            return (window.ANIMEI_ORIGIN || '') + '/api/v1' + p;
        },

        iconEnabled(d) { return iconEnabled(d); },

        // Включить/выключить аватарку (путь сохраняется в обоих состояниях).
        setIconEnabled(id, on) {
            const d = find(id);
            if (!d || !d.icon) return;
            const bare = d.icon.replace(/^off:/, '');
            const next = on ? bare : 'off:' + bare;
            if (next === d.icon) return;
            d.icon = next;
            d.updatedAt = Date.now();
            save();
            markDirty(id);
        },

        // Значок колоды для вставки в разметку: аватарка (портрет главного
        // персонажа тайтла) или просто эмодзи. Строка безопасна без esc():
        // icon прошёл sanitizeIcon, эмодзи — из EMOJIS.
        iconHtml(d) {
            if (!d) return '';
            if (iconEnabled(d)) {
                const src = Decks.iconSrc(d);
                if (src) {
                    // deck-ico--load — скелетон-подложка, пока картинка едет.
                    return `<img class="deck-ico deck-ico--load" src="${src}" alt="" loading="lazy"` +
                        ` data-fb="${d.emoji}" onload="this.classList.remove('deck-ico--load')"` +
                        ` onerror="this.outerHTML=this.dataset.fb">`;
                }
            }
            return d.emoji;
        },

        rename(id, name) {
            const d = find(id);
            const n = normalizeName(name);
            if (d && n) { d.name = n; d.updatedAt = Date.now(); save(); markDirty(id); }
        },

        setEmoji(id, emoji) {
            const d = find(id);
            if (d && EMOJIS.includes(emoji)) { d.emoji = emoji; d.updatedAt = Date.now(); save(); markDirty(id); }
        },

        remove(id) {
            const before = decks.length;
            decks = decks.filter(d => d.id !== id);
            if (decks.length !== before) { save(); queueDelete(id); }
        },

        has(deckId, wordId) {
            const d = find(deckId);
            return !!d && d.wordIds.includes(wordId);
        },

        // Переключить членство слова в колоде. Возвращает true, если слово теперь в колоде.
        toggle(deckId, wordId) {
            const d = find(deckId);
            if (!d) return false;
            const i = d.wordIds.indexOf(wordId);
            if (i === -1) d.wordIds.push(wordId);
            else d.wordIds.splice(i, 1);
            d.updatedAt = Date.now();
            save();
            markDirty(deckId);
            return i === -1;
        },

        // Массово добавить слова в колоду (дубли пропускаются).
        // Возвращает, сколько слов действительно добавилось.
        addMany(deckId, wordIds) {
            const d = find(deckId);
            if (!d) return 0;
            let added = 0;
            for (const id of wordIds || []) {
                if (typeof id !== 'string' || d.wordIds.includes(id)) continue;
                d.wordIds.push(id);
                added++;
            }
            if (added) { d.updatedAt = Date.now(); save(); markDirty(deckId); }
            return added;
        },

        // Массово убрать слова из колоды. Возвращает, сколько убрано.
        removeMany(deckId, wordIds) {
            const d = find(deckId);
            if (!d) return 0;
            const drop = new Set(wordIds || []);
            const before = d.wordIds.length;
            d.wordIds = d.wordIds.filter((id) => !drop.has(id));
            const removed = before - d.wordIds.length;
            if (removed) { d.updatedAt = Date.now(); save(); markDirty(deckId); }
            return removed;
        },

        // Все колоды, в которых состоит слово.
        decksOf(wordId) {
            return decks.filter(d => d.wordIds.includes(wordId)).map(clone);
        },

        // Слово удалили из словаря — вычищаем его из всех колод.
        forgetWord(wordId) {
            let changed = false;
            for (const d of decks) {
                const i = d.wordIds.indexOf(wordId);
                if (i !== -1) { d.wordIds.splice(i, 1); changed = true; markDirty(d.id); }
            }
            if (changed) save();
        },

        // Отфильтровать «мёртвые» id — слова, которых уже нет в коллекции. Вызывать
        // при загрузке словаря (validIds — id всех существующих слов).
        sanitize(validIds) {
            const valid = validIds instanceof Set ? validIds : new Set(validIds || []);
            let changed = false;
            for (const d of decks) {
                const kept = d.wordIds.filter(id => valid.has(id));
                if (kept.length !== d.wordIds.length) { d.wordIds = kept; changed = true; markDirty(d.id); }
            }
            if (changed) save();
        },

        // Гость вошёл в аккаунт — его слова пересозданы на сервере с новыми id.
        // Переносим членство со старых id на новые. mapping: { oldId: newId }.
        remapIds(mapping) {
            if (!mapping) return;
            let changed = false;
            for (const d of decks) {
                const before = d.wordIds.join('|');
                d.wordIds = d.wordIds.map(id => {
                    if (mapping[id] && mapping[id] !== id) { changed = true; return mapping[id]; }
                    return id;
                });
                d.wordIds = [...new Set(d.wordIds)];
                if (d.wordIds.join('|') !== before) markDirty(d.id);
            }
            if (changed) save();
        },

        // Синк с аккаунтом (см. блок выше). Возвращает промис; можно await'ить
        // перед рендером, а можно подписаться на событие 'decks:changed'.
        sync: syncWithServer,
    };

    window.Decks = Decks;

    // Автосинк вошедшего при каждой загрузке страницы: подтягиваем колоды с
    // других устройств и допушиваем офлайн-правки. Тихо, сеть не обязательна.
    if (signedIn()) setTimeout(syncWithServer, 0);

    // Правки, сделанные без сети, раньше лежали до СЛЕДУЮЩЕЙ загрузки страницы:
    // человек мог доделать колоду в метро, выйти на воздух и сидеть в том же
    // открытом приложении — на сервер ничего не уезжало. Теперь досылаем, как
    // только связь снова заработала. Основной сигнал — animei:network из
    // axiosClient.js (по реальным запросам), системный 'online' — как подсказка.
    window.addEventListener('animei:network', (e) => {
        if (e.detail && e.detail.online) flushQueues();
    });
    window.addEventListener('online', () => { flushQueues(); });
})();
