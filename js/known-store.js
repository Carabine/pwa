// Известные слова — лёгкий список «это я уже знаю» поверх коллекции карточек.
// Сюда попадают импортированные из Anki/списков слова: они подсвечиваются в
// субтитрах как знакомые, учитываются в проценте покрытия серии и НЕ
// предлагаются в автоматических колодах из серии. Карточек по ним нет —
// это просто множество строк (словарные формы слов).
//
// Хранилище — localStorage, привязано к устройству (как и колоды).
(function () {
    const KEY = 'animei:knownWords';
    const VERSION = 1;
    const MAX = 50000;   // защитный потолок: больше — бессмысленно и тяжело

    function load() {
        let parsed = null;
        try { parsed = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { parsed = null; }
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
    // Достаём из архива ТОЛЬКО базу коллекции (collection.anki21/anki2, обычно
    // пара мегабайт) — медиа не читаем и на сервер не грузим. Новый формат
    // collection.anki21b (zstd) в браузере не распаковать — кидаем 'modern',
    // UI просит переэкспорт с галкой «Support older Anki versions».
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

        // В новых экспортах рядом с anki21b лежит anki2-заглушка «обновите Anki» —
        // поэтому сначала anki21, а на anki2 падаем только когда anki21b нет.
        const entry = entries['collection.anki21']
            || (!entries['collection.anki21b'] && entries['collection.anki2']) || null;
        if (!entry) throw new Error(entries['collection.anki21b'] ? 'modern' : 'not a zip');

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

    window.KnownWords = {
        all() { return [...set]; },
        count() { return set.size; },
        has(w) { return set.has(w); },
        parseImport,

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
            let added = 0;
            for (const w of list || []) {
                if (typeof w !== 'string' || !w || set.has(w)) continue;
                if (set.size >= MAX) break;
                set.add(w);
                added++;
            }
            if (added) save();
            return added;
        },

        remove(w) {
            if (set.delete(w)) save();
        },

        clear() {
            if (!set.size) return;
            set.clear();
            save();
        },
    };
})();
