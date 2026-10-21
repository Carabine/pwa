// Имена персонажей тайтла — чтобы колоды из серий не предлагали 炭治郎 и 善逸.
//
// Список берёт бэкенд у Shikimori (/catalog/character-names/:id). MeCab имена
// не узнаёт и режет на «обычные» слова (善逸 → 善+逸, 禰豆子 → 禰豆+子), поэтому
// мало сравнить токен с именем: ищем имя в тексте реплики и выкидываем все
// токены, которые на него попадают. Внутри текста ищем только имена с
// иероглифами (от двух знаков) и длинные катаканой; одиночный иероглиф (蛍),
// хираганой (すみ, ひさ) и короткие катаканой (ハル) — лишь точным совпадением
// со словом, иначе они вырезали бы すみません, ひさしぶり и 蛍光灯.
//
// Подключается после axiosClient.js (client).
(() => {
    const cache = new Map();   // shikimoriId → Promise<string[]>

    function load(id) {
        id = String(id || '');
        if (!/^\d{1,10}$/.test(id)) return Promise.resolve([]);
        if (!cache.has(id)) {
            cache.set(id, client.get('catalog/character-names/' + id, { silentErrors: true })
                .then(({ data: res }) => (res && res.data && res.data.names) || [])
                .catch(() => { cache.delete(id); return []; }));
        }
        return cache.get(id);
    }

    const KANJI = /[一-龯々]/;
    const inText = (name) => (KANJI.test(name) ? name.length >= 2 : /^[ァ-ヿ]{3,}$/.test(name));

    // Индексы токенов реплики, которые попадают на имя персонажа. Плюс токены,
    // которые сам MeCab разобрал как имя (tok.name от бэкенда, 名詞・固有名詞・人名):
    // так имена отсеиваются и когда список Shikimori недоступен.
    function mask(tokens, names) {
        const skip = new Set();
        if (!tokens || !tokens.length) return skip;
        tokens.forEach((tok, i) => { if (tok.name) skip.add(i); });
        if (!names || !names.length) return skip;
        const starts = [];
        let text = '';
        for (const tok of tokens) { starts.push(text.length); text += tok.surface || ''; }
        const cover = new Uint8Array(text.length);
        for (const name of names) {
            if (!inText(name)) continue;
            for (let i = text.indexOf(name); i !== -1; i = text.indexOf(name, i + 1)) {
                cover.fill(1, i, i + name.length);
            }
        }
        tokens.forEach((tok, i) => {
            const a = starts[i];
            const b = a + (tok.surface || '').length;
            for (let k = a; k < b; k++) if (cover[k]) { skip.add(i); return; }
            if (names.includes(tok.surface) || names.includes(tok.base)) skip.add(i);
        });
        return skip;
    }

    window.CharNames = { load, mask };
})();

// Звуки, смех и обрывки разбора — не слова: их не предлагаем ни в автоколоду,
// ни в окно «Уже знаю». Смотрим и на написание в реплике: MeCab принимает
// звуки за формы глаголов (うっ → うる, くっ → くる, うう → うい) и режет кану на
// куски (ちち «отец» → ち|ち, обе как 散る), и по словарной форме их не отличить
// от настоящих くる/うる. Отсекаем:
//  • всё на «っ/ッ»: ハッ, ぐっ, ウウッ, おおっ;
//  • однобуквенную кану (う, い, ま, ち) и обрывки с маленькой каны/«ー» (ゅぶつ, ーン);
//  • смех и рычание катаканой с тройным повтором (ハハハ, フフフ, ガルルル) или
//    из двух одинаковых букв (ウウ; ミミック остаётся), выкрики из одних гласных
//    (ウワア, イエーイ, ワオン), короткое с маленькой гласной (フゥ), междометия
//    катаканой (アハハ, ハア);
//  • стоны хираганой с маленькой гласной (はぁ, ぐぅ) и на ぐ (ぐお, ぐわ), повтор
//    одной буквы, если такого слова нет в словаре (うう; いい, ここ — слова);
//  • двухбуквенные «глаголы» каной, которых нет в словаре (えむ, いむ, ちる);
//  • числа со счётным словом (２つ, 3人).
// inDict(word) → есть ли в словаре; null — словарь ещё не загружен (тогда
// словарные проверки пропускаем, иначе выкинули бы и する).
(() => {
    const KANA_H = /^[ぁ-ゖー]+$/;
    const KANA_K = /^[ァ-ヿ]+$/;
    function isNoise(tok, base, inDict) {
        base = base || tok.base || tok.surface || '';
        const surf = tok.surface || base;
        if (/^[0-9０-９]/.test(surf)) return true;   // ２つ, 3人 — числа, а не слова
        for (const w of [surf, base]) {
            if (/^[ぁ-ゖァ-ヿー]+[っッ]$/.test(w)) return true;
            if (w.length < 2 && !/[一-龯々]/.test(w)) return true;
            if (/^[ぁぃぅぇぉゃゅょゎっァィゥェォャュョヮッー]/.test(w)) return true;
            if (KANA_K.test(w) && (/([ァ-ヶ])\1\1/.test(w) || /^([ァ-ヶ])\1$/.test(w)
                || /^[アイウエオァィゥェォーッワンヴ]+$/.test(w)
                || (w.length <= 3 && /[ァィゥェォ]/.test(w)))) return true;
            if (KANA_H.test(w) && (/[ぁぃぅぇぉ]/.test(w) || (/^ぐ/.test(w) && w.length <= 3)
                || (/^([ぁ-ゖ])\1+$/.test(w) && inDict && !inDict(w)))) return true;
        }
        if (tok.pos === '感動詞' && KANA_K.test(base)) return true;
        if ((tok.pos === '動詞' || tok.pos === '形容詞') && KANA_H.test(base) && base.length <= 2
            && inDict && !inDict(base)) return true;
        return false;
    }
    window.TokenNoise = { isNoise };
})();
