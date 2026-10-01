/* Улица слов — обвязка: данные, HUD, карточка слова, свайпы, шаринг. */
(function () {
'use strict';
const D = window.StreetData, THEMES = window.StreetThemes, U = window.StreetUtil;
const SET_KEY = 'animei:street';
const STATE_LABEL = { lit: 'выучено', warm: 'учу', new: 'новое', due: 'пора повторить', worn: 'забывается' };

function lsSet() { try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}') || {}; } catch (e) { return {}; } }
function saveSet(p) { try { localStorage.setItem(SET_KEY, JSON.stringify(Object.assign(lsSet(), p))); } catch (e) { /* приватный режим */ } }

const params = new URLSearchParams(location.search);
const themeId = document.body.dataset.theme || params.get('theme') || 'shinjuku';
const theme = THEMES[themeId] || THEMES.shinjuku;
const settings = lsSet();
let source = params.get('src') || settings.source || 'demo';
let rainOn = settings.rain !== false;

const canvas = document.getElementById('scene');
const street = new window.Street(canvas, theme.id, { rain: rainOn, fps: params.has("fps") });
window.__street = street; // для харнеса скриншотов

let data = null, quarters = [], qi = 0, today = D.todayKey();

function colorFor(word, jlptMap) {
    const lvl = (data.jlpt[word.kanji] != null ? data.jlpt[word.kanji] : (jlptMap[word.kanji] || 0)) | 0;
    word._jlpt = lvl;
    return theme.palette[lvl] || theme.palette[0];
}

function prepare(jlptMap) {
    data.words.forEach((w) => { w._state = D.wordState(w, data, today); w._color = colorFor(w, jlptMap); });
    quarters = D.buildQuarters(data, street.capacity());
    qi = Math.min(qi, quarters.length - 1);
    show(qi);
}

function load() {
    data = source === 'real' ? D.loadReal() : D.buildDemo();
    if (source === 'real' && !data.words.length) {
        toast('В этом браузере нет слов — показан встроенный набор');
        data = D.buildDemo(); source = 'demo';
    }
    if (source === 'real') D.loadJlpt().then(prepare); else prepare({});
}

function litCount() { return data.words.filter((w) => w._state === 'lit' || w._state === 'warm' || w._state === 'worn').length; }

function show(i) {
    qi = (i + quarters.length) % quarters.length;
    const q = quarters[qi], nq = quarters[(qi + 1) % quarters.length];
    const nw = nq.words.find((w) => w._state === 'lit') || nq.words[0];
    street.nextColor = nw ? nw._color : '#7c8cf8';
    street.setQuarter(q);
    document.getElementById('q-emoji').textContent = q.emoji || '🏮';
    document.getElementById('q-name').textContent = q.name;
    document.getElementById('q-sub').textContent = 'квартал ' + (qi + 1) + ' из ' + quarters.length + ' · ' + q.words.length + ' ' + plural(q.words.length, 'слово', 'слова', 'слов');
    const lit = litCount();
    document.getElementById('lit-n').textContent = lit;
    document.getElementById('lit-l').textContent = plural(lit, 'вывеска горит', 'вывески горят', 'вывесок горит');
    const dots = document.getElementById('dots');
    dots.innerHTML = quarters.map((_, k) => '<i' + (k === qi ? ' class="on"' : '') + '></i>').join('');
    const next = document.getElementById('next');
    next.textContent = (quarters.length > 1 ? nq.name : q.name) + ' →';
    next.style.left = street.cx + 'px';
    next.style.top = (street.hy - 14) + 'px';
}

function plural(n, a, b, c) { const m = n % 10, h = n % 100; if (m === 1 && h !== 11) return a; if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return b; return c; }

// ---- жесты: свайп между кварталами, тап по вывеске, параллакс ----
let pt = null;
canvas.addEventListener('pointerdown', (e) => { pt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }; });
canvas.addEventListener('pointermove', (e) => {
    street.setParallax((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
    if (pt && Math.abs(e.clientX - pt.x) > 12) pt.moved = true;
});
canvas.addEventListener('pointerup', (e) => {
    if (!pt) return;
    const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) { go(dx < 0 ? 1 : -1); pt = null; return; }
    if (!pt.moved && performance.now() - pt.t < 500) tap(e.clientX, e.clientY);
    pt = null;
});
window.addEventListener('deviceorientation', (e) => { if (e.gamma != null) street.setParallax(Math.max(-1, Math.min(1, e.gamma / 25)), Math.max(-1, Math.min(1, (e.beta - 45) / 30))); });
window.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'Escape') closeSheet(); });
window.addEventListener('resize', () => { street.resize(); show(qi); });

function go(dir) { if (quarters.length < 2) return; street.transition(() => show(qi + dir)); }
document.getElementById('next').addEventListener('click', () => go(1));

function tap(x, y) {
    const s = street.hit(x, y);
    if (s) { openSheet(s); return; }
    if (street.nearGate(x, y)) go(1);
}

// ---- карточка слова ----
const sheet = document.getElementById('sheet');
let current = null, openedAt = 0;
function openSheet(s) {
    current = s;
    const w = s.word;
    document.getElementById('s-kanji').textContent = w.kanji || w.kana;
    document.getElementById('s-kana').textContent = w.kana && w.kana !== w.kanji ? w.kana : '';
    document.getElementById('s-tr').textContent = w.translation || '';
    const st = document.getElementById('s-state');
    st.textContent = STATE_LABEL[s.state] || s.state;
    st.className = 'state ' + s.state;
    st.style.setProperty('--c', s.color);
    const jl = document.getElementById('s-jlpt'); jl.textContent = w._jlpt ? 'N' + w._jlpt : ''; jl.hidden = !w._jlpt;
    document.getElementById('s-kanji').style.setProperty('--c', s.color);
    const btn = document.getElementById('s-review');
    btn.hidden = s.state === 'lit';
    sheet.classList.add('open');
    openedAt = performance.now();
}
function closeSheet() { sheet.classList.remove('open'); current = null; }
document.getElementById('s-close').addEventListener('click', closeSheet);
// синтетический click после touchend прилетает уже в открытую карточку — не считать его закрытием
sheet.addEventListener('click', (e) => { if (e.target === sheet && performance.now() - openedAt > 400) closeSheet(); });
document.getElementById('s-review').addEventListener('click', () => {
    if (!current) return;
    const s = current;
    closeSheet();
    s.word._state = 'lit';
    street.lightUp(s);
    const lit = litCount();
    document.getElementById('lit-n').textContent = lit;
    document.getElementById('lit-l').textContent = plural(lit, 'вывеска горит', 'вывески горят', 'вывесок горит');
    toast(source === 'demo' ? 'Вывеска зажглась (в макете расписание не меняется)' : 'Вывеска зажглась — повторение считается в тренажёре');
});

// ---- поделиться: кадр в PNG ----
document.getElementById('share').addEventListener('click', async () => {
    const W = street.W, H = street.H, DPR = U.DPR;
    const c = document.createElement('canvas'); c.width = W * DPR; c.height = H * DPR;
    const g = c.getContext('2d');
    g.drawImage(canvas, 0, 0);
    g.scale(DPR, DPR);
    g.textBaseline = 'top'; g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 8;
    g.fillStyle = '#fff'; g.font = '600 16px Inter,system-ui,sans-serif';
    g.fillText((quarters[qi].emoji || '') + ' ' + quarters[qi].name, 18, 22);
    g.font = '700 30px Inter,system-ui,sans-serif'; g.textAlign = 'right';
    g.fillText(String(litCount()), W - 18, 16);
    g.font = '500 12px Inter,system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText(document.getElementById('lit-l').textContent, W - 18, 50);
    g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '600 13px Inter,system-ui,sans-serif';
    g.fillText('animei.space · Улица слов', 18, H - 34);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    const file = new File([blob], 'animei-street.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Улица слов' }); return; } catch (e) { /* отменили */ }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

// ---- настройки ----
const panel = document.getElementById('panel');
document.getElementById('gear').addEventListener('click', () => panel.classList.toggle('open'));
panel.querySelectorAll('[data-src]').forEach((b) => {
    b.classList.toggle('on', b.dataset.src === source);
    b.addEventListener('click', () => { source = b.dataset.src; saveSet({ source }); panel.querySelectorAll('[data-src]').forEach((x) => x.classList.toggle('on', x === b)); qi = 0; load(); });
});
panel.querySelectorAll('[data-theme]').forEach((b) => { b.classList.toggle('on', b.dataset.theme === theme.id); });
const rainBtn = panel.querySelector('[data-rain]');
if (rainBtn) {
    rainBtn.classList.toggle('on', rainOn); rainBtn.hidden = !theme.rain;
    rainBtn.addEventListener('click', () => { rainOn = !rainOn; street.opts.rain = rainOn; saveSet({ rain: rainOn }); rainBtn.classList.toggle('on', rainOn); });
}
document.getElementById('panel-close').addEventListener('click', () => panel.classList.remove('open'));

let toastT = 0;
function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600);
}

// шрифты: первый кадр сразу, перерисовка когда подъедет Noto Sans JP
load();
if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 20px "Noto Sans JP"'), document.fonts.load('900 20px "Noto Sans JP"')]).then(() => { if (quarters.length) show(qi); }).catch(() => {});
}
})();
