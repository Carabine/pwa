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

    // Индексы токенов реплики, которые попадают на имя персонажа.
    function mask(tokens, names) {
        const skip = new Set();
        if (!names || !names.length || !tokens || !tokens.length) return skip;
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
