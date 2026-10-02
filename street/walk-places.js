// ===== Вывески мест: пиктограмма + слово, три стиля (деревянная под крышей, каменные ворота, световой короб) и табличка на стене =====
// Встраивается build-walk.mjs последним: подменяет строителей для слов-мест (寺, 大学, 銀行, トイレ…).
(() => {
    // ---- пиктограммы: рисуются в квадрате со стороной s вокруг (cx, cy) ----
    const I = {};
    const P = (g, pts, fill) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); if (fill !== false) g.fill(); };
    const R = (g, x, y, w, h) => g.fillRect(x, y, w, h);
    const C = (g, x, y, r, a0, a1) => { g.beginPath(); g.arc(x, y, r, a0 || 0, a1 == null ? Math.PI * 2 : a1); g.fill(); };
    const L = (g, pts, w) => { g.lineWidth = w; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); };
    I.temple = (g, x, y, s, k) => { for (let i = 0; i < 3; i++) { const w = s * (0.9 - i * 0.2), yy = y + s * (0.32 - i * 0.26); P(g, [[x - w / 2, yy], [x + w / 2, yy], [x + w * 0.32, yy - s * 0.1], [x - w * 0.32, yy - s * 0.1]]); R(g, x - w * 0.28, yy, w * 0.56, s * 0.15); } R(g, x - s * 0.02, y - s * 0.5, s * 0.04, s * 0.14); R(g, x - s * 0.36, y + s * 0.44, s * 0.72, s * 0.06); };
    I.shrine = (g, x, y, s, k) => { g.fillStyle = k.acc || '#c8322a'; P(g, [[x - s * 0.5, y - s * 0.36], [x + s * 0.5, y - s * 0.36], [x + s * 0.44, y - s * 0.26], [x - s * 0.44, y - s * 0.26]]); R(g, x - s * 0.4, y - s * 0.16, s * 0.8, s * 0.07); R(g, x - s * 0.32, y - s * 0.3, s * 0.08, s * 0.78); R(g, x + s * 0.24, y - s * 0.3, s * 0.08, s * 0.78); g.fillStyle = k.ink; R(g, x - s * 0.04, y - s * 0.28, s * 0.08, s * 0.12); };
    I.church = (g, x, y, s) => { P(g, [[x - s * 0.3, y + s * 0.45], [x - s * 0.3, y - s * 0.05], [x, y - s * 0.28], [x + s * 0.3, y - s * 0.05], [x + s * 0.3, y + s * 0.45]]); R(g, x - s * 0.03, y - s * 0.52, s * 0.06, s * 0.26); R(g, x - s * 0.1, y - s * 0.44, s * 0.2, s * 0.05); };
    I.univ = (g, x, y, s, k) => { P(g, [[x - s * 0.45, y - s * 0.08], [x, y - s * 0.3], [x + s * 0.45, y - s * 0.08]]); for (let i = 0; i < 4; i++) R(g, x - s * 0.36 + i * s * 0.22, y - s * 0.04, s * 0.08, s * 0.38); R(g, x - s * 0.46, y + s * 0.36, s * 0.92, s * 0.08); g.fillStyle = k.acc; P(g, [[x, y - s * 0.6], [x + s * 0.3, y - s * 0.47], [x, y - s * 0.36], [x - s * 0.3, y - s * 0.47]]); L(g, [[x + s * 0.24, y - s * 0.45], [x + s * 0.26, y - s * 0.3]], s * 0.025); };
    I.school = (g, x, y, s, k) => { R(g, x - s * 0.46, y - s * 0.05, s * 0.92, s * 0.48); R(g, x - s * 0.13, y - s * 0.42, s * 0.26, s * 0.4); g.fillStyle = k.bg; C(g, x, y - s * 0.26, s * 0.08); for (let i = 0; i < 3; i++) { R(g, x - s * 0.38 + i * s * 0.28, y + s * 0.06, s * 0.16, s * 0.12); } R(g, x - s * 0.06, y + s * 0.24, s * 0.12, s * 0.19); g.strokeStyle = k.ink; L(g, [[x, y - s * 0.26], [x, y - s * 0.31], [x + s * 0.04, y - s * 0.26]], s * 0.02); };
    I.bank = (g, x, y, s, k) => { C(g, x, y, s * 0.4); g.fillStyle = k.bg; C(g, x, y, s * 0.32); g.fillStyle = k.ink; g.font = '900 ' + Math.round(s * 0.48) + 'px ' + UI; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('¥', x, y + s * 0.03); };
    I.post = (g, x, y, s, k) => { g.fillStyle = k.acc || '#e03a2a'; C(g, x, y, s * 0.42); g.fillStyle = '#fff'; R(g, x - s * 0.26, y - s * 0.22, s * 0.52, s * 0.07); R(g, x - s * 0.26, y - s * 0.08, s * 0.52, s * 0.07); R(g, x - s * 0.035, y - s * 0.08, s * 0.07, s * 0.36); };
    I.library = (g, x, y, s, k) => { P(g, [[x - s * 0.46, y - s * 0.24], [x - s * 0.02, y - s * 0.16], [x - s * 0.02, y + s * 0.34], [x - s * 0.46, y + s * 0.26]]); P(g, [[x + s * 0.46, y - s * 0.24], [x + s * 0.02, y - s * 0.16], [x + s * 0.02, y + s * 0.34], [x + s * 0.46, y + s * 0.26]]); g.strokeStyle = k.bg; for (let i = 0; i < 3; i++) { L(g, [[x - s * 0.38, y - s * 0.1 + i * s * 0.12], [x - s * 0.1, y - s * 0.05 + i * s * 0.12]], s * 0.025); L(g, [[x + s * 0.38, y - s * 0.1 + i * s * 0.12], [x + s * 0.1, y - s * 0.05 + i * s * 0.12]], s * 0.025); } };
    I.cinema = (g, x, y, s, k) => { R(g, x - s * 0.42, y - s * 0.12, s * 0.84, s * 0.5); P(g, [[x - s * 0.42, y - s * 0.18], [x + s * 0.36, y - s * 0.42], [x + s * 0.4, y - s * 0.3], [x - s * 0.38, y - s * 0.06]]); g.fillStyle = k.bg; P(g, [[x - s * 0.1, y], [x + s * 0.16, y + s * 0.13], [x - s * 0.1, y + s * 0.26]]); };
    I.park = (g, x, y, s, k) => { g.fillStyle = k.acc || '#3aa050'; C(g, x - s * 0.12, y - s * 0.15, s * 0.26); C(g, x + s * 0.12, y - s * 0.22, s * 0.22); g.fillStyle = k.ink; R(g, x - s * 0.04, y - s * 0.02, s * 0.08, s * 0.42); R(g, x + s * 0.12, y + s * 0.2, s * 0.34, s * 0.05); R(g, x + s * 0.14, y + s * 0.25, s * 0.04, s * 0.15); R(g, x + s * 0.4, y + s * 0.25, s * 0.04, s * 0.15); R(g, x - s * 0.48, y + s * 0.4, s * 0.96, s * 0.04); };
    I.office = (g, x, y, s, k) => { R(g, x - s * 0.22, y - s * 0.46, s * 0.44, s * 0.9); R(g, x + s * 0.22, y - s * 0.1, s * 0.22, s * 0.54); g.fillStyle = k.bg; for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) R(g, x - s * 0.17 + c * s * 0.13, y - s * 0.38 + r * s * 0.13, s * 0.08, s * 0.08); };
    I.factory = (g, x, y, s, k) => { P(g, [[x - s * 0.46, y + s * 0.4], [x - s * 0.46, y], [x - s * 0.2, y - s * 0.15], [x - s * 0.2, y], [x + s * 0.06, y - s * 0.15], [x + s * 0.06, y], [x + s * 0.46, y], [x + s * 0.46, y + s * 0.4]]); R(g, x + s * 0.24, y - s * 0.45, s * 0.12, s * 0.46); g.fillStyle = k.acc || '#b8bcc4'; C(g, x + s * 0.32, y - s * 0.52, s * 0.07); C(g, x + s * 0.42, y - s * 0.6, s * 0.09); };
    I.hotel = (g, x, y, s, k) => { R(g, x - s * 0.46, y, s * 0.92, s * 0.18); R(g, x - s * 0.46, y - s * 0.25, s * 0.07, s * 0.6); R(g, x + s * 0.39, y + s * 0.05, s * 0.07, s * 0.3); C(g, x - s * 0.24, y - s * 0.08, s * 0.1); R(g, x - s * 0.1, y - s * 0.14, s * 0.5, s * 0.14); };
    I.airport = (g, x, y, s) => { g.save(); g.translate(x, y); g.rotate(-0.6); R(g, -s * 0.05, -s * 0.46, s * 0.1, s * 0.92); P(g, [[-s * 0.45, s * 0.05], [0, -s * 0.18], [s * 0.45, s * 0.05], [s * 0.45, s * 0.12], [0, 0], [-s * 0.45, s * 0.12]]); P(g, [[-s * 0.18, s * 0.42], [0, s * 0.32], [s * 0.18, s * 0.42], [0, s * 0.36]]); g.restore(); };
    I.market = (g, x, y, s, k) => { L(g, [[x - s * 0.46, y - s * 0.32], [x - s * 0.32, y - s * 0.32], [x - s * 0.2, y + s * 0.2], [x + s * 0.36, y + s * 0.2]], s * 0.05); P(g, [[x - s * 0.28, y - s * 0.2], [x + s * 0.44, y - s * 0.2], [x + s * 0.36, y + s * 0.1], [x - s * 0.2, y + s * 0.1]]); C(g, x - s * 0.14, y + s * 0.34, s * 0.07); C(g, x + s * 0.28, y + s * 0.34, s * 0.07); };
    I.flower = (g, x, y, s, k) => { g.fillStyle = '#3aa050'; R(g, x - s * 0.025, y, s * 0.05, s * 0.45); P(g, [[x, y + s * 0.25], [x + s * 0.26, y + s * 0.08], [x + s * 0.06, y + s * 0.3]]); g.fillStyle = k.acc || '#ff6a9a'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; C(g, x + Math.cos(a) * s * 0.16, y - s * 0.2 + Math.sin(a) * s * 0.16, s * 0.12); } g.fillStyle = '#ffd34a'; C(g, x, y - s * 0.2, s * 0.1); };
    I.veg = (g, x, y, s) => { g.fillStyle = '#f08a2a'; P(g, [[x - s * 0.14, y - s * 0.2], [x + s * 0.14, y - s * 0.2], [x, y + s * 0.46]]); g.fillStyle = '#3aa050'; P(g, [[x, y - s * 0.2], [x - s * 0.2, y - s * 0.48], [x - s * 0.04, y - s * 0.24]]); P(g, [[x, y - s * 0.2], [x + s * 0.2, y - s * 0.48], [x + s * 0.04, y - s * 0.24]]); P(g, [[x, y - s * 0.2], [x, y - s * 0.52], [x + s * 0.05, y - s * 0.22]]); };
    I.pharmacy = (g, x, y, s, k) => { g.fillStyle = k.acc || '#2aa060'; R(g, x - s * 0.12, y - s * 0.42, s * 0.24, s * 0.84); R(g, x - s * 0.42, y - s * 0.12, s * 0.84, s * 0.24); };
    I.diner = (g, x, y, s, k) => { P(g, [[x - s * 0.44, y - s * 0.02], [x + s * 0.44, y - s * 0.02], [x + s * 0.3, y + s * 0.34], [x - s * 0.3, y + s * 0.34]]); g.strokeStyle = k.ink; L(g, [[x - s * 0.05, y - s * 0.12], [x + s * 0.4, y - s * 0.5]], s * 0.04); L(g, [[x + s * 0.06, y - s * 0.1], [x + s * 0.48, y - s * 0.42]], s * 0.04); g.strokeStyle = k.acc || '#c8c8c8'; for (let i = 0; i < 3; i++) L(g, [[x - s * 0.22 + i * s * 0.18, y - s * 0.12], [x - s * 0.18 + i * s * 0.18, y - s * 0.3], [x - s * 0.22 + i * s * 0.18, y - s * 0.46]], s * 0.03); };
    I.salon = (g, x, y, s, k) => { g.strokeStyle = k.ink; g.lineWidth = s * 0.06; g.beginPath(); g.arc(x - s * 0.18, y + s * 0.26, s * 0.13, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x + s * 0.18, y + s * 0.26, s * 0.13, 0, Math.PI * 2); g.stroke(); L(g, [[x - s * 0.1, y + s * 0.15], [x + s * 0.22, y - s * 0.46]], s * 0.06); L(g, [[x + s * 0.1, y + s * 0.15], [x - s * 0.22, y - s * 0.46]], s * 0.06); };
    I.barber = (g, x, y, s) => { g.save(); g.beginPath(); g.rect(x - s * 0.14, y - s * 0.4, s * 0.28, s * 0.8); g.clip(); g.fillStyle = '#ffffff'; R(g, x - s * 0.14, y - s * 0.4, s * 0.28, s * 0.8); for (let i = -4; i < 6; i++) { g.fillStyle = i % 2 ? '#e03a2a' : '#2a5ad0'; P(g, [[x - s * 0.14, y - s * 0.4 + i * s * 0.16], [x + s * 0.14, y - s * 0.52 + i * s * 0.16], [x + s * 0.14, y - s * 0.46 + i * s * 0.16], [x - s * 0.14, y - s * 0.34 + i * s * 0.16]]); } g.restore(); g.fillStyle = '#c8ccd4'; C(g, x, y - s * 0.44, s * 0.1); R(g, x - s * 0.16, y + s * 0.4, s * 0.32, s * 0.07); };
    I.bakery = (g, x, y, s, k) => { g.fillStyle = k.acc || '#d8943a'; g.beginPath(); g.ellipse(x, y, s * 0.44, s * 0.26, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#8a5a22'; for (let i = -1; i <= 1; i++) L(g, [[x + i * s * 0.18 - s * 0.06, y - s * 0.16], [x + i * s * 0.18 + s * 0.06, y + s * 0.12]], s * 0.04); };
    I.meat = (g, x, y, s) => { g.fillStyle = '#c8503a'; g.beginPath(); g.ellipse(x - s * 0.08, y - s * 0.06, s * 0.3, s * 0.24, -0.6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f4ecd8'; R(g, x + s * 0.08, y + s * 0.1, s * 0.08, s * 0.28); C(g, x + s * 0.08, y + s * 0.4, s * 0.07); C(g, x + s * 0.17, y + s * 0.4, s * 0.07); };
    I.fish = (g, x, y, s, k) => { g.fillStyle = k.acc || '#5a8ad0'; g.beginPath(); g.ellipse(x - s * 0.06, y, s * 0.34, s * 0.18, 0, 0, Math.PI * 2); g.fill(); P(g, [[x + s * 0.22, y], [x + s * 0.48, y - s * 0.2], [x + s * 0.48, y + s * 0.2]]); g.fillStyle = '#fff'; C(g, x - s * 0.26, y - s * 0.04, s * 0.05); g.fillStyle = '#111'; C(g, x - s * 0.26, y - s * 0.04, s * 0.025); };
    I.books = (g, x, y, s) => { [['#c84a4a', -0.36, 0.86], ['#3a6fd9', -0.18, 0.72], ['#f0c030', 0, 0.8], ['#40b060', 0.18, 0.66]].forEach((b) => { g.fillStyle = b[0]; R(g, x + b[1] * s, y + s * 0.42 - b[2] * s, s * 0.16, b[2] * s); }); g.save(); g.translate(x + s * 0.4, y + s * 0.42); g.rotate(0.3); g.fillStyle = '#8040c0'; R(g, -s * 0.16, -s * 0.74, s * 0.16, s * 0.74); g.restore(); };
    I.museum = (g, x, y, s) => { P(g, [[x - s * 0.48, y - s * 0.22], [x, y - s * 0.46], [x + s * 0.48, y - s * 0.22]]); for (let i = 0; i < 5; i++) R(g, x - s * 0.4 + i * s * 0.18, y - s * 0.16, s * 0.08, s * 0.5); R(g, x - s * 0.48, y + s * 0.36, s * 0.96, s * 0.08); };
    I.art = (g, x, y, s, k) => { R(g, x - s * 0.44, y - s * 0.34, s * 0.88, s * 0.68); g.fillStyle = '#9fd8ff'; R(g, x - s * 0.36, y - s * 0.26, s * 0.72, s * 0.52); g.fillStyle = '#3aa050'; P(g, [[x - s * 0.36, y + s * 0.26], [x - s * 0.1, y - s * 0.06], [x + s * 0.1, y + s * 0.12], [x + s * 0.22, y], [x + s * 0.36, y + s * 0.26]]); g.fillStyle = '#ffd34a'; C(g, x + s * 0.2, y - s * 0.12, s * 0.07); };
    I.zoo = (g, x, y, s) => { g.fillStyle = '#1a1a1e'; C(g, x - s * 0.28, y - s * 0.28, s * 0.13); C(g, x + s * 0.28, y - s * 0.28, s * 0.13); g.fillStyle = '#f4f4f4'; C(g, x, y + s * 0.02, s * 0.36); g.fillStyle = '#1a1a1e'; g.beginPath(); g.ellipse(x - s * 0.13, y - s * 0.02, s * 0.08, s * 0.11, -0.5, 0, 7); g.fill(); g.beginPath(); g.ellipse(x + s * 0.13, y - s * 0.02, s * 0.08, s * 0.11, 0.5, 0, 7); g.fill(); C(g, x, y + s * 0.14, s * 0.05); };
    I.amuse = (g, x, y, s, k) => { g.strokeStyle = k.ink; g.lineWidth = s * 0.04; g.beginPath(); g.arc(x, y - s * 0.06, s * 0.36, 0, 7); g.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; L(g, [[x, y - s * 0.06], [x + Math.cos(a) * s * 0.36, y - s * 0.06 + Math.sin(a) * s * 0.36]], s * 0.02); g.fillStyle = ['#e03a2a', '#ffd34a', '#3a7fe0', '#40b060'][i % 4]; C(g, x + Math.cos(a) * s * 0.36, y - s * 0.06 + Math.sin(a) * s * 0.36, s * 0.07); } g.fillStyle = k.ink; P(g, [[x, y - s * 0.06], [x - s * 0.24, y + s * 0.46], [x + s * 0.24, y + s * 0.46]]); };
    I.onsen = (g, x, y, s, k) => { g.fillStyle = k.acc || '#e03a2a'; g.beginPath(); g.ellipse(x, y + s * 0.22, s * 0.42, s * 0.2, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = k.bg; g.beginPath(); g.ellipse(x, y + s * 0.18, s * 0.3, s * 0.11, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = k.acc || '#e03a2a'; for (let i = -1; i <= 1; i++) { g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(x + i * s * 0.18, y + s * 0.08); g.bezierCurveTo(x + i * s * 0.18 - s * 0.12, y - s * 0.08, x + i * s * 0.18 + s * 0.12, y - s * 0.2, x + i * s * 0.18, y - s * 0.44); g.stroke(); } };
    I.port = (g, x, y, s, k) => { g.strokeStyle = k.ink; g.lineWidth = s * 0.07; g.beginPath(); g.arc(x, y - s * 0.34, s * 0.09, 0, 7); g.stroke(); L(g, [[x, y - s * 0.25], [x, y + s * 0.42]], s * 0.07); L(g, [[x - s * 0.2, y - s * 0.12], [x + s * 0.2, y - s * 0.12]], s * 0.07); g.beginPath(); g.arc(x, y + s * 0.06, s * 0.36, 0.2, Math.PI - 0.2); g.stroke(); };
    I.bridge = (g, x, y, s, k) => { R(g, x - s * 0.48, y - s * 0.06, s * 0.96, s * 0.08); g.strokeStyle = k.ink; g.lineWidth = s * 0.06; g.beginPath(); g.arc(x, y + s * 0.6, s * 0.56, Math.PI + 0.35, -0.35); g.stroke(); for (let i = -2; i <= 2; i++) R(g, x + i * s * 0.18 - s * 0.02, y - s * 0.22, s * 0.04, s * 0.16); g.fillStyle = k.acc || '#5a8ad0'; R(g, x - s * 0.48, y + s * 0.3, s * 0.96, s * 0.1); };
    I.road = (g, x, y, s, k) => { P(g, [[x - s * 0.14, y - s * 0.46], [x + s * 0.14, y - s * 0.46], [x + s * 0.42, y + s * 0.46], [x - s * 0.42, y + s * 0.46]]); g.fillStyle = k.bg; for (let i = 0; i < 4; i++) R(g, x - s * 0.02, y - s * 0.4 + i * s * 0.23, s * 0.04, s * 0.12); };
    I.crossing = (g, x, y, s, k) => { for (let i = 0; i < 5; i++) R(g, x - s * 0.44 + i * s * 0.19, y - s * 0.3, s * 0.11, s * 0.6); };
    I.plaza = (g, x, y, s, k) => { g.fillStyle = k.acc || '#5a8ad0'; g.beginPath(); g.ellipse(x, y + s * 0.3, s * 0.44, s * 0.12, 0, 0, 7); g.fill(); g.fillStyle = k.ink; R(g, x - s * 0.05, y - s * 0.1, s * 0.1, s * 0.36); g.strokeStyle = k.acc || '#5a8ad0'; g.lineWidth = s * 0.04; [-1, 1].forEach((d) => { g.beginPath(); g.moveTo(x, y - s * 0.12); g.quadraticCurveTo(x + d * s * 0.3, y - s * 0.5, x + d * s * 0.36, y + s * 0.2); g.stroke(); }); };
    I.embassy = (g, x, y, s, k) => { R(g, x - s * 0.36, y - s * 0.46, s * 0.05, s * 0.92); g.fillStyle = k.acc || '#e03a2a'; P(g, [[x - s * 0.31, y - s * 0.44], [x + s * 0.4, y - s * 0.4], [x + s * 0.36, y - s * 0.02], [x - s * 0.31, y - s * 0.06]]); g.fillStyle = '#fff'; C(g, x + s * 0.03, y - s * 0.24, s * 0.09); };
    I.gym = (g, x, y, s, k) => { g.fillStyle = k.acc || '#f08a2a'; C(g, x, y, s * 0.4); g.strokeStyle = k.ink; g.lineWidth = s * 0.035; g.beginPath(); g.arc(x, y, s * 0.4, 0, 7); g.moveTo(x - s * 0.4, y); g.lineTo(x + s * 0.4, y); g.moveTo(x, y - s * 0.4); g.lineTo(x, y + s * 0.4); g.stroke(); };
    I.pool = (g, x, y, s, k) => { C(g, x - s * 0.12, y - s * 0.28, s * 0.09); P(g, [[x - s * 0.4, y - s * 0.02], [x - s * 0.06, y - s * 0.18], [x + s * 0.24, y - s * 0.02], [x - s * 0.1, y - s * 0.08]]); g.strokeStyle = k.acc || '#3a8ad0'; for (let r = 0; r < 2; r++) { g.lineWidth = s * 0.06; g.beginPath(); for (let i = 0; i <= 8; i++) { const xx = x - s * 0.46 + i * s * 0.115, yy = y + s * 0.14 + r * s * 0.2 + (i % 2 ? -s * 0.05 : s * 0.05); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke(); } };
    I.building = (g, x, y, s, k) => { R(g, x - s * 0.36, y - s * 0.3, s * 0.72, s * 0.72); P(g, [[x - s * 0.44, y - s * 0.3], [x, y - s * 0.52], [x + s * 0.44, y - s * 0.3]]); g.fillStyle = k.bg; R(g, x - s * 0.08, y + s * 0.16, s * 0.16, s * 0.26); };
    // комнатные таблички
    I.toilet = (g, x, y, s, k) => { [[-0.22, '#3a6fd9'], [0.22, '#e04a5a']].forEach(([dx, col], i) => { g.fillStyle = k.light ? '#fff' : col; C(g, x + dx * s, y - s * 0.32, s * 0.09); if (i) P(g, [[x + dx * s, y - s * 0.2], [x + dx * s + s * 0.16, y + s * 0.18], [x + dx * s - s * 0.16, y + s * 0.18]]); else R(g, x + dx * s - s * 0.1, y - s * 0.2, s * 0.2, s * 0.36); R(g, x + dx * s - s * 0.08, y + s * 0.16, s * 0.06, s * 0.26); R(g, x + dx * s + s * 0.02, y + s * 0.16, s * 0.06, s * 0.26); }); g.fillStyle = k.ink; R(g, x - s * 0.015, y - s * 0.4, s * 0.03, s * 0.84); };
    I.bath = I.onsen;
    I.kitchen = (g, x, y, s, k) => { R(g, x - s * 0.34, y - s * 0.12, s * 0.68, s * 0.4); R(g, x - s * 0.4, y - s * 0.2, s * 0.8, s * 0.08); R(g, x + s * 0.34, y - s * 0.04, s * 0.14, s * 0.06); R(g, x - s * 0.48, y - s * 0.04, s * 0.14, s * 0.06); g.strokeStyle = k.ink; for (let i = -1; i <= 1; i++) L(g, [[x + i * s * 0.15, y - s * 0.28], [x + i * s * 0.15 + s * 0.05, y - s * 0.38], [x + i * s * 0.15, y - s * 0.48]], s * 0.03); };
    I.bedroom = I.hotel;
    I.living = (g, x, y, s, k) => { R(g, x - s * 0.42, y - s * 0.12, s * 0.84, s * 0.3); R(g, x - s * 0.42, y - s * 0.3, s * 0.12, s * 0.48); R(g, x + s * 0.3, y - s * 0.3, s * 0.12, s * 0.48); R(g, x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.12); R(g, x - s * 0.38, y + s * 0.18, s * 0.06, s * 0.12); R(g, x + s * 0.32, y + s * 0.18, s * 0.06, s * 0.12); };
    I.corridor = (g, x, y, s) => { R(g, x - s * 0.42, y - s * 0.07, s * 0.6, s * 0.14); P(g, [[x + s * 0.12, y - s * 0.26], [x + s * 0.46, y], [x + s * 0.12, y + s * 0.26]]); };
    I.stairs = (g, x, y, s) => { P(g, [[x - s * 0.44, y + s * 0.42], [x - s * 0.44, y + s * 0.2], [x - s * 0.2, y + s * 0.2], [x - s * 0.2, y - s * 0.02], [x + s * 0.04, y - s * 0.02], [x + s * 0.04, y - s * 0.24], [x + s * 0.28, y - s * 0.24], [x + s * 0.28, y - s * 0.46], [x + s * 0.44, y - s * 0.46], [x + s * 0.44, y + s * 0.42]]); };
    I.roof = (g, x, y, s) => { R(g, x - s * 0.3, y, s * 0.6, s * 0.44); P(g, [[x - s * 0.06, y - s * 0.08], [x - s * 0.06, y - s * 0.3], [x - s * 0.18, y - s * 0.3], [x, y - s * 0.5], [x + s * 0.18, y - s * 0.3], [x + s * 0.06, y - s * 0.3], [x + s * 0.06, y - s * 0.08]]); };
    I.basement = (g, x, y, s, k) => { g.font = '900 ' + Math.round(s * 0.5) + 'px ' + UI; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B1', x - s * 0.12, y); P(g, [[x + s * 0.26, y - s * 0.3], [x + s * 0.4, y - s * 0.3], [x + s * 0.4, y + s * 0.1], [x + s * 0.48, y + s * 0.1], [x + s * 0.33, y + s * 0.34], [x + s * 0.18, y + s * 0.1], [x + s * 0.26, y + s * 0.1]]); };
    I.storage = (g, x, y, s, k) => { R(g, x - s * 0.44, y, s * 0.42, s * 0.4); R(g, x + s * 0.02, y, s * 0.42, s * 0.4); R(g, x - s * 0.22, y - s * 0.42, s * 0.42, s * 0.4); g.fillStyle = k.bg; R(g, x - s * 0.26, y, s * 0.06, s * 0.14); R(g, x + s * 0.2, y, s * 0.06, s * 0.14); R(g, x - s * 0.04, y - s * 0.42, s * 0.06, s * 0.14); };
    I.desk = (g, x, y, s, k) => { R(g, x - s * 0.46, y - s * 0.02, s * 0.92, s * 0.08); R(g, x - s * 0.42, y + s * 0.06, s * 0.06, s * 0.36); R(g, x + s * 0.18, y + s * 0.06, s * 0.24, s * 0.36); R(g, x - s * 0.3, y - s * 0.36, s * 0.34, s * 0.24); R(g, x - s * 0.16, y - s * 0.12, s * 0.06, s * 0.1); };

    // ---- какое место каким стилем и картинкой ----
    // wood — деревянная доска под крышей; gate — каменные ворота с табличкой; box — световой короб; plate — табличка на стене
    const SPEC = {};
    const def = (words, icon, style, o) => words.split(' ').forEach((w) => { SPEC[w] = Object.assign({ icon, style }, o || {}); });
    def('寺 お寺', 'temple', 'wood');
    def('神社', 'shrine', 'wood', { acc: '#d8322a' });
    def('旅館', 'hotel', 'wood');
    def('温泉', 'onsen', 'wood', { acc: '#d8322a' });
    def('大学', 'univ', 'gate', { acc: '#2a4a8a' });
    def('学校 がっこう 塾 教室', 'school', 'gate');
    def('図書館', 'library', 'gate');
    def('博物館', 'museum', 'gate');
    def('美術館', 'art', 'gate');
    def('役所 会社 事務所', 'office', 'gate');
    def('工場', 'factory', 'gate');
    def('大使館', 'embassy', 'gate');
    def('体育館', 'gym', 'gate');
    def('教会', 'church', 'gate');
    def('銀行', 'bank', 'box', { bg: '#0f3a6a', ink: '#ffffff' });
    def('郵便局', 'post', 'box', { bg: '#ffffff', ink: '#d8322a', acc: '#d8322a' });
    def('映画館', 'cinema', 'box', { bg: '#1a1a24', ink: '#ffd34a' });
    def('公園 広場', 'park', 'box', { bg: '#f4f0e0', ink: '#3a2a1a', acc: '#3aa050' });
    def('広場', 'plaza', 'box', { bg: '#f4f0e0', ink: '#3a2a1a' });
    def('ホテル', 'hotel', 'box', { bg: '#2a1a3a', ink: '#f0d080' });
    def('空港', 'airport', 'box', { bg: '#1a4a8a', ink: '#ffffff' });
    def('市場 スーパー デパート', 'market', 'box', { bg: '#f4f4f4', ink: '#c8322a' });
    def('花屋', 'flower', 'box', { bg: '#fff0f4', ink: '#3a2a2a', acc: '#ff6a9a' });
    def('八百屋', 'veg', 'box', { bg: '#f4f0d8', ink: '#2a5a2a' });
    def('薬局', 'pharmacy', 'box', { bg: '#ffffff', ink: '#1a6a3a', acc: '#2aa060' });
    def('食堂', 'diner', 'box', { bg: '#f4e8d0', ink: '#5a2a1a' });
    def('美容院', 'salon', 'box', { bg: '#f8f0f4', ink: '#5a3a6a' });
    def('床屋', 'barber', 'box', { bg: '#1a2a4a', ink: '#ffffff' });
    def('パン屋', 'bakery', 'box', { bg: '#fff4e0', ink: '#6a3a1a' });
    def('肉屋', 'meat', 'box', { bg: '#fff0e8', ink: '#6a1a1a' });
    def('魚屋', 'fish', 'box', { bg: '#e8f4ff', ink: '#1a3a6a', acc: '#4a8ad0' });
    def('本屋', 'books', 'box', { bg: '#f4f0e8', ink: '#2a2a3a' });
    def('動物園', 'zoo', 'box', { bg: '#e8f4d8', ink: '#2a3a1a' });
    def('遊園地', 'amuse', 'box', { bg: '#1a1a3a', ink: '#ffffff' });
    def('港', 'port', 'box', { bg: '#1a3a6a', ink: '#ffffff' });
    def('橋', 'bridge', 'box', { bg: '#f4f0e0', ink: '#3a2a1a' });
    def('道', 'road', 'box', { bg: '#2a6a3a', ink: '#ffffff' });
    def('交差点', 'crossing', 'box', { bg: '#2a2a32', ink: '#ffffff' });
    def('プール', 'pool', 'box', { bg: '#e8f6ff', ink: '#1a3a6a' });
    def('トイレ お手洗い 便所', 'toilet', 'plate');
    def('風呂 お風呂', 'bath', 'plate', { acc: '#9fd8ff' });
    def('台所 キッチン', 'kitchen', 'plate');
    def('寝室', 'bedroom', 'plate');
    def('居間', 'living', 'plate');
    def('廊下', 'corridor', 'plate');
    def('階段', 'stairs', 'plate');
    def('屋上', 'roof', 'plate');
    def('地下', 'basement', 'plate');
    def('倉庫', 'storage', 'plate');
    def('事務室', 'desk', 'plate');

    const texCache = new Map();
    // лицевая сторона вывески: картинка + слово; layout: v — картинка сверху, слово под ней; h — картинка слева, слово справа
    function face(text, sp, layout, W, H) {
        const key = text + '|' + layout + '|' + sp.icon; if (texCache.has(key)) return texCache.get(key);
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        const k = { bg: sp.bg, ink: sp.ink, acc: sp.acc, light: sp.light };
        g.fillStyle = sp.bg; g.fillRect(0, 0, W, H);
        if (sp.style === 'wood') { for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(90,50,20,' + (0.04 + Math.random() * 0.06) + ')'; g.fillRect(0, Math.random() * H, W, 1 + Math.random() * 3); } }
        g.strokeStyle = sp.frame || sp.ink; g.lineWidth = Math.max(4, W * 0.02); g.strokeRect(g.lineWidth, g.lineWidth, W - g.lineWidth * 2, H - g.lineWidth * 2);
        g.fillStyle = sp.ink; g.strokeStyle = sp.ink; g.lineCap = 'round'; g.lineJoin = 'round';
        const n = Array.from(text).length;
        if (layout === 'v') {
            const s = W * 0.58; I[sp.icon](g, W / 2, H * 0.32, s, k);
            g.fillStyle = sp.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
            const fs = Math.min(W * 0.36, (W * 0.86) / n); g.font = '900 ' + fs + 'px ' + JP; g.fillText(text, W / 2, H * 0.78);
        } else {
            const s = H * 0.72; I[sp.icon](g, H * 0.52, H / 2, s, k);
            g.fillStyle = sp.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
            const room = W - H * 1.02; const fs = Math.min(H * 0.5, (room * 0.9) / n); g.font = '900 ' + fs + 'px ' + JP; g.fillText(text, H * 1.0 + room / 2, H / 2 + fs * 0.04);
        }
        const t = makeTex(c); texCache.set(key, t); return t;
    }
    const bx = (g, m, sx, sy, sz, col, x, y, z, rz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m(col)); o.position.set(x, y, z); if (rz) o.rotation.z = rz; g.add(o); return o; };
    const panel = (g, tex, lit, w, h, x, y, z) => { const mt = lit ? new THREE.MeshBasicMaterial({ map: tex, fog: true }) : new THREE.MeshLambertMaterial({ map: tex, color: new THREE.Color('#6a6a70') }); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mt); p.position.set(x, y, z); g.add(p); return p; };
    function placeSign(m, text) {
        const sp0 = SPEC[text] || { icon: 'building', style: 'box', bg: '#f4f0e8', ink: '#2a2a3a' };
        const lit = m('#ffffff').color.r > 0.9; // у новых слов материалы притушены
        const g = new THREE.Group();
        if (sp0.style === 'wood') {
            // деревянная доска под двускатной крышей, на каменных подставках
            const sp = Object.assign({ bg: '#e8d4a8', ink: '#2a1a10', frame: '#5a3a1a' }, sp0);
            [-0.46, 0.46].forEach((x) => { bx(g, m, 0.08, 2.1, 0.08, '#4a2e18', x, 1.05, 0); bx(g, m, 0.18, 0.16, 0.18, '#8a8a84', x, 0.08, 0); });
            bx(g, m, 1.0, 0.07, 0.08, '#4a2e18', 0, 1.9, 0);
            bx(g, m, 0.9, 1.08, 0.04, '#6a4424', 0, 1.3, -0.01);
            panel(g, face(text, sp, 'v', 256, 320), lit, 0.84, 1.03, 0, 1.3, 0.012);
            [-1, 1].forEach((d) => bx(g, m, 0.66, 0.05, 0.36, '#2a2a30', d * 0.3, 2.21, 0, -d * 0.42));
            bx(g, m, 0.08, 0.06, 0.38, '#3a3a40', 0, 2.34, 0);
            if (lit) { g.userData.glowColor = '#ffd9a0'; g.userData.glowAt = [0, 1.3, 0.2]; }
        } else if (sp0.style === 'gate') {
            // каменные ворота: столб с табличкой-картинкой, кусок ограды, на столбе фонарь
            const sp = Object.assign({ bg: '#f4f2ea', ink: '#1a2a3a', frame: '#8a7a5a' }, sp0);
            bx(g, m, 0.62, 1.9, 0.5, '#b8b4aa', 0, 0.95, 0); bx(g, m, 0.72, 0.1, 0.6, '#9a968c', 0, 1.95, 0); bx(g, m, 0.7, 0.12, 0.58, '#9a968c', 0, 0.06, 0);
            bx(g, m, 0.48, 0.98, 0.02, '#8a7a5a', 0, 1.12, 0.255);
            panel(g, face(text, sp, 'v', 200, 400), lit, 0.44, 0.94, 0, 1.12, 0.268);
            bx(g, m, 1.3, 0.75, 0.3, '#a8a49a', -0.98, 0.375, -0.05); for (let i = 0; i < 6; i++) bx(g, m, 0.025, 0.42, 0.025, '#2a2a30', -1.55 + i * 0.22, 0.95, -0.05);
            bx(g, m, 1.3, 0.025, 0.025, '#2a2a30', -0.98, 1.12, -0.05);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), lit ? new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0d0') }) : m('#8a8a84')); lamp.position.set(0, 2.12, 0); g.add(lamp);
            if (lit) { g.userData.glowColor = '#fff0d0'; g.userData.glowAt = [0, 2.1, 0.1]; g.userData.light = true; }
        } else if (sp0.style === 'plate') {
            // табличка-пиктограмма на стене (вход в помещение)
            const sp = Object.assign({ bg: '#1f3f6a', ink: '#ffffff', light: true }, sp0);
            bx(g, m, 0.5, 0.62, 0.03, '#d8dce4', 0, 1.95, 0);
            panel(g, face(text, sp, 'v', 256, 320), lit, 0.46, 0.58, 0, 1.95, 0.017);
            g.userData.wall = true;
            if (lit) { g.userData.glowColor = '#9fd8ff'; g.userData.glowAt = [0, 1.95, 0.1]; }
        } else {
            // световой короб на столбе: картинка слева, слово справа
            const sp = Object.assign({ bg: '#f4f0e8', ink: '#2a2a3a' }, sp0);
            bx(g, m, 0.07, 2.0, 0.07, '#3a3a42', 0, 1.0, 0); bx(g, m, 0.3, 0.06, 0.3, '#3a3a42', 0, 0.03, 0);
            bx(g, m, 1.12, 0.6, 0.14, sp.frame || '#2a2a30', 0, 2.2, 0);
            panel(g, face(text, sp, 'h', 448, 224), lit, 1.04, 0.52, 0, 2.2, 0.072);
            const back = panel(g, face(text, sp, 'h', 448, 224), lit, 1.04, 0.52, 0, 2.2, -0.072); back.rotation.y = Math.PI;
            if (lit) { g.userData.glowColor = sp.ink === '#ffffff' ? sp.bg : sp.ink; g.userData.glowAt = [0, 2.2, 0.15]; }
        }
        return g;
    }
    // подменяем строителей: у каждого места своя вывеска со своим словом (раньше 大学 показывал «学校»)
    Object.keys(SPEC).forEach((w) => {
        PROP_BUILDERS[w] = (m) => placeSign(m, w);
        const st = SPEC[w].style;
        PROP_META[w] = Object.assign({}, PROP_META[w] || { where: ['street'] }, { face: st === 'plate' ? undefined : 'player', noLabel: true, spot: st === 'plate' ? 'wall' : ((PROP_META[w] || {}).spot || 'floor') });
    });

    // ---- природные слова — школьные макеты-рельефы на парте (раньше лежали на улице непонятной кучкой) ----
    const noise = (x, z, sd) => Math.sin(x * 7.1 + sd) * 0.5 + Math.sin(z * 9.3 + sd * 1.7) * 0.35 + Math.sin((x + z) * 13.7 + sd * 0.3) * 0.15;
    const DIO = {
        river: { h: (x, z) => 0.03 + noise(x, z, 1) * 0.008 - 0.03 * Math.exp(-Math.pow((z - Math.sin(x * 9) * 0.05) / 0.035, 2)), water: 0.012 },
        sea: { h: (x, z) => -0.01 + Math.max(0, (x + 0.08) * 0.35) + noise(x, z, 2) * 0.006 + 0.03 * Math.exp(-(Math.pow(x + 0.12, 2) + Math.pow(z - 0.06, 2)) / 0.0012), water: 0.012, boat: true },
        lake: { h: (x, z) => 0.032 + noise(x, z, 3) * 0.008 - 0.034 * Math.exp(-(x * x / 0.012 + z * z / 0.008)), water: 0.012 },
        paddy: { h: () => 0.012, water: 0.016, paddy: true },
        field: { h: (x, z) => 0.012 + (Math.sin(z * 90) > 0 ? 0.008 : 0), rows: true },
        forest: { h: (x, z) => 0.02 + Math.max(0, noise(x, z, 4)) * 0.05, trees: 34 },
        beach: { h: (x, z) => -0.006 + (x + 0.2) * 0.12 + noise(x, z, 5) * 0.004, water: 0.012 },
        garden: { h: (x, z) => 0.014 + noise(x, z, 6) * 0.004, plants: true },
    };
    const colAt = (kind, y, x, z) => {
        if (kind === 'paddy') return Math.abs(((x + 1) * 10) % 1 - 0.5) > 0.44 || Math.abs(((z + 1) * 10) % 1 - 0.5) > 0.44 ? '#7a5a34' : '#5a8a3a';
        if (kind === 'field') return Math.sin(z * 90) > 0 ? '#6a4a2a' : '#4a3420';
        if (kind === 'garden') return '#5a7a3a';
        if (y < 0.006) return '#c8b07a';
        if (y < 0.016 && kind !== 'forest') return '#d8c890';
        return y > 0.05 ? '#3a6a2e' : '#5a8a3a';
    };
    function diorama(m, word, kind) {
        const sp = DIO[kind]; const g = new THREE.Group();
        const W = 0.42, D = 0.3, dim = m('#ffffff').color.r;
        bx(g, m, W + 0.03, 0.03, D + 0.03, '#a8784a', 0, 0.015, 0);
        const geo = new THREE.PlaneGeometry(W, D, 34, 24); geo.rotateX(-Math.PI / 2);
        const p = geo.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color();
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const edge = Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z)) < 0.004; const y = edge ? 0 : sp.h(x, z); p.setY(i, 0.03 + y); c.set(edge ? '#8a6a44' : colAt(kind, y, x, z)); cols.set([c.r * dim, c.g * dim, c.b * dim], i * 3); }
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
        g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
        if (sp.water != null) { const w = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.01, D - 0.01), m(kind === 'paddy' ? '#8ac0d8' : '#3a8ad0')); w.material.transparent = true; w.material.opacity = kind === 'paddy' ? 0.45 : 0.78; w.rotation.x = -Math.PI / 2; w.position.y = 0.03 + sp.water; g.add(w); }
        if (sp.paddy) for (let i = 0; i < 70; i++) { const x = -W / 2 + 0.02 + (i % 10) * 0.04, z = -D / 2 + 0.02 + Math.floor(i / 10) * 0.04; bx(g, m, 0.004, 0.022, 0.004, '#7ac04a', x + 0.01, 0.05, z + 0.01); }
        if (sp.rows) for (let i = 0; i < 40; i++) { const x = -W / 2 + 0.03 + (i % 8) * 0.05, z = -D / 2 + 0.02 + Math.floor(i / 8) * 0.07; const s = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), m('#5ab040')); s.position.set(x, 0.05, z); g.add(s); }
        if (sp.trees) for (let i = 0; i < sp.trees; i++) { const x = (Math.sin(i * 12.9898) * 0.5) * (W - 0.04), z = (Math.sin(i * 78.233) * 0.5) * (D - 0.04); const y = 0.03 + sp.h(x, z); const t = new THREE.Mesh(new THREE.ConeGeometry(0.014 + (i % 3) * 0.004, 0.05 + (i % 4) * 0.01, 6), m(['#2a5a2a', '#3a6a2a', '#2a4a2a'][i % 3])); t.position.set(x, y + 0.03, z); g.add(t); }
        if (sp.plants) { for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), m(['#ff6a8a', '#ffd34a', '#3a8a3a'][i % 3])); s.position.set(-0.15 + (i % 3) * 0.05, 0.05, -0.08 + Math.floor(i / 3) * 0.05); g.add(s); } for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 8), m('#a8a49a')); st.position.set(0.04 + i * 0.04, 0.047, 0.04 - i * 0.03); g.add(st); } }
        if (sp.boat) { bx(g, m, 0.04, 0.012, 0.016, '#f4f0e8', -0.12, 0.048, -0.06); const sail = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 3), m('#ffffff')); sail.position.set(-0.12, 0.07, -0.06); g.add(sail); }
        if (kind === 'river') { bx(g, m, 0.03, 0.006, 0.09, '#c84a2a', 0.06, 0.05, 0); }
        // флажок на зубочистке с подписью — ученический проект
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.13, 4), m('#e8d8b8')); pole.position.set(W / 2 - 0.04, 0.095, D / 2 - 0.04); g.add(pole);
        const cv = document.createElement('canvas'); cv.width = 128; cv.height = 72; const cg = cv.getContext('2d'); cg.fillStyle = '#ffffff'; cg.fillRect(0, 0, 128, 72); cg.strokeStyle = '#c8322a'; cg.lineWidth = 3; cg.strokeRect(2, 2, 124, 68); cg.fillStyle = '#1a1a24'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.font = '900 ' + Math.min(44, 110 / Array.from(word).length) + 'px ' + JP; cg.fillText(word, 64, 38);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.042), new THREE.MeshLambertMaterial({ map: makeTex(cv), side: THREE.DoubleSide, color: new THREE.Color(dim, dim, dim) })); flag.position.set(W / 2 - 0.04 - 0.039, 0.14, D / 2 - 0.04); g.add(flag);
        g.userData.small = true;
        return g;
    }
    const NAT = {};
    const nat = (words, kind) => words.split(' ').forEach((w) => { NAT[w] = kind; });
    nat('川 かわ 小川', 'river'); nat('海 うみ 波 なみ 海岸', 'sea'); nat('湖 みずうみ 池 いけ', 'lake');
    nat('田んぼ 田 水田 稲', 'paddy'); nat('畑 土 つち', 'field'); nat('森 もり 林 はやし 森林 ジャングル', 'forest'); nat('砂 すな 浜 砂浜', 'beach'); nat('庭 にわ 公園の庭', 'garden');
    Object.keys(NAT).forEach((w) => {
        PROP_BUILDERS[w] = (m) => diorama(m, w, NAT[w]);
        PROP_META[w] = { where: ['class', 'home', 'books', 'cafe'], spot: 'table', inside: 'table' };
    });
})();
