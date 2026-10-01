(function () {
    'use strict';
    const PREFIX = 'animei:kanjiAstra:', DAY = 86400000, TTL = 30 * DAY;
    const memory = new Map();
    function read(key, fallback) {
        if (memory.has(key)) return memory.get(key);
        try { const value = JSON.parse(localStorage.getItem(PREFIX + key)); return value == null ? fallback : value; }
        catch (_) { return fallback; }
    }
    function write(key, value) {
        memory.set(key, value);
        try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); }
        catch (_) { window.dispatchEvent(new Event('kanji:storage-error')); }
    }
    window.addEventListener('storage', e => {
        if (!e.key) memory.clear();
        else if (e.key.startsWith(PREFIX)) memory.delete(e.key.slice(PREFIX.length));
    });
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    function length(points) { let n = 0; for (let i = 1; i < points.length; i++) n += distance(points[i - 1], points[i]); return n; }
    function resample(points, count) {
        count = count || 32;
        if (points.length < 2) return null;
        const cumulative = [0];
        for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
        const total = cumulative[cumulative.length - 1];
        if (total < .5) return null;
        let j = 1;
        return Array.from({ length: count }, (_, i) => {
            const target = total * i / (count - 1);
            while (j < points.length - 1 && cumulative[j] < target) j++;
            const span = cumulative[j] - cumulative[j - 1];
            const ratio = span ? (target - cumulative[j - 1]) / span : 0;
            return { x: points[j - 1].x + ratio * (points[j].x - points[j - 1].x), y: points[j - 1].y + ratio * (points[j].y - points[j - 1].y) };
        });
    }
    function compare(points, ref, mode) {
        const sampled = resample(points), expected = ref.points;
        if (!sampled) return 'Shape';
        const tolerance = mode === 'trace' ? 9 : 12;
        // Положение сохраняем: нормализация скрыла бы неверный размер и смещение частей.
        if (distance(sampled[0], expected[0]) > tolerance) return 'Start';
        if (distance(sampled[31], expected[31]) > tolerance + 2) return 'End';
        const ratio = length(points) / ref.length;
        if (ratio < .55 || ratio > 1.65) return 'Shape';
        for (const range of [[0, 8], [23, 31]]) {
            const a = range[0], b = range[1];
            const ux = sampled[b].x - sampled[a].x, uy = sampled[b].y - sampled[a].y;
            const vx = expected[b].x - expected[a].x, vy = expected[b].y - expected[a].y;
            const product = Math.hypot(ux, uy) * Math.hypot(vx, vy);
            if (product > .2 && (ux * vx + uy * vy) / product < (ref.length < 12 ? -.15 : .15)) return 'Direction';
        }
        const errors = sampled.map((p, i) => distance(p, expected[i]));
        if (errors.reduce((a, b) => a + b, 0) / 32 > tolerance * .8 || Math.max(...errors) > tolerance * 1.8) return 'Shape';
        return null;
    }
    function extract(words) {
        const map = new Map();
        for (const word of words) {
            if (!word || word.lang === 'en' || (window.Freeze && Freeze.isWord(word))) continue;
            for (const char of new Set(String(word.kanji || '').match(/\p{Script=Han}/gu) || [])) {
                if (!map.has(char)) map.set(char, { char, words: [] });
                map.get(char).words.push(word);
            }
        }
        return Array.from(map.values());
    }
    function progress(char) {
        const p = read('progress:' + char, null);
        return p && Number.isFinite(p.due) && Number.isInteger(p.level) && p.level >= 0 && p.level <= 6 ? p : null;
    }
    function stats(items) {
        const out = { total: items.length, learned: 0, due: 0, fresh: 0 };
        for (const item of items) {
            const p = progress(item.char);
            if (!p) out.fresh++;
            else { if (p.interval >= 7) out.learned++; if (p.due <= Date.now()) out.due++; }
        }
        return out;
    }
    function queue(items, type) {
        const now = Date.now();
        return items.filter(item => {
            const p = progress(item.char);
            return type === 'free' || (type === 'new' ? !p : !p || p.due <= now);
        }).sort((a, b) => {
            const pa = progress(a.char), pb = progress(b.char);
            return (pa ? pa.due : Infinity) - (pb ? pb.due : Infinity);
        });
    }
    function dayKey(time) { const d = new Date(time); return [d.getFullYear(), d.getMonth(), d.getDate()].join('-'); }
    function schedule(previous, grade, now) {
        const p = previous || { level: 0, attempts: 0 }, intervals = [1, 3, 7, 14, 30, 60];
        let level = p.level, interval = 0, due = now + 600000, advanced = p.advanced || '';
        if (grade === 'independent') {
            if (advanced !== dayKey(now)) { level = Math.min(6, level + 1); advanced = dayKey(now); }
            level = Math.max(1, level);
            interval = intervals[level - 1];
        } else if (grade === 'effort') interval = 1;
        else level = 0;
        if (interval) { const date = new Date(now); date.setDate(date.getDate() + interval); due = date.getTime(); }
        return { level, interval, due, advanced, grade, attempts: (p.attempts || 0) + 1, updated: now };
    }
    function record(char, grade) {
        const p = schedule(progress(char), grade, Date.now());
        write('progress:' + char, p);
        return p;
    }
    function validStroke(data) {
        return data && Array.isArray(data.s) && data.s.length > 0 && data.s.length <= 64 && data.s.every(s => typeof s === 'string' && s.length < 12000 && /^[Mm]/.test(s));
    }
    async function strokes(chars, cacheOnly) {
        const result = new Map(), missing = [], unavailable = [], pending = [];
        const now = Date.now();
        chars.forEach(char => {
            const cached = read('stroke:' + char, null);
            if (cached && validStroke(cached.data)) result.set(char, cached.data);
            if (!cached || !Number.isFinite(cached.time) || now - cached.time >= TTL || (cached.data !== null && !validStroke(cached.data))) pending.push(char);
            else if (cached.data === null) missing.push(char);
        });
        for (let i = 0; i < pending.length; i += 60) {
            const batch = pending.slice(i, i + 60);
            try {
                if (cacheOnly || navigator.onLine === false) throw new Error('offline');
                const response = await client.get('kanji/strokes', { params: { chars: batch.join('') }, timeout: 15000 });
                const data = response.data && response.data.data;
                if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid response');
                for (const char of batch) {
                    if (validStroke(data[char])) { result.set(char, data[char]); write('stroke:' + char, { time: now, data: data[char] }); }
                    else if (!Object.prototype.hasOwnProperty.call(data, char)) {
                        if (!result.has(char)) { missing.push(char); write('stroke:' + char, { time: now, data: null }); }
                    } else if (!result.has(char)) unavailable.push(char);
                }
            } catch (_) { batch.forEach(char => { if (!result.has(char)) unavailable.push(char); }); }
        }
        return { result, missing, unavailable };
    }
    window.KanjiCore = { read, write, extract, stats, queue, progress, schedule, record, strokes, resample, compare, length };
})();
