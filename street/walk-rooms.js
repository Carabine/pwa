// ===== Новые комнаты: три разные квартиры (однушка студента, японская васицу, лофт) и заведения (рамэнная, кафе, книжный, игровой зал) =====
// Встраивается build-walk.mjs. Модули мебели сами описывают, где в них сидят (seats) и стоят (stations) люди —
// LIFE.populate заселяет такие комнаты по этим меткам.
const ROOMX = (() => {
    const types = ['oneroom', 'washitsu', 'loft', 'ramen', 'cafe', 'books', 'arcade'];
    const names = { oneroom: 'ワンルーム · однушка студента', washitsu: '和室 · японская комната', loft: 'ロフト · лофт', ramen: 'ラーメン屋 · рамэнная', cafe: '喫茶店 · кафе', books: '本屋 · книжный', arcade: 'ゲーセン · игровой зал' };
    const hints = { oneroom: 'Однушка', washitsu: 'Японская комната', loft: 'Лофт', ramen: 'Рамэнная', cafe: 'Кафе', books: 'Книжный', arcade: 'Игровой зал' };
    // какие предметы-слова уместны (по старым типам) и на чём висят слова без предмета
    const alias = { oneroom: 'home', washitsu: 'home', loft: 'home', ramen: 'izakaya', cafe: 'home', books: 'class', arcade: 'konbini' };
    const surf = { oneroom: 'home', washitsu: 'home', loft: 'home', ramen: 'izakaya', cafe: 'home', books: 'konbini', arcade: 'konbini' };
    const size = {
        oneroom: (r) => ({ w: 4.8 + Math.floor(r() * 3) * 0.4, d: 6.6 + Math.floor(r() * 3) * 0.5, h: 2.5 }),
        washitsu: (r) => ({ w: 6.4 + Math.floor(r() * 3) * 0.6, d: 7.6 + Math.floor(r() * 3) * 0.8, h: 2.7 }),
        loft: (r) => ({ w: 8.2 + Math.floor(r() * 3) * 0.8, d: 9 + Math.floor(r() * 3) * 1.0, h: 3.6 }),
        ramen: (r) => ({ w: 6.2 + Math.floor(r() * 3) * 0.6, d: 8.5 + Math.floor(r() * 3) * 1.0, h: 2.9 }),
        cafe: (r) => ({ w: 7.0 + Math.floor(r() * 3) * 0.8, d: 9 + Math.floor(r() * 3) * 1.0, h: 3.0 }),
        books: (r) => ({ w: 7.0 + Math.floor(r() * 3) * 0.8, d: 10 + Math.floor(r() * 3) * 1.0, h: 3.0 }),
        arcade: (r) => ({ w: 8.0 + Math.floor(r() * 3) * 0.8, d: 10 + Math.floor(r() * 3) * 1.0, h: 3.2 }),
    };
    const cv = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return makeTex(c); };
    const rep = (t, x, y) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(x, y); return t; };
    const basic = (col, extra) => new THREE.MeshBasicMaterial(Object.assign({ color: new THREE.Color(col) }, extra || {}));
    const plane = (g, w, h, mat, x, y, z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.position.set(x, y, z); if (ry) p.rotation.y = ry; g.add(p); return p; };
    const light = (g, col, inten, dist, x, y, z) => { const l = new THREE.PointLight(col, inten, dist, 1.4); l.position.set(x, y, z); g.add(l); return l; };

    // ---------- оболочки ----------
    const shells = {
        oneroom: () => { roomShell(lamb('#f2f0ea'), lamb('#ffffff', { map: rep(texWood('#b8915a', 6), 3, 3) }), '#f4f4f0', '#d8d0c0'); room.add(new THREE.AmbientLight(0xfff0e0, 0.45)); },
        washitsu: () => {
            const tat = cv(256, 128, (g) => { g.fillStyle = '#a8ac70'; g.fillRect(0, 0, 256, 128); for (let y = 0; y < 128; y += 3) { g.fillStyle = 'rgba(0,0,0,' + (y % 6 ? 0.05 : 0.11) + ')'; g.fillRect(0, y, 256, 1); } g.fillStyle = '#2a2a1a'; g.fillRect(0, 0, 256, 7); g.fillRect(0, 121, 256, 7); });
            const wall = cv(256, 256, (g) => { g.fillStyle = '#e2d2ae'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(120,90,50,' + Math.random() * 0.06 + ')'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } g.fillStyle = '#6a4424'; g.fillRect(0, 0, 14, 256); g.fillRect(0, 40, 256, 10); });
            roomShell(lamb('#ffffff', { map: rep(wall, ROOM.d / 1.8, 1) }), lamb('#ffffff', { map: rep(tat, ROOM.w / 1.8, ROOM.d / 0.9) }), '#9a7a52', '#c8a070');
            room.add(new THREE.AmbientLight(0xffe2b8, 0.5));
        },
        loft: () => {
            const conc = cv(256, 256, (g) => { g.fillStyle = '#8a8a86'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 2500; i++) { g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,255,255') + ',' + Math.random() * 0.07 + ')'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } g.strokeStyle = 'rgba(0,0,0,0.12)'; g.strokeRect(0, 0, 256, 128); g.strokeRect(0, 128, 256, 128); g.fillStyle = 'rgba(0,0,0,0.25)'; [[40, 32], [216, 32], [40, 96], [216, 96], [40, 160], [216, 160], [40, 224], [216, 224]].forEach((p) => { g.beginPath(); g.arc(p[0], p[1], 4, 0, 7); g.fill(); }); });
            roomShell(lamb('#ffffff', { map: rep(conc, ROOM.d / 2.4, ROOM.h / 2.4) }), lamb('#ffffff', { map: rep(texWood('#3a2818', 7), 4, 4) }), '#26262a', '#3a3a40');
            room.add(new THREE.AmbientLight(0xffe8d0, 0.32));
        },
        ramen: () => {
            const wall = cv(128, 256, (g) => { g.fillStyle = '#efe4c8'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#f4f4f0'; g.fillRect(0, 150, 128, 106); g.strokeStyle = 'rgba(0,0,0,0.12)'; for (let y = 150; y < 256; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); } for (let x = 0; x < 128; x += 16) { g.beginPath(); g.moveTo(x, 150); g.lineTo(x, 256); g.stroke(); } g.fillStyle = '#c8322a'; g.fillRect(0, 144, 128, 6); });
            const fl = cv(128, 128, (g) => { g.fillStyle = '#6a2a22'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); } });
            roomShell(lamb('#ffffff', { map: rep(wall, ROOM.d / 1.2, 1) }), lamb('#ffffff', { map: rep(fl, ROOM.w / 1.2, ROOM.d / 1.2) }), '#2a1a10', '#c8322a');
            room.add(new THREE.AmbientLight(0xffe0c0, 0.6));
        },
        cafe: () => {
            const fl = cv(128, 128, (g) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#2a2422' : '#e8e0d0'; g.fillRect(x * 16, y * 16, 16, 16); } });
            roomShell(lamb('#ffffff', { map: rep(texWood('#4a3020', 9), ROOM.d / 3, 1) }), lamb('#ffffff', { map: rep(fl, ROOM.w / 1.6, ROOM.d / 1.6) }), '#e8dcc4', '#8a5a2a');
            room.add(new THREE.AmbientLight(0xffdcb0, 0.45));
        },
        books: () => { roomShell(lamb('#efe8da'), lamb('#ffffff', { map: rep(texWood('#a07a4a', 8), 4, 4) }), '#f4f2ec', '#e8f0e0'); room.add(new THREE.AmbientLight(0xfff4e4, 0.55)); },
        arcade: () => {
            const carpet = cv(256, 256, (g) => { g.fillStyle = '#141838'; g.fillRect(0, 0, 256, 256); const cols = ['#ff3fa4', '#36e2ff', '#ffd23f', '#7cff6a', '#b06bff']; for (let i = 0; i < 70; i++) { g.fillStyle = cols[i % 5]; g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.rotate(Math.random() * 6); if (i % 3 === 0) g.fillRect(-7, -2, 14, 4); else if (i % 3 === 1) { g.beginPath(); g.arc(0, 0, 5, 0, 7); g.lineWidth = 2; g.strokeStyle = cols[i % 5]; g.stroke(); } else { g.beginPath(); g.moveTo(0, -6); g.lineTo(5, 4); g.lineTo(-5, 4); g.fill(); } g.restore(); } });
            roomShell(lamb('#1a1a28'), lamb('#ffffff', { map: rep(carpet, ROOM.w / 2.5, ROOM.d / 2.5) }), '#0a0a10', '#ff3fa4');
            room.add(new THREE.AmbientLight(0xc8b8ff, 0.8));
            // неоновая полоса под потолком по периметру
            const { w, d, h } = ROOM;
            [['back', w], ['left', d], ['right', d]].forEach(([wl, len], i) => { const p = wallPoint(wl, 0, h - 0.25, 0.03); const s = new THREE.Mesh(new THREE.BoxGeometry(len - 0.4, 0.05, 0.03), basic(['#ff3fa4', '#36e2ff', '#b06bff'][i])); s.position.set(p.x, p.y, p.z); s.rotation.y = p.ry; room.add(s); });
        },
    };

    // ---------- каталог модулей ----------
    function catalog(type, H) {
        const { B, C, bookRow, lantern, window_, tv, poster, COMMON } = H; const rnd = H.rnd;
        const Cr = (g, r1, r2, hh, col, x, y, z, rx, rz, seg) => { const m = C(g, r1, r2, hh, col, x, y, z, seg); m.rotation.x = rx || 0; m.rotation.z = rz || 0; return m; };
        const sph = (g, r, col, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), lamb(col)); m.position.set(x, y, z); m.scale.set(sx || 1, sy || sx || 1, sz || sx || 1); g.add(m); return m; };
        const pick = (a) => a[Math.floor(rnd() * a.length)];
        const posters = COMMON.find((m) => m.name === 'posters'), skirting = COMMON.find((m) => m.name === 'skirting'), ac = COMMON.find((m) => m.name === 'ac'), display = COMMON.find((m) => m.name === 'display');
        const ceilLights = (col, inten, step) => ({ name: 'lights', rule: 'none', build(g) { const { w, d, h } = ROOM; for (let z = -d / 2 + 1.6; z < d / 2 - 0.8; z += step) for (let x = -w / 2 + 1.6; x < w / 2 - 0.8; x += step * 0.85) { light(g, col, inten, step * 2.4, x, h - 0.4, z); const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 18), basic('#fff8ec')); disc.position.set(x, h - 0.02, z); g.add(disc); } } });
        const plant = { name: 'plant', rule: 'corner', walls: ['left', 'right', 'back', 'front'], w: 0.7, d: 0.7, h: 1.5, solid: true, build(g) { const t = PROP_BUILDERS['木'](lamb); t.scale.setScalar(0.85); g.add(t); } };
        const windowM = (walls, w) => ({ name: 'window', rule: 'wall', walls, w: w || 2.0, d: 0.1, h: 0.5, high: true, build(g) { window_(g, w || 2.0); const cc = pick(['#c8d8e8', '#e8c8c8', '#d8e0c0', '#f0e0c0']); [-1, 1].forEach((k) => B(g, 0.35, 1.7, 0.04, cc, k * ((w || 2.0) / 2 + 0.05), 1.8, 0.08)); } });

        if (type === 'oneroom') return [skirting, ac, posters, windowM(['back', 'left', 'right'], 1.6),
            { name: 'bed', first: true, rule: 'wall', walls: ['left', 'right', 'back'], w: 2.1, d: 1.05, h: 0.7, solid: true, build(g) {
                B(g, 2.0, 0.28, 1.0, '#8a6a48', 0, 0.14, 0); B(g, 1.92, 0.18, 0.94, '#f2f0ea', 0, 0.37, 0); B(g, 1.3, 0.09, 0.98, pick(['#4a6ab8', '#c86a6a', '#5a9a7a', '#8a6a9a']), 0.3, 0.49, 0); B(g, 0.42, 0.12, 0.6, '#e8eef8', -0.72, 0.52, 0); B(g, 0.06, 0.75, 1.0, '#8a6a48', -0.99, 0.38, 0);
                for (let i = 0; i < 4; i++) B(g, 0.12, 0.17, 0.02, pick(['#e04a4a', '#3a7fe0', '#f0c030']), 0.4 + i * 0.13, 0.62, 0.3, null).rotation.x = -1.4; // манга на одеяле
                this.seats = [{ x: 0.45, z: 0.32, yaw: 0, y: 0.5, pose: 'sit', acts: ['read', 'phone'], hold: { read: 'book', phone: 'phone' }, role: 'student1r', p: 0.5 }];
                this.spots = [{ kind: 'table', x: 0.7, y: 0.56, z: -0.2 }]; } },
            { name: 'studyDesk', first: true, rule: 'wall', walls: ['left', 'right', 'back'], w: 1.4, d: 1.4, h: 1.3, solid: true, build(g) {
                const z0 = -0.38; B(g, 1.3, 0.04, 0.6, '#ecebe6', 0, 0.72, z0); [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25]].forEach((p) => B(g, 0.04, 0.7, 0.04, '#2a2a30', p[0], 0.35, z0 + p[1]));
                B(g, 0.66, 0.4, 0.04, '#16161c', -0.1, 1.08, z0 - 0.18); plane(g, 0.6, 0.34, new THREE.MeshBasicMaterial({ map: LIFE.screenTex() }), -0.1, 1.08, z0 - 0.155); C(g, 0.02, 0.02, 0.22, '#2a2a30', -0.1, 0.84, z0 - 0.2);
                B(g, 0.42, 0.02, 0.14, '#2a2a30', -0.1, 0.75, z0 + 0.06); B(g, 0.07, 0.02, 0.1, '#2a2a30', 0.22, 0.75, z0 + 0.08); C(g, 0.04, 0.035, 0.09, '#f0f0f0', 0.42, 0.785, z0);
                for (let i = 0; i < 4; i++) B(g, 0.22, 0.04, 0.3, pick(['#c84a4a', '#3a6fd9', '#2a8a5a', '#f0e8d8']), 0.5, 0.76 + i * 0.04, z0 - 0.1);
                C(g, 0.012, 0.012, 0.4, '#2a2a30', -0.55, 0.94, z0 - 0.15); const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.1, 12, 1, true), basic('#fff0c8', { side: THREE.DoubleSide })); lamp.position.set(-0.5, 1.13, z0 - 0.1); g.add(lamp); light(g, 0xffe8c0, 1.0, 3, -0.5, 1.05, z0);
                B(g, 0.52, 0.08, 0.5, '#2a2a34', 0, 0.46, 0.3); B(g, 0.52, 0.78, 0.1, '#c83a3a', 0, 0.9, 0.55); C(g, 0.03, 0.03, 0.4, '#6a6a74', 0, 0.22, 0.3); C(g, 0.25, 0.25, 0.03, '#2a2a30', 0, 0.03, 0.3, 5);
                this.seats = [{ x: 0, z: 0.3, yaw: Math.PI, y: 0.5, pose: 'sit', acts: ['type'], role: 'student1r', p: 0.9 }];
                this.spots = [{ kind: 'table', x: 0.25, y: 0.75, z: z0 + 0.1 }]; } },
            { name: 'miniKitchen', rule: 'wall', walls: ['left', 'right', 'front'], w: 1.7, d: 0.62, h: 1.2, solid: true, build(g) {
                B(g, 1.1, 0.86, 0.56, '#e6e6ea', -0.28, 0.43, 0); B(g, 0.42, 0.03, 0.32, '#a8acb4', -0.5, 0.875, 0); C(g, 0.012, 0.012, 0.26, '#a8acb4', -0.5, 1.0, -0.2);
                C(g, 0.09, 0.09, 0.02, '#1a1a20', 0.08, 0.88, 0); C(g, 0.075, 0.065, 0.15, '#c8ccd4', 0.08, 0.96, 0);
                B(g, 0.52, 1.12, 0.56, '#f6f6f6', 0.56, 0.56, 0); B(g, 0.02, 0.3, 0.03, '#a8acb4', 0.34, 0.8, 0.29);
                for (let i = 0; i < 3; i++) { C(g, 0.05, 0.04, 0.08, '#f4f0e8', 0.45 + i * 0.11, 1.16, -0.05); C(g, 0.052, 0.052, 0.008, '#e04a3a', 0.45 + i * 0.11, 1.205, -0.05); }
                this.notes = [{ x: 0.6, y: 0.78, z: 0.285 }]; this.spots = [{ kind: 'table', x: -0.15, y: 0.88, z: 0.05 }]; } },
            { name: 'zataku', rule: 'center', w: 1.5, d: 1.5, h: 0.4, solid: true, build(g) {
                B(g, 0.9, 0.04, 0.6, '#c8a070', 0, 0.33, 0); [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]].forEach((p) => B(g, 0.04, 0.31, 0.04, '#8a6a48', p[0], 0.155, p[1]));
                B(g, 0.32, 0.015, 0.22, '#c8ccd4', -0.18, 0.36, -0.05); const sc = plane(g, 0.3, 0.19, basic('#7fb0ff'), -0.18, 0.46, -0.16); sc.rotation.x = -0.25; B(g, 0.32, 0.2, 0.01, '#b8bcc4', -0.18, 0.46, -0.165).rotation.x = -0.25;
                C(g, 0.05, 0.04, 0.09, '#f4f0e8', 0.25, 0.4, 0.05); C(g, 0.052, 0.052, 0.008, '#e04a3a', 0.25, 0.445, 0.05);
                B(g, 0.52, 0.08, 0.52, pick(['#5a8ad0', '#d07a5a', '#7aa05a']), 0, 0.04, 0.62);
                this.seats = [{ x: 0, z: 0.62, yaw: Math.PI, y: 0.08, pose: 'kotatsu', acts: ['type', 'eat'], hold: { eat: 'chopsticks' }, role: 'student1r', p: 0.45 }];
                this.spots = [{ kind: 'table', x: 0.2, y: 0.36, z: -0.15 }]; } },
            { name: 'guitar', rule: 'corner', walls: ['left', 'right', 'back'], w: 0.6, d: 0.6, h: 1.1, solid: true, build(g) { const gt = PROP_BUILDERS['ギター'] ? PROP_BUILDERS['ギター'](lamb) : null; if (gt) { gt.scale.setScalar(0.9); g.add(gt); } else { B(g, 0.35, 0.5, 0.1, '#c8783a', 0, 0.35, 0); B(g, 0.06, 0.6, 0.04, '#3a2416', 0, 0.85, 0); } B(g, 0.3, 0.32, 0.25, '#1a1a1e', 0.18, 0.16, 0.12); } },
            { name: 'figures', rule: 'wall', walls: ['left', 'right', 'back'], w: 1.1, d: 0.3, h: 0.4, high: true, build(g) { B(g, 1.1, 0.03, 0.24, '#f0f0f0', 0, 1.85, 0.12); for (let i = 0; i < 6; i++) { const x = -0.45 + i * 0.18; C(g, 0.035, 0.04, 0.02, '#2a2a30', x, 1.875, 0.12); C(g, 0.028, 0.035, 0.1, pick(['#e04a7a', '#3a7fe0', '#f0c030', '#40b060']), x, 1.93, 0.12); sph(g, 0.03, '#f3d6bd', x, 2.01, 0.12); sph(g, 0.033, pick(['#2a2a30', '#f0d040', '#e06aa0', '#5ad0f0']), x, 2.03, 0.115, 1, 0.8, 1); } } },
            { name: 'lights', rule: 'none', build(g) { const { h } = ROOM; light(g, 0xfff4e4, 2.3, 9, 0, h - 0.3, 0); const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20), basic('#fffaf0')); disc.position.set(0, h - 0.03, 0); g.add(disc); } },
        ];

        if (type === 'washitsu') {
            const kanji = pick(['和', '夢', '心', '道', '花', '月', '静', '空']);
            return [skirting,
            { name: 'tokonoma', first: true, rule: 'wall', walls: ['back'], w: 2.1, d: 0.8, h: 2.4, solid: true, build(g) {
                B(g, 1.95, 0.14, 0.74, '#3a2414', 0, 0.07, 0.02); B(g, 1.95, 2.3, 0.04, '#d8c8a0', 0, 1.2, -0.37); B(g, 0.1, 2.5, 0.1, '#6a4424', 1.02, 1.25, 0.32); B(g, 2.1, 0.12, 0.12, '#5a3a20', 0, 2.3, 0.32);
                const scroll = cv(128, 320, (c) => { c.fillStyle = '#5a6a4a'; c.fillRect(0, 0, 128, 320); c.fillStyle = '#f4ecd8'; c.fillRect(14, 40, 100, 240); c.fillStyle = '#1a1410'; c.font = '700 84px ' + JP; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(kanji, 64, 150); c.fillStyle = '#c8322a'; c.fillRect(84, 236, 16, 16); });
                plane(g, 0.42, 1.05, lamb('#ffffff', { map: scroll }), -0.35, 1.45, -0.345); C(g, 0.012, 0.012, 0.48, '#3a2416', -0.35, 0.92, -0.33, 6).rotation.z = Math.PI / 2; C(g, 0.012, 0.012, 0.48, '#3a2416', -0.35, 1.98, -0.33, 6).rotation.z = Math.PI / 2;
                C(g, 0.06, 0.08, 0.2, '#2a3a4a', 0.45, 0.24, 0.05, 14); for (let i = 0; i < 3; i++) { const b = C(g, 0.006, 0.006, 0.45, '#4a3a22', 0.45 + (i - 1) * 0.05, 0.55, 0.05, 5); b.rotation.z = (i - 1) * 0.35; sph(g, 0.035, pick(['#f08ab0', '#ffffff', '#f0c8d8']), 0.45 + (i - 1) * 0.13, 0.75, 0.05); }
                this.spots = [{ kind: 'table', x: 0.1, y: 0.14, z: 0.15 }]; } },
            { name: 'chabudai', first: true, rule: 'center', w: 2.3, d: 2.3, h: 0.4, solid: true, build(g) {
                C(g, 0.55, 0.55, 0.05, '#5a3a22', 0, 0.33, 0, 28); C(g, 0.09, 0.12, 0.3, '#3a2414', 0, 0.15, 0);
                B(g, 0.36, 0.02, 0.24, '#3a2414', 0.1, 0.365, 0); sph(g, 0.07, '#3a4a3a', 0.1, 0.43, 0, 1, 0.8, 1); C(g, 0.012, 0.012, 0.08, '#3a4a3a', 0.18, 0.44, 0, 5).rotation.z = 1.1;
                [[-0.3, 0.2], [0.35, 0.25], [-0.25, -0.28], [0.3, -0.3]].forEach((p) => { C(g, 0.03, 0.025, 0.05, '#e8e0d0', p[0], 0.38, p[1], 10); C(g, 0.027, 0.027, 0.004, '#7a9a3a', p[0], 0.403, p[1], 10); });
                const zc = pick(['#8a2a3a', '#2a3a6a', '#5a3a6a']); [[0, 0.88], [0, -0.88], [0.88, 0], [-0.88, 0]].forEach((p) => B(g, 0.5, 0.07, 0.5, zc, p[0], 0.035, p[1]));
                this.seats = [
                    { x: 0, z: 0.88, yaw: Math.PI, y: 0.07, pose: 'seiza', acts: ['mikan', 'talk'], hold: { mikan: 'cup' }, role: 'elder', fem: true, old: true, outfit: 'kimono', p: 0.9 },
                    { x: 0.88, z: 0, yaw: -Math.PI / 2, y: 0.07, pose: 'seiza', acts: ['read', 'talk'], hold: { read: 'book' }, role: 'elder', old: true, p: 0.7 },
                    { x: -0.88, z: 0, yaw: Math.PI / 2, y: 0.07, pose: 'seiza', acts: ['mikan', 'talk'], hold: { mikan: 'cup' }, role: 'elder', p: 0.35 },
                ];
                this.spots = [{ kind: 'table', x: -0.2, y: 0.36, z: 0.05 }]; } },
            { name: 'shoji', rule: 'wall', walls: ['left', 'right'], w: 6, d: 0.1, h: 2.3, fill: true, high: true, build(g, r, len) {
                const n = Math.max(2, Math.floor(len / 0.92)), pw = len / n;
                for (let i = 0; i < n; i++) { const x = -len / 2 + pw * (i + 0.5); plane(g, pw - 0.06, 1.85, basic('#f6ead0'), x, 1.05, 0.03); B(g, 0.04, 1.95, 0.05, '#5a3a20', x - pw / 2 + 0.02, 1.05, 0.05); for (let k = 1; k < 5; k++) B(g, pw - 0.06, 0.02, 0.03, '#6a4424', x, 0.15 + k * 0.37, 0.05); for (let k = 1; k < 3; k++) B(g, 0.02, 1.85, 0.03, '#6a4424', x - pw / 2 + k * pw / 3, 1.05, 0.05); }
                B(g, len, 0.06, 0.08, '#5a3a20', 0, 2.0, 0.05); B(g, len, 0.06, 0.08, '#5a3a20', 0, 0.1, 0.05); } },
            { name: 'tansu', rule: 'wall', walls: ['left', 'right', 'front'], w: 1.2, d: 0.48, h: 1.25, solid: true, build(g) { B(g, 1.2, 1.2, 0.45, '#5a3418', 0, 0.6, 0); for (let r = 0; r < 4; r++) { B(g, 1.12, 0.26, 0.02, '#6a4020', 0, 0.16 + r * 0.29, 0.23); [-0.3, 0.3].forEach((x) => B(g, 0.12, 0.04, 0.02, '#2a2a28', x, 0.16 + r * 0.29, 0.245)); } this.spots = [{ kind: 'table', x: 0.2, y: 1.2, z: 0 }]; } },
            { name: 'andon', rule: 'corner', walls: ['left', 'right', 'back', 'front'], w: 0.45, d: 0.45, h: 0.9, solid: true, build(g) { [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]].forEach((p) => B(g, 0.03, 0.85, 0.03, '#3a2414', p[0], 0.42, p[1])); B(g, 0.27, 0.42, 0.27, '#fff0c8', 0, 0.52, 0, { emissive: new THREE.Color('#ffd890'), emissiveIntensity: 0.9 }); light(g, 0xffcf8a, 1.6, 5, 0, 0.55, 0); } },
            { name: 'byobu', rule: 'wall', walls: ['left', 'right', 'back'], w: 2.2, d: 0.45, h: 1.5, solid: true, build(g) {
                const art = cv(256, 160, (c) => { const gr = c.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#e8c860'); gr.addColorStop(1, '#c8a040'); c.fillStyle = gr; c.fillRect(0, 0, 256, 160); c.fillStyle = 'rgba(60,70,60,0.75)'; c.beginPath(); c.moveTo(0, 130); c.lineTo(60, 60); c.lineTo(110, 110); c.lineTo(170, 40); c.lineTo(256, 120); c.lineTo(256, 160); c.lineTo(0, 160); c.fill(); c.fillStyle = 'rgba(255,255,255,0.65)'; c.beginPath(); c.moveTo(170, 40); c.lineTo(155, 58); c.lineTo(185, 56); c.fill(); c.strokeStyle = 'rgba(40,30,20,0.6)'; c.lineWidth = 3; c.beginPath(); c.moveTo(20, 150); c.quadraticCurveTo(80, 120, 120, 150); c.stroke(); });
                for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.45), lamb('#ffffff', { map: art, side: THREE.DoubleSide })); p.material.map = art.clone(); p.material.map.repeat.set(0.25, 1); p.material.map.offset.set(i * 0.25, 0); p.material.map.needsUpdate = true; p.position.set(-0.82 + i * 0.55, 0.78, (i % 2 ? 0.1 : -0.1)); p.rotation.y = i % 2 ? 0.35 : -0.35; g.add(p); } } },
            { name: 'bonsai', rule: 'wall', walls: ['left', 'right', 'front'], w: 0.7, d: 0.5, h: 0.7, solid: true, build(g) { B(g, 0.6, 0.3, 0.4, '#3a2414', 0, 0.15, 0); B(g, 0.34, 0.08, 0.22, '#5a6a7a', 0, 0.34, 0); const tr = C(g, 0.02, 0.035, 0.22, '#4a3420', 0, 0.48, 0, 6); tr.rotation.z = 0.35; [[-0.08, 0.6, 0.02, 0.09], [0.06, 0.64, -0.02, 0.08], [0.1, 0.55, 0.03, 0.06]].forEach((q) => sph(g, q[3], '#3a6a32', q[0], q[1], q[2], 1.3, 0.55, 1)); } },
            { name: 'futonStack', rule: 'corner', walls: ['left', 'right', 'front'], w: 1.1, d: 0.8, h: 0.6, solid: true, build(g) { ['#f0ece0', '#6a7aa8', '#f0ece0', '#c8a8a8'].forEach((c2, i) => B(g, 1.0, 0.13, 0.72, c2, 0, 0.07 + i * 0.13, 0)); } },
            { name: 'lights', rule: 'none', build(g) { const { h } = ROOM; light(g, 0xffe0b0, 2.4, 9, 0, h - 0.6, 0); const sh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, 0.6), basic('#fff2d8')); sh.position.set(0, h - 0.45, 0); g.add(sh); C(g, 0.006, 0.006, 0.3, '#2a2a2a', 0, h - 0.15, 0, 4); } },
            ];
        }

        if (type === 'loft') return [skirting, plant, plant,
            { name: 'bigWindow', first: true, rule: 'wall', walls: ['back'], w: 7, d: 0.15, h: 3, fill: true, high: true, build(g, r, len) {
                const H = ROOM.h - 0.5;
                const city = cv(1024, 384, (c) => { const gr = c.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, '#0a0c22'); gr.addColorStop(0.65, '#2a2050'); gr.addColorStop(1, '#5a3a6a'); c.fillStyle = gr; c.fillRect(0, 0, 1024, 384); for (let i = 0; i < 80; i++) { c.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.6 + ')'; c.fillRect(Math.random() * 1024, Math.random() * 150, 1.5, 1.5); }
                    for (let layer = 0; layer < 2; layer++) for (let x = 0; x < 1024;) { const bw = 30 + Math.random() * 70, bh = 80 + Math.random() * (layer ? 200 : 140); c.fillStyle = layer ? '#14142a' : '#1e1c36'; c.fillRect(x, 384 - bh, bw, bh); for (let wy = 384 - bh + 8; wy < 380; wy += 10) for (let wx = x + 5; wx < x + bw - 5; wx += 9) if (Math.random() < 0.35) { c.fillStyle = ['#ffd890', '#9ad0ff', '#fff2c8'][Math.floor(Math.random() * 3)]; c.fillRect(wx, wy, 4, 5); } if (Math.random() < 0.2) { c.fillStyle = '#ff3a3a'; c.fillRect(x + bw / 2, 384 - bh - 6, 3, 3); } x += bw + 4; } });
                plane(g, len - 0.1, H, basic('#ffffff', { map: city }), 0, 0.15 + H / 2, 0.02);
                for (let x = -len / 2; x <= len / 2 + 0.01; x += len / Math.max(2, Math.round(len / 1.3))) B(g, 0.06, H, 0.08, '#1a1a1e', x, 0.15 + H / 2, 0.05);
                B(g, len, 0.08, 0.1, '#1a1a1e', 0, 0.15 + H, 0.05); B(g, len, 0.15, 0.12, '#1a1a1e', 0, 0.075, 0.05); } },
            { name: 'sofa', first: true, rule: 'center', w: 3.2, d: 3.0, h: 1.0, solid: true, build(g) {
                const sc = pick(['#5a5e6a', '#8a6a4a', '#3a5a6a', '#a8a090']);
                B(g, 2.9, 0.02, 2.4, pick(['#c8b8a0', '#5a4a6a', '#d8d0c4']), 0, 0.01, 0.1);
                B(g, 2.4, 0.4, 0.9, sc, 0, 0.2, 1.0); B(g, 2.4, 0.5, 0.22, sc, 0, 0.62, 1.38); B(g, 0.22, 0.58, 0.9, sc, -1.2, 0.3, 1.0); B(g, 0.22, 0.58, 0.9, sc, 1.2, 0.3, 1.0);
                [-0.6, 0, 0.6].forEach((x) => B(g, 0.56, 0.12, 0.7, mix(sc, '#ffffff', 0.12), x, 0.45, 0.95)); B(g, 0.4, 0.35, 0.12, pick(['#e8c040', '#c84a4a', '#f0f0f0']), -0.8, 0.7, 1.22).rotation.z = 0.2;
                B(g, 1.1, 0.05, 0.55, '#2a2a30', 0, 0.38, 0.15); [[-0.5, -0.1], [0.5, -0.1], [-0.5, 0.4], [0.5, 0.4]].forEach((p) => B(g, 0.03, 0.36, 0.03, '#8a8a94', p[0], 0.18, p[1]));
                C(g, 0.035, 0.03, 0.18, '#7a1a2a', 0.2, 0.5, 0.15); B(g, 0.25, 0.03, 0.18, '#f0e8d8', -0.25, 0.42, 0.18);
                B(g, 2.0, 0.42, 0.42, '#2a2a30', 0, 0.21, -1.2); tv(g, 0, 1.05, -1.25, 0, 1.6);
                this.seats = [{ x: -0.6, z: 0.95, yaw: Math.PI, y: 0.52, pose: 'sit', acts: ['watch', 'talk', 'phone'], hold: { phone: 'phone' }, role: 'couple', p: 0.85 }, { x: 0.6, z: 0.95, yaw: Math.PI, y: 0.52, pose: 'sit', acts: ['watch', 'talk', 'drink'], hold: { drink: 'cup' }, role: 'couple', p: 0.7 }];
                this.focus = { x: 0, y: 1.0, z: -1.2 };
                this.spots = [{ kind: 'table', x: 0.35, y: 0.41, z: 0.15 }]; } },
            { name: 'island', rule: 'center', w: 2.4, d: 2.0, h: 1.0, solid: true, build(g) {
                B(g, 1.9, 0.88, 0.75, '#f2f2f0', 0, 0.44, -0.15); B(g, 2.0, 0.05, 0.85, '#2a2a2e', 0, 0.905, -0.15); B(g, 0.5, 0.02, 0.35, '#a8acb4', -0.5, 0.935, -0.15); C(g, 0.012, 0.012, 0.3, '#c8ccd4', -0.5, 1.08, -0.4);
                [-0.6, 0, 0.6].forEach((x) => { C(g, 0.17, 0.17, 0.05, '#c8a070', x, 0.72, 0.5, 16); C(g, 0.02, 0.025, 0.7, '#2a2a30', x, 0.35, 0.5); C(g, 0.15, 0.15, 0.02, '#2a2a30', x, 0.01, 0.5); });
                [-0.6, 0, 0.6].forEach((x) => { C(g, 0.004, 0.004, ROOM.h - 1.9, '#1a1a1e', x, ROOM.h - (ROOM.h - 1.9) / 2, -0.15); const sh = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 14, 1, true), lamb('#1a1a1e', { side: THREE.DoubleSide })); sh.position.set(x, 1.9, -0.15); g.add(sh); const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), basic('#fff0c8')); b.position.set(x, 1.83, -0.15); g.add(b); });
                light(g, 0xffd8a0, 2.0, 5, 0, 1.7, -0.15);
                C(g, 0.12, 0.11, 0.14, '#c8322a', 0.5, 1.0, -0.15, 14);
                this.stations = [{ x: 0.35, z: -0.9, yaw: 0, act: 'cook', hold: 'ladle', role: 'couple', apron: '#2a2a30', p: 0.6 }];
                this.seats = [{ x: 0, z: 0.5, yaw: Math.PI, y: 0.74, pose: 'sit', acts: ['drink', 'talk'], hold: { drink: 'cup' }, role: 'couple', p: 0.35 }];
                this.spots = [{ kind: 'table', x: 0.1, y: 0.93, z: -0.1 }]; } },
            { name: 'openShelf', rule: 'wall', walls: ['left', 'right'], w: 2.0, d: 0.42, h: 2.3, solid: true, build(g) { [-0.97, 0.97].forEach((x) => B(g, 0.04, 2.3, 0.4, '#1a1a1e', x, 1.15, 0)); this.spots = []; for (let lv = 0; lv < 5; lv++) { B(g, 1.94, 0.03, 0.4, '#8a6a48', 0, 0.2 + lv * 0.48, 0); if (lv % 2) bookRow(g, -0.85, 0.22 + lv * 0.48, 0.0, 1, 6, true); else { sph(g, 0.08, '#3a7a3a', 0.6, 0.33 + lv * 0.48, 0); C(g, 0.06, 0.05, 0.1, '#e8e4dc', 0.6, 0.27 + lv * 0.48, 0); for (let k = 0; k < 6; k++) B(g, 0.012, 0.3, 0.3, pick(['#1a1a1e', '#c84a4a', '#3a6fd9', '#f0e8d8']), -0.8 + k * 0.03, 0.37 + lv * 0.48, 0); this.spots.push({ kind: 'table', x: 0.1, y: 0.22 + lv * 0.48, z: 0 }); } } } },
            { name: 'workDesk', rule: 'wall', walls: ['left', 'right'], w: 1.6, d: 1.3, h: 1.2, solid: true, build(g) { const z0 = -0.35; B(g, 1.5, 0.04, 0.6, '#f4f4f2', 0, 0.74, z0); [-0.7, 0.7].forEach((x) => B(g, 0.04, 0.72, 0.56, '#1a1a1e', x, 0.36, z0)); B(g, 0.34, 0.015, 0.24, '#c8ccd4', 0, 0.77, z0 + 0.05); const sc = plane(g, 0.32, 0.2, basic('#9ad0ff'), 0, 0.88, z0 - 0.08); sc.rotation.x = -0.2; C(g, 0.04, 0.03, 0.1, '#f4f4f4', 0.45, 0.8, z0); B(g, 0.5, 0.08, 0.5, '#e8e4dc', 0, 0.47, 0.3); B(g, 0.5, 0.5, 0.06, '#e8e4dc', 0, 0.75, 0.53); C(g, 0.025, 0.025, 0.4, '#8a8a94', 0, 0.22, 0.3);
                this.seats = [{ x: 0, z: 0.3, yaw: Math.PI, y: 0.51, pose: 'sit', acts: ['type'], role: 'couple', p: 0.4 }]; this.spots = [{ kind: 'table', x: -0.45, y: 0.77, z: z0 }]; } },
            { name: 'art', rule: 'wall', walls: ['left', 'right'], w: 1.4, d: 0.06, h: 1.0, high: true, build(g) { const a = cv(256, 180, (c) => { c.fillStyle = '#f4f0e8'; c.fillRect(0, 0, 256, 180); for (let i = 0; i < 6; i++) { c.fillStyle = ['#e04a3a', '#2a4a8a', '#f0c030', '#1a1a1e', '#5aa07a', '#e88aa0'][i]; c.beginPath(); c.arc(30 + Math.random() * 200, 30 + Math.random() * 120, 15 + Math.random() * 40, 0, 7); c.fill(); } }); B(g, 1.3, 0.92, 0.04, '#1a1a1e', 0, 1.9, 0.02); plane(g, 1.22, 0.84, lamb('#ffffff', { map: a }), 0, 1.9, 0.045); } },
            { name: 'floorLamp', rule: 'corner', walls: ['left', 'right', 'back'], w: 0.5, d: 0.5, h: 1.8, solid: true, build(g) { C(g, 0.15, 0.15, 0.03, '#1a1a1e', 0, 0.015, 0); C(g, 0.012, 0.012, 1.55, '#1a1a1e', 0, 0.8, 0); C(g, 0.16, 0.2, 0.28, '#f4ecd8', 0, 1.65, 0); light(g, 0xffd8a0, 1.3, 5, 0, 1.6, 0); } },
            { name: 'lights', rule: 'none', build(g) { const { w, d, h } = ROOM; light(g, 0xffe8cc, 1.6, 10, -w / 4, h - 0.5, -d / 4); light(g, 0xffe8cc, 1.6, 10, w / 4, h - 0.5, d / 4); for (let x = -w / 2 + 1; x < w / 2; x += 1.6) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), lamb('#1a1a1e')); s.position.set(x, h - 0.08, 0); g.add(s); } B(g, w, 0.06, 0.06, '#1a1a1e', 0, h - 0.03, 0); } },
        ];

        if (type === 'ramen') return [skirting, ac, posters,
            { name: 'ramenKitchen', first: true, rule: 'wall', walls: ['back'], w: 3.8, d: 1.2, h: 2.4, solid: true, gap: 0.1, build(g) {
                const tiles = cv(256, 128, (c) => { c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, 256, 128); c.strokeStyle = '#bcc8d8'; c.lineWidth = 2; for (let x = 0; x <= 256; x += 21) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 128); c.stroke(); } for (let y = 0; y <= 128; y += 21) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); } });
                plane(g, 3.7, 1.4, lamb('#ffffff', { map: tiles }), 0, 1.6, -0.58);
                B(g, 3.6, 0.88, 0.6, '#b8bcc4', 0, 0.44, -0.28); B(g, 3.6, 0.04, 0.62, '#d8dce4', 0, 0.9, -0.28);
                [-1.3, -0.7].forEach((x) => { C(g, 0.24, 0.22, 0.48, '#8a8a94', x, 1.16, -0.3, 16); C(g, 0.24, 0.24, 0.02, '#c89a5a', x, 1.39, -0.3, 16); });
                B(g, 1.0, 0.25, 0.45, '#8a8a94', 0.5, 1.03, -0.3); for (let i = 0; i < 4; i++) { C(g, 0.06, 0.05, 0.14, '#c8ccd4', 0.15 + i * 0.23, 1.2, -0.3, 10); C(g, 0.008, 0.008, 0.3, '#5a3a22', 0.15 + i * 0.23, 1.4, -0.42, 5); }
                for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false })); sp.userData = { kitchen: true, age: Math.random() * 3, life: 2.2 + Math.random() }; sp.position.set(i < 3 ? -1.3 : -0.7, 1.5, -0.3); g.add(sp); inside.steam.push(sp); }
                const menu = ['醤油 ¥800', '味噌 ¥850', '塩 ¥800', '豚骨 ¥900', 'つけ麺 ¥950', '餃子 ¥350', '生ビール ¥500'];
                menu.forEach((t, i) => { const tg = cv(48, 160, (c) => { c.fillStyle = '#e8c890'; c.fillRect(0, 0, 48, 160); c.strokeStyle = '#6a4424'; c.lineWidth = 3; c.strokeRect(2, 2, 44, 156); c.fillStyle = '#1a1010'; c.font = '700 22px ' + JP; c.textAlign = 'center'; const [nm, pr] = t.split(' '); Array.from(nm).forEach((ch, k) => c.fillText(ch, 24, 30 + k * 24)); c.font = '700 12px ' + UI; c.fillStyle = '#c8322a'; c.fillText(pr, 24, 152); }); plane(g, 0.17, 0.56, lamb('#ffffff', { map: tg }), -1.55 + i * 0.5, 2.45, -0.55); });
                this.stations = [{ x: -1.0 - 0.15, z: 0.25, yaw: Math.PI, act: 'cook', hold: 'ladle', role: 'ramenChef', outfit: 'casual', short: true, top: '#f4f4f4', apron: '#1e2433', hachimaki: true, p: 1 }, { x: 0.6, z: 0.25, yaw: Math.PI, act: 'cook', hold: 'ladle', role: 'ramenChef', outfit: 'casual', short: true, top: '#2a2a32', apron: '#1e2433', p: 0.5 }];
                this.focusBack = true; } },
            { name: 'counter', first: true, rule: 'wall', walls: ['left', 'right'], w: 4.4, d: 1.6, h: 1.0, solid: true, build(g, r) { const len = 4.4;
                B(g, len, 0.95, 0.7, '#c89a62', 0, 0.475, -0.42); B(g, len + 0.1, 0.06, 0.82, '#e8c890', 0, 0.98, -0.4);
                const n = Math.floor((len - 0.4) / 0.85); this.spots = []; this.seats = [];
                for (let i = 0; i < n; i++) { const x = -len / 2 + 0.6 + i * 0.85; C(g, 0.17, 0.17, 0.07, '#c8322a', x, 0.64, 0.36, 14); C(g, 0.03, 0.03, 0.6, '#c8ccd4', x, 0.3, 0.36, 6); C(g, 0.13, 0.13, 0.02, '#c8ccd4', x, 0.01, 0.36);
                    C(g, 0.022, 0.022, 0.1, '#c84a2a', x - 0.25, 1.06, -0.62); C(g, 0.02, 0.02, 0.12, '#2a1a10', x - 0.2, 1.07, -0.62); B(g, 0.12, 0.08, 0.06, '#c89a62', x + 0.25, 1.05, -0.65);
                    if (i) this.seats.push({ x, z: 0.36, yaw: Math.PI, y: 0.67, pose: 'sit', acts: ['eat', 'eat', 'drink'], hold: { eat: 'chopsticks', drink: 'cup' }, role: 'ramenGuest', bowl: { x, y: 1.01, z: -0.2 }, p: 0.6 });
                    else this.spots.push({ kind: 'seat', x, y: 0.67, z: 0.36 }); this.spots.push({ kind: 'table', x: x + 0.3, y: 1.01, z: -0.35 }); } } },
            { name: 'ticket', rule: 'corner', walls: ['front', 'left', 'right'], w: 0.8, d: 0.6, h: 1.7, solid: true, build(g) { B(g, 0.75, 1.65, 0.55, '#e8e8ee', 0, 0.825, 0); B(g, 0.6, 0.9, 0.02, '#2a2a32', 0, 1.15, 0.28); const cols = ['#e04a3a', '#f0c030', '#3a7fe0', '#40b060', '#f08030', '#e04a3a']; for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) B(g, 0.12, 0.13, 0.02, cols[(r + c) % 6], -0.21 + c * 0.14, 0.82 + r * 0.16, 0.295, { emissive: new THREE.Color(cols[(r + c) % 6]), emissiveIntensity: 0.4 }); plane(g, 0.5, 0.12, basic('#ffffff', { map: cv(128, 32, (c) => { c.fillStyle = '#c8322a'; c.fillRect(0, 0, 128, 32); c.fillStyle = '#fff'; c.font = '700 20px ' + JP; c.textAlign = 'center'; c.fillText('食券', 64, 24); }) }), 0, 1.5, 0.282); B(g, 0.2, 0.06, 0.04, '#1a1a1e', 0, 0.55, 0.29); } },
            { name: 'water', rule: 'wall', walls: ['left', 'right', 'front'], w: 0.7, d: 0.45, h: 1.0, solid: true, build(g) { B(g, 0.6, 0.85, 0.4, '#c89a62', 0, 0.425, 0); C(g, 0.08, 0.07, 0.25, '#cfe8ff', -0.12, 0.98, 0, 14).material.transparent = true; for (let i = 0; i < 4; i++) C(g, 0.03, 0.028, 0.08, '#cfe8ff', 0.08 + (i % 2) * 0.08, 0.89, -0.06 + Math.floor(i / 2) * 0.1, 10); this.spots = [{ kind: 'table', x: 0.15, y: 0.86, z: 0.1 }]; } },
            { name: 'lanterns', rule: 'wall', walls: ['left', 'right'], w: 2.4, d: 0.5, h: 0.5, high: true, build(g) { lantern(g, -0.8, ROOM.h - 0.55, 0.25); lantern(g, 0.8, ROOM.h - 0.55, 0.25); } },
            ceilLights(0xffd9a0, 2.4, 3.6),
        ];

        if (type === 'cafe') return [skirting, plant, windowM(['left', 'right', 'front'], 2.0),
            { name: 'cafeCounter', first: true, rule: 'wall', walls: ['back'], w: 3.8, d: 1.7, h: 2.4, solid: true, build(g) {
                const f = 0.42; B(g, 3.3, 1.0, 0.6, '#5a3a22', 0, 0.5, f); B(g, 3.4, 0.05, 0.7, '#8a6238', 0, 1.02, f);
                B(g, 0.6, 0.45, 0.45, '#c8ccd4', -0.95, 1.27, f - 0.05); B(g, 0.5, 0.12, 0.42, '#2a2a30', -0.95, 1.55, f - 0.05); C(g, 0.03, 0.03, 0.12, '#2a2a30', -1.05, 1.0 + 0.2, f + 0.17); C(g, 0.035, 0.03, 0.06, '#f4f4f4', -0.85, 1.08, f + 0.15);
                for (let i = 0; i < 5; i++) C(g, 0.035, 0.03, 0.05, '#f4f4f4', -0.3, 1.07 + i * 0.05, f);
                const glass = B(g, 1.1, 0.5, 0.5, '#d8eef8', 0.85, 1.29, f, { transparent: true, opacity: 0.28 }); glass.userData.keep = true;
                [['#f4e0e8', '#e04a6a'], ['#3a2a1a', '#f4ecd8'], ['#f0d080', '#f4f4f4'], ['#e8c8a8', '#7a4a2a']].forEach((cc, i) => { B(g, 0.14, 0.08, 0.14, cc[0], 0.5 + i * 0.24, 1.09, f); B(g, 0.14, 0.02, 0.14, cc[1], 0.5 + i * 0.24, 1.14, f); });
                B(g, 3.4, 0.04, 0.3, '#5a3a22', 0, 1.65, -0.68); for (let i = 0; i < 9; i++) C(g, 0.06, 0.06, 0.18, pick(['#c8a070', '#3a2a1a', '#e8e0d0']), -1.5 + i * 0.36, 1.76, -0.68, 10);
                const board = cv(320, 180, (c) => { c.fillStyle = '#1e2a22'; c.fillRect(0, 0, 320, 180); c.strokeStyle = '#8a6238'; c.lineWidth = 8; c.strokeRect(0, 0, 320, 180); c.fillStyle = '#f4f0e0'; c.font = '700 22px ' + JP; c.fillText('MENU', 20, 34); c.font = '500 18px ' + JP; ['ブレンド  ¥450', 'カフェラテ  ¥520', 'ケーキセット  ¥800', 'ナポリタン  ¥750', 'クリームソーダ  ¥600'].forEach((t, i) => c.fillText(t, 24, 62 + i * 24)); });
                plane(g, 1.3, 0.72, lamb('#ffffff', { map: board }), 0.6, 2.15, -0.8);
                this.stations = [{ x: -0.5, z: -0.35, yaw: 0, act: 'scan', role: 'barista', outfit: 'casual', top: '#f4f4f4', apron: '#3a2a1a', p: 1 }];
                this.spots = [{ kind: 'table', x: 0.2, y: 1.05, z: f }]; } },
            { name: 'cafeTable', rule: 'center', w: 1.9, d: 1.4, h: 0.9, solid: true, count: [3, 5], build(g) {
                C(g, 0.38, 0.38, 0.04, '#3a2a1e', 0, 0.74, 0, 22); C(g, 0.04, 0.05, 0.72, '#1a1a1e', 0, 0.36, 0); C(g, 0.25, 0.25, 0.03, '#1a1a1e', 0, 0.015, 0);
                [-1, 1].forEach((k) => { const x = k * 0.65; B(g, 0.42, 0.05, 0.42, '#6a4a2a', x, 0.46, 0); B(g, 0.05, 0.5, 0.42, '#6a4a2a', x + k * 0.21, 0.72, 0); [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach((p) => B(g, 0.03, 0.44, 0.03, '#4a3020', x + p[0], 0.22, p[1])); });
                C(g, 0.04, 0.035, 0.06, '#f4f4f4', -0.15, 0.79, 0.05); C(g, 0.06, 0.06, 0.006, '#f4f4f4', -0.15, 0.762, 0.05); C(g, 0.04, 0.035, 0.06, '#f4f4f4', 0.18, 0.79, -0.08);
                if (rnd() < 0.5) { B(g, 0.12, 0.06, 0.12, '#f4e0e8', 0.05, 0.79, 0.15); B(g, 0.12, 0.02, 0.12, '#e04a6a', 0.05, 0.83, 0.15); }
                const f = { x: 0, y: 1.0, z: 0 };
                this.seats = [{ x: 0.65, z: 0, yaw: -Math.PI / 2, y: 0.49, pose: 'sit', acts: ['drink', 'talk', 'read', 'laugh'], hold: { drink: 'cup', read: 'book' }, role: 'cafeGuest', p: 0.65, focus: f }, { x: -0.65, z: 0, yaw: Math.PI / 2, y: 0.49, pose: 'sit', acts: ['drink', 'talk', 'phone'], hold: { drink: 'cup', phone: 'phone' }, role: 'cafeGuest', p: 0.5, focus: f }];
                this.spots = [{ kind: 'table', x: 0.05, y: 0.76, z: -0.1 }]; } },
            { name: 'booth', rule: 'wall', walls: ['left', 'right'], w: 2.2, d: 1.5, h: 1.2, solid: true, build(g) {
                const sc = pick(['#8a2a2a', '#2a5a4a', '#6a4a2a']); B(g, 2.0, 0.45, 0.55, sc, 0, 0.225, -0.42); B(g, 2.0, 0.7, 0.14, sc, 0, 0.8, -0.66); B(g, 1.3, 0.04, 0.6, '#3a2a1e', 0, 0.72, 0.2); C(g, 0.04, 0.05, 0.7, '#1a1a1e', 0, 0.35, 0.2);
                C(g, 0.04, 0.035, 0.06, '#f4f4f4', -0.3, 0.77, 0.15); C(g, 0.04, 0.035, 0.06, '#f4f4f4', 0.3, 0.77, 0.25);
                const lp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 14, 1, true), lamb('#2a5a3a', { side: THREE.DoubleSide })); lp.position.set(0, 1.85, 0.2); g.add(lp); C(g, 0.004, 0.004, ROOM.h - 1.9, '#1a1a1e', 0, (ROOM.h + 1.9) / 2, 0.2, 4); light(g, 0xffd8a0, 1.4, 4, 0, 1.7, 0.2);
                this.seats = [{ x: -0.45, z: -0.42, yaw: 0, y: 0.45, pose: 'sit', acts: ['drink', 'talk', 'read'], hold: { drink: 'cup', read: 'book' }, role: 'cafeGuest', p: 0.7, focus: { x: 0, y: 1, z: 0.3 } }, { x: 0.45, z: -0.42, yaw: 0, y: 0.45, pose: 'sit', acts: ['drink', 'laugh', 'type'], hold: { drink: 'cup' }, role: 'cafeGuest', p: 0.5, focus: { x: 0, y: 1, z: 0.3 } }];
                this.spots = [{ kind: 'table', x: 0, y: 0.74, z: 0.25 }]; } },
            { name: 'records', rule: 'wall', walls: ['left', 'right', 'front'], w: 1.4, d: 0.4, h: 1.6, solid: true, build(g) { B(g, 1.4, 1.5, 0.38, '#3a2414', 0, 0.75, 0); for (let lv = 0; lv < 3; lv++) for (let k = 0; k < 18; k++) B(g, 0.012, 0.3, 0.3, pick(['#1a1a1e', '#c84a4a', '#3a6fd9', '#f0e8d8', '#e8c040']), -0.6 + k * 0.07, 0.25 + lv * 0.48, 0.02); B(g, 0.4, 0.12, 0.32, '#5a3a22', 0.3, 1.56, 0); C(g, 0.13, 0.13, 0.01, '#1a1a1e', 0.3, 1.63, 0, 20); this.spots = [{ kind: 'table', x: -0.35, y: 1.52, z: 0 }]; } },
            { name: 'lights', rule: 'none', build(g) { const { w, d, h } = ROOM; for (let z = -d / 2 + 2.4; z < d / 2 - 1; z += 3.2) for (let x = -w / 4; x <= w / 4 + 0.01; x += w / 2) { const lp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), basic('#ffe0a8')); lp.position.set(x, h - 0.7, z); g.add(lp); C(g, 0.004, 0.004, 0.6, '#1a1a1e', x, h - 0.35, z, 4); light(g, 0xffcf8a, 2.0, 6.5, x, h - 0.8, z); } } },
        ];

        if (type === 'books') return [skirting, ac,
            { name: 'bookWall', first: true, rule: 'wall', walls: ['left', 'right', 'back'], w: 2.0, d: 0.45, h: 2.3, solid: true, count: [3, 5], build(g) {
                B(g, 2.0, 2.3, 0.04, '#6a4a2a', 0, 1.15, -0.2); [-0.98, 0.98].forEach((x) => B(g, 0.04, 2.3, 0.44, '#6a4a2a', x, 1.15, 0)); this.spots = [];
                for (let lv = 0; lv < 5; lv++) { B(g, 1.92, 0.03, 0.42, '#8a6a48', 0, 0.12 + lv * 0.44, 0); bookRow(g, -0.86, 0.14 + lv * 0.44, -0.02, 1, 11, true); }
                const pop = cv(128, 64, (c) => { c.fillStyle = pick(['#ffd34a', '#ff6a6a', '#7ad0ff']); c.fillRect(0, 0, 128, 64); c.fillStyle = '#1a1a1e'; c.font = '900 28px ' + JP; c.textAlign = 'center'; c.fillText(pick(['話題！', '新刊', 'おすすめ', '売れてる']), 64, 42); });
                const p = plane(g, 0.24, 0.12, lamb('#ffffff', { map: pop }), 0.4, 1.0, 0.22); p.rotation.z = 0.08;
                this.stations = [{ x: pick([-0.5, 0.5]), z: 0.75, yaw: Math.PI, act: 'browse', role: 'reader', p: 0.35 }]; } },
            { name: 'bookIsland', rule: 'center', w: 1.7, d: 1.3, h: 0.9, solid: true, count: [2, 3], rot: true, build(g) {
                B(g, 1.4, 0.75, 0.85, '#8a6a48', 0, 0.375, 0); B(g, 1.46, 0.04, 0.9, '#a8845a', 0, 0.77, 0);
                for (let i = 0; i < 6; i++) { const x = -0.5 + (i % 3) * 0.5, z = -0.2 + Math.floor(i / 3) * 0.4, n = 3 + Math.floor(rnd() * 4), col = pick(['#c84a4a', '#3a6fd9', '#f0c030', '#2a8a5a', '#f0e8d8', '#6a3a8a']); for (let k = 0; k < n; k++) B(g, 0.22, 0.03, 0.3, k === n - 1 ? col : '#f4efe0', x, 0.805 + k * 0.03, z); }
                const pop = cv(128, 80, (c) => { c.fillStyle = '#ff3a5a'; c.fillRect(0, 0, 128, 80); c.fillStyle = '#fff'; c.font = '900 30px ' + JP; c.textAlign = 'center'; c.fillText('新刊', 64, 36); c.font = '700 18px ' + JP; c.fillText('入荷！', 64, 64); });
                const p = plane(g, 0.28, 0.18, lamb('#ffffff', { map: pop }), 0, 1.0, 0); C(g, 0.006, 0.006, 0.15, '#2a2a30', 0, 0.85, 0, 4); p.material.side = THREE.DoubleSide;
                this.stations = [{ x: 0, z: 0.75, yaw: Math.PI, act: 'read', hold: 'book', role: 'reader', p: 0.5 }];
                this.spots = [{ kind: 'table', x: 0.5, y: 0.8, z: 0.2 }]; } },
            { name: 'mangaRack', rule: 'center', w: 0.7, d: 2.8, h: 1.6, solid: true, count: [1, 2], gap: 0.6, build(g) { B(g, 0.6, 1.5, 2.6, '#c8b090', 0, 0.75, 0); [-1, 1].forEach((k) => { for (let lv = 0; lv < 4; lv++) for (let i = 0; i < 18; i++) B(g, 0.05, 0.24, 0.12, pick(['#e04a4a', '#3a7fe0', '#f0c030', '#40b060', '#f0f0f0', '#e06aa0']), k * 0.29, 0.25 + lv * 0.36, -1.2 + i * 0.14); });
                this.stations = [{ x: 0.75, z: 0.3, yaw: -Math.PI / 2, act: 'read', hold: 'book', role: 'reader', p: 0.45 }]; } },
            { name: 'magRack', rule: 'wall', walls: ['front', 'left', 'right'], w: 2.6, d: 0.5, h: 1.5, solid: true, build(g) { B(g, 2.6, 1.4, 0.3, '#c8cad0', 0, 0.7, -0.1); this.mag = []; for (let lv = 0; lv < 3; lv++) for (let k = 0; k < 10; k++) this.mag.push({ x: -1.15 + k * 0.255, y: 0.35 + lv * 0.42, z: 0.08 }); } },
            { name: 'bookRegister', first: true, rule: 'wall', walls: ['left', 'right', 'front'], w: 2.2, d: 1.4, h: 1.3, solid: true, build(g) { const f = 0.36; B(g, 2.0, 0.95, 0.6, '#8a6a48', 0, 0.475, f); B(g, 2.06, 0.04, 0.66, '#a8845a', 0, 0.97, f); B(g, 0.38, 0.28, 0.32, '#2a2a32', 0.55, 1.12, f); for (let i = 0; i < 6; i++) B(g, 0.3, 0.008, 0.4, '#f4ecd8', -0.5, 0.995 + i * 0.008, f); B(g, 0.3, 0.2, 0.06, '#c84a4a', -0.1, 1.08, f + 0.1);
                this.stations = [{ x: 0, z: -0.35, yaw: 0, act: 'scan', role: 'bookClerk', apron: '#2a5a3a', p: 1 }]; this.spots = [{ kind: 'table', x: -0.6, y: 1.0, z: f + 0.1, price: true }]; } },
            { name: 'nook', rule: 'corner', walls: ['left', 'right', 'back'], w: 1.2, d: 1.2, h: 1.5, solid: true, build(g) { B(g, 0.8, 0.4, 0.75, '#6a3a3a', 0, 0.2, 0); B(g, 0.8, 0.5, 0.15, '#6a3a3a', 0, 0.6, -0.3); [-0.4, 0.4].forEach((x) => B(g, 0.12, 0.55, 0.75, '#6a3a3a', x, 0.3, 0)); C(g, 0.012, 0.012, 1.4, '#1a1a1e', 0.55, 0.7, -0.3); C(g, 0.12, 0.15, 0.2, '#f4ecd8', 0.55, 1.45, -0.3); light(g, 0xffd8a0, 1.0, 3, 0.55, 1.4, -0.2);
                this.seats = [{ x: 0, z: 0.0, yaw: 0, y: 0.42, pose: 'sit', acts: ['read'], hold: { read: 'book' }, role: 'reader', p: 0.6 }]; } },
            ceilLights(0xfff2e0, 2.2, 3.4),
        ];

        if (type === 'arcade') return [
            { name: 'claw', first: true, rule: 'wall', walls: ['left', 'right', 'back'], w: 1.1, d: 1.6, h: 2.1, solid: true, count: [2, 3], build(g) {
                const col = pick(['#ff3fa4', '#36e2ff', '#ffd23f', '#b06bff']), z = -0.3;
                B(g, 0.95, 0.85, 0.95, col, 0, 0.425, z); B(g, 1.0, 0.24, 1.0, col, 0, 1.98, z);
                const gl = B(g, 0.9, 0.9, 0.9, '#cfe8ff', 0, 1.32, z, { transparent: true, opacity: 0.18 }); gl.userData.keep = true;
                [[-0.47, -0.47], [0.47, -0.47], [-0.47, 0.47], [0.47, 0.47]].forEach((p) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.92, 0.035), basic(col)); e.position.set(p[0], 1.32, z + p[1]); g.add(e); });
                const plush = ['#f4c8d8', '#f0d080', '#9fd8ff', '#c8f0a8', '#f4f4f4', '#d8a8f0'];
                for (let i = 0; i < 14; i++) { const x = -0.32 + (i % 5) * 0.16, zz = z - 0.3 + Math.floor(i / 5) * 0.22, y = 0.93 + (i % 3) * 0.05; const c2 = plush[i % 6]; sph(g, 0.075, c2, x, y, zz, 1, 0.9, 1); sph(g, 0.05, c2, x, y + 0.09, zz + 0.02); sph(g, 0.018, c2, x - 0.03, y + 0.14, zz + 0.02); sph(g, 0.018, c2, x + 0.03, y + 0.14, zz + 0.02); }
                const claw = new THREE.Group(); const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 5), lamb('#c8ccd4')); rod.position.y = 0.25; claw.add(rod); for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.1, 0.015), lamb('#c8ccd4')); const a = k * Math.PI * 2 / 3; f.position.set(Math.cos(a) * 0.035, -0.03, Math.sin(a) * 0.035); f.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); claw.add(f); } claw.position.set(0, 1.55, z); claw.userData.keep = true; g.add(claw);
                LIFE.S.fx.push((t) => { const k = t * 0.5 + z; const ph = (t * 0.25) % 1; claw.position.x = Math.sin(k) * 0.3; claw.position.z = z + Math.cos(k * 0.7) * 0.25; claw.position.y = 1.55 - (ph > 0.7 && ph < 0.9 ? Math.sin((ph - 0.7) / 0.2 * Math.PI) * 0.4 : 0); });
                plane(g, 0.9, 0.2, basic('#ffffff', { map: cv(256, 56, (c) => { c.fillStyle = '#1a1a2a'; c.fillRect(0, 0, 256, 56); c.fillStyle = col; c.font = '900 34px ' + UI; c.textAlign = 'center'; c.fillText('UFO CATCHER', 128, 40); }) }), 0, 1.98, z + 0.505);
                B(g, 0.5, 0.06, 0.2, '#2a2a34', 0, 0.88, z + 0.52); C(g, 0.012, 0.012, 0.08, '#1a1a1e', -0.12, 0.94, z + 0.52, 5); sph(g, 0.025, '#e03a2a', -0.12, 0.99, z + 0.52); C(g, 0.03, 0.03, 0.02, '#ffd23f', 0.1, 0.92, z + 0.52, 10);
                light(g, new THREE.Color(col).getHex(), 0.9, 3, 0, 1.5, z + 0.6);
                this.stations = [{ x: 0, z: 0.55, yaw: Math.PI, act: 'play', role: 'gamer', p: 0.55 }]; } },
            { name: 'cabinets', first: true, rule: 'wall', walls: ['left', 'right'], w: 6, d: 1.5, h: 2.0, fill: true, solid: true, build(g, r, len) {
                const n = Math.max(2, Math.floor(len / 0.85)); this.stations = [];
                for (let i = 0; i < n; i++) { const x = -len / 2 + 0.45 + i * 0.85, col = pick(['#ff3fa4', '#36e2ff', '#ffd23f', '#7cff6a', '#b06bff']);
                    B(g, 0.74, 1.8, 0.7, '#1a1a24', x, 0.9, -0.38); B(g, 0.76, 0.22, 0.12, col, x, 1.82, -0.06, { emissive: new THREE.Color(col), emissiveIntensity: 0.6 });
                    const sc = plane(g, 0.6, 0.46, new THREE.MeshBasicMaterial({ map: LIFE.gameTex(i) }), x, 1.38, -0.02); sc.rotation.x = -0.18;
                    B(g, 0.74, 0.1, 0.32, '#2a2a34', x, 0.98, 0.1); C(g, 0.012, 0.012, 0.09, '#1a1a1e', x - 0.15, 1.07, 0.1, 5); sph(g, 0.028, col, x - 0.15, 1.12, 0.1); for (let b = 0; b < 3; b++) C(g, 0.024, 0.024, 0.02, ['#e03a2a', '#ffd23f', '#3a7fe0'][b], x + 0.03 + b * 0.08, 1.04, 0.1, 10);
                    this.stations.push({ x, z: 0.55, yaw: Math.PI, act: 'play', role: 'gamer', p: 0.45 }); } } },
            { name: 'taiko', rule: 'center', w: 1.6, d: 1.8, h: 2.0, solid: true, build(g) {
                B(g, 1.3, 1.9, 0.6, '#c8322a', 0, 0.95, -0.4); const sc = plane(g, 1.0, 0.6, new THREE.MeshBasicMaterial({ map: LIFE.gameTex(7) }), 0, 1.45, -0.09); sc.rotation.x = -0.1;
                [-0.33, 0.33].forEach((x) => { const d = C(g, 0.3, 0.3, 0.34, '#d8b880', x, 0.86, 0.12, 24); d.rotation.x = Math.PI / 2 - 0.4; const sk = C(g, 0.27, 0.27, 0.35, '#f4ecd8', x, 0.86, 0.12, 24); sk.rotation.x = Math.PI / 2 - 0.4; B(g, 0.5, 0.7, 0.4, '#3a2a2a', x, 0.35, 0.05); });
                plane(g, 1.2, 0.3, basic('#ffffff', { map: cv(256, 64, (c) => { c.fillStyle = '#ffd23f'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#c8322a'; c.font = '900 40px ' + JP; c.textAlign = 'center'; c.fillText('太鼓の達人', 128, 48); }) }), 0, 1.98, -0.09);
                this.stations = [{ x: -0.33, z: 0.7, yaw: Math.PI, act: 'drum', role: 'drummer', p: 0.8 }, { x: 0.33, z: 0.7, yaw: Math.PI, act: 'drum', role: 'drummer', p: 0.4 }]; } },
            { name: 'purikura', rule: 'corner', walls: ['left', 'right', 'back'], w: 1.6, d: 1.6, h: 2.2, solid: true, build(g) {
                B(g, 1.5, 2.1, 1.5, '#f8b8d8', 0, 1.05, 0); const cur = plane(g, 1.2, 1.2, lamb('#ff7ab8', { side: THREE.DoubleSide }), 0, 1.0, 0.76);
                plane(g, 1.4, 0.4, basic('#ffffff', { map: cv(256, 72, (c) => { const gr = c.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, '#ff7ab8'); gr.addColorStop(1, '#b06bff'); c.fillStyle = gr; c.fillRect(0, 0, 256, 72); c.fillStyle = '#fff'; c.font = '900 40px ' + JP; c.textAlign = 'center'; c.fillText('プリ♡', 128, 52); }) }), 0, 1.9, 0.76);
                this.stations = [{ x: 0.3, z: 1.2, yaw: Math.PI, act: 'talk', role: 'gamer', fem: true, p: 0.5 }]; } },
            { name: 'neon', rule: 'wall', walls: ['back', 'left', 'right'], w: 2.4, d: 0.1, h: 0.8, high: true, build(g) { const t = pick(['GAME', 'PLAY', 'ゲーム', 'HIGH SCORE']); plane(g, 2.2, 0.6, basic('#ffffff', { map: cv(512, 140, (c) => { c.fillStyle = '#0a0a14'; c.fillRect(0, 0, 512, 140); c.shadowColor = '#ff3fa4'; c.shadowBlur = 20; c.strokeStyle = '#ff7ac8'; c.lineWidth = 6; c.font = '900 88px ' + UI; c.textAlign = 'center'; c.strokeText(t, 256, 102); c.fillStyle = '#ffe0f0'; c.fillText(t, 256, 102); }), transparent: true }), 0, ROOM.h - 0.75, 0.03); } },
            { name: 'lights', rule: 'none', build(g) { const { w, d, h } = ROOM; [['#ff3fa4', -w / 4, -d / 4], ['#36e2ff', w / 4, 0], ['#b06bff', -w / 4, d / 4], ['#ffd23f', w / 4, d / 3]].forEach((q) => light(g, new THREE.Color(q[0]).getHex(), 3.6, 9, q[1], h - 0.6, q[2])); } },
        ];
        return null;
    }

    // ---------- вход снаружи ----------
    function door(rtype, o) {
        const { door: dr, side, dz, W2: w2, world: wd, rnd } = o;
        const plaque = (ch, x, y) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.MeshBasicMaterial({ map: texPlaque(ch), fog: true })); p.position.set(side * (w2 - 0.02), y || 2.0, dz + (x || 0.9)); p.rotation.y = -side * Math.PI / 2; wd.add(p); };
        const strip = (col, y, h) => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, h || 0.3, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(col) })); s.position.set(side * (w2 - 0.05), y, dz); wd.add(s); };
        const noren = (col) => { const nr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.55), new THREE.MeshBasicMaterial({ map: texNorenPlain(col), side: THREE.DoubleSide, fog: true })); nr.position.set(side * (w2 - 0.08), 1.85, dz); nr.rotation.y = -side * Math.PI / 2; wd.add(nr); };
        if (rtype === 'oneroom' || rtype === 'loft') { dr.material.color.set(rtype === 'loft' ? '#2a2a30' : '#d8d4cc'); const mb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.25), lamb('#8a8a96')); mb.position.set(side * (w2 - 0.08), 1.3, dz + 0.75); wd.add(mb); plaque(rtype === 'loft' ? '邸' : '荘', 0.9, 2.0); }
        if (rtype === 'washitsu') { dr.material.color.set('#c8a070'); plaque('和', 0.9, 2.0); noren('#2a3a2a'); }
        if (rtype === 'ramen') { dr.material.color.set('#ffe8c8'); strip('#c8322a', 2.45, 0.35); noren('#c8322a'); plaque('麺', 0.9, 2.0); }
        if (rtype === 'cafe') { dr.material.color.set('#ffd8a0'); strip('#3a5a3a', 2.45, 0.3); plaque('茶', 0.9, 2.0); }
        if (rtype === 'books') { dr.material.color.set('#fff4e0'); strip('#2a5a3a', 2.45, 0.3); plaque('本', 0.9, 2.0); }
        if (rtype === 'arcade') { dr.material.color.set('#ffd0f0'); strip('#ff3fa4', 2.5, 0.12); strip('#36e2ff', 2.3, 0.12); plaque('遊', 0.9, 2.0); }
    }
    return { types, names, hints, alias, surf, size, shells, catalog, door };
})();
