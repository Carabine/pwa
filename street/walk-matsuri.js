// ===== «Мацури» — праздничная улица: ятай с едой, гирлянды фонарей, флаги-нобори, тории, фейерверки =====
// Встраивается build-walk.mjs. FESTIVAL.build(world) зовётся из buildWorld, когда у темы festival: true;
// FESTIVAL.update(t, dt) — из кадра (фейерверки). Слова живут на фонарях и вертикальных вывесках над лотками.
const FESTIVAL = (() => {
    const FOODS = [
        { id: 'tako', name: 'たこ焼き', bg: '#fff4d8', ink: '#c8322a', canopy: 0 },
        { id: 'soba', name: '焼きそば', bg: '#ffe14a', ink: '#1a1a1e', canopy: 1 },
        { id: 'ringo', name: 'りんご飴', bg: '#ffffff', ink: '#d8243a', canopy: 0 },
        { id: 'kori', name: 'かき氷', bg: '#e8f6ff', ink: '#1a5ad0', canopy: 2 },
        { id: 'wata', name: 'わたあめ', bg: '#ffe8f2', ink: '#d0408a', canopy: 3 },
        { id: 'kingyo', name: '金魚すくい', bg: '#ffffff', ink: '#e0402a', canopy: 2 },
        { id: 'tori', name: '焼き鳥', bg: '#2a1a12', ink: '#ffcf6a', canopy: 1 },
        { id: 'ramune', name: 'ラムネ', bg: '#dff8ff', ink: '#0a7aa0', canopy: 2 },
    ];
    const CANOPY = [['#d8243a', '#fff4e8'], ['#1d3f8a', '#fff4e8'], ['#2a8a5a', '#fff4e8'], ['#e86aa0', '#fff4e8']];
    let mats = null, fw = [], nextFw = 0; const stalls = [];
    function makeMats() {
        if (mats) return mats;
        // вывески лотков — один атлас (8 ячеек), материал общий → сливается
        const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const g = c.getContext('2d');
        FOODS.forEach((f, i) => { g.fillStyle = f.bg; g.fillRect(i * 128, 0, 128, 64); g.strokeStyle = f.ink; g.lineWidth = 4; g.strokeRect(i * 128 + 3, 3, 122, 58); g.fillStyle = f.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 ' + Math.min(40, 112 / Array.from(f.name).length * 1.05) + 'px ' + JP; g.fillText(f.name, i * 128 + 64, 34); });
        const sign = new THREE.MeshBasicMaterial({ map: makeTex(c), fog: true }); sign.userData.atlas = true;
        const canopy = CANOPY.map(([a, b]) => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8; const cg = cv.getContext('2d'); for (let k = 0; k < 8; k++) { cg.fillStyle = k % 2 ? b : a; cg.fillRect(k * 8, 0, 8, 8); } const t = makeTex(cv); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); const m = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, color: new THREE.Color('#d8c8b8'), fog: true }); m.userData.atlas = true; return m; }); // навес светится сам — ночью его видно
        // флаги-нобори — атлас вертикальных надписей
        const NOB = [['祭', '#d8243a', '#ffffff'], ['夏祭り', '#1d3f8a', '#ffffff'], ['花火', '#ffffff', '#d8243a'], ['縁日', '#ffcf3a', '#1a1a1e'], ['お祭り', '#2a8a5a', '#ffffff']];
        const nc = document.createElement('canvas'); nc.width = 320; nc.height = 256; const ng = nc.getContext('2d');
        NOB.forEach(([t, bg, ink], i) => { ng.fillStyle = bg; ng.fillRect(i * 64, 0, 64, 256); ng.fillStyle = ink; ng.textAlign = 'center'; ng.textBaseline = 'middle'; ng.font = '900 40px ' + JP; Array.from(t).forEach((ch, k, arr) => ng.fillText(ch, i * 64 + 32, 128 + (k - (arr.length - 1) / 2) * 46)); ng.fillStyle = ink; ng.fillRect(i * 64, 0, 64, 10); });
        const nobori = lamb('#ffffff', { map: makeTex(nc), side: THREE.DoubleSide }); nobori.userData.atlas = true;
        return (mats = { sign, canopy, nobori, nobN: NOB.length });
    }
    const box = (g, sx, sy, sz, col, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), lamb(col)); m.position.set(x, y, z); g.add(m); return m; };
    const cyl = (g, r1, r2, h, col, x, y, z, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 10), lamb(col)); m.position.set(x, y, z); g.add(m); return m; };
    const ball = (g, r, col, x, y, z, basic) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), basic ? new THREE.MeshBasicMaterial({ color: new THREE.Color(col) }) : lamb(col)); m.position.set(x, y, z); g.add(m); return m; };
    function atlasPlane(mat, cells, i, w, h) { const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / cells); return new THREE.Mesh(geo, mat); }
    // товары на прилавке (локально: прилавок шириной L, верх на y=0.95, z от 0.05 до 0.65)
    function goods(g, f, L, rnd) {
        const y = 0.95;
        if (f.id === 'tako') { box(g, 0.7, 0.06, 0.4, '#2a2a2e', -0.3, y + 0.03, 0.35); for (let i = 0; i < 24; i++) ball(g, 0.028, '#b06a2a', -0.6 + (i % 6) * 0.11, y + 0.075, 0.2 + Math.floor(i / 6) * 0.1); box(g, 0.25, 0.04, 0.18, '#f4ecd8', 0.4, y + 0.02, 0.4); }
        else if (f.id === 'soba') { box(g, 0.9, 0.05, 0.45, '#3a3a40', -0.2, y + 0.025, 0.35); for (let i = 0; i < 6; i++) { const m = ball(g, 0.11, '#a0602a', -0.5 + i * 0.12, y + 0.08, 0.35); m.scale.set(1, 0.35, 1); } for (let i = 0; i < 8; i++) ball(g, 0.02, '#3a8a2a', -0.55 + i * 0.09, y + 0.11, 0.3 + (i % 2) * 0.1); }
        else if (f.id === 'ringo') { box(g, 0.8, 0.12, 0.35, '#f4ecd8', 0, y + 0.06, 0.35); for (let i = 0; i < 14; i++) { const x = -0.35 + (i % 7) * 0.11, z = 0.28 + Math.floor(i / 7) * 0.14; cyl(g, 0.006, 0.006, 0.22, '#f4ecd8', x, y + 0.2, z, 4); ball(g, 0.045, i % 5 ? '#d8142a' : '#e8a020', x, y + 0.33, z); } }
        else if (f.id === 'kori') { cyl(g, 0.16, 0.18, 0.4, '#c8ccd4', -0.45, y + 0.2, 0.35, 14); for (let i = 0; i < 6; i++) { const x = 0.0 + (i % 3) * 0.16, z = 0.28 + Math.floor(i / 3) * 0.16; cyl(g, 0.045, 0.035, 0.08, '#f4f4f4', x, y + 0.04, z, 10); const d = ball(g, 0.05, ['#e8304a', '#3a8ae0', '#3ac060', '#f0d030'][i % 4], x, y + 0.1, z); d.scale.y = 0.8; } for (let i = 0; i < 3; i++) cyl(g, 0.03, 0.03, 0.2, ['#e8304a', '#3a8ae0', '#3ac060'][i], 0.55, y + 0.1, 0.25 + i * 0.12, 8); }
        else if (f.id === 'wata') { for (let i = 0; i < 8; i++) { const x = -0.6 + i * 0.17; cyl(g, 0.006, 0.006, 0.3, '#f4ecd8', x, y + 0.15, 0.4, 4); ball(g, 0.09, i % 2 ? '#ffc8e0' : '#ffffff', x, y + 0.38, 0.4).scale.set(1, 1.15, 1); } for (let i = 0; i < 5; i++) box(g, 0.2, 0.28, 0.02, ['#ffd34a', '#7ad0ff', '#ff8ac0', '#a0e070', '#c8a0ff'][i], -0.6 + i * 0.3, 2.0, -0.62); }
        else if (f.id === 'kingyo') { box(g, L - 0.3, 0.25, 0.9, '#2a5ab0', 0, 0.125, 0.95); const w = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.4, 0.8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#3a8ae0'), fog: true })); w.rotation.x = -Math.PI / 2; w.position.set(0, 0.252, 0.95); g.add(w); for (let i = 0; i < 16; i++) { const fsh = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 4 ? '#ff6a1a' : '#f4f4f4') })); fsh.rotation.z = Math.PI / 2; fsh.rotation.y = rnd() * 6; fsh.position.set(-L / 2 + 0.35 + rnd() * (L - 0.7), 0.258, 0.6 + rnd() * 0.7); g.add(fsh); } for (let i = 0; i < 6; i++) box(g, 0.1, 0.02, 0.1, '#ffffff', -0.5 + i * 0.2, y + 0.01, 0.4); }
        else if (f.id === 'tori') { box(g, 0.9, 0.08, 0.3, '#1a1a1e', -0.1, y + 0.04, 0.35); box(g, 0.86, 0.02, 0.26, '#ff5a1a', -0.1, y + 0.085, 0.35); for (let i = 0; i < 8; i++) { const x = -0.48 + i * 0.11; cyl(g, 0.004, 0.004, 0.3, '#d8b880', x, y + 0.11, 0.35, 4).rotation.x = Math.PI / 2; for (let k = 0; k < 3; k++) ball(g, 0.02, '#8a4a22', x, y + 0.12, 0.27 + k * 0.06); } }
        else { cyl(g, 0.32, 0.28, 0.25, '#3a8ad0', -0.1, y + 0.125, 0.35, 16); const ice = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#dff4ff'), fog: true })); ice.position.set(-0.1, y + 0.25, 0.35); g.add(ice); for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 0.17 * Math.sqrt((i + 1) / 9); cyl(g, 0.025, 0.025, 0.2, '#6ad0e8', -0.1 + Math.cos(a) * r, y + 0.33, 0.35 + Math.sin(a) * r, 8); } }
    }
    function stall(world, side, z, L, f, rnd) {
        const M = makeMats();
        const g = new THREE.Group(); g.position.set(side * (W2 - 0.8), 0, z); g.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        box(g, L, 0.95, 0.6, '#8a5a32', 0, 0.475, 0.35); box(g, L + 0.06, 0.04, 0.66, '#b07a44', 0, 0.97, 0.35);
        box(g, L - 0.1, 0.5, 0.02, f.ink === '#1a1a1e' ? '#ffe14a' : f.bg, 0, 0.55, 0.66); // лицевая панель прилавка
        [[-L / 2, -0.6], [L / 2, -0.6], [-L / 2, 0.66], [L / 2, 0.66]].forEach(([x, zz]) => box(g, 0.06, zz > 0 ? 2.25 : 2.5, 0.06, '#5a3a22', x, (zz > 0 ? 2.25 : 2.5) / 2, zz));
        const can = new THREE.Mesh(new THREE.PlaneGeometry(L + 0.3, 1.5), M.canopy[f.canopy]); can.position.set(0, 2.38, 0.05); can.rotation.x = -Math.PI / 2 + 0.22; g.add(can);
        const sg = atlasPlane(M.sign, FOODS.length, FOODS.indexOf(f), L * 0.9, 0.32); sg.position.set(0, 2.06, 0.72); g.add(sg);
        for (let i = 0; i < 5; i++) ball(g, 0.035, '#fff2c0', -L / 2 + 0.2 + i * (L - 0.4) / 4, 2.2, 0.74, true);
        goods(g, f, L, rnd);
        world.add(g); addCollider(g, null, 0.15);
        // продавец за прилавком
        g.updateMatrixWorld(true); const st = { ch: null, front: g.localToWorld(new THREE.Vector3(0, 0, 1.35)), food: f.name }; stalls.push(st);
        if (rnd() < (LOW ? 0.6 : 0.85)) {
            const fem = rnd() < 0.45, ch = LIFE.makeChar({ fem, hairStyle: fem ? 'bun' : (rnd() < 0.5 ? 'short' : 'spiky'), hachimaki: !fem || rnd() < 0.5, top: ['#f4f4f4', '#2a3550', '#d8243a', '#1d3f8a'][Math.floor(rnd() * 4)], apron: '#1e2433', short: !fem, skin: ['#f3d6bd', '#eccaa8', '#e5bd98'][Math.floor(rnd() * 3)], hair: ['#16161c', '#2e1d14', '#4a2e1a'][Math.floor(rnd() * 3)], mouth: 'grin', holdR: f.id === 'kingyo' ? null : 'ladle', seed: rnd() * 100 });
            ch.act = f.id === 'kingyo' ? 'idle' : 'cook'; ch.role = 'vendor'; ch.root.position.set(0.1, 0, -0.25); g.add(ch.root); LIFE.S.loose.push(ch); st.ch = ch;
        }
    }
    function nobori(world, side, z, i) {
        const M = makeMats(); const x = side * (W2 - 0.35);
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.4, 6), lamb('#d8d0c0')); p.position.set(x, 1.7, z); world.add(p);
        const fl = atlasPlane(M.nobori, M.nobN, i % M.nobN, 0.42, 1.7); fl.position.set(x, 2.35, z + 0.23); fl.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; world.add(fl);
    }
    function garland(world, z, rnd) { // гирлянда бумажных фонариков через улицу
        const pts = [], y0 = 4.3, sag = 0.55, n = 18;
        for (let k = 0; k <= n; k++) { const t = k / n, x = -W2 + 0.2 + (W2 * 2 - 0.4) * t; pts.push(new THREE.Vector3(x, y0 - Math.sin(t * Math.PI) * sag, z)); }
        world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1a1210 })));
        for (let k = 1; k < n; k += 2) { const p = pts[k], col = (k >> 1) % 3 === 2 ? '#fff0d0' : '#ff5a3a'; const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(col), fog: true })); l.scale.y = 1.3; l.position.set(p.x, p.y - 0.2, z); world.add(l); }
    }
    function torii(world, z) {
        const red = '#d8243a', blk = '#1a1210', hw = W2 + 0.6;
        [-1, 1].forEach((k) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 5.2, 14), lamb(red)); p.position.set(k * hw, 2.6, z); world.add(p); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.35, 14), lamb(blk)); b.position.set(k * hw, 0.17, z); world.add(b); });
        const kasagi = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.6, 0.32, 0.5), lamb(blk)); kasagi.position.set(0, 5.35, z); world.add(kasagi);
        const shimaki = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.2, 0.3, 0.42), lamb(red)); shimaki.position.set(0, 5.05, z); world.add(shimaki);
        const nuki = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.6, 0.22, 0.3), lamb(red)); nuki.position.set(0, 4.25, z); world.add(nuki);
        const c = document.createElement('canvas'); c.width = 96; c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#1a1210'; g.fillRect(0, 0, 96, 160); g.strokeStyle = '#d8b84a'; g.lineWidth = 5; g.strokeRect(5, 5, 86, 150); g.fillStyle = '#d8b84a'; g.font = '900 52px ' + JP; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('祭', 48, 52); g.fillText('道', 48, 112);
        const plq = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.9), new THREE.MeshBasicMaterial({ map: makeTex(c), fog: true })); plq.position.set(0, 4.7, z + 0.27); world.add(plq);
        const plb = plq.clone(); plb.rotation.y = Math.PI; plb.position.z = z - 0.27; world.add(plb);
    }
    function reset() { stalls.length = 0; }
    function build(world, bk) {
        const rnd = mulberry32(hashStr('matsuri' + bk.z0));
        torii(world, bk.z0 - 1.6);
        const bounds = blocks.map((b) => b.z0);
        [-1, 1].forEach((side) => {
            const dz = doors.filter((d) => d.userData.door.side === side).map((d) => d.userData.door.z);
            let z = bk.z0 - 2.6, k = 0;
            while (z > bk.z1 + 2) {
                const L = 1.8 + Math.floor(rnd() * 3) * 0.2, zc = z - L / 2;
                const clear = !dz.some((d) => Math.abs(d - zc) < L / 2 + 1.3) && !bounds.some((b) => Math.abs(b - zc) < L / 2 + 1.6);
                if (clear) { stall(world, side, zc, L, FOODS[Math.floor(rnd() * FOODS.length)], rnd); if (k++ % 2 === 1) nobori(world, side, z - L - 0.3, k); z -= L + 0.7; }
                else z -= 0.8;
            }
        });
        for (let z = bk.z0 - 3; z > bk.z1 + 2; z -= 5.5) garland(world, z, rnd);
    }
    // ---- фейерверки: вспышка частиц далеко впереди, раз в несколько секунд ----
    function burst(t) {
        const n = LOW ? 70 : 140, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
        const cx = (Math.random() - 0.5) * 24, cy = 22 + Math.random() * 10, cz = camera.position.z - 55 - Math.random() * 25;
        for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = 15 + Math.random() * 3; vel[i * 3] = r * Math.cos(a) * sp; vel[i * 3 + 1] = u * sp; vel[i * 3 + 2] = r * Math.sin(a) * sp; pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz; }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const col = ['#ffcf5a', '#ff5a7a', '#7ad0ff', '#b98cff', '#9aff8a', '#ffffff'][Math.floor(Math.random() * 6)];
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: discTex, color: new THREE.Color(col), size: 2.2, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        pts.frustumCulled = false; scene.add(pts); fw.push({ pts, vel, t0: t, c: [cx, cy, cz] }); audio.boom();
    }
    function update(t, dt) {
        if (inside.on) { fw.forEach((f) => { f.pts.visible = false; }); return; }
        if (t > nextFw) { nextFw = t + 4 + Math.random() * 6; burst(t); if (Math.random() < 0.35) setTimeout(() => burst(performance.now() / 1000), 350); }
        for (let i = fw.length - 1; i >= 0; i--) {
            const f = fw[i], k = t - f.t0, a = f.pts.geometry.attributes.position, p = a.array, v = f.vel;
            if (k > 2.6) { scene.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); fw.splice(i, 1); continue; }
            // разлёт по реальному времени (не по шагу кадра): одинаково на 5 и на 60 кадрах в секунду
            const spread = (1 - Math.exp(-1.6 * k)) / 1.6, fall = 2.2 * k * k, cc = f.c;
            for (let j = 0; j < p.length; j += 3) { p[j] = cc[0] + v[j] * spread; p[j + 1] = cc[1] + v[j + 1] * spread - fall; p[j + 2] = cc[2] + v[j + 2] * spread; }
            a.needsUpdate = true; f.pts.visible = true; f.pts.material.opacity = Math.max(0, 1 - k / 2.6);
        }
    }
    return { build, update, stalls, reset };
})();
