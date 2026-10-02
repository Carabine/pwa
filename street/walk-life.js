// ===== Жизнь: люди с суставами и нарисованными лицами, их занятия в комнатах, реплики, кот, мягкие тени, отражения =====
// Встраивается build-walk.mjs вместе с каталогом предметов (в общую область видимости walk.js).
// Человек = иерархия суставов (бёдра → корпус → шея → голова, плечо → локоть → кисть, бедро → колено).
// Всё, что жёстко висит на одном суставе, сливается в одну сетку с вершинными цветами — ~12 вызовов отрисовки на человека.
const LIFE = (() => {
    const V3 = THREE.Vector3;
    const _v = new V3(), _v2 = new V3(), _o = new THREE.Object3D();
    _o.rotation.order = 'YXZ'; // сначала наклон, потом поворот по азимуту
    const charMat = LOW ? new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.7 });
    const heldMat = LOW ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05, envMapIntensity: 1 });
    const faceMatOf = (map) => LOW ? new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }) : new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const env4 = (x, a, b, c, d) => (x < a || x > d ? 0 : x < b ? smooth((x - a) / (b - a)) : x < c ? 1 : 1 - smooth((x - c) / (d - c)));
    const angTo = (a, b, step) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) <= step ? b : a + Math.sign(d) * step; };
    const shade = (hex, k) => (k < 0 ? mix(hex, '#000000', -k) : mix(hex, '#ffffff', k));

    class Part {
        constructor() { this.geos = []; }
        add(geo, hex, x, y, z, rx, ry, rz, sx, sy, sz) {
            _o.position.set(x || 0, y || 0, z || 0); _o.rotation.set(rx || 0, ry || 0, rz || 0);
            const s1 = sx || 1; _o.scale.set(s1, sy || s1, sz || s1); _o.updateMatrix();
            geo.applyMatrix4(_o.matrix);
            const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
            geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
            this.geos.push(geo); return this;
        }
        raw(geo) { this.geos.push(geo); return this; }
        mesh(mat) {
            if (!this.geos.length) return null;
            const g = BufferGeometryUtils.mergeGeometries(this.geos, false); this.geos.forEach((x) => x.dispose()); this.geos = [];
            return new THREE.Mesh(g, mat || charMat);
        }
    }
    const G = {
        s: (r, w, h) => new THREE.SphereGeometry(r, w || 14, h || 10),
        c: (r, len, rs) => new THREE.CapsuleGeometry(r, len, 3, rs || 8),
        y: (r1, r2, h, seg, open, ts, tl) => new THREE.CylinderGeometry(r1, r2, h, seg || 14, 1, !!open, ts || 0, tl == null ? Math.PI * 2 : tl),
        k: (r, h, seg) => new THREE.ConeGeometry(r, h, seg || 8),
        t: (r, tube, arc, rs) => new THREE.TorusGeometry(r, tube, 6, rs || 18, arc || Math.PI * 2),
        b: (x, y, z) => new THREE.BoxGeometry(x, y, z),
        l: (pts, seg) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg || 16),
        sp: (r, ps, pl, ts, tl, w, h) => new THREE.SphereGeometry(r, w || 22, h || 12, ps, pl, ts, tl),
        // конечность от сустава (y=0) вниз на len: r0 у сустава, r1 у конца, bulge — утолщение ближе к суставу
        limb: (r0, r1, len, bulge, seg) => {
            const pts = [[0.0005, -len - r1 * 0.92]];
            for (let k = 1; k <= 3; k++) { const a = k * Math.PI / 6; pts.push([r1 * Math.sin(a), -len - r1 * Math.cos(a)]); }
            pts.push([lerp(r1, r0, 0.45) + (bulge || 0), -len * 0.55]);
            pts.push([lerp(r1, r0, 0.8) + (bulge || 0) * 0.6, -len * 0.25]);
            for (let k = 3; k >= 1; k--) { const a = k * Math.PI / 6; pts.push([r0 * Math.sin(a), r0 * Math.cos(a)]); }
            pts.push([0.0005, r0 * 0.96]);
            return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), Math.min(seg || 10, 10));
        },
    };

    // ---------- лицо: рисуется на холсте и натягивается на переднюю часть головы ----------
    // кусок сферы: азимут ±0.95 рад от фронта, полярный угол 0.95..2.25; 200 px на радиан — без искажений пропорций
    const FACE = { ps: Math.PI / 2 - 0.95, pl: 1.9, ts: 0.95, tl: 1.5 }, FW = 380, FH = 300;
    // голова: эллипсоид, который сужается к подбородку и чуть выдвигает его вперёд; слой лица — та же поверхность
    const HEAD = { SX: 0.93, SY: 1.04, SZ: 0.98 };
    function headPoint(R, th, ph, out) {
        const jaw = 1 - 0.27 * smooth((th - 1.5) / 1.05), fwd = Math.max(0, Math.sin(ph));
        return out.set(-Math.cos(ph) * Math.sin(th) * HEAD.SX * jaw * R, Math.cos(th) * HEAD.SY * R, Math.sin(ph) * Math.sin(th) * HEAD.SZ * (1 + 0.06 * smooth((th - 1.85) / 0.75) * fwd) * R);
    }
    function headGeo(R, ps, pl, ts, tl, W, H) {
        const pos = [], uv = [], idx = [], p = new V3();
        for (let j = 0; j <= W; j++) for (let i = 0; i <= H; i++) { headPoint(R, ts + tl * i / H, ps + pl * j / W, p); pos.push(p.x, p.y, p.z); uv.push(j / W, 1 - i / H); }
        for (let j = 0; j < W; j++) for (let i = 0; i < H; i++) { const a = j * (H + 1) + i, b = (j + 1) * (H + 1) + i; idx.push(a, a + 1, b, b, a + 1, b + 1); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        return g;
    }
    const faceCache = new Map();
    function drawEye(g, x, y, k, sp, state) {
        const rx = sp.fem ? 21 : 18, ry = sp.fem ? 25 : 18.5;
        g.strokeStyle = sp.lash; g.fillStyle = sp.lash;
        if (state === 'blink' || state === 'happy') {
            g.lineWidth = sp.fem ? 5.5 : 5; g.beginPath();
            if (state === 'blink') { g.moveTo(x - rx, y + 3); g.quadraticCurveTo(x, y + 13, x + rx, y + 3); }
            else { g.moveTo(x - rx, y + 9); g.quadraticCurveTo(x, y - 12, x + rx, y + 9); }
            g.stroke();
            if (sp.fem) { g.lineWidth = 4; g.beginPath(); g.moveTo(x + k * rx, y + (state === 'blink' ? 3 : 9)); g.lineTo(x + k * (rx + 7), y + (state === 'blink' ? -2 : 4)); g.stroke(); }
            return;
        }
        g.save();
        g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = '#fbf7f2'; g.fill(); g.clip();
        const ir = rx * 0.76, iy = ry * 0.86, ix = x - k * 1.5, ic = y + 3;
        const gr = g.createLinearGradient(0, ic - iy, 0, ic + iy);
        gr.addColorStop(0, shade(sp.eye, -0.6)); gr.addColorStop(0.5, sp.eye); gr.addColorStop(1, shade(sp.eye, 0.5));
        g.fillStyle = gr; g.beginPath(); g.ellipse(ix, ic, ir, iy, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = shade(sp.eye, -0.65); g.lineWidth = 1.6; g.stroke();
        g.fillStyle = '#0f0907'; g.beginPath(); g.ellipse(ix, ic + 1, ir * 0.42, iy * 0.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(70,35,35,0.3)'; g.fillRect(x - rx, y - ry, rx * 2, ry * 0.55); // тень от века
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ix - ir * 0.36, ic - iy * 0.42, sp.fem ? 6.2 : 5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(ix + ir * 0.34, ic + iy * 0.42, 2.6, 0, Math.PI * 2); g.fill();
        g.restore();
        g.strokeStyle = sp.lash; g.lineCap = 'round';
        g.lineWidth = sp.fem ? 6 : 4.6; g.beginPath(); g.ellipse(x, y + 1, rx + 1.5, ry + 1.5, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
        if (sp.fem) { g.lineWidth = 4; g.beginPath(); const ox = x + k * (rx + 1); g.moveTo(ox, y - 5); g.lineTo(ox + k * 8, y - 10); g.stroke(); }
        g.globalAlpha = 0.5; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, rx, ry + 1, 0, Math.PI * 0.32, Math.PI * 0.68); g.stroke(); g.globalAlpha = 1;
    }
    function drawMouth(g, x, y, type) {
        g.strokeStyle = '#7a2c2c'; g.lineWidth = 3.4; g.lineCap = 'round';
        const open = (wd, top, bot) => { g.fillStyle = '#5a1a20'; g.beginPath(); g.moveTo(x - wd, y - 4); g.quadraticCurveTo(x, y - 4 + top, x + wd, y - 4); g.quadraticCurveTo(x + wd * 0.75, y + bot, x, y + bot); g.quadraticCurveTo(x - wd * 0.75, y + bot, x - wd, y - 4); g.fill(); g.fillStyle = '#d9706c'; g.beginPath(); g.ellipse(x, y + bot - 5, wd * 0.55, 4.5, 0, 0, Math.PI * 2); g.fill(); };
        if (type === 'smile') { g.lineWidth = 3.8; g.beginPath(); g.moveTo(x - 21, y - 5); g.quadraticCurveTo(x, y + 13, x + 21, y - 5); g.stroke(); g.fillStyle = 'rgba(200,90,90,0.25)'; g.beginPath(); g.ellipse(x, y + 9, 9, 3, 0, 0, Math.PI * 2); g.fill(); g.lineWidth = 2; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 23, y - 7); g.lineTo(x - 20, y - 4); g.moveTo(x + 23, y - 7); g.lineTo(x + 20, y - 4); g.stroke(); }
        else if (type === 'neutral') { g.beginPath(); g.moveTo(x - 11, y); g.quadraticCurveTo(x, y + 3, x + 11, y); g.stroke(); }
        else if (type === 'cat') { g.beginPath(); g.moveTo(x - 15, y - 3); g.quadraticCurveTo(x - 7, y + 7, x, y - 1); g.quadraticCurveTo(x + 7, y + 7, x + 15, y - 3); g.stroke(); }
        else if (type === 'open') open(14, 2, 16);
        else if (type === 'grin') { open(19, 3, 17); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x - 16, y - 4.5); g.quadraticCurveTo(x, y - 1, x + 16, y - 4.5); g.lineTo(x + 14, y + 1); g.quadraticCurveTo(x, y + 4, x - 14, y + 1); g.closePath(); g.fill(); }
    }
    function faceTex(sp, state) {
        const key = [sp.fem ? 1 : 0, sp.eye, sp.brow, sp.lash, sp.mouth, sp.blush ? 1 : 0, sp.old ? 1 : 0, state].join('|');
        if (faceCache.has(key)) return faceCache.get(key);
        const c = document.createElement('canvas'); c.width = FW; c.height = FH; const g = c.getContext('2d');
        g.lineCap = 'round'; g.lineJoin = 'round';
        const cx = FW / 2, ey = 120, ex = 62;
        if (sp.blush) [-1, 1].forEach((k) => { const gr = g.createRadialGradient(cx + k * 70, 170, 2, cx + k * 70, 170, 26); gr.addColorStop(0, 'rgba(255,100,100,0.34)'); gr.addColorStop(1, 'rgba(255,100,100,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(cx + k * 70, 170, 30, 17, 0, 0, Math.PI * 2); g.fill(); });
        [-1, 1].forEach((k) => drawEye(g, cx + k * ex, ey, k, sp, state));
        g.strokeStyle = sp.brow; g.lineWidth = sp.fem ? 3.6 : 5.6; g.lineCap = 'round';
        [-1, 1].forEach((k) => { const bx = cx + k * ex, by = ey - (sp.fem ? 41 : 33) - (state === 'happy' || state === 'talk' ? 3 : 0); g.beginPath(); g.moveTo(bx - k * 19, by + 2); g.quadraticCurveTo(bx - k * 2, by - 7, bx + k * 22, by + 4); g.stroke(); });
        g.strokeStyle = 'rgba(150,70,55,0.42)'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(cx + 3, 184); g.quadraticCurveTo(cx - 4, 196, cx + 2, 200); g.stroke();
        if (sp.old) { g.strokeStyle = 'rgba(120,70,50,0.35)'; g.lineWidth = 2; [-1, 1].forEach((k) => { g.beginPath(); g.moveTo(cx + k * 45, ey + 26); g.quadraticCurveTo(cx + k * 62, ey + 32, cx + k * 80, ey + 24); g.stroke(); g.beginPath(); g.moveTo(cx + k * 20, 206); g.quadraticCurveTo(cx + k * 28, 226, cx + k * 26, 240); g.stroke(); }); }
        const mt = state === 'talk' ? (sp.mouth === 'grin' || sp.mouth === 'cat' ? 'grin' : 'open') : (state === 'happy' ? 'smile' : sp.mouth);
        drawMouth(g, cx, 244, mt);
        const t = makeTex(c); t.userData.shared = true; faceCache.set(key, t); return t;
    }

    // ---------- внешность ----------
    const SKINS = ['#f3d6bd', '#eccaa8', '#e5bd98', '#f6dcc8', '#dcae88', '#c99470'];
    const HAIRS = ['#16161c', '#1e1614', '#2e1d14', '#4a2e1a', '#6a4426', '#2a2230', '#8a5a34'];
    const EYES = ['#5a3420', '#6a4024', '#3a4a6a', '#4a3a2e', '#4a6a4a', '#7a4a2a'];
    const TOPS = ['#4a6ab8', '#c84a4a', '#eeeeea', '#2a2a32', '#e8b8c4', '#4aa060', '#e0a030', '#7a5aa8', '#3a8a9a', '#d87a4a'];
    const PANTS = ['#2a2a34', '#34466a', '#5a4a3a', '#1c1c26', '#6a6a70', '#3a3a2a'];
    function look(rnd, o) {
        const pick = (a) => a[Math.floor(rnd() * a.length)];
        const fem = o.fem != null ? o.fem : rnd() < 0.5;
        const r = { fem, skin: pick(SKINS), hair: pick(HAIRS), eye: pick(EYES), top: pick(TOPS), pants: pick(PANTS),
            hairStyle: fem ? pick(['long', 'bob', 'ponytail', 'long', 'bun']) : pick(['short', 'short', 'spiky', 'short']),
            mouth: pick(['smile', 'smile', 'neutral', 'cat']), blush: fem ? rnd() < 0.85 : rnd() < 0.3, seed: rnd() * 100 };
        Object.keys(o).forEach((k) => { if (o[k] !== undefined && o[k] !== null) r[k] = o[k]; });
        return r;
    }

    // ---------- строитель человека ----------
    function makeChar(o) {
        o = Object.assign({ skin: SKINS[0], hair: HAIRS[0], eye: EYES[0], top: '#4a6ab8', pants: '#2a2a34', hairStyle: 'short', mouth: 'smile' }, o);
        const tint = o.tint || ((h) => h);
        const fem = !!o.fem, out = o.outfit || 'casual';
        const skin = tint(o.skin), hair = tint(o.hair);
        let top = tint(o.top), pants = tint(o.pants), shoes = tint(o.shoes || (out === 'sailor' ? '#3a2416' : '#2a1e16'));
        const root = new THREE.Group(); root.userData.keep = true;
        const J = {};
        const mk = (n, p, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); J[n] = g; return g; };
        mk('hips', root, 0, 0.88, 0); mk('spine', J.hips, 0, 0.04, 0); mk('neck', J.spine, 0, 0.455, 0); mk('head', J.neck, 0, 0.05, 0);
        const shX = fem ? 0.158 : 0.172;
        mk('shL', J.spine, shX, 0.392, 0); mk('elL', J.shL, 0, -0.27, 0); mk('hdL', J.elL, 0, -0.27, 0.01);
        mk('shR', J.spine, -shX, 0.392, 0); mk('elR', J.shR, 0, -0.27, 0); mk('hdR', J.elR, 0, -0.27, 0.01);
        mk('hpL', J.hips, 0.085, -0.02, 0); mk('knL', J.hpL, 0, -0.42, 0);
        mk('hpR', J.hips, -0.085, -0.02, 0); mk('knR', J.hpR, 0, -0.42, 0);
        const P = {}; ['hips', 'spine', 'head', 'shL', 'elL', 'shR', 'elR', 'hpL', 'knL', 'hpR', 'knR'].forEach((n) => { P[n] = new Part(); });

        // одежда: цвета корпуса, рукавов, ног
        let torso = top, sleeve = top, fore = top, legs = pants, shin = pants, longSleeve = !o.short, skirt = null, skirtLen = 0, skirtR = 0.24;
        const jacket = tint(o.jacket || (out === 'police' ? '#1a2a5a' : '#2a2a34'));
        if (out === 'suit' || out === 'uniform' || out === 'police') { torso = sleeve = fore = jacket; if (out === 'police') pants = legs = shin = tint('#1a2a5a'); }
        if (out === 'gakuran') { torso = sleeve = fore = tint('#16182a'); pants = legs = shin = tint('#16182a'); }
        if (out === 'sailor') { torso = sleeve = fore = tint(o.sailor || '#1e2a4a'); skirt = tint('#1e2a4a'); skirtLen = 0.36; skirtR = 0.25; legs = skin; shin = tint('#1c1c24'); }
        if (out === 'konbini') { torso = sleeve = fore = tint('#f2f4f8'); }
        if (out === 'samue') { fore = skin; }
        if (out === 'coat' || out === 'chef') { torso = sleeve = fore = tint('#f4f4f6'); if (out === 'coat') { skirt = tint('#f4f4f6'); skirtLen = 0.5; skirtR = 0.22; } }
        if (out === 'dress') { skirt = top; skirtLen = 0.48; skirtR = 0.27; legs = skin; shin = skin; }
        if (out === 'kimono') { skirt = top; skirtLen = 0.84; skirtR = 0.2; legs = shin = top; fore = top; }
        if (o.short) { fore = skin; }
        if (o.seated && skirt && skirtLen > 0.3) skirtLen = 0.18; // сидя длинный подол превращается в «колени»

        // таз и корпус
        P.hips.add(G.s(0.15, 16, 10), pants, 0, 0, 0, 0, 0, 0, 1, 0.62, 0.72);
        if (!skirt || out === 'coat') P.hips.add(G.y(0.152, 0.152, 0.035, 18), tint(out === 'suit' ? '#1a1a1e' : '#3a2a1e'), 0, 0.045, 0, 0, 0, 0, 1, 1, 0.72);
        const prof = fem
            ? [[0.152, 0], [0.146, 0.07], [0.122, 0.17], [0.138, 0.26], [0.152, 0.32], [0.148, 0.38], [0.128, 0.425], [0.06, 0.452], [0.001, 0.458]]
            : [[0.15, 0], [0.148, 0.07], [0.138, 0.17], [0.15, 0.28], [0.168, 0.36], [0.166, 0.405], [0.132, 0.44], [0.062, 0.458], [0.001, 0.462]];
        P.spine.add(G.l(prof), torso, 0, 0, 0, 0, 0, 0, 1, 1, 0.66);
        P.spine.add(G.y(0.039, 0.045, 0.1, 12), skin, 0, 0.475, -0.004);
        const fz = (y) => { let r = prof[0][0]; for (let i = 1; i < prof.length; i++) if (prof[i][1] >= y) { const a = prof[i - 1], b = prof[i]; r = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); break; } return r * 0.66; };
        if (out === 'suit' || out === 'uniform' || out === 'police') {
            P.spine.add(G.b(0.075, 0.15, 0.01), tint(o.shirt || '#f4f4f4'), 0, 0.37, fz(0.37) - 0.002, -0.35);
            if (out !== 'police') P.spine.add(G.b(0.03, 0.2, 0.012), tint(o.tie || '#8a2a2a'), 0, 0.31, fz(0.31) + 0.006, -0.12);
            [-1, 1].forEach((k) => P.spine.add(G.b(0.04, 0.17, 0.012), shade(jacket, -0.25), k * 0.045, 0.37, fz(0.37) + 0.004, -0.3, 0, k * 0.32));
            P.spine.add(G.s(0.009, 6, 5), tint('#c8a84a'), 0, 0.17, fz(0.17) + 0.004);
            if (out === 'police') { P.spine.add(G.b(0.05, 0.03, 0.01), tint('#d8b84a'), 0.07, 0.33, fz(0.33) + 0.005); }
        }
        if (out === 'gakuran') { P.spine.add(G.y(0.062, 0.066, 0.05, 12), tint('#16182a'), 0, 0.455, 0); for (let i = 0; i < 4; i++) P.spine.add(G.s(0.011, 6, 5), tint('#d8b84a'), 0, 0.12 + i * 0.085, fz(0.12 + i * 0.085) + 0.003); }
        if (out === 'sailor') {
            P.spine.add(G.b(0.3, 0.17, 0.012), tint('#1e2a4a'), 0, 0.36, -fz(0.36) - 0.004, 0.25);
            P.spine.add(G.b(0.28, 0.012, 0.014), tint('#f4f4f4'), 0, 0.3, -fz(0.3) - 0.01, 0.25);
            P.spine.add(G.k(0.04, 0.09, 6), tint(o.scarf || '#c8322a'), 0, 0.33, fz(0.33) + 0.008, Math.PI);
        }
        if (out === 'konbini') {
            const vest = prof.slice(0, 7).map((p) => [p[0] * 1.045, p[1]]);
            P.spine.add(G.l(vest), tint(o.vest || '#2f7fd0'), 0, 0.01, 0, 0, 0, 0, 1, 1, 0.66);
            P.spine.add(G.b(0.055, 0.026, 0.006), tint('#ffffff'), 0.065, 0.33, fz(0.33) * 1.045 + 0.006, -0.3);
        }
        if (out === 'samue' || o.apron) {
            const ap = tint(o.apron || '#1e2433');
            P.spine.add(G.b(0.22, 0.24, 0.01), ap, 0, 0.17, fz(0.17) + 0.006, -0.05);
            P.spine.add(G.b(0.3, 0.02, 0.012), ap, 0, 0.05, fz(0.05) + 0.004);
            if (!o.seated) P.hips.add(G.b(0.31, 0.46, 0.012), ap, 0, -0.2, 0.112, 0.06);
        }
        if (out === 'kimono') { P.spine.add(G.y(0.152, 0.15, 0.11, 18), tint(o.obi || '#c8a84a'), 0, 0.12, 0, 0, 0, 0, 1, 1, 0.7); P.spine.add(G.b(0.06, 0.2, 0.012), shade(top, 0.35), 0.02, 0.36, fz(0.36) + 0.002, -0.3, 0, 0.35); }
        if (out === 'chef') { P.spine.add(G.k(0.05, 0.08, 6), tint('#c8322a'), 0, 0.42, fz(0.42) + 0.02, Math.PI); for (let i = 0; i < 3; i++) [-1, 1].forEach((k) => P.spine.add(G.s(0.009, 6, 5), tint('#d8d8dc'), k * 0.05, 0.15 + i * 0.08, fz(0.15 + i * 0.08) + 0.003)); }
        if (skirt) {
            if (o.seated) { P.hips.add(G.y(0.158, 0.19, skirtLen, 18), skirt, 0, -0.03, 0, 0, 0, 0, 1, 1, 0.74); P.hips.add(G.b(0.3, 0.03, 0.38), skirt, 0, 0.05, 0.19); }
            else if (out === 'coat') P.hips.add(G.y(0.158, skirtR, skirtLen, 18, true, 0.35, Math.PI * 2 - 0.7), skirt, 0, 0.04 - skirtLen / 2, 0, 0, 0, 0, 1, 1, 0.78);
            else P.hips.add(G.y(0.155, skirtR, skirtLen, out === 'sailor' ? 16 : 22), skirt, 0, 0.05 - skirtLen / 2, 0, 0, 0, 0, 1, 1, 0.78);
        }
        if (o.bag) { P.spine.add(G.b(0.25, 0.2, 0.08), tint(o.bagCol || '#5a3a22'), 0.21, -0.02, 0.02, 0, 0, 0.05); P.spine.add(G.b(0.02, 0.56, 0.012), tint('#3a2a1a'), 0.02, 0.24, fz(0.24) + 0.008, 0, 0, -0.62); }
        if (o.backpack) P.spine.add(G.b(0.25, 0.3, 0.11), tint(o.bagCol || '#2a2a34'), 0, 0.24, -fz(0.24) - 0.05);

        // руки
        [['L', 1], ['R', -1]].forEach(([s, k]) => {
            const S = P['sh' + s], E = P['el' + s];
            S.add(G.s(0.05, 14, 10), sleeve, 0, -0.01, 0, 0, 0, 0, 1, 0.92, 0.95);
            if (o.short) { S.add(G.limb(0.047, 0.037, 0.27, 0.004), skin, 0, 0, 0); S.add(G.y(0.06, 0.056, 0.13, 14), sleeve, 0, -0.05, 0); }
            else S.add(G.limb(0.052, 0.042, 0.27, 0.004), sleeve, 0, 0, 0);
            E.add(G.limb(fore === skin ? 0.038 : 0.043, fore === skin ? 0.026 : 0.034, 0.225, 0.005), fore, 0, 0, 0);
            if (!o.short && fore !== skin && out !== 'kimono') E.add(G.y(0.037, 0.036, 0.02, 12), shade(fore, out === 'suit' ? 0.85 : -0.12), 0, -0.222, 0);
            if (out === 'kimono') E.add(G.y(0.05, 0.078, 0.2, 14, true), top, 0, -0.12, 0);
            // кисть: запястье, ладонь, четыре пальца, большой палец
            E.add(G.y(0.024, 0.022, 0.03, 10), skin, 0, -0.232, 0.002, 0, 0, 0, 0.62, 1, 1);
            E.add(G.s(0.038, 10, 8), skin, 0, -0.262, 0.004, 0, 0, 0, 0.5, 0.78, 0.95);
            for (let f = 0; f < 4; f++) E.add(new THREE.CapsuleGeometry(0.0085, 0.034 - Math.abs(f - 1.5) * 0.005, 2, 5), skin, -k * 0.004, -0.3 + Math.abs(f - 1.5) * 0.003, -0.017 + f * 0.0115, 0, 0, k * 0.28);
            E.add(new THREE.CapsuleGeometry(0.0105, 0.028, 2, 5), skin, -k * 0.016, -0.25, 0.026, -0.6, 0, -k * 0.25);
        });
        // ноги
        [['L', 1], ['R', -1]].forEach(([s]) => {
            P['hp' + s].add(G.limb(0.078, 0.056, 0.42, 0.006, 14), legs, 0, 0, 0);
            P['kn' + s].add(G.limb(0.056, 0.04, 0.37, 0.011, 14), shin, 0, 0, -0.004);
            P['kn' + s].add(G.s(0.056, 12, 8), shoes, 0, -0.395, 0.042, 0, 0, 0, 0.92, 0.62, 1.8);
            P['kn' + s].add(G.b(0.095, 0.018, 0.19), shade(shoes, -0.4), 0, -0.428, 0.04);
            if (out === 'sailor') P['kn' + s].add(G.y(0.056, 0.054, 0.04, 10), tint('#f4f4f4'), 0, -0.34, 0);
        });

        // голова: череп + подбородок, уши, нос, волосы, лицо отдельным слоем
        const H = P.head, HC = 0.115, R = 0.118, SX = HEAD.SX, SY = HEAD.SY, SZ = HEAD.SZ;
        H.add(headGeo(R, 0, Math.PI * 2, 0, Math.PI, 26, 16), skin, 0, HC, 0);
        const ep = headPoint(R, 1.62, 0, new V3()); [-1, 1].forEach((k) => H.add(G.s(0.025, 10, 8), shade(skin, -0.03), k * Math.abs(ep.x), HC + ep.y, -0.006, 0, 0, 0, 0.42, 1, 0.72));
        const np = headPoint(R, 1.9, Math.PI / 2, new V3()); H.add(G.s(0.0085, 8, 6), skin, 0, HC + np.y + 0.002, np.z - 0.002, 0, 0, 0, 0.75, 1, 0.75);
        addHair(H, o, hair, SX, SY, SZ, R, HC);
        if (o.glasses) { [-1, 1].forEach((k) => { H.add(G.t(0.027, 0.0035, 0, 16), tint('#2a2a36'), k * 0.036, 0.117, 0.121); H.add(G.b(0.004, 0.004, 0.11), tint('#2a2a36'), k * 0.1, 0.12, 0.07); }); H.add(G.b(0.02, 0.004, 0.004), tint('#2a2a36'), 0, 0.122, 0.124); }
        if (o.hachimaki) { H.add(G.t(0.113, 0.013, 0, 24), tint('#f4f4f4'), 0, 0.172, -0.004, Math.PI / 2, 0, 0, 0.95, 1, 1.0); H.add(G.s(0.022, 8, 6), tint('#f4f4f4'), 0, 0.17, -0.118); }
        if (o.hat) { H.add(G.y(0.1, 0.112, 0.085, 16), tint(o.hat), 0, 0.235, -0.004); H.add(G.y(0.165, 0.165, 0.01, 18), tint(o.hat), 0, 0.195, -0.004); H.add(G.y(0.113, 0.113, 0.02, 16), shade(tint(o.hat), -0.35), 0, 0.207, -0.004); }
        if (o.cap) { H.add(G.sp(R * 1.1, 0, Math.PI * 2, 0, 1.25, 16, 8), tint(o.cap), 0, HC + 0.01, -0.004, -0.1, 0, 0, SX, SY, SZ); H.add(G.b(0.15, 0.01, 0.1), tint(o.cap), 0, 0.17, 0.13, -0.15); }
        if (out === 'police') { H.add(G.y(0.118, 0.112, 0.07, 16), jacket, 0, 0.225, -0.004); H.add(G.b(0.17, 0.01, 0.09), tint('#111116'), 0, 0.19, 0.125, -0.2); H.add(G.s(0.016, 8, 6), tint('#e8c850'), 0, 0.235, 0.115); }
        if (out === 'chef') { H.add(G.y(0.105, 0.1, 0.2, 16), tint('#fafafa'), 0, 0.31, -0.004); H.add(G.s(0.12, 14, 8), tint('#fafafa'), 0, 0.42, -0.004, 0, 0, 0, 1, 0.55, 1); }

        Object.keys(P).forEach((n) => { const m = P[n].mesh(); if (m) J[n].add(m); });
        // лицо
        const sp = { fem, eye: tint(o.eye), brow: shade(hair, -0.25), lash: o.lash || '#1a1014', mouth: o.mouth, blush: !!o.blush, old: !!o.old };
        const faceMat = faceMatOf(faceTex(sp, 'open'));
        const face = new THREE.Mesh(headGeo(R * 1.004, FACE.ps, FACE.pl, FACE.ts, FACE.tl, 20, 16), faceMat);
        face.position.set(0, HC, 0); face.renderOrder = 2; J.head.add(face);

        const sc = (o.h || 1.68) / 1.68 * (o.small ? 0.66 : 1);
        root.scale.setScalar(sc);
        const ch = { root, J, face, faceMat, sp, o, sc, pose: o.pose || 'stand', act: o.act || 'idle', seed: o.seed || Math.random() * 100,
            lk: { y: 0, x: 0 }, blinkAt: 1 + Math.random() * 3, st: 'open', talkUntil: 0, faceUntil: 0, yaw: 0, baseYaw: 0, gest: null, seatY: o.seatY || 0, held: {} };
        root.userData.char = ch;
        if (o.holdR) hold(ch, 'R', o.holdR); if (o.holdL) hold(ch, 'L', o.holdL);
        return ch;
    }
    function hairShell(o, col, SX, SY, SZ, R, HC) {
        const st = o.hairStyle, fem = !!o.fem, R1 = R * 1.085;
        const front = fem ? 1.3 : 1.24, side = st === 'long' ? 2.3 : st === 'bob' ? 2.08 : (fem ? 1.86 : 1.72);
        const back = st === 'long' ? 3.2 : st === 'bob' ? 2.12 : (st === 'ponytail' || st === 'bun' ? 1.86 : 1.98);
        const NF = fem ? 9 : 7, part = (o.seed || 0) % 3 < 1;
        const hem = (d) => {
            const a = Math.abs(d); let base, amp, n;
            if (a < 0.6) { base = front; amp = fem ? 0.15 : 0.12; n = NF; }
            else if (a < 1.05) { const k = smooth((a - 0.6) / 0.45); base = front + (side - front) * k; amp = 0.12; n = NF; }
            else { const k = smooth((a - 1.05) / 1.3); base = side + (back - side) * k; amp = st === 'long' ? 0.16 : 0.09; n = 11; }
            const x = (d / (Math.PI * 2)) * n * 2 + 0.5, tri = 1 - 2 * Math.abs(((x % 1) + 1) % 1 - 0.5);
            let h = base + amp * Math.pow(tri, 1.8) - amp * 0.4;
            if (part && a < 0.5) h -= 0.1 * Math.exp(-Math.pow((d - 0.18) / 0.1, 2));
            return h;
        };
        const NW = 46, NH = 13, ths = 1.72, pos = [], colA = [], uv = [], idx = [];
        const cBase = new THREE.Color(col), cHi = new THREE.Color(mix(col, '#ffffff', 0.32)), cLo = new THREE.Color(mix(col, '#000000', 0.3)), cc = new THREE.Color();
        for (let j = 0; j <= NW; j++) {
            const ph = (j / NW) * Math.PI * 2; let d = ph - Math.PI / 2; if (d > Math.PI) d -= Math.PI * 2;
            const hm = hem(d);
            for (let i = 0; i <= NH; i++) {
                const v = i / NH, th = v * hm;
                const r = R1 * (1 + 0.05 * Math.max(0, Math.cos(th)) + (Math.abs(d) < 0.7 && v > 0.8 ? -0.025 : 0));
                let x, y, z;
                if (th <= ths) { x = -Math.cos(ph) * Math.sin(th) * r * SX; y = HC + Math.cos(th) * r * SY; z = Math.sin(ph) * Math.sin(th) * r * SZ; }
                else { const ex = th - ths, fl = 1 + ex * 0.22; x = -Math.cos(ph) * Math.sin(ths) * r * SX * fl; y = HC + Math.cos(ths) * r * SY - ex * r * 1.3; z = Math.sin(ph) * Math.sin(ths) * r * SZ * fl; }
                pos.push(x, y, z); uv.push(j / NW, 1 - v);
                // блик-ободок на макушке, темнее к кончикам прядей
                const band = Math.max(0, 1 - Math.abs(th - 0.72) / 0.16) * (Math.abs(d) < 1.9 ? 1 : 0.3) * (0.6 + 0.4 * Math.sin(ph * 9));
                cc.copy(cBase).lerp(cHi, band * 0.85).lerp(cLo, Math.pow(v, 3) * 0.6);
                colA.push(cc.r, cc.g, cc.b);
            }
        }
        for (let j = 0; j < NW; j++) for (let i = 0; i < NH; i++) { const a0 = j * (NH + 1) + i, b0 = (j + 1) * (NH + 1) + i; idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3)); g.setIndex(idx);
        g.computeVertexNormals();
        const n = g.attributes.normal; for (let i = 0; i <= NH; i++) { const a0 = i, b0 = NW * (NH + 1) + i; const nx = n.getX(a0) + n.getX(b0), ny = n.getY(a0) + n.getY(b0), nz = n.getZ(a0) + n.getZ(b0), L = Math.hypot(nx, ny, nz) || 1; n.setXYZ(a0, nx / L, ny / L, nz / L); n.setXYZ(b0, nx / L, ny / L, nz / L); }
        return g;
    }
    function addHair(H, o, col, SX, SY, SZ, R, HC) {
        const st = o.hairStyle;
        if (st === 'bald') { H.add(G.sp(R * 1.05, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 1.2, 0.62, 18, 6), col, 0, HC, 0, 0, 0, 0, SX, SY, SZ); return; }
        H.raw(hairShell(o, col, SX, SY, SZ, R, HC));
        if (st === 'ponytail') { H.add(G.limb(0.042, 0.018, 0.2, 0.01), col, 0, 0.14, -0.13, 0.55); H.add(G.t(0.028, 0.009, 0, 10), '#c8322a', 0, 0.13, -0.125, 1.1); }
        if (st === 'bun') { H.add(G.s(0.058, 14, 10), col, 0, 0.235, -0.07); H.add(G.t(0.04, 0.008, 0, 12), '#c8322a', 0, 0.205, -0.06, 0.6); }
        if (st === 'spiky') for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; H.add(G.k(0.035, 0.075, 5), col, Math.sin(a) * 0.065, HC + 0.105, Math.cos(a) * 0.065 - 0.02, Math.cos(a) * 0.75, 0, -Math.sin(a) * 0.75); }
    }

    // ---------- вещи в руках ----------
    function hold(ch, side, kind) {
        const P = new Part();
        switch (kind) {
            case 'mug': P.add(G.y(0.036, 0.034, 0.11, 12), '#e8a628', 0, 0, 0); P.add(G.y(0.0375, 0.0375, 0.024, 12), '#fff8e8', 0, 0.064, 0); P.add(G.t(0.026, 0.008, Math.PI, 8), '#f2e6c0', 0.04, 0.0, 0, 0, 0, -Math.PI / 2); break;
            case 'cup': P.add(G.y(0.03, 0.022, 0.05, 12), '#f4f0e8', 0, 0, 0); P.add(G.y(0.027, 0.027, 0.004, 12), '#8aa04a', 0, 0.022, 0); break;
            case 'phone': P.add(G.b(0.07, 0.14, 0.009), '#16161c', 0, 0, 0); P.add(G.b(0.062, 0.125, 0.002), '#8fd0ff', 0, 0, 0.005); break;
            case 'chopsticks': P.add(G.y(0.003, 0.002, 0.22, 5), '#c89a5a', -0.006, 0, 0); P.add(G.y(0.003, 0.002, 0.22, 5), '#c89a5a', 0.006, 0, 0.004); break;
            case 'ladle': P.add(G.y(0.007, 0.007, 0.2, 6), '#b8bcc4', 0, -0.07, 0); P.add(G.y(0.034, 0.03, 0.03, 12), '#b8bcc4', 0, -0.165, 0); P.add(G.y(0.009, 0.009, 0.06, 6), '#5a3a22', 0, 0.02, 0); break;
            case 'chalk': P.add(G.y(0.006, 0.006, 0.06, 6), '#ffffff', 0, 0, 0); break;
            case 'pen': P.add(G.y(0.004, 0.004, 0.13, 6), '#2a5ad0', 0, 0, 0); break;
            case 'book': P.add(G.b(0.15, 0.21, 0.025), '#c84a4a', 0, 0, 0); P.add(G.b(0.14, 0.2, 0.026), '#f4efe0', 0.006, 0, 0); break;
            case 'pad': P.add(G.b(0.08, 0.11, 0.008), '#f4efe0', 0, 0, 0); P.add(G.b(0.08, 0.02, 0.01), '#c8322a', 0, 0.055, 0); break;
            case 'basket': P.add(G.b(0.3, 0.16, 0.2), '#d83a3a', 0, -0.16, 0); P.add(G.b(0.27, 0.02, 0.17), '#f0c030', 0, -0.075, 0); P.add(G.t(0.09, 0.008, Math.PI, 10), '#c8322a', 0, -0.075, 0); break;
            case 'mikan': P.add(G.s(0.035, 10, 8), '#f08a1a', 0, 0, 0, 0, 0, 0, 1, 0.85, 1); break;
            case 'bachi': P.add(G.y(0.011, 0.014, 0.36, 6), '#e0c890', 0, -0.13, 0.01); break;
            case 'stick': P.add(G.y(0.012, 0.014, 0.82, 6), '#5a3a22', 0, -0.39, 0.02); break;
            case 'sword': P.add(G.b(0.022, 0.8, 0.008), '#d8dce4', 0, -0.42, 0.02); P.add(G.b(0.07, 0.025, 0.03), '#c8a84a', 0, -0.03, 0.02); P.add(G.y(0.014, 0.014, 0.16, 6), '#1a1a1e', 0, 0.06, 0.02); break;
            default: return;
        }
        const m = P.mesh(heldMat); const g = new THREE.Group(); g.add(m);
        // предмет держим «поперёк» кисти: когда предплечье вытянуто вперёд, кружка стоит ровно
        if (kind === 'mug' || kind === 'cup' || kind === 'mikan') { m.rotation.x = Math.PI / 2; m.position.set(0, -0.02, 0.045); }
        else if (kind === 'phone') { m.rotation.x = Math.PI / 2 + 0.5; m.position.set(0, -0.04, 0.035); }
        else if (kind === 'chopsticks' || kind === 'pen' || kind === 'chalk') { m.rotation.x = -0.3; m.position.set(0, -0.06, 0.02); }
        else if (kind === 'book' || kind === 'pad') { m.rotation.x = Math.PI / 2; m.position.set(0, -0.05, 0.03); }
        else if (kind === 'ladle') { m.rotation.x = Math.PI / 2; m.position.set(0, -0.02, 0.0); }
        ch.J['hd' + side].add(g); ch.held[side] = g;
    }

    // ---------- кот ----------
    function catFaceTex(col, sleep) {
        const key = 'cat|' + col + '|' + sleep; if (faceCache.has(key)) return faceCache.get(key);
        const c = document.createElement('canvas'); c.width = FW; c.height = FH; const g = c.getContext('2d'); g.lineCap = 'round';
        const cx = FW / 2;
        g.strokeStyle = '#1a1210'; g.lineWidth = 6;
        [-1, 1].forEach((k) => { g.beginPath(); if (sleep) { g.moveTo(cx + k * 62 - 18, 124); g.quadraticCurveTo(cx + k * 62, 136, cx + k * 62 + 18, 124); g.stroke(); } else { g.fillStyle = '#c8d84a'; g.beginPath(); g.ellipse(cx + k * 62, 122, 20, 18, 0, 0, 7); g.fill(); g.fillStyle = '#100a08'; g.beginPath(); g.ellipse(cx + k * 62, 122, 5, 15, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + k * 62 - 6, 115, 4, 0, 7); g.fill(); } });
        g.fillStyle = '#e88a9a'; g.beginPath(); g.moveTo(cx - 9, 172); g.lineTo(cx + 9, 172); g.lineTo(cx, 182); g.closePath(); g.fill();
        g.lineWidth = 3; g.strokeStyle = '#3a2420'; g.beginPath(); g.moveTo(cx, 182); g.lineTo(cx, 190); g.moveTo(cx - 12, 194); g.quadraticCurveTo(cx - 6, 200, cx, 190); g.quadraticCurveTo(cx + 6, 200, cx + 12, 194); g.stroke();
        g.strokeStyle = 'rgba(250,250,250,0.85)'; g.lineWidth = 2;
        [-1, 1].forEach((k) => { for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(cx + k * 30, 176 + i * 6); g.lineTo(cx + k * 110, 164 + i * 14); g.stroke(); } });
        const t = makeTex(c); t.userData.shared = true; faceCache.set(key, t); return t;
    }
    function makeCat(col, sleep) {
        const root = new THREE.Group(); root.userData.keep = true;
        const J = {}; const mk = (n, p, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); J[n] = g; return g; };
        const belly = mix(col, '#f4efe6', 0.6);
        mk('body', root, 0, 0, 0); mk('head', J.body, 0, sleep ? 0.075 : 0.25, sleep ? 0.15 : 0.07);
        const PB = new Part(), PH = new Part();
        if (sleep) { PB.add(G.s(0.13, 16, 10), col, 0, 0.075, 0, 0, 0, 0, 1.05, 0.58, 1.2); PB.add(G.t(0.13, 0.024, Math.PI * 1.15, 14), col, 0, 0.03, 0, Math.PI / 2, 0, 0.6); }
        else { PB.add(G.c(0.085, 0.12, 10), col, 0, 0.14, 0, -0.25); PB.add(G.s(0.07, 10, 8), belly, 0, 0.15, 0.06, 0, 0, 0, 0.9, 1.2, 0.6); [-1, 1].forEach((k) => { PB.add(G.c(0.022, 0.12, 6), col, k * 0.045, 0.07, 0.07); PB.add(G.s(0.07, 10, 8), col, k * 0.05, 0.06, -0.06, 0, 0, 0, 0.6, 0.8, 1.1); }); }
        PH.add(G.s(0.07, 16, 12), col, 0, 0, 0, 0, 0, 0, 1.08, 0.95, 1);
        PH.add(G.s(0.03, 10, 8), belly, 0, -0.022, 0.05, 0, 0, 0, 1.3, 0.8, 0.8);
        [-1, 1].forEach((k) => { PH.add(G.k(0.03, 0.06, 4), col, k * 0.045, 0.06, -0.005, 0, Math.PI / 4, k * -0.35); PH.add(G.k(0.017, 0.035, 4), '#e8a8b0', k * 0.044, 0.056, 0.004, 0, Math.PI / 4, k * -0.35); });
        J.body.add(PB.mesh()); J.head.add(PH.mesh());
        const fm = new THREE.MeshStandardMaterial({ map: catFaceTex(col, sleep), transparent: true, depthWrite: false, roughness: 0.7 });
        const face = new THREE.Mesh(G.sp(0.0705, FACE.ps, FACE.pl, FACE.ts, FACE.tl, 20, 12), fm); face.scale.set(1.08, 0.95, 1); face.renderOrder = 2; J.head.add(face);
        if (sleep) { J.head.rotation.set(0.25, 0, 0.55); J.head.position.set(0.05, 0.075, 0.15); }
        // хвост цепочкой — качается
        J.tail = [];
        let p = J.body; const tb = sleep ? [0, 0.05, -0.15] : [0, 0.05, -0.1];
        for (let i = 0; i < 4; i++) { const g = new THREE.Group(); if (i === 0) g.position.set(tb[0], tb[1], tb[2]); else g.position.set(0, 0, -0.06); p.add(g); const PT = new Part(); PT.add(G.c(0.016 - i * 0.002, 0.045, 6), col, 0, 0, -0.03, Math.PI / 2); g.add(PT.mesh()); J.tail.push(g); p = g; }
        if (sleep) { J.tail[0].rotation.y = 1.2; J.tail.forEach((g, i) => { if (i) g.rotation.y = 0.5; }); }
        else { J.tail[0].rotation.x = -0.9; }
        const ch = { root, J, cat: true, sleep, seed: Math.random() * 100, yaw: 0, baseYaw: 0, lines: [['にゃー', 'Мяу'], ['ゴロゴロ…', 'Мррр…']], lk: { y: 0, x: 0 } };
        root.userData.char = ch; return ch;
    }

    // ---------- позы и занятия ----------
    function arm(J, s, x, z, el, y) { J['sh' + s].rotation.set(x, y || 0, s === 'L' ? z : -z); J['el' + s].rotation.set(el, 0, 0); }
    function legsPose(J, hp, kn, spread) { J.hpL.rotation.set(hp, 0, spread || 0); J.hpR.rotation.set(hp, 0, -(spread || 0)); J.knL.rotation.set(kn, 0, 0); J.knR.rotation.set(kn, 0, 0); }
    function pose(ch, t, dt) {
        const J = ch.J, T = t + ch.seed, sc = ch.sc;
        J.spine.rotation.set(0, 0, 0); J.neck.rotation.set(0, 0, 0); J.head.rotation.set(0, 0, 0); J.hips.rotation.set(0, 0, 0);
        J.hips.position.y = 0.88;
        const p = ch.walking ? 'walk' : ch.pose;
        let headX = 0, canLook = ch.canLook !== false;
        if (p === 'stand') { legsPose(J, 0, 0); arm(J, 'L', 0.04, 0.09, -0.14); arm(J, 'R', 0.04, 0.09, -0.14); J.hips.rotation.z = Math.sin(T * 0.55) * 0.018; J.spine.rotation.z = -J.hips.rotation.z * 0.7; }
        else if (p === 'sit') { J.hips.position.y = ch.seatY / sc + 0.075; legsPose(J, -Math.PI / 2, Math.PI / 2 - 0.05, 0.07); arm(J, 'L', -0.35, 0.06, -0.95); arm(J, 'R', -0.35, 0.06, -0.95); }
        else if (p === 'seiza') { J.hips.position.y = ch.seatY / sc + 0.2; legsPose(J, -1.2, 2.72, 0.05); arm(J, 'L', -0.32, 0.05, -0.85); arm(J, 'R', -0.32, 0.05, -0.85); }
        else if (p === 'kotatsu') { J.hips.position.y = ch.seatY / sc + 0.075; legsPose(J, -1.45, 0.22, 0.06); arm(J, 'L', -0.55, 0.1, -0.55); arm(J, 'R', -0.55, 0.1, -0.55); }
        else if (p === 'walk') {
            const ph = ch.wph || 0, s = Math.sin(ph);
            J.hpL.rotation.set(0.42 * s, 0, 0); J.hpR.rotation.set(-0.42 * s, 0, 0);
            J.knL.rotation.set(0.1 + Math.max(0, Math.sin(ph - 1.2)) * 0.75, 0, 0); J.knR.rotation.set(0.1 + Math.max(0, -Math.sin(ph - 1.2)) * 0.75, 0, 0);
            J.hips.position.y = 0.88 - 0.012 + Math.abs(Math.cos(ph)) * 0.02; J.hips.rotation.y = s * 0.08; J.spine.rotation.y = -s * 0.12;
            if (ch.act === 'carry') { arm(J, 'L', -0.65, 0.1, -1.0); arm(J, 'R', -0.65, 0.1, -1.0); }
            else { arm(J, 'L', -0.3 * s, 0.08, -0.25 - Math.max(0, -s) * 0.3); arm(J, 'R', 0.3 * s, 0.08, -0.25 - Math.max(0, s) * 0.3); if (ch.held.L) arm(J, 'L', -0.08 * s, 0.12, -0.15); }
        }
        // дыхание
        J.spine.rotation.x += Math.sin(T * 1.7) * 0.012;
        J.shL.rotation.z += Math.sin(T * 1.7) * 0.01; J.shR.rotation.z -= Math.sin(T * 1.7) * 0.01;
        if (!ch.walking) switch (ch.act) {
            case 'drink': { // кружка у стойки: раз в несколько секунд — глоток
                const c = T % 8;
                const e = env4(c, 0.6, 1.4, 2.6, 3.4);
                arm(J, 'R', lerp(-0.85, -1.05, e) , 0.12, lerp(-0.85, -2.25, e));
                arm(J, 'L', -0.8, 0.1, -0.75);
                headX = lerp(0.05, -0.28, e); J.spine.rotation.x += 0.12 - e * 0.1;
                break; }
            case 'eat': { const c = T % 3.4; const e = env4(c, 0.3, 0.8, 1.2, 1.7); arm(J, 'R', lerp(-0.85, -1.0, e), 0.12, lerp(-0.85, -2.1, e)); arm(J, 'L', -0.8, 0.1, -0.85); headX = 0.18 - e * 0.15; J.spine.rotation.x += 0.15; break; }
            case 'talk': { arm(J, 'R', -0.55 - Math.sin(T * 1.3) * 0.25, 0.12 + Math.sin(T * 0.9) * 0.08, -1.1 + Math.sin(T * 2.1) * 0.35); arm(J, 'L', -0.45, 0.08, -0.95 + Math.sin(T * 1.7) * 0.2); J.spine.rotation.x += 0.08; headX = Math.sin(T * 2.4) * 0.06; break; }
            case 'laugh': { arm(J, 'L', -0.45, 0.08, -0.95); arm(J, 'R', -0.45, 0.08, -0.95); J.spine.rotation.x += 0.1 + Math.max(0, Math.sin(T * 13)) * 0.05 * (Math.sin(T * 0.7) > 0.4 ? 1 : 0); break; }
            case 'cook': { const a = T * 3.4; arm(J, 'R', -0.75 + Math.cos(a) * 0.12, 0.05 + Math.sin(a) * 0.1, -1.0); arm(J, 'L', -0.65, 0.12, -1.1); headX = 0.35; J.spine.rotation.x += 0.1; break; }
            case 'scan': { arm(J, 'L', -0.7, 0.12, -0.75); arm(J, 'R', -0.75 + Math.sin(T * 1.1) * 0.08, 0.12, -0.75 + Math.sin(T * 2.3) * 0.1); headX = 0.2; break; }
            case 'write': { arm(J, 'R', -0.78, 0.14, -1.1 + Math.sin(T * 9) * 0.04); J.shR.rotation.y = Math.sin(T * 2.2) * 0.06; arm(J, 'L', -0.72, 0.18, -1.3); J.spine.rotation.x += 0.28; headX = 0.42; if (T % 11 < 1.6) headX = 0.05; break; }
            case 'read': { arm(J, 'R', -0.85, 0.12, -1.35); arm(J, 'L', -0.85, 0.12, -1.35); J.spine.rotation.x += 0.18; headX = 0.38; break; }
            case 'sleep': { arm(J, 'L', -1.05, -0.25, -1.75); arm(J, 'R', -1.05, -0.25, -1.75); J.spine.rotation.x += 0.62 + Math.sin(T * 0.9) * 0.02; headX = 0.55; J.head.rotation.y = 0.5; canLook = false; break; }
            case 'type': { arm(J, 'L', -0.9, 0.1, -0.85 + Math.sin(T * 11) * 0.04); arm(J, 'R', -0.9, 0.1, -0.85 + Math.sin(T * 13 + 1) * 0.04); J.spine.rotation.x += 0.1; headX = 0.12; break; }
            case 'phone': { arm(J, 'L', -0.7, -0.18, -1.45); arm(J, 'R', -0.75, -0.22, -1.45); headX = 0.45; break; }
            case 'browse': { headX = 0.1 + Math.sin(T * 0.5) * 0.15; J.head.rotation.y = Math.sin(T * 0.6) * 0.45; const e = env4(T % 7, 4.5, 5.1, 5.6, 6.2); arm(J, 'R', lerp(0.04, -1.25, e), 0.09, lerp(-0.14, -0.3, e)); if (ch.held.L) arm(J, 'L', 0.0, 0.14, -0.1); canLook = e < 0.1; break; }
            case 'watch': { J.spine.rotation.x += 0.05 + (Math.sin(T * 0.45) > 0.85 ? Math.max(0, Math.sin(T * 14)) * 0.05 : 0); break; }
            case 'mikan': { const e = env4(T % 6, 0.4, 0.9, 1.4, 2.0); arm(J, 'R', lerp(-0.55, -0.95, e), 0.1, lerp(-0.55, -2.1, e)); break; }
            case 'teach': {
                // стоит у доски: то пишет мелом (спиной к классу), то оборачивается и объясняет
                const c = T % 14, w = c > 8.5 && c < 13;
                ch.yawOverride = w ? ch.boardYaw : null; canLook = !w;
                if (w) { arm(J, 'R', -2.3 + Math.sin(T * 5) * 0.08, 0.25 + Math.sin(T * 3) * 0.12, -0.55); headX = -0.15; }
                else { const pt = env4(c, 1, 1.5, 4, 4.6); arm(J, 'R', lerp(-0.3, -1.45, pt), lerp(0.1, 0.55, pt), lerp(-0.9, -0.15, pt)); arm(J, 'L', -0.45, 0.08, -1.2); }
                break; }
            case 'sneak': {
                // телефон на коленях под партой; иногда настороженно поглядывает на учителя
                const look = (T % 9) < 1.1; arm(J, 'L', -0.38, -0.12, -1.25); arm(J, 'R', -0.42, -0.16, -1.2 + Math.sin(T * 0.8) * 0.03);
                headX = look ? 0.05 : 0.62; J.spine.rotation.x += 0.18; canLook = false; break; }
            case 'piano': {
                if (ch.playing) { const a = T * 7; canLook = false; arm(J, 'L', -0.95 + Math.sin(a * 0.9) * 0.05, 0.16 + Math.sin(T * 1.7) * 0.12, -0.8 + Math.max(0, Math.sin(a)) * 0.14); arm(J, 'R', -0.95 + Math.sin(a * 1.1 + 1) * 0.05, 0.16 + Math.sin(T * 2.3 + 1) * 0.12, -0.8 + Math.max(0, Math.sin(a * 1.3 + 2)) * 0.14); J.spine.rotation.x += 0.12 + Math.sin(T * 1.3) * 0.03; headX = 0.16 + Math.sin(T * 2.2) * 0.05; }
                else { arm(J, 'L', -0.9, 0.1, -0.85 + Math.sin(T * 0.7) * 0.02); arm(J, 'R', -0.9, 0.1, -0.85); J.spine.rotation.x += 0.08; headX = 0.1; }
                break; }
            case 'wave': break;
            case 'play': { arm(J, 'L', -0.82 + Math.sin(T * 7) * 0.05, 0.14 + Math.sin(T * 9.3) * 0.08, -0.72); arm(J, 'R', -0.82, 0.1, -0.72 + Math.max(0, Math.sin(T * 13)) * 0.18); J.spine.rotation.x += 0.14; headX = 0.08; canLook = false; if (T % 9 < 0.6) { J.spine.rotation.x -= 0.1; headX = -0.15; } break; }
            case 'drum': { const a = T * 7.5; arm(J, 'L', -1.05 + Math.sin(a) * 0.5, 0.18, -0.9 + Math.sin(a) * 0.3); arm(J, 'R', -1.05 + Math.sin(a + Math.PI) * 0.5, 0.18, -0.9 + Math.sin(a + Math.PI) * 0.3); J.spine.rotation.x += 0.08 + Math.abs(Math.sin(a)) * 0.04; canLook = false; break; }
            default: { if (p === 'stand') arm(J, 'L', 0.04 + Math.sin(T * 0.8) * 0.03, 0.09, -0.14); }
        }
        if (ch.o && ch.o.armPose === 'up') arm(J, 'R', -2.9, 0.1, -0.2);
        if (ch.held.R && ch.o && ch.o.holdR === 'stick') arm(J, 'R', -0.25, 0.12, -0.35);
        // жесты поверх занятия (под реплику)
        const g = ch.gest;
        if (g) {
            if (t > g.t1) ch.gest = null;
            else {
                const e = env4(t, g.t0, g.t0 + 0.35, g.t1 - 0.45, g.t1);
                if (g.kind === 'raise') { J.shR.rotation.x = lerp(J.shR.rotation.x, -2.9, e); J.shR.rotation.z = lerp(J.shR.rotation.z, -0.1, e); J.elR.rotation.x = lerp(J.elR.rotation.x, -0.2, e); headX = lerp(headX, -0.05, e); }
                if (g.kind === 'cheers') { J.shR.rotation.x = lerp(J.shR.rotation.x, -2.3, e); J.elR.rotation.x = lerp(J.elR.rotation.x, -0.9, e); headX = lerp(headX, -0.15, e); }
                if (g.kind === 'bow') { J.spine.rotation.x += 0.55 * e; headX += 0.25 * e; J.shL.rotation.x = lerp(J.shL.rotation.x, 0.1, e); J.shR.rotation.x = lerp(J.shR.rotation.x, 0.1, e); }
                if (g.kind === 'nod') headX += Math.max(0, Math.sin((t - g.t0) * 9)) * 0.25 * e;
                if (g.kind === 'wave') { J.shL.rotation.set(lerp(J.shL.rotation.x, -0.2, e), 0, lerp(J.shL.rotation.z, 2.5, e)); J.elL.rotation.set(0, 0, 0); J.elL.rotation.z = Math.sin(t * 9) * 0.45 * e; }
            }
        }
        // взгляд: на игрока, если он рядом и спереди, иначе — на собеседника
        let wantY = 0, wantX = headX, looked = false;
        J.head.getWorldPosition(_v2);
        const dxw = camera.position.x - _v2.x, dzw = camera.position.z - _v2.z, dist = Math.hypot(dxw, dzw);
        if (canLook && dist < 4.3) {
            ch.root.worldToLocal(_v.copy(camera.position));
            const ang = Math.atan2(_v.x, _v.z);
            if (Math.abs(ang) < 1.9) { wantY = clamp(ang, -1.05, 1.05); wantX = clamp(-Math.atan2(camera.position.y - _v2.y, dist) * 0.8, -0.45, 0.35); looked = true; }
        }
        if (!looked && ch.focus && canLook) { ch.root.worldToLocal(_v.copy(ch.focus)); const ang = Math.atan2(_v.x, _v.z); if (Math.abs(ang) < 1.6) wantY = clamp(ang, -0.9, 0.9) * (Math.sin(T * 0.3) > -0.3 ? 1 : 0.2); }
        const k = 1 - Math.exp(-dt * 3.5);
        ch.lk.y += (wantY - ch.lk.y) * k; ch.lk.x += (wantX - ch.lk.x) * k;
        J.neck.rotation.y += ch.lk.y * 0.35; J.head.rotation.y += ch.lk.y * 0.65; J.head.rotation.x += ch.lk.x;
        ch.looking = looked;
        // лицо: моргание, разговор
        let st = 'open';
        if (ch.act === 'sleep') st = 'blink';
        else {
            if (t > ch.blinkAt) { if (t > ch.blinkAt + 0.13) ch.blinkAt = t + 1.8 + Math.random() * 3.6; else st = 'blink'; }
            if (ch.act === 'laugh' && Math.sin(T * 0.7) > 0.4) st = 'happy';
            if (ch.happy && T % 9 < 1.3) st = 'happy';
            if (t < ch.talkUntil && st !== 'blink') st = Math.sin(t * 17 + Math.sin(t * 6.3) * 2.2) > -0.15 ? 'talk' : 'open';
            if (ch.gest && (ch.gest.kind === 'bow' || ch.gest.kind === 'cheers') && t < ch.gest.t1) st = st === 'talk' ? 'talk' : 'happy';
        }
        if (st !== ch.st) { ch.st = st; ch.faceMat.map = faceTex(ch.sp, st); }
    }
    function poseCat(ch, t) {
        const T = t + ch.seed, J = ch.J;
        if (ch.sleep) { J.body.scale.set(1, 1 + Math.sin(T * 1.9) * 0.04, 1); J.tail[3].rotation.y = 0.5 + Math.sin(T * 0.8) * 0.4 * (Math.sin(T * 0.23) > 0.5 ? 1 : 0.2); }
        else { J.tail.forEach((g, i) => { if (i) g.rotation.y = Math.sin(T * 1.6 - i * 0.6) * 0.35; }); J.head.rotation.y = Math.sin(T * 0.35) * 0.5; J.head.rotation.z = Math.sin(T * 0.21) * 0.15; }
    }

    // ---------- реплики-пузыри ----------
    const bubbleCache = new Map();
    function bubbleTex(line) {
        const key = line[0] + '|' + (line[1] || ''); if (bubbleCache.has(key)) return bubbleCache.get(key);
        const c = document.createElement('canvas'); const g = c.getContext('2d');
        g.font = '700 50px ' + JP; const w1 = g.measureText(line[0]).width; g.font = '500 25px ' + UI; const w2 = line[1] ? g.measureText(line[1]).width : 0;
        const W = Math.ceil(Math.max(180, Math.max(w1, w2) + 70)), Hb = line[1] ? 168 : 120;
        c.width = W; c.height = Hb + 30;
        g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = 10; g.shadowOffsetY = 3;
        g.fillStyle = 'rgba(255,253,248,0.97)'; roundRect(g, 8, 6, W - 16, Hb - 12, 36); g.fill();
        g.beginPath(); g.moveTo(W / 2 - 18, Hb - 8); g.lineTo(W / 2 + 2, Hb + 22); g.lineTo(W / 2 + 18, Hb - 8); g.closePath(); g.fill();
        g.shadowColor = 'transparent';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#1b1b24'; g.font = '700 50px ' + JP; g.fillText(line[0], W / 2, line[1] ? 58 : Hb / 2);
        if (line[1]) { g.fillStyle = '#6b6b7c'; g.font = '500 25px ' + UI; g.fillText(line[1], W / 2, 118); }
        const t = makeTex(c); t.userData.shared = true; t.userData.aspect = W / c.height; bubbleCache.set(key, t); return t;
    }
    function say(ch, line, dur, t, parent) {
        if (!ch.root.parent) return;
        if (typeof voiceLine === 'function') voiceLine(ch, line);
        dur = dur || 2.8;
        const tex = bubbleTex(line);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0 }));
        s.center.set(0.5, 0); s.renderOrder = 999; const h = line[1] ? 0.44 : 0.32; s.scale.set(h * tex.userData.aspect, h, 1);
        (parent || room).add(s);
        S.bubbles.forEach((b) => { if (b.ch === ch) b.t1 = Math.min(b.t1, t + 0.15); }); // у персонажа — одна реплика за раз
        S.bubbles.push({ s, ch, t0: t, t1: t + dur, street: !!parent });
        ch.talkUntil = t + dur - 0.5;
        if (line[2]) ch.gest = { kind: line[2], t0: t, t1: t + (line[2] === 'bow' ? 1.6 : 2.4) };
    }

    // ---------- мелочи вокруг: пар, лапша, мягкие тени, пылинки, занавеска ----------
    function steamAt(x, y, z, n, op) {
        for (let i = 0; i < (n || 4); i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false })); sp.userData = { kitchen: true, age: Math.random() * 3, life: 2 + Math.random() * 1.2 }; sp.position.set(x, y, z); sp.scale.setScalar(0.3); room.add(sp); inside.steam.push(sp); }
    }
    function propMesh(build, x, y, z, ry) { const P = new Part(); build(P); const m = P.mesh(heldMat); m.position.set(x, y, z); m.rotation.y = ry || 0; m.userData.keep = true; room.add(m); return m; }
    const MUG = (P, x, z) => { P.add(G.y(0.036, 0.034, 0.11, 12), '#e8a628', x, 0.055, z); P.add(G.y(0.0375, 0.0375, 0.024, 12), '#fff8e8', x, 0.12, z); P.add(G.t(0.026, 0.008, Math.PI, 8), '#f2e6c0', x + 0.04, 0.055, z, 0, 0, -Math.PI / 2); };
    const PLATE = (P, x, z, food) => { P.add(G.y(0.09, 0.07, 0.02, 18), '#f4f2ee', x, 0.01, z); if (food === 'edamame') for (let i = 0; i < 9; i++) P.add(G.c(0.012, 0.035, 5), '#6aa83a', x + Math.cos(i * 2.4) * 0.04 * (i % 3) / 2, 0.028, z + Math.sin(i * 2.4) * 0.04 * (i % 3) / 2, Math.PI / 2, i * 0.9); else if (food === 'yakitori') for (let i = 0; i < 3; i++) { P.add(G.y(0.003, 0.003, 0.2, 4), '#d8b880', x, 0.03, z - 0.04 + i * 0.04, 0, 0, Math.PI / 2); for (let q = 0; q < 4; q++) P.add(G.s(0.017, 7, 5), '#8a4a22', x - 0.06 + q * 0.035, 0.032, z - 0.04 + i * 0.04); } else for (let i = 0; i < 4; i++) P.add(G.s(0.02, 8, 6), ['#e8d8c8', '#c84a4a', '#f0e0a0', '#8ab060'][i], x - 0.03 + (i % 2) * 0.05, 0.03, z - 0.02 + (i >> 1) * 0.04); };
    const BOWL = (P, x, z, col) => { P.add(G.y(0.065, 0.04, 0.06, 16), col || '#2a3a6a', x, 0.03, z); P.add(G.y(0.06, 0.06, 0.008, 16), '#e8c87a', x, 0.055, z); };

    function aoLayer(blobs) {
        const { w, d, h } = ROOM, ppm = 40;
        const c = document.createElement('canvas'); c.width = Math.ceil(w * ppm); c.height = Math.ceil(d * ppm); const g = c.getContext('2d');
        const X = (x) => (x + w / 2) * ppm, Z = (z) => (z + d / 2) * ppm, e = 0.6 * ppm;
        const strip = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
        strip(0, 0, e, 0, 0, 0, e, c.height); strip(c.width, 0, c.width - e, 0, c.width - e, 0, e, c.height);
        strip(0, 0, 0, e, 0, 0, c.width, e); strip(0, c.height, 0, c.height - e, 0, c.height - e, c.width, e);
        g.fillStyle = '#000'; g.shadowOffsetX = 10000;
        g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 0.22 * ppm;
        colliders.room.forEach((b) => { if (b.npc) return; const x0 = b.x0 + 0.22, x1 = b.x1 - 0.22, z0 = b.z0 + 0.22, z1 = b.z1 - 0.22; if (x1 > x0 && z1 > z0) g.fillRect(X(x0) - 10000, Z(z0), (x1 - x0) * ppm, (z1 - z0) * ppm); });
        g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 0.12 * ppm;
        blobs.forEach((bl) => { g.beginPath(); g.ellipse(X(bl.x) - 10000, Z(bl.z), bl.r * ppm, (bl.rz || bl.r) * ppm, 0, 0, Math.PI * 2); g.fill(); });
        const tex = makeTex(c);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        m.rotation.x = -Math.PI / 2; m.position.y = 0.003; m.renderOrder = 1; m.userData.keep = true; room.add(m);
        // тень у основания стен и под потолком — комната перестаёт быть «коробкой»
        const wc = document.createElement('canvas'); wc.width = 4; wc.height = 128; const wg = wc.getContext('2d');
        const gr = wg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(0,0,0,0.32)'); gr.addColorStop(0.25, 'rgba(0,0,0,0.08)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.42)'); wg.fillStyle = gr; wg.fillRect(0, 0, 4, 128);
        const wt = makeTex(wc);
        [['back', w], ['front', w], ['left', d], ['right', d]].forEach(([wl, len]) => {
            const p = wallPoint(wl, 0, h / 2, 0.012);
            const q = new THREE.Mesh(new THREE.PlaneGeometry(len, h), new THREE.MeshBasicMaterial({ map: wt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
            q.position.set(p.x, p.y, p.z); q.rotation.y = p.ry; q.userData.keep = true; room.add(q);
        });
    }
    function motes(col) {
        const { w, d, h } = ROOM, n = 70, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * (w - 1); pos[i * 3 + 1] = 0.5 + Math.random() * (h - 0.8); pos[i * 3 + 2] = (Math.random() - 0.5) * (d - 1); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: discTex, color: new THREE.Color(col), size: 0.018, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
        pts.userData.keep = true; pts.userData.base = pos.slice(); room.add(pts); S.motes = pts;
    }
    function noren(x, y, z, ry, chars, col) {
        const pw = 0.46, ph = 0.44;
        chars.forEach((chr, i) => {
            const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
            g.fillStyle = col; g.fillRect(0, 0, 128, 128); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, 128, 10);
            g.fillStyle = '#f4efe2'; g.font = '700 70px ' + JP; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(chr, 64, 72);
            const geo = new THREE.PlaneGeometry(pw, ph, 4, 6);
            const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: makeTex(c), side: THREE.DoubleSide, roughness: 0.9 }));
            const off = (i - (chars.length - 1) / 2) * (pw + 0.015);
            m.position.set(x + Math.cos(ry) * off, y, z - Math.sin(ry) * off); m.rotation.y = ry; m.userData.keep = true; room.add(m);
            S.cloth.push({ m, base: geo.attributes.position.array.slice(), ph: i * 1.3 + Math.random() });
        });
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, chars.length * (pw + 0.015) + 0.1, 6), new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.6 }));
        rod.rotation.z = Math.PI / 2; rod.rotation.y = ry; rod.position.set(x, y + ph / 2 + 0.01, z); rod.userData.keep = true; room.add(rod);
    }

    // ---------- население комнат ----------
    const LINES = {
        chef: { greet: ['いらっしゃいませ！', 'Добро пожаловать!', 'bow'], lines: [['はい、喜んで！', 'С радостью!'], ['焼き鳥、あがり！', 'Якитори готовы!'], ['お待たせしました！', 'Простите за ожидание!', 'nod']] },
        bar: { lines: [['乾杯！', 'Будем!', 'cheers'], ['うまい！', 'Вкуснотища!'], ['もう一杯！', 'Ещё одну!', 'raise'], ['すみませーん！', 'Извините! (зовёт официанта)', 'raise'], ['今日も疲れた…', 'Ну и денёк…']] },
        party: { lines: [['乾杯！', 'Будем!', 'cheers'], ['おいしいね！', 'Вкусно, правда?'], ['それ、本当？', 'Серьёзно?'], ['あはは！', 'Ахаха!', 'nod'], ['いただきます！', 'Приятного аппетита!']] },
        waiter: { greet: ['いらっしゃいませー！', 'Добро пожаловать!', 'bow'], lines: [['生ビール、二つですね！', 'Два разливных, верно?', 'nod'], ['少々お待ちください', 'Минутку, пожалуйста'], ['ご注文はお決まりですか？', 'Готовы заказать?']] },
        clerk: { greet: ['いらっしゃいませ！', 'Добро пожаловать!', 'bow'], lines: [['温めますか？', 'Подогреть?'], ['袋はご利用ですか？', 'Пакет нужен?'], ['ポイントカードはお持ちですか？', 'Есть карта баллов?'], ['ありがとうございました！', 'Спасибо за покупку!', 'bow']] },
        shopper: { lines: [['どれにしようかな…', 'Что бы выбрать…'], ['あ、新発売だ！', 'О, новинка!'], ['おにぎり、まだあるかな', 'Онигири ещё остались?'], ['これください', 'Вот это, пожалуйста']] },
        teacher: { greet: ['こんばんは！', 'Добрый вечер!', 'nod'], lines: [['はい、静かに！', 'Тише, пожалуйста!'], ['黒板を見てください', 'Смотрите на доску'], ['わかりましたか？', 'Всё понятно?'], ['もう一度言ってください', 'Повторите, пожалуйста'], ['宿題を出してください', 'Сдайте домашнее задание']] },
        student: { lines: [['はい！', 'Да! (тянет руку)', 'raise'], ['わかりません…', 'Не понимаю…'], ['先生、質問です！', 'Учитель, вопрос!', 'raise'], ['テストはいつですか？', 'Когда контрольная?'], ['なるほど！', 'Понятно!', 'nod']] },
        sleeper: { lines: [['ぐー…', 'Хррр…']] },
        family: { greet: ['おかえり！', 'С возвращением!', 'wave'], lines: [['みかん食べる？', 'Будешь мандаринку?'], ['このドラマ、面白い！', 'Классная дорама!', 'nod'], ['こたつから出られない…', 'Не могу вылезти из котацу…'], ['お茶いれようか？', 'Заварить чаю?']] },
        cook: { lines: [['ごはんできたよ！', 'Ужин готов!'], ['いいにおい！', 'Как вкусно пахнет!'], ['手を洗ってね', 'Помой руки!']] },
        worker: { lines: [['締め切りが…', 'Дедлайн…'], ['あと少し！', 'Ещё чуть-чуть!'], ['疲れたなあ', 'Устал…']] },
        student1r: { greet: ['あ、どうぞ！', 'О, заходи!', 'wave'], lines: [['レポートが終わらない…', 'Курсовая не кончается…'], ['ゲームしよう！', 'Давай поиграем!'], ['カップ麺でいいや', 'Сойдёт и лапша быстрого…'], ['来週テストだ…', 'На следующей неделе экзамен…'], ['この漫画、最高！', 'Эта манга — огонь!']] },
        elder: { greet: ['いらっしゃい', 'Проходи, проходи', 'bow'], lines: [['お茶をどうぞ', 'Угощайся чаем'], ['いい天気ですね', 'Хорошая погода, правда?'], ['足を崩してください', 'Сиди, как удобно'], ['昔はね…', 'Вот в наше время…', 'nod']] },
        couple: { greet: ['おかえり！', 'С возвращением!', 'wave'], lines: [['映画見ようか', 'Посмотрим фильм?'], ['夜景がきれい', 'Какой красивый ночной вид'], ['ワイン飲む？', 'Будешь вино?'], ['今日どうだった？', 'Как прошёл день?']] },
        ramenChef: { greet: ['へい、らっしゃい！', 'Добро пожаловать!', 'nod'], lines: [['ラーメン一丁！', 'Одна рамен!'], ['麺の硬さは？', 'Лапшу какой жёсткости?'], ['替え玉、どうぞ！', 'Добавка лапши!'], ['お待ちどう！', 'Готово!']] },
        ramenGuest: { lines: [['ズズッ…', 'Хлюп…'], ['うまっ！', 'Вкуснятина!'], ['替え玉ください！', 'Ещё порцию лапши!', 'raise'], ['スープまで飲める', 'Даже бульон допью']] },
        barista: { greet: ['いらっしゃいませ', 'Добро пожаловать', 'bow'], lines: [['ブレンドでございます', 'Ваш фирменный кофе'], ['ご注文はお決まりですか？', 'Готовы заказать?'], ['ケーキもいかがですか', 'Не хотите торт?']] },
        cafeGuest: { lines: [['このケーキ、おいしい！', 'Этот торт — чудо!'], ['コーヒーおかわり', 'Ещё кофе, пожалуйста', 'raise'], ['ゆっくりしよう', 'Давай не спешить'], ['この本、面白いよ', 'Интересная книга'], ['それでね…', 'И вот, значит…', 'nod']] },
        reader: { lines: [['新刊が出てる！', 'Вышел новый том!'], ['この漫画、面白そう', 'Эта манга выглядит интересно'], ['どこにあるかな…', 'Где же она…'], ['ちょっと立ち読み…', 'Почитаю немножко…']] },
        bookClerk: { greet: ['いらっしゃいませ', 'Добро пожаловать', 'bow'], lines: [['カバーおかけしますか？', 'Обернуть в обложку?'], ['新刊はこちらです', 'Новинки вот здесь'], ['ありがとうございました', 'Спасибо за покупку!', 'bow']] },
        gamer: { lines: [['よっしゃ！', 'Есть!', 'raise'], ['もう一回！', 'Ещё разок!'], ['あー、惜しい！', 'Эх, чуть-чуть!'], ['ハイスコアだ！', 'Рекорд!', 'raise'], ['これ欲しい！', 'Хочу вот эту!']] },
        drummer: { lines: [['ドン！カッ！', 'Дон! Ка!'], ['フルコンボだ！', 'Полное комбо!', 'raise'], ['難しい〜', 'Сложно-о!']] },
    };
    function populate(type, placed, grid, seed) {
        const rnd = mulberry32(seed), pick = (a) => a[Math.floor(rnd() * a.length)];
        const blobs = [];
        const W = (g, x, y, z) => g.localToWorld(new V3(x, y, z));
        const yawOf = (g, ry) => g.rotation.y + ry;
        const mods = (n) => placed.filter((m) => m.name === n && m._grp);
        const add = (o, p, yaw, extra) => {
            const ch = makeChar(look(rnd, o));
            ch.root.position.set(p.x, 0, p.z); ch.yaw = ch.baseYaw = yaw; ch.root.rotation.y = yaw;
            Object.assign(ch, extra || {}); if (extra && extra.role && LINES[extra.role]) { ch.lines = LINES[extra.role].lines; ch.greet = LINES[extra.role].greet; }
            room.add(ch.root); S.room.push(ch);
            if (ch.pose === 'stand' && !ch.route) { colliders.room.push({ x0: p.x - 0.3, x1: p.x + 0.3, z0: p.z - 0.3, z1: p.z + 0.3, npc: true }); grid.mark(p.x - 0.35, p.z - 0.35, p.x + 0.35, p.z + 0.35); }
            blobs.push({ x: p.x, z: p.z, r: ch.pose === 'stand' ? 0.24 : 0.3 });
            return ch;
        };
        const free = (x, z, r) => Math.abs(x) < ROOM.w / 2 - 0.5 && Math.abs(z) < ROOM.d / 2 - 0.5 && grid.free(x - r, z - r, x + r, z + r);
        const walker = (o, extra) => { // ходит туда-обратно по свободному проходу
            for (let i = 0; i < 60; i++) {
                const ax = (rnd() - 0.5) * (ROOM.w - 1.6), az = (rnd() - 0.5) * (ROOM.d - 2), bx = (rnd() - 0.5) * (ROOM.w - 1.6), bz = (rnd() - 0.5) * (ROOM.d - 2);
                const L = Math.hypot(bx - ax, bz - az); if (L < 2.6) continue;
                let ok = true; for (let s = 0; s <= 1.0001 && ok; s += 0.2 / L) ok = free(ax + (bx - ax) * s, az + (bz - az) * s, 0.28);
                if (!ok) continue;
                return add(o, { x: ax, z: az }, Math.atan2(bx - ax, bz - az), Object.assign({ route: { a: new V3(ax, 0, az), b: new V3(bx, 0, bz), leg: false, wait: 0 } }, extra));
            }
            return null;
        };
        if (type === 'izakaya') {
            mods('kitchen').forEach((m) => { const g = m._grp; const x = pick([-0.8, 0, 0.8]) - 0.15; add({ fem: false, outfit: 'samue', top: '#2a3550', hachimaki: true, hairStyle: 'short', mouth: 'grin', holdR: 'ladle' }, W(g, x, 0, 0.35), yawOf(g, Math.PI), { act: 'cook', role: 'chef' }); const n = W(g, 0, 1.98, 0.22); noren(n.x, n.y, n.z, g.rotation.y, ['居', '酒', '屋'], '#1f2a4a'); });
            mods('counter').forEach((m) => {
                const g = m._grp, len = m._len || 6, n = Math.floor(len / 1.05); let k = 0;
                for (let i = 1; i < n && k < 3; i++) { if (rnd() > 0.5) continue; k++; const drink = rnd() < 0.6; const p = W(g, -len / 2 + 0.6 + i * 1.05, 0, 0.45);
                    const ch = add({ seated: true, pose: 'sit', holdR: drink ? 'mug' : 'chopsticks', top: pick(['#3a4a6a', '#eeeeea', '#2a2a32', '#6a3a3a']), outfit: rnd() < 0.4 ? 'suit' : 'casual' }, p, yawOf(g, Math.PI), { pose: 'sit', seatY: 0.66, act: drink ? 'drink' : 'eat', role: 'bar' });
                    const q = W(g, -len / 2 + 0.6 + i * 1.05 + 0.18, 1.06, -0.12); propMesh((P) => drink ? PLATE(P, 0, 0, 'edamame') : BOWL(P, 0, 0), q.x, q.y, q.z, g.rotation.y); if (!drink) steamAt(q.x, q.y + 0.1, q.z, 3);
                    if (ch && drink) ch.happy = true; }
            });
            let tables = 0;
            mods('zashiki').forEach((m) => {
                const g = m._grp; if (rnd() < 0.3 || tables >= 3) return; tables++;
                const seats = [[-0.5, 0.65], [0.5, 0.65], [-0.5, -0.65], [0.5, -0.65]].filter(() => rnd() < 0.7); if (seats.length < 2) seats.push([0.5, -0.65], [-0.5, 0.65]);
                const center = W(g, 0, 1.0, 0);
                seats.slice(0, 4).forEach((q) => { const act = pick(['drink', 'talk', 'talk', 'laugh', 'eat']); add({ seated: true, pose: 'seiza', holdR: act === 'drink' ? 'mug' : (act === 'eat' ? 'chopsticks' : null) }, W(g, q[0], 0, q[1]), yawOf(g, q[1] > 0 ? Math.PI : 0), { pose: 'seiza', seatY: 0.38, act, role: 'party', focus: center }); });
                const t0 = W(g, 0, 0.43, 0); propMesh((P) => { PLATE(P, -0.15, 0.05, 'yakitori'); PLATE(P, 0.25, -0.1, 'edamame'); MUG(P, 0.45, 0.2); MUG(P, -0.45, -0.18); }, t0.x, t0.y, t0.z, g.rotation.y);
            });
            walker({ fem: true, outfit: 'samue', top: '#7a2a2a', apron: '#1e2433', hairStyle: 'bun', holdR: 'pad' }, { act: 'idle', role: 'waiter' });
            motes('#ffcf8a');
        } else if (type === 'konbini') {
            mods('register').forEach((m) => { const g = m._grp; add({ outfit: 'konbini', mouth: 'smile', hairStyle: rnd() < 0.5 ? 'ponytail' : 'short', fem: rnd() < 0.5 }, W(g, 0.15, 0, -0.34), yawOf(g, 0), { act: 'scan', role: 'clerk' }); });
            const racks = mods('rack').sort(() => rnd() - 0.5);
            racks.slice(0, 2).forEach((m) => { const g = m._grp; for (let tries = 0; tries < 8; tries++) { const s = rnd() < 0.5 ? -1 : 1, z = (rnd() - 0.5) * 2.8; const p = W(g, s * 0.82, 0, z); if (Math.abs(p.x) > ROOM.w / 2 - 0.5 || colliders.room.some((b) => !b.npc && p.x > b.x0 + 0.2 && p.x < b.x1 - 0.2 && p.z > b.z0 + 0.2 && p.z < b.z1 - 0.2)) continue; add({ holdL: rnd() < 0.6 ? 'basket' : null, bag: rnd() < 0.3 }, p, yawOf(g, s > 0 ? -Math.PI / 2 : Math.PI / 2), { act: 'browse', role: 'shopper' }); break; } });
            walker({ holdL: 'basket' }, { act: 'idle', role: 'shopper' });
            motes('#eaf2ff');
        } else if (type === 'class') {
            mods('board').forEach((m) => { const g = m._grp; const x = (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 0.6); add({ outfit: 'suit', jacket: '#4a4a5a', glasses: rnd() < 0.6, holdR: 'chalk', fem: rnd() < 0.4, hairStyle: rnd() < 0.3 ? 'bald' : undefined, old: rnd() < 0.3 }, W(g, x, 0, 0.75), yawOf(g, 0), { act: 'teach', role: 'teacher', boardYaw: yawOf(g, Math.PI) }); });
            if (!mods('board').length) mods('teacher').forEach((m) => { const g = m._grp; add({ outfit: 'suit', jacket: '#5a4a3a', glasses: true, holdR: 'book', old: rnd() < 0.5 }, W(g, 0.3, 0, -0.85), yawOf(g, 0), { act: 'read', role: 'teacher' }); });
            mods('piano').forEach((m) => { const g = m._grp; if (rnd() < 0.15) return; const fem = rnd() < 0.6; add({ fem, seated: true, outfit: fem ? 'sailor' : 'gakuran', hairStyle: fem ? pick(['long', 'bob', 'ponytail']) : pick(['short', 'spiky']) }, W(g, 0, 0, 0.65), yawOf(g, Math.PI), { pose: 'sit', seatY: 0.54, act: 'piano', role: 'pianist' }); });
            let slept = false, n = 0, sneaked = false; const sneakAt = 1 + Math.floor(rnd() * 4);
            mods('desks').forEach((m) => {
                const g = m._grp; (m.spots || []).forEach((sp) => {
                    if (n >= 9 || rnd() > 0.65) return; n++;
                    const fem = rnd() < 0.5; let act = pick(['write', 'write', 'write', 'read', 'idle']); if (!slept && rnd() < 0.15) { act = 'sleep'; slept = true; } if (!sneaked && n >= sneakAt) { act = 'sneak'; sneaked = true; }
                    add({ fem, seated: true, outfit: fem ? 'sailor' : 'gakuran', holdR: act === 'write' ? 'pen' : (act === 'sneak' ? 'phone' : null), hairStyle: fem ? pick(['long', 'bob', 'ponytail']) : pick(['short', 'spiky']) }, W(g, sp.x, 0, sp.z + 0.58), yawOf(g, Math.PI), { pose: 'sit', seatY: 0.47, act, role: act === 'sleep' ? 'sleeper' : (act === 'sneak' ? 'sneaker' : 'student') });
                    if (act === 'sneak') { const ch = S.room[S.room.length - 1]; animeOnPhone(ch); }
                });
            });
            motes('#fff2d8');
        } else if (ROOMX.types.indexOf(type) >= 0) {
            const cap = LOW ? 6 : 10;
            placed.forEach((m) => { const g = m._grp; if (!g) return;
                (m.stations || []).forEach((st) => { if (S.room.length >= cap || rnd() > (st.p == null ? 0.6 : st.p)) return; const o = { holdR: st.act === 'drum' ? 'bachi' : st.hold, holdL: st.act === 'drum' ? 'bachi' : null, apron: st.apron, hachimaki: st.hachimaki, short: st.short, top: st.top, outfit: st.outfit, fem: st.fem }; const p = W(g, st.x, 0, st.z); if (Math.abs(p.x) > ROOM.w / 2 - 0.35 || Math.abs(p.z) > ROOM.d / 2 - 0.35) return; add(o, p, yawOf(g, st.yaw), { act: st.act, role: st.role }); });
                (m.seats || []).forEach((se) => { if (S.room.length >= cap || rnd() > (se.p == null ? 0.6 : se.p)) return; const act = pick(se.acts); const o = { seated: true, holdR: se.hold && se.hold[act], fem: se.fem, old: se.old, outfit: se.outfit, hairStyle: se.old ? (se.fem ? 'bun' : 'bald') : null, hair: se.old ? '#c8c8d0' : null };
                    const fc = se.focus || m.focus; add(o, W(g, se.x, 0, se.z), yawOf(g, se.yaw), { pose: se.pose, seatY: se.y, act, role: se.role, focus: fc ? W(g, fc.x, fc.y, fc.z) : null });
                    if (se.bowl) { const q = W(g, se.bowl.x, se.bowl.y, se.bowl.z); propMesh((P) => BOWL(P, 0, 0, '#c8322a'), q.x, q.y, q.z, g.rotation.y); steamAt(q.x, q.y + 0.12, q.z, 3); } });
            });
            if (type === 'oneroom' || type === 'washitsu') { const catCol = pick(['#e8a050', '#8a8a92', '#2a2a2e', '#f2ece2']); const cat = makeCat(catCol, type === 'oneroom'); for (let i = 0; i < 30; i++) { const x = (rnd() - 0.5) * (ROOM.w - 1.6), z = (rnd() - 0.5) * (ROOM.d - 2.5); if (!free(x, z, 0.3)) continue; cat.root.position.set(x, 0, z); cat.root.rotation.y = rnd() * 6; room.add(cat.root); S.room.push(cat); blobs.push({ x, z, r: 0.15 }); break; } }
            if (type === 'arcade' || type === 'books' || type === 'cafe') walker({ fem: rnd() < 0.5, holdL: type === 'books' ? 'book' : null }, { act: 'idle', role: type === 'arcade' ? 'gamer' : (type === 'books' ? 'reader' : 'cafeGuest') });
            motes({ oneroom: '#fff2dc', washitsu: '#ffd8a0', loft: '#ffe2c0', ramen: '#ffd9a0', cafe: '#ffcf8a', books: '#fff4e0', arcade: '#c8b0ff' }[type]);
        } else {
            mods('kotatsu').forEach((m) => { const g = m._grp; const seats = [[0, 1.0, Math.PI], [0, -1.0, 0], [1.2, 0, -Math.PI / 2], [-1.2, 0, Math.PI / 2]].sort(() => rnd() - 0.5).slice(0, 1 + Math.floor(rnd() * 2)); const center = W(g, 0, 0.9, 0);
                seats.forEach((q) => { const act = pick(['watch', 'mikan', 'phone', 'talk']); add({ seated: true, hairStyle: undefined, holdR: act === 'mikan' ? 'mikan' : (act === 'phone' ? 'phone' : null), top: pick(['#c86a4a', '#6a8aa8', '#e8d8b8', '#8a6a9a']) }, W(g, q[0], 0, q[1]), yawOf(g, q[2]), { pose: 'kotatsu', seatY: 0.1, act, role: 'family', focus: center }); });
                const t0 = W(g, 0.2, 0.41, -0.05); propMesh((P) => { P.add(G.y(0.11, 0.08, 0.05, 16), '#5a3a22', 0, 0.025, 0); for (let i = 0; i < 5; i++) P.add(G.s(0.032, 10, 8), '#f08a1a', Math.cos(i * 1.26) * 0.05, 0.065 + (i === 4 ? 0.03 : 0), Math.sin(i * 1.26) * 0.05, 0, 0, 0, 1, 0.85, 1); }, t0.x, t0.y, t0.z);
            });
            mods('kitchen').forEach((m) => { const g = m._grp; if (rnd() < 0.25) return; add({ fem: rnd() < 0.7, apron: '#d86a6a', holdR: 'ladle' }, W(g, -0.05, 0, 0.45), yawOf(g, Math.PI), { act: 'cook', role: 'cook' }); const s = W(g, 0.1, 1.2, 0); steamAt(s.x, s.y, s.z, 4); });
            mods('desk').forEach((m) => { const g = m._grp; if (rnd() < 0.4) return; add({ seated: true, short: rnd() < 0.5, glasses: rnd() < 0.5 }, W(g, 0, 0, 0.66), yawOf(g, Math.PI), { pose: 'sit', seatY: 0.47, act: 'type', role: 'worker' }); });
            const fut = mods('futon')[0];
            const catCol = pick(['#e8a050', '#8a8a92', '#2a2a2e', '#f2ece2', '#c88a4a']);
            if (fut) { const g = fut._grp; const cat = makeCat(catCol, true); const p = W(g, 0.6, 0.28, 0.05); cat.root.position.copy(p); cat.root.rotation.y = g.rotation.y + rnd() * 6; room.add(cat.root); S.room.push(cat); }
            else { const cat = makeCat(catCol, false); for (let i = 0; i < 30; i++) { const x = (rnd() - 0.5) * (ROOM.w - 2), z = (rnd() - 0.5) * (ROOM.d - 3); if (!free(x, z, 0.3)) continue; cat.root.position.set(x, 0, z); cat.root.rotation.y = rnd() * 6; room.add(cat.root); S.room.push(cat); blobs.push({ x, z, r: 0.15 }); break; } }
            mods('tv').forEach((m) => { const g = m._grp; const p = W(g, 0, 1.0, 0.55); const l = new THREE.PointLight(0x9fc0ff, 0.8, 4.5, 1.6); l.position.copy(p); l.userData.keep = true; room.add(l); S.tv.push({ l, next: 0 }); });
            motes('#ffe2b8');
        }
        aoLayer(blobs);
    }

    // ---------- материалы комнаты: с бликами и отражениями вместо «пластилина» ----------
    function upgradeMaterials(group, type) {
        if (LOW) return; // на телефоне — простые материалы (дешевле на пиксель)
        const floorR = { izakaya: 0.48, konbini: 0.24, class: 0.42, home: 0.82 }[type] || 0.6;
        const hsl = {};
        group.traverse((o) => {
            if (!o.isMesh || !o.material || Array.isArray(o.material) || !o.material.isMeshLambertMaterial) return;
            const m = o.material;
            const s = new THREE.MeshStandardMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, depthWrite: m.depthWrite, fog: m.fog, envMapIntensity: 0.9 });
            m.color.getHSL(hsl, THREE.SRGBColorSpace);
            const isFloor = o.parent === room && o.geometry && o.geometry.type === 'PlaneGeometry' && Math.abs(o.rotation.x + Math.PI / 2) < 0.01 && o.position.y < 0.01;
            const isShell = o.parent === room && o.geometry && o.geometry.type === 'PlaneGeometry';
            if (isFloor) { s.roughness = floorR; s.envMapIntensity = 1.2; }
            else if (isShell) s.roughness = 0.88;
            else if (m.transparent && m.opacity < 0.9) { s.roughness = 0.06; s.envMapIntensity = 1.6; }
            else if (m.map) s.roughness = 0.75;
            else if (hsl.s < 0.1 && hsl.l > 0.42 && hsl.l < 0.86) { s.roughness = 0.3; s.metalness = 0.6; }
            else if (hsl.l > 0.86) s.roughness = 0.34;
            else if (hsl.l < 0.16) s.roughness = 0.45;
            else s.roughness = 0.66;
            o.material = s; m.dispose();
        });
    }
    function captureEnv() {
        if (LOW) return;
        scene.environment = null; if (S.envRT) { S.envRT.dispose(); S.envRT = null; }
        try {
            neonLights.forEach((l) => { l.visible = false; });
            const lbl = []; room.traverse((o) => { if (o.isSprite && o.visible) { lbl.push(o); o.visible = false; } });
            const pm = new THREE.PMREMGenerator(renderer);
            room.position.y = -1.5; room.updateMatrixWorld(true);
            S.envRT = pm.fromScene(scene, 0.04, 0.1, 40);
            room.position.y = 0; room.updateMatrixWorld(true); pm.dispose();
            lbl.forEach((o) => { o.visible = true; });
            scene.environment = S.envRT.texture;
        } catch (e) { room.position.y = 0; scene.environment = null; }
    }

    // ---------- телевизор: передачи сменяют друг друга, между ними — рябь ----------
    const PROGS = ['anime', 'news', 'weather', 'cook', 'baseball', 'music'];
    function screenTex() {
        const c = document.createElement('canvas'); c.width = 256; c.height = 144;
        const t = makeTex(c);
        S.screens.push({ mats: [], c, g: c.getContext('2d'), t, prog: PROGS[Math.floor(Math.random() * PROGS.length)], since: 0, next: 0, until: 6 + Math.random() * 6, col: '#5a8ad0' });
        return t;
    }
    const PROG_NAME = { anime: ['アニメ', 'Аниме'], news: ['ニュース', 'Новости'], weather: ['天気予報', 'Прогноз погоды'], cook: ['料理番組', 'Кулинарное шоу'], baseball: ['野球中継', 'Бейсбол'], music: ['音楽番組', 'Музыка'] };
    // экран телефона с аниме (тот же «канал» аниме, что и в телевизорах)
    function bindScreen(tex, mat) { const sc = S.screens.find((s) => s.t === tex); if (sc && mat && sc.mats.indexOf(mat) < 0) sc.mats.push(mat); }
    function animeOnPhone(ch) {
        if (!ch || !ch.held || !ch.held.R) return;
        const t = screenTex(); const sc = S.screens[S.screens.length - 1]; sc.prog = 'anime'; sc.until = 1e9;
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.125, 0.062), new THREE.MeshBasicMaterial({ map: t })); sc.mats.push(scr.material);
        scr.rotation.z = Math.PI / 2; scr.position.z = 0.0065;
        const hold = new THREE.Group(); hold.rotation.x = Math.PI / 2 + 0.5; hold.position.set(0, -0.04, 0.035); hold.add(scr); ch.held.R.add(hold);
    }
    function nextChannel(tex) { const sc = S.screens.find((s) => s.t === tex) || S.screens[0]; if (!sc) return null; sc.prog = PROGS[(PROGS.indexOf(sc.prog) + 1) % PROGS.length]; sc.since = S.t || 0.001; sc.until = 10 + Math.random() * 8; return PROG_NAME[sc.prog]; }
    const TICK = ['今日の天気は晴れ、のち雨', '東京で桜が満開に', '新しい駅が開業しました', 'ラーメンの日、全国で行列', '週末は花火大会'];
    const SUBS = [['行くぞ！', 'Вперёд!'], ['まさか…', 'Не может быть…'], ['ありがとう', 'Спасибо'], ['待って！', 'Подожди!'], ['約束だよ', 'Обещаешь?']];
    function drawScreen(sc, t) {
        const g = sc.g, W = 256, H = 144, k = t - sc.since;
        g.save();
        if (k < 0.35) { // рябь при переключении
            const id = g.createImageData(64, 36); for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
            g.putImageData(id, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(sc.c, 0, 0, 64, 36, 0, 0, W, H); sc.col = '#8a8a8a'; g.restore(); return;
        }
        const P = sc.prog;
        if (P === 'anime') {
            const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ff9a6a'); gr.addColorStop(0.6, '#ffd8a0'); gr.addColorStop(1, '#6a4a7a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
            g.fillStyle = '#3a2a4a'; for (let i = 0; i < 6; i++) g.fillRect(((i * 53 - k * 30) % 300 + 300) % 300 - 30, 70 - (i % 3) * 14, 34, 80);
            const bob = Math.sin(k * 3) * 3, x = 128 + Math.sin(k * 0.7) * 20;
            g.fillStyle = '#2a1a1a'; g.beginPath(); g.arc(x, 66 + bob, 30, Math.PI, 0); g.fill();
            g.fillStyle = '#f6dcc4'; g.beginPath(); g.ellipse(x, 78 + bob, 24, 27, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#2a1a1a'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i * 10 - 8, 56 + bob); g.lineTo(x + i * 10 + 8, 56 + bob); g.lineTo(x + i * 10, 70 + bob); g.fill(); }
            const blink = (k % 3.2) < 0.12; g.fillStyle = '#3a2a5a';
            [-1, 1].forEach((s2) => { if (blink) g.fillRect(x + s2 * 10 - 5, 80 + bob, 10, 2); else { g.beginPath(); g.ellipse(x + s2 * 10, 80 + bob, 4.5, 6.5, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.fillRect(x + s2 * 10 - 3, 76 + bob, 2.5, 2.5); g.fillStyle = '#3a2a5a'; } });
            g.strokeStyle = '#8a3a3a'; g.lineWidth = 2; g.beginPath(); const open = Math.sin(k * 14) > 0 && (k % 4) < 2.2; if (open) g.ellipse(x, 94 + bob, 4, 3, 0, 0, Math.PI * 2); else { g.moveTo(x - 5, 93 + bob); g.lineTo(x + 5, 93 + bob); } g.stroke();
            g.fillStyle = '#f0e0d0'; g.fillRect(x - 20, 104 + bob, 40, 40);
            const sub = SUBS[Math.floor(k / 4) % SUBS.length]; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 118, W, 26); g.fillStyle = '#fff'; g.font = '700 16px ' + JP; g.textAlign = 'center'; g.fillText(sub[0], W / 2, 136);
            sc.col = '#ffb080';
        } else if (P === 'news') {
            const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#16305a'); gr.addColorStop(1, '#3a6aa8'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
            g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 8; i++) g.fillRect(i * 34, 0, 2, 100);
            g.fillStyle = '#c8d4e8'; g.fillRect(150, 20, 90, 58); g.fillStyle = '#4a6a3a'; g.fillRect(150, 55, 90, 23); g.fillStyle = '#e8c860'; g.beginPath(); g.arc(215, 36, 8, 0, 7); g.fill();
            g.fillStyle = '#2a2a3a'; g.fillRect(52, 80, 70, 40); g.fillStyle = '#f0d0b8'; g.beginPath(); g.ellipse(87, 62 + Math.sin(k * 2) * 1, 15, 18, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1a1414'; g.beginPath(); g.arc(87, 55, 16, Math.PI, 0); g.fill();
            if (Math.sin(k * 12) > 0.2) { g.fillStyle = '#7a3a3a'; g.fillRect(83, 70, 8, 3); }
            g.fillStyle = '#c8322a'; g.fillRect(0, 108, 70, 18); g.fillStyle = '#fff'; g.font = '700 13px ' + JP; g.textAlign = 'left'; g.fillText('ニュース', 6, 122);
            g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(0, 126, W, 18); g.fillStyle = '#1a1a24'; g.font = '700 12px ' + JP;
            const txt = TICK.join('　◆　'); g.fillText(txt, W - ((k * 45) % (txt.length * 12 + W)), 139);
            g.fillStyle = '#fff'; g.font = '700 11px ' + UI; g.fillText(new Date().toTimeString().slice(0, 5), 214, 14);
            sc.col = '#5a8ad0';
        } else if (P === 'weather') {
            g.fillStyle = '#7ab8e8'; g.fillRect(0, 0, W, H);
            g.fillStyle = '#7ac070'; [[150, 30, 22, 14], [140, 52, 18, 24], [120, 80, 30, 16], [92, 96, 22, 12], [70, 110, 14, 10]].forEach((p) => { g.beginPath(); g.ellipse(p[0], p[1], p[2], p[3], -0.5, 0, 7); g.fill(); });
            [['晴', 150, 26, '#ffcc33'], ['雨', 118, 74, '#5a7ab8'], ['曇', 80, 104, '#d0d4dc']].forEach((q, i) => { const y = q[2] + Math.sin(k * 2 + i) * 2; g.fillStyle = q[3]; g.beginPath(); g.arc(q[1] + 30, y, 10, 0, 7); g.fill(); g.fillStyle = '#1a1a24'; g.font = '700 12px ' + JP; g.textAlign = 'center'; g.fillText(q[0], q[1] + 30, y + 4); g.font = '700 11px ' + UI; g.fillText((18 + i * 3) + '°', q[1] + 54, y + 4); });
            g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, W, 20); g.fillStyle = '#1a3a6a'; g.font = '700 13px ' + JP; g.textAlign = 'left'; g.fillText('明日の天気', 8, 15);
            sc.col = '#8ac0e8';
        } else if (P === 'cook') {
            g.fillStyle = '#f4e8d8'; g.fillRect(0, 0, W, H); g.fillStyle = '#c8a070'; g.fillRect(0, 96, W, 48);
            g.fillStyle = '#6a6a74'; g.fillRect(90, 70, 76, 34); g.fillStyle = '#e8b048'; g.fillRect(94, 66, 68, 8);
            for (let i = 0; i < 6; i++) { const ph = (k * 0.8 + i * 0.37) % 1; g.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - ph)) + ')'; g.beginPath(); g.arc(100 + i * 11 + Math.sin(k * 3 + i) * 3, 64 - ph * 50, 4 + ph * 6, 0, 7); g.fill(); }
            const hx = 200 + Math.cos(k * 4) * 10, hy = 60 + Math.sin(k * 4) * 6; g.strokeStyle = '#8a6a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(128, 70); g.lineTo(hx, hy); g.stroke();
            g.fillStyle = '#c8322a'; g.fillRect(0, 0, 110, 22); g.fillStyle = '#fff'; g.font = '700 13px ' + JP; g.textAlign = 'left'; g.fillText('今日の料理', 8, 16);
            sc.col = '#f0c890';
        } else if (P === 'baseball') {
            g.fillStyle = '#3a8a3a'; g.fillRect(0, 0, W, H); g.fillStyle = '#c89a6a'; g.beginPath(); g.moveTo(128, 40); g.lineTo(200, 100); g.lineTo(128, 140); g.lineTo(56, 100); g.closePath(); g.fill();
            g.fillStyle = '#fff'; [[128, 40], [200, 100], [56, 100], [128, 136]].forEach((p) => g.fillRect(p[0] - 3, p[1] - 3, 6, 6));
            const ph = (k % 2.4) / 2.4; const bx = 128 + Math.sin(ph * 3) * 60 * ph, by = 120 - ph * 90 + ph * ph * 60;
            g.fillStyle = '#ffffff'; g.beginPath(); g.arc(bx, by, 3, 0, 7); g.fill();
            g.fillStyle = '#1a1a24'; g.fillRect(0, 0, W, 18); g.fillStyle = '#fff'; g.font = '700 12px ' + UI; g.textAlign = 'left'; g.fillText('TOKYO 3 - 2 OSAKA   9回裏', 8, 13);
            sc.col = '#5ab05a';
        } else {
            const hue = (k * 40) % 360; g.fillStyle = 'hsl(' + hue + ',60%,25%)'; g.fillRect(0, 0, W, H);
            for (let i = 0; i < 16; i++) { const h = 20 + Math.abs(Math.sin(k * 5 + i * 0.9)) * 70; g.fillStyle = 'hsl(' + ((hue + i * 15) % 360) + ',80%,60%)'; g.fillRect(8 + i * 15, 130 - h, 11, h); }
            g.fillStyle = '#fff'; g.font = '700 16px ' + JP; g.textAlign = 'center'; g.fillText('♪ 今週のヒット曲', W / 2, 24);
            sc.col = 'hsl(' + hue + ',70%,60%)';
        }
        // кинескопная полоса и виньетка
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, (k * 40) % H, W, 6);
        g.restore();
    }

    function gameTex(i) {
        const kind = i === 7 ? 'taiko' : ['shmup', 'fight', 'puzzle'][i % 3];
        let gm = S.games.find((x) => x.kind === kind);
        if (!gm) { const c = document.createElement('canvas'); c.width = 192; c.height = 144; gm = { kind, c, g: c.getContext('2d'), t: makeTex(c), next: 0 }; gm.t.userData.shared = true; S.games.push(gm); }
        return gm.t;
    }
    function drawGame(gm, t) {
        const g = gm.g, W = 192, H = 144;
        if (gm.kind === 'shmup') { g.fillStyle = '#05051a'; g.fillRect(0, 0, W, H); for (let i = 0; i < 40; i++) { g.fillStyle = '#fff'; g.fillRect((i * 47) % W, ((i * 31) + t * (20 + i % 3 * 25)) % H, 1.5, 1.5); } const sx = 96 + Math.sin(t * 1.3) * 60; g.fillStyle = '#36e2ff'; g.beginPath(); g.moveTo(sx, 120); g.lineTo(sx - 9, 134); g.lineTo(sx + 9, 134); g.fill(); g.fillStyle = '#ffd23f'; for (let i = 0; i < 6; i++) g.fillRect(sx - 1, 118 - ((t * 160 + i * 22) % 120), 2, 6); for (let i = 0; i < 5; i++) { const ex = 20 + i * 38 + Math.sin(t * 2 + i) * 10, ey = 20 + Math.sin(t + i) * 8; g.fillStyle = ['#ff3fa4', '#7cff6a'][i % 2]; g.fillRect(ex - 7, ey - 5, 14, 10); } g.fillStyle = '#fff'; g.font = '700 10px ' + UI; g.fillText('SCORE ' + String(Math.floor(t * 130) % 100000).padStart(5, '0'), 6, 12); }
        else if (gm.kind === 'fight') { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ff8a3a'); gr.addColorStop(1, '#3a1a3a'); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.fillStyle = '#2a1a1a'; g.fillRect(0, 112, W, 32); const a = Math.sin(t * 3) * 14; [[60 + a, '#36e2ff'], [132 - a, '#ff3fa4']].forEach(([x, col], i) => { g.fillStyle = col; g.fillRect(x - 8, 70, 16, 30); g.beginPath(); g.arc(x, 62, 8, 0, 7); g.fill(); g.fillRect(x - 8 + (i ? -12 : 12) * Math.max(0, Math.sin(t * 6 + i * 3)), 76, 16, 6); g.fillRect(x - 7, 100, 5, 14); g.fillRect(x + 2, 100, 5, 14); }); g.fillStyle = '#ffd23f'; g.fillRect(8, 8, 70 - (t * 5) % 60, 7); g.fillRect(W - 78, 8, 70 - (t * 7) % 60, 7); g.fillStyle = '#fff'; g.font = '900 14px ' + UI; g.textAlign = 'center'; g.fillText(Math.max(0, 99 - Math.floor(t) % 99), W / 2, 18); g.textAlign = 'left'; }
        else if (gm.kind === 'puzzle') { g.fillStyle = '#1a1a3a'; g.fillRect(0, 0, W, H); const cols = ['#ff3fa4', '#36e2ff', '#ffd23f', '#7cff6a', '#b06bff']; for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) { const v = (x * 7 + y * 13 + Math.floor(t * 0.7)) % 9; if (y < 3 && v > 3) continue; g.fillStyle = cols[v % 5]; g.fillRect(48 + x * 16, 10 + y * 16, 14, 14); } const fx = 48 + (Math.floor(t * 1.5) % 6) * 16, fy = 10 + ((t * 30) % 48); g.fillStyle = '#fff'; g.fillRect(fx, fy, 14, 14); g.font = '700 10px ' + UI; g.fillText('NEXT', 150, 20); }
        else { g.fillStyle = '#ffe8a0'; g.fillRect(0, 0, W, H); g.fillStyle = '#3a2a2a'; g.fillRect(0, 54, W, 36); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(30, 72, 14, 0, 7); g.stroke(); for (let i = 0; i < 9; i++) { const x = W - ((t * 70 + i * 40) % (W + 40)) + 20; g.fillStyle = i % 3 ? '#e03a2a' : '#3a8ad0'; g.beginPath(); g.arc(x, 72, i % 4 === 0 ? 13 : 9, 0, 7); g.fill(); } g.fillStyle = '#c8322a'; g.font = '900 16px ' + JP; g.fillText('ドン!', 8, 30); g.fillStyle = '#3a2a2a'; g.font = '700 11px ' + UI; g.fillText('COMBO ' + (Math.floor(t * 3) % 120), 110, 122); }
    }

    // ---------- состояние и кадр ----------
    const S = { room: [], loose: [], bubbles: [], cloth: [], tv: [], screens: [], games: [], fx: [], motes: null, envRT: null, nextLine: 0, greetAt: 0, greeted: true, t: 0 };
    function clearRoom() { S.room = []; S.bubbles = []; S.cloth = []; S.tv = []; S.screens = []; S.games.forEach((gm) => gm.t.dispose()); S.games = []; S.fx = []; S.motes = null; S.occ = null; }
    function onEnter() { captureEnv(); S.greeted = false; S.greetAt = S.t + 0.7; S.nextLine = S.t + 4; }
    function onExit() { scene.environment = null; if (S.envRT) { S.envRT.dispose(); S.envRT = null; } S.bubbles.forEach((b) => { if (b.s.parent) b.s.parent.remove(b.s); b.s.material.dispose(); }); S.bubbles = []; }
    const _ray = new THREE.Raycaster();
    function occluders() {
        if (S.occ) return S.occ;
        const list = [];
        room.traverse((o) => {
            if (!o.isMesh || !o.visible || !o.material || Array.isArray(o.material)) return;
            const m = o.material; if (m.transparent && (m.opacity < 0.95 || !m.depthWrite)) return;
            let p = o; while (p && p !== room) { if (p.userData && p.userData.char) return; p = p.parent; }
            list.push(o);
        });
        return (S.occ = list);
    }
    function hidden(ch) {
        (ch.J.head || ch.root).getWorldPosition(_v2); _v2.y += 0.12 * (ch.sc || 1);
        const d = _v2.distanceTo(camera.position); if (d < 0.6) return false;
        _ray.set(camera.position, _v2.clone().sub(camera.position).normalize()); _ray.far = d - 0.2; _ray.near = 0.05;
        return _ray.intersectObjects(occluders(), false).length > 0;
    }
    function attached(o) { let p = o; while (p) { if (p === scene) return true; p = p.parent; } return false; }
    function update(t, dt) {
        S.t = t;
        if (inside.on) {
            S.room.forEach((ch) => {
                if (ch.cat) { poseCat(ch, t); return; }
                if (ch.route) { // ходьба по проходу
                    const R = ch.route;
                    if (R.wait > 0) { R.wait -= dt; ch.walking = false; }
                    else { const tg = R.leg ? R.a : R.b, p = ch.root.position, dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz);
                        if (d < 0.05) { R.leg = !R.leg; R.wait = 1.5 + Math.random() * 2.5; ch.walking = false; }
                        else { const st = Math.min(d, 0.8 * dt); p.x += dx / d * st; p.z += dz / d * st; ch.baseYaw = Math.atan2(dx, dz); ch.wph = (ch.wph || 0) + st * 6.2; ch.walking = true; } }
                }
                let ty = ch.baseYaw;
                if (t < ch.faceUntil && ch.pose === 'stand') ty = Math.atan2(camera.position.x - ch.root.position.x, camera.position.z - ch.root.position.z);
                if (ch.yawOverride != null) ty = ch.yawOverride;
                ch.yaw = angTo(ch.yaw, ty, dt * (ch.walking ? 5 : 2.6)); ch.root.rotation.y = ch.yaw;
                pose(ch, t, dt);
            });
            // приветствие при входе: персонал оборачивается, кланяется, здоровается
            if (!S.greeted && t > S.greetAt) {
                S.greeted = true; let k = 0;
                S.room.forEach((ch) => { if (!ch.greet || ch.root.position.distanceTo(camera.position) > 12) return; ch._greetAt = t + k * 0.9; k++; });
            }
            S.room.forEach((ch) => { if (ch._greetAt && t > ch._greetAt) { ch._greetAt = 0; ch.faceUntil = t + 3.2; say(ch, ch.greet, 2.6, t); } });
            // реплики по очереди: не чаще одного пузыря, говорит тот, кто рядом и в поле зрения
            if (t > S.nextLine) {
                S.nextLine = t + 3 + Math.random() * 4;
                if (!S.bubbles.length) {
                    camera.getWorldDirection(_v);
                    const cands = S.room.filter((ch) => { if (!ch.lines || t < ch.talkUntil + 5) return false; _v2.copy(ch.root.position).sub(camera.position); const d = _v2.length(); if (d > 8.5 || d < 0.3) return false; if (_v2.normalize().dot(_v) <= 0.45) return false; return !hidden(ch); });
                    if (cands.length) { const ch = cands[Math.floor(Math.random() * cands.length)]; const ln = ch.lines[Math.floor(Math.random() * ch.lines.length)]; if (ch.looking || ch.cat) ch.faceUntil = 0; say(ch, ln, ch.cat ? 1.8 : 2.8, t); }
                }
            }
        }
        {
            for (let i = S.bubbles.length - 1; i >= 0; i--) {
                const b = S.bubbles[i];
                if (b.street === inside.on) { b.s.visible = false; if (t > b.t1) { if (b.s.parent) b.s.parent.remove(b.s); b.s.material.dispose(); S.bubbles.splice(i, 1); } continue; }
                if (t > b.t1 || !attached(b.ch.root)) { if (b.s.parent) b.s.parent.remove(b.s); b.s.material.dispose(); S.bubbles.splice(i, 1); continue; }
                (b.ch.J.head || b.ch.root).getWorldPosition(_v); b.s.position.set(_v.x, _v.y + (b.ch.cat ? 0.2 : 0.3) * (b.ch.sc || 1), _v.z);
                if (t > (b.chk || 0)) { b.chk = t + 0.15; b.vis = b.street || !hidden(b.ch); }
                b.a = (b.a || 0) + ((b.vis ? 1 : 0) - (b.a || 0)) * Math.min(1, dt * 12);
                b.s.material.opacity = Math.max(0, Math.min(1, (t - b.t0) / 0.18, (b.t1 - t) / 0.3)) * b.a;
                b.s.visible = b.s.material.opacity > 0.01;
            }
        }
        if (inside.on) {
            S.cloth.forEach((c) => { const a = c.m.geometry.attributes.position, p = a.array, b = c.base; for (let i = 0; i < p.length; i += 3) { const k = clamp((0.22 - b[i + 1]) / 0.44, 0, 1); p[i + 2] = b[i + 2] + k * k * 0.05 * Math.sin(t * 1.5 + c.ph + b[i] * 4); p[i] = b[i] + k * k * 0.012 * Math.sin(t * 1.1 + c.ph); } a.needsUpdate = true; });
            let anyVid = false;
            S.screens.forEach((sc) => { if (!sc.since) { sc.since = t; } if (t - sc.since > sc.until) { sc.since = t; sc.until = 7 + Math.random() * 7; sc.prog = PROGS[(PROGS.indexOf(sc.prog) + 1 + Math.floor(Math.random() * (PROGS.length - 1))) % PROGS.length]; }
                const vt = sc.prog === 'anime' && sc.mats.length && t - sc.since > 0.35 && typeof ANITV !== 'undefined' ? ANITV.ensure() : null;
                if (vt) anyVid = true;
                const want = vt || sc.t; sc.mats.forEach((m) => { if (m.map !== want) { m.map = want; m.needsUpdate = true; } });
                if (vt) sc.col = '#ffb080'; else if (t > sc.next) { sc.next = t + 0.08; drawScreen(sc, t); sc.t.needsUpdate = true; } });
            if (typeof ANITV !== 'undefined') { if (anyVid) ANITV.resume(); else ANITV.pause(); }
            S.games.forEach((gm) => { if (t > gm.next) { gm.next = t + 0.1; drawGame(gm, t); gm.t.needsUpdate = true; } });
            S.fx.forEach((f) => f(t, dt));
            const scol = S.screens.length ? S.screens[0].col : '#9fc0ff';
            S.tv.forEach((v) => { if (t > v.next) { v.next = t + 0.1 + Math.random() * 0.25; v.l.intensity = 0.7 + Math.random() * 0.7; v.l.color.set(scol); } });
            if (S.motes) { const a = S.motes.geometry.attributes.position, p = a.array, b = S.motes.userData.base; for (let i = 0; i < p.length; i += 3) { p[i] = b[i] + Math.sin(t * 0.13 + i) * 0.25; p[i + 1] = b[i + 1] + Math.sin(t * 0.09 + i * 0.7) * 0.2; p[i + 2] = b[i + 2] + Math.cos(t * 0.11 + i * 1.3) * 0.25; } a.needsUpdate = true; }
        }
        {
            // люди-слова (на улице и в комнатах): дышат, моргают, следят взглядом, машут, когда подходишь
            for (let i = S.loose.length - 1; i >= 0; i--) {
                const ch = S.loose[i];
                if (!attached(ch.root)) { if (ch._seen || t - (ch._born || (ch._born = t)) > 3) S.loose.splice(i, 1); continue; }
                ch._seen = true;
                ch.root.getWorldPosition(_v); const d = _v.distanceTo(camera.position);
                ch.root.visible = d < 28;
                if (d > (LOW ? 9 : 16)) continue;
                if (d < 3.2 && !ch.waved && !ch.gest) { ch.waved = true; ch.gest = { kind: ch.o.armPose === 'up' ? 'nod' : 'wave', t0: t, t1: t + 2.2 }; }
                if (d > 6) ch.waved = false;
                pose(ch, t, dt);
            }
        }
    }
    // человек-слово (улица и комнаты): строится вместо старой фигурки из капсул
    function personProp(text, p, tint) {
        const r = mulberry32(hashStr(text));
        const o = look(r, {});
        const out = p.outfit || 'casual';
        const map = { dress: 'dress', kimono: 'kimono', suit: 'suit', police: 'police', uniform: 'uniform', coat: 'coat', chef: 'chef', casual: 'casual' };
        Object.assign(o, { outfit: map[out] || 'casual', tint, fem: !!(p.long || out === 'dress' || (out === 'kimono' && !p.sword)) });
        if (p.col) o.top = p.col; if (p.jacket) o.jacket = p.jacket; if (p.tie) o.tie = p.tie; if (p.pants) o.pants = p.pants;
        if (p.hair) { o.hair = p.hair; if (/^#[c-f]/i.test(p.hair)) { o.old = true; o.hairStyle = o.fem ? 'bun' : 'bald'; } }
        if (p.long) o.hairStyle = 'long';
        if (o.fem && o.hairStyle === 'short') o.hairStyle = 'bob';
        if (!o.fem && /long|bob|ponytail|bun/.test(o.hairStyle) && !o.old) o.hairStyle = 'short';
        o.cap = p.cap; o.hat = p.hat; o.glasses = p.glasses; o.bag = p.bag; o.small = p.small;
        if (p.phone) o.holdR = 'phone'; if (p.book) o.holdL = 'book'; if (p.stick) o.holdR = 'stick'; if (p.sword) o.holdR = 'sword';
        if (p.arm === 'up') o.armPose = 'up';
        const ch = makeChar(o); ch.wordText = text;
        if (p.phone) ch.act = 'phone';
        if (p.arm === 'wave') ch.act = 'idle';
        S.loose.push(ch);
        return ch.root;
    }
    return { LINES, screenTex, bindScreen, nextChannel, gameTex, makeChar, makeCat, populate, update, clearRoom, onEnter, onExit, upgradeMaterials, personProp, say, S };
})();
