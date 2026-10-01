(function () {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    function svgNode(tag, attrs, parent) {
        const el = document.createElementNS(NS, tag);
        Object.entries(attrs || {}).forEach(([key, value]) => el.setAttribute(key, value));
        if (parent) parent.appendChild(el);
        return el;
    }
    class Board {
        constructor(host, data, callbacks) {
            this.host = host; this.data = data; this.callbacks = callbacks;
            this.accepted = []; this.points = []; this.index = 0; this.mode = 'study';
            this.pointer = null; this.animation = 0; this.destroyed = false;
            const measure = document.getElementById('ka-measure');
            measure.textContent = '';
            this.refs = data.s.map(d => {
                const path = svgNode('path', { d }, measure), total = path.getTotalLength();
                if (!Number.isFinite(total) || total < .1) throw new Error('invalid path');
                const points = Array.from({ length: 32 }, (_, i) => {
                    const p = path.getPointAtLength(total * i / 31);
                    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('invalid point');
                    return { x: p.x, y: p.y };
                });
                return { d, length: total, points };
            });
            measure.textContent = '';
            this.svg = svgNode('svg', { viewBox: '0 0 109 109', 'aria-hidden': 'true' }, host);
            svgNode('path', { d: 'M54.5 0V109M0 54.5H109M0 0L109 109M109 0L0 109', class: 'ka-grid' }, this.svg);
            this.outline = svgNode('g', {}, this.svg);
            this.demo = svgNode('g', {}, this.svg);
            this.hints = svgNode('g', {}, this.svg);
            this.numbers = svgNode('g', {}, this.svg);
            this.canvas = document.createElement('canvas');
            this.canvas.setAttribute('aria-label', callbacks.label);
            this.canvas.setAttribute('role', 'img');
            host.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');
            this.handlers = {
                pointerdown: e => this.down(e), pointermove: e => this.move(e), pointerup: e => this.up(e),
                pointercancel: e => { if (e.pointerId === this.pointer) this.cancel(); },
                lostpointercapture: e => { if (e.pointerId === this.pointer) this.cancel(); }
            };
            Object.entries(this.handlers).forEach(([name, fn]) => this.canvas.addEventListener(name, fn));
            this.observer = new ResizeObserver(() => { this.cancel(); this.resize(); });
            this.observer.observe(host);
            this.resize();
        }
        resize() {
            const size = Math.max(1, this.host.getBoundingClientRect().width), ratio = Math.min(window.devicePixelRatio || 1, 3);
            this.canvas.width = this.canvas.height = Math.round(size * ratio);
            this.ctx.setTransform(this.canvas.width / 109, 0, 0, this.canvas.height / 109, 0, 0);
            this.redraw();
        }
        color() { return getComputedStyle(this.host).getPropertyValue('--text').trim() || '#e2e8f0'; }
        paint(points) {
            if (!points.length) return;
            const ctx = this.ctx;
            ctx.beginPath(); ctx.strokeStyle = this.color(); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.stroke();
        }
        redraw() {
            this.ctx.clearRect(0, 0, 109, 109);
            this.accepted.forEach(points => this.paint(points));
        }
        setMode(mode) {
            this.stop(); this.cancel(); this.mode = mode; this.index = 0; this.accepted = [];
            this.outline.textContent = ''; this.demo.textContent = ''; this.hints.textContent = ''; this.numbers.textContent = '';
            this.host.classList.toggle('is-study', mode === 'study');
            if (mode !== 'memory') this.refs.forEach(ref => svgNode('path', { d: ref.d, class: 'ka-outline' }, this.outline));
            this.redraw();
            if (mode === 'study') this.play();
        }
        showNumbers() {
            this.numbers.textContent = '';
            this.refs.forEach((ref, i) => {
                const n = Array.isArray(this.data.n) && this.data.n[i];
                const pos = Array.isArray(n) && n.length >= 2 && n.every(Number.isFinite) ? n : [ref.points[0].x - 3, ref.points[0].y - 3];
                const label = svgNode('text', { x: Math.max(3, Math.min(104, pos[0])), y: Math.max(5, Math.min(106, pos[1])), class: 'ka-number' }, this.numbers);
                label.textContent = String(i + 1);
            });
        }
        play() {
            this.stop(); this.demo.textContent = ''; this.hints.textContent = ''; this.numbers.textContent = '';
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
                this.refs.forEach(ref => svgNode('path', { d: ref.d, class: 'ka-demo' }, this.demo));
                this.showNumbers(); return;
            }
            let index = 0, start = null, path = null;
            const tick = time => {
                if (this.destroyed || this.mode !== 'study') return;
                const ref = this.refs[index];
                if (start === null) {
                    start = time;
                    path = svgNode('path', { d: ref.d, class: 'ka-demo', 'stroke-dasharray': ref.length, 'stroke-dashoffset': ref.length }, this.demo);
                    this.hints.textContent = '';
                    svgNode('circle', { cx: ref.points[0].x, cy: ref.points[0].y, r: 1.9, class: 'ka-start-dot' }, this.hints);
                    this.callbacks.step(index);
                }
                const duration = Math.max(350, Math.min(850, ref.length * 10));
                path.setAttribute('stroke-dashoffset', ref.length * (1 - Math.min(1, (time - start) / duration)));
                if (time - start >= duration + 170) {
                    index++; start = null;
                    if (index === this.refs.length) { this.hints.textContent = ''; this.showNumbers(); return; }
                }
                this.animation = requestAnimationFrame(tick);
            };
            this.animation = requestAnimationFrame(tick);
        }
        stop() { cancelAnimationFrame(this.animation); this.animation = 0; }
        hint() {
            const ref = this.refs[this.index];
            if (!ref) return;
            this.hints.textContent = '';
            svgNode('path', { d: ref.d, class: 'ka-hint' }, this.hints);
            svgNode('circle', { cx: ref.points[0].x, cy: ref.points[0].y, r: 2.1, class: 'ka-start-dot' }, this.hints);
        }
        point(event) { return { x: (event.clientX - this.rect.left) * 109 / this.rect.width, y: (event.clientY - this.rect.top) * 109 / this.rect.height }; }
        down(event) {
            if (this.mode === 'study' || this.index >= this.refs.length || this.pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault();
            this.rect = this.canvas.getBoundingClientRect();
            this.pointer = event.pointerId;
            this.points = [this.point(event)];
            this.ink = this.color();
            this.canvas.setPointerCapture(event.pointerId);
        }
        move(event) {
            if (event.pointerId !== this.pointer) return;
            event.preventDefault();
            // В горячем обработчике нет измерений SVG, ресэмплинга и перерисовки всего поля.
            const point = this.point(event), prev = this.points[this.points.length - 1];
            if (Math.hypot(point.x - prev.x, point.y - prev.y) < .35 || this.points.length >= 4096) return;
            this.points.push(point);
            const ctx = this.ctx;
            ctx.beginPath(); ctx.strokeStyle = this.ink; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
            ctx.moveTo(prev.x, prev.y); ctx.lineTo(point.x, point.y); ctx.stroke();
        }
        up(event) {
            if (event.pointerId !== this.pointer) return;
            this.move(event);
            const points = this.points.slice();
            this.pointer = null; this.points = [];
            if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
            const error = KanjiCore.compare(points, this.refs[this.index], this.mode);
            if (error) { this.redraw(); this.hint(); this.callbacks.error(error, this.index); }
            else {
                this.accepted.push(points); this.index++; this.hints.textContent = ''; this.redraw();
                this.callbacks.accept(this.index, this.index === this.refs.length);
            }
        }
        cancel() {
            if (this.pointer === null) return;
            const id = this.pointer; this.pointer = null; this.points = [];
            if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
            this.redraw();
        }
        destroy() {
            this.destroyed = true; this.stop(); this.cancel(); this.observer.disconnect();
            Object.entries(this.handlers).forEach(([name, fn]) => this.canvas.removeEventListener(name, fn));
            this.host.textContent = '';
        }
    }
    window.KanjiBoard = Board;
})();
