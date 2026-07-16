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
    const EMOJIS = ['📚', '🎬', '🌸', '🔥', '⭐', '🍜', '🗾', '🎌', '🐱', '⚔️', '💬', '🎯'];

    function makeId() {
        return 'deck-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function normalizeName(name) {
        return String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    }

    // Читаем и чиним данные: терпим отсутствие ключа, битый JSON и мусор в полях.
    function load() {
        let parsed = null;
        try { parsed = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { parsed = null; }
        const raw = (parsed && Array.isArray(parsed.decks)) ? parsed.decks : [];
        const out = [];
        for (const d of raw) {
            if (!d || typeof d.id !== 'string') continue;
            const ids = Array.isArray(d.wordIds) ? d.wordIds.filter(x => typeof x === 'string') : [];
            out.push({
                id: d.id,
                name: normalizeName(d.name) || 'Колода',
                emoji: EMOJIS.includes(d.emoji) ? d.emoji : EMOJIS[0],
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

    const Decks = {
        EMOJIS,

        // Копии — чтобы наружу не утекала мутируемая ссылка на внутреннее состояние.
        all() { return decks.map(clone); },
        get(id) { return clone(find(id)); },
        count(id) { const d = find(id); return d ? d.wordIds.length : 0; },

        create(name, emoji) {
            const now = Date.now();
            const deck = {
                id: makeId(),
                name: normalizeName(name) || 'Колода',
                emoji: EMOJIS.includes(emoji) ? emoji : EMOJIS[0],
                wordIds: [],
                createdAt: now,
                updatedAt: now,
            };
            decks.push(deck);
            save();
            return clone(deck);
        },

        rename(id, name) {
            const d = find(id);
            const n = normalizeName(name);
            if (d && n) { d.name = n; d.updatedAt = Date.now(); save(); }
        },

        setEmoji(id, emoji) {
            const d = find(id);
            if (d && EMOJIS.includes(emoji)) { d.emoji = emoji; d.updatedAt = Date.now(); save(); }
        },

        remove(id) {
            const before = decks.length;
            decks = decks.filter(d => d.id !== id);
            if (decks.length !== before) save();
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
            return i === -1;
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
                if (i !== -1) { d.wordIds.splice(i, 1); changed = true; }
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
                if (kept.length !== d.wordIds.length) { d.wordIds = kept; changed = true; }
            }
            if (changed) save();
        },

        // Гость вошёл в аккаунт — его слова пересозданы на сервере с новыми id.
        // Переносим членство со старых id на новые. mapping: { oldId: newId }.
        remapIds(mapping) {
            if (!mapping) return;
            let changed = false;
            for (const d of decks) {
                d.wordIds = d.wordIds.map(id => {
                    if (mapping[id] && mapping[id] !== id) { changed = true; return mapping[id]; }
                    return id;
                });
                d.wordIds = [...new Set(d.wordIds)];
            }
            if (changed) save();
        },
    };

    window.Decks = Decks;
})();
