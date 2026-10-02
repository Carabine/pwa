// ===== Газета на столе: случайная новость из дневного выпуска «Сегодня» (/api/v1/news) =====
// Смотришь на газету — «📰 Читать газету». Простой уровень, фуригана, перевод по тапу на фразу.
// Встраивается build-walk.mjs.
const PAPER = (() => {
    const API = location.protocol === 'file:' ? 'https://animei.space/api/v1/' : '/api/v1/';
    const SITE = location.protocol === 'file:' ? 'https://animei.space/app/' : '../';
    const CAT = { weather: 'Погода', society: 'Общество', culture: 'Культура', sports: 'Спорт', sport: 'Спорт', tech: 'Технологии', technology: 'Технологии', economy: 'Экономика', business: 'Экономика', anime: 'Аниме', entertainment: 'Шоу-бизнес', science: 'Наука', food: 'Еда', travel: 'Путешествия', nature: 'Природа', animals: 'Животные', life: 'Жизнь', health: 'Здоровье', politics: 'Политика', world: 'В мире', local: 'Регионы' };
    let el = null, today = null, loading = null, order = [], pos = -1, cur = null, tex = null;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // токены выпуска уже несут фуригану: f = [{ t, rt? }]
    const furi = (tokens, text) => (tokens && tokens.length ? tokens.map((t) => (t.f && t.f.length ? t.f : [{ t: t.s }]).map((p) => (p.rt ? '<ruby>' + esc(p.t) + '<rt>' + esc(p.rt) + '</rt></ruby>' : esc(p.t))).join('')).join('') : esc(text));
    function loadToday() {
        if (!loading) loading = fetch(API + 'news/today').then((r) => (r.ok ? r.json() : null)).then((j) => (today = j && j.data)).catch(() => { loading = null; return null; });
        return loading;
    }
    function ui() {
        if (el) return el;
        el = document.createElement('div'); el.id = 'paper';
        el.innerHTML = '<div class="mh"><div class="t">アニメイ新聞</div><div class="d"></div><button class="tx" aria-label="Закрыть">×</button></div>'
            + '<div class="body"></div>'
            + '<div class="row"><button class="b-tr">Перевод</button><button class="b-next">Другая новость</button><a class="b-open" target="_blank" rel="noopener">Целиком ↗</a></div>';
        document.body.appendChild(el);
        el.querySelector('.tx').addEventListener('click', close);
        el.querySelector('.b-tr').addEventListener('click', (e) => { el.classList.toggle('tr'); e.currentTarget.classList.toggle('on', el.classList.contains('tr')); });
        el.querySelector('.b-next').addEventListener('click', () => next());
        el.querySelector('.body').addEventListener('click', (e) => { const p = e.target.closest('p[data-i]'); if (p) p.classList.toggle('open'); });
        ['pointerdown', 'touchstart', 'wheel'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
        addEventListener('keydown', (e) => { if (e.code === 'Escape' && el.classList.contains('on')) close(); });
        return el;
    }
    const say = (t) => { el.querySelector('.body').innerHTML = '<div class="msg">' + esc(t) + '</div>'; };
    async function open() {
        const e = ui(); e.classList.add('on'); if (typeof hideHint === 'function') hideHint();
        if (cur) return;
        say('Разворачиваю газету…');
        const d = await loadToday();
        if (!d || !d.stories || !d.stories.length) { say('Свежий выпуск ещё не напечатан — загляните позже.'); return; }
        if (!order.length) { order = d.stories.map((s, i) => i).sort(() => Math.random() - 0.5); pos = -1; }
        next();
    }
    async function next() {
        if (!today || !today.stories || !today.stories.length) return;
        pos = (pos + 1) % order.length;
        const meta = today.stories[order[pos]];
        el.querySelector('.d').textContent = (today.date || '').replace(/^(\d{4})-(\d\d)-(\d\d)$/, '$3.$2.$1');
        say('Листаю…');
        try {
            const r = await fetch(API + 'news/story/' + encodeURIComponent(meta.id) + '?lang=ru');
            const s = r.ok ? (await r.json()).data : null;
            if (!s || !s.levels) throw new Error('нет статьи');
            cur = s; render(s);
        } catch (err) { say('Не получилось прочитать заметку. Попробуйте другую.'); }
    }
    function render(s) {
        const lv = s.levels.easy || s.levels.mid || s.levels.orig, key = s.levels.easy ? 'easy' : (s.levels.mid ? 'mid' : 'orig');
        const tr = (s.tr && s.tr.ru && s.tr.ru.levels && s.tr.ru.levels[key]) || {};
        const sent = lv.sentences || [];
        const voc = (s.vocab || []).filter((v) => v.word && v.gloss).slice(0, 6);
        el.querySelector('.body').innerHTML = '<span class="cat">' + esc(CAT[s.category] || 'Новости') + '</span>'
            + '<h3>' + furi(lv.title && lv.title.tokens, lv.title && lv.title.text) + '</h3>'
            + (tr.title ? '<div class="ttr">' + esc(tr.title) + '</div>' : '')
            + sent.map((x, i) => '<p data-i="' + i + '">' + furi(x.tokens, x.text) + (tr.sentences && tr.sentences[i] ? '<span class="ru">' + esc(tr.sentences[i]) + '</span>' : '') + '</p>').join('')
            + (voc.length ? '<div class="voc">' + voc.map((v) => '<span><b>' + esc(v.word) + '</b>' + (v.reading && v.reading !== v.word ? ' ' + esc(v.reading) : '') + ' — ' + esc(v.gloss) + '</span>').join('') + '</div>' : '')
            + '<div class="src">' + esc(s.source && s.source.name || '') + '</div>';
        el.querySelector('.body').scrollTop = 0;
        el.querySelector('.b-open').href = SITE + 'pages/news-story.html?id=' + encodeURIComponent(s.id) + '&level=' + key;
    }
    function close() { if (el) el.classList.remove('on'); cur = null; }
    // текстура самой газеты на столе: шапка, заголовок, колонки
    function texture() {
        if (tex) return tex;
        const c = document.createElement('canvas'); c.width = 512; c.height = 372; const g = c.getContext('2d');
        g.fillStyle = '#efe8d6'; g.fillRect(0, 0, 512, 372);
        g.fillStyle = '#1c1a20'; g.font = '900 54px ' + JP; g.textAlign = 'left'; g.fillText('アニメイ新聞', 22, 64);
        g.fillStyle = '#c8322a'; g.fillRect(22, 80, 468, 6); g.fillStyle = '#1c1a20'; g.fillRect(22, 90, 468, 2);
        g.font = '800 34px ' + JP; g.fillText('今日のニュース', 22, 136);
        g.fillStyle = '#8a8478'; g.fillRect(330, 108, 160, 110);
        g.fillStyle = 'rgba(28,26,32,0.55)'; for (let col = 0; col < 3; col++) for (let r = 0; r < 9; r++) { const x = 22 + col * 160, y = 160 + r * 22; if (col === 2 && y < 226) continue; g.fillRect(x, y, 140 - ((r * 37 + col * 11) % 40), 8); }
        tex = makeTex(c); return tex;
    }
    return { open, close, texture, get on() { return !!(el && el.classList.contains('on')); } };
})();

// ===== Почтовый ящик у начала улицы: отзыв автору (POST /api/v1/feedback → админка, вкладка «Почта») =====
const MAIL = (() => {
    const API = location.protocol === 'file:' ? 'https://animei.space/api/v1/' : '/api/v1/';
    let el = null, busy = false, at = null;
    function ui() {
        if (el) return el;
        el = document.createElement('div'); el.id = 'mail';
        el.innerHTML = '<div class="mh"><div class="t">目安箱 · отзыв разработчику</div><button class="tx" aria-label="Закрыть">×</button></div>'
            + '<p class="lead">Что понравилось, что сломалось, чего не хватает? Разработчик читает каждое письмо.</p>'
            + '<textarea maxlength="2000" placeholder="Ваше письмо…"></textarea><div class="st"></div>'
            + '<div class="row"><button class="b-send">Отправить ✉</button></div>';
        document.body.appendChild(el);
        el.querySelector('.tx').addEventListener('click', close);
        el.querySelector('.b-send').addEventListener('click', send);
        ['pointerdown', 'touchstart', 'wheel'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
        // буквы в поле не должны двигать игрока, включать звук и т.п.
        ['keydown', 'keyup'].forEach((ev) => el.addEventListener(ev, (e) => { if (e.code === 'Escape') { close(); return; } e.stopPropagation(); }));
        return el;
    }
    const st = (t, kind) => { const n = el.querySelector('.st'); n.textContent = t || ''; n.className = 'st' + (kind ? ' ' + kind : ''); };
    function open() {
        const e = ui(); e.classList.add('on'); at = camera.position.clone();
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        if (typeof hideHint === 'function') hideHint();
        st(''); setTimeout(() => { const ta = e.querySelector('textarea'); if (ta) ta.focus(); }, 60);
    }
    async function send() {
        if (busy) return;
        const ta = el.querySelector('textarea'), text = ta.value.trim();
        if (!text) { st('Напишите хотя бы пару слов', 'err'); return; }
        busy = true; st('Отправляю…');
        try {
            const r = await fetch(API + 'feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, from: 'street', meta: { page: location.pathname + location.search, lang: navigator.language || '' } }) });
            if (r.status === 429) st('Слишком много писем подряд — попробуйте через несколько минут', 'err');
            else if (!r.ok) st('Не получилось отправить. Попробуйте ещё раз', 'err');
            else { ta.value = ''; st('Письмо в ящике. Спасибо! 💌', 'ok'); if (typeof audio !== 'undefined') audio.ding(); setTimeout(() => { if (el.querySelector('.st').classList.contains('ok')) close(); }, 1800); }
        } catch (err) { st('Нет связи с сервером. Попробуйте позже', 'err'); }
        busy = false;
    }
    function close() { if (el) el.classList.remove('on'); }
    const near = () => !at || camera.position.distanceTo(at) < 4;
    return { open, close, near, get on() { return !!(el && el.classList.contains('on')); } };
})();
