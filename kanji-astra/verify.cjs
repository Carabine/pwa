'use strict';
// Проверки без браузера и сервера: защищают геометрию, расписание и границы API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const local = new Map(), calls = [], events = [];
const window = { addEventListener() {}, dispatchEvent(e) { events.push(e.type); }, Freeze: { isWord: w => !!w.frozen } };
const context = vm.createContext({
    window, Freeze: window.Freeze, Event, Date, Intl, Map, Set, navigator: { onLine: true },
    localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value) },
    client: { async get(url, config) { calls.push({ url, config }); return { data: { data: Object.fromEntries(Array.from(config.params.chars).filter(c => c !== '無').map(c => [c, { s: ['M10,10L90,90'], n: [], parts: [] }])) } }; } }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), context);
const C = window.KanjiCore;
const line = [{ x: 10, y: 20 }, { x: 90, y: 20 }];
const ref = points => ({ points: C.resample(points), length: C.length(points) });
assert.equal(C.compare(line, ref(line), 'memory'), null);
assert.equal(C.compare([{ x: 10, y: 23 }, { x: 45, y: 21 }, { x: 90, y: 22 }], ref(line), 'memory'), null);
assert.ok(C.compare(line.slice().reverse(), ref(line), 'memory'));
assert.ok(C.compare(line.map(p => ({ x: p.x, y: p.y + 25 })), ref(line), 'memory'));
assert.ok(C.compare([{ x: 10, y: 20 }, { x: 45, y: 80 }, { x: 90, y: 20 }], ref(line), 'memory'));
assert.ok(C.compare([{ x: 10, y: 20 }, { x: 35, y: 20 }], ref(line), 'memory'));
assert.ok(C.compare([{ x: 10, y: 20 }], ref(line), 'memory'));
const dot = [{ x: 40, y: 40 }, { x: 43, y: 44 }];
assert.equal(C.compare(dot, ref(dot), 'trace'), null);
assert.equal(C.compare(dot.slice().reverse(), ref(dot), 'memory'), 'Direction');
const bent = [{ x: 10, y: 10 }, { x: 70, y: 10 }, { x: 70, y: 80 }];
assert.equal(C.compare(bent, ref(bent), 'trace'), null);
assert.ok(C.compare([bent[0], bent[2]], ref(bent), 'memory'));
const chars = C.extract([
    { id: '1', kanji: '日本日本かな', lang: 'ja' }, { id: '2', kanji: '本屋', lang: 'ja' },
    { id: '3', kanji: '火', frozen: true }, { id: '4', kanji: '水', lang: 'en' },
    { id: '5', kanji: '𠮷野', lang: 'ja' }
]);
assert.equal(chars.map(x => x.char).join(''), '日本屋𠮷野');
assert.equal(chars.find(x => x.char === '本').words.length, 2);
let now = new Date(2026, 9, 1, 12).getTime(), p = C.schedule(null, 'independent', now);
assert.equal(p.interval, 1);
assert.equal(C.schedule(p, 'independent', now + 1000).level, 1);
now += 86400000;
p = C.schedule(p, 'independent', now); assert.equal(p.interval, 3);
now += 3 * 86400000;
p = C.schedule(p, 'independent', now); assert.equal(p.interval, 7);
assert.equal(C.schedule(p, 'effort', now).interval, 1);
const lapse = C.schedule(p, 'assisted', now);
assert.equal(lapse.level, 0); assert.equal(lapse.due - now, 600000);
assert.equal(C.schedule(p, 'skipped', now).interval, 0);
for (let i = 0; i < 10; i++) { now += 86400000; p = C.schedule(p, 'independent', now); }
assert.equal(p.interval, 60); assert.equal(p.level, 6);
C.write('progress:日', { ...p, due: Date.now() - 1 });
assert.equal(C.stats(chars).learned, 1); assert.equal(C.stats(chars).due, 1);
assert.equal(C.queue(chars, 'new').length, chars.length - 1);
assert.equal(C.queue(chars, 'today')[0].char, '日');
assert.equal(C.queue(chars, 'free').length, chars.length);

async function verify() {
    const batch = Array.from({ length: 121 }, (_, i) => String.fromCodePoint(0x4e00 + i));
    const loaded = await C.strokes(batch);
    assert.equal(loaded.result.size, 121); assert.equal(calls.length, 3);
    assert.ok(calls.every(c => c.url === 'kanji/strokes' && Array.from(c.config.params.chars).length <= 60));
    await C.strokes(batch); assert.equal(calls.length, 3);
    const absent = await C.strokes(['無']); assert.equal(absent.missing[0], '無');
    const count = calls.length; await C.strokes(['無']); assert.equal(calls.length, count);
    C.write('stroke:愛', { data: { s: ['M1,1L40,40'] }, time: 1 });
    context.navigator.onLine = false;
    const offline = await C.strokes(['愛', '猫']);
    assert.ok(offline.result.has('愛')); assert.equal(offline.unavailable[0], '猫');
    assert.equal(C.read('stroke:猫', null), null);
    context.localStorage.setItem = () => { throw new Error('quota'); };
    C.record('語', 'independent'); assert.ok(C.progress('語')); assert.ok(events.includes('kanji:storage-error'));

    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
        if (!match[1].startsWith('.') || match[1].includes("' + lang + '")) continue;
        assert.ok(fs.existsSync(path.resolve(__dirname, match[1])), 'Missing file: ' + match[1]);
    }
    ['uk', 'en'].forEach(lang => assert.ok(fs.existsSync(path.resolve(__dirname, '../js/i18n/' + lang + '.js'))));
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
    assert.equal(manifest.scope, './'); assert.equal(manifest.start_url, './');
    manifest.icons.forEach(icon => assert.ok(fs.existsSync(path.resolve(__dirname, icon.src))));
    const dictionaries = {};
    for (const lang of ['ru', 'uk', 'en']) {
        const w = { KANJI_LANG: lang }, document = { documentElement: {}, querySelectorAll: () => [] };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'i18n.js'), 'utf8'), { window: w, document });
        dictionaries[lang] = w.KANJI_I18N;
    }
    const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    const keys = new Set(Array.from(app.matchAll(/(?:tr|button)\('([a-zA-Z]+)'/g), m => m[1]));
    keys.delete('error');
    ['errorStart', 'errorEnd', 'errorDirection', 'errorShape', 'study', 'trace', 'memory', 'independent', 'effort', 'assisted', 'skipped', 'fresh', 'learned', 'due'].forEach(k => keys.add(k));
    for (const [lang, dictionary] of Object.entries(dictionaries)) {
        for (const key of keys) assert.notEqual(dictionary.text(key), key, 'Missing ' + lang + ':' + key);
        assert.ok(!dictionary.text('stats', { total: 1, learned: 0, due: 0 }).includes('{'));
    }
    console.log('OK: geometry, extraction, scheduling, queues, stroke cache/API, storage failure, links, manifest, ru/uk/en.');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
