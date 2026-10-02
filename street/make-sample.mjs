// Тестовый набор для «Улицы слов» (/app/street/walk.html?src=sample): снимок словаря владельца
// из words-busyd.js без внутренних ID. Даты повторений хранятся вместе с днём снимка
// и при открытии сдвигаются на сегодня — состояния вывесок не «протухают».
// Запуск: node make-sample.mjs → sample-words.js
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('words-busyd.js', import.meta.url), 'utf8');
const window = {}; new Function('window', src)(window);
const S = window.STREET_WORDS;
const ids = new Map(); let n = 0;
const id = (x) => { if (!ids.has(x)) ids.set(x, 's' + (++n)); return ids.get(x); };
const day = new Date().toISOString().slice(0, 10);
const words = S.words.map((w) => ({ id: id(w.id), kanji: w.kanji, kana: w.kana, translation: w.translation, createdAt: new Date(w.createdAt).toISOString() }));
const schedule = {}; Object.keys(S.schedule || {}).forEach((k) => { if (!ids.has(k)) return; const s = S.schedule[k]; schedule[ids.get(k)] = { interval: s.interval, reps: s.reps, lapses: s.lapses, due: s.due }; });
const decks = S.decks.map((d, i) => ({ id: 'd' + (i + 1), name: d.name, emoji: d.emoji || '', wordIds: d.wordIds.filter((x) => ids.has(x)).map((x) => ids.get(x)) }));
const known = S.known.map((k) => (typeof k === 'string' ? { kanji: k } : { kanji: k.kanji, kana: k.kana || '', translation: k.translation || '' }));
const out = { sample: true, snapshotDay: day, words, schedule, decks, known };
writeFileSync(new URL('sample-words.js', import.meta.url), '/* Тестовый набор «Улицы слов» (?src=sample): снимок словаря, сделан make-sample.mjs. */\nwindow.STREET_WORDS = ' + JSON.stringify(out) + ';\n');
console.log('sample-words.js:', words.length, 'слов,', decks.length, 'колод,', known.length, '«уже знаю», день снимка', day);
