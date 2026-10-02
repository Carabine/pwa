// ===== Ещё две комнаты: «комната разработчика» (отзывы автору) и большой аниме-магазин =====
// Дописывают ROOMX (типы, оболочки, мебель, вход с улицы). Встраивается build-walk.mjs сразу после walk-rooms.js.
(() => {
    const T = ['dev', 'animeshop'];
    ROOMX.types.push(...T);
    Object.assign(ROOMX.names, { dev: '開発室 · комната разработчика', animeshop: 'アニメショップ · аниме-магазин' });
    Object.assign(ROOMX.hints, { dev: 'Комната разработчика', animeshop: 'Аниме-магазин' });
    Object.assign(ROOMX.alias, { dev: 'class', animeshop: 'konbini' });
    Object.assign(ROOMX.surf, { dev: 'home', animeshop: 'konbini' });
    Object.assign(ROOMX.size, {
        dev: () => ({ w: 6.6, d: 7.6, h: 2.8 }),
        animeshop: (r) => ({ w: 9.6 + Math.floor(r() * 2) * 0.8, d: 13 + Math.floor(r() * 2) * 1.0, h: 3.4 }),
    });
    const cv = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return makeTex(c); };
    const rep = (t, x, y) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(x, y); return t; };
    const basic = (col, extra) => new THREE.MeshBasicMaterial(Object.assign({ color: new THREE.Color(col) }, extra || {}));
    const plane = (g, w, h, mat, x, y, z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.position.set(x, y, z); if (ry) p.rotation.y = ry; g.add(p); return p; };
    const light = (g, col, inten, dist, x, y, z) => { const l = new THREE.PointLight(col, inten, dist, 1.4); l.position.set(x, y, z); g.add(l); return l; };
    const BX = (g, sx, sy, sz, col, x, y, z, rz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), lamb(col)); m.position.set(x, y, z); if (rz) m.rotation.z = rz; g.add(m); return m; };
    const SP = (g, r, col, x, y, z, sx, sy, sz, seg) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 10, seg ? Math.max(6, seg - 3) : 8), lamb(col)); m.position.set(x, y, z); m.scale.set(sx || 1, sy || sx || 1, sz || sx || 1); g.add(m); return m; };
    const CY = (g, r1, r2, h, col, x, y, z, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 10), lamb(col)); m.position.set(x, y, z); g.add(m); return m; };
    // экран, на котором всегда идёт аниме (клипы ANITV; без видео — нарисованный канал)
    const animeScreen = (g, w, h, x, y, z) => {
        const t = LIFE.screenTex(); const sc = LIFE.S.screens[LIFE.S.screens.length - 1]; sc.prog = 'anime'; sc.until = 1e9;
        const m = plane(g, w, h, new THREE.MeshBasicMaterial({ map: t }), x, y, z); LIFE.bindScreen(t, m.material); return m;
    };
    const HAIR = ['#2a1a1a', '#f0d080', '#e86aa8', '#4a8ae8', '#f4f4f4', '#c8322a', '#7a4ae8', '#3ac8a0', '#f08a2a'], OUTFIT = ['#1e2a4a', '#c8322a', '#f4f4f4', '#2a2a30', '#3a6a3a', '#e8a8c8', '#3a5ad0'];
    // фигурка: подставка, тело, голова, причёска (иногда хвостики или меч)
    function figure(g, x, y, z, s, k) {
        const hair = HAIR[k % HAIR.length], out = OUTFIT[(k * 3) % OUTFIT.length];
        CY(g, 0.05 * s, 0.055 * s, 0.012, '#1a1a1e', x, y + 0.006, z, 14);
        CY(g, 0.025 * s, 0.045 * s, 0.11 * s, out, x, y + 0.012 + 0.055 * s, z, 8);
        SP(g, 0.042 * s, '#f6dcc4', x, y + 0.012 + 0.14 * s, z, 1, 1, 1, 10);
        SP(g, 0.047 * s, hair, x, y + 0.012 + 0.152 * s, z - 0.006 * s, 1.02, 0.92, 1.02, 10);
        if (k % 3 === 0) { SP(g, 0.02 * s, hair, x - 0.05 * s, y + 0.13 * s, z, 0.7, 1.6, 0.7, 6); SP(g, 0.02 * s, hair, x + 0.05 * s, y + 0.13 * s, z, 0.7, 1.6, 0.7, 6); }
        if (k % 4 === 1) BX(g, 0.006 * s, 0.13 * s, 0.006 * s, '#d8dce4', x + 0.04 * s, y + 0.1 * s, z + 0.01, -0.5);
    }
    const ANIME_TITLES = ['ONE PIECE', 'FRIEREN', 'NARUTO', 'JUJUTSU KAISEN', 'SPY×FAMILY', 'DEMON SLAYER', 'CHAINSAW MAN', 'DEATH NOTE', 'ATTACK ON TITAN', 'BLEACH', 'HAIKYU!!', 'DRAGON BALL'];
    const JP_TITLES = ['ワンピース', 'フリーレン', 'ナルト', '呪術廻戦', 'スパイファミリー', '鬼滅の刃', 'チェンソーマン', 'デスノート', '進撃の巨人', 'ブリーチ', 'ハイキュー!!', 'ドラゴンボール'];
    const posterTex = (i) => cv(256, 360, (c, w, h) => {
        const hue = (i * 47) % 360, gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'hsl(' + hue + ',70%,62%)'); gr.addColorStop(1, 'hsl(' + ((hue + 60) % 360) + ',60%,28%)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(40 + k * 40, 120 + (k % 2) * 40, 24 + k * 3, 0, 7); c.fill(); }
        const x = 128; c.fillStyle = '#2a1a1a'; c.beginPath(); c.arc(x, 150, 58, Math.PI, 0); c.fill(); c.fillStyle = '#f6dcc4'; c.beginPath(); c.ellipse(x, 172, 46, 52, 0, 0, 7); c.fill(); c.fillStyle = HAIR[i % HAIR.length]; c.beginPath(); c.arc(x, 140, 56, Math.PI * 1.05, Math.PI * 1.95); c.fill();
        c.fillStyle = '#3a2a5a'; [-1, 1].forEach((s) => { c.beginPath(); c.ellipse(x + s * 18, 176, 8, 12, 0, 0, 7); c.fill(); }); c.fillStyle = '#fff'; [-1, 1].forEach((s) => c.fillRect(x + s * 18 - 4, 168, 4, 4));
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 262, w, 98); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '900 34px ' + JP; c.fillText(JP_TITLES[i % JP_TITLES.length], x, 304, 236); c.font = '800 20px ' + UI; c.fillText(ANIME_TITLES[i % ANIME_TITLES.length], x, 336, 236);
    });

    // ---------- оболочки ----------
    Object.assign(ROOMX.shells, {
        dev: () => {
            const floor = cv(256, 256, (g) => { g.fillStyle = '#5a4030'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 32) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, 256, 2); for (let x = (y / 32) % 2 ? 0 : 64; x < 256; x += 128) g.fillRect(x, y, 2, 32); } for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(255,220,180,' + Math.random() * 0.05 + ')'; g.fillRect(Math.random() * 256, Math.random() * 256, 20, 1); } });
            roomShell(lamb('#2a2b36'), lamb('#ffffff', { map: rep(floor, ROOM.w / 2, ROOM.d / 2) }), '#1a1a22', '#7c6af8');
            room.add(new THREE.AmbientLight(0xd8d0ff, 0.95));
            const { w, d, h } = ROOM;
            // RGB-подсветка под потолком
            [['back', w], ['left', d], ['right', d]].forEach(([wl, len], i) => { const p = wallPoint(wl, 0, h - 0.12, 0.03); const s = new THREE.Mesh(new THREE.BoxGeometry(len - 0.4, 0.035, 0.02), basic(['#7c6af8', '#36e2ff', '#ff6ab8'][i])); s.position.set(p.x, p.y, p.z); s.rotation.y = p.ry; room.add(s); });
        },
        animeshop: () => {
            const tiles = cv(256, 256, (g) => { g.fillStyle = '#f4f2f6'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#e4e0ea'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128); g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256); g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 128, 128, 128); });
            roomShell(lamb('#fbf8fc'), lamb('#ffffff', { map: rep(tiles, ROOM.w / 1.2, ROOM.d / 1.2) }), '#ffffff', '#ff6ab8');
            room.add(new THREE.AmbientLight(0xfff4fa, 0.85));
            const { w, d, h } = ROOM;
            [['back', w], ['left', d], ['right', d]].forEach(([wl, len], i) => { const p = wallPoint(wl, 0, h - 0.3, 0.03); const s = new THREE.Mesh(new THREE.BoxGeometry(len - 0.4, 0.22, 0.02), basic(['#ff6ab8', '#7c6af8', '#36c8e2'][i])); s.position.set(p.x, p.y, p.z); s.rotation.y = p.ry; room.add(s); });
        },
    });

    // ---------- мебель ----------
    const CODE = [
        [['#c678dd', 'const '], ['#e5c07b', 'street'], ['#abb2bf', ' = '], ['#c678dd', 'new '], ['#61afef', 'Street'], ['#abb2bf', '(words);']],
        [['#e5c07b', 'street'], ['#abb2bf', '.'], ['#61afef', 'light'], ['#abb2bf', '(w => w.'], ['#e06c75', 'learned'], ['#abb2bf', ');']],
        [['#5c6370', '// TODO: книги, две комнаты, ещё квизы']],
        [['#c678dd', 'function '], ['#61afef', 'walk'], ['#abb2bf', '(t) {']],
        [['#abb2bf', '  camera.'], ['#61afef', 'move'], ['#abb2bf', '(input);']],
        [['#abb2bf', '  TALK.'], ['#61afef', 'update'], ['#abb2bf', '();']],
        [['#abb2bf', '  '], ['#c678dd', 'if '], ['#abb2bf', '(near(piano)) '], ['#61afef', 'play'], ['#abb2bf', '('], ['#98c379', "'さくら'"], ['#abb2bf', ');']],
        [['#abb2bf', '}']],
        [['#c678dd', 'export default '], ['#e5c07b', 'street'], ['#abb2bf', ';']],
    ];
    const codeTex = (shift) => cv(512, 300, (c, w, h) => {
        c.fillStyle = '#1e2029'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a2c38'; c.fillRect(0, 0, w, 26); ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(16 + i * 18, 13, 5, 0, 7); c.fill(); });
        c.font = '600 19px ui-monospace, Consolas, monospace'; c.textBaseline = 'top';
        for (let i = 0; i < 11; i++) { const ln = CODE[(i + shift) % CODE.length]; let x = 44; c.fillStyle = '#4b5263'; c.fillText(String(i + 1 + shift).padStart(2, ' '), 8, 36 + i * 23); ln.forEach(([col, t]) => { c.fillStyle = col; c.fillText(t, x, 36 + i * 23); x += c.measureText(t).width; }); }
    });
    const roadmapTex = () => cv(512, 340, (c, w, h) => {
        c.fillStyle = '#f8f8f4'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c8c8cc'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
        c.fillStyle = '#2a3a8a'; c.font = '900 34px ' + UI; c.fillText('ROADMAP ✦ улица', 24, 52);
        const items = [['✓', 'пианист и газета', '#2a8a4a'], ['✓', 'аниме-магазин', '#2a8a4a'], ['✓', 'квизы по всем словам', '#2a8a4a'], ['…', 'книги, которые можно читать', '#c8322a'], ['…', 'дома в две комнаты', '#c8322a'], ['?', 'ваша идея → 目安箱', '#7c6af8']];
        c.font = '600 25px ' + UI; items.forEach(([m, t, col], i) => { c.fillStyle = col; c.fillText(m, 30, 100 + i * 40); c.fillStyle = '#2a2a30'; c.fillText(t, 66, 100 + i * 40); });
        c.fillStyle = '#ffd23f'; c.fillRect(380, 230, 110, 90); c.fillStyle = '#5a4a1a'; c.font = '600 16px ' + UI; c.fillText('не забыть:', 390, 256); c.fillText('поспать 💤', 390, 282);
    });
    const prevCatalog = ROOMX.catalog;
    ROOMX.catalog = (type, H) => {
        const { B, C } = H; const rnd = H.rnd; const pick = (a) => a[Math.floor(rnd() * a.length)];
        if (type === 'dev') return [
            // стол разработчика: три монитора с кодом, клавиатура, кофе, резиновая уточка; за столом сидит разработчик
            { name: 'devdesk', first: true, rule: 'wall', walls: ['back'], w: 2.6, d: 1.6, h: 1.6, solid: true, build(g) {
                const z0 = -0.45;
                B(g, 2.4, 0.05, 0.75, '#2a2a30', 0, 0.74, z0); [[-1.15, -0.32], [1.15, -0.32], [-1.15, 0.32], [1.15, 0.32]].forEach((p) => B(g, 0.05, 0.72, 0.05, '#1a1a1e', p[0], 0.36, z0 + p[1]));
                [[-0.72, 0.35], [0, 0], [0.72, -0.35]].forEach(([x, ry], i) => { const m = new THREE.Group(); m.position.set(x, 1.12, z0 - 0.12); m.rotation.y = ry; g.add(m); B(m, 0.66, 0.42, 0.03, '#111116', 0, 0, 0); plane(m, 0.62, 0.37, new THREE.MeshBasicMaterial({ map: codeTex(i * 3) }), 0, 0, 0.017); B(m, 0.05, 0.3, 0.05, '#1a1a1e', 0, -0.33, -0.03); B(m, 0.24, 0.02, 0.16, '#1a1a1e', 0, -0.37, -0.02); });
                B(g, 0.46, 0.025, 0.15, '#1e1e24', -0.05, 0.775, z0 + 0.18); for (let k = 0; k < 14; k++) B(g, 0.022, 0.012, 0.022, ['#ff6ab8', '#7c6af8', '#36e2ff'][k % 3], -0.24 + k * 0.029, 0.794, z0 + 0.15);
                B(g, 0.07, 0.025, 0.11, '#e8e8ec', 0.32, 0.775, z0 + 0.2);
                CY(g, 0.045, 0.04, 0.1, '#f4f0e8', 0.62, 0.815, z0 + 0.15, 14); CY(g, 0.04, 0.04, 0.005, '#4a2a1a', 0.62, 0.862, z0 + 0.15, 14);
                SP(g, 0.05, '#ffd23f', -0.72, 0.81, z0 + 0.12, 1, 0.85, 1); SP(g, 0.032, '#ffd23f', -0.72, 0.875, z0 + 0.14); BX(g, 0.03, 0.012, 0.03, '#f08a2a', -0.72, 0.87, z0 + 0.175);
                figure(g, 1.0, 0.765, z0 - 0.2, 1.3, 2); figure(g, 0.88, 0.765, z0 - 0.22, 1.1, 5);
                // кресло
                B(g, 0.52, 0.08, 0.5, '#2a2a3a', 0, 0.47, z0 + 0.82); B(g, 0.5, 0.62, 0.07, '#2a2a3a', 0, 0.82, z0 + 1.06); CY(g, 0.03, 0.03, 0.4, '#555', 0, 0.23, z0 + 0.82, 6);
                light(g, 0x7c9cff, 0.9, 3.2, 0, 1.3, z0 + 0.4);
                this.seats = [{ x: 0, z: z0 + 0.8, yaw: Math.PI, y: 0.51, pose: 'sit', acts: ['type'], role: 'dev', p: 1 }];
            } },
            // доска с планами
            { name: 'roadmap', rule: 'wall', walls: ['left', 'right'], w: 1.9, d: 0.1, h: 1.4, solid: false, build(g) {
                B(g, 1.78, 1.2, 0.04, '#d0d0d4', 0, 1.55, -0.02); plane(g, 1.7, 1.12, new THREE.MeshBasicMaterial({ map: roadmapTex() }), 0, 1.55, 0.005);
                B(g, 1.6, 0.04, 0.08, '#b8b8bc', 0, 0.93, 0.03); ['#c8322a', '#2a3a8a', '#2a8a4a'].forEach((col, i) => CY(g, 0.012, 0.012, 0.12, col, -0.3 + i * 0.1, 0.96, 0.04, 6).rotation.z = Math.PI / 2);
            } },
            // 目安箱 — ящик для пожеланий: сюда и пишут отзыв
            { name: 'meyasubako', rule: 'wall', walls: ['left', 'right'], w: 0.8, d: 0.6, h: 1.4, solid: true, build(g) {
                B(g, 0.5, 0.9, 0.4, '#7a5236', 0, 0.45, -0.05);
                const box = new THREE.Group(); box.position.set(0, 1.08, -0.02); g.add(box);
                B(box, 0.44, 0.34, 0.36, '#a87a4a', 0, 0, 0); B(box, 0.5, 0.04, 0.42, '#5a3a22', 0, 0.19, 0); B(box, 0.22, 0.025, 0.02, '#1a1a1e', 0, 0.1, 0.181);
                plane(box, 0.3, 0.16, new THREE.MeshBasicMaterial({ map: cv(256, 140, (c) => { c.fillStyle = '#f4ecd8'; c.fillRect(0, 0, 256, 140); c.fillStyle = '#1a1a22'; c.font = '900 62px ' + JP; c.textAlign = 'center'; c.fillText('目安箱', 128, 70); c.font = '700 26px ' + UI; c.fillStyle = '#c8322a'; c.fillText('отзывы и идеи', 128, 118); }) }), 0, -0.04, 0.182);
                box.traverse((o) => { if (o.isMesh) o.userData.post = true; });
                light(g, 0xffd8a0, 0.6, 2, 0, 1.6, 0.4);
            } },
            // стеллаж: манга, фигурки, растение
            { name: 'devshelf', rule: 'wall', walls: ['left', 'right'], w: 1.3, d: 0.45, h: 2.0, solid: true, build(g) {
                B(g, 1.2, 1.9, 0.04, '#3a2a22', 0, 0.95, -0.2); B(g, 0.04, 1.9, 0.38, '#3a2a22', -0.58, 0.95, -0.03); B(g, 0.04, 1.9, 0.38, '#3a2a22', 0.58, 0.95, -0.03); B(g, 1.2, 0.05, 0.38, '#3a2a22', 0, 1.9, -0.03); [0.35, 0.8, 1.25, 1.7].forEach((y) => BX(g, 1.1, 0.025, 0.34, '#5a4030', 0, y, 0));
                [0.35, 0.8].forEach((y) => { let x = -0.52; while (x < 0.5) { const bw = 0.025 + rnd() * 0.02, bh = 0.17 + rnd() * 0.06; BX(g, bw, bh, 0.15, pick(['#c8322a', '#2a4a8a', '#f4f0e8', '#e8a8c8', '#2a2a30', '#f0c030']), x + bw / 2, y + 0.0125 + bh / 2, 0.02); x += bw + 0.004; } });
                for (let k = 0; k < 4; k++) figure(g, -0.4 + k * 0.27, 1.2625, 0.02, 1.4, k + 3);
                CY(g, 0.07, 0.055, 0.12, '#c86a3a', 0.3, 1.77, 0.02, 12); SP(g, 0.11, '#3a8a3a', 0.3, 1.9, 0.02, 1, 0.8, 1);
                BX(g, 0.28, 0.2, 0.2, '#1e1e24', -0.3, 1.81, 0); for (let k = 0; k < 3; k++) BX(g, 0.012, 0.012, 0.005, ['#27c93f', '#ffbd2e', '#27c93f'][k], -0.42 + k * 0.03, 1.86, 0.102);
            } },
            // кресло-мешок и коврик
            { name: 'beanbag', rule: 'center', w: 1.4, d: 1.4, h: 0.7, solid: false, build(g) {
                CY(g, 0.65, 0.65, 0.01, '#3a3a5a', 0, 0.005, 0, 28); SP(g, 0.42, '#ff6ab8', 0.1, 0.3, 0.1, 1.1, 0.75, 1.1, 14); SP(g, 0.26, '#ff6ab8', 0.1, 0.55, -0.15, 1.2, 0.9, 0.8, 12);
            } },
            { name: 'neon', rule: 'wall', walls: ['left', 'right'], w: 1.6, d: 0.1, h: 0.6, high: true, build(g) {
                plane(g, 1.4, 0.45, basic('#ffffff', { map: cv(512, 160, (c) => { c.fillStyle = '#0e0e16'; c.fillRect(0, 0, 512, 160); c.shadowColor = '#7c6af8'; c.shadowBlur = 24; c.fillStyle = '#c8b8ff'; c.font = '900 84px ' + JP; c.textAlign = 'center'; c.fillText('開発中', 256, 110); }) }), 0, 2.2, 0.02);
                light(g, 0x9c8aff, 0.8, 2.6, 0, 2.2, 0.4);
            } },
            { name: 'lights', rule: 'none', build(g) { const { w, d, h } = ROOM; light(g, 0xffe0c0, 3.2, 9, -w / 4, h - 0.4, d / 6); light(g, 0xc8c0ff, 2.6, 9, w / 4, h - 0.4, -d / 6); light(g, 0xfff0e0, 2.0, 7, 0, h - 0.3, d / 3); } },
        ];
        if (type === 'animeshop') return [
            // стена-телевизор: на нём всегда идёт аниме
            { name: 'tvwall', first: true, rule: 'wall', walls: ['back'], w: 3.4, d: 0.5, h: 2.6, solid: true, build(g) {
                B(g, 3.1, 1.85, 0.1, '#111116', 0, 1.65, -0.15); animeScreen(g, 2.95, 1.66, 0, 1.65, -0.095);
                plane(g, 3.1, 0.34, basic('#ffffff', { map: cv(512, 56, (c) => { const gr = c.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, '#ff6ab8'); gr.addColorStop(1, '#7c6af8'); c.fillStyle = gr; c.fillRect(0, 0, 512, 56); c.fillStyle = '#fff'; c.font = '900 34px ' + JP; c.textAlign = 'center'; c.fillText('今期のアニメ ・ NOW ON AIR', 256, 40); }) }), 0, 2.8, -0.1);
                B(g, 3.0, 0.5, 0.45, '#ffffff', 0, 0.25, 0.05); for (let k = 0; k < 9; k++) figure(g, -1.3 + k * 0.32, 0.5, 0.05, 1.8, k);
            } },
            // манга: длинные стеллажи с корешками и табличкой «新刊»
            { name: 'manga', first: true, rule: 'wall', walls: ['left', 'right'], w: 3, d: 0.55, h: 2.1, fill: true, solid: true, build(g, r, len) {
                const L = Math.min(len, 6); B(g, L, 2.0, 0.04, '#ffffff', 0, 1.0, -0.25); B(g, 0.04, 2.0, 0.42, '#ffffff', -L / 2, 1.0, -0.06); B(g, 0.04, 2.0, 0.42, '#ffffff', L / 2, 1.0, -0.06); B(g, L, 0.1, 0.42, '#ffffff', 0, 2.0, -0.06); B(g, L, 0.12, 0.42, '#ffffff', 0, 0.06, -0.06);
                [0.3, 0.72, 1.14, 1.56].forEach((y) => { BX(g, L - 0.1, 0.02, 0.38, '#f0eef4', 0, y, -0.04); let x = -L / 2 + 0.08; while (x < L / 2 - 0.08) { const bw = 0.022 + rnd() * 0.012, bh = 0.18 + rnd() * 0.03; const col = pick(['#c8322a', '#2a4a8a', '#f4f0e8', '#e86aa8', '#2a2a30', '#f0c030', '#3a8a5a', '#7c6af8', '#ff8a3a']); BX(g, bw, bh, 0.13, col, x + bw / 2, y + 0.01 + bh / 2, 0.0); if (rnd() < 0.5) BX(g, bw + 0.002, 0.02, 0.003, '#ffffff', x + bw / 2, y + 0.01 + bh * 0.8, 0.066); x += bw + 0.002; } });
                for (let k = 0; k < Math.floor(L / 1.6); k++) plane(g, 0.36, 0.14, basic('#ffffff', { map: cv(128, 48, (c) => { c.fillStyle = '#ffd23f'; c.fillRect(0, 0, 128, 48); c.fillStyle = '#c8322a'; c.font = '900 32px ' + JP; c.textAlign = 'center'; c.fillText(pick(['新刊', '人気', '完結', '特典付']), 64, 36); }) }), -L / 2 + 0.8 + k * 1.6, 1.88, 0.16);
                this.stations = [{ x: -L / 4, z: 0.7, yaw: Math.PI, act: 'browse', role: 'otakuShopper', p: 0.55 }, { x: L / 4, z: 0.7, yaw: Math.PI, act: 'read', role: 'otakuShopper', hold: 'book', p: 0.45 }];
            } },
            // витрины с фигурками за стеклом
            { name: 'figurecase', first: true, rule: 'wall', walls: ['left', 'right'], w: 1.6, d: 0.6, h: 2.2, solid: true, count: [1, 2], build(g) {
                B(g, 1.5, 2.1, 0.04, '#f4f4f8', 0, 1.05, -0.28); B(g, 0.04, 2.1, 0.5, '#f4f4f8', -0.73, 1.05, -0.05); B(g, 0.04, 2.1, 0.5, '#f4f4f8', 0.73, 1.05, -0.05); B(g, 1.5, 0.3, 0.5, '#f4f4f8', 0, 0.15, -0.05); B(g, 1.5, 0.06, 0.5, '#f4f4f8', 0, 2.07, -0.05); BX(g, 1.42, 1.8, 0.01, '#ffe8f4', 0, 1.15, -0.255); const sh = [0.45, 0.9, 1.35, 1.8];
                sh.forEach((y, lv) => { BX(g, 1.4, 0.02, 0.44, '#e8e8f0', 0, y, -0.02); for (let k = 0; k < 5; k++) figure(g, -0.56 + k * 0.28, y + 0.01, -0.02 + (k % 2) * 0.06, 1.25 + (lv === 3 ? 0.3 : 0), k + lv * 5 + Math.floor(rnd() * 9)); });
                const gl = B(g, 1.42, 1.9, 0.01, '#d8ecff', 0, 1.12, 0.21, { transparent: true, opacity: 0.12 }); gl.userData.keep = true;
                plane(g, 1.0, 0.18, basic('#ffffff', { map: cv(256, 48, (c) => { c.fillStyle = '#ff6ab8'; c.fillRect(0, 0, 256, 48); c.fillStyle = '#fff'; c.font = '900 30px ' + JP; c.textAlign = 'center'; c.fillText('フィギュア', 128, 36); }) }), 0, 2.2, 0.21);
                light(g, 0xffffff, 0.7, 2.2, 0, 1.9, 0.5);
                this.stations = [{ x: 0.3, z: 0.75, yaw: Math.PI, act: 'browse', role: 'otakuShopper', p: 0.45 }];
            } },
            // автоматы гачапон: крутишь — выпадает капсула со словом из твоего словаря
            { name: 'gacha', rule: 'wall', walls: ['left', 'right', 'back'], w: 2.6, d: 0.8, h: 1.6, solid: true, build(g) {
                for (let k = 0; k < 5; k++) { const x = -1.0 + k * 0.5, col = ['#ff6ab8', '#36c8e2', '#ffd23f', '#7cff6a', '#b06bff'][k], mg = new THREE.Group(); mg.position.set(x, 0, -0.1); g.add(mg);
                    B(mg, 0.42, 0.8, 0.42, col, 0, 0.4, 0); const dome = B(mg, 0.4, 0.5, 0.4, '#e8f4ff', 0, 1.05, 0, { transparent: true, opacity: 0.25 }); dome.userData.keep = true;
                    for (let i = 0; i < 10; i++) SP(mg, 0.05, ['#ff6ab8', '#36c8e2', '#ffd23f', '#ffffff', '#ff8a3a'][i % 5], -0.12 + (i % 4) * 0.08, 0.86 + Math.floor(i / 4) * 0.08, -0.08 + (i % 3) * 0.08, 1, 1, 1, 8);
                    B(mg, 0.42, 0.06, 0.42, '#ffffff', 0, 1.33, 0); CY(mg, 0.05, 0.05, 0.03, '#d8dce4', 0, 0.55, 0.215, 14).rotation.x = Math.PI / 2; B(mg, 0.12, 0.08, 0.04, '#1a1a1e', 0, 0.28, 0.2);
                    plane(mg, 0.34, 0.2, basic('#ffffff', { map: cv(128, 76, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 76); c.fillStyle = col; c.font = '900 26px ' + JP; c.textAlign = 'center'; c.fillText('ことば', 64, 32); c.fillStyle = '#2a2a30'; c.font = '800 18px ' + UI; c.fillText('100¥', 64, 60); }) }), 0, 0.68, 0.212);
                    mg.traverse((o) => { if (o.isMesh) o.userData.gacha = true; }); }
                plane(g, 1.6, 0.26, basic('#ffffff', { map: cv(512, 80, (c) => { c.fillStyle = '#ff6ab8'; c.fillRect(0, 0, 512, 80); c.fillStyle = '#fff'; c.font = '900 46px ' + JP; c.textAlign = 'center'; c.fillText('ガチャガチャ ・ 言葉', 256, 58); }) }), 0, 1.55, 0.05);
                this.stations = [{ x: 0.5, z: 0.75, yaw: Math.PI, act: 'browse', role: 'otakuShopper', p: 0.4 }];
            } },
            // касса с продавцом
            { name: 'shopcounter', rule: 'wall', walls: ['left', 'right'], w: 2.2, d: 1.6, h: 1.2, solid: true, build(g) {
                B(g, 2.0, 0.95, 0.6, '#ff6ab8', 0, 0.475, 0.2); B(g, 2.1, 0.05, 0.7, '#ffffff', 0, 0.975, 0.2); B(g, 0.32, 0.22, 0.28, '#2a2a30', -0.5, 1.11, 0.2);
                for (let k = 0; k < 4; k++) SP(g, 0.06, ['#f4c8d8', '#f0d080', '#9fd8ff', '#c8f0a8'][k], 0.3 + k * 0.14, 1.06, 0.25, 1, 0.9, 1);
                this.stations = [{ x: 0, z: -0.45, yaw: 0, act: 'scan', role: 'otakuClerk', p: 1, outfit: 'konbini' }];
            } },
            // корзина с плюшевыми игрушками
            { name: 'plushbin', rule: 'center', w: 1.6, d: 1.6, h: 1.0, solid: true, build(g) {
                CY(g, 0.62, 0.55, 0.62, '#ffd23f', 0, 0.31, 0, 22); CY(g, 0.58, 0.58, 0.02, '#ffe88a', 0, 0.62, 0, 22);
                for (let k = 0; k < 16; k++) { const a = k * 2.4, r0 = 0.12 + (k % 4) * 0.11, x = Math.cos(a) * r0, z = Math.sin(a) * r0, c2 = ['#f4c8d8', '#f0d080', '#9fd8ff', '#c8f0a8', '#f4f4f4', '#d8a8f0'][k % 6]; SP(g, 0.1, c2, x, 0.66 + (k % 3) * 0.04, z, 1, 0.9, 1, 10); SP(g, 0.065, c2, x, 0.78 + (k % 3) * 0.04, z + 0.03, 1, 1, 1, 8); }
                plane(g, 0.7, 0.24, basic('#ffffff', { map: cv(256, 88, (c) => { c.fillStyle = '#c8322a'; c.fillRect(0, 0, 256, 88); c.fillStyle = '#fff'; c.font = '900 44px ' + JP; c.textAlign = 'center'; c.fillText('ぬいぐるみ', 128, 60); }) }), 0, 1.15, 0, 0);
            } },
            // постеры и гобелены
            { name: 'animeposters', rule: 'wall', walls: ['left', 'right', 'back'], w: 2.6, d: 0.05, h: 1.0, high: true, build(g) { for (let k = 0; k < 3; k++) plane(g, 0.62, 0.87, new THREE.MeshLambertMaterial({ map: posterTex(Math.floor(rnd() * 12) + k) }), -0.8 + k * 0.8, 2.55, 0.01); } },
            { name: 'banners', rule: 'none', build(g) { const { w, d, h } = ROOM; for (let k = 0; k < 4; k++) { plane(g, 0.6, 0.85, new THREE.MeshLambertMaterial({ map: posterTex(k * 3 + 1) }), (k % 2 ? 1 : -1) * w / 5, h - 0.65, -d / 3 + k * d / 5); } } },
            { name: 'lights', rule: 'none', build(g) { const { w, d, h } = ROOM; [[-w / 4, -d / 4], [w / 4, -d / 4], [-w / 4, d / 4], [w / 4, d / 4]].forEach((q) => light(g, 0xfff4fa, 2.4, 9, q[0], h - 0.3, q[1])); } },
        ];
        return prevCatalog(type, H);
    };

    // ---------- вход с улицы ----------
    const prevDoor = ROOMX.door;
    ROOMX.door = (rtype, o) => {
        if (rtype !== 'dev' && rtype !== 'animeshop') return prevDoor(rtype, o);
        const { door: dr, side, dz, W2: w2, world: wd } = o;
        const plaque = (txt, bg, fg, x, y, w) => { const ch = 40 + [...txt].length * 64; w = w || 0.45; const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * ch / 128), new THREE.MeshBasicMaterial({ map: cv(128, ch, (c) => { c.fillStyle = bg; c.fillRect(0, 0, 128, ch); c.fillStyle = fg; c.font = '900 58px ' + JP; c.textAlign = 'center'; [...txt].forEach((ch, i) => c.fillText(ch, 64, 64 + i * 64)); }), fog: true })); p.position.set(side * (w2 - 0.02), y || 2.0, dz + (x || 0.9)); p.rotation.y = -side * Math.PI / 2; wd.add(p); };
        const strip = (col, y, h) => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, h || 0.3, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(col) })); s.position.set(side * (w2 - 0.05), y, dz); wd.add(s); };
        if (rtype === 'dev') { dr.material.color.set('#c8c0ff'); strip('#7c6af8', 2.45, 0.14); plaque('開発', '#1a1a2a', '#c8b8ff', 0.9, 2.0, 0.42); }
        else { dr.material.color.set('#ffe0f0'); strip('#ff6ab8', 2.5, 0.3); strip('#7c6af8', 2.25, 0.1); plaque('アニメ', '#ff6ab8', '#ffffff', 0.95, 1.85, 0.4); }
    };
    // реплики жителей новых комнат (пузыри и голос)
    Object.assign(LIFE.LINES, {
        dev: { lines: [['あれ、バグかな…', 'Хм, это баг?…'], ['よし、動いた！', 'Есть, заработало!'], ['コーヒー、もう一杯…', 'Ещё чашку кофе…'], ['新しい部屋、どうかな？', 'Как тебе новая комната?']] },
        otakuClerk: { greet: ['いらっしゃいませー！', 'Добро пожаловать!', 'bow'], lines: [['新刊、入荷しました！', 'Новые тома уже в продаже!'], ['特典付きですよ！', 'С бонусом!'], ['ガチャもどうぞ！', 'Попробуйте гачу!']] },
        otakuShopper: { lines: [['これ、限定版だ！', 'Это же лимитка!'], ['推しのフィギュア、かわいい…', 'Фигурка любимого героя — милота…'], ['全巻そろえたい！', 'Хочу собрать все тома!'], ['お金が足りない…', 'Денег не хватает…']] },
    });
})();
