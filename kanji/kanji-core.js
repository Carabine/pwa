// Прописи — геометрия и доска письма.
//
// Эталон штриха приходит с бэкенда как SVG path (KanjiVG, поле 109×109).
// Проверка — не «распознавание иероглифа», а сравнение ОДНОГО штриха с
// ожидаемым: оба ресэмплируем в равное число точек по длине дуги и смотрим
// начало, конец, среднее расстояние между точками и отношение длин. Этого
// хватает, чтобы ловить главное, чему учат прописи: порядок штрихов,
// направление и форму, — и при этом прощать дрожь пальца.
//
// Наружу: window.KanjiCore = { samplePath, resample, recognize, Board, TOL }
(function () {
    const FIELD = 109;          // система координат KanjiVG
    const SAMPLES = 24;         // точек на штрих после ресэмплинга
    const MIN_STEP = 0.6;       // ближе этого точки пальца не копим (шум)

    // Допуски в единицах поля (109 = вся клетка). normal подобран так, что
    // аккуратно написанный пальцем на телефоне штрих проходит, а штрих
    // «не туда» — нет.
    const TOL = { strict: 9, normal: 13, loose: 18 };

    const measure = document.getElementById('kj-measure');
    const sampleCache = new Map();

    function dist(a, b) {
        const dx = a[0] - b[0], dy = a[1] - b[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    function polyLength(pts) {
        let l = 0;
        for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
        return l;
    }

    // Точки эталонного штриха через getPointAtLength скрытого <path>.
    // Результат кэшируем по строке пути — один и тот же знак в сессии
    // измеряется многократно (подсказки, проверка, порядок).
    function samplePath(d, n = SAMPLES) {
        const key = d + '|' + n;
        if (sampleCache.has(key)) return sampleCache.get(key);
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        measure.appendChild(p);
        const len = p.getTotalLength();
        const pts = [];
        for (let i = 0; i < n; i++) {
            const pt = p.getPointAtLength(len * i / (n - 1));
            pts.push([pt.x, pt.y]);
        }
        measure.removeChild(p);
        const rec = { pts, len };
        sampleCache.set(key, rec);
        return rec;
    }

    // Ресэмплинг ломаной пользователя в n точек, равномерно по длине дуги.
    function resample(points, n = SAMPLES) {
        if (!points.length) return [];
        if (points.length === 1) return Array.from({ length: n }, () => points[0].slice());
        const total = polyLength(points);
        if (total === 0) return Array.from({ length: n }, () => points[0].slice());
        const step = total / (n - 1);
        const out = [points[0].slice()];
        let acc = 0;
        let i = 1;
        let prev = points[0];
        while (out.length < n - 1 && i < points.length) {
            const cur = points[i];
            const seg = dist(prev, cur);
            if (acc + seg >= step) {
                const t = (step - acc) / seg;
                const np = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
                out.push(np);
                prev = np;
                acc = 0;
            } else {
                acc += seg;
                prev = cur;
                i++;
            }
        }
        while (out.length < n) out.push(points[points.length - 1].slice());
        return out;
    }

    // Сравнение одного штриха с эталоном. Возвращает «цену» — чем меньше, тем
    // ближе; ok — укладывается ли в допуск.
    function compare(user, exp, tol) {
        const u = user.pts, e = exp.pts;
        const n = Math.min(u.length, e.length);
        let avg = 0;
        for (let i = 0; i < n; i++) avg += dist(u[i], e[i]);
        avg /= n;
        const dStart = dist(u[0], e[0]);
        const dEnd = dist(u[n - 1], e[n - 1]);
        const short = exp.len < 12;     // точки и крючки: форма почти не читается
        const ratio = user.len / Math.max(exp.len, 1);
        const okLen = short ? (user.len < 30) : (ratio > 0.45 && ratio < 2.2);
        const ok = okLen
            && dStart < tol * 1.6
            && dEnd < tol * 1.6
            && avg < (short ? tol * 1.5 : tol);
        return { ok, cost: avg + (dStart + dEnd) / 2 };
    }

    // Главная проверка: подходит ли штрих пользователя под штрих idx.
    // Если нет — пытаемся объяснить: это другой (ещё не написанный) штрих
    // («порядок»), тот же штрих задом наперёд («направление») или просто
    // непохоже («форма»).
    function recognize(rawPoints, strokes, idx, tol = TOL.normal) {
        const pts = resample(rawPoints);
        const user = { pts, len: polyLength(rawPoints) };
        const exp = samplePath(strokes[idx]);
        const r = compare(user, exp, tol);
        if (r.ok) return { ok: true };

        const reversed = { pts: pts.slice().reverse(), len: user.len };
        if (compare(reversed, exp, tol).ok) return { ok: false, reason: 'reversed' };

        let best = null;
        for (let j = idx + 1; j < strokes.length; j++) {
            const rj = compare(user, samplePath(strokes[j]), tol);
            if (rj.ok && (!best || rj.cost < best.cost)) best = { j, cost: rj.cost };
        }
        if (best) return { ok: false, reason: 'order', which: best.j };
        return { ok: false, reason: 'shape' };
    }

    // ---------------------------------------------------------------------
    // Доска: SVG-клетка, слои (сетка, призрак, подсказка, тушь, живой штрих),
    // ввод пальцем/мышью, анимация порядка штрихов.
    // ---------------------------------------------------------------------
    const NS = 'http://www.w3.org/2000/svg';
    function el(name, attrs = {}) {
        const n = document.createElementNS(NS, name);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        return n;
    }

    function toPathD(points) {
        if (!points.length) return '';
        let d = 'M' + points[0][0].toFixed(1) + ',' + points[0][1].toFixed(1);
        for (let i = 1; i < points.length; i++) d += 'L' + points[i][0].toFixed(1) + ',' + points[i][1].toFixed(1);
        if (points.length === 1) d += 'l0.1,0';   // точка-тап всё же должна быть видна
        return d;
    }

    class Board {
        // host — контейнер; onStroke(points) — законченный штрих пользователя
        constructor(host, { onStroke } = {}) {
            this.host = host;
            this.onStroke = onStroke || (() => {});
            this.strokes = [];
            this.numbers = [];
            this.written = 0;
            this.enabled = false;
            this._anim = null;
            this._raf = 0;

            const svg = el('svg', { viewBox: '0 0 ' + FIELD + ' ' + FIELD, class: 'kj-board__svg' });
            this.svg = svg;
            // Сетка «米»: центр и диагонали — как в японских прописях, чтобы
            // чувствовать пропорции, а не рисовать в пустоте.
            const grid = el('g', { class: 'kj-grid' });
            const c = FIELD / 2;
            grid.appendChild(el('line', { x1: c, y1: 0, x2: c, y2: FIELD }));
            grid.appendChild(el('line', { x1: 0, y1: c, x2: FIELD, y2: c }));
            grid.appendChild(el('line', { x1: 0, y1: 0, x2: FIELD, y2: FIELD, class: 'kj-grid__diag' }));
            grid.appendChild(el('line', { x1: FIELD, y1: 0, x2: 0, y2: FIELD, class: 'kj-grid__diag' }));
            svg.appendChild(grid);

            this.gGhost = el('g', { class: 'kj-ghost' });
            this.gAnim = el('g', { class: 'kj-anim' });
            this.gInk = el('g', { class: 'kj-ink' });
            this.gHint = el('g', { class: 'kj-hint' });
            this.gNums = el('g', { class: 'kj-nums' });
            this.live = el('path', { class: 'kj-live', d: '' });
            for (const g of [this.gGhost, this.gAnim, this.gInk, this.gHint, this.gNums, this.live]) svg.appendChild(g);
            host.appendChild(svg);

            this._bindPointer();
        }

        // Новый знак: сбрасываем всё.
        setGlyph(rec) {
            this.stopAnimation();
            this.strokes = rec ? rec.s.slice() : [];
            this.numbers = rec && rec.n ? rec.n : [];
            this.written = 0;
            for (const g of [this.gGhost, this.gAnim, this.gInk, this.gHint, this.gNums]) g.textContent = '';
            this.live.setAttribute('d', '');
            this.svg.classList.remove('is-done');
        }

        // Призрак всего знака (режим обводки).
        showGhost(on) {
            this.gGhost.textContent = '';
            if (!on) return;
            this.strokes.forEach((d) => this.gGhost.appendChild(el('path', { d })));
        }

        showNumbers(on) {
            this.gNums.textContent = '';
            if (!on) return;
            this.numbers.forEach(([x, y], i) => {
                const t = el('text', { x, y });
                t.textContent = String(i + 1);
                this.gNums.appendChild(t);
            });
        }

        // Подсказка: штрих i с точкой начала (направление).
        hint(i) {
            this.gHint.textContent = '';
            if (i == null || i >= this.strokes.length) return;
            const d = this.strokes[i];
            const { pts } = samplePath(d);
            this.gHint.appendChild(el('path', { d }));
            this.gHint.appendChild(el('circle', { cx: pts[0][0], cy: pts[0][1], r: 3.2, class: 'kj-hint__start' }));
        }

        clearHint() { this.gHint.textContent = ''; }

        // Принятый штрих рисуем ЭТАЛОНОМ («прилипание»): результат выглядит
        // ровно, а ученик видит, как штрих должен лежать. Короткая анимация
        // прорисовки — чтобы прилипание читалось как движение, а не подмена.
        commit(i) {
            const d = this.strokes[i];
            const p = el('path', { d });
            this.gInk.appendChild(p);
            const len = Math.max(samplePath(d).len, 1);
            p.style.strokeDasharray = String(len);
            p.style.strokeDashoffset = String(len);
            p.getBoundingClientRect();         // форсируем стиль до перехода
            p.style.transition = 'stroke-dashoffset 160ms ease-out';
            p.style.strokeDashoffset = '0';
            this.written = i + 1;
            if (this.written >= this.strokes.length) this.svg.classList.add('is-done');
        }

        // Откат последнего принятого штриха.
        uncommit() {
            const last = this.gInk.lastElementChild;
            if (last) this.gInk.removeChild(last);
            this.written = Math.max(0, this.written - 1);
            this.svg.classList.remove('is-done');
        }

        // Неверный штрих: мигнуть красным и растаять.
        flashWrong(points) {
            const d = toPathD(points);
            const p = el('path', { d, class: 'kj-wrong' });
            this.gHint.appendChild(p);
            setTimeout(() => p.remove(), 450);
            this.svg.classList.remove('is-shake');
            this.svg.getBoundingClientRect();
            this.svg.classList.add('is-shake');
        }

        // Анимация порядка штрихов. Возвращает Promise, завершающийся, когда
        // всё дорисовано (или анимацию прервали).
        animate({ withNumbers = true, speed = 1 } = {}) {
            this.stopAnimation();
            this.gAnim.textContent = '';
            this.gNums.textContent = '';
            const paths = this.strokes.map((d) => {
                const p = el('path', { d });
                const len = Math.max(samplePath(d).len, 1);
                p.style.strokeDasharray = String(len);
                p.style.strokeDashoffset = String(len);
                this.gAnim.appendChild(p);
                return { p, len };
            });
            let delay = 120;
            const anims = [];
            paths.forEach(({ p, len }, i) => {
                const dur = (160 + len * 9) / speed;
                const a = p.animate(
                    [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
                    { duration: dur, delay, easing: 'cubic-bezier(0.3, 0, 0.6, 1)', fill: 'forwards' },
                );
                anims.push(a);
                if (withNumbers && this.numbers[i]) {
                    const [x, y] = this.numbers[i];
                    const t = el('text', { x, y, class: 'is-pending' });
                    t.textContent = String(i + 1);
                    this.gNums.appendChild(t);
                    setTimeout(() => t.classList.remove('is-pending'), delay);
                }
                delay += dur + 140 / speed;
            });
            this._anim = anims;
            return new Promise((resolve) => {
                const last = anims[anims.length - 1];
                if (!last) { resolve(); return; }
                last.onfinish = () => resolve();
                last.oncancel = () => resolve();
            });
        }

        stopAnimation() {
            if (this._anim) this._anim.forEach((a) => { try { a.cancel(); } catch (e) { /* уже закончилась */ } });
            this._anim = null;
            this.gAnim.textContent = '';
        }

        // Показать знак целиком статично (итог/обзор).
        showFull() {
            this.stopAnimation();
            this.gInk.textContent = '';
            this.strokes.forEach((d) => this.gInk.appendChild(el('path', { d })));
            this.written = this.strokes.length;
        }

        setEnabled(on) {
            this.enabled = !!on;
            this.svg.classList.toggle('is-writable', this.enabled);
        }

        // --- ввод ---------------------------------------------------------
        _toLocal(e) {
            const r = this.svg.getBoundingClientRect();
            return [(e.clientX - r.left) / r.width * FIELD, (e.clientY - r.top) / r.height * FIELD];
        }

        _bindPointer() {
            const svg = this.svg;
            let pts = null;
            let pid = null;
            const draw = () => {
                this._raf = 0;
                if (pts) this.live.setAttribute('d', toPathD(pts));
            };
            svg.addEventListener('pointerdown', (e) => {
                if (!this.enabled || pts) return;
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                pid = e.pointerId;
                try { svg.setPointerCapture(pid); } catch (err) { /* старый WebKit */ }
                pts = [this._toLocal(e)];
                this.live.setAttribute('d', '');
                e.preventDefault();
            });
            svg.addEventListener('pointermove', (e) => {
                if (!pts || e.pointerId !== pid) return;
                const p = this._toLocal(e);
                if (dist(p, pts[pts.length - 1]) >= MIN_STEP) {
                    pts.push(p);
                    if (!this._raf) this._raf = requestAnimationFrame(draw);
                }
                e.preventDefault();
            });
            const finish = (e) => {
                if (!pts || e.pointerId !== pid) return;
                const done = pts;
                pts = null;
                pid = null;
                if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
                this.live.setAttribute('d', '');
                this.onStroke(done);
            };
            svg.addEventListener('pointerup', finish);
            svg.addEventListener('pointercancel', finish);
        }
    }

    window.KanjiCore = { FIELD, TOL, samplePath, resample, recognize, Board, polyLength, toPathD };
})();
