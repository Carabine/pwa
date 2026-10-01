/* Улица слов — процедурный ночной переулок из словаря. Canvas 2D, честная проекция.
 *
 * Устройство: сцена живёт в метрах (камера в начале координат, смотрит вдоль z,
 * стены на x = ±W/2, земля y = 0). Всё статичное (здания, вывески, отражения,
 * свет на стенах) один раз рисуется в offscreen-слой; каждый кадр — только
 * бликующие вывески, пар, дождь, вода и лёгкий параллакс. Поэтому 60 fps.
 */
(function () {
'use strict';

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const JP = '"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo","Noto Sans CJK JP",sans-serif';
const UI = 'Inter,system-ui,-apple-system,sans-serif';

// ---------- утилиты ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(h, a) { const c = hexToRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function mix(h1, h2, t) {
    const a = hexToRgb(h1), b = hexToRgb(h2);
    const r = Math.round(lerp(a[0], b[0], t)), g = Math.round(lerp(a[1], b[1], t)), bl = Math.round(lerp(a[2], b[2], t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}
function luma(h) { const c = hexToRgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
function chars(str) { return Array.from(str || ''); }

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * DPR)); c.height = Math.max(1, Math.ceil(h * DPR));
    const g = c.getContext('2d');
    g.scale(DPR, DPR);
    return [c, g];
}
function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

// ---------- темы ----------
const THEMES = {
    shinjuku: {
        id: 'shinjuku', title: 'Дождливый Синдзюку',
        streetW: 7.2, eye: 1.6, zEdge: 2.7, horizon: 0.57,
        zNear: 2.7, zSlotFar: 30, zGate: 48,
        fogColor: '#1a1a4a', fogStart: 7, fogEnd: 48, fogMax: 0.82,
        sky: ['#030309', '#0a0a22', '#1c1448'], ground: ['#06060c', '#0c0d1c'],
        rain: true, reflect: 0.62, water: false, puddles: false, smear: 7,
        palette: { 5: '#ffd23f', 4: '#ff6b35', 3: '#ff3fa4', 2: '#36e2ff', 1: '#b06bff', 0: '#7c8cf8' },
        bld: { floorH: 3.3, floorsMin: 4, floorsMax: 8, lenMin: 4.5, lenMax: 9, colors: ['#15151f', '#181422', '#121a22', '#1a1624'], winLit: 0.33, winColors: ['#ffd9a0', '#9ad0ff', '#ffb0c8', '#c8ffe0'], shopGlow: ['#ffb060', '#7c8cf8', '#ff5a8a', '#52e0ff'] },
        awningY: 3.3, awningD: 0.8, wiresAcross: 4, wireY: 6.6, ac: true, steamVents: 2,
        tiers: [
            { kind: 'vsign', y0: 4.2, y1: 7.9, w: 0.95, k: 1.34, chars: 4, inset: 0.12 },
            { kind: 'vsign', y0: 8.1, y1: 11.8, w: 0.95, k: 1.34, chars: 4, inset: 0.12 },
            { kind: 'vsign', y0: 12.0, y1: 16.8, w: 1.05, k: 1.34, chars: 5, inset: 0.12 },
        ],
        hbox: { y0: 3.45, y1: 4.15, minChars: 4 },
        lanterns: null, noren: null,
        stars: 0, figures: 7, umbrellas: true, vending: true,
    },
    yokocho: {
        id: 'yokocho', title: 'Омоидэ-ёкотё',
        streetW: 3.0, eye: 1.55, zEdge: 1.15, horizon: 0.6,
        zNear: 1.15, zSlotFar: 15, zGate: 24,
        fogColor: '#3a2410', fogStart: 4, fogEnd: 24, fogMax: 0.8,
        sky: ['#06050a', '#120c14', '#2a1a14'], ground: ['#0a0806', '#1a120c'],
        rain: false, reflect: 0.5, water: false, puddles: true, smear: 4,
        palette: { 5: '#ffcf5a', 4: '#ff8a3c', 3: '#ff5f7a', 2: '#5ad8c8', 1: '#b98cff', 0: '#8c9bff' },
        bld: { floorH: 2.9, floorsMin: 2, floorsMax: 2, lenMin: 2.2, lenMax: 3.6, colors: ['#2a1c12', '#241a14', '#2e2016', '#1f1812'], winLit: 0.45, winColors: ['#ffc070', '#ffd9a0', '#ffb070'], shopGlow: ['#ffb060', '#ffcf7a', '#ff9a4a', '#ffd080'] },
        awningY: 2.95, awningD: 0.75, wiresAcross: 6, wireY: 4.6, ac: true, steamVents: 3,
        tiers: [
            { kind: 'vsign', y0: 3.3, y1: 5.9, w: 0.55, k: 1.42, chars: 5, inset: 0.08, zStart: 1.45 },
        ],
        hbox: { y0: 2.98, y1: 3.42, minChars: 6 },
        lanterns: { y0: 2.2, y1: 2.8, w: 0.42, k: 1.38, protr: 0.3, maxChars: 2 },
        noren: { y0: 1.55, y1: 2.2, len: 1.5, maxChars: 3 },
        stars: 40, figures: 5, clutter: true,
    },
    dotonbori: {
        id: 'dotonbori', title: 'Дотомбори',
        streetW: 11, eye: 2.6, zEdge: 3.4, horizon: 0.56,
        zNear: 3.4, zSlotFar: 36, zGate: 52,
        fogColor: '#1a2a4a', fogStart: 10, fogEnd: 52, fogMax: 0.78,
        sky: ['#03040a', '#071027', '#132a55'], ground: ['#04070d', '#081425'],
        rain: false, reflect: 0.85, water: true, puddles: false, smear: 3,
        palette: { 5: '#ffd33d', 4: '#ff5c3a', 3: '#ff44b0', 2: '#2ee6ff', 1: '#9f6bff', 0: '#7c8cf8' },
        bld: { floorH: 3.4, floorsMin: 4, floorsMax: 6, lenMin: 5, lenMax: 10, colors: ['#131826', '#161322', '#11202a', '#1b1a2a'], winLit: 0.3, winColors: ['#ffd9a0', '#9ad0ff', '#ffb0c8'], shopGlow: ['#ffb060', '#ff5a8a', '#52e0ff', '#ffe060'] },
        awningY: 3.4, awningD: 0.6, wiresAcross: 0, wireY: 0, ac: false, steamVents: 0,
        promenade: 1.7,
        tiers: [],
        bills: { bands: [[3.9, 7.7], [8.1, 11.9], [12.3, 16.1]], gap: 0.6 },
        hbox: null, lanterns: null, noren: null,
        stars: 70, moon: true, figures: 8,
    },
};

// ---------- класс сцены ----------
class Street {
    constructor(canvas, themeId, opts) {
        this.canvas = canvas;
        this.g = canvas.getContext('2d');
        this.theme = THEMES[themeId] || THEMES.shinjuku;
        this.opts = Object.assign({ rain: this.theme.rain, onTap: null }, opts || {});
        this.quarter = null;
        this.signs = [];
        this.dyn = [];               // мигающие и зажигающиеся вывески — рисуются каждый кадр
        this.rainDrops = [];
        this.ripples = [];
        this.par = { x: 0, y: 0, tx: 0, ty: 0 };
        this.trans = null;
        this.t0 = performance.now();
        this.lastT = this.t0;
        this.fps = { n: 0, t: 0, v: 0 };
        this.resize();
        this._loop = this.loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    resize() {
        const W = this.canvas.clientWidth || 390, H = this.canvas.clientHeight || 844;
        this.W = W; this.H = H;
        this.canvas.width = Math.round(W * DPR); this.canvas.height = Math.round(H * DPR);
        const th = this.theme;
        this.cx = W / 2;
        this.hy = Math.round(H * th.horizon);
        this.f = (W / 2) * th.zEdge / (th.streetW / 2);
        [this.stat, this.sg] = makeCanvas(W, H);
        [this.refl, this.rg] = makeCanvas(W, H);
        this.steamBlob = this.makeBlob(64, '#ffffff');
        this.initRain();
        if (this.quarter) this.setQuarter(this.quarter, true);
    }

    // проекция точки сцены (метры) в css-пиксели; mir — отражение в земле (y → -y)
    P(x, y, z, mir) {
        const yy = mir ? -y : y;
        return [this.cx + this.f * x / z, this.hy - this.f * (yy - this.theme.eye) / z];
    }
    fogA(z) { const th = this.theme; return clamp((z - th.fogStart) / (th.fogEnd - th.fogStart), 0, 1) * th.fogMax; }
    vis(z) { return 1 - this.fogA(z); }

    makeBlob(size, color) {
        const [c, g] = makeCanvas(size, size);
        const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gr.addColorStop(0, rgba(color, 0.55)); gr.addColorStop(0.5, rgba(color, 0.18)); gr.addColorStop(1, rgba(color, 0));
        g.fillStyle = gr; g.fillRect(0, 0, size, size);
        return c;
    }

    // ---------- раскладка ----------
    setQuarter(q, keepDyn) {
        this.quarter = q;
        this.rnd = mulberry32(hashStr(q.name + '|' + this.theme.id) + 7);
        this.buildings = { '-1': this.genBuildings(-1), '1': this.genBuildings(1) };
        this.signs = this.layout(q);
        this.dyn = this.signs.filter((s) => s.state === 'due');
        this.vents = this.genVents();
        this.boat = this.theme.water ? { z: 20 + this.rnd() * 10, v: 0.35 } : null;
        this.deco = this.genDeco();
        this.renderStatic();
    }

    // Декор, который делает улицу живой: прохожие, хлам у стен, дальние огни, скайлайн.
    genDeco() {
        const th = this.theme, W2 = th.streetW / 2, rnd = mulberry32(hashStr(this.quarter.name + 'deco' + th.id));
        const d = { figures: [], clutter: [], far: [], skyline: [], stars: [] };
        for (let i = 0; i < (th.figures || 0); i++) {
            const z = th.zNear * (2.3 + rnd() * 2.5) + rnd() * th.zSlotFar * 0.35;
            let x;
            if (th.water) { const side = rnd() < 0.5 ? -1 : 1; x = side * (W2 - th.promenade * (0.35 + rnd() * 0.5)); }
            else x = (rnd() - 0.5) * 2 * (W2 - 0.7) * 0.9;
            d.figures.push({ x, z, h: 1.5 + rnd() * 0.3, umb: th.umbrellas && rnd() < 0.8, umbC: ['#1b1b24', '#22243a', '#2a1a2a', '#1a2a2a'][Math.floor(rnd() * 4)], dir: rnd() < 0.5 ? -1 : 1, seed: rnd() });
        }
        if (th.clutter || th.vending) {
            [-1, 1].forEach((side) => this.buildings[side].forEach((b) => {
                if (b.z0 > th.zSlotFar * 0.9) return;
                const zmin = Math.max(b.z0 + 0.2, th.zNear * 1.6);
                if (zmin > b.z1 - 1.2) return;
                if (th.vending && rnd() < 0.4) d.clutter.push({ kind: 'vending', side, z: zmin + rnd() * Math.max(0.2, b.z1 - zmin - 1.6), color: ['#dce9ff', '#ffe9c0', '#ffd6e4'][Math.floor(rnd() * 3)] });
                if (th.clutter) {
                    const n = 1 + Math.floor(rnd() * 3);
                    for (let k = 0; k < n; k++) {
                        const kind = ['crate', 'stool', 'bin', 'crate'][Math.floor(rnd() * 4)];
                        d.clutter.push({ kind, side, z: zmin + rnd() * Math.max(0.2, b.z1 - zmin - 0.8), color: kind === 'crate' ? ['#d9b23a', '#3a6fd9', '#d94a3a'][Math.floor(rnd() * 3)] : '#2a2420', stack: 1 + Math.floor(rnd() * 3) });
                    }
                }
            }));
        }
        // дальние огни: безымянные вывески и окна у точки схода
        const cols = Object.values(th.palette);
        const Hfar = th.bld.floorsMax * th.bld.floorH * 0.85;
        [-1, 1].forEach((side) => {
            for (let z = th.zSlotFar * 1.05; z < th.zGate * 0.97; z *= 1.045) {
                const n = 1 + Math.floor(rnd() * 3);
                for (let k = 0; k < n; k++) {
                    const w = 0.3 + rnd() * 0.9, h = 0.5 + rnd() * 1.6;
                    d.far.push({ side, z, y: 2 + rnd() * Hfar, w, h, color: cols[Math.floor(rnd() * cols.length)], a: (0.3 + rnd() * 0.6) * (th.id === 'yokocho' ? 0.6 : 1), frontal: rnd() < 0.5 });
                }
            }
        });
        for (let i = 0; i < 26; i++) d.skyline.push({ x: rnd(), w: 0.03 + rnd() * 0.08, h: 0.05 + rnd() * 0.22, seed: rnd() });
        for (let i = 0; i < (th.stars || 0); i++) d.stars.push({ x: rnd(), y: rnd() * 0.5, a: 0.2 + rnd() * 0.7, r: 0.4 + rnd() * 0.8 });
        return d;
    }

    genBuildings(side) {
        const th = this.theme, b = th.bld, list = [];
        const rnd = mulberry32(hashStr(this.quarter.name + side + th.id));
        let z = th.zNear * 0.45;
        while (z < th.zGate + 4) {
            const len = lerp(b.lenMin, b.lenMax, rnd());
            const floors = b.floorsMin + Math.floor(rnd() * (b.floorsMax - b.floorsMin + 1));
            list.push({
                side, z0: z, z1: z + len, floors, H: floors * b.floorH + 0.6,
                color: b.colors[Math.floor(rnd() * b.colors.length)],
                shop: rnd() < 0.8, shopColor: b.shopGlow[Math.floor(rnd() * b.shopGlow.length)],
                shutter: rnd() < 0.25, seed: rnd(), hbox: null,
            });
            z += len;
        }
        return list;
    }

    genVents() {
        const th = this.theme, out = [];
        for (let i = 0; i < th.steamVents; i++) {
            const side = i % 2 ? 1 : -1;
            const z = th.zNear * (1.1 + i * 0.9) + this.rnd() * th.zNear;
            out.push({ side, z, x: side * (th.streetW / 2 - 0.25), y: 0.5 + this.rnd() * 0.6, parts: [] });
            for (let k = 0; k < 7; k++) out[i].parts.push({ age: this.rnd() * 3, life: 2.6 + this.rnd() * 1.4, dx: (this.rnd() - 0.5) * 0.4, rot: this.rnd() * 6.28 });
        }
        return out;
    }

    // Слоты квартала. Ближние — крупные, дальше — геометрическая прогрессия по z,
    // чтобы вывески одного яруса не наезжали в экранных координатах.
    makeSlots() {
        const th = this.theme, W2 = th.streetW / 2, slots = [];
        th.tiers.forEach((t, ti) => {
            [-1, 1].forEach((side) => {
                const frac = (ti * 0.37 + (side > 0 ? 0.5 : 0.0)) % 1;
                let z = th.zNear * (t.zStart || 1.02) * Math.pow(t.k, frac);
                let i = 0;
                while (z < th.zSlotFar) {
                    slots.push({ kind: 'vsign', side, z, tier: t, maxChars: t.chars, style: (i + ti + (side > 0 ? 1 : 0)) % 3 === 0 ? 'vbox' : 'vneon' });
                    z *= t.k; i++;
                }
            });
        });
        if (th.lanterns) {
            const L = th.lanterns;
            [-1, 1].forEach((side) => {
                let z = th.zNear * (side > 0 ? 1.18 : 1.0);
                let i = 0;
                while (z < th.zSlotFar) {
                    slots.push({ kind: 'lantern', side, z, maxChars: L.maxChars, white: (i % 3 === 2) });
                    z *= L.k; i++;
                }
            });
        }
        if (th.noren) {
            [-1, 1].forEach((side) => this.buildings[side].forEach((b) => {
                if (b.z1 < th.zNear * 1.1 || b.z0 > th.zSlotFar || b.z1 - b.z0 < th.noren.len + 0.8) return;
                const z0 = Math.max(b.z0 + 0.45, th.zNear * 0.7);
                if (z0 + th.noren.len > b.z1 - 0.3) return;
                slots.push({ kind: 'noren', side, z: z0, z0, z1: z0 + th.noren.len, maxChars: th.noren.maxChars, bld: b });
            }));
        }
        if (th.hbox) {
            [-1, 1].forEach((side) => this.buildings[side].forEach((b) => {
                if (b.z0 < th.zNear * 0.9 || b.z0 > th.zSlotFar * 0.8) return;
                slots.push({ kind: 'hbox', side, z: b.z0 + 0.3, z0: b.z0 + 0.3, z1: b.z1 - 0.3, minChars: th.hbox.minChars, maxChars: 12, bld: b });
            }));
        }
        slots.sort((a, b) => a.z - b.z);
        return slots;
    }

    capacity() {
        if (this.theme.bills) return 44;
        if (!this._cap) {
            if (!this.buildings) { this.quarter = { name: 'cap', words: [] }; this.buildings = { '-1': this.genBuildings(-1), '1': this.genBuildings(1) }; }
            this._cap = Math.floor(this.makeSlots().length * 0.82);
        }
        return this._cap;
    }

    layout(q) {
        const th = this.theme, W2 = th.streetW / 2;
        const words = q.words.map((w) => ({ w, text: w.kanji || w.kana || '', state: w._state || 'new', color: w._color || th.palette[0], jlpt: w._jlpt || 0 }));
        const signs = [];
        if (th.bills) return this.layoutBills(words);
        const slots = this.makeSlots();
        const used = new Set();
        const take = (pred) => {
            for (let i = 0; i < slots.length; i++) { if (!used.has(i) && pred(slots[i])) { used.add(i); return slots[i]; } }
            return null;
        };
        words.forEach((wd, idx) => {
            const n = chars(wd.text).length;
            let s = null;
            if (n <= 2 && th.lanterns && idx % 3 !== 1) s = take((sl) => sl.kind === 'lantern' && n <= sl.maxChars);
            if (!s && n <= 3 && th.noren && idx % 4 === 2) s = take((sl) => sl.kind === 'noren');
            if (!s && n >= (th.hbox ? th.hbox.minChars : 99)) s = take((sl) => sl.kind === 'hbox');
            if (!s) s = take((sl) => sl.kind === 'vsign' && n <= sl.maxChars);
            if (!s) s = take((sl) => sl.kind === 'hbox');
            if (!s && th.lanterns && n <= 2) s = take((sl) => sl.kind === 'lantern');
            if (!s && th.noren && n <= 3) s = take((sl) => sl.kind === 'noren');
            if (!s) return;
            signs.push(this.makeSign(wd, s));
        });
        // пустые фонари заполняют ряд — улица не должна выглядеть недоделанной
        slots.forEach((sl, i) => {
            if (used.has(i) || sl.kind !== 'lantern') return;
            const d = this.makeSign({ w: null, text: '', state: 'warm', color: th.palette[0] }, sl);
            d.deco = true; d.inten = 0.75; d.isLit = true; d.chars = [];
            signs.push(d);
        });
        signs.sort((a, b) => b.z - a.z); // рисуем от дальних к ближним
        return signs;
    }

    makeSign(wd, s) {
        const th = this.theme, W2 = th.streetW / 2;
        const sign = { word: wd.w, text: wd.text, chars: chars(wd.text), state: wd.state, color: wd.color, kind: s.kind, side: s.side, z: s.z, seed: hashStr(wd.text) % 1000, sprites: {}, rect: null };
        sign.inten = wd.state === 'warm' ? 0.55 : 1;
        sign.isLit = wd.state === 'lit' || wd.state === 'warm' || wd.state === 'worn';
        sign.dead = wd.state === 'worn' ? sign.seed % sign.chars.length : -1;
        sign.tilt = wd.state === 'worn' ? (sign.seed % 2 ? 1 : -1) * (0.03 + (sign.seed % 7) * 0.006) : 0;
        if (s.kind === 'vsign') {
            const t = s.tier, n = sign.chars.length;
            sign.style = s.style;
            sign.w = t.w; sign.h = Math.min(t.y1 - t.y0, n * t.w * 0.92 + t.w * 0.45);
            sign.y1 = t.y1 - 0.15; sign.y0 = sign.y1 - sign.h;
            const xo = W2 - t.inset;
            sign.xa = s.side * (xo - sign.w); sign.xb = s.side * xo;
        } else if (s.kind === 'lantern') {
            const L = th.lanterns;
            sign.white = s.white;
            sign.w = L.w; sign.h = L.y1 - L.y0; sign.y0 = L.y0; sign.y1 = L.y1;
            const xo = W2 - L.protr;
            sign.xa = s.side * (xo - L.w); sign.xb = s.side * xo;
        } else if (s.kind === 'noren') {
            sign.z0 = s.z0; sign.z1 = s.z1; sign.y0 = th.noren.y0; sign.y1 = th.noren.y1; sign.facade = true;
            sign.cloth = ['#1d2a5c', '#2a1e4c', '#4a1a1a', '#1a3a3a', '#101018'][sign.seed % 5];
        } else if (s.kind === 'hbox') {
            sign.z0 = s.z0; sign.z1 = s.z1; sign.y0 = th.hbox.y0; sign.y1 = th.hbox.y1; sign.facade = true;
            s.bld.hbox = sign;
        }
        if (sign.xa !== undefined && sign.xa > sign.xb) { const t = sign.xa; sign.xa = sign.xb; sign.xb = t; }
        return sign;
    }

    // Дотомбори: огромные щиты на фасадах, укладываются подряд вдоль канала.
    layoutBills(words) {
        const th = this.theme, B = th.bills, signs = [];
        const cursors = [];
        B.bands.forEach((band, bi) => [-1, 1].forEach((side) => cursors.push({ side, band, z: th.zNear * (1 + bi * 0.12 + (side > 0 ? 0.08 : 0)) })));
        words.forEach((wd) => {
            cursors.sort((a, b) => a.z - b.z);
            const c = cursors[0];
            if (c.z > th.zSlotFar) return;
            const n = chars(wd.text).length;
            const h = c.band[1] - c.band[0];
            const len = clamp(n * h * 0.62 + h * 0.5, h * 0.9, h * 2.6);
            const sign = { word: wd.w, text: wd.text, chars: chars(wd.text), state: wd.state, color: wd.color, kind: 'bill', side: c.side, z: c.z, z0: c.z, z1: c.z + len, y0: c.band[0], y1: c.band[1], seed: hashStr(wd.text) % 1000, sprites: {}, facade: true, rect: null };
            sign.inten = wd.state === 'warm' ? 0.55 : 1;
            sign.isLit = wd.state === 'lit' || wd.state === 'warm' || wd.state === 'worn';
            sign.dead = wd.state === 'worn' ? sign.seed % sign.chars.length : -1;
            sign.tilt = 0;
            sign.styleIdx = sign.seed % 4;
            signs.push(sign);
            c.z = sign.z1 + B.gap + c.z * 0.02;
        });
        signs.sort((a, b) => b.z - a.z);
        return signs;
    }

    // ---------- спрайты вывесок ----------
    sprite(sign, lit) {
        const key = lit ? 'on' : 'off';
        if (sign.sprites[key] && sign.sprites[key].pw === sign.pw && sign.sprites[key].ph === sign.ph) return sign.sprites[key].c;
        let c;
        if (sign.kind === 'vsign') c = this.spriteVertical(sign, lit);
        else if (sign.kind === 'lantern') c = this.spriteLantern(sign, lit);
        else if (sign.kind === 'noren') c = this.spriteNoren(sign, lit);
        else c = this.spriteHorizontal(sign, lit);
        sign.sprites[key] = { c, pw: sign.pw, ph: sign.ph };
        return c;
    }

    drawVChars(g, list, cx, top, cell, fs, fillFor) {
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '700 ' + fs + 'px ' + JP;
        list.forEach((ch, i) => {
            const y = top + cell * (i + 0.5);
            g.fillStyle = fillFor(i);
            if (ch === 'ー' || ch === '—' || ch === '－') { g.save(); g.translate(cx, y); g.rotate(Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); }
            else g.fillText(ch, cx, y);
        });
    }

    spriteVertical(sign, lit) {
        const w = sign.pw, h = sign.ph, col = sign.color, inten = sign.inten;
        const pad = lit ? Math.ceil(w * 0.9) + 6 : 4;
        const [c, g] = makeCanvas(w + 2 * pad, h + 2 * pad);
        g.translate(pad, pad);
        const n = sign.chars.length;
        const cell = (h - w * 0.4) / n, fs = Math.min(w * 0.76, cell * 0.9);
        const top = w * 0.2;
        if (sign.style === 'vbox') {
            if (lit) {
                g.shadowColor = rgba(col, 0.9 * inten); g.shadowBlur = w * 0.7;
                g.fillStyle = rgba(mix(col, '#ffffff', 0.08), 0.5 + 0.5 * inten);
                roundRect(g, 0, 0, w, h, w * 0.06); g.fill(); g.fill();
                g.shadowBlur = 0;
                const gr = g.createLinearGradient(0, 0, w, 0);
                gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + (0.28 * inten) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
                g.fillStyle = gr; g.fill();
                const dark = luma(col) > 0.5 ? '#1a1030' : '#ffffff';
                this.drawVChars(g, sign.chars, w / 2, top, cell, fs, (i) => i === sign.dead ? rgba(dark, 0.25) : dark);
                if (sign.dead >= 0) { g.fillStyle = 'rgba(40,20,10,0.35)'; g.fillRect(0, top + cell * sign.dead, w, cell); }
            } else {
                g.fillStyle = mix(col, '#07070c', 0.84);
                roundRect(g, 0, 0, w, h, w * 0.06); g.fill();
                g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; g.stroke();
                this.drawVChars(g, sign.chars, w / 2, top, cell, fs, () => 'rgba(255,255,255,0.2)');
            }
        } else {
            g.fillStyle = lit ? '#0c0c15' : '#09090f';
            roundRect(g, 0, 0, w, h, w * 0.05); g.fill();
            if (lit) {
                const lw = Math.max(1, w * 0.045);
                g.shadowColor = rgba(col, 0.95); g.shadowBlur = w * 0.55 * inten;
                g.strokeStyle = rgba(col, 0.9 * inten); g.lineWidth = lw;
                roundRect(g, lw * 1.5, lw * 1.5, w - lw * 3, h - lw * 3, w * 0.05); g.stroke();
                const tube = rgba(col, 0.9 * inten);
                const core = mix(col, '#ffffff', 0.72);
                const dim = 'rgba(255,255,255,0.12)';
                this.drawVChars(g, sign.chars, w / 2, top, cell, fs, (i) => i === sign.dead ? dim : tube);
                this.drawVChars(g, sign.chars, w / 2, top, cell, fs, (i) => i === sign.dead ? 'rgba(0,0,0,0)' : tube);
                g.shadowBlur = w * 0.12;
                this.drawVChars(g, sign.chars, w / 2, top, cell, fs, (i) => i === sign.dead ? 'rgba(0,0,0,0)' : rgba(core, 0.85 * inten + 0.1));
                g.shadowBlur = 0;
                // отблеск от трубки на панели
                g.globalCompositeOperation = 'lighter';
                g.fillStyle = rgba(col, 0.08 * inten); g.fillRect(0, 0, w, h);
                g.globalCompositeOperation = 'source-over';
            } else {
                g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = Math.max(1, w * 0.04);
                roundRect(g, 2, 2, w - 4, h - 4, w * 0.05); g.stroke();
                this.drawVChars(g, sign.chars, w / 2, top, cell, fs, () => 'rgba(255,255,255,0.14)');
            }
        }
        if (sign.state === 'worn') { // ржавые потёки
            g.globalCompositeOperation = 'source-over';
            const rr = mulberry32(sign.seed);
            for (let i = 0; i < 4; i++) {
                const x = rr() * w, len = h * (0.3 + rr() * 0.6);
                const gr = g.createLinearGradient(0, 0, 0, len);
                gr.addColorStop(0, 'rgba(70,35,15,0.55)'); gr.addColorStop(1, 'rgba(70,35,15,0)');
                g.fillStyle = gr; g.fillRect(x, 0, Math.max(1, w * 0.06), len);
            }
        }
        return c;
    }

    spriteLantern(sign, lit) {
        const w = sign.pw, h = sign.ph, pad = lit ? Math.ceil(w * 1.1) + 6 : 4;
        const [c, g] = makeCanvas(w + 2 * pad, h + 2 * pad);
        g.translate(pad, pad);
        const body = sign.white ? (lit ? '#f6e6c4' : '#4a4034') : (lit ? '#ee4a2e' : '#52170f');
        const hot = sign.white ? '#fff6dc' : '#ffb257';
        const edge = sign.white ? '#b9a07a' : '#8e2314';
        const cx = w / 2, cy = h * 0.5, rx = w / 2, ry = h * 0.4;
        // верёвка и крышка
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, -pad + 1); g.lineTo(cx, h * 0.07); g.stroke();
        g.fillStyle = '#111'; roundRect(g, cx - w * 0.22, h * 0.05, w * 0.44, h * 0.07, 2); g.fill();
        if (lit) { g.shadowColor = rgba(hot, 0.9 * sign.inten); g.shadowBlur = w * 0.9 * sign.inten; }
        const gr = g.createRadialGradient(cx, cy - ry * 0.1, 0, cx, cy, rx * 1.1);
        if (lit) { gr.addColorStop(0, mix(body, hot, 0.75 * sign.inten)); gr.addColorStop(0.55, body); gr.addColorStop(1, edge); }
        else { gr.addColorStop(0, body); gr.addColorStop(1, mix(body, '#000', 0.5)); }
        g.fillStyle = gr;
        g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
        // рёбра
        g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1;
        for (let i = 1; i < 6; i++) {
            const yy = cy - ry + (2 * ry) * i / 6;
            const k = Math.sqrt(1 - Math.pow((yy - cy) / ry, 2));
            g.beginPath(); g.ellipse(cx, yy, rx * k, ry * 0.08, 0, 0, Math.PI); g.stroke();
        }
        g.fillStyle = '#111'; roundRect(g, cx - w * 0.22, cy + ry - h * 0.02, w * 0.44, h * 0.07, 2); g.fill();
        const n = sign.chars.length, cell = (ry * 1.6) / Math.max(n, 1), fs = Math.min(w * 0.62, cell * 0.9);
        this.drawVChars(g, sign.chars, cx, cy - ry * 0.8, cell, fs, (i) => i === sign.dead ? 'rgba(0,0,0,0.25)' : (lit ? 'rgba(20,8,4,0.92)' : 'rgba(0,0,0,0.55)'));
        return c;
    }

    // Норэн: занавес над дверью на плоскости фасада. Состояние показывает лампа над дверью.
    spriteNoren(sign, lit) {
        const w = sign.pw, h = sign.ph;
        const [c, g] = makeCanvas(w, h + 2);
        g.fillStyle = sign.cloth; g.fillRect(0, 0, w, h);
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, lit ? 'rgba(255,220,160,' + (0.28 * sign.inten) + ')' : 'rgba(255,255,255,0.03)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = Math.max(1, w * 0.012);
        for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(w * i / 3, h * 0.12); g.lineTo(w * i / 3, h); g.stroke(); }
        const n = sign.chars.length, cell = h * 0.8 / Math.max(n, 1), fs = Math.min(w * 0.22, cell * 0.9);
        this.drawVChars(g, sign.chars, w / 2, h * 0.1, cell, fs, (i) => i === sign.dead ? 'rgba(255,255,255,0.2)' : (lit ? 'rgba(255,250,235,0.95)' : 'rgba(255,255,255,0.45)'));
        return c;
    }

    // Горизонтальный короб (Синдзюку) / щит Дотомбори
    spriteHorizontal(sign, lit) {
        const w = sign.pw, h = sign.ph, col = sign.color, inten = sign.inten;
        const big = sign.kind === 'bill';
        const pad = lit ? Math.ceil(h * (big ? 0.5 : 0.8)) + 6 : 4;
        const [c, g] = makeCanvas(w + 2 * pad, h + 2 * pad);
        g.translate(pad, pad);
        const n = sign.chars.length;
        const fs = Math.min(h * (big ? 0.62 : 0.68), (w * 0.86) / Math.max(n, 1) * 1.05);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = (big ? '900 ' : '700 ') + fs + 'px ' + JP;
        const styleIdx = sign.styleIdx || 0;
        if (lit) {
            g.shadowColor = rgba(col, 0.9 * inten); g.shadowBlur = h * (big ? 0.45 : 0.7) * inten;
            if (big && styleIdx === 1) {
                g.fillStyle = rgba('#111118', 0.98); roundRect(g, 0, 0, w, h, h * 0.04); g.fill(); g.fill();
                g.shadowBlur = h * 0.3;
                g.strokeStyle = rgba(col, 0.95 * inten); g.lineWidth = Math.max(1.5, h * 0.03); roundRect(g, h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12, h * 0.03); g.stroke();
                g.fillStyle = rgba(col, 0.95 * inten);
            } else {
                g.fillStyle = rgba(mix(col, '#ffffff', 0.06), 0.55 + 0.45 * inten);
                roundRect(g, 0, 0, w, h, h * 0.04); g.fill(); g.fill();
                g.shadowBlur = 0;
                const gr = g.createLinearGradient(0, 0, 0, h);
                gr.addColorStop(0, 'rgba(255,255,255,' + (0.3 * inten) + ')'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
                g.fillStyle = gr; g.fill();
                g.fillStyle = luma(col) > 0.5 ? '#1a1030' : '#ffffff';
            }
            if (big && styleIdx === 2) { // кайма из лампочек
                g.save(); g.fillStyle = rgba('#fff2c0', 0.9 * inten); g.shadowColor = '#fff2c0'; g.shadowBlur = h * 0.08;
                const step = h * 0.12, r = h * 0.025;
                for (let x = step / 2; x < w; x += step) { g.beginPath(); g.arc(x, h * 0.045, r, 0, 6.28); g.fill(); g.beginPath(); g.arc(x, h - h * 0.045, r, 0, 6.28); g.fill(); }
                for (let y = step / 2; y < h; y += step) { g.beginPath(); g.arc(h * 0.045, y, r, 0, 6.28); g.fill(); g.beginPath(); g.arc(w - h * 0.045, y, r, 0, 6.28); g.fill(); }
                g.restore();
            }
            const textCol = g.fillStyle;
            const cw = fs * 1.0;
            const x0 = w / 2 - cw * (n - 1) / 2;
            sign.chars.forEach((ch, i) => { g.fillStyle = i === sign.dead ? rgba('#000000', 0.25) : textCol; g.fillText(ch, x0 + cw * i, h * 0.52); });
            if (sign.dead >= 0) { g.fillStyle = 'rgba(40,20,10,0.4)'; g.fillRect(x0 + cw * sign.dead - cw / 2, 0, cw, h); }
        } else {
            g.fillStyle = mix(col, '#07070c', 0.84); roundRect(g, 0, 0, w, h, h * 0.04); g.fill();
            g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.2)';
            const cw = fs * 1.0, x0 = w / 2 - cw * (n - 1) / 2;
            sign.chars.forEach((ch, i) => g.fillText(ch, x0 + cw * i, h * 0.52));
        }
        return c;
    }

    // ---------- отрисовка вывесок ----------
    // Фронтальные (плоскость z = const) — спрайт точно в экранном размере.
    drawFrontal(g, sign, lit, mir, alphaMul) {
        const [sx, sy] = this.P(sign.xa, sign.y1, sign.z, mir);
        const [ex, ey] = this.P(sign.xb, sign.y0, sign.z, mir);
        const pw = ex - sx, ph = Math.abs(ey - sy);
        if (pw < 2.5) return;
        sign.pw = Math.round(pw); sign.ph = Math.round(ph);
        const c = this.sprite(sign, lit);
        const padX = (c.width / DPR - sign.pw) / 2, padY = (c.height / DPR - sign.ph) / 2;
        const vis = this.vis(sign.z) * (alphaMul == null ? 1 : alphaMul);
        if (vis <= 0.02) return;
        g.save();
        g.globalAlpha = vis;
        if (mir) {
            g.translate(sx + pw / 2, ey);
            g.scale(1, -1);
            g.drawImage(c, -pw / 2 - padX, -padY, c.width / DPR, c.height / DPR);
        } else {
            if (sign.tilt) { g.translate(sx + pw / 2, sy); g.rotate(sign.tilt); g.translate(-(sx + pw / 2), -sy); }
            g.drawImage(c, sx - padX, sy - padY, c.width / DPR, c.height / DPR);
            if (!sign.rect) sign.rect = [sx - 4, sy - 4, sx + pw + 4, sy + ph + 4];
        }
        g.restore();
    }

    // Фасадные (плоскость x = const): спрайт режется на вертикальные полоски,
    // каждая со своей аффинной подгонкой — честная перспектива без WebGL.
    drawFacade(g, sign, lit, mir, alphaMul) {
        const th = this.theme, x = sign.side * th.streetW / 2;
        const pxm = Math.min(this.f / sign.z0, 60);
        sign.pw = Math.round((sign.z1 - sign.z0) * pxm); sign.ph = Math.round((sign.y1 - sign.y0) * pxm);
        if (sign.pw < 3 || sign.ph < 2) return;
        const c = this.sprite(sign, lit);
        const padX = (c.width / DPR - sign.pw) / 2, padY = (c.height / DPR - sign.ph) / 2;
        const vis = this.vis(sign.z0) * (alphaMul == null ? 1 : alphaMul);
        if (vis <= 0.02) return;
        const sw = c.width / DPR, sh = c.height / DPR;
        // спрайт с полями → границы в метрах
        const mz = padX / pxm, my = padY / pxm;
        const Y0 = sign.y0 - my, Y1 = sign.y1 + my;
        const za = sign.z0 - mz, zb = sign.z1 + mz;
        const near = this.P(x, Y1, za, mir), far = this.P(x, Y1, zb, mir);
        // полоски шириной в целое число device-пикселей (иначе видны швы), не шире ~0.8 css px у ближних щитов
        const wantN = clamp(Math.round(Math.abs(near[0] - far[0]) / 0.8), 4, 700);
        const stripDev = Math.max(1, Math.floor(c.width / wantN));
        const N = Math.ceil(c.width / stripDev);
        g.save();
        g.globalAlpha = vis;
        const strip = stripDev / DPR;
        let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
        for (let i = 0; i < N; i++) {
            // для правой стены спрайт разворачивается от дальнего конца к ближнему, чтобы глифы не зеркалились
            const u0 = i * strip / sw, u1 = Math.min(1, (i + 1) * strip / sw), um = (u0 + u1) / 2;
            const t0 = sign.side > 0 ? 1 - u0 : u0, t1 = sign.side > 0 ? 1 - u1 : u1, tm = sign.side > 0 ? 1 - um : um;
            const zz0 = lerp(za, zb, t0), zz1 = lerp(za, zb, t1), zzm = lerp(za, zb, tm);
            const a = this.P(x, Y1, zz0, mir), b = this.P(x, Y1, zz1, mir);
            const dm = this.P(x, Y0, zzm, mir), am = this.P(x, Y1, zzm, mir);
            const A = (b[0] - a[0]) / strip, B = (b[1] - a[1]) / strip, D = (dm[1] - am[1]) / sh;
            g.setTransform(DPR * A, DPR * B, 0, DPR * D, DPR * a[0], DPR * a[1]);
            g.drawImage(c, i * stripDev, 0, stripDev, c.height, 0, 0, strip + 0.35, sh);
            if (!mir) { minx = Math.min(minx, a[0], b[0]); maxx = Math.max(maxx, a[0], b[0]); miny = Math.min(miny, a[1], b[1]); maxy = Math.max(maxy, a[1] + D * sh); }
        }
        g.restore();
        if (!mir && !sign.rect) sign.rect = [minx, miny, maxx, maxy];
    }

    drawSign(g, sign, lit, mir, alphaMul) {
        if (sign.facade) this.drawFacade(g, sign, lit, mir, alphaMul);
        else this.drawFrontal(g, sign, lit, mir, alphaMul);
    }

    // ---------- статичная сцена ----------
    renderStatic() {
        const g = this.sg, th = this.theme, W = this.W, H = this.H;
        g.setTransform(DPR, 0, 0, DPR, 0, 0);
        g.clearRect(0, 0, W, H);
        this.signs.forEach((s) => { s.rect = null; });
        this.drawSky(g);
        this.drawGround(g);
        [-1, 1].forEach((side) => this.drawWall(g, side, false));
        this.drawFarLights(g, false);
        this.drawGate(g, false);
        this.drawWires(g);
        // отражения
        const r = this.rg;
        r.setTransform(DPR, 0, 0, DPR, 0, 0);
        r.clearRect(0, 0, W, H);
        [-1, 1].forEach((side) => this.drawWall(r, side, true));
        this.drawFarLights(r, true);
        this.drawGate(r, true);
        this.drawClutter(r, true);
        this.signs.forEach((s) => this.drawSign(r, s, s.isLit, true));
        this.drawFigures(r, true);
        this.postReflection(r);
        if (!th.water) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = th.reflect; g.drawImage(this.refl, 0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
        this.drawGroundPools(g);
        if (th.water) this.drawPromenade(g);
        this.drawClutter(g, false);
        this.drawBrackets(g);
        // статичные вывески (мигающие рисуются в кадре поверх своей тёмной версии)
        const dynSet = new Set(this.dyn);
        this.signs.forEach((s) => this.drawSign(g, s, dynSet.has(s) ? false : s.isLit, false));
        this.drawFigures(g, false);
        this.drawHaze(g);
        this.drawVignette(g);
    }

    drawSky(g) {
        const th = this.theme, W = this.W, H = this.H;
        const gr = g.createLinearGradient(0, 0, 0, this.hy);
        gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.6, th.sky[1]); gr.addColorStop(1, th.sky[2]);
        g.fillStyle = gr; g.fillRect(0, 0, W, this.hy + 1);
        // засветка над кварталом
        const rg = g.createRadialGradient(this.cx, this.hy, 0, this.cx, this.hy, H * 0.55);
        rg.addColorStop(0, rgba(th.fogColor, 0.95)); rg.addColorStop(0.35, rgba(th.fogColor, 0.5)); rg.addColorStop(1, rgba(th.fogColor, 0));
        g.fillStyle = rg; g.fillRect(0, 0, W, H);
        // звёзды и луна
        this.deco.stars.forEach((s) => { g.fillStyle = 'rgba(255,255,255,' + s.a + ')'; g.beginPath(); g.arc(s.x * W, s.y * this.hy * 0.8, s.r, 0, 6.28); g.fill(); });
        if (th.moon) {
            const mx = W * 0.74, my = this.hy * 0.2, r = 13;
            const mg = g.createRadialGradient(mx, my, r * 0.8, mx, my, r * 7);
            mg.addColorStop(0, 'rgba(255,245,220,0.4)'); mg.addColorStop(0.3, 'rgba(255,245,220,0.12)'); mg.addColorStop(1, 'rgba(255,245,220,0)');
            g.fillStyle = mg; g.fillRect(mx - r * 7, my - r * 7, r * 14, r * 14);
            const md = g.createRadialGradient(mx - r * 0.3, my - r * 0.3, 0, mx, my, r);
            md.addColorStop(0, '#fffaf0'); md.addColorStop(1, '#f0e4c0');
            g.fillStyle = md; g.beginPath(); g.arc(mx, my, r, 0, 6.28); g.fill();
            g.fillStyle = 'rgba(150,140,120,0.25)';
            [[0.3, -0.2, 0.22], [-0.25, 0.25, 0.16], [0.1, 0.4, 0.1]].forEach((m) => { g.beginPath(); g.arc(mx + m[0] * r, my + m[1] * r, m[2] * r, 0, 6.28); g.fill(); });
        }
        // скайлайн далеко за кварталом
        const base = this.hy + 2;
        this.deco.skyline.forEach((t) => {
            const x = t.x * W, w = t.w * W, h = t.h * H;
            g.fillStyle = rgba(mix(th.fogColor, '#000000', 0.45), 0.9);
            g.fillRect(x, base - h, w, h);
            const rnd = mulberry32(Math.floor(t.seed * 1e9));
            for (let yy = base - h + 4; yy < base - 4; yy += 5) for (let xx = x + 2; xx < x + w - 2; xx += 4) {
                if (rnd() < 0.3) { g.fillStyle = rgba(['#ffe0a0', '#a0d8ff', '#ffffff'][Math.floor(rnd() * 3)], 0.25 + rnd() * 0.4); g.fillRect(xx, yy, 1.6, 2); }
            }
        });
    }

    // дальние безымянные огни на стенах у точки схода — плотность без слов
    drawFarLights(g, mir) {
        const th = this.theme, W2 = th.streetW / 2;
        g.save();
        this.deco.far.forEach((o) => {
            const x = o.side * W2;
            const a = this.vis(o.z) * o.a;
            if (a <= 0.03) return;
            g.globalAlpha = a;
            if (o.frontal) {
                const [sx, sy] = this.P(x - o.side * (0.15 + o.w), o.y + o.h, o.z, mir), [ex, ey] = this.P(x - o.side * 0.15, o.y, o.z, mir);
                const px = Math.min(sx, ex), py = Math.min(sy, ey), pw = Math.abs(ex - sx), ph = Math.abs(ey - sy);
                if (pw < 0.8) return;
                g.shadowColor = o.color; g.shadowBlur = Math.max(2, pw * 0.8);
                g.fillStyle = rgba(mix(o.color, '#ffffff', 0.25), 0.95);
                g.fillRect(px, py, pw, ph);
            } else {
                const p = [this.P(x, o.y, o.z, mir), this.P(x, o.y, o.z + o.w * 2, mir), this.P(x, o.y + o.h, o.z + o.w * 2, mir), this.P(x, o.y + o.h, o.z, mir)];
                g.shadowColor = o.color; g.shadowBlur = 3;
                g.fillStyle = rgba(o.color, 0.9);
                g.beginPath(); g.moveTo(p[0][0], p[0][1]); p.slice(1).forEach((q) => g.lineTo(q[0], q[1])); g.closePath(); g.fill();
            }
        });
        g.restore();
    }

    // кронштейны: вывески держатся за стену, фонари — за навес
    drawBrackets(g) {
        const th = this.theme, W2 = th.streetW / 2;
        g.save();
        this.signs.forEach((s) => {
            if (s.facade) return;
            const wallX = s.side * W2, edgeX = s.side > 0 ? s.xb : s.xa, midX = (s.xa + s.xb) / 2;
            const vis = this.vis(s.z);
            if (vis <= 0.05) return;
            g.globalAlpha = vis;
            g.strokeStyle = 'rgba(8,8,12,0.95)'; g.lineWidth = Math.max(0.8, this.f * 0.05 / s.z);
            if (s.kind === 'lantern') {
                const a = this.P(midX, th.awningY - 0.1, s.z), b = this.P(midX, s.y1, s.z);
                g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
            } else {
                [s.y1 - 0.05, s.y0 + 0.08].forEach((yy) => {
                    const a = this.P(wallX, yy, s.z), b = this.P(edgeX, yy, s.z);
                    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
                });
                const c = this.P(wallX, s.y1 + 0.4, s.z), d = this.P(edgeX, s.y1 - 0.05, s.z);
                g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.stroke();
            }
        });
        g.restore();
    }

    // прохожие: тёмные силуэты с кромкой света, под дождём — с зонтами
    drawFigures(g, mir) {
        const th = this.theme;
        g.save();
        this.deco.figures.slice().sort((a, b) => b.z - a.z).forEach((fg) => {
            const vis = this.vis(fg.z);
            if (vis <= 0.05) return;
            g.globalAlpha = vis * (mir ? 0.6 : 1);
            const s = this.f / fg.z; // px на метр
            const [bx, by] = this.P(fg.x, 0, fg.z, mir);
            const dir = mir ? -1 : 1;
            const h = fg.h * s, w = h * 0.34;
            g.fillStyle = '#07070c';
            // тело
            g.beginPath(); g.ellipse(bx, by - dir * h * 0.5, w / 2, h * 0.38, 0, 0, 6.28); g.fill();
            g.fillRect(bx - w * 0.32, by - dir * h * 0.42 - (mir ? 0 : 0), w * 0.64, dir * h * 0.42);
            // голова
            g.beginPath(); g.arc(bx, by - dir * h * 0.88, h * 0.075, 0, 6.28); g.fill();
            // кромка света
            g.fillStyle = 'rgba(255,230,200,0.22)';
            g.fillRect(bx + fg.dir * w * 0.3, by - dir * h * 0.8, Math.max(1, w * 0.08), dir * h * 0.6);
            if (fg.umb) {
                const uy = by - dir * h * 1.05, ur = h * 0.38;
                g.fillStyle = fg.umbC;
                g.beginPath(); g.ellipse(bx, uy, ur, ur * 0.35, 0, mir ? 0 : Math.PI, mir ? Math.PI : 0); g.fill();
                g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
                g.beginPath(); g.ellipse(bx, uy, ur, ur * 0.35, 0, mir ? 0 : Math.PI, mir ? Math.PI : 0); g.stroke();
                g.beginPath(); g.moveTo(bx, uy); g.lineTo(bx, by - dir * h * 0.55); g.stroke();
            }
        });
        g.restore();
    }

    // хлам у стен: ящики, табуреты, урны, автоматы с напитками
    drawClutter(g, mir) {
        const th = this.theme, W2 = th.streetW / 2;
        const quad = (p) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); };
        g.save();
        this.deco.clutter.slice().sort((a, b) => b.z - a.z).forEach((c) => {
            const vis = this.vis(c.z);
            if (vis <= 0.05) return;
            g.globalAlpha = vis;
            const x = c.side * W2;
            if (c.kind === 'vending') {
                const d = 0.75, wv = 1.0, hv = 1.85;
                const f = [this.P(x - c.side * d, 0, c.z, mir), this.P(x - c.side * d, 0, c.z + wv, mir), this.P(x - c.side * d, hv, c.z + wv, mir), this.P(x - c.side * d, hv, c.z, mir)];
                g.shadowColor = c.color; g.shadowBlur = this.f * 0.5 / c.z;
                g.fillStyle = rgba(c.color, 0.95); quad(f); g.fill();
                g.shadowBlur = 0;
                g.fillStyle = 'rgba(20,30,50,0.85)';
                const s = [this.P(x - c.side * d, 0.9, c.z + 0.1, mir), this.P(x - c.side * d, 0.9, c.z + wv - 0.1, mir), this.P(x - c.side * d, 1.65, c.z + wv - 0.1, mir), this.P(x - c.side * d, 1.65, c.z + 0.1, mir)];
                quad(s); g.fill();
                g.fillStyle = 'rgba(255,255,255,0.7)';
                for (let k = 0; k < 4; k++) { const zz = c.z + 0.15 + k * 0.2; const r = [this.P(x - c.side * d, 1.2, zz, mir), this.P(x - c.side * d, 1.2, zz + 0.12, mir), this.P(x - c.side * d, 1.5, zz + 0.12, mir), this.P(x - c.side * d, 1.5, zz, mir)]; quad(r); g.fill(); }
                const sd = [this.P(x, 0, c.z, mir), this.P(x - c.side * d, 0, c.z, mir), this.P(x - c.side * d, hv, c.z, mir), this.P(x, hv, c.z, mir)];
                g.fillStyle = mix(c.color, '#000000', 0.6); quad(sd); g.fill();
                // пятно света на земле
                g.save(); g.globalCompositeOperation = 'lighter';
                const [px, py] = this.P(x - c.side * (d + 0.4), 0, c.z + wv / 2, mir);
                const r = this.f * 1.2 / c.z;
                const gr = g.createRadialGradient(px, py, 0, px, py, r);
                gr.addColorStop(0, rgba(c.color, 0.35 * vis)); gr.addColorStop(1, rgba(c.color, 0));
                g.fillStyle = gr; g.save(); g.translate(px, py); g.scale(1, 0.35); g.beginPath(); g.arc(0, 0, r, 0, 6.28); g.fill(); g.restore();
                g.restore();
            } else if (c.kind === 'crate') {
                for (let k = 0; k < c.stack; k++) {
                    const y0 = k * 0.32, d = 0.45;
                    const f = [this.P(x - c.side * d, y0, c.z, mir), this.P(x - c.side * d, y0, c.z + 0.5, mir), this.P(x - c.side * d, y0 + 0.3, c.z + 0.5, mir), this.P(x - c.side * d, y0 + 0.3, c.z, mir)];
                    g.fillStyle = mix(c.color, '#000000', 0.35); quad(f); g.fill();
                    const sd = [this.P(x, y0, c.z, mir), this.P(x - c.side * d, y0, c.z, mir), this.P(x - c.side * d, y0 + 0.3, c.z, mir), this.P(x, y0 + 0.3, c.z, mir)];
                    g.fillStyle = mix(c.color, '#000000', 0.55); quad(sd); g.fill();
                }
            } else if (c.kind === 'stool') {
                const d = 0.6;
                const t = [this.P(x - c.side * d, 0.45, c.z, mir), this.P(x - c.side * d, 0.45, c.z + 0.35, mir), this.P(x - c.side * (d + 0.35), 0.45, c.z + 0.35, mir), this.P(x - c.side * (d + 0.35), 0.45, c.z, mir)];
                g.fillStyle = '#3a2a1e'; quad(t); g.fill();
                g.strokeStyle = '#1a120c'; g.lineWidth = Math.max(0.6, this.f * 0.03 / c.z);
                [[c.z, d], [c.z + 0.35, d], [c.z, d + 0.35], [c.z + 0.35, d + 0.35]].forEach((l) => { const a = this.P(x - c.side * l[1], 0.45, l[0], mir), b = this.P(x - c.side * l[1], 0, l[0], mir); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
            } else {
                const d = 0.5;
                const f = [this.P(x - c.side * d, 0, c.z, mir), this.P(x - c.side * d, 0, c.z + 0.45, mir), this.P(x - c.side * d, 0.9, c.z + 0.45, mir), this.P(x - c.side * d, 0.9, c.z, mir)];
                g.fillStyle = '#1c1c22'; quad(f); g.fill();
                const sd = [this.P(x, 0, c.z, mir), this.P(x - c.side * d, 0, c.z, mir), this.P(x - c.side * d, 0.9, c.z, mir), this.P(x, 0.9, c.z, mir)];
                g.fillStyle = '#121216'; quad(sd); g.fill();
            }
        });
        g.restore();
    }

    drawGround(g) {
        const th = this.theme, W = this.W, H = this.H;
        const gr = g.createLinearGradient(0, this.hy, 0, H);
        gr.addColorStop(0, th.ground[1]); gr.addColorStop(0.25, th.ground[0]); gr.addColorStop(1, th.ground[0]);
        g.fillStyle = gr; g.fillRect(0, this.hy, W, H - this.hy);
        if (!th.water) {
            // мокрый асфальт: светлая полоса у стен и тёмная середина
            const W2 = th.streetW / 2;
            [-1, 1].forEach((side) => {
                const a = this.P(side * W2, 0, th.zNear * 0.4), b = this.P(side * W2, 0, th.zGate), c = this.P(side * (W2 - 0.9), 0, th.zGate), d = this.P(side * (W2 - 0.9), 0, th.zNear * 0.4);
                g.fillStyle = 'rgba(255,255,255,0.025)';
                g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
            });
            // бордюр
            [-1, 1].forEach((side) => {
                const a = this.P(side * (W2 - 0.5), 0.12, th.zNear * 0.4), b = this.P(side * (W2 - 0.5), 0.12, th.zGate);
                g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
            });
        }
    }

    // стена: здания, окна, витрины, навес, кондиционеры, световые пятна от вывесок
    drawWall(g, side, mir) {
        const th = this.theme, x = side * th.streetW / 2, b = th.bld;
        const list = this.buildings[side];
        const quad = (p) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); };
        list.forEach((bd) => {
            const vis = this.vis(bd.z0);
            if (vis <= 0.02) return;
            g.globalAlpha = vis;
            const rnd = mulberry32(Math.floor(bd.seed * 1e9));
            const p = [this.P(x, 0, bd.z0, mir), this.P(x, 0, bd.z1, mir), this.P(x, bd.H, bd.z1, mir), this.P(x, bd.H, bd.z0, mir)];
            const gr = g.createLinearGradient(0, p[3][1], 0, p[0][1]);
            gr.addColorStop(0, mix(bd.color, '#000000', 0.35)); gr.addColorStop(0.55, bd.color); gr.addColorStop(1, mix(bd.color, '#000000', 0.2));
            g.fillStyle = gr; quad(p); g.fill();
            // горизонтальные швы этажей
            g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
            for (let fl = 1; fl < bd.floors; fl++) {
                const a = this.P(x, fl * b.floorH, bd.z0, mir), c = this.P(x, fl * b.floorH, bd.z1, mir);
                g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
            }
            // окна
            const cols = Math.max(1, Math.round((bd.z1 - bd.z0) / 1.7));
            for (let fl = 1; fl < bd.floors; fl++) {
                for (let ci = 0; ci < cols; ci++) {
                    const z0 = bd.z0 + (bd.z1 - bd.z0) * (ci + 0.22) / cols, z1 = bd.z0 + (bd.z1 - bd.z0) * (ci + 0.78) / cols;
                    const y0 = fl * b.floorH + 0.9, y1 = fl * b.floorH + 2.2;
                    const lit = rnd() < b.winLit;
                    const wc = b.winColors[Math.floor(rnd() * b.winColors.length)];
                    const q = [this.P(x, y0, z0, mir), this.P(x, y0, z1, mir), this.P(x, y1, z1, mir), this.P(x, y1, z0, mir)];
                    g.fillStyle = lit ? rgba(wc, 0.28 + rnd() * 0.3) : 'rgba(0,0,0,0.38)';
                    quad(q); g.fill();
                    if (lit && rnd() < 0.5) { // штора/переплёт
                        g.fillStyle = 'rgba(0,0,0,0.3)';
                        const zm = (z0 + z1) / 2;
                        const q2 = [this.P(x, y0, zm - 0.03, mir), this.P(x, y0, zm + 0.03, mir), this.P(x, y1, zm + 0.03, mir), this.P(x, y1, zm - 0.03, mir)];
                        quad(q2); g.fill();
                    }
                }
            }
            // ярусные панели на фасаде (Синдзюку/Дотомбори): полосы без слов, тёмные и слабо подсвеченные
            if (th.id !== 'yokocho' && bd.z0 < th.zSlotFar * 1.3) {
                for (let fl = 1; fl < bd.floors; fl++) {
                    if (rnd() < 0.45) continue;
                    const y0 = fl * b.floorH + 0.15, y1 = y0 + 0.55;
                    const z0 = bd.z0 + 0.3, z1 = bd.z1 - 0.3;
                    const col = b.winColors[Math.floor(rnd() * b.winColors.length)];
                    const lit = rnd() < 0.5;
                    const q = [this.P(x, y0, z0, mir), this.P(x, y0, z1, mir), this.P(x, y1, z1, mir), this.P(x, y1, z0, mir)];
                    g.fillStyle = lit ? rgba(col, 0.22) : 'rgba(0,0,0,0.3)';
                    quad(q); g.fill();
                    g.strokeStyle = lit ? rgba(col, 0.35) : 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.stroke();
                }
            }
            // деревянные доски и стойки (ёкотё)
            if (th.id === 'yokocho') {
                g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1;
                for (let yy = 0.3; yy < bd.H; yy += 0.3) {
                    const a = this.P(x, yy, bd.z0, mir), c = this.P(x, yy, bd.z1, mir);
                    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
                }
                g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, this.f * 0.08 / bd.z0);
                const pa = this.P(x, 0, bd.z0, mir), pb = this.P(x, bd.H, bd.z0, mir);
                g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
            }
            // неоновая рамка на крыше (Синдзюку/Дотомбори)
            if (th.id !== 'yokocho' && bd.z0 < th.zSlotFar && rnd() < 0.6) {
                const col = Object.values(th.palette)[Math.floor(rnd() * 6)];
                const y0 = bd.H - 2.2, y1 = bd.H - 0.4, z0 = bd.z0 + 0.5, z1 = bd.z1 - 0.5;
                if (z1 - z0 > 1.5) {
                    const q = [this.P(x - side * 0.1, y0, z0, mir), this.P(x - side * 0.1, y0, z1, mir), this.P(x - side * 0.1, y1, z1, mir), this.P(x - side * 0.1, y1, z0, mir)];
                    g.save(); g.shadowColor = col; g.shadowBlur = this.f * 0.4 / bd.z0;
                    g.strokeStyle = rgba(col, 0.75); g.lineWidth = Math.max(1, this.f * 0.07 / bd.z0);
                    quad(q); g.stroke(); g.stroke();
                    g.restore();
                    g.fillStyle = rgba(col, 0.08); quad(q); g.fill();
                }
            }
            // витрина первого этажа
            if (bd.shop) {
                const zs0 = Math.max(bd.z0 + 0.25, th.zNear * 0.7), zs1 = bd.z1 - 0.25;
                if (zs1 - zs0 < 0.6) { /* слишком близко — только навес */ } else {
                const q = [this.P(x, 0.2, zs0, mir), this.P(x, 0.2, zs1, mir), this.P(x, th.awningY - 0.5, zs1, mir), this.P(x, th.awningY - 0.5, zs0, mir)];
                const gl = g.createLinearGradient(0, q[3][1], 0, q[0][1]);
                gl.addColorStop(0, rgba(bd.shopColor, bd.shutter ? 0.1 : 0.34)); gl.addColorStop(0.7, rgba(bd.shopColor, bd.shutter ? 0.04 : 0.12)); gl.addColorStop(1, 'rgba(0,0,0,0.25)');
                g.fillStyle = gl; quad(q); g.fill();
                if (bd.shutter) {
                    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
                    for (let yy = 0.4; yy < th.awningY - 0.5; yy += 0.22) { const a = this.P(x, yy, zs0, mir), c = this.P(x, yy, zs1, mir); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke(); }
                } else {
                    // силуэты внутри: полки/люди — тёмные столбики
                    g.fillStyle = 'rgba(0,0,0,0.35)';
                    const n = 2 + Math.floor(rnd() * 3);
                    for (let i = 0; i < n; i++) {
                        const zz = zs0 + 0.15 + rnd() * (zs1 - zs0 - 0.5), ww = 0.15 + rnd() * 0.25, hh = 0.8 + rnd() * 1.1;
                        const s = [this.P(x, 0.2, zz, mir), this.P(x, 0.2, zz + ww, mir), this.P(x, 0.2 + hh, zz + ww, mir), this.P(x, 0.2 + hh, zz, mir)];
                        quad(s); g.fill();
                    }
                    if (th.id !== 'yokocho') {
                        const iq = [this.P(x, 0.5, zs0 + 0.2, mir), this.P(x, 0.5, zs1 - 0.2, mir), this.P(x, th.awningY - 0.9, zs1 - 0.2, mir), this.P(x, th.awningY - 0.9, zs0 + 0.2, mir)];
                        g.fillStyle = rgba(mix(bd.shopColor, '#ffffff', 0.5), 0.35); quad(iq); g.fill();
                        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
                        for (let yy = 0.9; yy < th.awningY - 1.0; yy += 0.45) { const a = this.P(x, yy, zs0 + 0.3, mir), c = this.P(x, yy, zs1 - 0.3, mir); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke(); }
                        g.fillStyle = '#fff8e0';
                        for (let zz = zs0 + 0.6; zz < zs1 - 0.4; zz += 1.2) { const [lx, ly] = this.P(x, th.awningY - 0.75, zz, mir); g.beginPath(); g.arc(lx, ly, Math.max(1, this.f * 0.05 / zz), 0, 6.28); g.fill(); }
                    }
                    // переплёт витрины
                    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = Math.max(0.8, this.f * 0.05 / bd.z0);
                    for (let zz = zs0; zz < zs1; zz += th.id === 'yokocho' ? 0.45 : 1.1) {
                        const a = this.P(x, 0.2, zz, mir), c = this.P(x, th.awningY - 0.5, zz, mir);
                        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
                    }
                    if (th.id === 'yokocho') {
                        // стойка и меню на стене
                        const cq = [this.P(x, 0.85, zs0, mir), this.P(x, 0.85, zs1, mir), this.P(x - side * 0.5, 0.95, zs1, mir), this.P(x - side * 0.5, 0.95, zs0, mir)];
                        g.fillStyle = '#5a3d26'; quad(cq); g.fill();
                        const cf = [this.P(x - side * 0.5, 0.95, zs0, mir), this.P(x - side * 0.5, 0.95, zs1, mir), this.P(x - side * 0.5, 0.0, zs1, mir), this.P(x - side * 0.5, 0.0, zs0, mir)];
                        g.fillStyle = '#2a1c12'; quad(cf); g.fill();
                        const nm = 2 + Math.floor(rnd() * 4);
                        for (let i = 0; i < nm; i++) {
                            const zz = zs0 + 0.1 + rnd() * (zs1 - zs0 - 0.4), y0 = 1.75 + rnd() * 0.4;
                            const mq = [this.P(x, y0, zz, mir), this.P(x, y0, zz + 0.18, mir), this.P(x, y0 + 0.5, zz + 0.18, mir), this.P(x, y0 + 0.5, zz, mir)];
                            g.fillStyle = rnd() < 0.5 ? '#f1e6cc' : '#e0c080'; quad(mq); g.fill();
                            g.fillStyle = 'rgba(0,0,0,0.5)';
                            for (let k = 0; k < 3; k++) { const lq = [this.P(x, y0 + 0.08 + k * 0.13, zz + 0.05, mir), this.P(x, y0 + 0.08 + k * 0.13, zz + 0.13, mir), this.P(x, y0 + 0.11 + k * 0.13, zz + 0.13, mir), this.P(x, y0 + 0.11 + k * 0.13, zz + 0.05, mir)]; quad(lq); g.fill(); }
                        }
                    }
                }
                // гирлянда лампочек под навесом
                if (th.id === 'yokocho' || th.id === 'dotonbori') {
                    g.save(); g.globalCompositeOperation = 'lighter';
                    for (let zz = bd.z0 + 0.3; zz < bd.z1 - 0.2; zz += 0.5) {
                        const [lx, ly] = this.P(x - side * (th.awningD - 0.1), th.awningY - 0.22, zz, mir);
                        const r = Math.max(0.8, this.f * 0.05 / zz);
                        const gr = g.createRadialGradient(lx, ly, 0, lx, ly, r * 5);
                        gr.addColorStop(0, 'rgba(255,220,150,0.8)'); gr.addColorStop(0.2, 'rgba(255,200,120,0.3)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
                        g.fillStyle = gr; g.fillRect(lx - r * 5, ly - r * 5, r * 10, r * 10);
                    }
                    g.restore();
                }
                // дверь
                const dz = bd.z1 - 1.1;
                const dq = [this.P(x, 0, dz, mir), this.P(x, 0, dz + 0.8, mir), this.P(x, 2.1, dz + 0.8, mir), this.P(x, 2.1, dz, mir)];
                g.fillStyle = 'rgba(0,0,0,0.5)'; quad(dq); g.fill();
                }
            }
            // навес над первым этажом (видим снизу)
            if (th.awningY) {
                const d = th.awningD;
                const aq = [this.P(x, th.awningY, bd.z0, mir), this.P(x, th.awningY, bd.z1, mir), this.P(x - side * d, th.awningY - 0.12, bd.z1, mir), this.P(x - side * d, th.awningY - 0.12, bd.z0, mir)];
                g.fillStyle = mix(bd.color, '#000000', 0.45); quad(aq); g.fill();
                const eq = [this.P(x - side * d, th.awningY - 0.12, bd.z0, mir), this.P(x - side * d, th.awningY - 0.12, bd.z1, mir), this.P(x - side * d, th.awningY + 0.1, bd.z1, mir), this.P(x - side * d, th.awningY + 0.1, bd.z0, mir)];
                g.fillStyle = mix(bd.color, '#ffffff', 0.08); quad(eq); g.fill();
                if (bd.shop && !bd.shutter) { // световая кромка навеса
                    const col = th.id === 'yokocho' ? '#ffd080' : bd.shopColor;
                    const a = this.P(x - side * d, th.awningY - 0.1, Math.max(bd.z0, th.zNear * 0.6), mir), c = this.P(x - side * d, th.awningY - 0.1, bd.z1, mir);
                    g.save(); g.shadowColor = col; g.shadowBlur = this.f * 0.35 / bd.z0;
                    g.strokeStyle = rgba(col, 0.85); g.lineWidth = Math.max(1, this.f * 0.05 / bd.z0);
                    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke(); g.stroke();
                    g.restore();
                }
            }
            // крыша-карниз (ёкотё)
            if (th.id === 'yokocho') {
                const rq = [this.P(x, bd.H, bd.z0, mir), this.P(x, bd.H, bd.z1, mir), this.P(x - side * 0.5, bd.H + 0.25, bd.z1, mir), this.P(x - side * 0.5, bd.H + 0.25, bd.z0, mir)];
                g.fillStyle = '#0d0a08'; quad(rq); g.fill();
                g.strokeStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(rq[3][0], rq[3][1]); g.lineTo(rq[2][0], rq[2][1]); g.stroke();
            }
            // труба по краю здания
            {
                const a = this.P(x - side * 0.06, 0, bd.z0, mir), c = this.P(x - side * 0.06, bd.H, bd.z0, mir);
                g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = Math.max(1, this.f * 0.06 / bd.z0);
                g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
            }
            // кондиционеры
            if (th.ac && bd.z0 < th.zSlotFar) {
                const n = 1 + Math.floor(rnd() * 3);
                for (let i = 0; i < n; i++) {
                    const fl = 1 + Math.floor(rnd() * Math.max(1, bd.floors - 1));
                    const zz = bd.z0 + 0.3 + rnd() * (bd.z1 - bd.z0 - 1.2), yy = fl * b.floorH + 0.1;
                    const dd = 0.35;
                    const fq = [this.P(x - side * dd, yy, zz, mir), this.P(x - side * dd, yy, zz + 0.8, mir), this.P(x - side * dd, yy + 0.6, zz + 0.8, mir), this.P(x - side * dd, yy + 0.6, zz, mir)];
                    g.fillStyle = '#2a2a30'; quad(fq); g.fill();
                    const sq = [this.P(x, yy, zz, mir), this.P(x - side * dd, yy, zz, mir), this.P(x - side * dd, yy + 0.6, zz, mir), this.P(x, yy + 0.6, zz, mir)];
                    g.fillStyle = '#1a1a20'; quad(sq); g.fill();
                    // фронтальная решётка
                    const gq = [this.P(x - side * dd, yy + 0.05, zz + 0.05, mir), this.P(x - side * dd, yy + 0.05, zz + 0.75, mir), this.P(x - side * dd, yy + 0.4, zz + 0.75, mir), this.P(x - side * dd, yy + 0.4, zz + 0.05, mir)];
                    g.fillStyle = '#111116'; quad(gq); g.fill();
                }
            }
        });
        g.globalAlpha = 1;
        // свет вывесок ложится на стену
        const Hmax = b.floorsMax * b.floorH + 2;
        const cp = [this.P(x, 0, th.zNear * 0.4, mir), this.P(x, 0, th.zGate + 3, mir), this.P(x, Hmax, th.zGate + 3, mir), this.P(x, Hmax, th.zNear * 0.4, mir)];
        g.save(); quad(cp); g.clip();
        g.globalCompositeOperation = 'lighter';
        this.signs.forEach((s) => {
            if (s.side !== side || !s.isLit) return;
            const zz = s.facade ? (s.z0 + s.z1) / 2 : s.z;
            const ym = (s.y0 + s.y1) / 2;
            const [px, py] = this.P(x, ym, zz, mir);
            const r = Math.min(this.W * 0.4, this.f * (s.facade ? (s.z1 - s.z0) * 0.9 + 1.5 : 2.8) / zz);
            const gr = g.createRadialGradient(px, py, 0, px, py, r);
            const col = s.kind === 'lantern' ? '#ff9a40' : (s.kind === 'noren' ? '#ffc080' : s.color);
            const k = (s.kind === 'lantern' || s.deco) ? 0.55 : 1;
            gr.addColorStop(0, rgba(col, 0.42 * k * s.inten * this.vis(zz))); gr.addColorStop(0.4, rgba(col, 0.14 * k * s.inten * this.vis(zz))); gr.addColorStop(1, rgba(col, 0));
            g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
        });
        g.restore();
        // лампы над дверями с норэнами
        this.signs.forEach((s) => {
            if (s.side !== side || s.kind !== 'noren') return;
            const [px, py] = this.P(x - side * 0.15, s.y1 + 0.25, (s.z0 + s.z1) / 2, mir);
            const r = this.f * 0.07 / s.z0;
            g.fillStyle = s.isLit ? '#ffe6b0' : '#3a3024';
            g.beginPath(); g.arc(px, py, Math.max(1, r), 0, 6.28); g.fill();
        });
    }

    drawGroundPools(g) {
        const th = this.theme;
        g.save(); g.globalCompositeOperation = 'lighter';
        this.signs.forEach((s) => {
            if (!s.isLit) return;
            const zz = s.facade ? (s.z0 + s.z1) / 2 : s.z;
            const xm = s.facade ? s.side * (th.streetW / 2 - 0.7) : (s.xa + s.xb) / 2;
            const [px, py] = this.P(xm, 0, zz);
            const rx = this.f * 2.4 / zz, ry = rx * 0.32;
            if (rx < 3) return;
            const col = s.kind === 'lantern' ? '#ff9a40' : (s.kind === 'noren' ? '#ffc080' : s.color);
            const gr = g.createRadialGradient(px, py, 0, px, py, rx);
            gr.addColorStop(0, rgba(col, (s.kind === 'lantern' ? 0.12 : 0.22) * s.inten * this.vis(zz))); gr.addColorStop(1, rgba(col, 0));
            g.fillStyle = gr;
            g.save(); g.translate(px, py); g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, 6.28); g.fill(); g.restore();
        });
        g.restore();
    }

    // набережная Дотомбори: дорожки вдоль воды и перила
    drawPromenade(g) {
        const th = this.theme, W2 = th.streetW / 2, pw = th.promenade;
        [-1, 1].forEach((side) => {
            const x0 = side * W2, x1 = side * (W2 - pw);
            const p = [this.P(x0, 0, th.zNear * 0.4), this.P(x0, 0, th.zGate), this.P(x1, 0, th.zGate), this.P(x1, 0, th.zNear * 0.4)];
            g.fillStyle = '#151a26';
            g.beginPath(); g.moveTo(p[0][0], p[0][1]); p.slice(1).forEach((q) => g.lineTo(q[0], q[1])); g.closePath(); g.fill();
            const e = [this.P(x1, 0, th.zNear * 0.4), this.P(x1, 0, th.zGate), this.P(x1, -0.5, th.zGate), this.P(x1, -0.5, th.zNear * 0.4)];
            g.fillStyle = '#0b0f18';
            g.beginPath(); g.moveTo(e[0][0], e[0][1]); e.slice(1).forEach((q) => g.lineTo(q[0], q[1])); g.closePath(); g.fill();
            // перила
            g.strokeStyle = 'rgba(200,210,230,0.35)';
            const a = this.P(x1 + side * 0.1, 1.0, th.zNear * 0.4), b = this.P(x1 + side * 0.1, 1.0, th.zGate);
            g.lineWidth = 1.2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
            for (let z = th.zNear * 0.5; z < th.zGate; z *= 1.09) {
                const c = this.P(x1 + side * 0.1, 0, z), d = this.P(x1 + side * 0.1, 1.0, z);
                g.lineWidth = Math.max(0.6, this.f * 0.04 / z); g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.stroke();
            }
            // фонари набережной
            for (let z = th.zNear * 0.8; z < th.zSlotFar; z *= 1.45) {
                const [lx, ly] = this.P(x1 + side * 0.35, 3.2, z);
                const r = this.f * 0.16 / z;
                g.save(); g.globalCompositeOperation = 'lighter';
                const gr = g.createRadialGradient(lx, ly, 0, lx, ly, r * 7);
                gr.addColorStop(0, 'rgba(255,230,180,0.6)'); gr.addColorStop(0.1, 'rgba(255,230,180,0.25)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
                g.fillStyle = gr; g.fillRect(lx - r * 7, ly - r * 7, r * 14, r * 14);
                g.restore();
                g.fillStyle = '#fff3d0'; g.beginPath(); g.arc(lx, ly, Math.max(1, r), 0, 6.28); g.fill();
                const [bx, by] = this.P(x1 + side * 0.35, 0, z);
                g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = Math.max(0.6, this.f * 0.05 / z); g.beginPath(); g.moveTo(bx, by); g.lineTo(lx, ly + r); g.stroke();
            }
        });
    }

    // конец переулка: светящийся проём в следующий квартал
    drawGate(g, mir) {
        const th = this.theme, W2 = th.streetW / 2, z = th.zGate;
        const col = this.nextColor || '#7c8cf8';
        const [gx, gy] = this.P(0, 1.6, z, mir);
        const r = this.f * W2 * 1.6 / z;
        g.save(); g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r * 2.2);
        gr.addColorStop(0, rgba(col, 0.9)); gr.addColorStop(0.25, rgba(col, 0.45)); gr.addColorStop(1, rgba(col, 0));
        g.fillStyle = gr; g.fillRect(gx - r * 2.2, gy - r * 2.2, r * 4.4, r * 4.4);
        g.restore();
        // проём
        const p = [this.P(-W2 * 0.75, 0, z, mir), this.P(W2 * 0.75, 0, z, mir), this.P(W2 * 0.75, 4.2, z, mir), this.P(-W2 * 0.75, 4.2, z, mir)];
        const lg = g.createLinearGradient(0, p[2][1], 0, p[0][1]);
        lg.addColorStop(0, rgba(col, 0.85)); lg.addColorStop(1, '#ffffff');
        g.fillStyle = lg; g.beginPath(); g.moveTo(p[0][0], p[0][1]); p.slice(1).forEach((q) => g.lineTo(q[0], q[1])); g.closePath(); g.fill();
        if (th.water) { // далёкий мост с гирляндой
            const b = [this.P(-W2, 2.2, z * 0.92, mir), this.P(W2, 2.2, z * 0.92, mir), this.P(W2, 3.4, z * 0.92, mir), this.P(-W2, 3.4, z * 0.92, mir)];
            g.fillStyle = '#0a0c16'; g.beginPath(); g.moveTo(b[0][0], b[0][1]); b.slice(1).forEach((q) => g.lineTo(q[0], q[1])); g.closePath(); g.fill();
            g.fillStyle = '#ffe9b0';
            for (let x = -W2 + 0.4; x < W2; x += 0.6) { const [lx, ly] = this.P(x, 3.6, z * 0.92, mir); g.beginPath(); g.arc(lx, ly, 1, 0, 6.28); g.fill(); }
        }
    }

    drawWires(g) {
        const th = this.theme, W2 = th.streetW / 2;
        if (!th.wiresAcross) return;
        g.strokeStyle = 'rgba(0,0,0,0.85)';
        for (let i = 0; i < th.wiresAcross; i++) {
            const z = th.zNear * (0.9 + i * 1.1) * (1 + i * 0.5);
            const y = th.wireY + (i % 2) * 0.9, sag = 0.5 + (i % 3) * 0.2;
            g.lineWidth = Math.max(0.5, this.f * 0.035 / z);
            g.globalAlpha = this.vis(z);
            g.beginPath();
            for (let k = 0; k <= 16; k++) {
                const x = -W2 + (2 * W2) * k / 16;
                const yy = y - sag * (1 - Math.pow(x / W2, 2));
                const [px, py] = this.P(x, yy, z);
                if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
            }
            g.stroke();
            if (i % 2 === 0) { // второй провод чуть ниже
                g.beginPath();
                for (let k = 0; k <= 16; k++) {
                    const x = -W2 + (2 * W2) * k / 16;
                    const yy = y - 0.25 - (sag + 0.15) * (1 - Math.pow(x / W2, 2));
                    const [px, py] = this.P(x, yy, z);
                    if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
                }
                g.stroke();
            }
        }
        // провода вдоль улицы — уходят в точку схода
        g.globalAlpha = 0.7;
        [-1, 1].forEach((side) => {
            for (let i = 0; i < 2; i++) {
                const a = this.P(side * (W2 - 0.2 - i * 0.15), th.wireY - 0.3 + i * 0.35, th.zNear * 0.5), b = this.P(side * (W2 - 0.2 - i * 0.15), th.wireY - 0.3 + i * 0.35, th.zGate);
                g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
            }
        });
        g.globalAlpha = 1;
    }

    postReflection(r) {
        const th = this.theme, W = this.W, H = this.H;
        r.setTransform(DPR, 0, 0, DPR, 0, 0);
        // смаз по вертикали — мокрая поверхность
        [[1, 0.5], [2.2, 0.35], [3.8, 0.22]].forEach((p) => { r.globalAlpha = p[1]; r.drawImage(this.refl, 0, p[0] * th.smear, W, H); });
        r.globalAlpha = 1;
        // затухание: ярко у горизонта, слабее к камере
        r.globalCompositeOperation = 'destination-in';
        const gr = r.createLinearGradient(0, this.hy, 0, H);
        gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
        r.fillStyle = gr; r.fillRect(0, 0, W, H);
        if (th.puddles) { // лужи: отражение остаётся только в пятнах
            r.fillStyle = 'rgba(0,0,0,0.18)';
            r.globalCompositeOperation = 'destination-in';
            const [m, mg] = makeCanvas(W, H);
            mg.fillStyle = 'rgba(0,0,0,0.22)'; mg.fillRect(0, this.hy, W, H - this.hy);
            const rnd = mulberry32(hashStr(this.quarter.name) + 3);
            for (let i = 0; i < 9; i++) {
                const px = W * (0.1 + rnd() * 0.8), py = this.hy + (H - this.hy) * (0.15 + rnd() * 0.85);
                const rx = 30 + rnd() * 90, ry = rx * (0.18 + rnd() * 0.2);
                const g2 = mg.createRadialGradient(px, py, 0, px, py, rx);
                g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.7, 'rgba(0,0,0,0.8)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
                mg.fillStyle = g2; mg.save(); mg.translate(px, py); mg.scale(1, ry / rx); mg.beginPath(); mg.arc(0, 0, rx, 0, 6.28); mg.fill(); mg.restore();
            }
            r.drawImage(m, 0, 0, W, H);
        }
        r.globalCompositeOperation = 'source-over';
    }

    drawHaze(g) {
        const th = this.theme, W = this.W, H = this.H;
        g.save(); g.globalCompositeOperation = 'source-over';
        const r = H * 0.42;
        const gr = g.createRadialGradient(this.cx, this.hy, 0, this.cx, this.hy, r);
        gr.addColorStop(0, rgba(th.fogColor, 0.5)); gr.addColorStop(0.3, rgba(th.fogColor, 0.22)); gr.addColorStop(1, rgba(th.fogColor, 0));
        g.fillStyle = gr; g.fillRect(this.cx - r, this.hy - r, r * 2, r * 2);
        g.restore();
    }

    drawVignette(g) {
        const W = this.W, H = this.H;
        const gr = g.createRadialGradient(this.cx, H * 0.5, H * 0.25, this.cx, H * 0.5, H * 0.78);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }

    // ---------- кадр ----------
    initRain() {
        this.rainDrops = [];
        if (!this.theme.rain) return;
        const rnd = mulberry32(99);
        for (let i = 0; i < 230; i++) {
            const far = i > 130;
            this.rainDrops.push({ x: rnd() * (this.W + 60) - 30, y: rnd() * this.H, len: far ? 6 + rnd() * 6 : 13 + rnd() * 12, v: far ? 520 + rnd() * 200 : 950 + rnd() * 350, a: far ? 0.14 : 0.3 });
        }
        this.ripples = [];
        for (let i = 0; i < 14; i++) this.ripples.push({ x: rnd() * this.W, y: this.hy + (this.H - this.hy) * (0.25 + rnd() * 0.75), t: rnd() * 1.1, life: 1.1 });
    }

    blinkOn(t, seed) {
        const p = ((t * 0.42 + seed * 0.37) % 1 + 1) % 1;
        const buzz = Math.sin(t * 37 + seed) > -0.92;
        return (p < 0.58 && buzz) || (p > 0.66 && p < 0.7) || (p > 0.76 && p < 0.79);
    }

    lightUp(sign) {
        // вспыхнуть на глазах: короткая череда вспышек, потом ровный свет
        if (this.dyn.indexOf(sign) < 0) this.dyn.push(sign);
        sign.anim = { t0: performance.now() };
        sign.state = 'lit'; sign.inten = 1; sign.isLit = true; sign.dead = -1; sign.tilt = 0; sign.sprites = {};
        this.renderStatic();
    }

    loop(now) {
        const dt = Math.min(0.05, (now - this.lastT) / 1000);
        this.lastT = now;
        const t = (now - this.t0) / 1000;
        const g = this.g, W = this.W, H = this.H;
        const th = this.theme;
        // параллакс
        this.par.x = lerp(this.par.x, this.par.tx + Math.sin(t * 0.35) * 2.5, 0.06);
        this.par.y = lerp(this.par.y, this.par.ty + Math.cos(t * 0.27) * 1.5, 0.06);
        let s = 1.035, alpha = 1;
        if (this.trans) {
            const k = clamp((now - this.trans.t0) / 380, 0, 1);
            if (this.trans.phase === 'out') { s = 1.035 + k * k * 0.6; alpha = 1 - k; if (k >= 1) { this.trans.next(); this.trans = { t0: now, phase: 'in' }; } }
            else { s = 1.035 - (1 - k) * 0.08; alpha = k; if (k >= 1) this.trans = null; }
        }
        g.setTransform(DPR, 0, 0, DPR, 0, 0);
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        g.globalAlpha = alpha;
        const ox = this.cx - this.cx * s + this.par.x, oy = this.hy - this.hy * s + this.par.y;
        g.setTransform(DPR * s, 0, 0, DPR * s, DPR * ox, DPR * oy);
        g.drawImage(this.stat, 0, 0, W, H);
        // вода
        if (th.water) {
            g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha * th.reflect;
            const step = 3;
            for (let y = this.hy; y < H; y += step) {
                const d = (y - this.hy) / (H - this.hy);
                const off = Math.sin(y * 0.11 + t * 1.6) * (0.8 + d * 4) + Math.sin(y * 0.31 - t * 2.3) * (0.4 + d * 1.5);
                g.drawImage(this.refl, 0, y * DPR, W * DPR, step * DPR, off, y, W, step + 0.5);
            }
            g.restore();
            this.drawBoat(g, t, dt);
        }
        // мигающие / зажигающиеся
        for (let i = this.dyn.length - 1; i >= 0; i--) {
            const sg = this.dyn[i];
            let on;
            if (sg.anim) {
                const k = (performance.now() - sg.anim.t0) / 1000;
                const seq = [0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1];
                const idx = Math.floor(k / 0.07);
                if (idx >= seq.length) { sg.anim = null; this.dyn.splice(i, 1); this.renderStatic(); continue; }
                on = !!seq[idx];
            } else on = this.blinkOn(t, sg.seed);
            this.drawSign(g, sg, on, false);
            if (on) { g.save(); g.globalCompositeOperation = 'lighter'; this.drawSign(g, sg, true, true, th.reflect * 0.6); g.restore(); }
        }
        this.drawSteam(g, t, dt);
        g.setTransform(DPR, 0, 0, DPR, 0, 0);
        g.globalAlpha = alpha;
        if (th.rain && this.opts.rain) this.drawRain(g, dt, t);
        g.globalAlpha = 1;
        if (this.opts.fps) { this.fps.n++; if (now - this.fps.t > 500) { this.fps.v = Math.round(this.fps.n * 1000 / (now - this.fps.t)); this.fps.n = 0; this.fps.t = now; } g.fillStyle = '#0f0'; g.font = '12px monospace'; g.fillText(this.fps.v + ' fps', 8, H - 8); }
        requestAnimationFrame(this._loop);
    }

    drawSteam(g, t, dt) {
        if (!this.vents.length) return;
        const blob = this.steamBlob;
        g.save();
        this.vents.forEach((v) => {
            v.parts.forEach((p) => {
                p.age += dt; if (p.age > p.life) { p.age = 0; p.dx = (Math.random() - 0.5) * 0.5; }
                const k = p.age / p.life;
                const x = v.x - v.side * (0.3 + k * 0.9) + p.dx * k, y = v.y + k * 2.4, z = v.z;
                const [px, py] = this.P(x, y, z);
                const r = this.f * (0.25 + k * 1.1) / z;
                g.globalAlpha = (1 - k) * k * 1.1 * 0.5 * this.vis(z);
                g.drawImage(blob, px - r, py - r, r * 2, r * 2);
            });
        });
        g.restore();
    }

    drawRain(g, dt, t) {
        const W = this.W, H = this.H;
        g.lineCap = 'round';
        g.lineWidth = 1;
        const wind = -0.12;
        // ближний слой
        for (let pass = 0; pass < 2; pass++) {
            g.strokeStyle = pass ? 'rgba(190,205,255,0.16)' : 'rgba(200,215,255,0.32)';
            g.beginPath();
            this.rainDrops.forEach((d) => {
                const far = d.a < 0.2;
                if (far !== !!pass) return;
                d.y += d.v * dt; d.x += d.v * dt * wind;
                if (d.y > H) { d.y = -d.len; d.x = Math.random() * (W + 60) - 30; }
                if (d.x < -40) d.x += W + 60;
                g.moveTo(d.x, d.y); g.lineTo(d.x + d.len * wind, d.y + d.len);
            });
            g.stroke();
        }
        // круги на лужах
        const hy = this.hy;
        g.strokeStyle = 'rgba(200,215,255,0.22)';
        this.ripples.forEach((r) => {
            r.t += dt;
            if (r.t > r.life) { r.t = 0; r.x = Math.random() * W; r.y = hy + (H - hy) * (0.25 + Math.random() * 0.75); }
            const k = r.t / r.life, d = (r.y - hy) / (H - hy);
            const rx = Math.max(0.5, (4 + k * 22) * (0.4 + d)), ry = rx * 0.3;
            g.globalAlpha = (1 - k) * 0.6;
            g.beginPath(); g.ellipse(r.x, r.y, rx, ry, 0, 0, 6.28); g.stroke();
        });
        g.globalAlpha = 1;
    }

    drawBoat(g, t, dt) {
        const b = this.boat, th = this.theme;
        b.z -= b.v * dt; if (b.z < th.zNear * 1.3) b.z = th.zSlotFar + 6;
        const z = b.z, x = Math.sin(t * 0.2) * 0.6;
        const vis = this.vis(z);
        g.save(); g.globalAlpha = vis;
        const h = [this.P(x - 1.8, 0.05, z), this.P(x + 1.8, 0.05, z), this.P(x + 1.5, 0.75, z), this.P(x - 1.5, 0.75, z)];
        g.fillStyle = '#0a0b12'; g.beginPath(); g.moveTo(h[0][0], h[0][1]); h.slice(1).forEach((q) => g.lineTo(q[0], q[1])); g.closePath(); g.fill();
        const c = [this.P(x - 1.2, 0.75, z), this.P(x + 1.2, 0.75, z), this.P(x + 1.2, 1.7, z), this.P(x - 1.2, 1.7, z)];
        g.fillStyle = '#141624'; g.beginPath(); g.moveTo(c[0][0], c[0][1]); c.slice(1).forEach((q) => g.lineTo(q[0], q[1])); g.closePath(); g.fill();
        g.globalCompositeOperation = 'lighter';
        for (let i = -1; i <= 1; i++) {
            const [lx, ly] = this.P(x + i * 0.8, 1.2, z);
            const r = Math.max(1, this.f * 0.12 / z);
            const gr = g.createRadialGradient(lx, ly, 0, lx, ly, r * 6);
            gr.addColorStop(0, 'rgba(255,220,150,0.9)'); gr.addColorStop(0.15, 'rgba(255,220,150,0.35)'); gr.addColorStop(1, 'rgba(255,220,150,0)');
            g.fillStyle = gr; g.fillRect(lx - r * 6, ly - r * 6, r * 12, r * 12);
            const [rx, ry] = this.P(x + i * 0.8, 1.2, z, true);
            const gr2 = g.createRadialGradient(rx, ry, 0, rx, ry, r * 5);
            gr2.addColorStop(0, 'rgba(255,220,150,0.5)'); gr2.addColorStop(1, 'rgba(255,220,150,0)');
            g.fillStyle = gr2; g.fillRect(rx - r * 5, ry - r * 8, r * 10, r * 16);
        }
        g.restore();
    }

    // ---------- взаимодействие ----------
    hit(px, py) {
        let best = null;
        for (let i = this.signs.length - 1; i >= 0; i--) { // ближние первыми
            const s = this.signs[i];
            if (!s.rect || s.deco) continue;
            if (px >= s.rect[0] && px <= s.rect[2] && py >= s.rect[1] && py <= s.rect[3]) { best = s; break; }
        }
        return best;
    }
    nearGate(px, py) {
        return Math.abs(px - this.cx) < this.W * 0.12 && Math.abs(py - this.hy) < this.H * 0.07;
    }
    transition(next) { if (this.trans) return; this.trans = { t0: performance.now(), phase: 'out', next }; }
    setParallax(nx, ny) { this.par.tx = clamp(nx, -1, 1) * -9; this.par.ty = clamp(ny, -1, 1) * -5; }
}

window.Street = Street;
window.StreetThemes = THEMES;
window.StreetUtil = { rgba, mix, hashStr, DPR };
})();
