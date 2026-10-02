// Каталог предметов-слов, часть 3: параметрические архетипы + большая таблица существительных.
// Одна функция-архетип рисует десятки слов с разными цветами/формами/подписями.
(() => {
    const box = (g, m, sx, sy, sz, col, x, y, z, ry) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m(col)); o.position.set(x, y, z); if (ry) o.rotation.y = ry; g.add(o); return o; };
    const cyl = (g, m, r1, r2, h, col, x, y, z, seg, rx) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 12), m(col)); o.position.set(x, y, z); if (rx) o.rotation.x = rx; g.add(o); return o; };
    const sph = (g, m, r, col, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m(col)); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy, sz); g.add(o); return o; };
    const cone = (g, m, r, h, col, x, y, z, seg) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 10), m(col)); o.position.set(x, y, z); g.add(o); return o; };
    const tor = (g, m, r, t, col, x, y, z, rx, arc) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 20, arc || Math.PI * 2), m(col)); o.position.set(x, y, z); if (rx != null) o.rotation.x = rx; g.add(o); return o; };
    const glow = (col) => new THREE.MeshBasicMaterial({ color: new THREE.Color(col) });
    const label = (g, text, bg, ink, w, h, x, y, z, ry) => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const cg = c.getContext('2d'); cg.fillStyle = bg; cg.fillRect(0, 0, 128, 64); cg.fillStyle = ink; cg.font = '700 ' + Math.min(40, 112 / Math.max(1, Array.from(text).length)) + 'px ' + JP; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(text, 64, 34); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: makeTex(c), transparent: true })); p.position.set(x, y, z); if (ry) p.rotation.y = ry; g.add(p); return p; };
    const small = (g) => { g.userData.small = true; return g; };
    const H = (s) => hashStr(s);
    const PAL = ['#c84a4a', '#3a7fe0', '#f0c030', '#40b060', '#8040c0', '#f08030', '#2a9aa0', '#d06090'];
    const pick = (s, arr) => arr[H(s) % arr.length];

    // ---- архетипы ----
    const A = {
        bottle: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, PAL); cyl(g, m, 0.035, 0.038, 0.16, col, 0, 0.08, 0, 12); cyl(g, m, 0.014, 0.03, 0.05, col, 0, 0.185, 0, 10); cyl(g, m, 0.015, 0.015, 0.02, p.cap || '#f0f0f0', 0, 0.22, 0, 10); label(g, t, p.lab || '#f4ecd8', '#1a1a1e', 0.055, 0.04, 0, 0.08, 0.039); return small(g); },
        can: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, PAL); cyl(g, m, 0.03, 0.03, 0.11, col, 0, 0.055, 0, 14); cyl(g, m, 0.031, 0.031, 0.01, '#c8ccd4', 0, 0.112, 0, 14); label(g, t, col, '#ffffff', 0.05, 0.035, 0, 0.055, 0.031); return small(g); },
        jar: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, PAL); cyl(g, m, 0.045, 0.045, 0.1, col, 0, 0.05, 0, 14); cyl(g, m, 0.047, 0.047, 0.025, p.cap || '#8a8a94', 0, 0.112, 0, 14); label(g, t, '#f4ecd8', '#1a1a1e', 0.06, 0.04, 0, 0.05, 0.046); return small(g); },
        bag: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, ['#f4ecd8', '#e8d8b8', '#f0f0f0', '#d8e8c0']); const b = box(g, m, 0.14, 0.2, 0.07, col, 0, 0.1, 0); box(g, m, 0.14, 0.02, 0.07, col, 0, 0.21, 0); sph(g, m, 0.07, col, 0, 0.1, 0, 1, 1.4, 0.9); label(g, t, p.lab || '#c8322a', '#ffffff', 0.09, 0.06, 0, 0.1, 0.045); return small(g); },
        boxp: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, ['#c8a070', '#f0f0f0', '#e8c8c8', '#c8d8f0']); box(g, m, 0.26, 0.16, 0.18, col, 0, 0.08, 0); box(g, m, 0.27, 0.02, 0.19, p.tape || '#c8322a', 0, 0.17, 0); label(g, t, '#ffffff', '#1a1a1e', 0.14, 0.08, 0, 0.08, 0.091); return small(g); },
        book: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, PAL); box(g, m, 0.16, 0.025, 0.22, col, 0, 0.0125, 0); box(g, m, 0.15, 0.02, 0.21, '#f4efe0', 0.01, 0.014, 0); label(g, t, col, '#ffffff', 0.12, 0.16, 0, 0.026, 0).rotation.x = -Math.PI / 2; g.rotation.y = 0.2; return small(g); },
        dish: (m, t, p) => { const g = new THREE.Group(); cyl(g, m, 0.11, 0.09, 0.02, p.plate || '#f4f4f4', 0, 0.01, 0, 20); const col = p.col || pick(t, ['#d8a060', '#c84a4a', '#f0e0a0', '#8ab060', '#e0b090']); if (p.bowl) { cyl(g, m, 0.09, 0.06, 0.06, p.plate || '#2a3a6a', 0, 0.03, 0, 16); cyl(g, m, 0.085, 0.085, 0.012, col, 0, 0.062, 0, 16); } else { sph(g, m, 0.06, col, -0.02, 0.03, 0, 1.3, 0.5, 1); sph(g, m, 0.04, p.col2 || '#8ab060', 0.05, 0.025, 0.03, 1, 0.5, 1); } cyl(g, m, 0.004, 0.004, 0.2, '#5a3a22', 0.1, 0.03, -0.04, 5, Math.PI / 2.3); return small(g); },
        fruit: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, ['#d83a3a', '#f0902a', '#f0d040', '#40b060', '#8040c0']); const r = p.r || 0.045; const n = p.n || 3; for (let i = 0; i < n; i++) { const a = i * 2.1; sph(g, m, r, col, Math.cos(a) * r * 1.3 * (i ? 1 : 0), r, Math.sin(a) * r * 1.3 * (i ? 1 : 0), p.sx || 1, p.sy || 1, p.sz || 1); if (p.leaf !== false) sph(g, m, r * 0.25, '#4a8a3a', Math.cos(a) * r * 1.3 * (i ? 1 : 0), r * 2 * (p.sy || 1), Math.sin(a) * r * 1.3 * (i ? 1 : 0)); } return small(g); },
        veg: (m, t, p) => { const g = new THREE.Group(); const col = p.col || '#40b060'; for (let i = 0; i < 3; i++) { const o = p.long ? cyl(g, m, p.r || 0.02, (p.r || 0.02) * 0.6, p.len || 0.18, col, -0.05 + i * 0.05, (p.r || 0.02), (i - 1) * 0.02, 8, Math.PI / 2) : sph(g, m, p.r || 0.05, col, -0.08 + i * 0.08, p.r || 0.05, 0, p.sx || 1, p.sy || 1, p.sz || 1); if (p.top) sph(g, m, 0.02, '#2a8a3a', -0.08 + i * 0.08, (p.r || 0.05) * 2, 0, 1, 1.5, 1); } return small(g); },
        quad: (m, t, p) => { const g = new THREE.Group(); const col = p.col || '#8a6a4a', len = p.len || 1; const h = 0.25 + len * 0.1; const bd = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 + len * 0.04, 0.3 + len * 0.15, 6, 12), m(col)); bd.rotation.x = Math.PI / 2; bd.position.y = h + 0.1; g.add(bd); const hd = sph(g, m, 0.1 + len * 0.02, col, 0, h + 0.26, 0.26 + len * 0.1); [[-0.08, 0.15], [0.08, 0.15], [-0.08, -0.15], [0.08, -0.15]].forEach((q) => cyl(g, m, 0.03, 0.035, h + 0.1, p.legs || col, q[0], (h + 0.1) / 2, q[1], 8)); sph(g, m, 0.012, '#111', -0.04, h + 0.29, 0.34 + len * 0.1); sph(g, m, 0.012, '#111', 0.04, h + 0.29, 0.34 + len * 0.1); if (p.ears) [-0.06, 0.06].forEach((x) => cone(g, m, 0.03, 0.07, col, x, h + 0.38, 0.24 + len * 0.1)); if (p.horns) [-0.06, 0.06].forEach((x) => cone(g, m, 0.015, 0.1, '#d8c8a8', x, h + 0.4, 0.26 + len * 0.1)); if (p.mane) box(g, m, 0.05, 0.25, 0.14, p.mane, 0, h + 0.35, 0.1); if (p.tail !== false) cyl(g, m, 0.012, 0.02, 0.25, col, 0, h + 0.15, -0.3 - len * 0.08, 6, -0.8); if (p.spots) for (let i = 0; i < 4; i++) sph(g, m, 0.06, p.spots, (i % 2 - 0.5) * 0.18, h + 0.18 + (i % 3) * 0.04, -0.2 + i * 0.12, 1, 0.7, 1.2); if (p.trunk) cyl(g, m, 0.03, 0.02, 0.4, col, 0, h + 0.1, 0.5, 8, 1.2); g.rotation.y = 0.4; if (p.scale) g.scale.setScalar(p.scale); return g; },
        bird: (m, t, p) => { const g = new THREE.Group(); const col = p.col || '#4a8ad0'; const s = p.s || 1; sph(g, m, 0.06 * s, col, 0, 0.1 * s, 0, 1, 0.9, 1.4); sph(g, m, 0.04 * s, col, 0, 0.17 * s, 0.07 * s); cone(g, m, 0.012 * s, 0.04 * s, '#f0b040', 0, 0.17 * s, 0.12 * s).rotation.x = Math.PI / 2; sph(g, m, 0.006 * s, '#111', 0.02 * s, 0.18 * s, 0.1 * s); sph(g, m, 0.03 * s, p.wing || col, 0.05 * s, 0.1 * s, 0, 0.5, 0.4, 1.4); sph(g, m, 0.03 * s, p.wing || col, -0.05 * s, 0.1 * s, 0, 0.5, 0.4, 1.4); box(g, m, 0.03 * s, 0.01 * s, 0.06 * s, col, 0, 0.1 * s, -0.09 * s); [-0.02, 0.02].forEach((x) => cyl(g, m, 0.004 * s, 0.004 * s, 0.05 * s, '#f0b040', x * s, 0.025 * s, 0, 5)); return small(g); },
        fishy: (m, t, p) => { const g = new THREE.Group(); const col = p.col || '#7a90b0'; cyl(g, m, 0.1, 0.09, 0.03, '#f4f4f4', 0, 0.015, 0, 18); sph(g, m, 0.05, col, 0, 0.06, 0, 2.2, 0.7, 1); cone(g, m, 0.04, 0.08, col, -0.14, 0.06, 0).rotation.z = Math.PI / 2; sph(g, m, 0.008, '#111', 0.08, 0.07, 0.035); return small(g); },
        bug: (m, t, p) => { const g = new THREE.Group(); const col = p.col || '#5a3a22'; sph(g, m, 0.03, col, 0, 0.03, 0, 1.6, 0.6, 1); sph(g, m, 0.018, col, 0, 0.03, 0.055); if (p.wings) [-1, 1].forEach((k) => sph(g, m, 0.035, p.wings, k * 0.035, 0.045, 0, 1, 0.1, 1.1)); if (p.stripes) for (let i = 0; i < 3; i++) box(g, m, 0.045, 0.012, 0.008, '#1a1a1e', 0, 0.035, -0.02 + i * 0.015); for (let i = 0; i < 6; i++) box(g, m, 0.004, 0.004, 0.04, '#1a1a1e', (i % 2 ? 1 : -1) * 0.035, 0.015, -0.02 + Math.floor(i / 2) * 0.02); return small(g); },
        car: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, ['#e8e8ee', '#2a2a32', '#d8c040', '#c84a4a', '#3a7fe0']); const L = p.len || 3.6, W = p.w || 1.6; box(g, m, W, 0.5, L, col, 0, 0.55, 0); if (p.bus) box(g, m, W - 0.1, 1.0, L - 0.2, col, 0, 1.2, 0); else if (p.truck) { box(g, m, W - 0.1, 0.55, 1.4, col, 0, 1.05, L / 2 - 1.0); box(g, m, W, 1.2, L - 1.8, '#8a8a94', 0, 1.3, -0.9); } else box(g, m, W - 0.15, 0.5, L / 2, col, 0, 1.05, -0.2); const gl = p.bus ? box(g, m, W - 0.05, 0.45, L - 0.4, '#1a2230', 0, 1.3, 0) : (p.truck ? box(g, m, W - 0.05, 0.3, 1.2, '#1a2230', 0, 1.15, L / 2 - 1.0) : box(g, m, W - 0.1, 0.36, L / 2 - 0.1, '#1a2230', 0, 1.08, -0.2)); [[-W / 2 + 0.1, L / 2 - 0.6], [W / 2 - 0.1, L / 2 - 0.6], [-W / 2 + 0.1, -L / 2 + 0.6], [W / 2 - 0.1, -L / 2 + 0.6]].forEach((q) => { const w = cyl(g, m, 0.3, 0.3, 0.2, '#111', q[0], 0.3, q[1], 14); w.rotation.z = Math.PI / 2; }); [[-0.5, '#fff2c8', L / 2 + 0.01], [0.5, '#fff2c8', L / 2 + 0.01], [-0.55, '#ff3a2a', -L / 2 - 0.01], [0.55, '#ff3a2a', -L / 2 - 0.01]].forEach((q) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), glow(q[1])); l.position.set(q[0], 0.62, q[2]); g.add(l); }); if (p.light) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), glow(p.light)); b.position.set(0, p.bus || p.truck ? 1.78 : 1.36, -0.2); g.add(b); g.userData.glowColor = p.light; g.userData.glowAt = [0, 1.4, -0.2]; g.userData.light = true; } if (p.text) label(g, p.text, col, p.ink || '#1a1a1e', 1.2, 0.3, W / 2 + 0.01, 0.8, 0, Math.PI / 2); g.userData.big = true; return g; },
        toy: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, PAL); box(g, m, 0.12, 0.08, 0.3, col, 0, 0.065, 0); box(g, m, 0.1, 0.06, 0.14, col, 0, 0.13, -0.03); box(g, m, 0.105, 0.03, 0.12, '#9fd8ff', 0, 0.135, -0.03); [[-0.05, 0.1], [0.05, 0.1], [-0.05, -0.1], [0.05, -0.1]].forEach((q) => cyl(g, m, 0.025, 0.025, 0.02, '#2a2a30', q[0], 0.025, q[1], 10).rotation.z = Math.PI / 2); return small(g); },
        plant: (m, t, p) => { const g = new THREE.Group(); cyl(g, m, 0.22, 0.17, 0.3, p.pot || '#8a4a2a', 0, 0.15, 0, 12); if (p.tree) { cyl(g, m, 0.04, 0.06, 1.0, '#5a3a22', 0, 0.8, 0, 7); for (let k = 0; k < 4; k++) sph(g, m, 0.35 + (k % 2) * 0.1, p.col || '#2f6a3a', (k - 1.5) * 0.2, 1.3 + k * 0.12, (k % 2 - 0.5) * 0.2); } else if (p.grass) { for (let i = 0; i < 14; i++) { const a = i * 0.45; const bl = cone(g, m, 0.015, 0.4 + (i % 3) * 0.1, p.col || '#4aa050', Math.cos(a) * 0.12, 0.5, Math.sin(a) * 0.12); bl.rotation.z = Math.cos(a) * 0.3; bl.rotation.x = -Math.sin(a) * 0.3; } } else { for (let i = 0; i < 6; i++) { const a = i * 1.05; cyl(g, m, 0.006, 0.008, 0.35, '#3a7a3a', Math.cos(a) * 0.08, 0.47, Math.sin(a) * 0.08, 5); for (let q = 0; q < 5; q++) { const pt = sph(g, m, 0.028, p.col || pick(t, ['#ff6a8a', '#ffd34a', '#f0f0ff', '#c88aff', '#ff9a3a']), Math.cos(a) * 0.11 + Math.cos(q * 1.257) * 0.035, 0.65, Math.sin(a) * 0.11 + Math.sin(q * 1.257) * 0.035); pt.scale.set(1, 0.5, 1.3); pt.rotation.y = -q * 1.257; } sph(g, m, 0.02, '#ffd34a', Math.cos(a) * 0.11, 0.66, Math.sin(a) * 0.11); } } return g; },
        tool: (m, t, p) => { const g = new THREE.Group(); const L = p.len || 0.22; cyl(g, m, 0.008, 0.01, L, p.handle || '#5a3a22', 0, 0.01, 0, 7, Math.PI / 2); if (p.head === 'hammer') box(g, m, 0.04, 0.04, 0.08, '#8a8a94', 0, 0.02, L / 2); else if (p.head === 'scissors') { box(g, m, 0.012, 0.004, 0.1, '#c8ccd4', -0.01, 0.01, L / 2 - 0.02); box(g, m, 0.012, 0.004, 0.1, '#c8ccd4', 0.01, 0.01, L / 2 - 0.02, 0.2); tor(g, m, 0.02, 0.005, p.handle || '#c84a4a', -0.015, 0.01, -L / 2 + 0.02, Math.PI / 2); tor(g, m, 0.02, 0.005, p.handle || '#c84a4a', 0.015, 0.01, -L / 2 + 0.02, Math.PI / 2); } else if (p.head === 'spoon') sph(g, m, 0.02, '#c8ccd4', 0, 0.012, L / 2, 1, 0.4, 1.3); else if (p.head === 'fork') for (let i = 0; i < 3; i++) box(g, m, 0.004, 0.004, 0.05, '#c8ccd4', -0.01 + i * 0.01, 0.01, L / 2); else if (p.head === 'broom') { for (let i = 0; i < 7; i++) box(g, m, 0.008, 0.008, 0.12, '#d8b860', -0.03 + i * 0.01, 0.01, L / 2 + 0.04); g.rotation.z = 0.6; g.position.y = 0.1; } else if (p.head === 'brush') box(g, m, 0.02, 0.02, 0.05, '#1a1a1e', 0, 0.01, L / 2); else if (p.head === 'key') tor(g, m, 0.015, 0.005, '#d8b84a', 0, 0.01, -L / 2, 0); g.rotation.y = 0.4; return small(g); },
        device: (m, t, p) => { const g = new THREE.Group(); const col = p.col || '#2a2a30'; const w = p.w || 0.3, h = p.h || 0.2, d = p.d || 0.04; if (p.stand) { box(g, m, w, h, d, col, 0, h / 2 + 0.03, 0); box(g, m, w * 0.4, 0.03, 0.15, col, 0, 0.015, 0); } else box(g, m, w, h, d, col, 0, h / 2, 0); if (p.screen !== false) { const sc = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, h * 0.75), glow(p.screen || '#8fb8ff')); sc.position.set(0, h / 2 + (p.stand ? 0.03 : 0), d / 2 + 0.002); g.add(sc); } if (p.appliance) { box(g, m, w * 0.6, h * 0.1, d * 0.8, '#8a8a94', 0, h * 0.9, d / 2 + 0.01); } if (p.big) g.userData.big = false; return p.floor ? g : small(g); },
        cloth: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, ['#4a6ab8', '#c84a4a', '#f0f0f0', '#2a2a32', '#f0c8d0', '#4aa050']); cyl(g, m, 0.02, 0.02, 0.5, '#8a8a94', 0, 1.4, 0, 6, Math.PI / 2); tor(g, m, 0.03, 0.006, '#8a8a94', 0, 1.45, 0, 0, Math.PI); if (p.kind === 'pants') { box(g, m, 0.15, 0.55, 0.04, col, -0.09, 1.1, 0); box(g, m, 0.15, 0.55, 0.04, col, 0.09, 1.1, 0); box(g, m, 0.34, 0.06, 0.05, '#5a3a22', 0, 1.37, 0); } else if (p.kind === 'skirt') { const sk = cone(g, m, 0.22, 0.4, col, 0, 1.18, 0, 12); sk.scale.z = 0.3; } else if (p.kind === 'coat') { box(g, m, 0.42, 0.7, 0.05, col, 0, 1.03, 0); box(g, m, 0.12, 0.5, 0.05, col, -0.28, 1.12, 0); box(g, m, 0.12, 0.5, 0.05, col, 0.28, 1.12, 0); for (let i = 0; i < 4; i++) sph(g, m, 0.012, '#1a1a1e', 0.02, 1.25 - i * 0.12, 0.03); } else { box(g, m, 0.4, 0.5, 0.04, col, 0, 1.1, 0); box(g, m, 0.12, 0.3, 0.04, col, -0.25, 1.22, 0); box(g, m, 0.12, 0.3, 0.04, col, 0.25, 1.22, 0); box(g, m, 0.1, 0.06, 0.05, '#f0f0f0', 0, 1.33, 0.01); } g.userData.wall = true; return g; },
        wear: (m, t, p) => { const g = new THREE.Group(); const col = p.col || pick(t, PAL); if (p.kind === 'tie') { box(g, m, 0.04, 0.02, 0.2, col, 0, 0.01, 0); cone(g, m, 0.03, 0.05, col, 0, 0.01, 0.12).rotation.x = Math.PI / 2; } else if (p.kind === 'socks') [-0.04, 0.04].forEach((x) => { box(g, m, 0.05, 0.03, 0.12, col, x, 0.015, 0); box(g, m, 0.05, 0.08, 0.04, col, x, 0.04, -0.05); }); else if (p.kind === 'scarf') { tor(g, m, 0.06, 0.02, col, 0, 0.02, 0, Math.PI / 2); box(g, m, 0.04, 0.02, 0.15, col, 0.03, 0.02, 0.1); } else if (p.kind === 'watch') { tor(g, m, 0.04, 0.01, '#2a2a30', 0, 0.015, 0, Math.PI / 2); cyl(g, m, 0.025, 0.025, 0.012, '#f4f4f4', 0, 0.02, 0, 14); } else if (p.kind === 'cap') { sph(g, m, 0.08, col, 0, 0.04, 0, 1, 0.6, 1); box(g, m, 0.12, 0.01, 0.08, col, 0, 0.02, 0.09); } else if (p.kind === 'umbrella') { cone(g, m, 0.12, 0.08, col, 0, 0.55, 0, 8); cyl(g, m, 0.006, 0.006, 0.55, '#5a4a3a', 0, 0.27, 0, 5); tor(g, m, 0.03, 0.006, '#5a4a3a', -0.03, 0.02, 0, 0, Math.PI); } return small(g); },
        furn: (m, t, p) => { const g = new THREE.Group(); const col = p.col || '#8a6a48'; if (p.kind === 'sofa') { box(g, m, 1.6, 0.4, 0.8, col, 0, 0.2, 0); box(g, m, 1.6, 0.5, 0.2, col, 0, 0.65, -0.3); box(g, m, 0.2, 0.5, 0.8, col, -0.7, 0.45, 0); box(g, m, 0.2, 0.5, 0.8, col, 0.7, 0.45, 0); } else if (p.kind === 'shelf') { box(g, m, 0.9, 1.8, 0.35, col, 0, 0.9, 0); for (let i = 0; i < 4; i++) box(g, m, 0.8, 0.03, 0.3, '#c8a878', 0, 0.3 + i * 0.42, 0.02); } else if (p.kind === 'bed') { box(g, m, 1.2, 0.3, 2.0, col, 0, 0.15, 0); box(g, m, 1.15, 0.15, 1.9, '#e8e4d8', 0, 0.37, 0); box(g, m, 1.1, 0.08, 1.2, '#6a7aa8', 0, 0.48, 0.3); box(g, m, 0.5, 0.1, 0.35, '#f4f4f8', 0, 0.5, -0.7); box(g, m, 1.2, 0.5, 0.06, col, 0, 0.55, -1.0); } else if (p.kind === 'table') { box(g, m, 1.2, 0.05, 0.8, '#c8a878', 0, 0.72, 0); [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]].forEach((q) => cyl(g, m, 0.03, 0.03, 0.7, col, q[0], 0.35, q[1], 8)); } else if (p.kind === 'drawer') { box(g, m, 0.9, 1.0, 0.45, col, 0, 0.5, 0); for (let i = 0; i < 3; i++) { box(g, m, 0.8, 0.26, 0.02, '#a88060', 0, 0.2 + i * 0.3, 0.23); sph(g, m, 0.015, '#c8a84a', 0, 0.2 + i * 0.3, 0.245); } } else if (p.kind === 'door') { box(g, m, 0.9, 2.0, 0.06, col, 0, 1.0, 0); sph(g, m, 0.03, '#c8a84a', 0.35, 1.0, 0.05); g.userData.wall = true; } else if (p.kind === 'window') { box(g, m, 1.2, 1.0, 0.06, '#f0ece0', 0, 1.6, 0); const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), new THREE.MeshBasicMaterial({ map: texSky() })); w.position.set(0, 1.6, 0.035); g.add(w); box(g, m, 0.04, 0.9, 0.08, '#f0ece0', 0, 1.6, 0.04); g.userData.wall = true; } else if (p.kind === 'curtain') { box(g, m, 1.3, 0.03, 0.03, '#8a8a94', 0, 2.3, 0.05); for (let i = 0; i < 2; i++) box(g, m, 0.5, 1.6, 0.03, p.col || '#8a3a4a', -0.35 + i * 0.7, 1.5, 0.05); g.userData.wall = true; } else if (p.kind === 'tatami') { box(g, m, 1.8, 0.04, 0.9, '#9aa06a', 0, 0.02, 0); box(g, m, 1.8, 0.045, 0.04, '#2a2a24', 0, 0.02, -0.45); box(g, m, 1.8, 0.045, 0.04, '#2a2a24', 0, 0.02, 0.45); } else if (p.kind === 'lamp') { cyl(g, m, 0.12, 0.14, 0.03, '#2a2a30', 0, 0.015, 0, 14); cyl(g, m, 0.02, 0.02, 1.4, '#2a2a30', 0, 0.7, 0, 6); cone(g, m, 0.2, 0.25, '#f0dcb8', 0, 1.5, 0, 14); const l = new THREE.PointLight(0xffe0b0, 1.5, 4, 1.5); l.position.set(0, 1.4, 0); g.add(l); g.userData.glowColor = '#ffe0b0'; g.userData.glowAt = [0, 1.45, 0]; } return g; },
        place: (m, t, p) => { const g = new THREE.Group(); box(g, m, 0.06, 2.3, 0.06, '#2a2a30', 0, 1.15, 0); box(g, m, 0.9, 0.42, 0.06, '#1a1a20', 0, 2.3, 0); label(g, t, p.bg || '#1a1a20', p.ink || '#ffffff', 0.84, 0.36, 0, 2.3, 0.035); if (p.lit !== false) { g.userData.glowColor = p.ink || '#ffffff'; g.userData.glowAt = [0, 2.3, 0.1]; } return g; },
        person: (m, t, p) => {
            // пропорции 7 голов: голова, шея, торс с одеждой, руки-капсулы, ноги, обувь; одежда по профессии
            const g = new THREE.Group(); const h = p.h || 1.68, sc = h / 1.68;
            const skin = p.skin || pick(t + 's', ['#f0d0b0', '#e8c4a0', '#d8b090', '#f4dcc4']);
            const hair = p.hair || pick(t + 'h', ['#1a1a1e', '#2a1a10', '#4a2a14', '#6a4a2a', '#c8c8d0']);
            const top = p.col || pick(t, ['#4a6ab8', '#c84a4a', '#f0f0f0', '#2a2a32', '#f0c8d0', '#4aa050', '#e0a030']);
            const pants = p.pants || pick(t + 'p', ['#2a2a32', '#3a4a6a', '#5a4a3a', '#1a1a24']);
            const cap = (r, len, col, x, y, z, rx, rz) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m(col)); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; g.add(o); return o; };
            const outfit = p.outfit || 'casual';
            // ноги и обувь
            [-1, 1].forEach((k) => { cap(0.07 * sc, 0.6 * sc, outfit === 'dress' || outfit === 'kimono' ? skin : pants, k * 0.1 * sc, 0.45 * sc, 0); box(g, m, 0.12 * sc, 0.07 * sc, 0.26 * sc, p.shoes || '#2a1e16', k * 0.1 * sc, 0.035 * sc, 0.05 * sc); });
            // торс
            if (outfit === 'dress' || outfit === 'kimono') { const sk = cone(g, m, 0.26 * sc, 0.85 * sc, top, 0, 0.6 * sc, 0, 14); sk.scale.z = 0.7; }
            box(g, m, 0.36 * sc, 0.52 * sc, 0.22 * sc, top, 0, 1.08 * sc, 0);
            if (outfit === 'suit' || outfit === 'police' || outfit === 'uniform') { box(g, m, 0.38 * sc, 0.5 * sc, 0.24 * sc, p.jacket || (outfit === 'police' ? '#1a2a5a' : '#2a2a32'), 0, 1.07 * sc, 0); box(g, m, 0.1 * sc, 0.3 * sc, 0.02 * sc, '#f4f4f4', 0, 1.15 * sc, 0.125 * sc); box(g, m, 0.04 * sc, 0.26 * sc, 0.015 * sc, p.tie || '#8a2a2a', 0, 1.1 * sc, 0.135 * sc); }
            if (outfit === 'coat') { box(g, m, 0.4 * sc, 0.75 * sc, 0.26 * sc, '#f4f4f8', 0, 0.98 * sc, 0); box(g, m, 0.02 * sc, 0.7 * sc, 0.01 * sc, '#d8d8e0', 0, 0.98 * sc, 0.135 * sc); }
            if (outfit === 'chef') { box(g, m, 0.38 * sc, 0.55 * sc, 0.24 * sc, '#f4f4f8', 0, 1.07 * sc, 0); box(g, m, 0.3 * sc, 0.35 * sc, 0.02 * sc, '#2a2a32', 0, 0.7 * sc, 0.12 * sc); }
            // шея и голова
            cyl(g, m, 0.05 * sc, 0.05 * sc, 0.08 * sc, skin, 0, 1.37 * sc, 0, 8);
            sph(g, m, 0.12 * sc, skin, 0, 1.5 * sc, 0, 1, 1.1, 1);
            sph(g, m, 0.125 * sc, hair, 0, 1.55 * sc, -0.015 * sc, 1, p.long ? 1.1 : 0.75, 1); if (p.long) box(g, m, 0.22 * sc, 0.35 * sc, 0.08 * sc, hair, 0, 1.3 * sc, -0.1 * sc);
            [-1, 1].forEach((k) => { sph(g, m, 0.013 * sc, '#1a1a1e', k * 0.045 * sc, 1.52 * sc, 0.11 * sc); }); box(g, m, 0.05 * sc, 0.01 * sc, 0.01 * sc, '#b07060', 0, 1.45 * sc, 0.118 * sc);
            // руки
            const armR = p.arm === 'up' ? -2.4 : 0.15, armL = p.arm === 'wave' ? 2.6 : -0.15;
            cap(0.05 * sc, 0.5 * sc, top, 0.24 * sc, 1.05 * sc, 0, 0, armL); cap(0.05 * sc, 0.5 * sc, top, -0.24 * sc, 1.05 * sc, 0, 0, armR);
            sph(g, m, 0.05 * sc, skin, 0.27 * sc, 0.76 * sc, 0.02); sph(g, m, 0.05 * sc, skin, p.arm === 'up' ? -0.5 * sc : -0.27 * sc, p.arm === 'up' ? 1.4 * sc : 0.76 * sc, 0.02);
            // головные уборы и атрибуты
            if (p.hat) { cyl(g, m, 0.1 * sc, 0.1 * sc, 0.08 * sc, p.hat, 0, 1.66 * sc, 0, 12); cyl(g, m, 0.15 * sc, 0.15 * sc, 0.012 * sc, p.hat, 0, 1.62 * sc, 0, 14); }
            if (outfit === 'police') { cyl(g, m, 0.12 * sc, 0.12 * sc, 0.07 * sc, '#1a2a5a', 0, 1.66 * sc, 0, 12); box(g, m, 0.22 * sc, 0.01 * sc, 0.1 * sc, '#1a1a1e', 0, 1.63 * sc, 0.1 * sc); sph(g, m, 0.02 * sc, '#f0d060', 0, 1.68 * sc, 0.12 * sc); }
            if (outfit === 'chef') cyl(g, m, 0.11 * sc, 0.13 * sc, 0.2 * sc, '#f4f4f8', 0, 1.72 * sc, 0, 12);
            if (p.cap) { sph(g, m, 0.13 * sc, p.cap, 0, 1.55 * sc, 0, 1, 0.65, 1); box(g, m, 0.18 * sc, 0.012 * sc, 0.12 * sc, p.cap, 0, 1.56 * sc, 0.14 * sc); }
            if (p.bag) { box(g, m, 0.3 * sc, 0.32 * sc, 0.12 * sc, '#5a3a22', 0.36 * sc, 0.72 * sc, 0.02); box(g, m, 0.02 * sc, 0.4 * sc, 0.02 * sc, '#3a2a1a', 0.3 * sc, 0.95 * sc, 0.02); }
            if (p.book) box(g, m, 0.18 * sc, 0.05 * sc, 0.24 * sc, '#c84a4a', -0.3 * sc, 0.9 * sc, 0.1 * sc);
            if (p.stick) cyl(g, m, 0.012, 0.012, 0.9 * sc, '#5a3a22', 0.32 * sc, 0.45 * sc, 0.1, 6);
            if (p.sword) { box(g, m, 0.025, 0.95 * sc, 0.012, '#d8dce4', -0.3 * sc, 0.6 * sc, 0.05); box(g, m, 0.08, 0.03, 0.03, '#c8a84a', -0.3 * sc, 1.08 * sc, 0.05); }
            if (p.phone) { box(g, m, 0.07 * sc, 0.13 * sc, 0.01, '#1a1a1e', -0.52 * sc, 1.42 * sc, 0.05); }
            if (p.glasses) { tor(g, m, 0.03 * sc, 0.004, '#2a2a36', -0.045 * sc, 1.52 * sc, 0.12 * sc, 0); tor(g, m, 0.03 * sc, 0.004, '#2a2a36', 0.045 * sc, 1.52 * sc, 0.12 * sc, 0); }
            if (p.small) g.scale.setScalar(0.62);
            return g;
        },
        nature: (m, t, p) => { const g = new THREE.Group(); if (p.kind === 'cloud') { [[0, 0, 0.14], [0.14, -0.02, 0.1], [-0.13, -0.03, 0.1], [0.05, 0.08, 0.1]].forEach((q) => sph(g, m, q[2], '#f4f6ff', q[0], 2.2 + q[1], 0)); g.userData.hang = true; g.userData.wall = true; } else if (p.kind === 'ice') { box(g, m, 0.2, 0.18, 0.18, '#cfe8ff', 0, 0.09, 0, 0.3).material.transparent = true; } else if (p.kind === 'sand') { sph(g, m, 0.3, '#d8c8a0', 0, 0, 0, 1, 0.3, 1); cyl(g, m, 0.01, 0.01, 0.3, '#c84a4a', 0.1, 0.15, 0, 5); box(g, m, 0.12, 0.08, 0.01, '#c84a4a', 0.16, 0.26, 0); } else if (p.kind === 'soil') { sph(g, m, 0.3, '#5a3a22', 0, 0, 0, 1, 0.35, 1); for (let i = 0; i < 5; i++) cone(g, m, 0.01, 0.1, '#4aa050', (i - 2) * 0.1, 0.12, (i % 2) * 0.1); } else if (p.kind === 'wave') { for (let i = 0; i < 3; i++) tor(g, m, 0.15, 0.03, '#3a7fd0', (i - 1) * 0.25, 0.08, 0, Math.PI / 2, Math.PI); box(g, m, 0.9, 0.02, 0.4, '#2a5a9a', 0, 0.01, 0); } else if (p.kind === 'chime') { cyl(g, m, 0.05, 0.06, 0.08, '#cfe8ff', 0, 2.1, 0, 12); box(g, m, 0.1, 0.14, 0.004, '#f4ecd8', 0, 1.9, 0); g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.14, 0), new THREE.Vector3(0, 2.4, 0)]), new THREE.LineBasicMaterial({ color: 0x000000 }))); g.userData.hang = true; g.userData.wall = true; } else if (p.kind === 'star') { for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.03), glow('#ffd34a')); s.position.set((i - 2) * 0.12, 2.2 + (i % 2) * 0.15, 0); g.add(s); } g.userData.glowColor = '#ffd34a'; g.userData.glowAt = [0, 2.25, 0]; g.userData.wall = true; } return p.kind === 'cloud' || p.kind === 'chime' || p.kind === 'star' ? g : small(g); },
        paper: (m, t, p) => { const g = new THREE.Group(); box(g, m, 0.15, 0.004, 0.1, p.col || '#f4ecd8', 0, 0.002, 0); label(g, p.text || t, p.col || '#f4ecd8', p.ink || '#1a1a1e', 0.14, 0.09, 0, 0.005, 0).rotation.x = -Math.PI / 2; g.rotation.y = 0.3; return small(g); },
    };

    // ---- таблица: слово → [архетип, параметры, где уместен, у чего стоит] ----
    const W = ['street', 'izakaya', 'konbini', 'class', 'home'];
    const T = {};
    const def = (words, arch, p, where, spot, inside) => words.split(' ').forEach((w) => { T[w] = { arch, p: p || {}, where: where || W, spot: spot || 'table', inside }; });
    def('ジュース コーラ ワイン ウイスキー 油 酢 ソース ケチャップ シャンプー 香水 牛乳瓶 お酒 焼酎 日本酒', 'bottle', {}, ['izakaya', 'konbini', 'home']);
    def('缶 缶詰 コーヒー缶 サイダー', 'can', {}, ['konbini', 'home', 'izakaya']);
    def('はちみつ 蜂蜜 味噌 マヨネーズ 胡椒 唐辛子 梅干し 漬物 ピクルス 薬瓶', 'jar', {}, ['izakaya', 'home', 'konbini']);
    def('小麦粉 粉 米袋 パン粉 砂糖袋 スナック ポテトチップス せんべい 煎餅 豆 大豆 小豆 茶葉', 'bag', {}, ['konbini', 'home']);
    def('荷物 プレゼント 贈り物 お土産 弁当箱 宅配 段ボール 包み', 'boxp', {}, ['home', 'konbini', 'street'], 'table', 'table');
    def('教科書 漫画 小説 雑誌 手帳 日記 アルバム 絵本 参考書 問題集 カタログ 聖書 伝記 詩集 物語 本屋', 'book', {}, ['class', 'home', 'konbini']);
    def('料理 朝ご飯 昼ご飯 晩ご飯 夕飯 朝食 昼食 夕食 定食 天ぷら 焼肉 サラダ おかず 煮物 刺身 焼き魚 餃子 ピザ ハンバーガー サンドイッチ 卵焼き オムレツ ステーキ 鶏肉 豚肉 牛肉 魚料理 食べ物 食事 ご馳走', 'dish', {}, ['izakaya', 'home', 'konbini']);
    def('丼 スープ 味噌汁 チャーハン カツ丼 親子丼 牛丼 そば 蕎麦 ざるそば 冷麺 粥 お粥 シチュー', 'dish', { bowl: true }, ['izakaya', 'home']);
    def('いちご 苺 トマト さくらんぼ', 'fruit', { col: '#d83a3a', r: 0.03, n: 5 }, ['konbini', 'home', 'izakaya']);
    def('レモン', 'fruit', { col: '#f0e040', sx: 1.3 }, ['konbini', 'home', 'izakaya']);
    def('メロン スイカ 西瓜 かぼちゃ キャベツ レタス', 'fruit', { col: '#40b060', r: 0.08, n: 1, leaf: false }, ['konbini', 'home']);
    def('梨 柿 栗 栗子 玉ねぎ じゃがいも 芋 さつまいも', 'fruit', { col: '#d8a060', r: 0.045, n: 3, leaf: false }, ['konbini', 'home']);
    def('果物 フルーツ', 'fruit', { col: '#f0902a', n: 4 }, ['konbini', 'home', 'izakaya']);
    def('人参 にんじん', 'veg', { col: '#f08030', long: true, r: 0.025, top: true }, ['konbini', 'home']);
    def('きゅうり 胡瓜 ねぎ 葱 ズッキーニ', 'veg', { col: '#40b060', long: true, r: 0.02, len: 0.22 }, ['konbini', 'home']);
    def('なす 茄子', 'veg', { col: '#5a2a7a', r: 0.04, sy: 1.6 }, ['konbini', 'home']);
    def('大根', 'veg', { col: '#f4f4f0', long: true, r: 0.035, len: 0.25, top: true }, ['konbini', 'home']);
    def('きのこ 茸', 'veg', { col: '#b89060', r: 0.035 }, ['konbini', 'home']);
    def('羊 ひつじ', 'quad', { col: '#f4f4f0', legs: '#2a2a2a', ears: true }, ['street'], 'door', 'floor');
    def('鹿 しか', 'quad', { col: '#a87a4a', horns: true, len: 1.2 }, ['street'], 'door', 'floor');
    def('猿 さる', 'quad', { col: '#8a6a4a', ears: true, scale: 0.7 }, ['street', 'home'], 'door', 'floor');
    def('象 ぞう', 'quad', { col: '#8a8a94', len: 2, trunk: true, scale: 1.3 }, ['street'], 'door');
    def('ライオン', 'quad', { col: '#d8a040', mane: '#8a5a1a', len: 1.4 }, ['street'], 'door');
    def('虎 とら', 'quad', { col: '#f0a030', spots: '#1a1a1e', len: 1.4 }, ['street'], 'door');
    def('狼 おおかみ', 'quad', { col: '#6a6a72', ears: true, len: 1.3 }, ['street'], 'door');
    def('狐 きつね', 'quad', { col: '#e08030', ears: true, scale: 0.75 }, ['street', 'home'], 'door', 'floor');
    def('鼠 ねずみ', 'quad', { col: '#8a8a94', ears: true, scale: 0.3 }, ['street', 'home', 'izakaya'], 'door', 'table');
    def('亀 かめ', 'quad', { col: '#4a7a4a', scale: 0.35, tail: false }, ['street', 'home'], 'door', 'table');
    def('蛇 へび', 'bug', { col: '#4aa050' }, ['street', 'home'], 'floor', 'table');
    def('蜂 はち', 'bug', { col: '#f0c030', stripes: true, wings: '#e8f0ff' }, ['street', 'home', 'class'], 'table');
    def('蚊 か 蝿 はえ 蟻 あり', 'bug', { col: '#2a2a30', wings: '#e8f0ff' }, ['street', 'home', 'class'], 'table');
    def('鴨 かも', 'bird', { col: '#4a7a4a', wing: '#8a5a3a' }, ['street', 'home'], 'door', 'table');
    def('鳩 はと', 'bird', { col: '#8a8a9a' }, ['street', 'class'], 'door', 'table');
    def('烏 からす カラス', 'bird', { col: '#1a1a1e' }, ['street'], 'door', 'table');
    def('鷹 たか 鷲 わし', 'bird', { col: '#6a4a2a', s: 1.4 }, ['street', 'home'], 'door', 'table');
    def('雀 すずめ 小鳥', 'bird', { col: '#a87a4a', s: 0.7 }, ['street', 'home', 'class'], 'door', 'table');
    def('ペンギン', 'bird', { col: '#1a1a2a', wing: '#f4f4f4' }, ['home', 'class', 'konbini'], 'table');
    def('鮭 さけ まぐろ 鯛 たい さんま 鰻 うなぎ 鯨 くじら イカ タコ 海老 えび 蟹 かに 貝', 'fishy', {}, ['izakaya', 'konbini'], 'table');
    def('タクシー', 'car', { col: '#f0c030', text: 'TAXI', light: '#ffd34a' }, ['street'], 'floor');
    def('トラック', 'car', { col: '#3a7fe0', truck: true, len: 5.0 }, ['street'], 'floor');
    def('救急車', 'car', { col: '#f4f4f8', bus: true, len: 4.6, light: '#ff4a4a', text: '救急' }, ['street'], 'floor');
    def('消防車', 'car', { col: '#d82a2a', truck: true, len: 5.2, light: '#ff4a4a' }, ['street'], 'floor');
    def('パトカー', 'car', { col: '#f4f4f8', light: '#ff3a3a', text: 'POLICE' }, ['street'], 'floor');
    def('バイク オートバイ スクーター', 'toy', { col: '#c84a4a' }, ['home', 'class'], 'table');
    def('ヘリコプター ロケット 宇宙船', 'toy', { col: '#8a8a94' }, ['home', 'class'], 'table');
    def('草 くさ 芝生', 'plant', { grass: true }, ['street', 'home'], 'door', 'floor');
    def('梅 うめ 柳 やなぎ 楓 かえで 杉 すぎ', 'plant', { tree: true }, ['street', 'home'], 'door', 'floor');
    def('紅葉 もみじ', 'plant', { tree: true, col: '#d84a2a' }, ['street', 'home'], 'door', 'floor');
    def('薔薇 ばら バラ', 'plant', { col: '#d82a4a' }, ['street', 'home', 'izakaya'], 'door', 'table');
    def('向日葵 ひまわり', 'plant', { col: '#f0c030' }, ['street', 'home'], 'door', 'table');
    def('チューリップ 菊 きく 百合 ゆり 蘭 らん 朝顔 紫陽花 あじさい 花束 植物 観葉植物 盆栽', 'plant', {}, ['street', 'home', 'izakaya', 'class'], 'door', 'table');
    def('ハンマー 金槌', 'tool', { head: 'hammer' }, ['home', 'street'], 'table');
    def('はさみ 鋏 ハサミ', 'tool', { head: 'scissors', len: 0.16 }, ['home', 'class', 'konbini'], 'table');
    def('スプーン', 'tool', { head: 'spoon', handle: '#c8ccd4', len: 0.16 }, ['izakaya', 'home'], 'table');
    def('フォーク', 'tool', { head: 'fork', handle: '#c8ccd4', len: 0.16 }, ['izakaya', 'home'], 'table');
    def('ほうき 箒', 'tool', { head: 'broom', len: 1.0 }, ['home', 'street', 'class'], 'door', 'floor');
    def('筆 ふで 絵筆 ペン ボールペン マーカー', 'tool', { head: 'brush', len: 0.18 }, ['class', 'home'], 'table');
    def('パソコン コンピューター ノートパソコン', 'device', { w: 0.34, h: 0.22, d: 0.02, stand: true }, ['home', 'class', 'konbini'], 'table');
    def('スマホ 携帯 携帯電話 スマートフォン', 'device', { w: 0.07, h: 0.14, d: 0.01, screen: '#8fb8ff' }, ['home', 'class', 'konbini', 'izakaya'], 'table');
    def('タブレット', 'device', { w: 0.24, h: 0.16, d: 0.01 }, ['home', 'class'], 'table');
    def('冷蔵庫', 'device', { w: 0.65, h: 1.6, d: 0.65, col: '#e8ecf0', screen: false, appliance: true, floor: true }, ['home', 'konbini'], 'floor');
    def('洗濯機', 'device', { w: 0.6, h: 0.9, d: 0.6, col: '#e8ecf0', screen: '#9fd8ff', floor: true }, ['home'], 'floor');
    def('電子レンジ', 'device', { w: 0.45, h: 0.28, d: 0.35, col: '#d8dce4', screen: '#2a2a30' }, ['home', 'konbini'], 'table');
    def('炊飯器', 'device', { w: 0.28, h: 0.22, d: 0.3, col: '#f4f4f8', screen: false }, ['home', 'izakaya'], 'table');
    def('扇風機', 'device', { w: 0.3, h: 0.3, d: 0.1, col: '#f4f4f8', screen: '#c8ccd4', stand: true }, ['home', 'class', 'izakaya'], 'table');
    def('ゲーム ゲーム機', 'device', { w: 0.2, h: 0.06, d: 0.14, col: '#2a2a30', screen: false }, ['home'], 'table');
    def('エアコン', 'device', { w: 0.9, h: 0.3, d: 0.22, col: '#e8ecf0', screen: false }, ['home', 'class'], 'wall');
    def('時計台 置き時計 目覚まし時計', 'device', { w: 0.12, h: 0.12, d: 0.05, col: '#c8322a', screen: '#f4f4f4' }, ['home', 'class'], 'table');
    def('コート 上着 ジャケット 制服', 'cloth', { kind: 'coat' }, ['home', 'konbini', 'class'], 'wall');
    def('スカート ワンピース ドレス 着物 浴衣', 'cloth', { kind: 'skirt' }, ['home', 'konbini'], 'wall');
    def('ジーンズ パンツ', 'cloth', { kind: 'pants' }, ['home', 'konbini'], 'wall');
    def('セーター Tシャツ ブラウス 水着 パジャマ', 'cloth', {}, ['home', 'konbini'], 'wall');
    def('ネクタイ', 'wear', { kind: 'tie' }, ['home', 'konbini', 'class'], 'table');
    def('靴下', 'wear', { kind: 'socks' }, ['home', 'konbini'], 'table');
    def('マフラー スカーフ', 'wear', { kind: 'scarf' }, ['home', 'konbini'], 'table');
    def('腕時計', 'wear', { kind: 'watch' }, ['home', 'konbini'], 'table');
    def('キャップ 野球帽', 'wear', { kind: 'cap' }, ['home', 'konbini', 'class'], 'table');
    def('日傘 雨傘 折りたたみ傘', 'wear', { kind: 'umbrella' }, ['home', 'konbini', 'street'], 'door', 'table');
    def('ソファ ソファー', 'furn', { kind: 'sofa' }, ['home', 'izakaya'], 'floor');
    def('棚 本棚 食器棚', 'furn', { kind: 'shelf' }, ['home', 'class', 'konbini', 'izakaya'], 'floor');
    def('ベッド 寝台', 'furn', { kind: 'bed' }, ['home'], 'floor');
    def('テーブル 食卓', 'furn', { kind: 'table' }, ['home', 'izakaya', 'class'], 'floor');
    def('箪笥 たんす 引き出し', 'furn', { kind: 'drawer' }, ['home'], 'floor');
    def('ドア 扉 戸 玄関', 'furn', { kind: 'door' }, ['home', 'class', 'izakaya'], 'wall');
    def('窓 まど', 'furn', { kind: 'window' }, ['home', 'class', 'izakaya', 'konbini'], 'wall');
    def('カーテン', 'furn', { kind: 'curtain' }, ['home', 'class'], 'wall');
    def('畳 たたみ', 'furn', { kind: 'tatami' }, ['home', 'izakaya'], 'floor');
    def('ランプ 電灯 スタンド 照明', 'furn', { kind: 'lamp' }, ['home', 'izakaya', 'class'], 'floor');
    def('銀行 郵便局 図書館 映画館 公園 会社 工場 教会 寺 お寺 神社 ホテル 空港 市場 花屋 八百屋 薬局 食堂 美容院 床屋 パン屋 肉屋 魚屋 本屋 デパート スーパー 博物館 美術館 動物園 遊園地 温泉 旅館 港 橋 道 交差点 広場 役所 大使館 事務所 教室 体育館 プール', 'place', {}, ['street'], 'floor');
    def('トイレ お手洗い 便所 風呂 お風呂 台所 キッチン 寝室 居間 廊下 階段 屋上 地下 倉庫 事務室', 'place', { bg: '#1a3a5a', ink: '#9fd8ff' }, ['street', 'home', 'izakaya', 'konbini', 'class'], 'wall');
    def('人 ひと 男 男性 男の人 大人 彼 友達 友人 恋人 客 お客さん', 'person', { phone: true }, ['street', 'izakaya', 'konbini'], 'door', 'floor');
    def('女 女性 女の人 彼女 姉 お姉さん 娘', 'person', { outfit: 'dress', col: '#d06090', long: true, bag: true }, ['street', 'home', 'konbini'], 'door', 'floor');
    def('母 お母さん 妻 奥さん', 'person', { outfit: 'dress', col: '#8a5a9a', long: true }, ['street', 'home', 'konbini'], 'door', 'floor');
    def('子供 子ども こども 赤ちゃん 少年 弟 息子 孫', 'person', { col: '#f0c030', small: true, cap: '#c84a4a' }, ['street', 'home', 'class'], 'door', 'floor');
    def('少女 妹', 'person', { outfit: 'dress', col: '#f0c8d0', small: true, long: true }, ['street', 'home', 'class'], 'door', 'floor');
    def('父 お父さん 夫 叔父 おじさん', 'person', { outfit: 'suit', col: '#f4f4f4' }, ['street', 'home', 'izakaya'], 'door', 'floor');
    def('兄 お兄さん', 'person', { col: '#4a6ab8', cap: '#2a2a32' }, ['street', 'home', 'izakaya'], 'door', 'floor');
    def('祖父 おじいさん 老人', 'person', { col: '#5a4a3a', hair: '#d8d8e0', stick: true, hat: '#3a2a1a' }, ['street', 'home', 'izakaya'], 'door', 'floor');
    def('祖母 おばあさん 叔母 おばさん', 'person', { outfit: 'kimono', col: '#8a6a9a', hair: '#c8c8d0', stick: true }, ['street', 'home'], 'door', 'floor');
    def('先生 教師 教授', 'person', { outfit: 'suit', col: '#f4f4f4', jacket: '#4a4a5a', book: true, glasses: true }, ['class', 'street'], 'floor');
    def('学生 生徒 大学生 高校生 中学生', 'person', { outfit: 'uniform', col: '#f4f4f4', jacket: '#2a2a3a', tie: '#8a2a2a', bag: true }, ['class', 'street', 'konbini'], 'floor');
    def('小学生', 'person', { outfit: 'uniform', col: '#f4f4f4', jacket: '#2a2a3a', bag: true, small: true, cap: '#f0c030' }, ['class', 'street'], 'floor');
    def('医者', 'person', { outfit: 'coat', col: '#9fd8ff', glasses: true }, ['street'], 'door');
    def('看護師 看護婦', 'person', { outfit: 'coat', col: '#f0c8d0', long: true }, ['street'], 'door');
    def('警察官 警官 巡査', 'person', { outfit: 'police', col: '#9fb8ff' }, ['street'], 'door');
    def('店員 主人 店主 運転手', 'person', { cap: '#2a7fe0', col: '#2f7fe0' }, ['street', 'izakaya', 'konbini'], 'door', 'floor');
    def('コック 料理人', 'person', { outfit: 'chef' }, ['izakaya', 'street'], 'floor', 'floor');
    def('社長 会社員 サラリーマン 作家 俳優', 'person', { outfit: 'suit', col: '#f4f4f4', bag: true }, ['street', 'izakaya', 'konbini'], 'door', 'floor');
    def('歌手 画家 選手 兵士 忍者 王 王様 姫 魔女 勇者 英雄', 'person', { arm: 'wave' }, ['street', 'izakaya'], 'door', 'floor');
    def('侍 さむらい 武士 剣士', 'person', { outfit: 'kimono', col: '#2a2a32', sword: true, hair: '#1a1a1e' }, ['street', 'izakaya'], 'door', 'floor');
    def('雲 くも', 'nature', { kind: 'cloud' }, ['street', 'home', 'class'], 'wall');
    def('氷 こおり', 'nature', { kind: 'ice' }, ['izakaya', 'konbini', 'home'], 'table');
    def('砂 すな 浜 海岸 砂浜', 'nature', { kind: 'sand' }, ['street', 'home'], 'door', 'floor');
    def('土 つち 畑 田んぼ 庭', 'nature', { kind: 'soil' }, ['street', 'home'], 'door', 'floor');
    def('海 うみ 川 かわ 波 なみ 湖 みずうみ 池 いけ', 'nature', { kind: 'wave' }, ['street', 'home'], 'door', 'floor');
    def('風 かぜ 風鈴', 'nature', { kind: 'chime' }, ['street', 'home', 'izakaya'], 'wall');
    def('空 そら 宇宙 夜空 天 流れ星', 'nature', { kind: 'star' }, ['street', 'home', 'class'], 'wall');
    def('切符 チケット 名刺 カード 葉書 はがき メモ 紙 レシート 領収書 請求書 契約書 書類 免許 免許証 パスポート 鍵束 札 お札 千円 一万円', 'paper', {}, ['home', 'class', 'konbini', 'izakaya'], 'table');

    Object.keys(T).forEach((w) => {
        const e = T[w];
        if (PROP_BUILDERS[w]) return;
        PROP_BUILDERS[w] = (m, col) => A[e.arch](m, w, e.p);
        PROP_META[w] = { where: e.where, spot: e.spot, inside: e.inside, face: e.arch === 'place' ? 'player' : (e.arch === 'person' || e.arch === 'quad' || e.arch === 'bird' ? 'street' : undefined) };
    });
    ['店', '学校', '駅', '警察', '旗', '鐘', '病院'].forEach((w) => { if (PROP_META[w]) PROP_META[w].face = 'player'; });
    Object.keys(T).forEach((w) => { if (T[w].arch === 'place' && PROP_META[w]) PROP_META[w].noLabel = true; });
    ['店', '学校', '駅', '警察', '病院'].forEach((w) => { if (PROP_META[w]) PROP_META[w].noLabel = true; });
    ['猫', '犬', '熊', '牛', '馬', '豚', '鶏', '兎', '雪'].forEach((w) => { if (PROP_META[w]) PROP_META[w].face = 'street'; });
})();
