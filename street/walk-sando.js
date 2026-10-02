// ===== «Сандо» — тихая улочка к храму: каменные фонари тōрō, каменная дорожка, тории, бамбук, храм в конце, падающие листья клёна =====
// Встраивается build-walk.mjs. TEMPLE.build(world) зовётся из buildWorld при th.temple, TEMPLE.update(t, dt) — из кадра.
const TEMPLE = (() => {
    let leaves = null;
    const stone = (k) => ['#8a8a82', '#7a7a72', '#94948a'][k % 3];
    function toro(world, x, z, k) { // каменный фонарь: основание, столб, светильник с окошком, крыша, навершие
        const g = new THREE.Group(); g.position.set(x, 0, z);
        const B = (sx, sy, sz, col, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), lamb(col)); m.position.y = y; g.add(m); };
        B(0.62, 0.16, 0.62, stone(k), 0.08); B(0.42, 0.12, 0.42, stone(k + 1), 0.22);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.85, 8), lamb(stone(k))); post.position.y = 0.7; g.add(post);
        B(0.5, 0.09, 0.5, stone(k + 2), 1.17);
        const fire = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.34), lamb(stone(k + 1))); fire.position.y = 1.38; g.add(fire);
        [[0, 0.172, 0], [0, -0.172, Math.PI], [0.172, 0, Math.PI / 2], [-0.172, 0, -Math.PI / 2]].forEach(([dx, dz, r]) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc870'), fog: true })); w.position.set(dx, 1.38, dz); w.rotation.y = r; g.add(w); });
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.26, 4), lamb(stone(k + 2))); roof.position.y = 1.67; roof.rotation.y = Math.PI / 4; g.add(roof);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lamb(stone(k))); top.position.y = 1.84; g.add(top);
        world.add(g); addCollider(g, null, 0.12);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: discTex, color: new THREE.Color('#ffb860'), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.02, z); world.add(glow);
    }
    function bamboo(world, x, z, rnd) {
        for (let i = 0; i < 5; i++) {
            const h = 3.2 + rnd() * 1.8, bx = x + (rnd() - 0.5) * 0.5, bz = z + (rnd() - 0.5) * 0.5;
            const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, h, 6), lamb(['#4a7a3a', '#5a8a42', '#3e6a32'][i % 3])); st.position.set(bx, h / 2, bz); st.rotation.z = (rnd() - 0.5) * 0.08; world.add(st);
            for (let k = 0; k < 3; k++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), lamb('#3f6e34')); lf.scale.set(1.2, 0.35, 0.7); lf.position.set(bx + (rnd() - 0.5) * 0.4, h * (0.6 + k * 0.14), bz + (rnd() - 0.5) * 0.4); lf.rotation.y = rnd() * 3; world.add(lf); }
        }
    }
    function torii(world, z, scale) {
        const red = '#c8322a', blk = '#1a1210', hw = (W2 - 0.2) * scale;
        [-1, 1].forEach((k) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 4.4, 12), lamb(red)); p.position.set(k * hw, 2.2, z); world.add(p); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 12), lamb(blk)); b.position.set(k * hw, 0.14, z); world.add(b); });
        const kas = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.2, 0.26, 0.42), lamb(blk)); kas.position.set(0, 4.5, z); world.add(kas);
        const shi = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.9, 0.24, 0.36), lamb(red)); shi.position.set(0, 4.25, z); world.add(shi);
        const nuk = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.5, 0.18, 0.26), lamb(red)); nuk.position.set(0, 3.55, z); world.add(nuk);
        // симэнава с бумажными сидэ
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, hw * 2 - 0.3, 8), lamb('#d8c890')); rope.rotation.z = Math.PI / 2; rope.position.set(0, 3.25, z); world.add(rope);
        for (let i = 0; i < 4; i++) { const sd = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color('#f4f0e4'), side: THREE.DoubleSide, fog: true })); sd.position.set(-hw + 0.5 + i * (hw * 2 - 1) / 3, 3.0, z); world.add(sd); }
    }
    function shrine(world, z) { // храм в конце улицы: ступени, сруб, двускатная крыша, ящик для пожертвований, колокол с верёвкой
        const g = new THREE.Group(); g.position.set(0, 0, z);
        const B = (sx, sy, sz, col, x, y, zz, basic) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), basic ? new THREE.MeshBasicMaterial({ color: new THREE.Color(col), fog: true }) : lamb(col)); m.position.set(x, y, zz); g.add(m); return m; };
        for (let i = 0; i < 3; i++) B(5.4 - i * 0.4, 0.18, 1.2 - i * 0.2 + 3.4, stone(i), 0, 0.09 + i * 0.18, -i * 0.15);
        B(4.4, 2.6, 3.2, '#5a3218', 0, 1.84, -0.6);
        for (let i = 0; i < 5; i++) B(0.16, 2.6, 0.16, '#3a2010', -2 + i, 1.84, 1.02);
        B(3.6, 1.6, 0.04, '#ffcf8a', 0, 1.6, 1.0, true); // тёплый свет внутри
        const roofL = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.16, 3.0), lamb('#2a2a30')); roofL.position.set(0, 3.7, 0.25); roofL.rotation.x = -0.42; g.add(roofL);
        const roofR = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.16, 3.0), lamb('#2a2a30')); roofR.position.set(0, 3.7, -1.45); roofR.rotation.x = 0.42; g.add(roofR);
        B(6.6, 0.18, 0.18, '#2a2a30', 0, 4.28, -0.6);
        B(1.2, 0.5, 0.6, '#4a2c16', 0, 0.75, 1.75); for (let i = 0; i < 6; i++) B(1.1, 0.02, 0.04, '#2a1a10', 0, 1.0, 1.5 + i * 0.09);
        const bell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), lamb('#c8a040')); bell.position.set(0, 2.85, 1.25); g.add(bell);
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), lamb('#d8243a')); rope.position.set(0, 2.0, 1.28); g.add(rope);
        const pl = new THREE.PointLight(0xffb060, 3, 9, 1.6); pl.position.set(0, 2.2, 2.2); g.add(pl);
        world.add(g); addCollider(g, null, 0.2);
    }
    function build(world) {
        const rnd = mulberry32(hashStr(th.id + 'sando'));
        torii(world, 4.4, 1);
        // каменная дорожка посередине
        for (let z = 3; z > -streetLen - 2; z -= 0.92) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.5 + rnd() * 0.15, 0.06, 0.82), lamb(stone(Math.floor(rnd() * 3)))); s.position.set((rnd() - 0.5) * 0.08, 0.03, z); s.rotation.y = (rnd() - 0.5) * 0.04; world.add(s); }
        const bounds = blocks.map((b) => b.z0);
        [-1, 1].forEach((side) => {
            const dz = doors.filter((d) => d.userData.door.side === side).map((d) => d.userData.door.z);
            let k = 0;
            for (let z = 1; z > -streetLen + 4; z -= 4.2) {
                if (dz.some((d) => Math.abs(d - z) < 1.4) || bounds.some((b) => Math.abs(b - z) < 1.6)) continue;
                if (k++ % 3 === 2) bamboo(world, side * (W2 - 0.55), z, rnd); else toro(world, side * (W2 - 0.55), z, k);
            }
        });
        for (let i = 1; i < blocks.length; i += 3) torii(world, blocks[i].z0 + 0.6, 0.92); // по малому тории на каждые три квартала
        shrine(world, -streetLen + 1.5);
        // листья клёна — медленно падают вокруг камеры
        const n = LOW ? 70 : 160, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
        for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * th.W; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = (Math.random() - 0.5) * 30; c.set(['#e85a2a', '#f08a2a', '#c8322a', '#e8b030'][i % 4]); col.set([c.r, c.g, c.b], i * 3); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        if (leaves) { scene.remove(leaves); leaves.geometry.dispose(); }
        leaves = new THREE.Points(geo, new THREE.PointsMaterial({ map: discTex, vertexColors: true, size: 0.09, transparent: true, depthWrite: false, opacity: 0.9 }));
        leaves.frustumCulled = false; scene.add(leaves);
    }
    function update(t, dt) {
        if (!leaves) return; leaves.visible = !inside.on; if (inside.on) return;
        const p = leaves.geometry.attributes.position.array;
        for (let i = 0; i < p.length; i += 3) { p[i + 1] -= dt * (0.35 + (i % 7) * 0.04); p[i] += Math.sin(t * 0.9 + i) * dt * 0.25; if (p[i + 1] < 0.02) { p[i + 1] = 6 + Math.random() * 2; p[i] = (Math.random() - 0.5) * th.W; p[i + 2] = (Math.random() - 0.5) * 30; } }
        leaves.geometry.attributes.position.needsUpdate = true; leaves.position.set(0, 0, camera.position.z - 6);
    }
    return { build, update };
})();
