/* Улица слов — данные: встроенный демо-набор и чтение реального словаря из localStorage. */
(function () {
'use strict';

function dayKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function daysFromNow(n) { return dayKey(new Date(Date.now() + n * 864e5)); }

// ---- демо: три квартала, ~65 слов, все пять состояний ----
// [kanji, kana, перевод, JLPT (0 = вне списков)]
const DEMO_DECKS = [
    { name: 'Фрирен', emoji: '🧙', words: [
        ['魔法', 'まほう', 'магия', 3], ['勇者', 'ゆうしゃ', 'герой', 1], ['約束', 'やくそく', 'обещание', 4],
        ['旅', 'たび', 'путешествие', 4], ['仲間', 'なかま', 'товарищ, соратник', 3], ['戦う', 'たたかう', 'сражаться', 3],
        ['魔王', 'まおう', 'король демонов', 0], ['時間', 'じかん', 'время', 5], ['千年', 'せんねん', 'тысяча лет', 0],
        ['花畑', 'はなばたけ', 'цветочное поле', 0], ['思い出', 'おもいで', 'воспоминание', 3], ['涙', 'なみだ', 'слеза', 3],
        ['杖', 'つえ', 'посох', 1], ['村', 'むら', 'деревня', 4], ['空', 'そら', 'небо', 5], ['星', 'ほし', 'звезда', 4],
        ['強い', 'つよい', 'сильный', 5], ['忘れる', 'わすれる', 'забывать', 5], ['死ぬ', 'しぬ', 'умирать', 5],
        ['人間', 'にんげん', 'человек', 4], ['永遠', 'えいえん', 'вечность', 2], ['魔族', 'まぞく', 'демоны (раса)', 0],
    ] },
    { name: 'Академия', emoji: '⚡', words: [
        ['大丈夫', 'だいじょうぶ', 'всё в порядке', 5], ['学校', 'がっこう', 'школа', 5], ['先生', 'せんせい', 'учитель', 5],
        ['友達', 'ともだち', 'друг', 5], ['諦める', 'あきらめる', 'сдаваться', 3], ['個性', 'こせい', 'индивидуальность; причуда', 2],
        ['必ず', 'かならず', 'обязательно', 4], ['勝つ', 'かつ', 'побеждать', 4], ['守る', 'まもる', 'защищать', 3],
        ['試験', 'しけん', 'экзамен', 4], ['一緒', 'いっしょ', 'вместе', 5], ['頑張る', 'がんばる', 'стараться', 4],
        ['力', 'ちから', 'сила', 4], ['笑う', 'わらう', 'смеяться', 4], ['夢', 'ゆめ', 'мечта; сон', 4],
        ['教室', 'きょうしつ', 'класс, аудитория', 5], ['走る', 'はしる', 'бежать', 5], ['気持ち', 'きもち', 'чувство', 4],
        ['全部', 'ぜんぶ', 'всё', 4], ['本当', 'ほんとう', 'правда', 4], ['最高', 'さいこう', 'лучший; высший', 3],
    ] },
    { name: 'Токио ночью', emoji: '🏮', words: [
        ['居酒屋', 'いざかや', 'идзакая', 2], ['電車', 'でんしゃ', 'электричка', 5], ['駅', 'えき', 'станция', 5],
        ['薬', 'くすり', 'лекарство', 5], ['月', 'つき', 'луна', 5], ['雨', 'あめ', 'дождь', 5], ['心', 'こころ', 'сердце, душа', 4],
        ['夜', 'よる', 'ночь', 5], ['街', 'まち', 'город, улица', 4], ['酒', 'さけ', 'сакэ, алкоголь', 4],
        ['寿司', 'すし', 'суши', 0], ['猫', 'ねこ', 'кошка', 5], ['道', 'みち', 'дорога', 5], ['風', 'かぜ', 'ветер', 4],
        ['傘', 'かさ', 'зонт', 5], ['店', 'みせ', 'магазин', 5], ['光', 'ひかり', 'свет', 4], ['静か', 'しずか', 'тихий', 5],
        ['帰る', 'かえる', 'возвращаться', 5], ['遅い', 'おそい', 'поздний', 5], ['ラーメン', 'らーめん', 'рамэн', 5],
        ['焼き鳥', 'やきとり', 'якитори', 0],
    ] },
];
// Состояния по кругу, со сдвигом на колоду, чтобы каждая улица была пёстрой.
const STATE_CYCLE = ['lit', 'lit', 'warm', 'lit', 'new', 'due', 'warm', 'lit', 'worn', 'new', 'lit', 'due'];

function demoSchedule(state) {
    switch (state) {
        case 'lit': return { interval: 30, reps: 7, lapses: 0, due: daysFromNow(12) };
        case 'warm': return { interval: 6, reps: 3, lapses: 0, due: daysFromNow(3) };
        case 'due': return { interval: 10, reps: 4, lapses: 0, due: daysFromNow(-2) };
        case 'worn': return { interval: 3, reps: 9, lapses: 4, due: daysFromNow(1) };
        default: return null;
    }
}

// Словарь владельца (words-busyd.js, если подключён) — набор по умолчанию вместо встроенного.
function buildOwner() {
    const S = window.STREET_WORDS;
    if (!S || !Array.isArray(S.words) || !S.words.length) return null;
    return { words: S.words.slice(), schedule: S.schedule || {}, decks: (S.decks || []).filter((d) => d && Array.isArray(d.wordIds)), known: new Set(S.known || []), jlpt: {}, source: 'owner' };
}

function buildDemo() {
    const owner = buildOwner();
    if (owner) return owner;
    const words = [], schedule = {}, decks = [], jlpt = {};
    let n = 0;
    DEMO_DECKS.forEach((d, di) => {
        const ids = [];
        d.words.forEach((w, i) => {
            const id = 'demo-' + (++n);
            const state = STATE_CYCLE[(i + di * 4) % STATE_CYCLE.length];
            words.push({ id, kanji: w[0], kana: w[1], translation: w[2], createdAt: new Date(Date.now() - (n * 7 + di) * 36e5).toISOString() });
            jlpt[w[0]] = w[3];
            const s = demoSchedule(state);
            if (s) schedule[id] = s;
            ids.push(id);
        });
        decks.push({ id: 'demo-deck-' + di, name: d.name, emoji: d.emoji, wordIds: ids });
    });
    return { words, schedule, decks, known: new Set(), jlpt, source: 'demo' };
}

function lsJson(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
}

function loadReal() {
    const words = (lsJson('words', []) || []).filter((w) => w && w.id && (w.kanji || w.kana));
    const schedule = lsJson('srs:schedule:v2', {}) || {};
    const decks = (lsJson('animei:decks', []) || []).filter((d) => d && Array.isArray(d.wordIds));
    const kn = lsJson('animei:knownWords', null);
    const known = new Set(kn && Array.isArray(kn.words) ? kn.words : []);
    return { words, schedule, decks, known, jlpt: {}, source: 'real' };
}

// JLPT-уровни реальных слов — из data/jlpt-n5n3.json (при открытии с диска fetch не сработает — останется 0).
function loadJlpt() {
    try {
        return fetch('../data/jlpt-n5n3.json').then((r) => r.ok ? r.json() : {}).catch(() => ({}));
    } catch (e) { return Promise.resolve({}); }
}

function todayKey() { return dayKey(new Date()); }

// Состояние вывески по расписанию SRS.
function wordState(w, data, today) {
    if (data.known.has(w.kanji)) return 'lit';
    const s = data.schedule[w.id];
    if (!s || !((s.reps > 0) || (s.interval > 0))) return 'new';
    if ((s.lapses || 0) >= 3) return 'worn';
    if (s.due && s.due <= today) return 'due';
    if ((s.interval || 0) >= 21) return 'lit';
    return 'warm';
}

// Кварталы: по колодам, остаток — «Без колоды». Большие колоды режутся на части по capacity.
function buildQuarters(data, capacity) {
    const byId = new Map(data.words.map((w) => [w.id, w]));
    const used = new Set();
    const quarters = [];
    const push = (name, emoji, ws) => {
        if (!ws.length) return;
        ws.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const parts = Math.ceil(ws.length / capacity);
        for (let i = 0; i < parts; i++) {
            quarters.push({ name: parts > 1 ? name + ' ' + (i + 1) + '/' + parts : name, emoji, words: ws.slice(i * capacity, (i + 1) * capacity) });
        }
    };
    data.decks.forEach((d) => {
        const ws = d.wordIds.map((id) => byId.get(id)).filter((w) => w && !used.has(w.id));
        ws.forEach((w) => used.add(w.id));
        push(d.name || 'Колода', d.emoji || '', ws);
    });
    push('Без колоды', '🌙', data.words.filter((w) => !used.has(w.id)));
    if (!quarters.length) quarters.push({ name: 'Пустая улица', emoji: '🌙', words: [] });
    return quarters;
}

window.StreetData = { buildDemo, loadReal, loadJlpt, buildQuarters, wordState, todayKey, lsJson };
})();
