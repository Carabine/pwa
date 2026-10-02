/* Улица слов — 3D-прогулка. Three.js, процедурная геометрия, вывески как canvas-текстуры.
 * Улица тянется вдоль -z, кварталы (колоды) идут один за другим и разделены арками.
 * Строятся только кварталы рядом с камерой (±1), остальные освобождаются.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const D = window.StreetData;
const JP = '"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",sans-serif';
const UI = 'Inter,system-ui,sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(h, a) { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function mix(h1, h2, t) { const a = hexToRgb(h1), b = hexToRgb(h2); const r = Math.round(lerp(a[0], b[0], t)), g = Math.round(lerp(a[1], b[1], t)), bl = Math.round(lerp(a[2], b[2], t)); return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1); }
function luma(h) { const c = hexToRgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
function roundRect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }

const THEMES = {
    shinjuku: {
        id: 'shinjuku', W: 7.2, floors: [4, 8], floorH: 3.3, lenB: [5, 9], rain: true, lanterns: null,
        fog: '#10102a', fogD: 0.028, sky: '#04040c', ground: '#07070e',
        palette: { 5: '#ffd23f', 4: '#ff6b35', 3: '#ff3fa4', 2: '#36e2ff', 1: '#b06bff', 0: '#7c8cf8' },
        wallColors: ['#15151f', '#181422', '#121a22', '#1a1624'], winColors: ['#ffd9a0', '#9ad0ff', '#ffb0c8'], shopGlow: ['#ffb060', '#7c8cf8', '#ff5a8a', '#52e0ff'],
        tiers: [{ y0: 4.2, y1: 7.8, w: 0.95, chars: 4 }, { y0: 8.4, y1: 12.6, w: 1.0, chars: 5 }],
        spacing: 3.8, awning: 3.3, hbox: { y0: 3.45, y1: 4.15, minChars: 4 }, vending: true, umbrellas: true,
    },
    yokocho: {
        id: 'yokocho', W: 3.2, floors: [2, 2], floorH: 2.9, lenB: [2.4, 3.8], rain: false,
        lanterns: { y: 2.45, r: 0.2, step: 1.35, maxChars: 2 },
        fog: '#2a180a', fogD: 0.05, sky: '#07050a', ground: '#0a0806',
        palette: { 5: '#ffcf5a', 4: '#ff8a3c', 3: '#ff5f7a', 2: '#5ad8c8', 1: '#b98cff', 0: '#8c9bff' },
        wallColors: ['#2a1c12', '#241a14', '#2e2016', '#1f1812'], winColors: ['#ffc070', '#ffd9a0'], shopGlow: ['#ffb060', '#ffcf7a', '#ff9a4a'],
        tiers: [{ y0: 3.3, y1: 5.9, w: 0.55, chars: 5 }],
        spacing: 2.5, awning: 2.95, hbox: { y0: 2.98, y1: 3.42, minChars: 6 }, noren: { y0: 1.55, y1: 2.2, maxChars: 3 },
    },
    // тихая улочка к храму: каменные фонари, бамбук, тории, храм в конце, листья клёна
    sando: {
        id: 'sando', W: 5.0, floors: [2, 2], floorH: 3.0, lenB: [3.2, 5.0], rain: false, temple: true,
        lanterns: { y: 2.75, r: 0.2, step: 1.6, maxChars: 2 },
        fog: '#0c1814', fogD: 0.045, sky: '#04070a', ground: '#0a0c0a',
        palette: { 5: '#ffcf5a', 4: '#ff8a3c', 3: '#ff5f7a', 2: '#5ad8c8', 1: '#b98cff', 0: '#8c9bff' },
        wallColors: ['#2a2018', '#241c16', '#30241a', '#1e1812'], winColors: ['#ffc070', '#ffd9a0'], shopGlow: ['#ffb060', '#ffcf7a'],
        tiers: [{ y0: 3.5, y1: 5.3, w: 0.5, chars: 4 }],
        spacing: 3.2, awning: 3.0, hbox: null, noren: { y0: 1.55, y1: 2.2, maxChars: 3 },
    },
    // праздничная улица: ятай с едой вдоль домов, слова — на фонарях и вертикальных вывесках над лотками
    matsuri: {
        id: 'matsuri', W: 6.0, floors: [2, 2], floorH: 3.0, lenB: [3.0, 4.6], rain: false, festival: true,
        lanterns: { y: 3.35, r: 0.22, step: 1.4, maxChars: 2 },
        fog: '#2a1008', fogD: 0.038, sky: '#08040c', ground: '#0c0806',
        palette: { 5: '#ffcf5a', 4: '#ff8a3c', 3: '#ff5f7a', 2: '#5ad8c8', 1: '#b98cff', 0: '#8c9bff' },
        wallColors: ['#2a1a14', '#30201a', '#241814', '#2a1c18'], winColors: ['#ffc070', '#ffd9a0', '#ff9a6a'], shopGlow: ['#ffb060', '#ffcf7a', '#ff7a4a'],
        tiers: [{ y0: 4.0, y1: 6.3, w: 0.6, chars: 5 }],
        spacing: 2.8, awning: 3.75, hbox: null, noren: null,
    },
};

// ---------- текстуры вывесок (тот же стиль, что в 2D-макете) ----------
function makeTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function drawVChars(g, list, cx, top, cell, fs, fillFor) {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 ' + fs + 'px ' + JP;
    list.forEach((ch, i) => { const y = top + cell * (i + 0.5); g.fillStyle = fillFor(i); if (ch === 'ー') { g.save(); g.translate(cx, y); g.rotate(Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); } else g.fillText(ch, cx, y); });
}
function texVertical(sign, lit) {
    const w = 128, h = Math.round(w * sign.h / sign.w);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), col = sign.color, inten = sign.inten, n = sign.chars.length;
    const cell = (h - w * 0.4) / n, fs = Math.min(w * 0.76, cell * 0.9), top = w * 0.2;
    if (sign.style === 'vbox') {
        if (lit) {
            g.fillStyle = rgba(mix(col, '#ffffff', 0.08), 1); roundRect(g, 0, 0, w, h, 6); g.fill();
            const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + 0.3 * inten + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fill();
            if (inten < 1) { g.fillStyle = 'rgba(0,0,0,' + (1 - inten) * 0.5 + ')'; g.fill(); }
            const dark = luma(col) > 0.5 ? '#1a1030' : '#ffffff';
            drawVChars(g, sign.chars, w / 2, top, cell, fs, (i) => i === sign.dead ? rgba(dark, 0.25) : dark);
        } else {
            g.fillStyle = mix(col, '#07070c', 0.85); roundRect(g, 0, 0, w, h, 6); g.fill();
            drawVChars(g, sign.chars, w / 2, top, cell, fs, () => 'rgba(255,255,255,0.18)');
        }
    } else {
        g.fillStyle = lit ? '#0c0c15' : '#09090f'; roundRect(g, 0, 0, w, h, 6); g.fill();
        if (lit) {
            g.shadowColor = rgba(col, 0.95); g.shadowBlur = 14 * inten; g.strokeStyle = rgba(col, 0.9 * inten); g.lineWidth = 5;
            roundRect(g, 7, 7, w - 14, h - 14, 5); g.stroke();
            const tube = rgba(col, 0.95 * inten), core = mix(col, '#ffffff', 0.75);
            drawVChars(g, sign.chars, w / 2, top, cell, fs, (i) => i === sign.dead ? 'rgba(255,255,255,0.12)' : tube);
            drawVChars(g, sign.chars, w / 2, top, cell, fs, (i) => i === sign.dead ? 'rgba(0,0,0,0)' : tube);
            g.shadowBlur = 4; drawVChars(g, sign.chars, w / 2, top, cell, fs, (i) => i === sign.dead ? 'rgba(0,0,0,0)' : rgba(core, 0.9 * inten + 0.1));
        } else {
            g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 4; roundRect(g, 4, 4, w - 8, h - 8, 5); g.stroke();
            drawVChars(g, sign.chars, w / 2, top, cell, fs, () => 'rgba(255,255,255,0.14)');
        }
    }
    if (sign.state === 'worn') { const rr = mulberry32(sign.seed); for (let i = 0; i < 4; i++) { const x = rr() * w, len = h * (0.3 + rr() * 0.6); const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(70,35,15,0.6)'); gr.addColorStop(1, 'rgba(70,35,15,0)'); g.fillStyle = gr; g.fillRect(x, 0, 8, len); } }
    return makeTex(c);
}
function texHorizontal(sign, lit) {
    const h = 128, w = Math.round(h * sign.len / sign.hh);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), col = sign.color, inten = sign.inten, n = sign.chars.length;
    const fs = Math.min(h * 0.66, (w * 0.86) / Math.max(n, 1) * 1.05);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 ' + fs + 'px ' + JP;
    const cw = fs, x0 = w / 2 - cw * (n - 1) / 2;
    if (lit) {
        g.fillStyle = rgba(mix(col, '#ffffff', 0.06), 1); roundRect(g, 0, 0, w, h, 6); g.fill();
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,' + 0.3 * inten + ')'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fill();
        if (inten < 1) { g.fillStyle = 'rgba(0,0,0,' + (1 - inten) * 0.5 + ')'; g.fill(); }
        const tc = luma(col) > 0.5 ? '#1a1030' : '#ffffff';
        sign.chars.forEach((ch, i) => { g.fillStyle = i === sign.dead ? 'rgba(0,0,0,0.25)' : tc; g.fillText(ch, x0 + cw * i, h * 0.52); });
    } else {
        g.fillStyle = mix(col, '#07070c', 0.85); roundRect(g, 0, 0, w, h, 6); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.2)'; sign.chars.forEach((ch, i) => g.fillText(ch, x0 + cw * i, h * 0.52));
    }
    return makeTex(c);
}
function texLantern(sign, lit) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const body = sign.white ? (lit ? '#f6e6c4' : '#4a4034') : (lit ? '#ee4a2e' : '#52170f');
    const hot = sign.white ? '#fff6dc' : '#ffb257';
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, mix(body, '#000', 0.5)); gr.addColorStop(0.4, lit ? mix(body, hot, 0.5 * sign.inten) : body); gr.addColorStop(0.6, lit ? mix(body, hot, 0.5 * sign.inten) : body); gr.addColorStop(1, mix(body, '#000', 0.5));
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 3;
    for (let i = 1; i < 7; i++) { g.beginPath(); g.moveTo(0, 256 * i / 7); g.lineTo(512, 256 * i / 7); g.stroke(); }
    const n = sign.chars.length, cell = 170 / Math.max(n, 1), fs = Math.min(80, cell * 0.9);
    [128, 384].forEach((cx) => drawVChars(g, sign.chars, cx, 128 - 85, cell, fs, (i) => i === sign.dead ? 'rgba(0,0,0,0.25)' : (lit ? 'rgba(20,8,4,0.92)' : 'rgba(0,0,0,0.55)')));
    const t = makeTex(c); return t;
}
function texNoren(sign, lit) {
    const c = document.createElement('canvas'); c.width = 384; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = sign.cloth; g.fillRect(0, 0, 384, 160);
    const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, lit ? 'rgba(255,220,160,0.3)' : 'rgba(255,255,255,0.03)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, 384, 160);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3; [128, 256].forEach((x) => { g.beginPath(); g.moveTo(x, 18); g.lineTo(x, 160); g.stroke(); });
    const n = sign.chars.length, cell = 128 / Math.max(n, 1), fs = Math.min(60, cell * 0.9);
    drawVChars(g, sign.chars, 192, 16, cell, fs, (i) => i === sign.dead ? 'rgba(255,255,255,0.2)' : (lit ? 'rgba(255,250,235,0.95)' : 'rgba(255,255,255,0.45)'));
    return makeTex(c);
}
function texFacade(th, b, rnd) {
    const pxm = 24, w = Math.round(b.len * pxm), h = Math.round(b.H * pxm);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const Y = (y) => h - y * pxm;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, mix(b.color, '#000', 0.4)); gr.addColorStop(0.5, b.color); gr.addColorStop(1, mix(b.color, '#000', 0.2));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (th.id === 'yokocho') { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; for (let y = 0.3; y < b.H; y += 0.3) { g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(w, Y(y)); g.stroke(); } }
    const cols = Math.max(1, Math.round(b.len / 1.7));
    for (let fl = 1; fl < b.floors; fl++) {
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(0, Y(fl * th.floorH)); g.lineTo(w, Y(fl * th.floorH)); g.stroke();
        for (let ci = 0; ci < cols; ci++) {
            const x0 = w * (ci + 0.22) / cols, x1 = w * (ci + 0.78) / cols, y0 = fl * th.floorH + 0.9, y1 = fl * th.floorH + 2.2;
            const lit = rnd() < 0.38, wc = th.winColors[Math.floor(rnd() * th.winColors.length)];
            g.fillStyle = lit ? rgba(wc, 0.5 + rnd() * 0.45) : 'rgba(0,0,0,0.4)';
            g.fillRect(x0, Y(y1), x1 - x0, (y1 - y0) * pxm);
            if (lit && rnd() < 0.5) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect((x0 + x1) / 2 - 1, Y(y1), 2, (y1 - y0) * pxm); }
        }
        if (th.id !== 'yokocho' && rnd() < 0.55) { // ярусная панель без слов
            const col = th.winColors[Math.floor(rnd() * th.winColors.length)], lit = rnd() < 0.5;
            g.fillStyle = lit ? rgba(col, 0.25) : 'rgba(0,0,0,0.3)'; g.fillRect(8, Y(fl * th.floorH + 0.7), w - 16, 0.55 * pxm);
            g.strokeStyle = lit ? rgba(col, 0.5) : 'rgba(255,255,255,0.06)'; g.strokeRect(8, Y(fl * th.floorH + 0.7), w - 16, 0.55 * pxm);
        }
    }
    // витрина
    if (b.shop) {
        const sc = b.shopColor;
        const gl = g.createLinearGradient(0, Y(th.awning - 0.5), 0, Y(0.2)); gl.addColorStop(0, rgba(sc, b.shutter ? 0.1 : 0.35)); gl.addColorStop(1, rgba(sc, b.shutter ? 0.04 : 0.1));
        g.fillStyle = gl; g.fillRect(6, Y(th.awning - 0.5), w - 12, (th.awning - 0.7) * pxm);
        if (b.shutter) { g.strokeStyle = 'rgba(0,0,0,0.45)'; for (let y = 0.4; y < th.awning - 0.5; y += 0.22) { g.beginPath(); g.moveTo(6, Y(y)); g.lineTo(w - 6, Y(y)); g.stroke(); } }
        else {
            g.fillStyle = rgba(mix(sc, '#ffffff', 0.5), 0.45); g.fillRect(12, Y(th.awning - 0.9), w - 24, (th.awning - 1.4) * pxm);
            g.strokeStyle = 'rgba(255,255,255,0.35)'; for (let y = 0.9; y < th.awning - 1.0; y += 0.45) { g.beginPath(); g.moveTo(14, Y(y)); g.lineTo(w - 14, Y(y)); g.stroke(); }
            g.fillStyle = 'rgba(0,0,0,0.45)'; const n = 2 + Math.floor(rnd() * 3); for (let i = 0; i < n; i++) { const x = 12 + rnd() * (w - 30); g.fillRect(x, Y(0.2 + 0.8 + rnd() * 1.1), 4 + rnd() * 6, (0.8) * pxm); }
            g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; for (let x = 6; x < w - 6; x += (th.id === 'yokocho' ? 0.45 : 1.1) * pxm) { g.beginPath(); g.moveTo(x, Y(th.awning - 0.5)); g.lineTo(x, Y(0.2)); g.stroke(); }
            if (th.id === 'yokocho') { const nm = 2 + Math.floor(rnd() * 4); for (let i = 0; i < nm; i++) { const x = 8 + rnd() * (w - 20), y0 = 1.75 + rnd() * 0.4; g.fillStyle = rnd() < 0.5 ? '#f1e6cc' : '#e0c080'; g.fillRect(x, Y(y0 + 0.5), 0.18 * pxm, 0.5 * pxm); g.fillStyle = 'rgba(0,0,0,0.5)'; for (let k = 0; k < 3; k++) g.fillRect(x + 1, Y(y0 + 0.42 - k * 0.13), 0.18 * pxm - 2, 1); } }
        }
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(w - 1.1 * pxm, Y(2.1), 0.8 * pxm, 2.1 * pxm);
    }
    // навес (тёмная полоса) и труба
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, Y(th.awning + 0.1), w, 0.25 * pxm);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, 2, h);
    const t = makeTex(c); return t;
}
function texGradientDisc() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return makeTex(c);
}
function texStreak() {
    const c = document.createElement('canvas'); c.width = 8; c.height = 64; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(200,215,255,0)'); gr.addColorStop(0.5, 'rgba(200,215,255,0.9)'); gr.addColorStop(1, 'rgba(200,215,255,0)');
    g.fillStyle = gr; g.fillRect(3, 0, 2, 64); return makeTex(c);
}
function texGate(name, emoji, color) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#0c0c15'; roundRect(g, 0, 0, 1024, 256, 20); g.fill();
    g.shadowColor = color; g.shadowBlur = 30; g.strokeStyle = color; g.lineWidth = 10; roundRect(g, 14, 14, 996, 228, 16); g.stroke();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowBlur = 24; g.shadowColor = color;
    const label = (emoji ? emoji + '  ' : '') + name;
    let fs = 96; g.font = '800 ' + fs + 'px ' + UI;
    while (fs > 40 && g.measureText(label).width > 930) { fs -= 4; g.font = '800 ' + fs + 'px ' + UI; }
    g.fillText(label, 512, 136);
    return makeTex(c);
}
function texSky() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, th.sky); gr.addColorStop(0.42, mix(th.sky, th.fog, 0.35)); gr.addColorStop(0.52, mix(th.fog, '#ffffff', 0.08)); gr.addColorStop(0.56, th.fog); gr.addColorStop(1, th.fog);
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    const rnd = mulberry32(hashStr('sky' + th.id));
    if (th.id === 'yokocho') for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.2 + rnd() * 0.7) + ')'; g.beginPath(); g.arc(rnd() * 1024, rnd() * 230, 0.5 + rnd() * 1.2, 0, 6.28); g.fill(); }
    if (th.id === 'shinjuku') { // низкие тучи, подсвеченные городом
        for (let i = 0; i < 24; i++) { const x = rnd() * 1024, y = 150 + rnd() * 110, r = 60 + rnd() * 120; const cg = g.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, rgba(mix(th.fog, '#ffffff', 0.18), 0.35)); cg.addColorStop(1, rgba(th.fog, 0)); g.fillStyle = cg; g.save(); g.translate(x, y); g.scale(1, 0.35); g.beginPath(); g.arc(0, 0, r, 0, 6.28); g.fill(); g.restore(); }
    }
    const t = makeTex(c); t.mapping = THREE.EquirectangularReflectionMapping; return t;
}
function texTower(rnd) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = mix(th.fog, '#000000', 0.55); g.fillRect(0, 0, 64, 256);
    for (let y = 6; y < 250; y += 7) for (let x = 4; x < 60; x += 6) { if (rnd() < 0.3) { g.fillStyle = rgba(['#ffe0a0', '#a0d8ff', '#ffffff'][Math.floor(rnd() * 3)], 0.35 + rnd() * 0.5); g.fillRect(x, y, 2.5, 3); } }
    return makeTex(c);
}
const _norens = new Map();
function texNorenPlain(cloth) { if (_norens.has(cloth)) return _norens.get(cloth); const t = texNorenPlain0(cloth); t.userData.shareable = true; t.userData.shared = true; _norens.set(cloth, t); return t; }
function texNorenPlain0(cloth) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = cloth; g.fillRect(0, 0, 256, 128);
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,220,160,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3; [85, 170].forEach((x) => { g.beginPath(); g.moveTo(x, 14); g.lineTo(x, 128); g.stroke(); });
    g.fillStyle = 'rgba(255,250,235,0.9)'; g.font = '700 54px ' + JP; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('酒', 128, 66);
    return makeTex(c);
}
function texWood(tone, planks) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = tone; g.fillRect(0, 0, 256, 256);
    const rnd = mulberry32(hashStr(tone));
    for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(0,0,0,' + rnd() * 0.08 + ')'; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 40, 1); }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; for (let y = 0; y < 256; y += 256 / planks) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    const t = makeTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// бумажная полоска меню (短冊) со словом — интерьер
function texStrip(sign) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    const st = sign.state;
    g.fillStyle = st === 'new' ? '#b9b2a4' : (st === 'worn' ? '#d9c9a8' : '#fbf4e4'); g.fillRect(0, 0, 64, 256);
    const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(0,0,0,0.12)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.1)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    if (st === 'worn') { g.fillStyle = 'rgba(120,70,30,0.35)'; g.fillRect(0, 180, 64, 76); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(40, 0, 24, 30); }
    g.fillStyle = sign.color; g.fillRect(0, 0, 64, 10);
    const n = sign.chars.length, cell = 200 / Math.max(n, 1), fs = Math.min(44, cell * 0.9);
    drawVChars(g, sign.chars, 32, 22, cell, fs, (i) => i === sign.dead ? 'rgba(20,10,5,0.2)' : (st === 'new' ? 'rgba(20,10,5,0.4)' : '#1a0e08'));
    if (st === 'lit') { g.fillStyle = '#c8322a'; g.beginPath(); g.arc(32, 238, 9, 0, 6.28); g.fill(); g.fillStyle = '#fbf4e4'; g.font = '700 11px ' + JP; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('済', 32, 238); }
    if (st === 'due') { g.strokeStyle = '#c8322a'; g.lineWidth = 2; g.strokeRect(6, 222, 52, 26); g.fillStyle = '#c8322a'; g.font = '700 14px ' + JP; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('復習', 32, 235); }
    return makeTex(c);
}
function texPuddles(seed) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
    g.fillStyle = 'rgb(40,40,40)'; g.fillRect(0, 0, 512, 512);
    const rnd = mulberry32(seed);
    for (let i = 0; i < 40; i++) { const x = rnd() * 512, y = rnd() * 512, r = 20 + rnd() * 70; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgb(235,235,235)'); gr.addColorStop(0.6, 'rgb(180,180,180)'); gr.addColorStop(1, 'rgb(40,40,40)'); g.fillStyle = gr; g.save(); g.translate(x, y); g.scale(1, 0.5 + rnd() * 0.5); g.beginPath(); g.arc(0, 0, r, 0, 6.28); g.fill(); g.restore(); }
    const t = makeTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------- приложение ----------
const params = new URLSearchParams(location.search);
const themeId = params.get('theme') || (document.body.dataset.theme || 'shinjuku');
// единый коридор: у каждого квартала своя тема; th/W2 — тема и полуширина «текущего» квартала
// (на время постройки квартала — его, во время прогулки — того, где камера)
const THEME_ORDER = ['shinjuku', 'yokocho', 'matsuri', 'sando'];
const START_THEME = Math.max(0, THEME_ORDER.indexOf(themeId));
let th = THEMES[THEME_ORDER[START_THEME]];
const themeForQuarter = (qi) => THEMES[THEME_ORDER[(START_THEME + qi) % THEME_ORDER.length]];
function useTheme(t) { th = t; W2 = t.W / 2; }
function withTheme(t, fn) { const p = th; useTheme(t); try { return fn(); } finally { useTheme(p); } }
function themeAt(z) { for (const b of blocks) if (z <= b.z0 && z > b.z1) return b.th; return blocks.length ? (z > blocks[0].z0 ? blocks[0].th : blocks[blocks.length - 1].th) : th; }
const SET_KEY = 'animei:street';
function lsSet() { try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}') || {}; } catch (e) { return {}; } }
function saveSet(p) { try { localStorage.setItem(SET_KEY, JSON.stringify(Object.assign(lsSet(), p))); } catch (e) { /* приватный режим */ } }
const settings = lsSet();
// ?src=sample — тестовая колода по ссылке (не запоминается); иначе выбор из настроек, на сайте по умолчанию — свои слова
const SAMPLE = params.get('src') === 'sample' && !!window.STREET_WORDS;
let source = SAMPLE ? 'demo' : (params.get('src') || settings.source || (location.protocol === 'file:' ? 'demo' : 'real'));
if (location.protocol !== 'file:') { const hb = document.getElementById('home'); if (hb) hb.hidden = false; }
const opts = { rain: settings.rain !== false, reflect: false, bloom: true }; // отражения на улице выключены навсегда

// телефоны и планшеты — облегчённый режим: чёткость 1×, без bloom, гуще туман (меньше кварталов строится), меньше ламп
const LOW = params.get('q') === 'low' || (params.get('q') !== 'high' && matchMedia('(pointer: coarse)').matches);
if (LOW) { opts.bloom = false; Object.values(THEMES).forEach((t) => { t.fogD *= 1.35; }); }
const canvas = document.getElementById('scene');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
catch (e) { try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false }); } catch (e2) { throw new Error('WebGL context: ' + (e2 && e2.message || e2)); } }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW ? 1 : 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(th.sky);
scene.fog = new THREE.FogExp2(new THREE.Color(th.fog), th.fogD);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 160);
camera.position.set(0, 1.6, 3);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(390, 844), 0.7, 0.55, 0.7);
composer.addPass(bloom);

// ---- свет: общий тусклый + 4 точечных, которые «берут» цвет ближайших горящих вывесок ----
const hemi = new THREE.HemisphereLight(new THREE.Color(th.fog), new THREE.Color(th.ground), 0.55); scene.add(hemi);
const amb = new THREE.AmbientLight(0xffffff, 0.12); scene.add(amb);
const neonLights = [];
for (let i = 0; i < (LOW ? 2 : 4); i++) { const l = new THREE.PointLight(0xffffff, 0, 14, 1.6); l.visible = false; scene.add(l); neonLights.push(l); }
const lamb = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: new THREE.Color(color), fog: true }, extra || {}));
function updateNeonLights() {
    const cz = camera.position.z, cx = camera.position.x;
    const cands = [];
    blocks.forEach((b) => { if (!b.built) return; b.signs.forEach((s) => { if (!s.isLit || s.deco && !th.lanterns) return; if (s.isProp && !(s.prop && s.prop.userData.light)) return; /* предметы светят только если это светильник */ const dz = s.z - cz; if (Math.abs(dz) > 13) return; cands.push({ s, d: Math.abs(dz) + Math.abs(s.side * (W2 - 0.6) - cx) * 0.5 }); }); });
    cands.sort((a, b) => a.d - b.d);
    neonLights.forEach((l, i) => {
        const c = cands[i];
        if (!c) { l.visible = false; return; }
        const s = c.s;
        const col = s.kind === 'lantern' ? '#ff8a3a' : (s.kind === 'noren' ? '#ffc080' : s.color);
        l.color.set(col); l.visible = true;
        const y = s.isProp ? 1.2 : (s.kind === 'vsign' ? (s.y0 + s.y1) / 2 : (s.kind === 'lantern' ? s.y : s.y0 + s.hh / 2));
        l.position.set(s.side * ((s.w2 || W2) - 1.1), y, s.kind === 'vsign' || s.kind === 'lantern' || s.isProp ? s.z : s.z - (s.len || 0) / 2);
        l.intensity = (s.kind === 'lantern' ? 5 : 9) * s.inten * (s._on === false ? 0 : 1);
    });
}

const discTex = texGradientDisc(), streakTex = texStreak();
let W2 = th.W / 2;

// ---- данные ----
let data, quarters = [], today = D.todayKey(), jlptMap = {};
// цвет: по JLPT; без уровня — по колоде, чтобы улица не была одноцветной
const deckHue = {};
function colorFor(w) { const lvl = (data.jlpt[w.kanji] != null ? data.jlpt[w.kanji] : (jlptMap[w.kanji] || 0)) | 0; w._jlpt = lvl; if (lvl) return th.palette[lvl]; const d = data.decks.find((x) => x.wordIds.indexOf(w.id) >= 0); const key = d ? d.name : (w.known ? 'known' : 'none'); if (!(key in deckHue)) deckHue[key] = Object.keys(deckHue).length; const cols = [th.palette[0], th.palette[2], th.palette[3], th.palette[4], th.palette[5], th.palette[1]]; return cols[deckHue[key] % cols.length]; }
function litCount() { return data.words.filter((w) => w._state === 'lit' || w._state === 'warm' || w._state === 'worn').length; }

// ---- раскладка кварталов вдоль улицы ----
const blocks = []; // { q, z0, z1, signs:[], built:false, group }
let streetLen = 0;
// Названия кварталов — не колоды, а сгенерированные, на языке интерфейса: «Лунный переулок», «Третий квартал»…
const NAME_A = ['Сакуровый', 'Лунный', 'Ивовый', 'Сливовый', 'Бамбуковый', 'Сосновый', 'Звёздный', 'Ветреный', 'Снежный', 'Цветочный', 'Туманный', 'Утренний', 'Вечерний', 'Зелёный', 'Кошачий', 'Лисий', 'Журавлиный', 'Алый', 'Белый', 'Синий', 'Золотой', 'Серебряный', 'Облачный', 'Колокольный', 'Родниковый', 'Лесной', 'Светлячковый', 'Ночной', 'Фонарный', 'Дождливый'];
const NAME_B = ['переулок', 'квартал', 'проулок', 'холм', 'мост', 'спуск', 'тупик', 'ряд', 'двор', 'причал'];
const ORD = ['Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый', 'Шестой', 'Седьмой', 'Восьмой'];
function districtName(seed, used) {
    const rnd = mulberry32(seed);
    for (let tries = 0; tries < 20; tries++) {
        const nm = rnd() < 0.18 ? ORD[Math.floor(rnd() * ORD.length)] + ' квартал' : NAME_A[Math.floor(rnd() * NAME_A.length)] + ' ' + NAME_B[Math.floor(rnd() * NAME_B.length)];
        if (!used.has(nm)) { used.add(nm); return nm; }
    }
    return NAME_A[seed % NAME_A.length] + ' ' + NAME_B[seed % NAME_B.length];
}
function planBlocks() {
    blocks.length = 0;
    let z = -4;
    const usedNames = new Set();
    data.words.forEach((w) => { delete w._takenBy; });
    quarters.forEach((q, qi) => {
        useTheme(themeForQuarter(qi));
        q.deckName = q.deckName || q.name; q.name = districtName(hashStr(q.deckName + th.id) + qi * 97, usedNames); q.emoji = '';
        // первый квартал забирает из всего словаря до 36 предметных слов (улица + его комнаты); у исходных кварталов они исчезают
        let extraWords = [];
        if (qi === 0) { extraWords = data.words.filter((w) => q.words.indexOf(w) < 0 && propMeta(w.kanji || w.kana || '')).sort((x, y) => (x._state === 'new') - (y._state === 'new') || hashStr(x.kanji || '') % 7 - hashStr(y.kanji || '') % 7).slice(0, 36); extraWords.forEach((w) => { w._takenBy = 0; }); }
        const n = q.words.length + extraWords.length;
        const perM = th.lanterns ? 2 / th.lanterns.step + 2 / th.spacing : (2 * th.tiers.length) / th.spacing + 2 / 8;
        const len = Math.max(14, Math.ceil(n / perM * 1.12) + 8);
        const b = { q, qi, z0: z, z1: z - len, len, signs: [], built: false, group: null, extraWords, th };
        layoutBlock(b);
        blocks.push(b);
        z -= len;
    });
    streetLen = -z + 6;
    useTheme(blocks.length ? blocks[0].th : THEMES[THEME_ORDER[START_THEME]]);
}
function layoutBlock(b) {
    const words = b.q.words.concat(b.extraWords || []).filter((w) => w._takenBy == null || w._takenBy === b.qi).sort((a, c) => String(c.createdAt || '').localeCompare(String(a.createdAt || '')));
    const slots = [];
    const zs = b.z0 - 3, ze = b.z1 + 3;
    th.tiers.forEach((t, ti) => [-1, 1].forEach((side) => { let z = zs - (ti * 0.37 + (side > 0 ? 0.5 : 0)) * th.spacing; let i = 0; while (z > ze) { slots.push({ kind: 'vsign', side, z, tier: t, style: th.temple || (i + ti + (side > 0 ? 1 : 0)) % 3 === 0 ? 'vbox' : 'vneon' }); z -= th.spacing; i++; } }));
    if (th.lanterns) [-1, 1].forEach((side) => { let z = zs - (side > 0 ? 0.45 : 0); let i = 0; while (z > ze) { slots.push({ kind: 'lantern', side, z, white: i % 3 === 2 }); z -= th.lanterns.step; i++; } });
    if (th.noren) [-1, 1].forEach((side) => { for (let z = zs - 1; z > ze + 1.5; z -= 3.1) slots.push({ kind: 'noren', side, z, len: 1.5 }); });
    if (th.hbox) [-1, 1].forEach((side) => { for (let z = zs - 2.5; z > ze + 3; z -= 8) slots.push({ kind: 'hbox', side, z, len: 3.8 }); });
    // ближе к началу квартала — новее
    slots.sort((a, c) => c.z - a.z);
    const used = new Set();
    const take = (pred) => { for (let i = 0; i < slots.length; i++) if (!used.has(i) && pred(slots[i])) { used.add(i); return slots[i]; } return null; };
    // слова-предметы: только те, что уместны на этой улице, не больше 4 на квартал; ставятся у дверей при постройке
    const streetOk = (text) => { const mt = propMeta(text); if (!mt || mt.where.indexOf('street') < 0) return false; if (mt.rain && !th.rain) return false; if (mt.theme && mt.theme !== th.id) return false; return true; };
    // первый квартал забирает из всего словаря до 36 предметных слов: часть на улицу, остальные — в его комнаты; у исходных кварталов они исчезают
    const cand = words.filter((w) => streetOk(w.kanji || w.kana || '')).sort((x, y) => (x._state === 'new') - (y._state === 'new') || hashStr(x.kanji || '') % 7 - hashStr(y.kanji || '') % 7).slice(0, b.qi === 0 ? 14 : 10);
    let pi = 0;
    words.forEach((w, idx) => {
        const text = w.kanji || w.kana || '', chars = Array.from(text), n = chars.length;
        let s = null;
        if (cand.indexOf(w) >= 0) s = { kind: 'prop', side: (pi++ % 2) ? 1 : -1, z: zs - 1.5 - pi * 2.2 };
        if (n <= 2 && th.lanterns && idx % 3 !== 1) s = take((sl) => sl.kind === 'lantern');
        if (!s && n <= 3 && th.noren && idx % 4 === 2) s = take((sl) => sl.kind === 'noren');
        if (!s && th.hbox && n >= th.hbox.minChars) s = take((sl) => sl.kind === 'hbox');
        if (!s) s = take((sl) => sl.kind === 'vsign' && n <= sl.tier.chars);
        if (!s) s = take((sl) => sl.kind === 'hbox');
        if (!s && th.lanterns && n <= 2) s = take((sl) => sl.kind === 'lantern');
        if (!s) return;
        const sign = { word: w, text, chars, state: w._state, color: w._color, kind: s.kind, side: s.side, z: s.z, seed: hashStr(text) % 1000, tex: {} };
        sign.inten = sign.state === 'warm' ? 0.55 : 1;
        sign.isLit = sign.state === 'lit' || sign.state === 'warm' || sign.state === 'worn';
        sign.dead = sign.state === 'worn' ? sign.seed % n : -1;
        if (s.kind === 'prop') { sign.isProp = true; }
        else if (s.kind === 'vsign') { sign.style = s.style; sign.w = s.tier.w; sign.h = Math.min(s.tier.y1 - s.tier.y0, n * s.tier.w * 0.92 + s.tier.w * 0.45); sign.y1 = s.tier.y1 - 0.15; sign.y0 = sign.y1 - sign.h; }
        else if (s.kind === 'lantern') { sign.white = s.white; sign.r = th.lanterns.r; sign.y = th.lanterns.y; }
        else if (s.kind === 'noren') { sign.len = s.len; sign.hh = th.noren.y1 - th.noren.y0; sign.y0 = th.noren.y0; sign.cloth = ['#1d2a5c', '#2a1e4c', '#4a1a1a', '#1a3a3a', '#101018'][sign.seed % 5]; }
        else { sign.len = s.len; sign.hh = th.hbox.y1 - th.hbox.y0; sign.y0 = th.hbox.y0; }
        b.signs.push(sign);
    });
    // пустые фонари заполняют ряд
    if (th.lanterns) slots.forEach((sl, i) => { if (!used.has(i) || sl.kind !== 'lantern') { if (sl.kind === 'lantern' && !used.has(i)) b.signs.push({ deco: true, chars: [], text: '', state: 'warm', inten: 0.75, isLit: true, dead: -1, color: th.palette[0], kind: 'lantern', side: sl.side, z: sl.z, white: sl.white, r: th.lanterns.r, y: th.lanterns.y, seed: i, tex: {} }); } });
}

// ---- постоянная геометрия: здания, земля, провода ----
const world = new THREE.Group(); scene.add(world);
// Склейка статики: тысячи одноцветных коробок/цилиндров → один меш на цвет. Пропускаем всё с текстурами,
// прозрачностью и всё, по чему кликают (userData.sign/door/exit/board).
// склейка по отрезкам улицы (MERGE_CHUNK м) с отсечением вне кадра: раньше одна сетка тянулась на всю улицу
// и видеокарта каждый кадр обрабатывала даже то, что за спиной
const MERGE_CHUNK = +(new URLSearchParams(location.search).get('chunk') || 40);
const _mp = new THREE.Vector3();
const chunkOf = (o) => Math.floor(_mp.setFromMatrixPosition(o.matrixWorld).z / MERGE_CHUNK);
function mergeStatic(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map(), remove = [];
    const colObjs = new Set(colliders.street.map((c) => c.obj).concat(colliders.room.map((c) => c.obj)));
    group.traverse((o) => {
        if (!o.isMesh || o.isSprite || o.isLine) return;
        const mt = o.material; if (!mt || Array.isArray(mt)) return;
        const shared = mt.map && (mt.userData.atlas || (mt.map.userData && mt.map.userData.shareable));
        if ((mt.map && !shared) || mt.alphaMap || mt.emissiveMap || mt.transparent || mt.wireframe) return;
        if (!(mt.isMeshLambertMaterial || mt.isMeshBasicMaterial || mt.isMeshStandardMaterial) || mt.vertexColors) return;
        if (!o.geometry || !o.geometry.index || !o.geometry.attributes.normal || !o.geometry.attributes.uv) return;
        if (colObjs.has(o) && group !== world && group !== room) return; // в кварталах объект нужен, чтобы снять препятствие при сносе
        const doorMesh = !!o.userData.door && o.parent === group && mt.isMeshBasicMaterial;
        let p = o, tagged = false;
        while (p && p !== group) { const u = p.userData || {}; if (u.sign || u.door || u.exit || u.board || u.label || u.keep) { tagged = true; break; } p = p.parent; }
        if (tagged && !doorMesh) return;
        const kind = (mt.isMeshBasicMaterial ? 'b' : (mt.isMeshStandardMaterial ? 's' + mt.roughness + '/' + mt.metalness + '/' + mt.envMapIntensity : 'l')) + ':' + (mt.emissive ? mt.emissive.getHex() + '/' + mt.emissiveIntensity : 0) + ':' + mt.side + ':' + (mt.fog !== false);
        const vc = !mt.map; // цвет переносим в вершины: разные цвета — одна сетка
        const ckey = (vc ? kind + '|vc' : 'tex' + (mt.userData.atlas ? mt.uuid : mt.map.uuid) + kind + mt.color.getHex()) + '#' + chunkOf(o);
        if (!buckets.has(ckey)) buckets.set(ckey, { mt, geos: [] });
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') g.deleteAttribute(a);
        if (vc) { const n = g.attributes.position.count, col = new Float32Array(n * 3), c = mt.color; for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); buckets.get(ckey).vc = true; }
        buckets.get(ckey).geos.push(g);
        if (doorMesh) mt.visible = false; else remove.push(o); // дверь остаётся для касаний, но не рисуется
    });
    remove.forEach((o) => { if (o.parent) o.parent.remove(o); });
    let n = 0;
    buckets.forEach((b) => {
        const merged = BufferGeometryUtils.mergeGeometries(b.geos, false);
        b.geos.forEach((g) => g.dispose());
        if (!merged) return;
        merged.computeBoundingSphere();
        const mm = b.mt.clone(); if (b.vc) { mm.vertexColors = true; mm.color.set(0xffffff); }
        const m = new THREE.Mesh(merged, mm); m.userData.merged = true;
        group.add(m); n++;
    });
    mergeLines(group);
    if (group === world) mergeGlows(group);
    return { removed: remove.length, meshes: n };
}
function mergeGlows(group) {
    group.updateMatrixWorld(true);
    const chunks = new Map(), remove = [];
    group.children.forEach((o) => {
        const mt = o.material; if (!o.isMesh || !mt || Array.isArray(mt) || mt.map !== discTex || mt.blending !== THREE.AdditiveBlending || o.userData.door) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld); const c = mt.color.clone().multiplyScalar(mt.opacity), n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3)); for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a);
        const ck = chunkOf(o); if (!chunks.has(ck)) chunks.set(ck, []); chunks.get(ck).push(g); remove.push(o);
    });
    if (remove.length < 2) return;
    remove.forEach((o) => { group.remove(o); o.geometry.dispose(); o.material.dispose(); });
    const gmat = new THREE.MeshBasicMaterial({ map: discTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    chunks.forEach((geos) => { const merged = BufferGeometryUtils.mergeGeometries(geos, false); geos.forEach((g) => g.dispose()); if (!merged) return; merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, gmat); m.userData.merged = true; group.add(m); });
}
// линии (провода, верёвки) одного цвета → один LineSegments: раньше каждая была отдельным вызовом отрисовки
function mergeLines(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map(), remove = [];
    group.traverse((o) => {
        if (!o.isLine || o.isLineSegments || !o.material || !o.material.isLineBasicMaterial || o.material.transparent) return;
        const pos = o.geometry.attributes.position; if (!pos || pos.count < 2) return;
        const key = o.material.color.getHex(); if (!buckets.has(key)) buckets.set(key, { mt: o.material, pts: [] });
        const arr = buckets.get(key).pts, a = new THREE.Vector3(), b = new THREE.Vector3();
        for (let i = 0; i < pos.count - 1; i++) { a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld); arr.push(a.x, a.y, a.z, b.x, b.y, b.z); }
        remove.push(o);
    });
    if (remove.length < 2) return;
    remove.forEach((o) => { if (o.parent) o.parent.remove(o); o.geometry.dispose(); });
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    buckets.forEach((bk) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(bk.pts, 3)); geo.applyMatrix4(inv); const ls = new THREE.LineSegments(geo, bk.mt.clone()); ls.frustumCulled = false; group.add(ls); });
}
const signsGroup = new THREE.Group(); scene.add(signsGroup);
const doors = []; // двери магазинов: в них можно войти
const colliders = { street: [], room: [] };
const blockers = []; // занятые места без коллизии (прохожие) — чтобы предметы не ставились в них // AABB по xz; камера выталкивается наружу по меньшей оси
const _bb = new THREE.Box3();
function addCollider(obj, list, pad) {
    obj.updateMatrixWorld(true);
    _bb.setFromObject(obj);
    if (!isFinite(_bb.min.x)) return;
    const p = pad == null ? 0.32 : pad;
    (list || colliders.street).push({ x0: _bb.min.x - p, x1: _bb.max.x + p, z0: _bb.min.z - p, z1: _bb.max.z + p, obj });
}
function resolveCollisions(list) {
    const c = camera.position;
    for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (c.x <= b.x0 || c.x >= b.x1 || c.z <= b.z0 || c.z >= b.z1) continue;
        const dx0 = c.x - b.x0, dx1 = b.x1 - c.x, dz0 = c.z - b.z0, dz1 = b.z1 - c.z;
        const m = Math.min(dx0, dx1, dz0, dz1);
        if (m === dx0) { c.x = b.x0; vel.x = Math.min(vel.x, 0); } else if (m === dx1) { c.x = b.x1; vel.x = Math.max(vel.x, 0); } else if (m === dz0) { c.z = b.z0; vel.z = Math.min(vel.z, 0); } else { c.z = b.z1; vel.z = Math.max(vel.z, 0); }
    }
}
const dynSigns = []; // мигающие и зажигающиеся
let skyMesh = null, skyTheme = '';
const skyTexCache = {};
function buildWorld() {
    doors.length = 0; colliders.street.length = 0; blockers.length = 0; hoverDirty = true;
    const killMat = (mt) => { if (!mt) return; (Array.isArray(mt) ? mt : [mt]).forEach((x) => { if (x.map && x.map.dispose) x.map.dispose(); if (x.alphaMap && x.alphaMap.dispose) x.alphaMap.dispose(); x.dispose(); }); };
    while (world.children.length) { const o = world.children.pop(); o.traverse((m) => { if (m.geometry) m.geometry.dispose(); killMat(m.material); }); }
    const rnd = mulberry32(hashStr('street' + source) + 11);
    const BL = blocks.length ? blocks : [{ th, z0: 6, z1: -streetLen - 10, q: { name: '', words: [] } }];
    if (typeof FESTIVAL !== 'undefined') FESTIVAL.reset();
    // тип комнаты за дверью: с весами (квартир ~18%), без двух квартир и без одного типа подряд на стороне улицы
    const HOMES = new Set(['home', 'oneroom', 'washitsu', 'loft']);
    const ROOM_W = { izakaya: 3, konbini: 2, class: 1.5, home: 1, oneroom: 0.8, washitsu: 0.7, loft: 0.6, ramen: 2, cafe: 2, books: 1.5, arcade: 1.5 };
    let prevType = null;
    const pickRoomType = () => { const tot = ROOM_TYPES.reduce((a, t) => a + (ROOM_W[t] || 1), 0); let t = ROOM_TYPES[0]; for (let tries = 0; tries < 8; tries++) { let x = rnd() * tot; for (const c of ROOM_TYPES) { x -= ROOM_W[c] || 1; if (x <= 0) { t = c; break; } } if (t !== prevType && !(HOMES.has(t) && HOMES.has(prevType))) break; } prevType = t; return t; };
    [-1, 1].forEach((side) => {
        prevType = null;
        BL.forEach((bk, bi) => { useTheme(bk.th);
        let z = bi === 0 ? 6 : bk.z0; const zEnd = bi === BL.length - 1 ? -streetLen - 10 : bk.z1;
        while (z > zEnd + 0.01) {
            let len = lerp(th.lenB[0], th.lenB[1], rnd()); if (z - len - zEnd < th.lenB[0] * 0.6) len = z - zEnd; // дом не заходит в чужой квартал
            const floors = th.floors[0] + Math.floor(rnd() * (th.floors[1] - th.floors[0] + 1));
            const b = { len, floors, H: floors * th.floorH + 0.6, color: th.wallColors[Math.floor(rnd() * th.wallColors.length)], shop: rnd() < 0.8, shutter: rnd() < 0.25, shopColor: th.shopGlow[Math.floor(rnd() * th.shopGlow.length)] };
            const tex = texFacade(th, b, rnd);
            const depth = 6;
            const geo = new THREE.BoxGeometry(depth, b.H, len);
            const faceMat = lamb('#ffffff', { map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.55 });
            const sideMat = lamb(mix(b.color, '#000', 0.3));
            const m = new THREE.Mesh(geo, sideMat);
            m.position.set(side * (W2 + depth / 2 + 0.02), b.H / 2, z - len / 2);
            if (side < 0) { tex.repeat.x = -1; tex.offset.x = 1; }
            world.add(m);
            const facade = new THREE.Mesh(new THREE.PlaneGeometry(len, b.H), faceMat); facade.position.set(side * W2, b.H / 2, z - len / 2); facade.rotation.y = -side * Math.PI / 2; world.add(facade);
            // навес
            const aw = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, len - 0.1), lamb(mix(b.color, '#000', 0.5)));
            aw.position.set(side * (W2 - 0.4), th.awning, z - len / 2); world.add(aw);
            // кондиционеры и трубы на фасаде
            const acN = 1 + Math.floor(rnd() * 3);
            for (let k = 0; k < acN && b.floors > 1; k++) {
                const fl = 1 + Math.floor(rnd() * Math.max(1, b.floors - 1));
                const ac = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.8), lamb('#2a2a30'));
                ac.position.set(side * (W2 - 0.18), fl * th.floorH + 0.4, z - 0.6 - rnd() * (len - 1.4)); world.add(ac);
                const grill = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), lamb('#111116')); grill.position.set(side * (W2 - 0.36), fl * th.floorH + 0.3, ac.position.z); grill.rotation.y = -side * Math.PI / 2; world.add(grill);
            }
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, b.H, 6), lamb('#3a3a44')); pipe.position.set(side * (W2 - 0.06), b.H / 2, z - 0.15); world.add(pipe);
            // дверь с норэном и тёплым светом изнутри — в неё можно войти
            if (b.shop && !b.shutter) {
                const dz = z - len + 1.1 + 0.4;
                const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(mix(b.shopColor, '#ffffff', 0.35)), fog: true }));
                const rtype = pickRoomType();
                door.position.set(side * (W2 - 0.01), 1.05, dz); door.rotation.y = -side * Math.PI / 2; door.userData.door = { side, z: dz, color: b.shopColor, type: rtype, w2: W2 }; world.add(door); doors.push(door);
                if (rtype === 'konbini') { door.material.color.set('#e8f4ff'); const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color('#2f7fe0') })); strip.position.set(side * (W2 - 0.05), 2.45, dz); world.add(strip); const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a2a') })); strip2.position.set(side * (W2 - 0.05), 2.2, dz); world.add(strip2); }
                else if (rtype === 'class') { const plq = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.MeshBasicMaterial({ map: texPlaque('塾'), fog: true })); plq.position.set(side * (W2 - 0.02), 2.0, dz + 0.9); plq.rotation.y = -side * Math.PI / 2; world.add(plq); door.material.color.set('#fff0d0'); }
                else if (rtype === 'home') { door.material.color.set('#3a2a1a'); const mb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.25), lamb('#8a8a96')); mb.position.set(side * (W2 - 0.08), 1.3, dz + 0.75); world.add(mb); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe6b0 })); lamp.position.set(side * (W2 - 0.1), 2.3, dz); world.add(lamp); }
                ROOMX.door(rtype, { door, side, dz, W2, world, rnd });
                const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.3), lamb('#0a0806')); dark.position.set(side * (W2 - 0.005), 1.15, dz); dark.rotation.y = -side * Math.PI / 2; world.add(dark);
                if (rtype === 'izakaya') { const nr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.55), new THREE.MeshBasicMaterial({ map: texNorenPlain(['#1d2a5c', '#4a1a1a', '#1a3a3a'][Math.floor(rnd() * 3)]), side: THREE.DoubleSide, fog: true })); nr.position.set(side * (W2 - 0.08), 1.85, dz); nr.rotation.y = -side * Math.PI / 2; world.add(nr); }
                const dl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), new THREE.MeshBasicMaterial({ map: discTex, color: new THREE.Color(b.shopColor), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
                dl.rotation.x = -Math.PI / 2; dl.position.set(side * (W2 - 0.9), 0.02, dz); world.add(dl);
            }
            if (b.shop && !b.shutter) { // световая кромка навеса
                const col = th.id === 'yokocho' ? '#ffd080' : b.shopColor;
                const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, len - 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(mix(col, '#000000', 0.25)) }));
                strip.position.set(side * (W2 - 0.8), th.awning - 0.08, z - len / 2); world.add(strip);
                // пятно от витрины на земле
                const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, len * 0.9), new THREE.MeshBasicMaterial({ map: discTex, color: new THREE.Color(col), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
                pool.rotation.x = -Math.PI / 2; pool.position.set(side * (W2 - 0.9), 0.02, z - len / 2); world.add(pool);
            }
            if (th.vending && rnd() < 0.35 && len > 4) {
                const vc = ['#dce9ff', '#ffe9c0', '#ffd6e4'][Math.floor(rnd() * 3)];
                // автомат: корпус одним материалом + светящаяся лицевая панель (раньше коробка на 6 материалов = 6 вызовов)
                const vm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.85, 1.0), lamb(mix(vc, '#000', 0.7)));
                vm.position.set(side * (W2 - 0.38), 0.925, z - len / 2); world.add(vm); addCollider(vm);
                const vf = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.85), new THREE.MeshBasicMaterial({ color: new THREE.Color(mix(vc, '#000000', 0.45)) })); vf.position.set(side * (W2 - 0.38) - side * 0.378, 0.925, z - len / 2); vf.rotation.y = -side * Math.PI / 2; world.add(vf);
            }
            decorateBuilding(side, b, z, len, rnd);
            if (th.id === 'yokocho' && rnd() < 0.7) { // ящики
                const cc = ['#d9b23a', '#3a6fd9', '#d94a3a'][Math.floor(rnd() * 3)];
                for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.5), lamb(mix(cc, '#000', 0.3))); cr.position.set(side * (W2 - 0.25), 0.15 + k * 0.31, z - 0.4 - rnd() * (len - 1)); world.add(cr); if (k === 0) addCollider(cr, null, 0.2); }
            }
            z -= len;
        }
        });
    });
    useTheme(BL[0].th);
    // земля: отражение + мокрый асфальт с лужами
    // земля и бордюры — отрезками по кварталам: ширина и цвет асфальта у каждой темы свои
    BL.forEach((bk, bi) => withTheme(bk.th, () => {
        const za = bi === 0 ? 8 : bk.z0, zb = bi === BL.length - 1 ? -streetLen - 22 : bk.z1, gl = za - zb, gw = th.W + 0.2, zc = (za + zb) / 2;
        const g0 = new THREE.Mesh(new THREE.PlaneGeometry(gw, gl), new THREE.MeshBasicMaterial({ color: new THREE.Color(th.ground) })); g0.rotation.x = -Math.PI / 2; g0.position.set(0, -0.005, zc); world.add(g0);
        const wetTex = texPuddlesInverse(hashStr(th.id) + bi); wetTex.repeat.set(gw / 14, gl / 14);
        const wet = new THREE.Mesh(new THREE.PlaneGeometry(gw, gl), lamb(mix(th.ground, '#ffffff', 0.12), { transparent: true, alphaMap: wetTex, depthWrite: false }));
        wet.rotation.x = -Math.PI / 2; wet.position.set(0, 0.0, zc); world.add(wet);
        [-1, 1].forEach((side) => { const cb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, gl), lamb('#22222c')); cb.position.set(side * (W2 - 0.25), 0.06, zc); world.add(cb); });
    }));
    // купол неба: градиент, звёзды, засветка города и дальний скайлайн
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), new THREE.MeshBasicMaterial({ map: (skyTexCache[th.id] = skyTexCache[th.id] || texSky()), side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.position.set(0, 0, -streetLen / 2); sky.userData.keep = true; world.add(sky); skyMesh = sky; skyTheme = th.id;
    for (let i = 0; i < 18; i++) {
        const tw = 6 + rnd() * 14, thh = 25 + rnd() * 60, tz = -streetLen - 40 - rnd() * 60, tx = (rnd() - 0.5) * 160;
        const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, thh, tw), new THREE.MeshBasicMaterial({ map: texTower(rnd), fog: false, transparent: true, opacity: 0.85 }));
        tower.position.set(tx, thh / 2 - 2, tz); world.add(tower);
    }
    // провода поперёк
    const wireMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    for (let z = 2; z > -streetLen; z -= 7 + (hashStr('w' + z) % 5)) { useTheme(themeAt(z));
        const y = (th.id === 'yokocho' ? 4.6 : 6.6) + (hashStr('y' + z) % 3) * 0.5, sag = 0.5;
        const pts = []; for (let k = 0; k <= 16; k++) { const x = -W2 - 0.3 + (th.W + 0.6) * k / 16; pts.push(new THREE.Vector3(x, y - sag * (1 - Math.pow(x / W2, 2)), z)); }
        world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
        const pts2 = pts.map((p) => new THREE.Vector3(p.x, p.y - 0.25, p.z + 0.05)); world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), wireMat));
    }
    BL.forEach((bk, bi) => withTheme(bk.th, () => { const za = bi === 0 ? 8 : bk.z0, zb = bi === BL.length - 1 ? -streetLen - 10 : bk.z1; [-1, 1].forEach((side) => { for (let i = 0; i < 2; i++) { const y = (th.id === 'yokocho' ? 4.3 : 6.3) + i * 0.35; world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(side * (W2 - 0.2 - i * 0.15), y, za), new THREE.Vector3(side * (W2 - 0.2 - i * 0.15), y, zb)]), wireMat)); } }); }));
    useTheme(BL[0].th);
    buildPoles(); useTheme(BL[0].th);
    // арки между кварталами
    blocks.forEach((b, i) => {
        const next = blocks[i + 1];
        const col = (next || b).q.words.find((w) => w._state === 'lit')?._color || '#7c8cf8';
        const z = b.z1;
        useTheme(next && next.th.W < b.th.W ? next.th : b.th);
        const post = new THREE.MeshBasicMaterial({ color: 0x0c0c15 });
        [-1, 1].forEach((side) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, 0.25), post); p.position.set(side * (W2 - 0.35), 2.1, z); world.add(p); addCollider(p, null, 0.2); });
        const beam = new THREE.Mesh(new THREE.BoxGeometry(th.W - 0.4, 0.25, 0.25), post); beam.position.set(0, 4.2, z); world.add(beam);
        const tube = new THREE.Mesh(new THREE.BoxGeometry(th.W - 0.4, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(mix(col, '#ffffff', 0.4)) })); tube.position.set(0, 4.05, z + 0.14); world.add(tube);
        const name = next ? next.q.name : 'Начало';
        const gt = texGate(next ? name : '↻ ' + name, '', col);
        const gw = Math.min(th.W - 0.8, 4.4);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(gw, gw / 4), new THREE.MeshBasicMaterial({ map: gt, transparent: true }));
        sign.position.set(0, 3.4, z); world.add(sign);
        const sback = new THREE.Mesh(new THREE.PlaneGeometry(gw, gw / 4), lamb('#14141b')); sback.position.set(0, 3.4, z - 0.02); sback.rotation.y = Math.PI; world.add(sback);
        // без световой стены: только арка, вывеска и трубка над ней
    });
    // прохожие
    const fig = lamb('#0b0b12');
    for (let i = 0; i < Math.floor(streetLen / 9); i++) {
        const z = -9 - rnd() * (streetLen - 13); useTheme(themeAt(z)); const x = (rnd() - 0.5) * (th.W - 1.6), h = 1.5 + rnd() * 0.3;
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.16, h * 0.5, 4, 8), fig); body.position.y = h * 0.45; g.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.075, 8, 8), fig); head.position.y = h * 0.88; g.add(head);
        if (th.umbrellas && rnd() < 0.8) { const um = new THREE.Mesh(new THREE.SphereGeometry(h * 0.38, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), lamb(['#1b1b24', '#22243a', '#2a1a2a', '#c8d8ff'][Math.floor(rnd() * 4)], { side: THREE.DoubleSide })); um.position.y = h * 1.05; um.scale.y = 0.35; g.add(um); }
        g.position.set(x, 0, z); g.rotation.y = rnd() * 6.28; world.add(g); blockers.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 });
    }
    BL.forEach((bk, bi) => withTheme(bk.th, () => { if (th.festival) FESTIVAL.build(world, bk); if (th.temple) TEMPLE.build(world, bk, bi === BL.length - 1); }));
    useTheme(BL[0].th);
    mergeStatic(world);
}
function texPuddlesInverse(seed) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
    g.fillStyle = 'rgb(255,255,255)'; g.fillRect(0, 0, 512, 512);
    const rnd = mulberry32(seed);
    // редкие маленькие лужи: 5 на тайл ~14 м, диаметр 0.3–0.8 м, с чётким краем
    for (let i = 0; i < 5; i++) { const x = rnd() * 512, y = rnd() * 512, r = 6 + rnd() * 10; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgb(30,30,30)'); gr.addColorStop(0.75, 'rgb(40,40,40)'); gr.addColorStop(1, 'rgb(255,255,255)'); g.fillStyle = gr; g.save(); g.translate(x, y); g.scale(1, 0.5 + rnd() * 0.5); g.beginPath(); g.arc(0, 0, r, 0, 6.28); g.fill(); g.restore(); }
    const t = makeTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}


// ---- предметы: слово может быть не вывеской, а вещью на улице ----
// Каждый строитель возвращает Group в метрах, стоящую на земле у стены (ось +x — к центру улицы).
// Состояние слова: новое — вещь тёмная, учу/выучено — в цвете и с мягким свечением, забывается — наклонена.
function texKanjiLabel(ch, bg, ink) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 64, 64); g.fillStyle = ink; g.font = '700 44px ' + JP; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 34); return makeTex(c); }
function texClockFace() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f6f1e4'; g.beginPath(); g.arc(64, 64, 62, 0, 6.28); g.fill(); g.fillStyle = '#1a1a1e'; g.font = '700 14px ' + UI; g.textAlign = 'center'; g.textBaseline = 'middle'; for (let i = 1; i <= 12; i++) { const an = i / 12 * Math.PI * 2; g.fillText(String(i), 64 + Math.sin(an) * 48, 64 - Math.cos(an) * 48); } g.strokeStyle = '#1a1a1e'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 24, 64 - 14); g.stroke(); g.lineWidth = 2; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 - 8, 64 - 36); g.stroke(); return makeTex(c); }
// where: где уместен; spot: у чего стоит (door / wall / table / floor / shelf / seat); rain / theme — условия улицы
const PROP_META = {
    '傘': { where: ['street', 'izakaya', 'konbini', 'class', 'home'], spot: 'door', rain: true },
    '猫': { where: ['street', 'home', 'izakaya'], spot: 'seat' },
    '犬': { where: ['street', 'home'], spot: 'floor' },
    '酒': { where: ['street', 'izakaya'], spot: 'door', theme: 'yokocho', inside: 'table' },
    '薬': { where: ['street', 'konbini'], spot: 'wall' },
    '花': { where: ['street', 'izakaya', 'class', 'home'], spot: 'door', inside: 'table' },
    '花畑': { where: ['street', 'home'], spot: 'door', inside: 'table' },
    '光': { where: ['street'], spot: 'floor' },
    '杖': { where: ['street', 'home', 'class'], spot: 'door' },
    '自転車': { where: ['street'], spot: 'floor' },
    '時計': { where: ['izakaya', 'konbini', 'class', 'home'], spot: 'wall' },
    '魚': { where: ['izakaya', 'konbini'], spot: 'table' },
    '心': { where: ['street', 'izakaya'], spot: 'wall' },
    '本': { where: ['class', 'home', 'konbini'], spot: 'table' },
    '車': { where: ['street'], spot: 'floor', theme: 'shinjuku' },
    '木': { where: ['street', 'home'], spot: 'door', inside: 'floor' },
    '火': { where: ['street', 'izakaya'], spot: 'floor', theme: 'yokocho' },
    '卵': { where: ['izakaya', 'konbini', 'home'], spot: 'table' },
    '鍵': { where: ['home', 'class'], spot: 'wall' },
};
const PROP_BUILDERS = {
    '傘': (m) => { // стойка с тремя зонтами: купол из сегментов, спицы, крючок ручки
        const g = new THREE.Group();
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.55, 12), m('#2e2e36')); stand.position.y = 0.275; g.add(stand);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 6, 16), m('#55555f')); rim.rotation.x = Math.PI / 2; rim.position.y = 0.55; g.add(rim);
        [[0, 0, '#c8d8ff', 0.06], [0.07, 0.06, '#ff6a7a', -0.05], [-0.07, 0.05, '#1b1b24', 0.0]].forEach((u) => {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.78, 8, 1, true), m(u[2])); cone.position.set(u[0], 0.97, u[1]); cone.rotation.z = u[3]; g.add(cone);
            const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 6), m('#2e2e36')); tip.position.set(u[0] - u[3] * 0.5, 1.4, u[1]); g.add(tip);
            for (let k = 0; k < 8; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.78, 0.006), m(mix(u[2], '#000000', 0.35))); rib.position.set(u[0] + Math.cos(k * 0.785) * 0.05, 0.97, u[1] + Math.sin(k * 0.785) * 0.05); rib.rotation.z = u[3] + Math.cos(k * 0.785) * 0.12; rib.rotation.x = -Math.sin(k * 0.785) * 0.12; g.add(rib); }
            const hook = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 12, Math.PI), m('#5a4a3a')); hook.position.set(u[0] - 0.04, 1.5, u[1]); hook.rotation.z = Math.PI; g.add(hook);
        });
        return g;
    },
    '猫': (m) => { // кот сидит: тело-капля, голова, уши, усы, хвост кольцом
        const g = new THREE.Group(); const fur = '#3a3a44', fur2 = '#2a2a32';
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), m(fur)); body.scale.set(1, 1.25, 1.1); body.position.y = 0.19; g.add(body);
        const chest = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), m('#d8d0c8')); chest.position.set(0, 0.17, 0.1); chest.scale.set(0.8, 1, 0.6); g.add(chest);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), m(fur)); head.position.set(0, 0.42, 0.08); head.scale.set(1.05, 0.95, 1); g.add(head);
        [-1, 1].forEach((k) => { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 4), m(fur)); ear.position.set(k * 0.06, 0.52, 0.06); ear.rotation.z = -k * 0.3; g.add(ear); const inner = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 4), m('#e0a0a0')); inner.position.set(k * 0.06, 0.515, 0.075); inner.rotation.z = -k * 0.3; g.add(inner); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), new THREE.MeshBasicMaterial({ color: 0xb8ff6a })); eye.position.set(k * 0.04, 0.43, 0.17); g.add(eye); const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: 0x111111 })); pupil.position.set(k * 0.04, 0.43, 0.182); g.add(pupil); for (let w = -1; w <= 1; w++) { const wh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.003, 0.003), m('#e8e8e8')); wh.position.set(k * 0.09, 0.4 + w * 0.012, 0.15); wh.rotation.y = -k * 0.3; wh.rotation.z = w * 0.15; g.add(wh); } });
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.012, 3), m('#e0a0a0')); nose.position.set(0, 0.4, 0.18); nose.rotation.x = Math.PI; g.add(nose);
        [-1, 1].forEach((k) => { const paw = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), m(fur2)); paw.position.set(k * 0.06, 0.035, 0.14); g.add(paw); });
        const tail = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 16, Math.PI * 1.2), m(fur2)); tail.position.set(0.12, 0.05, -0.05); tail.rotation.x = Math.PI / 2; g.add(tail);
        g.rotation.y = -0.5; g.userData.small = true; return g;
    },
    '犬': (m) => { const g = new THREE.Group(); const c1 = '#9a7a56', c2 = '#7a5a3a'; const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 6, 12), m(c1)); body.rotation.x = Math.PI / 2; body.position.y = 0.33; g.add(body); const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), m(c1)); head.position.set(0, 0.5, 0.3); g.add(head); const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), m('#c8a880')); muzzle.position.set(0, 0.46, 0.4); muzzle.scale.set(1, 0.8, 1.2); g.add(muzzle); const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), m('#111111')); nose.position.set(0, 0.48, 0.47); g.add(nose); [-1, 1].forEach((k) => { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.02), m(c2)); ear.position.set(k * 0.1, 0.5, 0.27); ear.rotation.z = k * 0.3; g.add(ear); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), m('#111111')); eye.position.set(k * 0.045, 0.53, 0.39); g.add(eye); }); [[-0.07, 0.15], [0.07, 0.15], [-0.07, -0.15], [0.07, -0.15]].forEach((p) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.3, 8), m(c2)); leg.position.set(p[0], 0.15, p[1]); g.add(leg); }); const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.22, 6), m(c2)); tail.position.set(0, 0.45, -0.3); tail.rotation.x = -0.9; g.add(tail); const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 16), m('#c8322a')); collar.position.set(0, 0.42, 0.22); collar.rotation.x = Math.PI / 2 + 0.3; g.add(collar); g.rotation.y = 0.4; return g; },
    '酒': (m) => { // бочки саке в соломенной обвязке с кандзи, рядом бутыли
        const g = new THREE.Group();
        for (let i = 0; i < 2; i++) {
            const x = (i - 0.5) * 0.56;
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.5, 14), m('#e8dcb8')); barrel.position.set(x, 0.25, 0); g.add(barrel);
            for (let k = 0; k < 14; k++) { const stave = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.5, 0.06), m('#cfc09a')); const an = k / 14 * Math.PI * 2; stave.position.set(x + Math.cos(an) * 0.205, 0.25, Math.sin(an) * 0.205); stave.rotation.y = -an; g.add(stave); }
            [0.08, 0.42].forEach((y) => { const rope = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.018, 6, 20), m('#b89a5a')); rope.rotation.x = Math.PI / 2; rope.position.set(x, y, 0); g.add(rope); });
            const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 14), m('#d8c8a0')); lid.position.set(x, 0.515, 0); g.add(lid);
            const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshBasicMaterial({ map: texKanjiLabel('酒', '#f4ecd8', '#1a1a1e'), transparent: true })); label.position.set(x, 0.26, 0.2); g.add(label);
        }
        for (let i = 0; i < 3; i++) { const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 10), m(['#2a5a3a', '#6a3a1a', '#2a3a6a'][i])); bt.position.set(-0.1 + i * 0.1, 0.65, 0.08); g.add(bt); const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.1, 8), m(['#2a5a3a', '#6a3a1a', '#2a3a6a'][i])); neck.position.set(-0.1 + i * 0.1, 0.85, 0.08); g.add(neck); }
        return g;
    },
    '薬': (m, col) => { const g = new THREE.Group(); const em = new THREE.MeshBasicMaterial({ color: new THREE.Color('#38e07a') }); const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), m('#1a1a20')); box.position.set(0, 2.1, 0); g.add(box); const a = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.03), em), bb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.03), em); a.position.set(0, 2.1, 0.065); bb.position.set(0, 2.1, 0.065); g.add(a, bb); const frame = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.64, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color('#1f7a46') })); frame.position.set(0, 2.1, 0.056); g.add(frame); g.userData.glowColor = '#38e07a'; g.userData.glowAt = [0, 2.1, 0.1]; g.userData.wall = true; return g; },
    '花': (m) => { // горшок с цветами: лепестки вокруг сердцевины, листья
        const g = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.26, 12), m('#9a5a3a')); pot.position.y = 0.13; g.add(pot);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12), m('#b07048')); rim.position.y = 0.26; g.add(rim);
        const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12), m('#2a1a10')); soil.position.y = 0.28; g.add(soil);
        const cols = ['#ff6a8a', '#ffd34a', '#ff9a3a', '#f0f0ff', '#c88aff'];
        for (let i = 0; i < 6; i++) {
            const an = i * 1.05, r = 0.07 + (i % 2) * 0.04, h = 0.32 + (i % 3) * 0.08;
            const st = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, h, 5), m('#3a7a3a')); st.position.set(Math.cos(an) * r, 0.28 + h / 2, Math.sin(an) * r); st.rotation.z = Math.cos(an) * 0.15; st.rotation.x = -Math.sin(an) * 0.15; g.add(st);
            const cx = Math.cos(an) * r * 1.4, cz = Math.sin(an) * r * 1.4, cy = 0.28 + h;
            const center = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), m('#ffd34a')); center.position.set(cx, cy, cz); g.add(center);
            for (let p = 0; p < 5; p++) { const pt = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), m(cols[i % cols.length])); pt.scale.set(1, 0.5, 1.3); pt.position.set(cx + Math.cos(p * 1.257) * 0.04, cy, cz + Math.sin(p * 1.257) * 0.04); pt.rotation.y = -p * 1.257; g.add(pt); }
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), m('#4a9a4a')); leaf.scale.set(1.8, 0.3, 0.8); leaf.position.set(Math.cos(an) * r * 1.6, 0.4, Math.sin(an) * r * 1.6); leaf.rotation.y = -an; g.add(leaf);
        }
        g.userData.small = true; return g;
    },
    '光': (m, col) => { const g = new THREE.Group(); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.6, 8), m('#2a2a30')); post.position.y = 1.3; g.add(post); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 10), m('#2a2a30')); base.position.y = 0.04; g.add(base); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.035), m('#2a2a30')); arm.position.set(0.22, 2.6, 0); g.add(arm); const house = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), m('#1a1a20')); house.position.set(0.45, 2.48, 0); g.add(house); const glass = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.18, 0.17), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2c8') })); glass.position.set(0.45, 2.46, 0); g.add(glass); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.1, 4), m('#2a2a30')); cap.position.set(0.45, 2.66, 0); cap.rotation.y = Math.PI / 4; g.add(cap); g.userData.glowColor = '#ffe8b0'; g.userData.glowAt = [0.45, 2.46, 0]; g.userData.light = true; return g; },
    '杖': (m, col) => { const g = new THREE.Group(); const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 1.55, 7), m('#5a3a22')); stick.position.y = 0.78; stick.rotation.z = 0.1; g.add(stick); for (let k = 0; k < 3; k++) { const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 5, 10), m('#8a6a3a')); wrap.position.set(-0.03 - k * 0.012, 0.9 + k * 0.1, 0); wrap.rotation.z = 0.1; g.add(wrap); } const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 20, Math.PI * 1.5), m('#c8a84a')); cradle.position.set(-0.16, 1.55, 0); cradle.rotation.z = 0.8; g.add(cradle); const orb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(mix(col, '#ffffff', 0.3)) })); orb.position.set(-0.16, 1.62, 0); g.add(orb); g.userData.glowColor = col; g.userData.glowAt = [-0.16, 1.62, 0]; g.userData.light = true; return g; },
    '自転車': (m) => { // велосипед со спицами, крыльями и корзиной
        const g = new THREE.Group(); const dark = '#1e1e26', paint = '#c84a4a';
        [-0.46, 0.46].forEach((x) => { const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 24), m(dark)); w.position.set(x, 0.3, 0); g.add(w); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), m('#8a8a94')); hub.position.set(x, 0.3, 0); hub.rotation.x = Math.PI / 2; g.add(hub); for (let k = 0; k < 12; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.56, 0.004), m('#a0a0aa')); sp.position.set(x, 0.3, 0); sp.rotation.z = k / 12 * Math.PI; g.add(sp); } const fender = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.012, 4, 20, Math.PI * 0.9), m(paint)); fender.position.set(x, 0.3, 0); fender.rotation.z = Math.PI * 0.05; g.add(fender); });
        const tube = (p1, p2, c) => { const d = new THREE.Vector3().subVectors(p2, p1); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, d.length(), 6), m(c || paint)); t.position.copy(p1).add(p2).multiplyScalar(0.5); t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); g.add(t); };
        const V = (x, y) => new THREE.Vector3(x, y, 0);
        tube(V(-0.46, 0.3), V(-0.1, 0.78)); tube(V(-0.1, 0.78), V(0.36, 0.78)); tube(V(0.36, 0.78), V(0.46, 0.3)); tube(V(-0.46, 0.3), V(0.05, 0.3)); tube(V(0.05, 0.3), V(-0.1, 0.78)); tube(V(0.05, 0.3), V(0.36, 0.78)); tube(V(0.36, 0.78), V(0.42, 0.95), '#8a8a94'); tube(V(-0.1, 0.78), V(-0.13, 0.9), '#8a8a94');
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.1), m('#2a2a30')); seat.position.set(-0.13, 0.93, 0); g.add(seat);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6), m('#8a8a94')); bar.position.set(0.42, 0.96, 0); bar.rotation.x = Math.PI / 2; g.add(bar);
        const basket = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.3), m('#7a6a4a', { wireframe: true })); basket.position.set(0.6, 0.85, 0); g.add(basket);
        const pedal = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), m('#8a8a94')); pedal.position.set(0.05, 0.3, 0.03); pedal.rotation.x = Math.PI / 2; g.add(pedal);
        g.rotation.y = Math.PI / 2; return g;
    },
    '時計': (m, col) => { const g = new THREE.Group(); const face = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ map: texClockFace() })); face.position.set(0, 2.3, 0.05); g.add(face); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.03, 8, 32), m('#3a2a1a')); rim.position.set(0, 2.3, 0.04); g.add(rim); const back = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 32), m('#2a1a10')); back.rotation.x = Math.PI / 2; back.position.set(0, 2.3, 0.01); g.add(back); g.userData.wall = true; return g; },
    '魚': (m) => { // рыба на льду в пенопластовом ящике
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.5), m('#eef2f6')); box.position.y = 0.15; g.add(box);
        const inner = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.42), m('#d8e8f8')); inner.position.y = 0.29; g.add(inner);
        for (let i = 0; i < 14; i++) { const ice = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), m('#e8f6ff')); ice.position.set(-0.3 + Math.random() * 0.6, 0.35, -0.16 + Math.random() * 0.32); ice.rotation.y = Math.random(); g.add(ice); }
        for (let i = 0; i < 3; i++) {
            const c = ['#7a90b0', '#c05a5a', '#8aa0c0'][i], z = (i - 1) * 0.13;
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), m(c)); body.scale.set(2.6, 0.7, 1); body.position.set(0, 0.4, z); g.add(body);
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), m('#e8e8f0')); belly.scale.set(2.2, 0.45, 0.9); belly.position.set(0, 0.37, z); g.add(belly);
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 3), m(c)); tail.position.set(-0.22, 0.4, z); tail.rotation.z = Math.PI / 2; tail.scale.set(1, 1, 0.3); g.add(tail);
            const fin = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 3), m(c)); fin.position.set(0.02, 0.46, z); fin.scale.set(1, 1, 0.25); g.add(fin);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), m('#111111')); eye.position.set(0.14, 0.42, z + 0.05); g.add(eye);
        }
        return g;
    },
    '心': (m, col) => { const g = new THREE.Group(); const em = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4f8a') }); const shape = new THREE.Shape(); shape.moveTo(0, -0.22); shape.bezierCurveTo(0.26, 0.0, 0.22, 0.2, 0.0, 0.1); shape.bezierCurveTo(-0.22, 0.2, -0.26, 0.0, 0, -0.22); const pts = shape.getPoints(40); const tubeGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y + 2.25, 0)), true), 80, 0.018, 8, true); const heart = new THREE.Mesh(tubeGeo, em); g.add(heart); const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.56, 0.05), m('#1a1a20')); back.position.set(0, 2.22, -0.04); g.add(back); g.userData.glowColor = '#ff4f8a'; g.userData.glowAt = [0, 2.2, 0.05]; g.userData.wall = true; return g; },
    '本': (m) => { const g = new THREE.Group(); const cols = ['#c84a4a', '#3a6fd9', '#d9b23a', '#2a8a5a', '#f0e8d8', '#6a3a8a']; for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3 + (i % 2) * 0.05, 0.045, 0.22), m(cols[i % cols.length])); b.position.set((i % 3) * 0.015, 0.0225 + i * 0.047, 0); b.rotation.y = (i % 2 ? 1 : -1) * 0.1; g.add(b); const pages = new THREE.Mesh(new THREE.BoxGeometry(0.28 + (i % 2) * 0.05, 0.035, 0.2), m('#f4efe0')); pages.position.copy(b.position); pages.position.x += 0.015; pages.rotation.y = b.rotation.y; g.add(pages); } const open = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.015, 0.24), m('#f4efe0')); open.position.set(0.3, 0.008, 0.05); open.rotation.y = 0.4; g.add(open); const spine = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.24), m('#c84a4a')); spine.position.copy(open.position); spine.rotation.y = 0.4; g.add(spine); g.userData.small = true; return g; },
    '車': (m, col) => { const g = new THREE.Group(); const paint = ['#e8e8ee', '#2a2a32', '#d8c040'][hashStr(col) % 3]; const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3.6), m(paint)); body.position.y = 0.55; g.add(body); const cab = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.5, 1.9), m(paint)); cab.position.set(0, 1.05, -0.2); g.add(cab); const glass = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.36, 1.7), m('#1a2230')); glass.position.set(0, 1.08, -0.2); g.add(glass); [[-0.8, 1.15], [0.8, 1.15], [-0.8, -1.15], [0.8, -1.15]].forEach((p) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), m('#111111')); w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.3, p[1]); g.add(w); const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.21, 10), m('#8a8a94')); rim.rotation.z = Math.PI / 2; rim.position.set(p[0], 0.3, p[1]); g.add(rim); }); [[-0.5, '#fff2c8', 1.82], [0.5, '#fff2c8', 1.82], [-0.55, '#ff3a2a', -1.82], [0.55, '#ff3a2a', -1.82]].forEach((p) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(p[1]) })); l.position.set(p[0], 0.62, p[2]); g.add(l); }); const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.12, 0.1), m('#2a2a32')); bumper.position.set(0, 0.36, 1.82); g.add(bumper); const bumper2 = bumper.clone(); bumper2.position.z = -1.82; g.add(bumper2); const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.12), m(paint)); mirror.position.set(0.82, 0.95, 0.6); g.add(mirror); const mirror2 = mirror.clone(); mirror2.position.x = -0.82; g.add(mirror2); g.userData.big = true; return g; },
    '木': (m) => { const g = new THREE.Group(); const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.38, 12), m('#4a3020')); pot.position.y = 0.19; g.add(pot); const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 1.0, 7), m('#5a3a22')); trunk.position.y = 0.85; trunk.rotation.z = 0.08; g.add(trunk); [[0.15, 1.1, 0.4, 0.5], [-0.12, 1.25, -0.3, 0.45], [0.05, 1.45, 0.1, 0.4]].forEach((p) => { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.4, 5), m('#5a3a22')); br.position.set(p[0] * 0.6, p[1] - 0.15, p[2] * 0.3); br.rotation.z = -p[0] * 2; br.rotation.x = p[2] * 1.2; g.add(br); for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(p[3] * (0.6 + k * 0.15), 9, 7), m(['#2f6a3a', '#3a7a44', '#2a5a34'][k])); c.position.set(p[0] + (k - 1) * 0.12, p[1] + k * 0.08, p[2] * 0.5 + (k - 1) * 0.1); g.add(c); } }); return g; },
    '火': (m, col) => { const g = new THREE.Group(); const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.45, 6), m('#2a2a30')); legs.position.y = 0.22; g.add(legs); const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.2, 0.26, 14), m('#2a2a30')); bowl.position.y = 0.58; g.add(bowl); const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a1a') })); coals.position.y = 0.72; g.add(coals); for (let k = 0; k < 7; k++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), m('#2a1a10')); log.position.set((Math.random() - 0.5) * 0.3, 0.76, (Math.random() - 0.5) * 0.3); log.rotation.z = Math.PI / 2; log.rotation.y = k; g.add(log); } [[0, 0.5, 0.16, '#ff8a2a'], [0.06, 0.38, 0.1, '#ffd27a'], [-0.07, 0.3, 0.08, '#ffb040']].forEach((f) => { const fl = new THREE.Mesh(new THREE.ConeGeometry(f[2], f[1], 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(f[3]) })); fl.position.set(f[0], 0.74 + f[1] / 2, 0); g.add(fl); }); const grill = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 5, 20), m('#5a5a62')); grill.position.y = 0.9; grill.rotation.x = Math.PI / 2; g.add(grill); g.userData.glowColor = '#ff8a2a'; g.userData.glowAt = [0, 1.0, 0]; g.userData.light = true; g.userData.flicker = true; return g; },
    '卵': (m) => { const g = new THREE.Group(); const tray = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.22), m('#c8b890')); tray.position.y = 0.02; g.add(tray); for (let i = 0; i < 6; i++) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.03, 10), m('#b8a880')); cup.position.set(-0.1 + (i % 3) * 0.1, 0.045, (i < 3 ? -0.05 : 0.05)); g.add(cup); const e = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), m(i % 2 ? '#f4e6c8' : '#e8d4b0')); e.scale.y = 1.3; e.position.set(cup.position.x, 0.085, cup.position.z); g.add(e); } g.userData.small = true; return g; },
    '鍵': (m, col) => { const g = new THREE.Group(); const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.03), m('#5a3a22')); board.position.y = 1.6; g.add(board); const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.38), new THREE.MeshBasicMaterial({ map: texKanjiLabel('鍵', '#3a2a1a', '#d8b84a'), transparent: true, opacity: 0.0 })); plate.position.set(0, 1.6, 0.016); g.add(plate); for (let i = 0; i < 6; i++) { const x = -0.17 + (i % 3) * 0.17, y = 1.72 - Math.floor(i / 3) * 0.2; const hook = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 5, 10, Math.PI), m('#d8b84a')); hook.position.set(x, y + 0.05, 0.02); g.add(hook); if (i === 4) continue; const k = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 14), m('#d8b84a')); k.position.set(x, y, 0.025); g.add(k); const sh = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.006), m('#d8b84a')); sh.position.set(x, y - 0.08, 0.025); g.add(sh); const bit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.006), m('#d8b84a')); bit.position.set(x + 0.012, y - 0.12, 0.025); g.add(bit); } g.userData.wall = true; return g; },
};
PROP_BUILDERS['花畑'] = PROP_BUILDERS['花'];
/*__PROPS_EXTRA__*/
function propMeta(text) { return PROP_META[text] || null; }
function propFor(text) { return PROP_BUILDERS[text] || null; }
// предмет встаёт рядом с дверью своего квартала (зонты у входа, бочки у идзакаи, кот на ящиках), если дверей нет — у стены
function placeStreetProp(sign, b) {
    const mt = propMeta(sign.text) || {};
    const ds = doors.filter((d) => d.userData.door.z <= b.z0 && d.userData.door.z > b.z1).sort((x, y) => y.userData.door.z - x.userData.door.z);
    const used = b._propDoors || (b._propDoors = new Set());
    let pick = null;
    if (mt.spot === 'door') pick = ds.find((d) => !used.has(d) && (sign.text !== '酒' || d.userData.door.type === 'izakaya')) || ds.find((d) => !used.has(d));
    else if (mt.spot === 'wall') pick = ds.find((d) => !used.has(d) && (sign.text !== '薬' || d.userData.door.type === 'konbini')) || ds.find((d) => !used.has(d));
    if (pick) { used.add(pick); const d = pick.userData.door; sign.side = d.side; sign.z = d.z + (mt.spot === 'wall' ? 1.6 : (used.size % 2 ? 1.05 : -1.05)); sign.nearDoor = d; }
    if (!pick && mt.spot === 'floor' && sign.text === '車') { sign.side = sign.side || 1; sign.z = b.z0 - 4 - (used.size) * 6; }
    // место занято декором, прохожим или другим предметом — сдвигаем вдоль улицы
    const half = BIG_PROPS.has(sign.text) ? 2.2 : 0.8;
    const x = sign.side * (W2 - (BIG_PROPS.has(sign.text) ? 1.45 : 0.7));
    const busy = (z) => { const x0 = x - half, x1 = x + half, z0 = z - half, z1 = z + half; const hit = (c) => !(x1 <= c.x0 || x0 >= c.x1 || z1 <= c.z0 || z0 >= c.z1); return colliders.street.some(hit) || blockers.some(hit); };
    if (busy(sign.z)) { const z0 = sign.z; let found = false; for (let d = 0.8; d <= 8 && !found; d += 0.8) for (const dir of [-1, 1]) { const z = z0 + dir * d; if (z <= b.z0 - 1 && z >= b.z1 + 1 && !busy(z)) { sign.z = z; found = true; break; } } }
}
function buildProp(sign, group) {
    const build = propFor(sign.text);
    const dim = sign.state === 'new';
    const m = (hex) => lamb(dim ? mix(hex, '#000000', 0.55) : hex);
    const g = build(m, sign.color);
    const x = sign.side * (W2 - (g.userData.big ? 1.45 : (g.userData.small ? 0.45 : 0.7))), z = sign.z;
    g.position.set(x, 0, z);
    if (sign.text === '猫' || sign.text === '卵') { const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.5), lamb('#8a6a3a')); crate.position.set(x, 0.16, z); group.add(crate); g.position.y = 0.32; }
    if (!g.userData.wall) { group.updateMatrixWorld(true); addCollider(g, null, g.userData.big ? 0.3 : 0.2); }
    const face = (propMeta(sign.text) || {}).face;
    if (g.userData.wall) { g.position.x = sign.side * (W2 - 0.12); g.rotation.y = -sign.side * Math.PI / 2; }
    else if (face === 'player') g.rotation.y = 0; // табличка смотрит на идущего по улице
    else if (face === 'street') g.rotation.y = sign.side > 0 ? -Math.PI / 2 : Math.PI / 2; // люди и звери — лицом к улице
    else g.rotation.y += sign.side > 0 ? Math.PI : 0;
    if (sign.state === 'worn') g.rotation.z = (sign.seed % 2 ? 1 : -1) * 0.12;
    g.traverse((o) => { if (o.isMesh) o.userData.sign = sign; });
    group.add(g);
    sign.meshes = []; sign.glow = [];
    const bb = new THREE.Box3().setFromObject(g);
    if (!(propMeta(sign.text) || {}).noLabel) attachLabel(sign, group, x, bb.max.y + 0.42, z); // у табличек слово уже на самой вывеске
    // свечение, если слово горит
    const gc = g.userData.glowColor || sign.color;
    const ga = g.userData.glowAt || [0, Math.max(0.4, bb.max.y * 0.6), 0];
    const gp = new THREE.Vector3(ga[0], ga[1], ga[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    if (g.userData.glowColor) { const hl = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: new THREE.Color(gc), transparent: true, opacity: 0.5 * sign.inten, blending: THREE.AdditiveBlending, depthWrite: false })); hl.position.copy(gp); hl.scale.set(1.6, 1.6, 1); group.add(hl); sign.glow.push(hl); }
    const gg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.8), new THREE.MeshBasicMaterial({ map: discTex, color: new THREE.Color(gc), transparent: true, opacity: (g.userData.glowColor ? 0.18 : 0.08) * sign.inten, blending: THREE.AdditiveBlending, depthWrite: false }));
    gg.rotation.x = -Math.PI / 2; gg.position.set(x, 0.015, z); if (!LOW) { group.add(gg); sign.glow.push(gg); }
    if (g.userData.light && sign.isLit) { const pl = new THREE.PointLight(new THREE.Color(gc), 3, 6, 1.6); pl.position.copy(gp); group.add(pl); sign.glow.push(pl); if (g.userData.flicker) sign.flickerLight = pl; }
    sign.prop = g;
}


// ---- подпись-тултип над предметом: слово + чтение, цвет по состоянию, видна вблизи ----
const labels = [];
function texLabel(sign, lit) {
    const key = lit ? 'lbl_on' : 'lbl_off';
    if (sign.tex[key]) return sign.tex[key];
    const n = Math.max(1, sign.chars.length);
    const c = document.createElement('canvas'); c.width = 128 + n * 56; c.height = 128; const g = c.getContext('2d');
    const w = c.width, col = lit ? sign.color : '#8a8a96';
    g.fillStyle = 'rgba(8,8,16,0.86)'; roundRect(g, 4, 4, w - 8, 92, 18); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2; roundRect(g, 4, 4, w - 8, 92, 18); g.stroke();
    g.fillStyle = 'rgba(8,8,16,0.86)'; g.beginPath(); g.moveTo(w / 2 - 12, 95); g.lineTo(w / 2 + 12, 95); g.lineTo(w / 2, 112); g.closePath(); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = lit ? mix(col, '#ffffff', 0.7) : '#c8c8d0'; g.font = '700 50px ' + JP;
    const ks = sign.word && sign.word.kana && sign.word.kana !== sign.text ? sign.word.kana : '';
    g.fillText(sign.text, w / 2, ks ? 40 : 50);
    g.shadowBlur = 0;
    if (ks) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '500 22px ' + JP; g.fillText(ks, w / 2, 76); }
    if (sign.dead >= 0) { g.fillStyle = 'rgba(40,20,10,0.5)'; g.fillRect(w / 2 - 20, 20, 24, 44); }
    const t = makeTex(c); sign.tex[key] = t; return t;
}
function attachLabel(sign, group, x, y, z, scale) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLabel(sign, sign.isLit && sign.state !== 'due'), transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    const n = Math.max(1, sign.chars.length), k = scale || 1;
    sp.scale.set((128 + n * 56) / 128 * 0.42 * k, 0.42 * k, 1); sp.position.set(x, y, z); sp.renderOrder = 10;
    sp.userData.sign = sign; group.add(sp); sign.label = sp; sp.userData.baseY = y;
    labels.push(sp);
    return sp;
}
function updateLabels(t) {
    const cp = camera.position;
    for (let i = labels.length - 1; i >= 0; i--) {
        const sp = labels[i];
        if (!sp.parent) { labels.splice(i, 1); continue; }
        let vis = true; let o = sp.parent; while (o) { if (o.visible === false) { vis = false; break; } o = o.parent; }
        if (!vis) { sp.material.opacity = 0; continue; }
        sp.getWorldPosition(_v);
        const d = _v.distanceTo(cp);
        const lim = inside.on ? 7 : 9;
        const a = d > lim ? 0 : clamp((lim - d) / 3, 0, 1);
        sp.material.opacity += (a - sp.material.opacity) * 0.12;
        sp.position.y = sp.userData.baseY + Math.sin(t * 1.6 + i) * 0.02;
    }
}
const _v = new THREE.Vector3();

// ---- вывески квартала (строятся лениво) ----
function signTexture(sign, lit) {
    const key = lit ? 'on' : 'off';
    if (sign.tex[key]) return sign.tex[key];
    let t;
    if (sign.kind === 'vsign') t = texVertical(sign, lit);
    else if (sign.kind === 'lantern') t = texLantern(sign, lit);
    else if (sign.kind === 'noren') t = texNoren(sign, lit);
    else t = texHorizontal(sign, lit); // короб и бирка предмета
    sign.tex[key] = t; return t;
}
function setSignLit(sign, lit) {
    const t = signTexture(sign, lit);
    sign.meshes.forEach((m) => { (Array.isArray(m.material) ? m.material.filter((x) => x.map) : [m.material]).forEach((mt) => { mt.map = t; mt.needsUpdate = true; }); });
    if (sign.glow) sign.glow.forEach((g) => { g.visible = lit; });
    if (sign.label) { sign.label.material.map = texLabel(sign, lit); sign.label.material.needsUpdate = true; }
}
function buildBlock(b) {
    if (b.built) return;
    if (b.th && b.th !== th) return withTheme(b.th, () => buildBlock(b));
    b.built = true; hoverDirty = true;
    const g = new THREE.Group(); b.group = g; signsGroup.add(g);
    b.signs.forEach((s) => { s.w2 = W2;
        if (s.isProp) { placeStreetProp(s, b); buildProp(s, g); if (s.state === 'due') dynSigns.push(s); if (!s.isLit || s.state === 'due') s.glow.forEach((x) => { x.visible = false; }); return; }
        s.meshes = []; s.glow = [];
        const col = s.kind === 'lantern' ? (s.white ? '#ffd79a' : '#ff7a3a') : (s.kind === 'noren' ? '#ffc080' : s.color);
        if (s.kind === 'vsign') {
            // объёмный короб: лицо и тыл — текстура, торцы тёмные
            // корпус без текстуры (склеивается со всем кварталом) + лицо отдельной плоскостью: 1 вызов вместо 6 граней
            const x = s.side * (W2 - 0.12 - s.w / 2), y = (s.y0 + s.y1) / 2, tilt = s.state === 'worn' ? (s.seed % 2 ? 1 : -1) * 0.04 : 0;
            const body = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 0.1), lamb('#0e0e14')); body.position.set(x, y, s.z); body.rotation.z = tilt; g.add(body);
            const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: signTexture(s, s.isLit && s.state !== 'due'), fog: true }));
            m.position.set(x, y, s.z + 0.051); m.rotation.z = tilt; m.userData.sign = s; g.add(m); s.meshes.push(m);
            // кронштейны
            const br = new THREE.Mesh(new THREE.BoxGeometry(W2 - Math.abs(x) + 0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x0a0a0e }));
            br.position.set(s.side * (W2 - (W2 - Math.abs(x)) / 2), s.y1 - 0.05, s.z); g.add(br);
            const br2 = br.clone(); br2.position.y = s.y0 + 0.08; g.add(br2);
            // свет на стене и на земле
            const wg = new THREE.Mesh(new THREE.PlaneGeometry(s.h * 1.6, s.h * 1.6), new THREE.MeshBasicMaterial({ map: discTex, color: new THREE.Color(col), transparent: true, opacity: 0.35 * s.inten, blending: THREE.AdditiveBlending, depthWrite: false }));
            wg.position.set(s.side * (W2 - 0.02), y, s.z); wg.rotation.y = -s.side * Math.PI / 2; g.add(wg); s.glow.push(wg);
            const gg = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 3.5, s.h * 1.2), new THREE.MeshBasicMaterial({ map: discTex, color: new THREE.Color(col), transparent: true, opacity: 0.22 * s.inten, blending: THREE.AdditiveBlending, depthWrite: false }));
            gg.rotation.x = -Math.PI / 2; gg.position.set(x, 0.015, s.z); if (!LOW) { g.add(gg); s.glow.push(gg); }
        } else if (s.kind === 'lantern') {
            const geo = new THREE.SphereGeometry(s.r, 16, 12);
            const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: signTexture(s, s.isLit && s.state !== 'due'), fog: true }));
            const x = s.side * (W2 - 0.5);
            m.position.set(x, s.y, s.z); m.scale.y = 1.35; m.userData.sign = s; g.add(m); s.meshes.push(m);
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.45, s.r * 0.45, 0.05, 10), new THREE.MeshBasicMaterial({ color: 0x111111 }));
            cap.position.set(x, s.y + s.r * 1.35, s.z); g.add(cap); const cap2 = cap.clone(); cap2.position.y = s.y - s.r * 1.35; g.add(cap2);
            g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, s.y + s.r * 1.35, s.z), new THREE.Vector3(x, th.awning - 0.1, s.z)]), new THREE.LineBasicMaterial({ color: 0x000000 })));
            const hl = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: new THREE.Color(col), transparent: true, opacity: 0.5 * s.inten, blending: THREE.AdditiveBlending, depthWrite: false }));
            hl.position.set(x, s.y, s.z); hl.scale.set(s.r * 6, s.r * 6, 1); g.add(hl); s.glow.push(hl);
            const gg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshBasicMaterial({ map: discTex, color: new THREE.Color(col), transparent: true, opacity: 0.15 * s.inten, blending: THREE.AdditiveBlending, depthWrite: false }));
            gg.rotation.x = -Math.PI / 2; gg.position.set(x, 0.015, s.z); if (!LOW) { g.add(gg); s.glow.push(gg); }
        } else { // фасадные: норэн, короб
            const geo = new THREE.PlaneGeometry(s.len, s.hh);
            const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: signTexture(s, s.isLit && s.state !== 'due'), fog: true, side: THREE.DoubleSide }));
            m.position.set(s.side * (W2 - 0.06), s.y0 + s.hh / 2, s.z - s.len / 2); m.rotation.y = -s.side * Math.PI / 2; m.userData.sign = s; g.add(m); s.meshes.push(m);
            if (s.kind === 'noren') { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: s.isLit ? 0xffe6b0 : 0x3a3024 })); lamp.position.set(s.side * (W2 - 0.15), s.y0 + s.hh + 0.25, s.z - s.len / 2); g.add(lamp); }
            const gg = new THREE.Mesh(new THREE.PlaneGeometry(s.len * 1.3, 2.2), new THREE.MeshBasicMaterial({ map: discTex, color: new THREE.Color(col), transparent: true, opacity: 0.2 * s.inten, blending: THREE.AdditiveBlending, depthWrite: false }));
            gg.rotation.x = -Math.PI / 2; gg.position.set(s.side * (W2 - 0.9), 0.015, s.z - s.len / 2); if (!LOW) { g.add(gg); s.glow.push(gg); }
        }
        if (s.state === 'due') dynSigns.push(s);
        if (!s.isLit || s.state === 'due') s.glow.forEach((x) => { x.visible = false; });
    });
    mergeStatic(g);
}
function disposeBlock(b) {
    if (!b.built) return;
    b.built = false; hoverDirty = true;
    signsGroup.remove(b.group);
    for (let i = colliders.street.length - 1; i >= 0; i--) { let o = colliders.street[i].obj; let inBlock = false; while (o) { if (o === b.group) { inBlock = true; break; } o = o.parent; } if (inBlock) colliders.street.splice(i, 1); }
    b.group.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); });
    b.signs.forEach((s) => { Object.values(s.tex).forEach((t) => t.dispose()); s.tex = {}; s.meshes = []; const i = dynSigns.indexOf(s); if (i >= 0) dynSigns.splice(i, 1); });
    b.group = null;
}
function blockAt(z) { for (let i = 0; i < blocks.length; i++) if (z <= blocks[i].z0 + 4 && z > blocks[i].z1) return i; return z > 0 ? 0 : blocks.length - 1; }
// вошли в квартал другой темы: небо, дождь, звук улицы; туман догоняет плавно (в кадре)
function onThemeChange(bi) {
    if (skyMesh && skyTheme !== th.id) { skyMesh.material.map = (skyTexCache[th.id] = skyTexCache[th.id] || texSky()); skyMesh.material.needsUpdate = true; skyTheme = th.id; }
    if (!inside.on) { audio.setScene(th.id); const tj = THEME_JP[th.id] || ['', '']; banner(tj[0], tj[1] + (blocks[bi] ? ' · ' + blocks[bi].q.name : '')); }
}
function ensureBlocks() {
    const bi = blockAt(camera.position.z);
    if (blocks[bi] && blocks[bi].th && blocks[bi].th !== th) { useTheme(blocks[bi].th); onThemeChange(bi); }
    // строим всё, что ближе дальности тумана (короткие кварталы иначе пропадали за спиной и впереди), сносим с запасом
    const cz = camera.position.z, R = clamp(2.3 / th.fogD, 40, 85);
    blocks.forEach((b, i) => { const d = cz > b.z0 ? cz - b.z0 : (cz < b.z1 ? b.z1 - cz : 0); if (Math.abs(i - bi) <= 1 || d < R) buildBlock(b); else if (Math.abs(i - bi) > 2 && d > R + 30) disposeBlock(b); });
    return bi;
}


// ---- детали окружения: то, что делает улицу обжитой ----
// атлас: n картинок одним холстом; плоскость получает UV своей ячейки, материал общий → mergeStatic сливает
function makeAtlas(n, cw, ch, draw, extra) {
    const cols = 8, rows = Math.ceil(n / cols), c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch; const g = c.getContext('2d');
    for (let i = 0; i < n; i++) { const t = draw(); g.drawImage(t.image, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch); t.dispose(); }
    const tex = makeTex(c); const mat = lamb('#ffffff', Object.assign({ map: tex }, extra || {})); mat.userData.atlas = true;
    return { n, mat, plane(w, h, rnd) { const i = Math.floor(rnd() * n), u0 = (i % cols) / cols, u1 = u0 + 1 / cols, vt = 1 - Math.floor(i / cols) / rows, vb = vt - 1 / rows; const geo = new THREE.PlaneGeometry(w, h); const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), vb + uv.getY(k) * (vt - vb)); return new THREE.Mesh(geo, mat); } };
}
let posterAtlas = null, boardAtlas = null;
function texPoster(rnd) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 90; const g = c.getContext('2d');
    const base = ['#e8e0d0', '#f0d8c0', '#d8e8f0', '#f4e4a0', '#e0c8e8'][Math.floor(rnd() * 5)];
    g.fillStyle = base; g.fillRect(0, 0, 64, 90);
    g.fillStyle = ['#c8322a', '#2a4ac8', '#1a1a1a', '#e07a2a'][Math.floor(rnd() * 4)]; g.fillRect(0, 0, 64, 18 + rnd() * 20);
    g.fillStyle = 'rgba(0,0,0,0.55)'; for (let y = 46; y < 84; y += 7) g.fillRect(6, y, 20 + rnd() * 34, 3);
    if (rnd() < 0.5) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = '700 22px ' + JP; g.textAlign = 'center'; g.fillText(['祭', '新', '夜', '酒', '麺'][Math.floor(rnd() * 5)], 32, 26); }
    return makeTex(c);
}
function texBoard(rnd) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d');
    g.fillStyle = rnd() < 0.5 ? '#1a1a1e' : '#f4ecd8'; g.fillRect(0, 0, 64, 96);
    const ink = g.fillStyle === '#1a1a1e' ? 'rgba(255,255,255,0.85)' : 'rgba(20,10,5,0.85)';
    g.fillStyle = ink; g.font = '700 16px ' + JP; g.textAlign = 'center'; g.fillText(['本日', 'おすすめ', '定食', '生ビール'][Math.floor(rnd() * 4)], 32, 22);
    for (let y = 36; y < 88; y += 10) g.fillRect(8, y, 26 + rnd() * 24, 2.5);
    return makeTex(c);
}
function decorateBuilding(side, b, z, len, rnd) {
    const x = side * W2;
    const inward = (d) => x - side * d;
    // карнизы между этажами — объём фасада
    for (let fl = 1; fl < b.floors; fl++) { const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, len - 0.05), lamb(mix(b.color, '#ffffff', 0.08))); ledge.position.set(inward(0.09), fl * th.floorH, z - len / 2); world.add(ledge); }
    // плакаты у входа
    // плакаты — по сетке вдоль фасада, каждый на своей глубине и не у двери, иначе плоскости дрожат друг на друге
    const np = Math.min(1 + Math.floor(rnd() * 3), Math.floor((len - 2.4) / 0.7));
    if (!posterAtlas) { const ar = mulberry32(hashStr(th.id) + 5); posterAtlas = makeAtlas(32, 64, 90, () => texPoster(ar)); }
    for (let i = 0; i < np; i++) { const p = posterAtlas.plane(0.45, 0.64, rnd); p.position.set(inward(0.015 + i * 0.006), 1.55 + (i % 2) * 0.4 + rnd() * 0.1, z - 0.5 - i * 0.7 - rnd() * 0.15); p.rotation.y = -side * Math.PI / 2; p.rotation.z = (rnd() - 0.5) * 0.06; world.add(p); }
    // балконы и бельё (верхние этажи)
    if (b.floors > 2 && rnd() < (th.id === 'yokocho' ? 0.3 : 0.55)) {
        const fl = 1 + Math.floor(rnd() * (b.floors - 1));
        const bw = Math.min(len - 0.6, 1.6 + rnd() * 2.2), bz = z - 0.3 - rnd() * Math.max(0.1, len - bw - 0.6) - bw / 2;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, bw), lamb(mix(b.color, '#ffffff', 0.06))); slab.position.set(inward(0.45), fl * th.floorH + 0.05, bz); world.add(slab);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, bw), lamb('#2a2a30')); rail.position.set(inward(0.88), fl * th.floorH + 0.55, bz); world.add(rail);
        for (let k = 0; k < Math.floor(bw / 0.25); k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, 0.02), lamb('#3a3a44')); bar.position.set(inward(0.88), fl * th.floorH + 0.55, bz - bw / 2 + 0.12 + k * 0.25); world.add(bar); }
        const planter = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 0.5), lamb('#4a3020')); planter.position.set(inward(0.75), fl * th.floorH + 1.05, bz + bw / 2 - 0.4); world.add(planter);
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lamb('#2f6a3a')); leaf.position.set(inward(0.75), fl * th.floorH + 1.3, bz + bw / 2 - 0.4); world.add(leaf);
        if (rnd() < 0.6) { // бельё на верёвке
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(inward(0.5), fl * th.floorH + 2.0, bz - bw / 2), new THREE.Vector3(inward(0.5), fl * th.floorH + 2.0, bz + bw / 2)]), new THREE.LineBasicMaterial({ color: 0x000000 })); world.add(line);
            for (let k = 0; k < Math.floor(bw / 0.45); k++) { const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.45 + rnd() * 0.3), lamb(['#e8e8f0', '#9ab8e8', '#f0c8d0', '#d8e8c0', '#f4f0e0'][Math.floor(rnd() * 5)], { side: THREE.DoubleSide })); cl.position.set(inward(0.5), fl * th.floorH + 1.72, bz - bw / 2 + 0.25 + k * 0.45); cl.rotation.y = -side * Math.PI / 2; world.add(cl); }
        }
    }
    // газовый счётчик/щиток и водосток
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.25), lamb('#9a9aa4')); meter.position.set(inward(0.1), 0.9 + rnd() * 0.6, z - len + 2.3); world.add(meter);
    // стойка-меню у двери и хлам у стены
    if (b.shop && !b.shutter) {
        const dz = z - len + 1.5 + 0.9;
        const bd = new THREE.Group();
        // А-образная стойка: две створки наклонены и сходятся сверху, не пересекаясь
        if (!boardAtlas) { const ar = mulberry32(hashStr(th.id) + 6); boardAtlas = makeAtlas(24, 64, 96, () => texBoard(ar), { side: THREE.DoubleSide }); }
        [1, -1].forEach((k) => { const pl = boardAtlas.plane(0.5, 0.78, rnd); pl.position.set(0, 0.4, k * 0.12); pl.rotation.x = -k * 0.3; bd.add(pl); });
        const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.03), lamb('#2a2a30')); hinge.position.set(0, 0.78, 0); bd.add(hinge);
        [-0.23, 0.23].forEach((x) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.3), lamb('#2a2a30')); leg.position.set(x, 0.015, 0); bd.add(leg); });
        bd.position.set(inward(0.75), 0, dz); bd.rotation.y = -side * Math.PI / 2 + (rnd() - 0.5) * 0.4; world.add(bd); addCollider(bd, null, 0.2);
    }
    const nj = Math.floor(rnd() * 3);
    for (let i = 0; i < nj; i++) {
        const kind = rnd();
        const jz = z - 0.3 - rnd() * (len - 0.6);
        if (kind < 0.35) { for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) { const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22 + rnd() * 0.1, 8, 6), lamb(rnd() < 0.5 ? '#15151a' : '#2a3a5a')); bag.scale.y = 0.75; bag.position.set(inward(0.3 + rnd() * 0.3), 0.17, jz + (rnd() - 0.5) * 0.6); world.add(bag); } }
        else if (kind < 0.6) { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 10), lamb('#ff6a2a')); cone.position.set(inward(0.6 + rnd() * 0.4), 0.3, jz); world.add(cone); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 10), lamb('#f0f0f0')); band.position.set(cone.position.x, 0.38, jz); world.add(band); }
        else if (kind < 0.8) { const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.75, 12), lamb(rnd() < 0.5 ? '#2a4a7a' : '#2a2a30')); bin.position.set(inward(0.4), 0.375, jz); world.add(bin); addCollider(bin, null, 0.2); const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12), lamb('#1a1a20')); lid.position.set(inward(0.4), 0.77, jz); world.add(lid); }
        else if (PROP_BUILDERS['自転車']) { const bike = PROP_BUILDERS['自転車'](lamb); bike.position.set(inward(0.55), 0, jz); bike.rotation.y += (rnd() - 0.5) * 0.5; bike.traverse((o) => { if (o.material) o.material = lamb('#1a1a20'); }); world.add(bike); addCollider(bike, null, 0.15); }
    }
    // люк и решётка стока
    if (rnd() < 0.5) { const mh = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), lamb('#2a2a2e')); mh.rotation.x = -Math.PI / 2; mh.position.set(side * (W2 * 0.35) * (rnd() < 0.5 ? 1 : -1), 0.012, z - rnd() * len); world.add(mh); }
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.8), lamb('#111116')); gr.rotation.x = -Math.PI / 2; gr.position.set(inward(0.7), 0.011, z - len / 2); world.add(gr);
    for (let k = 0; k < 5; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.01, 0.06), lamb('#3a3a44')); bar.position.set(inward(0.7), 0.016, z - len / 2 - 0.3 + k * 0.15); world.add(bar); }
}
function buildPoles() {
    let k = 0;
    for (let z = -2; z > -streetLen; z -= 13 + (k % 3) * 2, k++) {
        useTheme(themeAt(z)); if (th.temple || th.festival) continue; // у храма и на празднике — без бетонных столбов
        const side = k % 2 ? 1 : -1, x = side * (W2 - 0.35);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 9.5, 10), lamb('#4a4a52')); pole.position.set(x, 4.75, z); world.add(pole); addCollider(pole, null, 0.25);
        [8.6, 7.6].forEach((y, i) => { const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), lamb('#2a2a30')); arm.position.set(x, y, z); world.add(arm); for (let j = -1; j <= 1; j += 2) { const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), lamb(i ? '#b8b8c0' : '#d8d0b0')); ins.position.set(x + j * 0.55, y + 0.1, z); world.add(ins); } });
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 10), lamb('#5a5a62')); tr.position.set(x - side * 0.35, 6.6, z); world.add(tr);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2c8 })); lamp.position.set(x - side * 0.9, 5.4, z); world.add(lamp);
        const larm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.05), lamb('#2a2a30')); larm.position.set(x - side * 0.45, 5.5, z); world.add(larm);
        if (k % 2 === 0) { const pl = new THREE.PointLight(0xfff2c8, 2.5, 9, 1.8); pl.position.set(x - side * 0.9, 5.3, z); world.add(pl); }
        // косые провода к крыше
        world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 8.6, z), new THREE.Vector3(side * (W2 + 0.2), 9.8, z - 3)]), new THREE.LineBasicMaterial({ color: 0x000000 })));
    }
}

// ---- интерьер: идзакая, слова колоды — бумажные полоски меню на стенах ----
const room = new THREE.Group(); room.visible = false; scene.add(room);
const inside = { on: false, block: null, strips: [], lights: [], saved: null, door: null, steam: [] };
const ROOM = { w: 7.6, d: 11.5, h: 3.2, doorX: 1.4 }; // размеры текущей комнаты, задаются генератором
const ROOM_TYPES = ['izakaya', 'konbini', 'class', 'home'];
const ROOM_NAMES = { izakaya: '居酒屋 · идзакая', konbini: 'コンビニ · комбини', class: '塾 · вечерняя школа', home: '部屋 · квартира' };
ROOM_TYPES.push(...ROOMX.types); Object.assign(ROOM_NAMES, ROOMX.names);
const _plaques = new Map();
function texPlaque(ch) { if (_plaques.has(ch)) return _plaques.get(ch); const t = texPlaque0(ch); t.userData.shareable = true; t.userData.shared = true; _plaques.set(ch, t); return t; }
function texPlaque0(ch) { const c = document.createElement('canvas'); c.width = 64; c.height = 90; const g = c.getContext('2d'); g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, 64, 90); g.strokeStyle = '#2a2a30'; g.lineWidth = 3; g.strokeRect(3, 3, 58, 84); g.fillStyle = '#1a1a1e'; g.font = '700 44px ' + JP; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 46); return makeTex(c); }
function texBlackboard(words) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
    g.fillStyle = '#2b4a3a'; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.04 + ')'; g.fillRect(Math.random() * 1024, Math.random() * 512, 3 + Math.random() * 30, 1); }
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(14, 14, 996, 484);
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '700 34px ' + JP; g.textAlign = 'left'; g.fillText('今日の言葉', 40, 50);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(40, 72); g.lineTo(230, 72); g.stroke();
    const cols = 4, cw = 236, rh = 92;
    words.forEach((w, i) => {
        if (i >= 16) return;
        const x = 40 + (i % cols) * cw, y = 110 + Math.floor(i / cols) * rh;
        const col = w.state === 'new' ? 'rgba(255,255,255,0.35)' : (w.state === 'lit' ? '#fff6c8' : (w.state === 'due' ? '#ffd0d0' : '#ffffff'));
        g.save(); g.translate(x, y); g.rotate((hashStr(w.text) % 5 - 2) * 0.012);
        g.fillStyle = col; g.font = '700 40px ' + JP; g.textAlign = 'left'; g.fillText(w.text, 0, 0);
        const ks = w.word && w.word.kana && w.word.kana !== w.text ? w.word.kana : '';
        if (ks) { g.font = '500 18px ' + JP; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText(ks, 0, 34); }
        if (w.state === 'lit') { g.strokeStyle = '#ffd34a'; g.lineWidth = 3; g.beginPath(); g.arc(-18, 0, 12, 0, 6.28); g.stroke(); }
        if (w.state === 'due') { g.fillStyle = '#ff8a8a'; g.font = '700 16px ' + JP; g.fillText('復習!', 150, -22); }
        if (w.state === 'worn') { g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, 6); g.lineTo(130, -8); g.stroke(); }
        g.restore();
    });
    return makeTex(c);
}
function texNote(w) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
    const base = w.state === 'new' ? '#d8d4c8' : ['#fff3a0', '#ffd0c8', '#c8f0d8', '#d0e4ff', '#f0d0ff'][hashStr(w.text) % 5];
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 0, 128, 10);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = w.state === 'new' ? 'rgba(20,10,5,0.45)' : '#1a1210'; g.font = '700 ' + Math.min(44, 160 / Math.max(1, w.chars.length)) + 'px ' + JP; g.fillText(w.text, 64, 52);
    const ks = w.word && w.word.kana && w.word.kana !== w.text ? w.word.kana : ''; if (ks) { g.font = '500 16px ' + JP; g.fillStyle = 'rgba(20,10,5,0.7)'; g.fillText(ks, 64, 86); }
    if (w.state === 'lit') { g.fillStyle = '#c8322a'; g.beginPath(); g.arc(104, 104, 10, 0, 6.28); g.fill(); }
    if (w.state === 'due') { g.strokeStyle = '#c8322a'; g.lineWidth = 3; g.strokeRect(6, 6, 116, 116); }
    if (w.state === 'worn') { g.fillStyle = 'rgba(120,70,30,0.35)'; g.fillRect(0, 90, 128, 38); }
    return makeTex(c);
}
function texPrice(w) {
    const c = document.createElement('canvas'); c.width = 160; c.height = 96; const g = c.getContext('2d');
    g.fillStyle = w.state === 'new' ? '#c8c8c8' : '#ffe24a'; g.fillRect(0, 0, 160, 96);
    g.fillStyle = '#c8322a'; g.fillRect(0, 0, 160, 14);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = w.state === 'new' ? 'rgba(20,10,5,0.45)' : '#1a1210'; g.font = '700 ' + Math.min(34, 140 / Math.max(1, w.chars.length)) + 'px ' + JP; g.fillText(w.text, 80, 40);
    g.fillStyle = '#c8322a'; g.font = '800 26px ' + UI; g.fillText('¥' + (98 + (hashStr(w.text) % 9) * 50), 80, 76);
    if (w.state === 'due') { g.strokeStyle = '#c8322a'; g.lineWidth = 4; g.strokeRect(4, 4, 152, 88); }
    return makeTex(c);
}

function texMagazine(w) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 128; const g = c.getContext('2d');
    const base = ['#ffffff', '#ffe9a0', '#d8ecff', '#ffd6e0', '#e6ffe0'][hashStr(w.text) % 5];
    g.fillStyle = base; g.fillRect(0, 0, 96, 128);
    const band = ['#c8322a', '#2a4ac8', '#1a1a1a', '#e07a2a', '#8a2ac8'][hashStr(w.text + 'b') % 5];
    g.fillStyle = band; g.fillRect(0, 0, 96, 22);
    g.fillStyle = '#ffffff'; g.font = '700 12px ' + UI; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(['WEEKLY', 'MONTHLY', 'AN·AN', 'POPEYE', 'BRUTUS'][hashStr(w.text) % 5], 6, 11);
    g.fillStyle = w.state === 'new' ? 'rgba(20,10,5,0.4)' : '#1a1210'; g.font = '900 ' + Math.min(40, 150 / Math.max(1, w.chars.length)) + 'px ' + JP; g.textAlign = 'center'; g.fillText(w.text, 48, 58);
    const ks = w.word && w.word.kana && w.word.kana !== w.text ? w.word.kana : ''; if (ks) { g.font = '500 13px ' + JP; g.fillStyle = 'rgba(20,10,5,0.75)'; g.fillText(ks, 48, 84); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; for (let y = 100; y < 124; y += 7) g.fillRect(8, y, 30 + (hashStr(w.text + y) % 40), 2.5);
    if (w.state === 'lit') { g.fillStyle = '#c8322a'; g.beginPath(); g.arc(82, 108, 9, 0, 6.28); g.fill(); g.fillStyle = '#fff'; g.font = '700 10px ' + JP; g.fillText('済', 82, 108); }
    if (w.state === 'due') { g.strokeStyle = '#c8322a'; g.lineWidth = 4; g.strokeRect(2, 2, 92, 124); }
    return makeTex(c);
}
function texWordPoster(w) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 136; const g = c.getContext('2d');
    g.fillStyle = w.state === 'new' ? '#d8d4c8' : ['#fff4d0', '#e0f0ff', '#ffe0e8', '#e8ffe0'][hashStr(w.text) % 4]; g.fillRect(0, 0, 96, 136);
    g.fillStyle = '#c8322a'; g.fillRect(0, 0, 96, 10);
    g.fillStyle = w.state === 'new' ? 'rgba(20,10,5,0.4)' : '#1a1210'; g.font = '900 ' + Math.min(46, 170 / Math.max(1, w.chars.length)) + 'px ' + JP; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(w.text, 48, 56);
    const ks = w.word && w.word.kana && w.word.kana !== w.text ? w.word.kana : ''; if (ks) { g.font = '500 14px ' + JP; g.fillStyle = 'rgba(20,10,5,0.75)'; g.fillText(ks, 48, 90); }
    g.fillStyle = 'rgba(0,0,0,0.45)'; for (let y = 108; y < 130; y += 7) g.fillRect(10, y, 40 + (hashStr(w.text + y) % 36), 2.5);
    if (w.state === 'due') { g.strokeStyle = '#c8322a'; g.lineWidth = 4; g.strokeRect(2, 2, 92, 132); }
    return makeTex(c);
}
function texTV() { const c = document.createElement('canvas'); c.width = 128; c.height = 72; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 128, 72); gr.addColorStop(0, '#1a3a6a'); gr.addColorStop(1, '#3a6a9a'); g.fillStyle = gr; g.fillRect(0, 0, 128, 72); g.fillStyle = '#ffffff'; g.font = '700 14px ' + JP; g.fillText('ニュース', 8, 20); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(8, 54, 112, 10); g.fillStyle = '#c8322a'; g.fillRect(8, 54, 30, 10); return makeTex(c); }

const BIG_PROPS = new Set(['車']);
function placeObject(sign, spot, scale) {
    const build = propFor(sign.text); if (!build) return false;
    const dim = sign.state === 'new';
    const m = (hex) => lamb(dim ? mix(hex, '#000000', 0.55) : hex);
    const g = build(m, sign.color);
    if (g.userData.big) return false;
    const mt = propMeta(sign.text) || {}; const want = mt.inside || mt.spot || 'table';
    const kind = spot.kind || (spot.wall ? 'wall' : 'table');
    if (want !== kind && !(want === 'door' && kind === 'floor') && !(want === 'seat' && kind === 'floor') && !(want === 'floor' && kind === 'door')) return false;
    if (g.userData.wall) { g.position.set(spot.x, spot.y, spot.z); g.rotation.y = spot.ry; g.scale.setScalar(0.75); }
    else { g.position.set(spot.x, spot.y, spot.z); g.rotation.y = spot.ry + (hashStr(sign.text) % 6) * 0.3; g.scale.setScalar(kind === 'table' ? (g.userData.small ? 0.9 : 0.45) : 0.9); }
    g.traverse((o) => { if (o.isMesh) o.userData.sign = sign; });
    room.add(g);
    const bb = new THREE.Box3().setFromObject(g);
    attachLabel(sign, room, (bb.min.x + bb.max.x) / 2, bb.max.y + 0.3, (bb.min.z + bb.max.z) / 2, 0.7);
    if (g.userData.glowColor && sign.isLit) { const hl = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: new THREE.Color(g.userData.glowColor), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); hl.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2); hl.scale.set(0.9, 0.9, 1); room.add(hl); }
    return true;
}
function clearRoom() {
    while (room.children.length) { const o = room.children.pop(); o.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (x.map && x.map.dispose && !x.map.userData.shared) x.map.dispose(); x.dispose(); }); }); }
    inside.strips = []; inside.lights = []; inside.steam = []; colliders.room.length = 0; roomHover = []; LIFE.clearRoom();
}
function roomShell(wallMat, floorMat, ceilColor, doorColor) {
    const { w, d, h, doorX } = ROOM;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat); floor.rotation.x = -Math.PI / 2; room.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lamb(ceilColor)); ceil.rotation.x = Math.PI / 2; ceil.position.y = h; room.add(ceil);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat); back.position.set(0, h / 2, -d / 2); room.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat); left.position.set(-w / 2, h / 2, 0); left.rotation.y = Math.PI / 2; room.add(left);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat); right.position.set(w / 2, h / 2, 0); right.rotation.y = -Math.PI / 2; room.add(right);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat); front.position.set(0, h / 2, d / 2); front.rotation.y = Math.PI; room.add(front);
    const exitDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(doorColor || th.fog) })); exitDoor.position.set(doorX, 1.05, d / 2 - 0.02); exitDoor.rotation.y = Math.PI; exitDoor.userData.exit = true; room.add(exitDoor);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.08), lamb('#1a1410')); frame.position.set(doorX, 1.15, d / 2 - 0.06); room.add(frame);
}
function splitWords(b, type) {
    const ds = doors.filter((d) => d.userData.door.z <= b.z0 && d.userData.door.z > b.z1).sort((x, y) => y.userData.door.z - x.userData.door.z);
    const n = Math.max(1, ds.length), k = Math.max(0, ds.indexOf(inside.door));
    const words = b.signs.filter((s) => !s.deco && !s.isProp).filter((s, i) => i % n === k);
    const fits = (s) => { const mt = propMeta(s.text); return !!mt && !!type && (mt.where.indexOf(type) >= 0 || mt.where.indexOf(ROOMX.alias[type]) >= 0); };
    const objs = words.filter(fits).sort((x, y) => (x.state === 'new') - (y.state === 'new')).slice(0, 24);
    return { objs, rest: words.filter((s) => objs.indexOf(s) < 0) };
}

// ---- генератор комнат: сетка занятости + каталог модулей мебели + свободные стены под слова ----
// Модуль строится в локальных координатах: задняя сторона у z = -d/2 (к стене), лицом к +z.
class Grid {
    constructor(w, d, cell) { this.w = w; this.d = d; this.c = cell || 0.25; this.nx = Math.ceil(w / this.c); this.nz = Math.ceil(d / this.c); this.a = new Uint8Array(this.nx * this.nz); }
    idx(x, z) { return [clamp(Math.floor((x + this.w / 2) / this.c), 0, this.nx - 1), clamp(Math.floor((z + this.d / 2) / this.c), 0, this.nz - 1)]; }
    free(x0, z0, x1, z1) { const [i0, j0] = this.idx(x0, z0), [i1, j1] = this.idx(x1, z1); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (this.a[j * this.nx + i]) return false; return true; }
    mark(x0, z0, x1, z1) { const [i0, j0] = this.idx(x0, z0), [i1, j1] = this.idx(x1, z1); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.a[j * this.nx + i] = 1; }
}
const WALL_RY = { back: 0, left: Math.PI / 2, right: -Math.PI / 2, front: Math.PI };
// пробуем поставить модуль по правилу; возвращает {x,z,ry,wall,t0,t1} или null
function placeModule(mod, grid, rnd, used) {
    const { w: W, d: D, doorX } = ROOM;
    const gap = mod.gap == null ? 0.45 : mod.gap;
    const walls = mod.walls || ['back', 'left', 'right'];
    for (let tries = 0; tries < 60; tries++) {
        let x, z, ry, wall = null, fw = mod.w, fd = mod.d, t0, t1;
        if (mod.rule === 'wall' || mod.rule === 'corner') {
            wall = walls[Math.floor(rnd() * walls.length)];
            const along = (wall === 'back' || wall === 'front') ? W : D;
            // модуль во всю стену: у боковых стен не доходит до входа на 3 м
            const len = mod.fill ? (wall === 'back' ? along - 0.4 : along - 3.2) : mod.w;
            if (len > along - 0.4) continue;
            let t = mod.fill ? (wall === 'back' ? 0 : -along / 2 + 0.2 + len / 2) : (mod.rule === 'corner' ? (rnd() < 0.5 ? -along / 2 + 0.2 + len / 2 : along / 2 - 0.2 - len / 2) : (-along / 2 + 0.3 + len / 2 + rnd() * (along - 0.6 - len)));
            if (wall === 'front' && Math.abs(t - doorX) < len / 2 + 1.0) continue; // не перекрывать вход
            ry = WALL_RY[wall];
            if (wall === 'back') { x = t; z = -D / 2 + mod.d / 2; fw = len; fd = mod.d; }
            else if (wall === 'front') { x = t; z = D / 2 - mod.d / 2; fw = len; fd = mod.d; }
            else if (wall === 'left') { x = -W / 2 + mod.d / 2; z = t; fw = mod.d; fd = len; }
            else { x = W / 2 - mod.d / 2; z = t; fw = mod.d; fd = len; }
            t0 = t - len / 2; t1 = t + len / 2;
            if (mod.fill) { mod._len = len; }
        } else if (mod.rule === 'door') {
            x = doorX + (rnd() < 0.5 ? -1 : 1) * (1.2 + rnd() * 1.2); z = D / 2 - 0.9 - rnd() * 1.2; ry = Math.PI + (rnd() - 0.5) * 0.6;
            if (Math.abs(x) > W / 2 - 0.6) continue;
        } else { // center
            x = -W / 2 + 1.3 + mod.w / 2 + rnd() * Math.max(0, W - 2.6 - mod.w); z = -D / 2 + 1.5 + mod.d / 2 + rnd() * Math.max(0, D - 4.5 - mod.d); ry = mod.rot ? (Math.floor(rnd() * 4) * Math.PI / 2) : 0;
            if (ry % Math.PI !== 0) { fw = mod.d; fd = mod.w; }
            if (z > D / 2 - 3.2 && Math.abs(x - doorX) < 2.2) continue; // проход от двери
        }
        const g0 = mod.rule === 'wall' || mod.rule === 'corner' ? 0.05 : gap;
        if (mod.high) { // висит на стене, пол не занимает — только участок стены
            if (wall && used[wall].some((u) => t0 < u[1] && t1 > u[0])) continue;
        } else {
            if (!grid.free(x - fw / 2 - gap, z - fd / 2 - gap, x + fw / 2 + gap, z + fd / 2 + gap)) continue;
            grid.mark(x - fw / 2 - g0, z - fd / 2 - g0, x + fw / 2 + g0, z + fd / 2 + g0);
        }
        if (wall && (mod.h >= 1.3 || mod.high)) used[wall].push([t0, t1]);
        return { x, z, ry, wall, t0, t1 };
    }
    return null;
}
// свободные отрезки стены (над мебелью ниже 1.3 м тоже можно вешать)
function freeWallSegments(wall, used) {
    const { w: W, d: D, doorX } = ROOM;
    const along = (wall === 'back' || wall === 'front') ? W : D;
    const occ = used[wall].slice().sort((p, q) => p[0] - q[0]);
    if (wall === 'front') occ.push([doorX - 0.8, doorX + 0.8]);
    occ.sort((p, q) => p[0] - q[0]);
    const segs = []; let cur = -along / 2 + 0.3;
    occ.forEach((o) => { if (o[0] - 0.2 > cur) segs.push([cur, o[0] - 0.2]); cur = Math.max(cur, o[1] + 0.2); });
    if (along / 2 - 0.3 > cur) segs.push([cur, along / 2 - 0.3]);
    return segs.filter((sg) => sg[1] - sg[0] > 0.5);
}
function wallPoint(wall, t, y, inset) {
    const { w: W, d: D } = ROOM; const i = inset == null ? 0.02 : inset;
    if (wall === 'back') return { x: t, y, z: -D / 2 + i, ry: 0 };
    if (wall === 'front') return { x: t, y, z: D / 2 - i, ry: Math.PI };
    if (wall === 'left') return { x: -W / 2 + i, y, z: t, ry: Math.PI / 2 };
    return { x: W / 2 - i, y, z: t, ry: -Math.PI / 2 };
}
// каталог модулей по типу комнаты. build(g, rnd, len) рисует в локальных координатах; spots — места под предметы (локальные)
function catalog(type, rnd) {
    const B = (g, sx, sy, sz, col, x, y, z, extra) => { const md = Math.min(sx, sy, sz); const m = new THREE.Mesh(md >= 0.03 ? new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(0.022, md * 0.28)) : new THREE.BoxGeometry(sx, sy, sz), lamb(col, extra)); m.position.set(x, y, z); g.add(m); return m; };
    const C = (g, r1, r2, hh, col, x, y, z, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, hh, seg || 10), lamb(col)); m.position.set(x, y, z); g.add(m); return m; };
    const bottleRow = (g, x0, y, z, n, step) => { for (let i = 0; i < n; i++) C(g, 0.045, 0.055, 0.3, ['#2a5a3a', '#6a3a1a', '#d8d0b8', '#2a3a6a', '#8a2a2a', '#c8a84a'][Math.floor(rnd() * 6)], x0 + i * step, y, z, 8); };
    const bookRow = (g, x, y0, z0, rows, n, horiz) => { for (let r = 0; r < rows; r++) for (let k = 0; k < n; k++) { const bh = 0.26 + rnd() * 0.1; const m = B(g, horiz ? 0.06 + rnd() * 0.05 : 0.22, bh, horiz ? 0.22 : 0.06 + rnd() * 0.05, ['#c84a4a', '#3a6fd9', '#d9b23a', '#2a8a5a', '#f0e8d8', '#6a3a8a'][Math.floor(rnd() * 6)], horiz ? x + k * 0.16 : x, y0 + r * 0.42 + bh / 2, horiz ? z0 : z0 + k * 0.16); } };
    const lantern = (g, x, y, z, col) => { const ln = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshBasicMaterial({ map: texLantern({ chars: [], white: false, inten: 1, dead: -1 }, true) })); ln.position.set(x, y, z); ln.scale.set(0.8, 1.1, 0.8); g.add(ln); const hl = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xff8a3a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); hl.position.copy(ln.position); hl.scale.set(1.4, 1.4, 1); g.add(hl); };
    const window_ = (g, len) => { const win = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.3, 1.3), new THREE.MeshBasicMaterial({ map: texSky() })); win.position.set(0, 1.9, 0.04); g.add(win); B(g, len - 0.1, 1.4, 0.06, '#f0ece0', 0, 1.9, 0.02); B(g, 0.05, 1.3, 0.09, '#f0ece0', 0, 1.9, 0.05); if (rnd() < 0.5) { const moon = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: 0xfff6e0 })); moon.position.set(len * 0.25, 2.3, 0.05); g.add(moon); } };
    const tv = (g, x, y, z, ry, sw) => { const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 0.56), new THREE.MeshBasicMaterial({ map: LIFE.screenTex() })); scr.position.set(x, y, z + 0.045); scr.rotation.y = ry || 0; g.add(scr); B(g, sw + 0.12, sw * 0.56 + 0.12, 0.06, '#111116', x, y, z); };

    const poster = (g, x, y, z) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.64), lamb('#ffffff', { map: texPoster(rnd) })); p.position.set(x, y, z); p.rotation.z = (rnd() - 0.5) * 0.06; g.add(p); };
    const acUnit = (g, x, y, z) => { B(g, 0.9, 0.3, 0.22, '#e8ecf0', x, y, z); B(g, 0.8, 0.04, 0.2, '#c8ccd4', x, y - 0.12, z + 0.02); for (let i = 0; i < 8; i++) B(g, 0.08, 0.02, 0.01, '#b8bcc4', x - 0.35 + i * 0.1, y - 0.1, z + 0.12); };
    const COMMON = [
        { name: 'display', rule: 'wall', walls: ['left', 'right', 'back'], w: 1.8, d: 0.5, h: 1.9, solid: true, count: [1, 2], build(g) { B(g, 1.8, 1.9, 0.04, '#4a3a2e', 0, 0.95, -0.22); B(g, 0.04, 1.9, 0.48, '#4a3a2e', -0.88, 0.95, 0); B(g, 0.04, 1.9, 0.48, '#4a3a2e', 0.88, 0.95, 0); B(g, 1.8, 0.04, 0.48, '#4a3a2e', 0, 1.88, 0); this.spots = []; for (let lv = 0; lv < 4; lv++) { B(g, 1.72, 0.03, 0.44, '#8a6a48', 0, 0.3 + lv * 0.45, 0); for (let k = 0; k < 4; k++) this.spots.push({ kind: 'table', x: -0.6 + k * 0.4, y: 0.32 + lv * 0.45, z: 0.06 }); } } },
        { name: 'posters', rule: 'wall', walls: ['left', 'right', 'front', 'back'], w: 1.3, d: 0.06, h: 0.8, high: true, count: [1, 3], build(g) { poster(g, -0.35, 1.8 + rnd() * 0.5, 0.02); poster(g, 0.3, 1.7 + rnd() * 0.5, 0.02); } },
        { name: 'ac', rule: 'wall', walls: ['left', 'right', 'back'], w: 1.0, d: 0.3, h: 0.5, high: true, count: [1, 2], build(g) { acUnit(g, 0, ROOM.h - 0.45, 0.12); } },
        { name: 'skirting', rule: 'none', build(g) { const { w, d } = ROOM; B(g, w, 0.1, 0.03, '#2a2016', 0, 0.05, -d / 2 + 0.015); B(g, w, 0.1, 0.03, '#2a2016', 0, 0.05, d / 2 - 0.015); B(g, 0.03, 0.1, d, '#2a2016', -w / 2 + 0.015, 0.05, 0); B(g, 0.03, 0.1, d, '#2a2016', w / 2 - 0.015, 0.05, 0); } },
    ];
    if (type === 'izakaya') return [...COMMON,
        { name: 'sushiCase', rule: 'wall', walls: ['back', 'left', 'right'], w: 2.0, d: 0.8, h: 1.4, solid: true, build(g, r) { B(g, 2.0, 0.9, 0.8, '#3a2a1e', 0, 0.45, 0); B(g, 1.9, 0.5, 0.6, '#cfe8ff', 0, 1.15, 0.05, { transparent: true, opacity: 0.35 }); B(g, 1.8, 0.06, 0.5, '#e8f6ff', 0, 0.94, 0.05); for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lamb(['#e06060', '#f0a070', '#f4f0e8', '#d05050'][i % 4])); f.scale.set(2.2, 0.6, 1); f.position.set(-0.75 + i * 0.3, 1.0, 0.05); g.add(f); } { const l = new THREE.PointLight(0xcfe8ff, 1.2, 3, 1.5); l.position.set(0, 1.3, 0.1); g.add(l); } this.spots = [{ kind: 'table', x: -0.8, y: 0.96, z: 0.3 }, { kind: 'table', x: 0.8, y: 0.96, z: 0.3 }]; } },
        { name: 'drinkFridge', rule: 'wall', walls: ['left', 'right', 'back'], w: 1.2, d: 0.7, h: 2.0, solid: true, build(g) { B(g, 1.2, 2.0, 0.65, '#d8dce4', 0, 1.0, 0); const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.7), lamb('#9fc8e8', { transparent: true, opacity: 0.5, emissive: new THREE.Color('#9fc8e8'), emissiveIntensity: 0.35 })); glass.position.set(0, 1.05, 0.33); g.add(glass); for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) C(g, 0.045, 0.045, 0.24, ['#2a5a3a', '#e0e0e0', '#c8a84a', '#8a2a2a'][(r + q) % 4], -0.36 + q * 0.24, 0.42 + r * 0.4, 0.2, 6); } },
        { name: 'shoji', rule: 'center', w: 2.4, d: 0.2, h: 1.9, solid: true, rot: true, build(g) { for (let k = 0; k < 2; k++) { const x = -0.6 + k * 1.2; B(g, 1.15, 0.05, 0.05, '#4a3020', x, 1.87, 0); B(g, 1.15, 0.05, 0.05, '#4a3020', x, 0.03, 0); B(g, 0.05, 1.9, 0.05, '#4a3020', x - 0.55, 0.95, 0); B(g, 0.05, 1.9, 0.05, '#4a3020', x + 0.55, 0.95, 0); B(g, 1.1, 1.85, 0.01, '#f4ecd8', x, 0.95, 0, { transparent: true, opacity: 0.9, emissive: new THREE.Color('#f4ecd8'), emissiveIntensity: 0.12 }); for (let i = 1; i < 4; i++) B(g, 1.1, 0.02, 0.03, '#4a3020', x, 0.03 + i * 0.46, 0); for (let i = 1; i < 3; i++) B(g, 0.02, 1.85, 0.03, '#4a3020', x - 0.55 + i * 0.37, 0.95, 0); } } },
        { name: 'menuBoard', rule: 'wall', walls: ['left', 'right', 'back'], w: 1.6, d: 0.06, h: 0.9, high: true, build(g) { B(g, 1.6, 0.9, 0.04, '#1a1a1e', 0, 2.2, 0.02); const c = document.createElement('canvas'); c.width = 256; c.height = 144; const cg = c.getContext('2d'); cg.fillStyle = '#1a1a1e'; cg.fillRect(0, 0, 256, 144); cg.fillStyle = 'rgba(255,255,255,0.9)'; cg.font = '700 20px ' + JP; cg.fillText('本日のおすすめ', 12, 28); cg.font = '500 15px ' + JP; ['焼き鳥  ¥180', '枝豆  ¥300', '刺身盛り  ¥980', '生ビール  ¥500', 'ハイボール  ¥420', 'おにぎり  ¥150'].forEach((t, i) => cg.fillText(t, 16 + (i % 2) * 120, 58 + Math.floor(i / 2) * 26)); const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.84), new THREE.MeshBasicMaterial({ map: makeTex(c) })); p.position.set(0, 2.2, 0.045); g.add(p); } },
        { name: 'counter', first: true, rule: 'wall', walls: ['left', 'right'], w: 7, d: 1.9, h: 1.0, fill: true, solid: true, build(g, r, len) { B(g, len, 1.0, 0.85, '#6b4a2c', 0, 0.5, -0.45); B(g, len + 0.1, 0.06, 1.0, '#8a6238', 0, 1.03, -0.45); for (let i = 0; i < Math.floor(len / 1.05); i++) { const z = 0.45, x = -len / 2 + 0.6 + i * 1.05; C(g, 0.17, 0.17, 0.08, '#3a2a1e', x, 0.62, z); C(g, 0.03, 0.03, 0.6, '#1a120c', x, 0.3, z, 6); } for (let lv = 0; lv < 3; lv++) { B(g, len - 0.6, 0.04, 0.3, '#3a2a1e', 0, 1.5 + lv * 0.45, -0.8); bottleRow(g, -len / 2 + 0.5, 1.67 + lv * 0.45, -0.8, Math.floor((len - 1) / 0.36), 0.36); } this.spots = []; for (let i = 0; i < Math.floor(len / 1.1); i++) this.spots.push({ kind: 'table', x: -len / 2 + 0.6 + i * 1.1, y: 1.06, z: -0.45 }); this.spots.push({ kind: 'seat', x: -len / 2 + 0.6, y: 0.66, z: 0.45 }); } },
        { name: 'kitchen', first: true, rule: 'wall', walls: ['back'], w: 3.4, d: 0.7, h: 2.3, solid: true, build(g, r) { const kc = document.createElement('canvas'); kc.width = 256; kc.height = 128; const kg = kc.getContext('2d'); const kgr = kg.createLinearGradient(0, 0, 0, 128); kgr.addColorStop(0, '#ffe2b0'); kgr.addColorStop(0.35, '#b8743a'); kgr.addColorStop(1, '#2a160c'); kg.fillStyle = kgr; kg.fillRect(0, 0, 256, 128); kg.fillStyle = 'rgba(0,0,0,0.45)'; for (let i = 0; i < 9; i++) kg.fillRect(14 + i * 27, 40 + (i % 2) * 10, 12, 60); const k = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.3), new THREE.MeshBasicMaterial({ map: makeTex(kc) })); k.position.set(0, 1.55, -0.33); g.add(k); B(g, 3.4, 0.08, 0.12, '#3a2416', 0, 2.24, -0.3); B(g, 3.0, 0.9, 0.5, '#5a4a40', 0, 0.45, -0.1); for (let i = 0; i < 3; i++) C(g, 0.16, 0.14, 0.18, '#8a8a94', -0.8 + i * 0.8, 0.99, -0.1, 12); for (let i = 0; i < 8; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false })); sp.userData = { kitchen: true, age: Math.random() * 3, life: 2.5 + Math.random() }; sp.position.set(0, 1.8, 0); g.add(sp); inside.steam.push(sp); } } },
        { name: 'zashiki', rule: 'center', w: 2.4, d: 2.4, h: 0.5, solid: true, count: [2, 4], build(g, r) { B(g, 2.2, 0.1, 0.9, '#2a1a10', 0, 0.3, 0); B(g, 1.3, 0.06, 0.8, '#6b4a2c', 0, 0.4, 0); [[-0.5, 0.65], [0.5, 0.65], [-0.5, -0.65], [0.5, -0.65]].forEach((q) => B(g, 0.45, 0.08, 0.45, ['#4a6a9a', '#9a4a4a', '#4a8a6a'][Math.floor(r() * 3)], q[0], 0.34, q[1])); for (let k = 0; k < 3; k++) C(g, 0.04, 0.04, 0.12, '#d8d0b8', -0.4 + k * 0.3, 0.49, -0.2, 8); this.spots = [{ kind: 'table', x: -0.3, y: 0.43, z: 0.1 }, { kind: 'table', x: 0.35, y: 0.43, z: 0.15 }]; } },
        { name: 'kegs', rule: 'door', w: 1.4, d: 0.5, h: 0.6, solid: true, build(g) { for (let i = 0; i < 3; i++) C(g, 0.2, 0.2, 0.5, '#8a8a94', -0.45 + i * 0.45, 0.25, 0, 12); } },
        { name: 'tv', rule: 'wall', walls: ['back', 'left', 'right'], w: 1.4, d: 0.1, h: 0.8, high: true, build(g) { tv(g, 0, 2.45, 0.0, 0, 1.1); } },
        { name: 'lanterns', rule: 'wall', walls: ['left', 'right', 'back'], w: 3, d: 0.5, h: 0.5, high: true, count: [2, 3], build(g) { lantern(g, -1.0, 2.5, 0.25); lantern(g, 1.0, 2.5, 0.25); } },
        { name: 'beams', rule: 'none', build(g) { const { w, d, h } = ROOM; for (let i = 0; i < Math.floor(d / 2.6); i++) B(g, w, 0.2, 0.2, '#2a1a10', 0, h - 0.1, -d / 2 + 1.3 + i * 2.6); for (let i = 0; i < Math.floor(d / 1.5); i++) { const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d0 })); bulb.position.set(-w / 2 + 1.3, h - 0.5, -d / 2 + 1.0 + i * 1.5); g.add(bulb); } } },
    ];
    if (type === 'konbini') return [...COMMON,
        { name: 'freezer', rule: 'center', w: 1.0, d: 2.0, h: 0.9, solid: true, rot: true, build(g, r) { B(g, 1.0, 0.85, 2.0, '#eef0f4', 0, 0.425, 0); B(g, 0.9, 0.03, 1.9, '#bfe0ff', 0, 0.87, 0, { transparent: true, opacity: 0.6 }); for (let i = 0; i < 10; i++) B(g, 0.2, 0.1, 0.3, ['#f0c030', '#e04040', '#3a7fe0', '#f0f0f0'][i % 4], -0.3 + (i % 3) * 0.3, 0.78, -0.75 + Math.floor(i / 3) * 0.5); } },
        { name: 'coffee', rule: 'wall', walls: ['left', 'right', 'front'], w: 0.9, d: 0.6, h: 1.8, solid: true, build(g) { B(g, 0.9, 0.9, 0.6, '#dfe3ea', 0, 0.45, 0); B(g, 0.6, 0.8, 0.45, '#2a2a32', 0, 1.3, -0.05); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb060') })); scr.position.set(0, 1.5, 0.18); g.add(scr); for (let i = 0; i < 6; i++) C(g, 0.035, 0.03, 0.09, '#f4f4f4', -0.3 + (i % 3) * 0.3, 0.95, 0.15 + Math.floor(i / 3) * 0.12, 10); } },
        { name: 'copier', rule: 'wall', walls: ['left', 'right', 'front'], w: 1.0, d: 0.7, h: 1.2, solid: true, build(g) { B(g, 1.0, 0.9, 0.7, '#c8ccd4', 0, 0.45, 0); B(g, 0.9, 0.08, 0.6, '#a8acb4', 0, 0.95, 0); B(g, 0.35, 0.03, 0.2, '#2a2a32', 0.25, 1.0, 0.15); const t = new THREE.PointLight(0x9fe0ff, 0.5, 2, 1.5); t.position.set(0, 1.05, 0); g.add(t); } },
        { name: 'bins', rule: 'door', w: 0.95, d: 0.45, h: 0.9, solid: true, build(g) { ['#2a4a7a', '#2a7a4a', '#5a5a62'].forEach((c, i) => { B(g, 0.28, 0.85, 0.4, c, -0.32 + i * 0.32, 0.425, 0); B(g, 0.3, 0.03, 0.42, '#1a1a20', -0.32 + i * 0.32, 0.86, 0); }); } },
        { name: 'aisleSigns', rule: 'none', build(g) { const { w, d, h } = ROOM; ['おにぎり', '飲み物', 'お菓子', '雑誌', '弁当'].forEach((t, i) => { const z = -d / 2 + 2 + i * ((d - 3) / 5); const c = document.createElement('canvas'); c.width = 256; c.height = 64; const cg = c.getContext('2d'); cg.fillStyle = '#2f7fe0'; cg.fillRect(0, 0, 256, 64); cg.fillStyle = '#fff'; cg.font = '700 34px ' + JP; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(t, 128, 34); const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: makeTex(c), side: THREE.DoubleSide })); p.position.set((i % 2 ? 1 : -1) * w * 0.22, h - 0.5, z); g.add(p); g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.position.x, h, z), new THREE.Vector3(p.position.x, h - 0.35, z)]), new THREE.LineBasicMaterial({ color: 0x000000 }))); }); } },
        { name: 'fridges', rule: 'wall', walls: ['back'], w: 7, d: 0.65, h: 2.3, fill: true, solid: true, build(g, r, len) { const n = Math.floor(len / 1.22); for (let k = 0; k < n; k++) { const fx = -len / 2 + 0.61 + k * 1.22; B(g, 1.1, 2.3, 0.6, '#d8dce4', fx, 1.15, 0); const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.0), lamb('#9fc8e8', { transparent: true, opacity: 0.55, emissive: new THREE.Color('#9fc8e8'), emissiveIntensity: 0.35 })); glass.position.set(fx, 1.2, 0.31); g.add(glass); for (let rr = 0; rr < 4; rr++) for (let q = 0; q < 4; q++) C(g, 0.05, 0.05, 0.22, ['#2a7fd0', '#e0e0e0', '#40b060', '#e04040'][(rr + q + k) % 4], fx - 0.33 + q * 0.22, 0.45 + rr * 0.45, 0.2, 6); } } },
        { name: 'rack', rule: 'center', w: 1.0, d: 4.2, h: 1.9, solid: true, count: [3, 5], gap: 0.6, build(g, r) { for (let lv = 0; lv < 4; lv++) { B(g, 0.9, 0.04, 4.0, '#c8cad0', 0, 0.3 + lv * 0.45, 0); for (let k = 0; k < 13; k++) { const hh = 0.18 + r() * 0.16; B(g, 0.14 + r() * 0.1, hh, 0.14 + r() * 0.1, ['#e04040', '#3a7fe0', '#f0c030', '#40b060', '#f0f0f0', '#8040c0', '#f08030'][Math.floor(r() * 7)], (r() - 0.5) * 0.55, 0.32 + lv * 0.45 + hh / 2, -1.85 + k * 0.3); } } B(g, 0.9, 1.9, 0.04, '#c8cad0', 0, 0.95, -2.0); B(g, 0.9, 1.9, 0.04, '#c8cad0', 0, 0.95, 2.0); this.spots = []; for (let k = 0; k < 3; k++) this.spots.push({ kind: 'table', x: 0, y: 1.67, z: -1.3 + k * 1.3, price: true }); } },
        { name: 'register', first: true, rule: 'wall', walls: ['left', 'right'], w: 2.4, d: 1.4, h: 1.4, solid: true, build(g0) { const g = new THREE.Group(); g.position.z = 0.36; g0.add(g); B(g, 2.2, 0.95, 0.65, '#dfe3ea', 0, 0.475, 0); B(g, 0.4, 0.3, 0.35, '#2a2a32', 0.6, 1.1, 0); B(g, 0.6, 0.35, 0.45, '#8a8a94', -0.6, 1.12, 0); B(g, 0.5, 0.25, 0.35, '#c8a84a', -0.6, 1.42, 0, { transparent: true, opacity: 0.6 }); for (let i = 0; i < 4; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false })); sp.userData = { kitchen: true, age: Math.random() * 3, life: 2.2 + Math.random() }; sp.position.set(-0.6, 1.6, 0); g.add(sp); inside.steam.push(sp); } this.spots = [{ kind: 'table', x: 0, y: 0.95, z: 0.36, price: true }]; } },
        { name: 'magazines', rule: 'wall', walls: ['left', 'right', 'front'], w: 3.2, d: 0.5, h: 1.5, solid: true, build(g) { B(g, 3.2, 1.5, 0.3, '#c8cad0', 0, 0.75, -0.1); this.mag = []; for (let lv = 0; lv < 4; lv++) for (let k = 0; k < 12; k++) this.mag.push({ x: -1.45 + k * 0.26, y: 0.35 + lv * 0.36, z: 0.1 }); } },
        { name: 'atm', rule: 'corner', walls: ['left', 'right', 'front'], w: 0.7, d: 0.6, h: 1.6, solid: true, build(g) { B(g, 0.7, 1.6, 0.6, '#2a3a5a', 0, 0.8, 0); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd8ff') })); scr.position.set(0, 1.2, 0.31); g.add(scr); } },
        { name: 'baskets', rule: 'door', w: 0.8, d: 0.6, h: 0.6, solid: true, build(g, r) { B(g, 0.8, 0.5, 0.6, '#2a2a32', 0, 0.25, 0); for (let k = 0; k < 6; k++) B(g, 0.15, 0.1, 0.15, ['#e04040', '#f0c030', '#40b060'][k % 3], -0.25 + (k % 3) * 0.25, 0.55, -0.1 + Math.floor(k / 3) * 0.2); } },
        { name: 'lights', rule: 'none', build(g) { const { w, d, h } = ROOM; for (let z = -d / 2 + 1.8; z < d / 2 - 1; z += 4.6) for (let x = -w / 2 + 1.9; x < w / 2 - 1; x += 3.8) { const l = new THREE.PointLight(0xf4f8ff, 2.0, 10, 1.2); l.position.set(x, h - 0.3, z); g.add(l); B(g, 1.2, 0.05, 0.18, '#ffffff', x, h - 0.04, z, { emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.5 }); } g.add(new THREE.AmbientLight(0xf0f6ff, 0.55)); } },
    ];
    if (type === 'class') return [...COMMON,
        { name: 'cabinet', rule: 'wall', walls: ['left', 'right', 'front'], w: 1.4, d: 0.5, h: 2.0, solid: true, build(g, r) { B(g, 1.4, 2.0, 0.5, '#8a6a48', 0, 1.0, 0); for (let lv = 0; lv < 3; lv++) { B(g, 1.2, 0.03, 0.4, '#a88060', 0, 0.5 + lv * 0.5, 0); for (let k = 0; k < 3; k++) { if (lv === 2) { C(g, 0.05, 0.03, 0.14, '#e8c860', -0.4 + k * 0.4, 0.6 + lv * 0.5, 0.05, 10); C(g, 0.07, 0.05, 0.03, '#2a2a30', -0.4 + k * 0.4, 0.52 + lv * 0.5, 0.05, 10); } else B(g, 0.22, 0.3, 0.06, ['#c84a4a', '#3a6fd9', '#2a8a5a'][(k + lv) % 3], -0.4 + k * 0.4, 0.66 + lv * 0.5, 0.05); } } B(g, 1.3, 1.9, 0.01, '#cfe8ff', 0, 1.0, 0.26, { transparent: true, opacity: 0.25 }); } },
        { name: 'piano', rule: 'wall', walls: ['left', 'right'], w: 1.5, d: 0.65, h: 1.3, solid: true, build(g) { B(g, 1.5, 1.25, 0.6, '#1a1a1e', 0, 0.625, -0.05); B(g, 1.4, 0.06, 0.3, '#f4f4f4', 0, 0.8, 0.25); for (let i = 0; i < 25; i++) if (i % 7 !== 2 && i % 7 !== 6) B(g, 0.03, 0.05, 0.18, '#111', -0.65 + i * 0.054, 0.845, 0.2); B(g, 0.7, 0.08, 0.3, '#3a2a1e', 0, 0.5, 0.65); [[-0.3, 0.55], [0.3, 0.55], [-0.3, 0.75], [0.3, 0.75]].forEach((p) => C(g, 0.02, 0.02, 0.46, '#3a2a1e', p[0], 0.23, p[1], 6)); } },
        { name: 'clock', rule: 'wall', walls: ['back', 'left', 'right'], w: 0.7, d: 0.1, h: 0.7, high: true, build(g) { const c = PROP_BUILDERS['時計'](lamb); c.scale.setScalar(0.9); c.position.y = 0.3; g.add(c); } },
        { name: 'board', first: true, rule: 'wall', walls: ['back'], w: 5.2, d: 0.12, h: 2.7, solid: false, build(g) { this.boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.5), lamb('#ffffff', { map: null })); this.boardMesh.position.set(0, 1.8, 0.055); this.boardMesh.userData.board = true; g.add(this.boardMesh); B(g, 5.15, 2.65, 0.06, '#5a3a22', 0, 1.8, 0.0); B(g, 5.0, 0.05, 0.12, '#4a3020', 0, 0.52, 0.1); for (let k = 0; k < 5; k++) B(g, 0.08, 0.02, 0.02, k % 2 ? '#ffffff' : '#ffd34a', -2.0 + k * 0.3, 0.56, 0.1); } },
        { name: 'teacher', rule: 'center', w: 1.9, d: 1.4, h: 0.8, solid: true, nearBack: true, build(g) { B(g, 1.8, 0.08, 0.75, '#8a6a48', 0, 0.78, -0.2); C(g, 0.06, 0.08, 0.04, '#2a2a30', 0.6, 0.84, -0.3, 10); C(g, 0.015, 0.015, 0.2, '#8a8a94', 0.6, 0.95, -0.3, 6); const gl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), lamb('#3a7fd0')); gl.position.set(0.6, 1.08, -0.3); g.add(gl); const land = new THREE.Mesh(new THREE.SphereGeometry(0.132, 16, 12), lamb('#4aa050', { transparent: true, opacity: 0.6 })); land.scale.set(0.7, 1, 0.9); land.position.copy(gl.position); g.add(land); B(g, 0.3, 0.03, 0.22, '#f4efe0', -0.5, 0.84, -0.1); B(g, 0.06, 0.12, 0.06, '#c84a4a', -0.1, 0.88, -0.35); [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]].forEach((p) => B(g, 0.05, 0.76, 0.05, '#3a3a40', p[0], 0.38, -0.2 + p[1])); B(g, 0.5, 0.9, 0.5, '#5a5a62', 0, 0.45, 0.45); this.spots = [{ kind: 'table', x: 0, y: 0.82, z: -0.2 }]; } },
        (() => { const cols = Math.max(2, Math.min(4, Math.floor((ROOM.w - 2.8) / 1.8))), rows = Math.max(3, Math.min(5, Math.floor((ROOM.d - 5.5) / 1.5))); return { name: 'desks', first: true, rule: 'center', w: cols * 1.8 - 0.2, d: rows * 1.5 - 0.2, h: 0.8, solid: true, build(g, r) { this.spots = []; for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) { const x = -(cols - 1) * 0.9 + c * 1.8, z = -(rows - 1) * 0.75 + rr * 1.5;
            B(g, 0.95, 0.05, 0.6, '#c8a878', x, 0.72, z); B(g, 0.95, 0.12, 0.6, '#9a8060', x, 0.63, z);
            [[-0.42, -0.25], [0.42, -0.25], [-0.42, 0.25], [0.42, 0.25]].forEach((p) => C(g, 0.02, 0.02, 0.7, '#5a5a62', x + p[0], 0.35, z + p[1], 6));
            B(g, 0.42, 0.04, 0.4, '#8a6a48', x, 0.45, z + 0.58); B(g, 0.42, 0.42, 0.04, '#8a6a48', x, 0.68, z + 0.78); [[-0.18, 0.4], [0.18, 0.4], [-0.18, 0.76], [0.18, 0.76]].forEach((p) => C(g, 0.015, 0.015, 0.45, '#5a5a62', x + p[0], 0.22, z + p[1], 5));
            if (r() < 0.5) B(g, 0.25, 0.03, 0.2, ['#f4efe0', '#c84a4a', '#3a6fd9'][Math.floor(r() * 3)], x + (r() - 0.5) * 0.4, 0.76, z);
            if (r() < 0.3) { B(g, 0.3, 0.2, 0.12, ['#c84a4a', '#3a6fd9', '#2a2a30'][Math.floor(r() * 3)], x + 0.5, 0.1, z + 0.3); }
            this.spots.push({ kind: 'table', x, y: 0.75, z });
        } } }; })(),
        { name: 'lockers', rule: 'wall', walls: ['front', 'left', 'right'], w: 3.0, d: 0.45, h: 1.8, solid: true, build(g) { for (let k = 0; k < 6; k++) B(g, 0.45, 1.8, 0.45, k % 2 ? '#8aa0b8' : '#9ab0c8', -1.25 + k * 0.5, 0.9, 0); } },
        { name: 'bookshelf', rule: 'wall', walls: ['left', 'right'], w: 1.6, d: 0.35, h: 2.2, solid: true, build(g, r) { B(g, 1.6, 2.2, 0.35, '#5a3a22', 0, 1.1, 0); bookRow(g, -0.7, 0.25, 0.08, 5, 9, true); this.spots = [{ kind: 'table', x: 0, y: 2.22, z: 0 }]; } },
        { name: 'window', rule: 'wall', walls: ['left', 'right'], w: 2.1, d: 0.1, h: 0.5, high: true, count: [1, 2], build(g) { window_(g, 2.1); } },
        { name: 'plant', rule: 'corner', walls: ['left', 'right', 'back'], w: 0.7, d: 0.7, h: 1.6, solid: true, build(g) { const t = PROP_BUILDERS['木'](lamb); t.scale.setScalar(0.9); g.add(t); } },
        { name: 'lights', rule: 'none', build(g) { const { w, d, h } = ROOM; for (let z = -d / 2 + 1.8; z < d / 2 - 1; z += 4.6) for (let x = -w / 2 + 1.9; x < w / 2 - 1; x += 3.8) { const l = new THREE.PointLight(0xfff6e0, 2.2, 10, 1.3); l.position.set(x, h - 0.3, z); g.add(l); B(g, 1.2, 0.05, 0.16, '#fff8e8', x, h - 0.04, z, { emissive: new THREE.Color(0xfff8e8), emissiveIntensity: 0.5 }); } g.add(new THREE.AmbientLight(0xfff4e0, 0.4)); } },
    ];
    const X = ROOMX.catalog(type, { B, C, bookRow, lantern, window_, tv, poster, acUnit, COMMON, rnd }); if (X) return X.filter(Boolean);
    return [...COMMON, // home
        { name: 'genkan', rule: 'door', w: 1.6, d: 0.9, h: 0.5, solid: true, build(g) { B(g, 1.6, 0.12, 0.9, '#8a7a68', 0, 0.06, 0); B(g, 0.7, 0.45, 0.35, '#5a3a22', -0.4, 0.34, -0.2); B(g, 0.65, 0.02, 0.32, '#8a6a48', -0.4, 0.3, -0.2); for (let i = 0; i < 3; i++) { const sh = PROP_BUILDERS['靴'] ? PROP_BUILDERS['靴'](lamb) : null; if (sh) { sh.scale.setScalar(0.8); sh.position.set(0.1 + i * 0.3, 0.12, 0.1); g.add(sh); } } } },
        { name: 'wardrobe', rule: 'wall', walls: ['left', 'right', 'back'], w: 1.2, d: 0.6, h: 2.2, solid: true, build(g) { B(g, 1.2, 2.2, 0.6, '#d8c8a8', 0, 1.1, 0); B(g, 0.02, 2.0, 0.02, '#b8a888', 0, 1.1, 0.31); C(g, 0.015, 0.015, 0.12, '#8a8a94', -0.08, 1.1, 0.33, 6, Math.PI / 2); C(g, 0.015, 0.015, 0.12, '#8a8a94', 0.08, 1.1, 0.33, 6, Math.PI / 2); } },
        { name: 'desk', rule: 'wall', walls: ['left', 'right', 'back'], w: 1.4, d: 0.75, h: 1.4, solid: true, build(g) { B(g, 1.3, 0.05, 0.65, '#c8a878', 0, 0.73, 0); [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]].forEach((p) => B(g, 0.05, 0.72, 0.05, '#3a3a40', p[0], 0.36, p[1])); B(g, 0.45, 0.04, 0.4, '#5a5a62', 0, 0.45, 0.7); B(g, 0.45, 0.45, 0.04, '#5a5a62', 0, 0.7, 0.9); C(g, 0.02, 0.02, 0.45, '#3a3a40', 0, 0.22, 0.7, 6); B(g, 0.35, 0.02, 0.25, '#2a2a30', -0.2, 0.76, 0); B(g, 0.35, 0.22, 0.01, '#2a2a30', -0.2, 0.87, -0.12); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.19), new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fb8ff') })); scr.position.set(-0.2, 0.87, -0.113); g.add(scr); C(g, 0.015, 0.015, 0.4, '#2a2a30', 0.45, 0.95, -0.2, 6); C(g, 0.1, 0.06, 0.12, '#f0dcb8', 0.45, 1.15, -0.2, 12); const l = new THREE.PointLight(0xffe0b0, 1.2, 3, 1.5); l.position.set(0.45, 1.1, -0.1); g.add(l); this.spots = [{ kind: 'table', x: 0.2, y: 0.76, z: 0.1 }]; } },
        { name: 'laundry', rule: 'center', w: 1.3, d: 0.7, h: 1.7, solid: true, rot: true, build(g, r) { B(g, 1.2, 0.03, 0.03, '#8a8a94', 0, 1.6, 0); [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]].forEach((p) => C(g, 0.015, 0.015, 1.6, '#8a8a94', p[0], 0.8, p[1], 6)); for (let i = 0; i < 4; i++) { const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.5 + r() * 0.3), lamb(['#e8e8f0', '#9ab8e8', '#f0c8d0', '#d8e8c0'][i], { side: THREE.DoubleSide })); cl.position.set(-0.45 + i * 0.3, 1.3, 0); g.add(cl); } } },
        { name: 'rug', rule: 'center', w: 2.2, d: 1.6, h: 0.02, solid: false, build(g, r) { B(g, 2.2, 0.02, 1.6, ['#8a3a3a', '#3a5a8a', '#6a6a3a'][Math.floor(r() * 3)], 0, 0.01, 0); B(g, 2.0, 0.025, 1.4, ['#a85a5a', '#5a7aaa', '#8a8a5a'][Math.floor(r() * 3)], 0, 0.012, 0); } },
        { name: 'bathDoor', rule: 'wall', walls: ['left', 'right', 'back'], w: 1.0, d: 0.1, h: 2.1, high: true, build(g) { B(g, 0.9, 2.0, 0.06, '#e8e4d8', 0, 1.0, 0.03); B(g, 1.0, 2.1, 0.03, '#b8a888', 0, 1.05, 0.0); C(g, 0.02, 0.02, 0.12, '#8a8a94', 0.3, 1.0, 0.08, 6, Math.PI / 2); const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshBasicMaterial({ map: texPlaque('湯') })); p.position.set(0, 1.6, 0.065); g.add(p); } },
        { name: 'trinkets', rule: 'wall', walls: ['left', 'right', 'back'], w: 1.2, d: 0.3, h: 0.4, high: true, build(g, r) { B(g, 1.2, 0.03, 0.25, '#5a3a22', 0, 1.9, 0.12); for (let i = 0; i < 5; i++) { if (i % 2) C(g, 0.03, 0.04, 0.12, ['#c8a84a', '#8a2a2a', '#2a5a8a'][i % 3], -0.45 + i * 0.22, 1.97, 0.12, 8); else { const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lamb(['#f0d8c0', '#4aa050'][i % 2])); s2.position.set(-0.45 + i * 0.22, 1.97, 0.12); g.add(s2); } } } },
        { name: 'kitchen', rule: 'wall', walls: ['back', 'left', 'right'], w: 3.6, d: 0.65, h: 2.0, solid: true, build(g, r) { B(g, 2.6, 0.9, 0.6, '#d8d4cc', -0.5, 0.45, 0); B(g, 2.6, 0.05, 0.62, '#8a8a94', -0.5, 0.92, 0); B(g, 0.5, 0.06, 0.4, '#a8acb4', -1.1, 0.95, 0); C(g, 0.015, 0.015, 0.3, '#a8acb4', -1.1, 1.1, -0.2, 6); B(g, 0.55, 0.06, 0.45, '#2a2a32', 0.1, 0.95, 0); [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.1], [0.12, 0.1]].forEach((p) => C(g, 0.07, 0.07, 0.02, '#1a1a20', 0.1 + p[0], 0.99, p[1], 10)); C(g, 0.13, 0.12, 0.14, '#8a8a94', 0.1, 1.07, 0, 12); B(g, 0.65, 1.6, 0.65, '#e8ecf0', 1.45, 0.8, 0.0); B(g, 0.02, 0.5, 0.04, '#8a8a94', 1.15, 1.1, 0.34); B(g, 2.0, 0.04, 0.3, '#5a3a22', -0.5, 1.9, -0.15); for (let k = 0; k < 7; k++) C(g, 0.05, 0.06, 0.16 + r() * 0.12, ['#f0e8d8', '#c8a84a', '#2a5a3a', '#8a2a2a'][k % 4], -1.4 + k * 0.28, 2.0, -0.15, 8); this.spots = [{ kind: 'table', x: -0.5, y: 0.95, z: 0.05 }]; this.notes = [{ x: 1.32, y: 1.36, z: 0.335 }, { x: 1.58, y: 1.28, z: 0.335 }, { x: 1.4, y: 1.04, z: 0.335 }]; } },
        { name: 'kotatsu', first: true, rule: 'center', w: 2.6, d: 2.2, h: 0.45, solid: true, build(g, r) { B(g, 1.6, 0.06, 1.0, '#6a4a2c', 0, 0.38, 0); B(g, 2.0, 0.02, 1.4, '#b8402a', 0, 0.33, 0); [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]].forEach((p) => B(g, 0.06, 0.36, 0.06, '#4a3020', p[0], 0.18, p[1])); [[0, 1.0], [0, -1.0], [1.2, 0], [-1.2, 0]].forEach((p) => B(g, 0.5, 0.1, 0.5, ['#4a6a9a', '#9a4a4a', '#4a8a6a', '#9a8a4a'][Math.floor(r() * 4)], p[0], 0.05, p[1])); for (let k = 0; k < 2; k++) C(g, 0.04, 0.035, 0.1, '#d8d0b8', -0.3 + k * 0.5, 0.46, -0.1, 8); this.spots = []; for (let k = 0; k < 4; k++) this.spots.push({ kind: 'table', x: -0.55 + k * 0.37, y: 0.41, z: k % 2 ? 0.25 : -0.25 }); } },
        { name: 'tv', rule: 'wall', walls: ['back', 'left', 'right'], w: 1.7, d: 0.5, h: 1.4, solid: true, build(g) { B(g, 1.6, 0.5, 0.45, '#5a3a22', 0, 0.25, 0); tv(g, 0, 0.95, -0.05, 0, 1.2); this.spots = [{ kind: 'table', x: 0.6, y: 0.5, z: 0.1 }]; } },
        { name: 'bookshelf', rule: 'wall', walls: ['left', 'right', 'back'], w: 1.6, d: 0.35, h: 2.2, solid: true, build(g, r) { B(g, 1.6, 2.2, 0.35, '#5a3a22', 0, 1.1, 0); bookRow(g, -0.7, 0.25, 0.08, 5, 9, true); this.spots = [{ kind: 'table', x: 0, y: 2.22, z: 0 }]; } },
        { name: 'futon', rule: 'corner', walls: ['left', 'right', 'back'], w: 2.2, d: 1.2, h: 0.3, solid: false, build(g) { B(g, 2.1, 0.18, 1.1, '#e8e4d8', 0, 0.09, 0); B(g, 0.35, 0.12, 0.5, '#d0d8e8', -0.8, 0.24, 0); B(g, 1.4, 0.1, 1.1, '#6a7aa8', 0.3, 0.23, 0); this.spots = [{ kind: 'seat', x: 0.2, y: 0.28, z: 0 }]; } },
        { name: 'closet', rule: 'wall', walls: ['left', 'right'], w: 1.0, d: 0.6, h: 1.1, solid: true, build(g) { B(g, 1.0, 1.1, 0.6, '#d8c8a8', 0, 0.55, 0); for (let k = 0; k < 3; k++) B(g, 0.9, 0.26, 0.02, '#b8a888', 0, 0.2 + k * 0.33, 0.31); this.spots = [{ kind: 'table', x: 0, y: 1.12, z: 0 }]; } },
        { name: 'window', rule: 'wall', walls: ['front', 'left', 'right'], w: 2.3, d: 0.1, h: 0.5, high: true, build(g) { window_(g, 2.3); B(g, 0.5, 1.9, 0.08, '#c8a888', -1.35, 1.9, 0.06); B(g, 0.5, 1.9, 0.08, '#c8a888', 1.35, 1.9, 0.06); } },
        { name: 'plant', rule: 'corner', walls: ['left', 'right', 'front'], w: 0.7, d: 0.7, h: 1.4, solid: true, build(g) { const t = PROP_BUILDERS['木'](lamb); t.scale.setScalar(0.8); g.add(t); } },
        { name: 'lights', rule: 'none', build(g) { const { w, d, h } = ROOM; const lamp = new THREE.PointLight(0xffd9a0, 2.6, 11, 1.4); lamp.position.set(0, h - 0.6, -0.8); g.add(lamp); const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 12, 1, true), lamb('#f0dcb8', { side: THREE.DoubleSide, emissive: new THREE.Color('#ffe0b0'), emissiveIntensity: 0.45 })); shade.position.set(0, h - 0.6, -0.8); g.add(shade); const l2 = new THREE.PointLight(0xffe8c0, 1.6, 8, 1.4); l2.position.set(-w / 2 + 1.5, h - 0.5, -d / 2 + 1.5); g.add(l2); const l3 = new THREE.PointLight(0xffd0a0, 1.2, 7, 1.4); l3.position.set(w / 2 - 1.5, 1.2, d / 2 - 2); g.add(l3); g.add(new THREE.AmbientLight(0xffe8d0, 0.4)); } },
    ];
}
const ROOM_SHELLS = {
    izakaya: () => { const wood = texWood('#5a3b22', 8); wood.repeat.set(3, 1); const woodF = texWood('#2b1b10', 10); woodF.repeat.set(4, 6); roomShell(lamb('#ffffff', { map: wood }), lamb('#ffffff', { map: woodF }), '#1a120c'); const nr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: texNorenPlain('#1d2a5c'), side: THREE.DoubleSide, transparent: true })); nr.position.set(ROOM.doorX, 1.85, ROOM.d / 2 - 0.16); nr.rotation.y = Math.PI; room.add(nr); room.add(new THREE.AmbientLight(0xffe0c0, 0.75)); for (let z = -ROOM.d / 2 + 2.0; z < ROOM.d / 2 - 1; z += 4.6) for (let x = -ROOM.w / 2 + 1.9; x < ROOM.w / 2 - 1; x += 3.8) { const l = new THREE.PointLight(0xffd9a0, 3.2, 11, 1.4); l.position.set(x, ROOM.h - 0.6, z); room.add(l); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d0 })); bulb.position.set(x, ROOM.h - 0.45, z); room.add(bulb); } },
    konbini: () => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#e4e6ea'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; [[1, 1], [65, 65], [65, 1], [1, 65]].forEach((p) => g.strokeRect(p[0], p[1], 62, 62)); const t = makeTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ROOM.w, ROOM.d); roomShell(lamb('#eef0f4'), lamb('#ffffff', { map: t }), '#f4f6fa', '#dfefff'); },
    class: () => { roomShell(lamb('#e8e2d0'), lamb('#b9a98a'), '#f0ece0', '#f4e8c8'); },
    home: () => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#9aa06a'; g.fillRect(0, 0, 256, 128); for (let y = 0; y < 128; y += 3) { g.fillStyle = 'rgba(0,0,0,' + (y % 6 ? 0.06 : 0.12) + ')'; g.fillRect(0, y, 256, 1); } g.fillStyle = '#2a2a24'; g.fillRect(0, 0, 256, 6); g.fillRect(0, 122, 256, 6); const t = makeTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ROOM.w / 2, ROOM.d / 2); roomShell(lamb('#e6dcc4'), lamb('#ffffff', { map: t }), '#d8ccb4', '#3a2a1a'); },
};
Object.assign(ROOM_SHELLS, ROOMX.shells);
function buildRoom(b, color, type) {
    clearRoom();
    type = type || 'izakaya';
    const rnd = mulberry32(hashStr(b.q.name + type + (b.qi || 0)) + (inside.door ? Math.round(inside.door.userData.door.z * 10) : 0));
    // размер комнаты — свой у каждой двери
    ROOM.w = 7.0 + Math.floor(rnd() * 5) * 0.8; ROOM.d = 10 + Math.floor(rnd() * 6) * 1.0; ROOM.h = 3.0 + Math.floor(rnd() * 3) * 0.2; if (ROOMX.size[type]) Object.assign(ROOM, ROOMX.size[type](rnd)); if (ROOMX.size[type]) Object.assign(ROOM, ROOMX.size[type](rnd)); ROOM.doorX = Math.min(1.4, ROOM.w / 2 - 1.2);
    const { objs, rest: restAll } = splitWords(b, type);
    // на листочках/доске/ценниках — не больше 12 слов, выборка стабильна для комнаты
    const rest = restAll.slice().sort(() => rnd() - 0.5).slice(0, 12);
    ROOM_SHELLS[type]();
    const grid = new Grid(ROOM.w, ROOM.d);
    grid.mark(ROOM.doorX - 1.4, ROOM.d / 2 - 2.6, ROOM.doorX + 1.4, ROOM.d / 2); // зона входа всегда свободна
    const used = { back: [], left: [], right: [], front: [] };
    const spots = [], placed = [];
    const mods = catalog(type, rnd).sort((p, q) => (q.first ? 1 : 0) - (p.first ? 1 : 0));
    let boardMod = null, magMod = null, noteSpots = [];
    mods.forEach((mod) => {
        const n = mod.count ? mod.count[0] + Math.floor(rnd() * (mod.count[1] - mod.count[0] + 1)) : 1;
        for (let k = 0; k < n; k++) {
            const m = Object.assign({}, mod);
            const g = new THREE.Group();
            let pos = { x: 0, z: 0, ry: 0 };
            if (m.rule !== 'none') { pos = placeModule(m, grid, rnd, used); if (!pos) continue; }
            m.build(g, rnd, m._len);
            g.position.set(pos.x, 0, pos.z); g.rotation.y = pos.ry; room.add(g); g.updateMatrixWorld(true);
            g.userData.mod = m.name; m._grp = g; if (m.solid) addCollider(g, colliders.room, 0.25);
            (m.spots || []).forEach((sp) => { const v = new THREE.Vector3(sp.x, sp.y, sp.z).applyMatrix4(g.matrixWorld); spots.push({ kind: sp.kind, x: v.x, y: v.y, z: v.z, ry: pos.ry + (sp.ry || 0), price: sp.price }); });
            if (m.boardMesh) boardMod = m;
            if (m.mag) { magMod = m; m._g = g; }
            if (m.notes) m.notes.forEach((p) => { const v = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(g.matrixWorld); noteSpots.push({ x: v.x, y: v.y, z: v.z, ry: pos.ry }); });
            placed.push(m);
        }
    });
    // места у двери и на стенах для предметов
    spots.push({ kind: 'door', x: ROOM.doorX - 1.0, y: 0, z: ROOM.d / 2 - 0.6, ry: 0 });
    ['left', 'right', 'back', 'front'].forEach((wall) => freeWallSegments(wall, used).forEach((sg) => { const p = wallPoint(wall, (sg[0] + sg[1]) / 2, 0, 0.05); spots.push({ kind: 'wall', x: p.x, y: 0, z: p.z, ry: p.ry }); for (let t = sg[0] + 0.5; t < sg[1] - 0.4; t += 1.1) { const q = wallPoint(wall, t, 0, 0.55); spots.push({ kind: 'floor', x: q.x, y: 0, z: q.z, ry: q.ry }); } }));
    // слова без предмета — на поверхности типа комнаты по свободным стенам
    let wi = 0;
    const surfaceOn = (wall, y, step, make) => { freeWallSegments(wall, used).forEach((sg) => { for (let t = sg[0] + step / 2; t < sg[1] - step / 2 && wi < rest.length; t += step) { const sgn = rest[wi++]; const p = wallPoint(wall, t, y, 0.02); const m = make(sgn); m.position.set(p.x, p.y, p.z); m.rotation.y = p.ry; m.rotation.z = (hashStr(sgn.text) % 7 - 3) * 0.01; m.userData.sign = sgn; room.add(m); sgn.strip = m; inside.strips.push(m); } }); };
    const stp = ROOMX.surf[type] || type;
    if (stp === 'izakaya') {
        const geo = new THREE.PlaneGeometry(0.19, 0.74);
        ['right', 'back', 'left', 'front'].forEach((wl) => { surfaceOn(wl, 2.4, 0.42, (sg) => new THREE.Mesh(geo, lamb('#ffffff', { map: texStrip(sg) }))); });
        ['right', 'left'].forEach((wl) => { surfaceOn(wl, 1.55, 0.42, (sg) => new THREE.Mesh(geo, lamb('#ffffff', { map: texStrip(sg) }))); });
    } else if (stp === 'konbini') {
        if (magMod) magMod.mag.forEach((p) => { if (wi >= rest.length) return; const sg = rest[wi++]; const m = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), lamb('#ffffff', { map: texMagazine(sg) })); m.position.set(p.x, p.y, p.z); m.rotation.x = -0.25; m.userData.sign = sg; magMod._g.add(m); sg.strip = m; });
        ['front', 'left', 'right'].forEach((wl) => { surfaceOn(wl, 2.3, 0.5, (sg) => new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.56), lamb('#ffffff', { map: texWordPoster(sg) }))); surfaceOn(wl, 1.65, 0.5, (sg) => new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.56), lamb('#ffffff', { map: texWordPoster(sg) }))); });
    } else if (stp === 'class') {
        const onBoard = rest.slice(0, 16); wi = Math.min(16, rest.length);
        if (boardMod) { const t = texBlackboard(onBoard); boardMod.boardMesh.material.map = t; boardMod.boardMesh.material.emissive = new THREE.Color(0xffffff); boardMod.boardMesh.material.emissiveMap = t; boardMod.boardMesh.material.emissiveIntensity = 0.25; boardMod.boardMesh.material.needsUpdate = true; onBoard.forEach((sg, i) => { const hit = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(-2.25 + (i % 4) * 1.15, 2.5 - Math.floor(i / 4) * 0.45, 0.06); hit.userData.sign = sg; boardMod.boardMesh.parent.add(hit); }); }
        ['left', 'right', 'front'].forEach((wl) => { surfaceOn(wl, 2.2, 0.33, (sg) => new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), lamb('#ffffff', { map: texNote(sg) }))); surfaceOn(wl, 1.85, 0.33, (sg) => new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), lamb('#ffffff', { map: texNote(sg) }))); });
    } else {
        noteSpots.forEach((p) => { if (wi >= rest.length) return; const sg = rest[wi++]; const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), lamb('#ffffff', { map: texNote(sg) })); m.position.set(p.x, p.y, p.z); m.rotation.y = p.ry; m.userData.sign = sg; room.add(m); sg.strip = m; });
        ['left', 'right', 'back', 'front'].forEach((wl) => { for (let r = 0; r < 3; r++) surfaceOn(wl, 2.35 - r * 0.3, 0.3, (sg) => new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), lamb('#ffffff', { map: texNote(sg) }))); });
    }
    LIFE.populate(type, placed, grid, hashStr(b.q.name + type + 'life') + (inside.door ? Math.round(inside.door.userData.door.z * 10) : 0));
    LIFE.upgradeMaterials(room, type);
    mergeStatic(room);
    // предметы-слова по местам; в комбини — с ценником
    const free = spots.slice();
    objs.forEach((sg) => { for (let i = 0; i < free.length; i++) { const sp = free[i]; if (placeObject(sg, sp)) { if (sp.price) { const tg = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), lamb('#ffffff', { map: texPrice(sg), side: THREE.DoubleSide })); const off = new THREE.Vector3(0.46, -0.1, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), sp.ry); tg.position.set(sp.x + off.x, sp.y - 0.1, sp.z + off.z); tg.rotation.y = sp.ry + Math.PI / 2; tg.userData.sign = sg; room.add(tg); } free.splice(i, 1); break; } } });
    radio.g = null; if (RADIO_ROOMS.has(type)) placeRadio(free);
    LIFE.upgradeMaterials(room, type);
}
// ретро-радиоприёмник: тап переключает станцию (вариант музыки); мигающая лампочка — без текстовых подсказок
function placeRadio(free) {
    const sp = free.find((s) => s.kind === 'table') || free.find((s) => s.kind === 'wall' || s.kind === 'door');
    if (!sp) return;
    const g = new THREE.Group(); g.userData.radio = true;
    const B = (sx, sy, sz, col, x, y, z, basic) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), basic ? new THREE.MeshBasicMaterial({ color: new THREE.Color(col) }) : lamb(col)); m.position.set(x, y, z); m.userData.radio = true; g.add(m); return m; };
    B(0.34, 0.2, 0.13, '#6a4024', 0, 0.1, 0); B(0.32, 0.03, 0.12, '#4a2c18', 0, 0.215, 0);
    const gc = document.createElement('canvas'); gc.width = 64; gc.height = 64; const gg = gc.getContext('2d'); gg.fillStyle = '#2a2018'; gg.fillRect(0, 0, 64, 64); gg.strokeStyle = 'rgba(200,170,120,0.55)'; gg.lineWidth = 2; for (let y = 6; y < 64; y += 6) { gg.beginPath(); gg.moveTo(4, y); gg.lineTo(60, y); gg.stroke(); }
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), lamb('#ffffff', { map: makeTex(gc) })); grille.position.set(-0.08, 0.1, 0.066); grille.userData.radio = true; g.add(grille);
    const dial = B(0.12, 0.05, 0.005, '#ffb04a', 0.09, 0.14, 0.066, true);
    const needle = B(0.004, 0.045, 0.006, '#2a1a10', 0.09, 0.14, 0.07, true);
    [0.06, 0.12].forEach((x) => { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12), lamb('#e8dcc0')); k.rotation.x = Math.PI / 2; k.position.set(x, 0.065, 0.072); k.userData.radio = true; g.add(k); });
    const led = B(0.014, 0.014, 0.006, '#ff5a3a', 0.15, 0.185, 0.066, true);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.28, 4), lamb('#c8ccd4')); ant.position.set(0.13, 0.33, -0.03); ant.rotation.z = -0.4; g.add(ant);
    g.position.set(sp.x, sp.y, sp.z); g.rotation.y = sp.ry; g.scale.setScalar(sp.kind === 'table' ? 1.4 : 2);
    g.userData.keep = true; room.add(g); g.traverse((o) => { o.userData.keep = true; });
    radio.g = g; radio.led = led; radio.needle = needle; roomHover = [];
}
const radio = { g: null, led: null, needle: null };
const RADIO_ROOMS = new Set(['home', 'oneroom', 'washitsu', 'loft', 'izakaya', 'ramen', 'cafe']); // в комбини, классе, книжном и игровом зале радио нет
function radioNext() { const v = audio.nextStation(); toast('📻 ' + (STATION_NAMES[v] || v)); document.querySelectorAll('#panel [data-music]').forEach((x) => x.classList.toggle('on', x.dataset.music === v)); if (radio.needle) radio.needle.position.x = 0.04 + (audio.stationIndex() / 9) * 0.1; }
const STATION_NAMES = { city: 'Ночной город', snow: 'Снег над крышами', train: 'Ночной поезд', tea: 'Чайный дом', stars: 'Звёзды', harbor: 'Гавань', radio: 'Радио за стеной', calm: 'Тихий вечер', lane: 'Переулок', lofi: 'Lo-fi' };
let fading = false;
function enterRoom(door) {
    if (fading || inside.on) return;
    const b = blocks[blockAt(door.userData.door.z)];
    buildRoom(b, door.userData.door.color, door.userData.door.type);
    inside.on = true; inside.block = b; inside.door = door;
    inside.saved = { pos: camera.position.clone(), yaw, pitch };
    fade(() => {
        world.visible = false; signsGroup.visible = false; if (rain) rain.visible = false; room.visible = true;
        bloom.strength = 0.22; bloom.threshold = 0.92; hemi.intensity = 0.25;
        scene.fog = new THREE.FogExp2(new THREE.Color('#3a2414'), 0.06); scene.background = new THREE.Color('#1a120c');
        LIFE.onEnter();
        camera.position.set(ROOM.doorX - 0.5, 1.6, ROOM.d / 2 - 1.1); yaw = tYaw = 0.1;
        // если спавн всё же внутри мебели — отступаем к двери
        for (let tries = 0; tries < 6; tries++) { const c = camera.position; if (!colliders.room.some((b) => c.x > b.x0 && c.x < b.x1 && c.z > b.z0 && c.z < b.z1)) break; camera.position.z += 0.25; camera.position.x += (tries % 2 ? 0.3 : -0.3); } pitch = tPitch = 0.04; vel.set(0, 0, 0); if (gyro) gyro.base = null; audio.setScene("inside");
        document.getElementById('exit').hidden = false; autoWalk = false; hideHint();
        { const [jp, ru] = String(ROOM_NAMES[door.userData.door.type] || '').split(' · '); banner(jp || '', (ru || '') + ' · ' + b.q.name); }
    });
}
function exitRoom() {
    if (!inside.on || fading) return;
    inside.on = false;
    fade(() => {
        room.visible = false; world.visible = true; signsGroup.visible = true; if (rain) rain.visible = opts.rain; LIFE.onExit();
        bloom.strength = 0.7; bloom.threshold = 0.7; hemi.intensity = 0.55;
        useTheme(themeAt(inside.door.userData.door.z)); scene.fog = new THREE.FogExp2(new THREE.Color(th.fog), th.fogD); scene.background = new THREE.Color(th.sky);
        const d = inside.door.userData.door;
        camera.position.set(d.side * ((d.w2 || W2) - 1.3), 1.6, d.z); yaw = tYaw = d.side > 0 ? Math.PI / 2 : -Math.PI / 2; pitch = tPitch = 0; vel.set(0, 0, 0); inside.lastExit = performance.now(); { const tj = THEME_JP[th.id] || ['', '']; banner(tj[0], d && inside.block ? inside.block.q.name : tj[1]); } if (gyro) gyro.base = null; audio.setScene(th.id);
        document.getElementById('exit').hidden = true; hideHint();
    });
}
let fadeT = 0;
function fade(mid) { const el = document.getElementById('fade'); fading = true; el.classList.add('on'); clearTimeout(fadeT); fadeT = setTimeout(() => { mid(); setTimeout(() => { el.classList.remove('on'); fading = false; }, 60); }, 320); }
document.getElementById('exit').addEventListener('click', exitRoom);

// ---- дождь и пар ----
let rain = null; const _fogC = new THREE.Color();
function buildRain() {
    if (rain) { scene.remove(rain); rain.geometry.dispose(); rain = null; }
    const n = LOW ? 600 : 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 14; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * 24; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rain = new THREE.Points(geo, new THREE.PointsMaterial({ map: streakTex, size: 0.16, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    rain.frustumCulled = false; scene.add(rain);
}
const steam = [];
function buildSteam() {
    for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1;
        for (let k = 0; k < 6; k++) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }));
            sp.userData = { side, vent: i, age: Math.random() * 3, life: 2.6 + Math.random(), dx: (Math.random() - 0.5) * 0.4 };
            scene.add(sp); steam.push(sp);
        }
    }
}


// ---- звук на Web Audio, без файлов: четыре варианта на выбор (настройки → «Музыка») ----
// city — «Ночной город»: редкие колокольчики ветра, тихий дождь, изредка далёкий аккорд. Почти фон.
// calm — «Тихий вечер»: мягкий мажорный аккорд, голоса дышат, иногда музыкальная шкатулка.
// lane — «Переулок»: короткие фразы кото в японском мажорном ладу (ё-сэн), фурин, сверчки на Ёкотё.
// lofi — тёплый lo-fi трек (ниже подробнее).
// Настоящая музыка, а не эмбиент: мажорные джазовые аккорды (Cmaj9 · Am9 · Dm9 · G13) на электропиано,
// мягкие барабаны со свингом, бас, сочинённые мелодии по мажорной пентатонике. Ноты ставятся по часам
// AudioContext с упреждением (не по setInterval — тот плавает, и ритм «расползается»).
// Синдзюку — э-пиано и тихий дождь; Ёкотё — мелодия на кото; в комнате — тот же трек приглушённо, «из колонки».
const audio = (() => {
    let ctx = null, master = null, bus = null, tone = null, enabled = settings.music2 !== false, sceneId = null, nodes = [], timer = 0, motionGain = null;
    const VARIANTS = ['city', 'snow', 'train', 'tea', 'stars', 'harbor', 'radio', 'calm', 'lane', 'lofi'];
    let variant = VARIANTS.includes(settings.musicVar) ? settings.musicVar : 'radio'; // по умолчанию — «Радио за стеной» (выбор пользователя)
    const btn = document.getElementById('music');
    let noiseBuf = null, verb = null;
    function getVerb(c) {
        if (verb && verb.c === c) return verb.input;
        const chans = LOW ? 1 : 2, len = Math.floor(c.sampleRate * (LOW ? 1.3 : 2.6)), ir = c.createBuffer(chans, len, c.sampleRate);
        for (let ch = 0; ch < chans; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
        const conv = c.createConvolver(); conv.buffer = ir; const wet = c.createGain(); wet.gain.value = 0.16; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
        conv.connect(lp); lp.connect(wet); wet.connect(master); verb = { c, input: conv }; return conv;
    }
    function getNoise(c) { if (noiseBuf) return noiseBuf; const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return (noiseBuf = b); }
    function loopNoise(c, type, freq, q, gain, dest) { const src = c.createBufferSource(); src.buffer = getNoise(c); src.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = gain; src.connect(f); f.connect(g); g.connect(dest || master); src.start(); return { src, f, g }; }
    function env(c, g, when, a, peak, dec, sus, rel, dur) { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(peak, when + a); g.gain.setTargetAtTime(peak * sus, when + a, dec); g.gain.setTargetAtTime(0.0001, when + dur, rel); }
    // электропиано: FM (несущая + модулятор 1:1, индекс быстро гаснет — мягкий «тук» в атаке, потом тёплый тон)
    function keys(c, f, when, dur, vel, dest) {
        const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
        car.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 1.6, when); mg.gain.setTargetAtTime(f * 0.15, when, 0.12);
        mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(dest);
        env(c, g, when, 0.006, vel, 0.5, 0.35, 0.25, dur);
        car.start(when); mod.start(when); car.stop(when + dur + 1.2); mod.stop(when + dur + 1.2);
    }
    function koto(c, f, when, vel, dest) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 6, when); lp.frequency.exponentialRampToValueAtTime(f * 1.3, when + 0.9);
        const g = c.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel, when + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, when + 1.4);
        o.connect(lp); lp.connect(g); g.connect(dest); o.start(when); o.stop(when + 1.5);
    }
    // колокольчик ветра: чистые гармоники (без неровных обертонов — они и звучат тревожно), долгий хвост
    function chime(c, f, when, vel, dest, soft) {
        const g = c.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel, when + (soft ? 0.012 : 0.003)); g.gain.exponentialRampToValueAtTime(0.0001, when + (soft ? 2.6 : 3.2)); g.connect(dest);
        [[1, 1], [2, 0.22], [3, 0.06]].forEach(([h, a]) => { const o = c.createOscillator(); o.frequency.value = f * h; const hg = c.createGain(); hg.gain.value = a; o.connect(hg); hg.connect(g); o.start(when); o.stop(when + 3.3); });
    }
    function musicBox(c, f, when, vel, dest) {
        const g = c.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + 1.8); g.connect(dest);
        [[1, 1], [4, 0.12]].forEach(([h, a]) => { const o = c.createOscillator(); o.frequency.value = f * h; const hg = c.createGain(); hg.gain.value = a; o.connect(hg); hg.connect(g); o.start(when); o.stop(when + 1.9); });
    }
    // голос аккорда: плавно входит и выходит, высота не скользит
    function voice(c, f, when, dur, vel, dest) {
        const o = c.createOscillator(), o2 = c.createOscillator(); o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2; const g2 = c.createGain(); g2.gain.value = 0.08;
        const g = c.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel, when + 3.5); g.gain.setValueAtTime(vel, when + dur - 4); g.gain.linearRampToValueAtTime(0, when + dur);
        o.connect(g); o2.connect(g2); g2.connect(g); g.connect(dest); o.start(when); o2.start(when); o.stop(when + dur + 0.1); o2.stop(when + dur + 0.1);
    }
    function flute(c, f, when, dur, vel, dest) {
        const o = c.createOscillator(); o.frequency.value = f; const vib = c.createOscillator(); vib.frequency.value = 4.8; const vg = c.createGain(); vg.gain.setValueAtTime(0, when); vg.gain.linearRampToValueAtTime(f * 0.004, when + 0.8); vib.connect(vg); vg.connect(o.frequency);
        const g = c.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel, when + 0.18); g.gain.setValueAtTime(vel, when + Math.max(0.2, dur - 0.4)); g.gain.linearRampToValueAtTime(0, when + dur);
        const br = c.createBufferSource(); br.buffer = getNoise(c); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 6; const bg = c.createGain(); bg.gain.value = 0.25;
        o.connect(g); br.connect(bp); bp.connect(bg); bg.connect(g); g.connect(dest); o.start(when); vib.start(when); br.start(when, Math.random()); o.stop(when + dur + 0.1); vib.stop(when + dur + 0.1); br.stop(when + dur + 0.1);
    }
    function tick(c, when, vel, dest) { const s = c.createBufferSource(); s.buffer = getNoise(c); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.2; const g = c.createGain(); g.gain.setValueAtTime(vel, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06); s.connect(bp); bp.connect(g); g.connect(dest); s.start(when, Math.random()); s.stop(when + 0.07); }
    function bass(c, f, when, dur, vel, dest) {
        const o = c.createOscillator(), o2 = c.createOscillator(); o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f;
        const g2 = c.createGain(); g2.gain.value = 0.35; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; const g = c.createGain();
        o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(dest); env(c, g, when, 0.01, vel, 0.25, 0.6, 0.08, dur);
        o.start(when); o2.start(when); o.stop(when + dur + 0.5); o2.stop(when + dur + 0.5);
    }
    function kick(c, when, vel, dest) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.13); g.gain.setValueAtTime(vel, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.38); o.connect(g); g.connect(dest); o.start(when); o.stop(when + 0.4); }
    function snare(c, when, vel, dest) {
        const s = c.createBufferSource(); s.buffer = getNoise(c); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7; const g = c.createGain(); g.gain.setValueAtTime(vel, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.2); s.connect(bp); bp.connect(g); g.connect(dest); s.start(when, Math.random()); s.stop(when + 0.22);
        const o = c.createOscillator(), og = c.createGain(); o.frequency.value = 190; og.gain.setValueAtTime(vel * 0.5, when); og.gain.exponentialRampToValueAtTime(0.0001, when + 0.09); o.connect(og); og.connect(dest); o.start(when); o.stop(when + 0.1);
    }
    function hat(c, when, vel, dest) { const s = c.createBufferSource(); s.buffer = getNoise(c); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500; const g = c.createGain(); g.gain.setValueAtTime(vel, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045); s.connect(hp); hp.connect(g); g.connect(dest); s.start(when, Math.random()); s.stop(when + 0.05); }
    function crackle(c, when, dest) { const s = c.createBufferSource(); s.buffer = getNoise(c); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; const g = c.createGain(); g.gain.setValueAtTime(0.02 + Math.random() * 0.03, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.008); s.connect(hp); hp.connect(g); g.connect(dest); s.start(when, Math.random()); s.stop(when + 0.01); }

    // ---- ноты и партии ----
    const N = { G2: 98, A2: 110, C3: 130.8, D3: 146.8, E3: 164.8, F3: 174.6, G3: 196, A3: 220, B3: 246.9, C4: 261.6, D4: 293.7, E4: 329.6, G4: 392, A4: 440, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880 };
    // Cmaj9 · Am9 · Dm9 · G13 — I–vi–ii–V, тёплый мажор; голоса ведутся плавно, без скольжения высоты
    const CHORDS = [
        { bass: N.C3, keys: [N.E3, N.G3, N.B3, N.D4] },
        { bass: N.A2, keys: [N.G3, N.B3, N.C4, N.E4] },
        { bass: N.D3, keys: [N.F3, N.A3, N.C4, N.E4] },
        { bass: N.G2, keys: [N.F3, N.A3, N.B3, N.E4] },
    ];
    // мелодии на два такта (шаг — шестнадцатая): [шаг, нота, длина в шагах]
    const PHRASES = [
        [[0, 'E5', 2], [2, 'G5', 2], [4, 'A5', 4], [8, 'G5', 2], [10, 'E5', 2], [12, 'D5', 4], [16, 'C5', 2], [18, 'D5', 2], [20, 'E5', 6], [28, 'G4', 4]],
        [[0, 'A5', 2], [2, 'G5', 2], [4, 'E5', 2], [6, 'D5', 2], [8, 'E5', 6], [16, 'C5', 2], [18, 'E5', 2], [20, 'G5', 2], [22, 'A5', 2], [24, 'G5', 8]],
        [[2, 'C5', 2], [4, 'D5', 2], [6, 'E5', 4], [12, 'G5', 4], [18, 'E5', 2], [20, 'D5', 2], [22, 'C5', 2], [24, 'A4', 4], [28, 'C5', 4]],
        [[0, 'G5', 3], [3, 'E5', 3], [6, 'D5', 2], [8, 'C5', 4], [14, 'D5', 2], [16, 'E5', 4], [20, 'G5', 2], [22, 'E5', 2], [24, 'D5', 8]],
    ];
    const KEYS_HITS = [[0, 1, 10], [6, 0.55, 3], [10, 0.7, 5]];  // шаг, громкость, длина (комп э-пиано в такте)
    const BASS_HITS = [[0, 1, 5], [7, 0.7, 2], [10, 0.85, 4], [14, 0.5, 2]];
    const KICK = [0, 7, 10], KICK_B = [0, 3, 10];
    const BPM = 84, S16 = 60 / BPM / 4, SWING = 0.18;

    let ambTimer = 0, ambNodes = [];
    // фон улицы под тему: гомон, тайко и фейерверки на Мацури, звон посуды на Ёкотё, ветер, сверчки и колокол у храма
    function stopAmb() { clearInterval(ambTimer); ambNodes.forEach((n) => { try { n.src && n.src.stop(); n.o && n.o.stop(); n.g && n.g.disconnect(); } catch (e) { /* уже остановлен */ } }); ambNodes = []; }
    function ambience(c, id) {
        if (id === 'inside') return;
        const amb = c.createGain(); amb.gain.value = 1; amb.connect(master); ambNodes.push({ g: amb });
        if (id === 'shinjuku') { const r = loopNoise(c, 'bandpass', 1300, 0.4, 0.012, amb); const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 3200; r.g.disconnect(); r.g.connect(rl); rl.connect(amb); ambNodes.push(r); return; } // дождь
        const murmur = (freq, gain) => { const n = loopNoise(c, 'bandpass', freq, 0.9, gain, amb); const lf = c.createOscillator(); lf.frequency.value = 0.11 + Math.random() * 0.08; const lg = c.createGain(); lg.gain.value = gain * 0.5; lf.connect(lg); lg.connect(n.g.gain); lf.start(); ambNodes.push(n, { o: lf }); };
        const ping = (f, when, vel, dec) => { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(vel, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dec); o.connect(g); g.connect(amb); o.start(when); o.stop(when + dec + 0.05); };
        const drum = (when, vel) => { const o = c.createOscillator(); o.frequency.setValueAtTime(95, when); o.frequency.exponentialRampToValueAtTime(52, when + 0.25); const g = c.createGain(); g.gain.setValueAtTime(vel, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.8); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; o.connect(g); g.connect(lp); lp.connect(amb); o.start(when); o.stop(when + 0.85); };
        if (id === 'matsuri') {
            murmur(380, 0.007); murmur(950, 0.0035);
            const pattern = [0, 0.42, 0.84, 1.05, 1.26, 2.1]; // дон дон доко дон … дон
            ambTimer = setInterval(() => { if (!ctx || ctx.state !== 'running') return; const w = c.currentTime + 0.1; if (Math.random() < 0.09) pattern.forEach((dt, i) => drum(w + dt, i === 5 ? 0.06 : 0.042)); if (Math.random() < 0.06) ping(3200 + Math.random() * 900, w + Math.random() * 0.3, 0.004, 0.3); }, 700);
        } else if (id === 'yokocho') {
            murmur(500, 0.006); murmur(1200, 0.0025);
            ambTimer = setInterval(() => { if (!ctx || ctx.state !== 'running') return; const w = c.currentTime + 0.1; if (Math.random() < 0.18) { const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { const f = 2400 + Math.random() * 1600; ping(f, w + i * 0.09, 0.006, 0.22); ping(f * 1.52, w + i * 0.09, 0.002, 0.18); } } }, 600);
        } else if (id === 'sando') {
            const wind = loopNoise(c, 'lowpass', 380, 0.5, 0.008, amb); const lf = c.createOscillator(); lf.frequency.value = 0.06; const lg = c.createGain(); lg.gain.value = 0.006; lf.connect(lg); lg.connect(wind.g.gain); lf.start(); ambNodes.push(wind, { o: lf });
            const cr = loopNoise(c, 'bandpass', 4300, 14, 0.003, amb); const cl = c.createOscillator(); cl.type = 'square'; cl.frequency.value = 7.5; const cg = c.createGain(); cg.gain.value = 0.003; cl.connect(cg); cg.connect(cr.g.gain); cl.start(); ambNodes.push(cr, { o: cl });
            let nextBell = c.currentTime + 6;
            ambTimer = setInterval(() => { if (!ctx || ctx.state !== 'running') return; const w = c.currentTime + 0.1;
                if (w > nextBell) { nextBell = w + 35 + Math.random() * 25; [[196, 0.012], [392.4, 0.006], [588.6, 0.003]].forEach(([f, v]) => { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(v, w + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, w + 7); o.connect(g); g.connect(amb); o.start(w); o.stop(w + 7.1); }); }
                if (Math.random() < 0.025) for (let i = 0; i < 6; i++) ping(4200 + Math.random() * 1400, w + i * 0.05 + Math.random() * 0.04, 0.0025, 0.25); // сузу у храма
            }, 800);
        }
    }
    function start(id) {
        if (!ctx || !enabled) return;
        stop(); sceneId = id;
        const c = ctx, t0 = c.currentTime + 0.1;
        const room = id === 'inside';
        // общая шина: мягкий lo-fi срез верхов; в комнате — сильнее, будто из колонки за стенкой
        bus = c.createGain(); bus.gain.value = room ? 0.8 : 1; tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = room ? 1500 : 5200; tone.Q.value = 0.4; bus.connect(tone); tone.connect(master);
        const keysBus = c.createGain(); keysBus.gain.value = 0.055; const klp = c.createBiquadFilter(); klp.type = 'lowpass'; klp.frequency.value = 2400; keysBus.connect(klp); klp.connect(bus);
        const melBus = c.createGain(); melBus.gain.value = id === 'yokocho' ? 0.07 : 0.04; melBus.connect(bus);
        const drumBus = c.createGain(); drumBus.gain.value = room ? 0.5 : 0.75; drumBus.connect(bus);
        const bassBus = c.createGain(); bassBus.gain.value = 0.12; bassBus.connect(bus);
        // фон: на Синдзюку тихий дождь, больше никакого гула
        ambience(c, id);
        let step = 0, next = t0;
        // ---- спокойные варианты ----
        const PENTA_HI = [1046.5, 1174.7, 1318.5, 1568, 1760]; // до-мажорная пентатоника, 6-я октава
        const YO = [293.7, 329.6, 392, 440, 493.9, 587.3, 659.3, 784]; // ё-сэн (японский мажорный лад)
        const CALM = [[N.C4, N.E4, N.G4, N.A4, N.D5], [174.6, N.A3, N.C4, N.D4, N.G4], [N.A3, N.C4, N.E4, N.G4, N.B3 * 2], [N.G3, N.B3, N.D4, N.E4, N.A4]];
        const softBus = c.createGain(); softBus.gain.value = 1; softBus.connect(bus);
        if (variant === 'lane' && id === 'yokocho') { const cr = loopNoise(c, 'bandpass', 4300, 14, 0.0035, softBus); const lf = c.createOscillator(); lf.type = 'square'; lf.frequency.value = 7.5; const lg = c.createGain(); lg.gain.value = 0.0035; lf.connect(lg); lg.connect(cr.g.gain); lf.start(); nodes.push(cr, { o: lf }); }
        let lanePos = 3;
        // светлые аккорды без больших септим (они и давали тревогу): C6/9 · Am7 · F6/9 · G6 — корень, квинта и три верхних звука
        const CITY = [
            { low: [N.C3, N.G3], up: [N.E4, N.A4, N.D5] },
            { low: [N.A2, N.E3], up: [N.C4, N.G4, N.E5] },
            { low: [87.3, N.C3], up: [N.A3, N.D4, N.G4] },
            { low: [N.G2, N.D3], up: [N.B3, N.E4, N.G4] },
        ];
        const cityBus = c.createGain(); cityBus.gain.value = 1; cityBus.connect(bus); if (!['radio', 'lofi', 'calm', 'lane'].includes(variant)) { const send = c.createGain(); send.gain.value = 0.7; cityBus.connect(send); klp.connect(send); send.connect(getVerb(c)); }
        let chimeAt = 0;
        const playCity = (s, when) => {
            const ci = Math.floor(s / 64) % CITY.length, ch = CITY[ci];
            if (s % 64 === 0) {
                // подложка: еле слышный тёплый фундамент, аккорды внахлёст, высота не скользит
                ch.low.forEach((f, i) => voice(c, f, when + i * 0.6, 15, i ? 0.0075 : 0.0095, cityBus));
                ch.up.forEach((f, i) => voice(c, f, when + 1 + i * 0.5, 14, 0.0038, cityBus));
                if (Math.random() < 0.55) ch.up.forEach((f, i) => keys(c, f, when + 1.5 + i * 0.05, 3, 0.55, keysBus)); // далёкий аккорд э-пиано — не каждый раз
            }
            // колокольчики: из звуков текущего аккорда, на октаву выше, короткий плавный жест вверх или вниз
            if (s > chimeAt && Math.random() < 0.05) {
                const pool = ch.up.map((f) => f * 2).concat(ch.low.map((f) => f * 4)).sort((a, b) => a - b), n = 1 + Math.floor(Math.random() * 3);
                let k = Math.floor(Math.random() * pool.length); const dir = Math.random() < 0.5 ? 1 : -1;
                for (let i = 0; i < n; i++) { chime(c, pool[Math.max(0, Math.min(pool.length - 1, k))], when + i * (0.2 + Math.random() * 0.12), 0.055, cityBus, true); k += dir; }
                chimeAt = s + 6; // не чаще, чем раз в ~1 с
            }
        };
        const playCalm = (s, when) => {
            if (s % 64 === 0) CALM[Math.floor(s / 64) % CALM.length].forEach((f, i) => voice(c, f, when + i * 0.4, 14, 0.022, softBus)); // аккорды внахлёст, каждые ~11 с
            if (Math.random() < 0.02) { const ch = CALM[Math.floor(s / 64) % CALM.length]; musicBox(c, ch[Math.floor(Math.random() * ch.length)] * 2, when, 0.02, softBus); }
        };
        const playLane = (s, when) => {
            if (s % 48 === 0 || (s % 48 === 24 && Math.random() < 0.4)) { // короткая фраза кото: ходит по соседним ступеням, последняя нота длиннее
                const len = 3 + Math.floor(Math.random() * 3);
                for (let i = 0; i < len; i++) { lanePos = Math.max(0, Math.min(YO.length - 1, lanePos + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.25 ? 2 : 1))); koto(c, YO[lanePos], when + i * S16 * 2 + (i === len - 1 ? S16 : 0), 0.8, melBus); }
            }
            if (Math.random() < 0.006) chime(c, 2637, when, 0.025, softBus); // фурин
        };
        const playLofi = (s, when) => {
            const bar = Math.floor(s / 16), st = s % 16, ch = CHORDS[bar % 4];
            const section = bar < 4 ? 'intro' : ((bar - 4) % 16 < 8 ? 'groove' : 'melody');
            KEYS_HITS.forEach(([k, v, len]) => { if (st === k && !(section === 'intro' && k !== 0)) ch.keys.forEach((f, i) => keys(c, f, when + i * 0.012, len * S16, v * (0.9 + Math.random() * 0.15), keysBus)); });
            if (section !== 'intro') {
                BASS_HITS.forEach(([k, v, len]) => { if (st === k) bass(c, k === 10 && bar % 2 ? ch.bass * 1.5 : ch.bass, when, len * S16, v, bassBus); });
                if ((bar % 2 ? KICK_B : KICK).includes(st)) kick(c, when, 0.55, drumBus);
                if (st === 4 || st === 12) snare(c, when, 0.13, drumBus);
                if (st % 2 === 0 && variant !== 'radio') hat(c, when, st % 4 === 2 ? 0.07 : 0.035, drumBus);
                if (st === 15 && bar % 4 === 3) hat(c, when, 0.05, drumBus);
            }
            if (section === 'melody') {
                const ph = PHRASES[Math.floor((bar - 4) / 2) % PHRASES.length], ps = (bar % 2) * 16 + st;
                ph.forEach(([k, n, len]) => { if (k === ps) { if (id === 'yokocho') koto(c, N[n], when, 0.9, melBus); else keys(c, N[n], when, len * S16, 0.9, melBus); } });
            }
            if (Math.random() < (variant === 'radio' ? 0.45 : 0.18)) crackle(c, when + Math.random() * S16, bus);
        };
        // ---- ещё шесть вариантов в духе «Ночного города»: общая тёплая подложка и пространство ----
        const bed = (ch, when, k) => { ch.low.forEach((f, i) => voice(c, f, when + i * 0.6, 15, (i ? 0.0075 : 0.0095) * k, cityBus)); ch.up.forEach((f, i) => voice(c, f, when + 1 + i * 0.5, 14, 0.0038 * k, cityBus)); };
        // «Снег над крышами»: медленные нисходящие арпеджио челесты над Fadd9 · Cadd9 · Dm7 · B♭add9
        const SNOW = [{ low: [87.3, N.C3], up: [N.A3, N.C4, N.G4] }, { low: [N.C3, N.G3], up: [N.E4, N.G4, N.D5] }, { low: [N.D3, N.A3], up: [349.2, N.A4, N.C5] }, { low: [116.5, 174.6], up: [N.D4, 349.2, N.C5] }];
        const playSnow = (s, when) => {
            const ch = SNOW[Math.floor(s / 64) % 4]; if (s % 64 === 0) bed(ch, when, 1.1);
            if (s % 24 === 4 && Math.random() < 0.8) { const ns = ch.up.slice().reverse().map((f) => f * 2); if (Math.random() < 0.5) ns.push(ns[1]); ns.forEach((f, i) => musicBox(c, f, when + i * S16 * 2.2, 0.052, cityBus)); }
        };
        // «Ночной поезд»: тихий перестук колёс, аккорд раз в такт, мягкий бас — движение без барабанов
        const playTrain = (s, when) => {
            const ch = CITY[Math.floor(s / 64) % 4], st = s % 16; if (s % 64 === 0) bed(ch, when, 0.8);
            if (st === 0 || st === 3 || st === 8 || st === 11) tick(c, when, st === 0 || st === 8 ? 0.018 : 0.011, cityBus);
            if (st === 0) { ch.up.forEach((f, i) => keys(c, f, when + i * 0.02, 6 * S16, 0.2, keysBus)); bass(c, ch.low[0], when, 6 * S16, 0.32, bassBus); }
            if (st === 8 && Math.random() < 0.6) bass(c, ch.low[1], when, 4 * S16, 0.24, bassBus);
            if (Math.random() < 0.012) chime(c, ch.up[Math.floor(Math.random() * 3)] * 2, when, 0.04, cityBus, true);
        };
        // «Чайный дом»: долгие ноты бамбуковой флейты в ё-сэн и редкие щипки кото
        let teaPos = 4;
        const playTea = (s, when) => {
            const ch = CITY[Math.floor(s / 64) % 4]; if (s % 64 === 0) bed(ch, when, 0.75);
            if (s % 32 === 0 && Math.random() < 0.85) { let t = 0; const n = 2 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) { teaPos = Math.max(1, Math.min(YO.length - 2, teaPos + (Math.random() < 0.5 ? -1 : 1))); const d = (6 + Math.floor(Math.random() * 5)) * S16; flute(c, YO[teaPos], when + t, d, 0.04, cityBus); t += d + S16; } }
            if (Math.random() < 0.025) koto(c, YO[Math.floor(Math.random() * 5)], when, 0.5, melBus);
        };
        // «Звёзды»: колыбельная — музыкальная шкатулка перебирает аккорд над тёплым фоном
        const ARP = [0, 1, 2, 3, 2, 1];
        const playStars = (s, when) => {
            const ch = CITY[Math.floor(s / 64) % 4]; if (s % 64 === 0) bed(ch, when, 0.95);
            if (s % 4 === 0) { const notes = [ch.low[0] * 4, ch.up[0] * 2, ch.up[1] * 2, ch.up[2] * 2]; musicBox(c, notes[ARP[(s / 4) % ARP.length]], when, (s / 4) % 6 === 0 ? 0.05 : 0.034, cityBus); }
        };
        // «Гавань»: мягкий прибой, далёкий колокол в такт аккорду, редкие колокольчики
        if (variant === 'harbor') [[0.07, 0.019], [0.045, 0.015]].forEach(([rate, depth]) => { const w = loopNoise(c, 'lowpass', 520, 0.4, depth * 1.2, cityBus); const lf = c.createOscillator(); lf.frequency.value = rate; const lg = c.createGain(); lg.gain.value = depth; lf.connect(lg); lg.connect(w.g.gain); lf.start(); nodes.push(w, { o: lf }); });
        const playHarbor = (s, when) => {
            const ch = CITY[Math.floor(s / 64) % 4]; if (s % 64 === 0) { bed(ch, when, 1.05); if (Math.random() < 0.7) { chime(c, ch.low[0] * 2, when + 0.5, 0.075, cityBus, true); chime(c, ch.low[1] * 2, when + 1.1, 0.055, cityBus, true); } }
            if (Math.random() < 0.012) chime(c, ch.up[Math.floor(Math.random() * 3)] * 2, when, 0.035, cityBus, true);
        };
        if (variant === 'radio') { tone.frequency.value = 850; drumBus.gain.value = 0.4; bus.gain.value = 0.28; }
        const play = { city: playCity, snow: playSnow, train: playTrain, tea: playTea, stars: playStars, harbor: playHarbor, radio: playLofi, calm: playCalm, lane: playLane, lofi: playLofi }[variant] || playCity;
        if (variant === 'lane') melBus.gain.value = 0.15;
        timer = setInterval(() => { if (next < c.currentTime) next = c.currentTime + 0.05; while (next < c.currentTime + (LOW ? 0.6 : 0.25)) { play(step, next + (step % 2 ? S16 * SWING : 0)); next += S16; step++; } }, 25);
        // шагов нет — пользователь попросил убрать звук ходьбы
        master.gain.cancelScheduledValues(t0); master.gain.setValueAtTime(0, t0); master.gain.linearRampToValueAtTime(0.85, t0 + 2.5);
    }
    function stop() { clearInterval(timer); stopAmb(); nodes.forEach((n) => { try { n.src && n.src.stop(); n.o && n.o.stop(); } catch (e) { /* уже остановлен */ } }); nodes = []; if (bus) { try { bus.disconnect(); } catch (e) { /* ok */ } bus = null; } }
    return {
        resume() { if (!enabled) return; if (!ctx) { try { const AC = window.AudioContext || window.webkitAudioContext; try { ctx = new AC({ latencyHint: 'playback' }); } catch (e) { ctx = new AC(); } master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); ctx.onstatechange = () => { if (ctx.state === 'running' && enabled) start(sceneId || (inside.on ? 'inside' : th.id)); }; } catch (e) { return; } start(inside.on ? 'inside' : th.id); }
            if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) { /* нет жеста — ждём следующего */ } } },
        setScene(id) { if (!ctx || !enabled || id === sceneId) return; if (sceneId && sceneId !== 'inside' && id !== 'inside' && ctx.state === 'running') { stopAmb(); ambience(ctx, id); sceneId = id; } else start(id); },
        get variant() { return variant; },
        boom() {
            if (!ctx || ctx.state !== 'running' || !enabled || sceneId !== 'matsuri') return; const c = ctx, w = c.currentTime + 0.35;
            const s = c.createBufferSource(); s.buffer = getNoise(c); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; const g = c.createGain(); g.gain.setValueAtTime(0.0001, w); g.gain.linearRampToValueAtTime(0.09, w + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, w + 1.4); s.connect(lp); lp.connect(g); g.connect(master); s.start(w, Math.random()); s.stop(w + 1.5);
            for (let i = 0; i < 14; i++) { const t = w + 0.4 + Math.random() * 0.9; const n = c.createBufferSource(); n.buffer = getNoise(c); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000; const ng = c.createGain(); ng.gain.setValueAtTime(0.006, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03); n.connect(hp); hp.connect(ng); ng.connect(master); n.start(t, Math.random()); n.stop(t + 0.04); }
        },
        stationIndex() { return VARIANTS.indexOf(variant); },
        nextStation() {
            const v = VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length];
            if (ctx && master) { const w = ctx.currentTime; const s = ctx.createBufferSource(); s.buffer = getNoise(ctx); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, w); bp.frequency.exponentialRampToValueAtTime(2600, w + 0.35); bp.Q.value = 2; const g = ctx.createGain(); g.gain.setValueAtTime(0.05, w); g.gain.exponentialRampToValueAtTime(0.0001, w + 0.4); s.connect(bp); bp.connect(g); g.connect(ctx.destination); s.start(w, Math.random()); s.stop(w + 0.42); }
            this.setVariant(v); return v;
        },
        setVariant(v) { if (!VARIANTS.includes(v)) return; variant = v; saveSet({ musicVar: v }); if (!enabled) { enabled = true; saveSet({ music2: true }); btn.classList.add('on'); } if (ctx) start(sceneId || (inside.on ? 'inside' : th.id)); else this.resume(); },
        setMotion(k) { if (motionGain && ctx) { motionGain._lfo.gain.setTargetAtTime(Math.min(1, k) * 0.04, ctx.currentTime, 0.1); } },
        ding() { if (!ctx || !enabled || !master) return; const w = ctx.currentTime; [N.C5, N.E5, N.G5, 1046.5].forEach((f, i) => keys(ctx, f, w + i * 0.08, 0.6, 0.05, master)); },
        toggle() { enabled = !enabled; saveSet({ music2: enabled }); btn.classList.toggle('on', enabled); if (!enabled) { stop(); if (ctx) ctx.suspend(); } else this.resume(); toast(enabled ? 'Звук включён' : 'Звук выключен'); },
        get enabled() { return enabled; },
        get state() { return ctx ? ctx.state : 'none'; },
        // уровень на выходе (для проверок): RMS за 50 мс
        _level() { if (!ctx || !master) return 0; if (!this._an) { this._an = ctx.createAnalyser(); this._an.fftSize = 2048; master.connect(this._an); } const d = new Float32Array(2048); this._an.getFloatTimeDomainData(d); let q = 0; for (let i = 0; i < d.length; i++) q += d[i] * d[i]; return +(20 * Math.log10(Math.sqrt(q / d.length) + 1e-9)).toFixed(1); },
        // для записи превью: проиграть сцену в заданный узел
        _debug: { start: (c, m, id, v) => { ctx = c; master = m; if (v) variant = v; start(id); } },
    };
})();
document.getElementById('music').addEventListener('click', () => audio.toggle());
// звук можно включить только по «жесту пользователя»: для касаний это отпускание пальца (pointerup/touchend),
// а не pointerdown — поэтому раньше на телефоне музыка не стартовала. Слушаем всю страницу, включая оверлеи.
['pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => addEventListener(ev, () => audio.resume(), { capture: true, passive: true }));
document.getElementById('music').classList.toggle('on', audio.enabled);

// ---- управление ----
// Взгляд: цель + сглаживание + инерция после отпускания. Шаг: скорость разгоняется и гасится, а не включается рывком.
let yaw = 0, pitch = 0, tYaw = 0, tPitch = 0;
const lookVel = { x: 0, y: 0 };
const vel = new THREE.Vector3();
let autoWalk = false, wheelImpulse = 0, gyro = null;
const joy = { active: false, id: null, x0: 0, y0: 0, dx: 0, dy: 0, mag: 0, run: false };
let look = null, tapStart = null;
const joyEl = document.getElementById('joy'), joyKnob = document.getElementById('joy-knob');
const LOOK_K = 2.6 / Math.max(320, Math.min(innerWidth, innerHeight)); // радиан на пиксель: полный свайп ≈ 150°
function inJoyZone(e) { const r = joyEl.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return Math.hypot(e.clientX - cx, e.clientY - cy) < 95 || (e.pointerType === 'touch' && e.clientX < innerWidth * 0.4 && e.clientY > innerHeight * 0.5); }
// ПК: клик захватывает мышь (pointer lock), поворот без зажатой кнопки, Esc отпускает; клик при захвате — по прицелу в центре
const FINE = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const locked = () => document.pointerLockElement === canvas;
document.addEventListener('pointerlockchange', () => { document.getElementById('cross').classList.toggle('on', locked()); if (!locked()) lookVel.x = lookVel.y = 0; });
document.addEventListener('mousemove', (e) => { if (!locked()) return; tYaw -= e.movementX * LOOK_K * 0.55; tPitch = clamp(tPitch - e.movementY * LOOK_K * 0.5, -1, 1); lookVel.x = lookVel.y = 0; });
canvas.addEventListener('pointerdown', (e) => {
    audio.resume();
    if (FINE && e.pointerType === 'mouse' && e.button === 0) {
        if (locked()) { tap(innerWidth / 2, innerHeight / 2); return; }
        { try { canvas.requestPointerLock(); } catch (err) { /* не поддерживается — остаётся перетаскивание */ } return; }
    }
    if (!joy.active && inJoyZone(e)) {
        joy.active = true; joy.id = e.pointerId; joy.x0 = e.clientX; joy.y0 = e.clientY; joy.dx = joy.dy = joy.mag = 0;
        joyEl.style.left = (e.clientX - 55) + 'px'; joyEl.style.top = (e.clientY - 55) + 'px'; joyEl.style.bottom = 'auto'; joyEl.classList.add('on');
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
        return;
    }
    look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, t: performance.now(), lx: e.clientX, ly: e.clientY, lt: performance.now() };
    tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    lookVel.x = lookVel.y = 0;
});
window.addEventListener('pointermove', (e) => {
    if (joy.active && e.pointerId === joy.id) {
        let dx = (e.clientX - joy.x0) / 46, dy = (e.clientY - joy.y0) / 46; const m = Math.hypot(dx, dy);
        if (m > 1) { dx /= m; dy /= m; }
        const mm = Math.max(0, (Math.min(m, 1) - 0.14) / 0.86); // мёртвая зона
        joy.dx = m > 0 ? dx / Math.min(m, 1) * mm : 0; joy.dy = m > 0 ? dy / Math.min(m, 1) * mm : 0; joy.mag = mm;
        joyKnob.style.transform = 'translate(' + (dx * 34) + 'px, ' + (dy * 34) + 'px)';
        // бег на телефоне: палец увели дальше края джойстика
        const run = m > 1.45; if (run !== joy.run) { joy.run = run; joyEl.classList.toggle('run', run); if (run) buzz(8); }
        return;
    }
    if (look && e.pointerId === look.id) {
        const dx = e.clientX - look.x, dy = e.clientY - look.y;
        if (Math.abs(e.clientX - tapStart.x) + Math.abs(e.clientY - tapStart.y) > 8) look.moved = true;
        tYaw -= dx * LOOK_K; tPitch = clamp(tPitch - dy * LOOK_K * 0.85, -1.0, 1.0);
        const now = performance.now(), dtm = Math.max(8, now - look.lt);
        lookVel.x = -(e.clientX - look.lx) / dtm * LOOK_K * 1000; lookVel.y = -(e.clientY - look.ly) / dtm * LOOK_K * 850;
        look.x = e.clientX; look.y = e.clientY; look.lx = e.clientX; look.ly = e.clientY; look.lt = now;
    }
});
function endPointer(e) {
    if (joy.active && e.pointerId === joy.id) { joy.active = false; joy.dx = joy.dy = joy.mag = 0; joy.run = false; joyEl.classList.remove('run'); joyKnob.style.transform = ''; joyEl.classList.remove('on'); joyEl.style.left = ''; joyEl.style.top = ''; joyEl.style.bottom = ''; return; }
    if (look && e.pointerId === look.id) {
        if (!look.moved && tapStart && performance.now() - tapStart.t < 900) { tap(e.clientX, e.clientY); lookVel.x = lookVel.y = 0; }
        else if (performance.now() - look.lt > 80) { lookVel.x = lookVel.y = 0; } // палец замер перед отпусканием — без инерции
        look = null;
    }
}
window.addEventListener('pointerup', endPointer); window.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); wheelImpulse = clamp(wheelImpulse - e.deltaY * 0.004, -3, 3); }, { passive: false });
const keys = {};
window.addEventListener('keydown', (e) => { audio.resume(); keys[e.code] = true; if (e.code === 'Escape') { hideHint(); panel.classList.remove('open'); } if (e.code === 'Space') { e.preventDefault(); toggleWalk(); } if (e.code === 'KeyM') audio.toggle(); });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
function toggleWalk() { autoWalk = !autoWalk; }
// гироскоп: телефон как окно в улицу (на iOS нужно разрешение по тапу)
async function toggleGyro(btn) {
    if (gyro) { window.removeEventListener('deviceorientation', gyro.fn); gyro = null; btn.classList.remove('on'); saveSet({ gyro: false }); return; }
    try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { toast('Нет доступа к датчикам'); return; } } } catch (err) { toast('Нет доступа к датчикам'); return; }
    gyro = { base: null, fn: null };
    gyro.fn = (e) => {
        if (e.alpha == null) return;
        const al = THREE.MathUtils.degToRad(e.alpha), bt = THREE.MathUtils.degToRad(e.beta || 0);
        if (!gyro.base) { gyro.base = { a: al, b: bt, yaw: tYaw, pitch: tPitch }; return; }
        let da = al - gyro.base.a; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
        tYaw = gyro.base.yaw + da; tPitch = clamp(gyro.base.pitch + (bt - gyro.base.b) * 0.9, -1, 1);
    };
    window.addEventListener('deviceorientation', gyro.fn); btn.classList.add('on'); saveSet({ gyro: true }); toast('Поворачивай телефон, чтобы осмотреться');
}
const gyroBtn = document.querySelector('#panel [data-gyro]');
if (gyroBtn) { gyroBtn.hidden = !('DeviceOrientationEvent' in window) || !('ontouchstart' in window); gyroBtn.addEventListener('click', () => toggleGyro(gyroBtn)); }
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (err) { /* не везде */ } }

const ray = new THREE.Raycaster();
function tap(x, y) {
    const hc = TALK.pickChar(x, y), h0 = pick(x, y, 40);
    if (hc && (!h0 || hc.dist <= h0.dist + 0.3)) { buzz(10); TALK.talk(hc.ch); return; }
    const h = h0;
    if (!h) { if (!FINE) hideHint(); return; }
    if (h.exit) { buzz(15); exitRoom(); return; }
    if (h.radio) { buzz(12); radioNext(); return; }
    if (h.door) { if (h.dist < 7) { buzz(15); enterRoom(h.door); } else toast('Подойди ближе к двери'); return; }
    buzz(10); showHint(h.sign, true);
}

// ---- подсказка сверху: наведение (прицел / курсор) или тап, без модалки ----
const STATE_LABEL = { lit: 'выучено', warm: 'учу', new: 'новое', due: 'пора повторить', worn: 'забывается' };
const ROOM_HINT = { izakaya: 'Идзакая', konbini: 'Комбини', class: 'Вечерняя школа', home: 'Квартира' }; Object.assign(ROOM_HINT, ROOMX.hints); Object.assign(ROOM_HINT, ROOMX.hints);
const hintEl = document.getElementById('hint');
const hover = { sign: null, door: null, sticky: 0, lastMouse: null, frame: 0, gazeKey: null, gazeT: 0 };
// телефон: подсказка по взгляду — что в центре экрана (до 7 м), то и подписываем, после короткой задержки
const GAZE = !FINE;
if (GAZE) document.getElementById('cross').classList.add('gaze');
document.addEventListener('mousemove', (e) => { if (!locked()) hover.lastMouse = [e.clientX, e.clientY]; });
let hoverDirty = true, hoverList = [], roomHover = [];
function rebuildHover() { hoverList = []; signsGroup.traverse((o) => { if ((o.isMesh || o.isSprite) && o.userData.sign) hoverList.push(o); }); hoverList = hoverList.concat(doors); hoverDirty = false; }
function pick(x, y, maxDist) {
    ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
    ray.far = maxDist || 24; // вывески висят высоко на фасадах — ловим издалека
    if (inside.on) {
        if (!roomHover.length) room.traverse((o) => { if ((o.isMesh || o.isSprite) && (o.userData.sign || o.userData.exit || o.userData.radio)) roomHover.push(o); });
        const h = ray.intersectObjects(roomHover, false).find((o) => o.object.userData.sign || o.object.userData.exit || o.object.userData.radio);
        if (!h) return null;
        if (h.object.userData.radio) return { radio: true, dist: h.distance };
        return h.object.userData.exit ? { exit: true, dist: h.distance } : { sign: h.object.userData.sign, dist: h.distance };
    }
    if (hoverDirty) rebuildHover();
    const h = ray.intersectObjects(hoverList, false).find((o) => (o.object.userData.sign && !o.object.userData.sign.deco) || o.object.userData.door);
    if (!h) return null;
    return h.object.userData.door ? { door: h.object, dist: h.distance } : { sign: h.object.userData.sign, dist: h.distance };
}
function showHint(sg, sticky) {
    const now = performance.now();
    if (hover.sign !== sg) {
        hover.sign = sg; hover.door = null;
        const w = sg.word;
        hintEl.classList.remove('door');
        document.getElementById('h-kanji').textContent = w.kanji || w.kana;
        document.getElementById('h-kana').textContent = w.kana && w.kana !== w.kanji ? w.kana : '';
        document.getElementById('h-tr').textContent = w.translation || '';
        const st = document.getElementById('h-state'); st.textContent = STATE_LABEL[sg.state] || sg.state; st.className = 'state ' + sg.state; st.style.setProperty('--c', sg.color);
        const jl = document.getElementById('h-jlpt'); jl.textContent = w._jlpt ? 'N' + w._jlpt : ''; jl.hidden = !w._jlpt;
        hintEl.style.setProperty('--c', sg.color);
        document.getElementById('h-review').hidden = sg.state === 'lit';
        document.getElementById('h-key').hidden = sg.state === 'lit' || !FINE;
    }
    hintEl.classList.add('on');
    if (sticky) hover.sticky = now + 5000;
}
function showDoorHint(door) {
    if (hover.door === door) return;
    hover.door = door; hover.sign = null;
    const d = door.userData.door;
    hintEl.classList.add('door');
    document.getElementById('h-kanji').textContent = { izakaya: '居酒屋', konbini: 'コンビニ', class: '塾', home: '部屋' }[d.type] || '';
    document.getElementById('h-kana').textContent = '';
    document.getElementById('h-tr').textContent = (ROOM_HINT[d.type] || 'Дверь') + ' — ' + (FINE ? 'клик' : 'тап') + ', чтобы войти';
    const st = document.getElementById('h-state'); st.textContent = ''; st.className = 'state';
    document.getElementById('h-jlpt').hidden = true; document.getElementById('h-review').hidden = true; document.getElementById('h-key').hidden = true;
    hintEl.style.setProperty('--c', d.color || '#7c8cf8');
    hintEl.classList.add('on');
}
function hideHint() { if (!hover.sign && !hover.door) return; hover.sign = null; hover.door = null; hover.sticky = 0; hintEl.classList.remove('on'); }
function updateHover(now) {
    if ((hover.frame++ % 4) !== 0) return;
    let pt = null;
    if (locked()) pt = [innerWidth / 2, innerHeight / 2]; else if (FINE && hover.lastMouse) pt = hover.lastMouse;
    else if (GAZE) {
        const h = pick(innerWidth / 2, innerHeight / 2, 22), key = h && h.sign || null; if (h && h.radio) document.getElementById('cross').classList.add('hit'); // двери не подписываем; вывески — издалека
        document.getElementById('cross').classList.toggle('hit', !!key);
        if (key !== hover.gazeKey) { hover.gazeKey = key; hover.gazeT = now; }
        if (key && now - hover.gazeT > 280) showHint(h.sign, false);
        else if (!key && (!hover.sticky || now > hover.sticky)) hideHint();
        return;
    }
    if (pt) {
        const h = pick(pt[0], pt[1]);
        if (h && h.sign) showHint(h.sign, false);
        else if (!hover.sticky || now > hover.sticky) hideHint();
    } else if (hover.sticky && now > hover.sticky) hideHint();
}
function reviewSign(s) {
    if (!s || s.state === 'lit') return;
    s.word._state = 'lit'; s.state = 'lit'; s.inten = 1; s.isLit = true; s.dead = -1; s.tex = {};
    s.meshes.forEach((m) => { m.rotation.z = 0; });
    if (s.strip) { const tp0 = inside.door && inside.door.userData.door.type, tp = ROOMX.surf[tp0] || tp0; s.strip.material.map = tp === 'konbini' ? (s.strip.geometry.parameters.width > 0.3 ? texWordPoster(s) : texMagazine(s)) : (tp === 'home' || (tp === 'class') ? texNote(s) : texStrip(s)); s.strip.material.needsUpdate = true; }
    if (inside.on && inside.door && inside.door.userData.door.type === 'class') { let bd = null; room.traverse((o) => { if (o.userData.board) bd = o; }); if (bd) { const t = texBlackboard(splitWords(inside.block, 'class').rest); bd.material.map = t; bd.material.emissiveMap = t; bd.material.needsUpdate = true; } }
    if (s.label) { s.label.material.map = texLabel(s, true); s.label.material.needsUpdate = true; }
    if (s.prop) { const b = blocks.find((x) => x.signs.indexOf(s) >= 0); if (b && b.built) { disposeBlock(b); buildBlock(b); if (dynSigns.indexOf(s) < 0) dynSigns.push(s); } }
    s.anim = { t0: performance.now() }; if (dynSigns.indexOf(s) < 0) dynSigns.push(s);
    audio.ding(); buzz(12);
    s.glow.forEach((g) => { if (g.material) g.material.opacity = Math.min(0.5, g.material.opacity / 0.55); });
    hover.sign = null; showHint(s, true);
    updateHud(); toast(source === 'demo' ? 'Вывеска зажглась (в макете расписание не меняется)' : 'Вывеска зажглась — повторение считается в тренажёре');
}
document.getElementById('h-review').addEventListener('click', () => reviewSign(hover.sign));
window.addEventListener('keydown', (e) => { if (e.code === 'KeyR' && hover.sign) reviewSign(hover.sign); });

// ---- HUD ----
function plural(n, a, b, c) { const m = n % 10, h = n % 100; if (m === 1 && h !== 11) return a; if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return b; return c; }
let hudBlock = -1;
function updateHud(force) {
    if (!blocks.length) return; // данные ещё грузятся (JLPT по сети)
    const bi = blockAt(camera.position.z);
    const lit = litCount();

    if (bi !== hudBlock || force) {
        hudBlock = bi; const q = blocks[bi].q;
        document.getElementById('q-emoji').textContent = '';
        document.getElementById('q-name').textContent = q.name;
        const total = data.words.length;
        document.getElementById('q-sub').textContent = 'квартал ' + (bi + 1) + ' из ' + blocks.length + ' · ' + total + ' ' + plural(total, 'слово', 'слова', 'слов') + ' на всей улице';
        document.getElementById('dots').innerHTML = blocks.map((_, k) => '<i' + (k === bi ? ' class="on"' : '') + '></i>').join('');
    }
}
let toastT = 0;
// заставка места: крупное японское название и подпись — вверху по центру, без плашки
let bannerT = 0;
const THEME_JP = { shinjuku: ['新宿', 'Синдзюку'], yokocho: ['横丁', 'Ёкотё'], matsuri: ['お祭り', 'Мацури'], sando: ['参道', 'Сандо'] };
function banner(jp, ru) { const el = document.getElementById('place'); if (!el) return; el.querySelector('.jp').textContent = jp; el.querySelector('.ru').textContent = ru; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), 3200); }
function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }

document.getElementById('share').addEventListener('click', async () => {
    composer.render();
    const W = canvas.width / renderer.getPixelRatio(), H = canvas.height / renderer.getPixelRatio();
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext('2d'); g.drawImage(canvas, 0, 0); g.scale(renderer.getPixelRatio(), renderer.getPixelRatio());
    g.textBaseline = 'top'; g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 8; g.fillStyle = '#fff'; g.font = '600 16px ' + UI;
    g.fillText(document.getElementById('q-emoji').textContent + ' ' + document.getElementById('q-name').textContent, 18, 22);
    g.font = '700 30px ' + UI; g.textAlign = 'right'; g.fillText(String(litCount()), W - 18, 16);
    g.font = '500 12px ' + UI; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(plural(litCount(), 'вывеска горит', 'вывески горят', 'вывесок горит'), W - 18, 50);
    g.textAlign = 'left'; g.font = '600 13px ' + UI; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText('animei.space · Улица слов', 18, H - 34);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    const file = new File([blob], 'animei-street.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Улица слов' }); return; } catch (e) { /* отменили */ } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

// ---- настройки ----
const panel = document.getElementById('panel');
document.getElementById('gear').addEventListener('click', () => { panel.classList.toggle('open'); if (document.pointerLockElement) document.exitPointerLock(); });
document.getElementById('panel-close').addEventListener('click', () => panel.classList.remove('open'));
panel.querySelectorAll('[data-src]').forEach((b) => {
    b.classList.toggle('on', SAMPLE ? b.dataset.src === 'sample' : b.dataset.src === source);
    b.addEventListener('click', () => {
        const want = b.dataset.src, u = new URL(location.href);
        if (want === 'sample') { u.searchParams.set('src', 'sample'); location.href = u.toString(); return; }
        saveSet({ source: want });
        if (SAMPLE || (want === 'demo' && window.STREET_WORDS && location.protocol !== 'file:')) { u.searchParams.delete('src'); location.href = u.toString(); return; }
        source = want; panel.querySelectorAll('[data-src]').forEach((x) => x.classList.toggle('on', x === b)); load();
    });
});
// смена улицы сохраняет тестовую колоду в адресе
if (SAMPLE) panel.querySelectorAll('a[data-theme]').forEach((a) => { const u = new URL(a.href, location.href); u.searchParams.set('src', 'sample'); a.href = u.toString(); });
panel.querySelectorAll('[data-music]').forEach((b) => { b.classList.toggle('on', b.dataset.music === audio.variant); b.addEventListener('click', () => { audio.setVariant(b.dataset.music); panel.querySelectorAll('[data-music]').forEach((x) => x.classList.toggle('on', x === b)); }); });
panel.querySelectorAll('[data-theme]').forEach((b) => { b.classList.toggle('on', b.dataset.theme === th.id); });
if (window.STREET_WORDS && window.STREET_WORDS.words && !SAMPLE && location.protocol === 'file:') panel.querySelector('[data-src="demo"]').textContent = 'Мой словарь (выгрузка)';
const rainBtn = panel.querySelector('[data-rain]'); rainBtn.hidden = false; rainBtn.classList.toggle('on', opts.rain);
rainBtn.addEventListener('click', () => { opts.rain = !opts.rain; saveSet({ rain: opts.rain }); rainBtn.classList.toggle('on', opts.rain); if (rain) rain.visible = opts.rain; });
const reflBtn = { classList: { remove() {}, toggle() {} } }; // кнопки отражений больше нет

// ---- загрузка ----
// японский шрифт: первая постройка ждёт его (не дольше 1,5 с) — раньше улица строилась дважды
const fontReady = (document.fonts && document.fonts.load) ? Promise.race([document.fonts.load('700 20px "Noto Sans JP"').then((l) => l.length > 0).catch(() => false), new Promise((r) => setTimeout(() => r(false), 1500))]) : Promise.resolve(true);
let builtBeforeFont = false;
function load() {
    data = source === 'real' ? D.loadReal() : D.buildDemo();
    if (source === 'real' && !data.words.length) { toast('В этом браузере нет слов — показан встроенный набор'); data = D.buildDemo(); source = 'demo'; }
    const go = () => {
        data.words.forEach((w) => { w._state = D.wordState(w, data, today); w._color = colorFor(w); });
        quarters = D.buildQuarters(data, 60);
        blocks.forEach(disposeBlock); dynSigns.length = 0;
        planBlocks(); buildWorld(); buildRain();
        camera.position.set(0, 1.6, 2); yaw = tYaw = 0; pitch = tPitch = 0.02; vel.set(0, 0, 0);
        ensureBlocks(); updateHud(true);
        { const tj = THEME_JP[th.id] || ['', '']; const bi = blockAt(camera.position.z); banner(tj[0], tj[1] + (blocks[bi] ? ' · ' + blocks[bi].q.name : '')); }
    };
    const run = () => fontReady.then((ok) => { if (!ok) builtBeforeFont = true; go(); });
    if (source === 'real' || data.source === 'owner') Promise.all([D.loadJlpt(), fontReady]).then(([m]) => { jlptMap = m || {}; run(); }); else run();
}

function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    bloom.resolution.set(w / 2, h / 2);
}
window.addEventListener('resize', resize);
resize();
buildSteam();

// ---- кадр ----
let last = performance.now(), fpsN = 0, fpsT = last, fpsV = 60, lowFrames = 0;
const dir = new THREE.Vector3(), rightV = new THREE.Vector3();
function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    // взгляд: цель → сглаживание, после свайпа — инерция
    if (!look) { tYaw += lookVel.x * dt; tPitch = clamp(tPitch + lookVel.y * dt, -1, 1); const k = Math.exp(-dt * 4.5); lookVel.x *= k; lookVel.y *= k; }
    if (keys.ArrowLeft) tYaw += dt * 1.9; if (keys.ArrowRight) tYaw -= dt * 1.9;
    const lk = 1 - Math.exp(-dt * 16); yaw += (tYaw - yaw) * lk; pitch += (tPitch - pitch) * lk;
    // шаг: желаемая скорость → разгон/торможение
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1; if (keys.KeyA) s -= 1; if (keys.KeyD) s += 1;
    if (joy.active) { f += -joy.dy; s += joy.dx; }
    if (wheelImpulse) { f += wheelImpulse; wheelImpulse *= Math.exp(-dt * 6); if (Math.abs(wheelImpulse) < 0.02) wheelImpulse = 0; }
    if (autoWalk && !f && !joy.active) { f = 0.6; tYaw = lerp(tYaw, Math.sin(t * 0.22) * 0.1, 0.015); }
    const mag = Math.hypot(f, s); if (mag > 1) { f /= mag; s /= mag; }
    const speed = (keys.ShiftLeft || keys.ShiftRight || joy.run ? 3.8 : 2.1) * (inside.on ? 0.75 : 1);
    dir.set(-Math.sin(yaw), 0, -Math.cos(yaw)); rightV.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const want = dir.clone().multiplyScalar(f * speed).addScaledVector(rightV, s * speed);
    vel.lerp(want, 1 - Math.exp(-dt * (mag ? 9 : 7)));
    camera.position.addScaledVector(vel, dt);
    resolveCollisions(inside.on ? colliders.room : colliders.street);
    const moving = vel.length() > 0.15;
    audio.setMotion(vel.length() / 2.1);
    if (inside.on) {
        camera.position.x = clamp(camera.position.x, -ROOM.w / 2 + 0.6, ROOM.w / 2 - 0.6);
        camera.position.z = clamp(camera.position.z, -ROOM.d / 2 + 1.0, ROOM.d / 2 - 0.5);
        if (camera.position.z > ROOM.d / 2 - 0.7 && Math.abs(camera.position.x - ROOM.doorX) < 0.7 && f > 0 && dir.z > 0.5) exitRoom();
    } else {
        camera.position.x = clamp(camera.position.x, -W2 + 0.7, W2 - 0.7);
        camera.position.z = clamp(camera.position.z, -streetLen + 4, 3);
        if (autoWalk && camera.position.z <= -streetLen + 4.1) { camera.position.z = 2; }
        if (f > 0 && (!inside.lastExit || now - inside.lastExit > 1500)) {
            for (const dr of doors) { const d = dr.userData.door; if (Math.abs(d.z - camera.position.z) < 0.6 && Math.abs(camera.position.x - d.side * ((d.w2 || W2) - 0.7)) < 0.35 && dir.x * d.side > 0.6) { buzz(15); enterRoom(dr); break; } }
        }
    }
    const bobA = Math.min(1, vel.length() / 2.1) * 0.028;
    camera.position.y = 1.6 + (moving ? Math.sin(t * 7.5) * bobA : 0);
    camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.y = yaw; camera.rotation.x = pitch + (moving ? Math.cos(t * 7.5) * bobA * 0.25 : 0); camera.rotation.z = -vel.dot(rightV) * 0.008;
    if (!inside.on) updateNeonLights(); else neonLights.forEach((l) => { l.visible = false; });
    // мигание и зажигание
    for (let i = dynSigns.length - 1; i >= 0; i--) {
        const sg = dynSigns[i]; let on;
        if (sg.anim) { const k = (now - sg.anim.t0) / 1000; const seq = [0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1]; const idx = Math.floor(k / 0.07); if (idx >= seq.length) { sg.anim = null; dynSigns.splice(i, 1); setSignLit(sg, true); continue; } on = !!seq[idx]; }
        else { const p = ((t * 0.42 + sg.seed * 0.37) % 1 + 1) % 1; const buzz = Math.sin(t * 37 + sg.seed) > -0.92; on = (p < 0.58 && buzz) || (p > 0.66 && p < 0.7) || (p > 0.76 && p < 0.79); }
        if (sg._on !== on) { sg._on = on; setSignLit(sg, on); }
    }
    // дождь вокруг камеры
    if (rain && opts.rain) {
        const p = rain.geometry.attributes.position.array;
        for (let i = 0; i < p.length; i += 3) { p[i + 1] -= 9 * dt; if (p[i + 1] < 0) { p[i + 1] = 12 + Math.random() * 2; p[i] = (Math.random() - 0.5) * 14; p[i + 2] = (Math.random() - 0.5) * 24; } }
        rain.geometry.attributes.position.needsUpdate = true;
        rain.position.set(camera.position.x, 0, camera.position.z - 9);
    }
    // пар у стен впереди камеры
    steam.forEach((sp) => {
        const u = sp.userData; u.age += dt; if (u.age > u.life) u.age = 0;
        const k = u.age / u.life;
        const baseZ = camera.position.z - 5 - u.vent * 4.5;
        sp.position.set(u.side * (W2 - 0.3) - u.side * (0.3 + k * 0.9) + u.dx * k, 0.5 + k * 2.4, baseZ);
        sp.scale.setScalar(0.5 + k * 2.2); sp.material.opacity = (1 - k) * k * 0.22;
    });
    inside.steam.forEach((sp) => { const u = sp.userData; if (!u.base) u.base = sp.position.clone(); u.age += dt; if (u.age > u.life) u.age = 0; const k = u.age / u.life; sp.position.set(u.base.x + Math.sin(k * 6 + u.life) * 0.2, u.base.y + k * 1.1, u.base.z + k * 0.3); sp.scale.setScalar(0.4 + k * 1.2); sp.material.opacity = (1 - k) * k * 0.4; });
    blocks.forEach((b) => { if (b.built) b.signs.forEach((sg) => { if (sg.flickerLight) sg.flickerLight.intensity = 2.4 + Math.sin(t * 17 + sg.seed) * 0.5 + Math.sin(t * 31) * 0.3; }); });
    LIFE.update(t, dt);
    // туман и фон плавно переходят к теме квартала
    if (!inside.on && scene.fog && scene.fog.isFogExp2) { const k = 1 - Math.exp(-dt * 1.4); _fogC.set(th.fog); scene.fog.color.lerp(_fogC, k); scene.fog.density += (th.fogD - scene.fog.density) * k; _fogC.set(th.sky); if (scene.background && scene.background.isColor) scene.background.lerp(_fogC, k); hemi.color.lerp(_fogC.set(th.fog), k); }
    if (rain) rain.visible = opts.rain && !!th.rain && !inside.on;
    if (th.festival) FESTIVAL.update(t, dt);
    if (th.temple) TEMPLE.update(t, dt);
    TALK.update();
    if (inside.on && radio.led && radio.g && radio.g.parent) radio.led.material.color.setHSL(0.03, 1, 0.35 + 0.25 * (Math.sin(t * 3.2) * 0.5 + 0.5));
    updateLabels(t); updateHover(now);
    const bi = ensureBlocks();
    if (bi !== hudBlock) updateHud();
    if (opts.bloom) composer.render(); else renderer.render(scene, camera);
    // адаптация: если fps просел — выключаем отражения, потом bloom
    fpsN++; if (now - fpsT > 1000) { fpsV = fpsN; fpsN = 0; fpsT = now; if (fpsV < 38 && !params.has("noadapt")) lowFrames++; else lowFrames = 0; if (lowFrames >= 3) { lowFrames = 0; if (opts.reflect) { opts.reflect = false; reflBtn.classList.remove('on'); buildWorld(); toast('Отражения выключены ради плавности'); } else if (opts.bloom) { opts.bloom = false; toast('Свечение упрощено ради плавности'); } } if (params.has('fps')) document.getElementById('fps').textContent = fpsV + ' fps'; }
    requestAnimationFrame(frame);
}
load();
requestAnimationFrame(frame);
// ---- телефон: во весь экран и горизонтально (браузер разрешает это только по касанию) ----
(() => {
    const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
    if (!phone) return;
    const ov = document.getElementById('rotate'), portrait = () => innerHeight > innerWidth;
    let skipped = false, lockFailed = false;
    const sync = () => { ov.classList.toggle('on', portrait() && !skipped); if (lockFailed) { ov.querySelector('.t').textContent = 'Поверните телефон горизонтально'; ov.querySelector('.sub').textContent = 'Этот браузер не умеет поворачивать экран сам'; } };
    const go = async () => {
        try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { /* без полного экрана */ }
        try { await screen.orientation.lock('landscape'); lockFailed = false; } catch (e) { lockFailed = true; }
        sync();
    };
    ov.addEventListener('click', (e) => { if (e.target.id === 'rotate-skip') { skipped = true; sync(); return; } go(); });
    // и любое первое касание сцены тоже разворачивает
    addEventListener('pointerdown', (e) => { if (!skipped && portrait() && !ov.contains(e.target)) go(); }, { capture: true, once: true });
    // вышли из полного экрана жестом «назад» — предложим снова
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { try { screen.orientation.unlock(); } catch (e) { /* нет */ } } sync(); });
    addEventListener('resize', sync); sync();
})();
{ const ld = document.getElementById('loading'); if (ld) { ld.style.opacity = '0'; setTimeout(() => ld.remove(), 500); } const nw = document.getElementById('nowebgl'); if (nw) nw.style.display = 'none'; }
setTimeout(() => { const h = document.querySelector('.hud.bottom .hint'); if (h) h.classList.add('gone'); }, 12000);
window.__walk = { camera, blocks, scene, doors, colliders, renderer, tap, enter: (i) => enterRoom(doors[i || 0]), exit: exitRoom, pick: (x, y) => pick(x, y, 40), get fps() { return fpsV; }, get inside() { return inside.on; }, audio, LIFE, FESTIVAL, TALK, ROOM, PROP_BUILDERS, lamb, room, view: (x, z, yw, pt) => { camera.position.x = x; camera.position.z = z; yaw = tYaw = yw; pitch = tPitch = pt || 0; vel.set(0, 0, 0); lookVel.x = lookVel.y = 0; } };
// шрифт опоздал к первой постройке — перерисовываем кварталы один раз
if (document.fonts && document.fonts.load) document.fonts.load('700 20px "Noto Sans JP"').then(() => { if (!builtBeforeFont) return; builtBeforeFont = false; blocks.forEach((b) => { if (b.built) { disposeBlock(b); } }); ensureBlocks(); }).catch(() => {});
