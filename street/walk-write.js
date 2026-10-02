// ===== Доска в классе: написать слово из словаря по порядку черт (ядро «Прописей»: /app/kanji/kanji-core.js) =====
// Смотришь на доску — «✍ Написать на доске»; ещё учитель предлагает это в разговоре.
// Черты знаков — с сервера (/api/v1/kanji/strokes, KanjiVG). Встраивается build-walk.mjs.
const WRITE = (() => {
    const API = location.protocol === 'file:' ? 'https://animei.space/api/v1/' : '/api/v1/';
    let el = null, core = null, board = null, cur = null, loadingCore = null;
    const strokesCache = new Map();
    const isKanji = (ch) => /[㐀-鿿]/.test(ch);
    const writable = (ch) => /[぀-ヿ㐀-鿿]/.test(ch);
    function loadCore() {
        // ядро мерит длину черт через скрытый SVG #kj-measure (как на странице «Прописей»)
        if (!document.getElementById('kj-measure')) { const m = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); m.id = 'kj-measure'; m.setAttribute('viewBox', '0 0 109 109'); m.setAttribute('width', '0'); m.setAttribute('height', '0'); m.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'; document.body.appendChild(m); }
        if (window.KanjiCore) return Promise.resolve(window.KanjiCore);
        if (loadingCore) return loadingCore;
        loadingCore = new Promise((res, rej) => { const s = document.createElement('script'); s.src = '../kanji/kanji-core.js'; s.onload = () => (window.KanjiCore ? res(window.KanjiCore) : rej(new Error('нет KanjiCore'))); s.onerror = () => rej(new Error('не загрузилось ядро прописей')); document.head.appendChild(s); });
        return loadingCore;
    }
    async function strokesFor(chars) {
        const need = [...new Set(chars)].filter((c) => !strokesCache.has(c));
        if (need.length) {
            const r = await fetch(API + 'kanji/strokes?chars=' + encodeURIComponent(need.join('')));
            const j = r.ok ? await r.json() : { data: {} };
            need.forEach((c) => strokesCache.set(c, (j.data || {})[c] || null));
        }
        return chars.map((c) => ({ ch: c, rec: strokesCache.get(c) }));
    }
    function ui() {
        if (el) return el;
        el = document.createElement('div'); el.id = 'write';
        el.innerHTML = '<div class="th"><div class="av">✍</div><div class="tt"><div class="nm">Доска</div><div class="rl">напиши слово по порядку черт</div></div><button class="tx" aria-label="Закрыть">×</button></div>'
            + '<div class="card"><div class="kana"></div><div class="mean"></div><div class="prog"></div></div>'
            + '<div class="bd"><div class="host"></div></div><div class="msg"></div>'
            + '<div class="row"><button class="b-show">▶ Порядок черт</button><button class="b-ghost">Обводка</button><button class="b-next">Другое слово</button></div>';
        document.body.appendChild(el);
        el.querySelector('.tx').addEventListener('click', close);
        el.querySelector('.b-show').addEventListener('click', () => { if (board && cur) { board.setEnabled(false); board.animate().then(() => board && board.setEnabled(true)); } });
        el.querySelector('.b-ghost').addEventListener('click', (e) => { if (!cur) return; cur.ghost = !cur.ghost; e.currentTarget.classList.toggle('on', cur.ghost); board.showGhost(cur.ghost); });
        el.querySelector('.b-next').addEventListener('click', () => open(cur && cur.teacher));
        ['pointerdown', 'touchstart', 'wheel'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
        return el;
    }
    const msg = (t, kind) => { const m = el.querySelector('.msg'); m.textContent = t || ''; m.className = 'msg' + (kind ? ' ' + kind : ''); };
    function pickWord() {
        const P = ((typeof data !== 'undefined' && data && data.words) || []).filter((w) => w.kanji && [...w.kanji].some(isKanji) && [...w.kanji].every(writable) && [...w.kanji].length <= 4 && w.translation);
        if (!P.length) return null;
        const rank = (w) => ({ due: 0, worn: 0, warm: 1, new: 2, lit: 3 }[w._state] ?? 2) + Math.random() * 2.2;
        return P.slice().sort((a, b) => rank(a) - rank(b))[0];
    }
    async function open(teacher) {
        const e = ui(); e.classList.add('on'); if (typeof hideHint === 'function') hideHint();
        const w = pickWord();
        if (!w) { msg('В словаре нет слов с иероглифами — добавь их, и сюда можно будет писать.', 'err'); return; }
        cur = { w, chars: [...w.kanji], i: 0, idx: 0, miss: 0, misses: 0, ghost: w._state === 'new' || w._state === 'due', teacher };
        e.querySelector('.kana').textContent = w.kana && w.kana !== w.kanji ? w.kana : '';
        e.querySelector('.mean').textContent = String(w.translation).split(/[;,]/)[0].trim();
        e.querySelector('.b-ghost').classList.toggle('on', cur.ghost);
        msg('Загружаю черты…');
        try {
            const C = core = await loadCore();
            const recs = await strokesFor(cur.chars);
            if (!cur || cur.w !== w) return;
            cur.recs = recs;
            if (!board) board = new C.Board(e.querySelector('.host'), { onStroke });
            glyph();
        } catch (err) { msg('Не получилось загрузить доску: ' + (err && err.message || err), 'err'); }
    }
    function progress() {
        el.querySelector('.prog').innerHTML = cur.chars.map((c, k) => '<span class="' + (k < cur.i ? 'done' : k === cur.i ? 'now' : '') + '">' + (k < cur.i ? c : (cur.recs && cur.recs[k] && !cur.recs[k].rec ? c : '？')) + '</span>').join('');
    }
    function glyph() {
        while (cur.i < cur.recs.length && !cur.recs[cur.i].rec) cur.i++; // знаков без данных о чертах (редкие) — пропускаем
        progress();
        if (cur.i >= cur.recs.length) return done();
        const r = cur.recs[cur.i].rec; cur.idx = 0; cur.miss = 0;
        board.setGlyph(r); board.showGhost(cur.ghost); board.setEnabled(false);
        msg((isKanji(cur.chars[cur.i]) ? 'Иероглиф ' : 'Знак ') + (cur.i + 1) + ' из ' + cur.chars.length + ' · черт: ' + r.s.length);
        // новый знак: сначала покажем порядок черт
        if (cur.i === 0 && (cur.w._state === 'new' || cur.w._state === 'due')) board.animate().then(() => { if (board) { board.stopAnimation(); board.showGhost(cur.ghost); board.setEnabled(true); } });
        else board.setEnabled(true);
    }
    function onStroke(points) {
        if (!cur || !cur.recs || cur.i >= cur.recs.length) return;
        const r = cur.recs[cur.i].rec; if (!r || cur.idx >= r.s.length) return;
        if (points.length < 2 && r.s.length > 1 && core.samplePath(r.s[cur.idx]).len > 12) return; // случайное касание
        const res = core.recognize(points, r.s, cur.idx, core.TOL.normal);
        if (res.ok) {
            board.clearHint(); board.commit(cur.idx); cur.idx++; cur.miss = 0; if (typeof buzz === 'function') buzz(8);
            if (cur.idx >= r.s.length) { msg('Отлично!', 'ok'); setTimeout(() => { if (cur) { cur.i++; glyph(); } }, 450); }
            else msg('Черта ' + (cur.idx + 1) + ' из ' + r.s.length);
            return;
        }
        cur.miss++; cur.misses++; board.flashWrong(points);
        msg(res.reason === 'order' ? 'Не та черта — сейчас нужна ' + (cur.idx + 1) + '-я' : res.reason === 'reversed' ? 'Черта в другую сторону' : 'Форма не похожа — попробуй ещё', 'err');
        if (cur.miss >= 2) board.hint(cur.idx);
        if (cur.miss >= 3) setTimeout(() => { if (!cur || cur.i >= cur.recs.length) return; board.clearHint(); board.commit(cur.idx); cur.idx++; cur.miss = 0; if (cur.idx >= r.s.length) { cur.i++; glyph(); } }, 500);
    }
    function done() {
        const w = cur.w, clean = cur.misses === 0;
        msg((clean ? 'Без единой ошибки! ' : 'Готово! ') + w.kanji + (w.kana && w.kana !== w.kanji ? ' — ' + w.kana : ''), 'ok');
        board.setEnabled(false); if (typeof audio !== 'undefined') audio.ding();
        el.querySelector('.prog').innerHTML = cur.chars.map((c) => '<span class="done">' + c + '</span>').join('');
        // учитель хвалит
        const t = cur.teacher || (LIFE.S.room || []).find((c) => c.role === 'teacher');
        if (t) LIFE.say(t, clean ? ['よくできました！', 'Прекрасно!'] : ['いいですね、その調子！', 'Хорошо, так держать!'], 2.6, LIFE.S.t);
    }
    function close() { if (el) el.classList.remove('on'); if (board) board.setEnabled(false); cur = null; }
    return { open, close, get open_() { return !!cur; } };
})();
