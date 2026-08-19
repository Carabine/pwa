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

    window.KnownWords = {
        all() { return [...set]; },
        count() { return set.size; },
        has(w) { return set.has(w); },
        parseImport,

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
