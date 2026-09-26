// Транслитерация каны (хирагана/катакана) в ромадзи (упрощённый Хепбёрн).
// Единственная таблица на всё приложение: плеер, режимы обучения, колоды.
// Наружу: window.kanaToRomaji(kana, tok).
//
// Второй аргумент — токен, к чтению которого относится кана: { pos, surface }.
// Он нужен только для частиц は и へ, которые звучат не так, как пишутся
// (私は → watashi WA, 学校へ → gakkou E). По самой кане это не определить: в 話
// «ha» остаётся «ha», а 歯 — вообще целое слово «ha». Решает часть речи от MeCab
// (助詞), поэтому вызывающий передаёт токен. Без токена ничего не меняем.

(function () {
    const DIGRAPHS = {
        'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
        'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho', 'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
        'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo', 'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
        'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
        'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo', 'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
        'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo', 'ぢゃ': 'ja', 'ぢゅ': 'ju', 'ぢょ': 'jo',
        'てぃ': 'ti', 'でぃ': 'di', 'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
        'しぇ': 'she', 'ちぇ': 'che', 'じぇ': 'je', 'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo', 'ゔ': 'vu',
        // Звуки заимствований и иностранных имён (катакана): ヴァイオリン, トゥルー…
        'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo', 'ゔゅ': 'vyu',
        'とぅ': 'tu', 'どぅ': 'du', 'でゅ': 'dyu', 'てゅ': 'tyu', 'ふゅ': 'fyu',
        'つぁ': 'tsa', 'つぃ': 'tsi', 'つぇ': 'tse', 'つぉ': 'tso', 'いぇ': 'ye',
        'くぁ': 'kwa', 'くぃ': 'kwi', 'くぇ': 'kwe', 'くぉ': 'kwo', 'ぐぁ': 'gwa',
        'すぃ': 'si', 'ずぃ': 'zi',
    };

    const MONO = {
        'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
        'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
        'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
        'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
        'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
        'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
        'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
        'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
        'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
        'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ん': 'n',
        'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
        'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
        'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
        'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
        'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
        'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ー': '',
    };

    // Как частица звучит эта кана.
    const PARTICLE_SOUND = { 'は': 'わ', 'へ': 'え' };

    // Разбор от ИИ отдаёт кусок фразы без части речи — там опираемся на сам кусок.
    // Список закрытый: только то, что частицей быть обязано (одиночная は никаким
    // другим словом в разборе не окажется — слово «зуб» пишется 歯).
    const PARTICLE_CHUNKS = new Set(['は', 'へ', 'では', 'には', 'とは', 'のは', 'からは', 'までは']);

    // Застывшие приветствия: は на конце — та же частица, просто вросшая в слово.
    const WORD_SOUND = { 'こんにちは': 'こんにちわ', 'こんばんは': 'こんばんわ' };

    // Заменяем написанную кану на звучащую там, где は/へ работают частицей.
    function sounded(kana, tok) {
        if (WORD_SOUND[kana]) return WORD_SOUND[kana];
        if (!tok) return kana;
        const surface = tok.surface ? String(tok.surface) : '';
        if (WORD_SOUND[surface]) return WORD_SOUND[surface];
        const particle = tok.pos ? tok.pos === '助詞' : PARTICLE_CHUNKS.has(surface);
        return particle ? kana.replace(/[はへ]/g, (ch) => PARTICLE_SOUND[ch]) : kana;
    }

    function convert(input, tok) {
        if (!input) return '';
        // Катакану приводим к хирагане — таблица одна на обе слоговые азбуки
        const s = sounded(String(input).replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)), tok);
        let out = '';
        for (let i = 0; i < s.length; i++) {
            const two = s.slice(i, i + 2);
            if (DIGRAPHS[two]) { out += DIGRAPHS[two]; i++; continue; }
            const ch = s[i];
            if (ch === 'っ' || ch === 'ッ') {
                // маленькое цу удваивает согласный следующего слога (っち → tchi)
                const nr = DIGRAPHS[s.slice(i + 1, i + 3)] || MONO[s[i + 1]] || '';
                if (nr) out += nr[0] === 'c' ? 't' : nr[0];
                continue;
            }
            if (ch === '・') { out += ' '; continue; } // ミカ・ヒナ → mika hina
            if (ch === 'ー') { // тире продлевает предыдущую гласную
                const last = out[out.length - 1];
                if ('aeiou'.includes(last)) out += last;
                continue;
            }
            out += MONO[ch] ?? ch;
        }
        return out;
    }

    window.kanaToRomaji = convert;
})();
