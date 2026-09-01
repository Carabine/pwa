// Известные слова — лёгкий список «это я уже знаю» поверх коллекции карточек.
// Сюда попадают импортированные из Anki/списков слова: они подсвечиваются в
// субтитрах как знакомые, учитываются в проценте покрытия серии и НЕ
// предлагаются в автоматических колодах из серии. Карточек по ним нет —
// это просто множество строк (словарные формы слов).
//
// Хранилище — localStorage, привязано к устройству (как и колоды).
(function () {
    const KEY = 'animei:knownWords';
    const OUTBOX_KEY = 'animei:knownOutbox';
    const VERSION = 1;
    const MAX = 50000;   // защитный потолок: больше — бессмысленно и тяжело
    const BATCH = 1500;  // сервер принимает до 3000 слов за запрос

    function load() {
        const parsed = lsJson(KEY);
        const raw = (parsed && Array.isArray(parsed.words)) ? parsed.words : [];
        return new Set(raw.filter((w) => typeof w === 'string' && w).slice(0, MAX));
    }

    const set = load();

    function save() {
        try {
            localStorage.setItem(KEY, JSON.stringify({ version: VERSION, words: [...set] }));
        } catch (err) {
            console.warn('Не удалось сохранить известные слова:', err);
        }
    }

    // Есть ли в строке японские символы (хирагана/катакана/кандзи).
    const JP_CHAR = /[぀-ヿ㐀-䶿一-鿿々]/;
    // Первый сплошной японский фрагмент строки — само слово без обвязки.
    const JP_CHUNK = /[぀-ヿ㐀-䶿一-鿿々〜]+/;

    // Убираем обвязку экспорта: HTML-теги, [sound:...], фуригану в скобках
    // (Anki-формат «漢字[かんじ]»), html-энтити и кавычки.
    function cleanField(s) {
        return String(s)
            .replace(/\[sound:[^\]]*\]/gi, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;|&#\d+;|&[a-z]+;/gi, ' ')
            .replace(/\[[^\]]*\]/g, '')     // фуригана: 漢字[かんじ] → 漢字
            .replace(/["「」『』]/g, ' ');
    }

    // Разбор вставленного текста / файла экспорта. Понимает:
    //  - простой список (слово в строке, можно «слово — перевод»),
    //  - экспорт Anki «Notes in Plain Text» (TSV, строки-заголовки с #).
    // Возвращает уникальные словарные формы (только японские фрагменты).
    function parseImport(text) {
        const out = new Set();
        for (const rawLine of String(text || '').split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;   // заголовки экспорта Anki
            const fields = line.includes('\t') ? line.split('\t') : [line];
            // Берём первое поле с японским текстом (в Anki слово обычно первым,
            // но бывают колоды «перевод → слово»).
            const field = fields.find((f) => JP_CHAR.test(f));
            if (!field) continue;
            const m = cleanField(field).match(JP_CHUNK);
            if (m && m[0].length <= 40) out.add(m[0]);
            if (out.size >= MAX) break;
        }
        return [...out];
    }

    // ---------- Чтение .apkg (zip-архив колоды Anki) ----------
    // Достаём из архива ТОЛЬКО базу коллекции (обычно пара мегабайт) — медиа не
    // читаем и на сервер не грузим. Легаси-формат (collection.anki21/anki2) —
    // готовый SQLite; новый (collection.anki21b) — SQLite, сжатый zstd, его
    // распаковывает сервер (zlib.zstdDecompressSync), магию он различает сам.
    async function extractCollection(file) {
        const buf = new Uint8Array(await file.arrayBuffer());
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

        // End of central directory (0x06054b50) — ищем с конца файла.
        let eocd = -1;
        const stop = Math.max(0, buf.length - 22 - 65535);
        for (let i = buf.length - 22; i >= stop; i--) {
            if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('not a zip');

        // Центральный каталог: имя, метод сжатия, размер, смещение локального заголовка.
        const count = view.getUint16(eocd + 10, true);
        let off = view.getUint32(eocd + 16, true);
        const entries = {};
        const td = new TextDecoder();
        for (let k = 0; k < count; k++) {
            if (view.getUint32(off, true) !== 0x02014b50) break;
            const method = view.getUint16(off + 10, true);
            const csize = view.getUint32(off + 20, true);
            const nameLen = view.getUint16(off + 28, true);
            const extraLen = view.getUint16(off + 30, true);
            const commentLen = view.getUint16(off + 32, true);
            const lho = view.getUint32(off + 42, true);
            entries[td.decode(buf.subarray(off + 46, off + 46 + nameLen))] = { method, csize, lho };
            off += 46 + nameLen + extraLen + commentLen;
        }

        // Порядок: легаси anki21 → новый anki21b (zstd) → anki2. anki2 последним:
        // в новых экспортах это заглушка «обновите Anki», а не реальные данные.
        const entry = entries['collection.anki21'] || entries['collection.anki21b']
            || entries['collection.anki2'] || null;
        if (!entry) throw new Error('not a zip');

        // Данные лежат после локального заголовка (длины полей там свои).
        const nameLen = view.getUint16(entry.lho + 26, true);
        const extraLen = view.getUint16(entry.lho + 28, true);
        const start = entry.lho + 30 + nameLen + extraLen;
        const raw = buf.subarray(start, start + entry.csize);
        if (entry.method === 0) return new Blob([raw]);
        if (entry.method !== 8) throw new Error('unsupported compression');
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(stream).blob();
    }

    // ---------- Синхронизация с аккаунтом ----------
    // Локальная копия остаётся хозяином: она работает офлайн и у гостя. На сервер
    // уходят НАКОПЛЕННЫЕ правки (очередь в localStorage переживает и офлайн, и
    // закрытие вкладки), потом забираем объединённый список. Без этого известные
    // слова жили только на одном устройстве, а от них зависят подсветка субтитров,
    // процент покрытия серии и состав автоматических колод.
    const signedIn = () => typeof isLoggedIn === 'function' && isLoggedIn() && typeof client !== 'undefined';

    function outbox() {
        const o = lsJson(OUTBOX_KEY, null);
        return {
            add: Array.isArray(o?.add) ? o.add : [],
            remove: Array.isArray(o?.remove) ? o.remove : [],
            clear: o?.clear === true,
        };
    }

    function saveOutbox(o) {
        try {
            if (!o.add.length && !o.remove.length && !o.clear) localStorage.removeItem(OUTBOX_KEY);
            else localStorage.setItem(OUTBOX_KEY, JSON.stringify(o));
        } catch { /* места нет — синк подождёт */ }
    }

    // Слово в очереди живёт в одном экземпляре и в одном направлении: добавили
    // после удаления — из «удалить» оно уходит, и наоборот.
    function queue(kind, words) {
        if (!signedIn()) return;
        const list = (Array.isArray(words) ? words : [words]).filter((w) => typeof w === 'string' && w);
        if (!list.length) return;
        const o = outbox();
        const other = kind === 'add' ? 'remove' : 'add';
        const mine = new Set(o[kind]);
        const theirs = new Set(o[other]);
        for (const w of list) { mine.add(w); theirs.delete(w); }
        o[kind] = [...mine].slice(-MAX);
        o[other] = [...theirs];
        saveOutbox(o);
    }

    let flushInFlight = null;
    function flush() {
        if (!flushInFlight) flushInFlight = runFlush().finally(() => { flushInFlight = null; });
        return flushInFlight;
    }

    async function runFlush() {
        if (!signedIn()) return;
        const o = outbox();
        if (!o.add.length && !o.remove.length && !o.clear) return;
        // Импорт из Anki — это тысячи слов: шлём частями, каждую подтверждённую
        // часть сразу вычёркиваем, чтобы обрыв на середине не откатывал всё.
        try {
            if (o.clear || o.remove.length) {
                await client.post('words/known', {
                    clear: o.clear, remove: o.remove.slice(0, BATCH),
                }, { silentErrors: true });
                const left = outbox();
                left.clear = false;
                left.remove = left.remove.filter((w) => !o.remove.slice(0, BATCH).includes(w));
                saveOutbox(left);
            }
            while (outbox().add.length) {
                const chunk = outbox().add.slice(0, BATCH);
                await client.post('words/known', { add: chunk }, { silentErrors: true });
                const left = outbox();
                left.add = left.add.filter((w) => !chunk.includes(w));
                saveOutbox(left);
            }
        } catch { /* нет связи — очередь осталась, отправим в следующий раз */ }
    }

    // Полный синк: сначала свои правки, потом забираем серверный список.
    // Локальные слова, которых на сервере нет, — это НЕ удалённые, а ещё не
    // отправленные (импорт до появления синка, вход в аккаунт после гостевой
    // работы): их отправляем, а не теряем.
    let syncInFlight = null;
    function sync() {
        if (!signedIn()) return Promise.resolve();
        if (!syncInFlight) syncInFlight = runSync().finally(() => { syncInFlight = null; });
        return syncInFlight;
    }

    async function runSync() {
        await flush();
        let words;
        try {
            const { data: res } = await client.get('words/known', { silentErrors: true });
            words = Array.isArray(res?.data?.words) ? res.data.words : null;
        } catch { return; }          // офлайн — живём по локальной копии
        if (!words) return;

        const server = new Set(words);
        const localOnly = [...set].filter((w) => !server.has(w));
        if (localOnly.length) {
            queue('add', localOnly);
            await flush();
        }
        const merged = new Set([...words, ...localOnly]);
        // Ещё не отправленные удаления не должны «вернуться» с сервера.
        for (const w of outbox().remove) merged.delete(w);
        if (merged.size !== set.size || [...merged].some((w) => !set.has(w))) {
            set.clear();
            for (const w of merged) set.add(w);
            save();
            document.dispatchEvent(new CustomEvent('known:changed'));
        }
    }

    if (signedIn()) setTimeout(sync, 0);
    // Связь ожила — досылаем накопленное (событие из axiosClient.js по реальным
    // запросам; системный 'online' врёт на вайфае без интернета, но как подсказка
    // годится).
    window.addEventListener('animei:network', (e) => { if (e.detail && e.detail.online) sync(); });
    window.addEventListener('online', () => { sync(); });

    window.KnownWords = {
        all() { return [...set]; },
        count() { return set.size; },
        has(w) { return set.has(w); },
        parseImport,
        sync,

        // Прочитать колоду .apkg: вынуть базу, отдать её серверу на разбор.
        // Возвращает [{ flds, learned }]; flds — поля заметки через \x1f.
        async readApkg(file) {
            const dbBlob = await extractCollection(file);
            const fd = new FormData();
            fd.append('db', dbBlob, 'collection.anki2');
            const { data: res } = await client.post('words/known/anki', fd, {
                headers: { 'Content-Type': undefined },
                timeout: 180000,
            });
            const notes = res && res.data && Array.isArray(res.data.notes) ? res.data.notes : [];
            return notes;
        },

        // Добавить пачку слов; возвращает, сколько было действительно новых.
        addMany(list) {
            const fresh = [];
            for (const w of list || []) {
                if (typeof w !== 'string' || !w || set.has(w)) continue;
                if (set.size >= MAX) break;
                set.add(w);
                fresh.push(w);
            }
            if (fresh.length) {
                save();
                queue('add', fresh);
                flush();
            }
            return fresh.length;
        },

        remove(w) {
            if (set.delete(w)) {
                save();
                queue('remove', [w]);
                flush();
            }
        },

        clear() {
            if (!set.size) return;
            set.clear();
            save();
            // На сервере тоже чистим целиком: перечислять тысячи слов в очереди
            // бессмысленно, для этого у эндпоинта есть флаг clear.
            if (signedIn()) {
                saveOutbox({ add: [], remove: [], clear: true });
                flush();
            }
        },
    };
})();
