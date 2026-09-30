// Читалка истории: три версии одной новости (やさしい / ふつう / 原文),
// сплошной текст с фуриганой, тап по слову — карточка словаря Animei,
// тап по предложению — панель (озвучка / перевод / ИИ-разбор), затем
// вопросы на понимание и слова истории → «Готово».

(function () {
    'use strict';

    const C = window.NewsCore;
    const el = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const state = {
        story: null,
        level: C.getLevel(),
        furi: C.getFuri(),
        showTr: false,
        active: -1,          // индекс активного предложения (-1 — нет)
        ctx: null,           // known/saved для отрисовки токенов
        speaking: false,
        answers: {},         // {qi: optionIndex}
        explainCache: new Map(),
    };

    function apiBase() { return (window.ANIMEI_ORIGIN || location.origin) + '/api/v1/'; }
    function lv() { return state.story.levels[state.level]; }
    function trLevel() {
        const tr = state.story.tr || {};
        const pack = tr[C.lang()] || tr.ru || Object.values(tr)[0];
        return pack ? pack.levels[state.level] : null;
    }

    // ---------- Загрузка ----------
    async function load() {
        const params = new URLSearchParams(location.search);
        const id = params.get('id') || '';
        const wantLevel = params.get('level');
        if (C.LEVELS.includes(wantLevel)) { state.level = wantLevel; C.setLevel(wantLevel); }
        const { data: res } = await client.get('news/story/' + encodeURIComponent(id), { params: { lang: C.lang() }, silentErrors: true });
        state.story = res.data;
    }

    // ---------- Шапка и текст ----------
    function renderLevelSeg() {
        const seg = el('rd-level');
        seg.innerHTML = '';
        for (const l of C.LEVELS) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = l === state.level ? 'is-active' : '';
            b.textContent = C.LEVEL_JA[l];
            b.title = C.tr('news.level.' + l);
            b.addEventListener('click', () => {
                if (state.level === l) return;
                stopSpeaking();
                state.level = l; C.setLevel(l);
                state.active = -1; state.answers = {};
                renderLevelSeg(); renderText(); renderQuiz(false);
                history.replaceState(null, '', location.pathname + '?id=' + encodeURIComponent(state.story.id) + '&level=' + l);
            });
            seg.appendChild(b);
        }
    }

    function renderFuriBtn() {
        const b = el('rd-furi');
        const labels = { all: C.tr('news.furi.all'), new: C.tr('news.furi.new'), none: C.tr('news.furi.none') };
        b.textContent = 'あ · ' + labels[state.furi];
        el('rd-text').className = 'rd-text furi-' + state.furi;
    }

    function cycleFuri() {
        const order = ['all', 'new', 'none'];
        state.furi = order[(order.indexOf(state.furi) + 1) % order.length];
        C.setFuri(state.furi);
        renderFuriBtn();
    }

    function renderHead() {
        const s = state.story;
        const media = el('rd-media');
        if (s.photo) {
            media.hidden = false;
            media.innerHTML = '<img alt="" src="' + apiBase() + 'news/img/' + esc(s.id) + '">';
        } else media.hidden = true;
        const meta = el('rd-meta');
        const date = C.formatDate(s.date, { day: 'numeric', month: 'long' });
        meta.innerHTML = '<span>' + esc(C.categoryName(s.category)) + '</span><span>' + esc(date) + '</span>' +
            '<span>' + esc(C.tr('news.readTime').replace('{n}', lv().minutes)) + '</span>';
    }

    // Предложения группируем в абзацы: лёгкая версия — по 3, остальные — по 4.
    function paragraphs(n) {
        const size = state.level === 'easy' ? 3 : 4;
        const out = [];
        for (let i = 0; i < n; i += size) out.push([i, Math.min(n, i + size)]);
        return out;
    }

    function renderText() {
        const s = state.story;
        const L = lv();
        state.ctx = C.ctxFor(state.level);
        const title = el('rd-title');
        title.innerHTML = '';
        title.appendChild(C.renderTokens(L.title.tokens, state.ctx));
        const trl = trLevel();
        el('rd-title-tr').textContent = trl ? trl.title : '';

        const box = el('rd-text');
        box.innerHTML = '';
        for (const [a, b] of paragraphs(L.sentences.length)) {
            const p = document.createElement('p');
            p.className = 'rd-p';
            for (let i = a; i < b; i++) {
                const sen = L.sentences[i];
                const span = document.createElement('span');
                span.className = 'rd-s';
                span.dataset.i = String(i);
                span.appendChild(C.renderTokens(sen.tokens, state.ctx));
                p.appendChild(span);
                if (trl && trl.sentences[i]) {
                    const tr = document.createElement('span');
                    tr.className = 'rd-tr';
                    tr.textContent = trl.sentences[i];
                    p.appendChild(tr);
                }
            }
            box.appendChild(p);
        }
        renderFuriBtn();
        box.classList.toggle('rd-text--tr', state.showTr);
        renderHead();
        el('rd-src').innerHTML = esc(C.tr('news.adapted').replace('{source}', s.source.name)) +
            ' <a href="' + esc(s.source.url) + '" target="_blank" rel="noopener">' + esc(C.tr('news.source')) + ' ↗</a>';
    }

    // ---------- Тапы по тексту ----------
    function onTextClick(ev) {
        const tok = ev.target.closest('.ntok--learnable');
        if (tok) { openWord(tok); return; }
        const sen = ev.target.closest('.rd-s');
        if (sen) activate(Number(sen.dataset.i));
    }

    function activate(i) {
        const box = el('rd-text');
        const prev = box.querySelector('.rd-s.is-active');
        if (prev) prev.classList.remove('is-active');
        const bar = el('rd-sbar');
        if (state.active === i) { state.active = -1; bar.hidden = true; return; }
        state.active = i;
        const sen = box.querySelector('.rd-s[data-i="' + i + '"]');
        if (!sen) return;
        sen.classList.add('is-active');
        // Панель предложения — сразу под ним
        sen.insertAdjacentElement('afterend', bar);
        bar.hidden = false;
        const trl = trLevel();
        const trEl = bar.querySelector('.rd-sbar__tr');
        trEl.textContent = trl && trl.sentences[i] ? trl.sentences[i] : '';
        trEl.hidden = state.showTr || !trEl.textContent;
    }

    function activeSentence() {
        return state.active >= 0 ? lv().sentences[state.active] : null;
    }

    // ---------- Озвучка ----------
    let utterQueue = [];
    function stopSpeaking() {
        state.speaking = false;
        utterQueue = [];
        if (window.speechSynthesis) speechSynthesis.cancel();
        const box = el('rd-text');
        box.querySelectorAll('.rd-s.is-speaking').forEach((n) => n.classList.remove('is-speaking'));
        el('rd-listen').textContent = '▶ ' + C.tr('news.listen');
    }
    function speakFrom(i) {
        if (!window.speechSynthesis) return;
        stopSpeaking();
        state.speaking = true;
        el('rd-listen').textContent = '■ ' + C.tr('news.stop');
        const sentences = lv().sentences;
        const box = el('rd-text');
        const step = (k) => {
            if (!state.speaking || k >= sentences.length) { stopSpeaking(); return; }
            box.querySelectorAll('.rd-s.is-speaking').forEach((n) => n.classList.remove('is-speaking'));
            const node = box.querySelector('.rd-s[data-i="' + k + '"]');
            if (node) { node.classList.add('is-speaking'); node.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
            const u = new SpeechSynthesisUtterance(sentences[k].text);
            u.lang = 'ja-JP';
            const v = speechSynthesis.getVoices().find((x) => /^ja/i.test(x.lang));
            if (v) u.voice = v;
            u.rate = state.level === 'easy' ? 0.85 : 0.95;
            u.onend = () => step(k + 1);
            u.onerror = () => stopSpeaking();
            speechSynthesis.speak(u);
        };
        step(i);
    }

    // ---------- Карточка слова ----------
    let wordLayer = null;
    function openWord(tokEl) {
        const base = tokEl.dataset.b;
        const sen = tokEl.closest('.rd-s');
        const sentence = sen ? lv().sentences[Number(sen.dataset.i)].text : lv().title.text;
        const tok = findToken(base, sen ? Number(sen.dataset.i) : -1);
        const overlay = el('rd-word');
        const sheet = overlay.querySelector('.news-sheet');
        sheet.querySelector('.news-sheet__word').textContent = base;
        const rd = tok ? (tok.br || tok.r) : '';
        sheet.querySelector('.news-sheet__reading').textContent = rd && rd !== base && hiragana(base) !== rd ? rd : '';
        sheet.querySelector('.news-sheet__sentence').textContent = sentence;
        const body = sheet.querySelector('.news-sheet__body');
        body.innerHTML = '<div class="news-sheet__loading">' + esc(C.tr('popup.searching')) + '</div>';
        const saveBtn = sheet.querySelector('.news-sheet__save');
        const knownBtn = sheet.querySelector('.news-sheet__known');
        const already = state.ctx.saved.has(base);
        saveBtn.disabled = already;
        saveBtn.textContent = already ? C.tr('popup.saved') : '★ ' + C.tr('popup.save');
        knownBtn.hidden = state.ctx.known.has(base);
        sheet.querySelector('.news-sheet__speak').onclick = () => { if (window.speakJa) speakJa(base); };

        let dict = null;
        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = C.tr('popup.saving');
            try {
                const translation = dict ? (shortTranslation(dict, 2) || '') : '';
                await saveWord({
                    kanji: base,
                    kana: (dict && dict.reading) || (tok && (tok.br || tok.r)) || base,
                    romaji: '',
                    translation,
                    sentence,
                    sentenceTranslation: sentenceTranslationOf(sen),
                    hint: '',
                    videoStart: 0, videoEnd: 0, videoUrl: '',
                });
                state.ctx.saved.add(base);
                document.querySelectorAll('.ntok--learnable[data-b="' + CSS.escape(base) + '"]').forEach((n) => n.classList.add('ntok--saved'));
                saveBtn.textContent = C.tr('popup.saved');
                if (typeof showSnackbar === 'function') showSnackbar(C.tr('popup.savedSnack'), { type: 'success' });
                if (typeof animeiTrack === 'function') animeiTrack('news_word_saved', { word: base });
            } catch (err) {
                saveBtn.disabled = false;
                saveBtn.textContent = '★ ' + C.tr('popup.save');
                if (typeof showSnackbar === 'function') showSnackbar(C.tr('popup.saveError'), { type: 'error' });
            }
        };
        knownBtn.onclick = () => {
            if (window.KnownWords) KnownWords.addMany([base]);
            state.ctx.known.add(base);
            document.querySelectorAll('.ntok--learnable[data-b="' + CSS.escape(base) + '"]').forEach((n) => n.classList.add('ntok--known'));
            knownBtn.hidden = true;
            if (typeof showSnackbar === 'function') showSnackbar(C.tr('popup.knownAdded'), { type: 'success' });
        };

        overlay.hidden = false;
        wordLayer = modalLayer(overlay, { onHide: () => { overlay.classList.remove('is-open'); setTimeout(() => { overlay.hidden = true; }, 180); } });
        wordLayer.open();

        client.get('dictionary', { params: { q: base, lang: C.lang() }, silentErrors: true })
            .then(({ data: res }) => {
                const entries = res.data || [];
                dict = entries[0] || null;
                body.innerHTML = '';
                if (!dict) { body.innerHTML = '<div class="news-sheet__loading">' + esc(C.tr('popup.notFound')) + '</div>'; return; }
                if (dict.reading && dict.reading !== base && hiragana(base) !== dict.reading) sheet.querySelector('.news-sheet__reading').textContent = dict.reading;
                const main = shortTranslation(dict, 1) || (dict.senses[0] && dict.senses[0].definitions[0]) || '';
                if (main) body.innerHTML += '<div class="news-sheet__main">' + esc(main) + '</div>';
                const rest = (dict.senses || []).slice(1).map((s) => shortTranslation({ senses: [s] }, 1)).filter((d) => d && d !== main);
                const uniq = rest.filter((d, i) => rest.indexOf(d) === i).slice(0, 3);
                if (uniq.length) body.innerHTML += '<div class="news-sheet__more">' + esc(uniq.join(' · ')) + '</div>';
                const meta = [];
                if (dict.isCommon) meta.push(C.tr('popup.common'));
                if (dict.jlpt && dict.jlpt.length) meta.push(dict.jlpt[0].toUpperCase().replace('JLPT-', 'JLPT '));
                else if (tok && tok.j) meta.push('JLPT N' + tok.j);
                if (meta.length) body.innerHTML += '<div class="news-sheet__meta">' + esc(meta.join(' · ')) + '</div>';
            })
            .catch(() => {
                body.innerHTML = '<div class="news-sheet__loading">' + esc(C.tr('popup.noResponse')) + '</div>';
            });
    }

    function hiragana(str) {
        return String(str || '').replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    }

    function findToken(base, si) {
        const L = lv();
        const lists = si >= 0 ? [L.sentences[si].tokens] : [L.title.tokens];
        for (const toks of lists) for (const tk of toks) if (tk.b === base) return tk;
        for (const sen of L.sentences) for (const tk of sen.tokens) if (tk.b === base) return tk;
        return null;
    }
    function sentenceTranslationOf(sen) {
        const trl = trLevel();
        if (!sen || !trl) return '';
        return trl.sentences[Number(sen.dataset.i)] || '';
    }

    // ---------- ИИ-разбор предложения ----------
    let explainLayer = null;
    async function openExplain() {
        const sen = activeSentence();
        if (!sen) return;
        const overlay = el('rd-explain');
        const body = overlay.querySelector('.explain-modal__body');
        overlay.querySelector('.explain-modal__title').textContent = C.tr('words.explain');
        body.innerHTML = '<div class="news-sheet__loading">' + esc(C.tr('popup.explaining')) + '</div>';
        overlay.hidden = false;
        explainLayer = modalLayer(overlay, { onHide: () => { overlay.classList.remove('is-open'); setTimeout(() => { overlay.hidden = true; }, 180); } });
        explainLayer.open();
        const key = C.lang() + '|' + sen.text;
        try {
            let data = state.explainCache.get(key);
            if (!data) {
                const i = state.active;
                const around = lv().sentences.slice(Math.max(0, i - 1), i + 2).map((s) => s.text).join('');
                const { data: res } = await client.get('explain', { params: { sentence: sen.text, context: around, lang: C.lang() }, silentErrors: true });
                data = res.data.explanation;
                state.explainCache.set(key, data);
            }
            renderExplain(body, data);
        } catch (err) {
            const limited = err && err.response && (err.response.status === 429 || err.response.status === 503);
            body.innerHTML = '<div class="news-sheet__loading">' + esc(C.tr(limited ? 'popup.explainLimited' : 'popup.explainError')) + '</div>';
        }
    }

    function renderExplain(out, data) {
        out.innerHTML = '';
        const section = (title, node) => {
            const s = document.createElement('div');
            s.className = 'explain__section';
            s.innerHTML = '<div class="explain__title">' + esc(title) + '</div>';
            s.appendChild(node);
            out.appendChild(s);
        };
        if (data.translation) {
            const p = document.createElement('div');
            p.className = 'explain__translation';
            p.textContent = data.translation;
            section(C.tr('explain.translation'), p);
        }
        if (data.breakdown && data.breakdown.length) {
            const list = document.createElement('div');
            for (const b of data.breakdown) {
                const row = document.createElement('div');
                row.className = 'explain__part';
                row.innerHTML = '<span class="explain__jp">' + esc(b.part) + '</span>' +
                    (b.reading && b.reading !== b.part ? '<span class="explain__reading"> ' + esc(b.reading) + '</span>' : '') +
                    '<div class="explain__meaning">' + esc(b.meaning) + '</div>';
                list.appendChild(row);
            }
            section(C.tr('explain.parts'), list);
        }
        if (data.grammar && data.grammar.length) {
            const list = document.createElement('div');
            for (const g of data.grammar) {
                const row = document.createElement('div');
                row.className = 'explain__part';
                row.innerHTML = '<span class="explain__jp">' + esc(g.point) + '</span><div class="explain__meaning">' + esc(g.explanation) + '</div>';
                list.appendChild(row);
            }
            section(C.tr('explain.grammar'), list);
        }
    }

    // ---------- Проверка понимания ----------
    function renderQuiz(show) {
        const box = el('rd-quiz');
        box.hidden = !show;
        if (!show) return;
        const qs = (state.story.questions[state.level] || []);
        const lang = C.lang();
        box.innerHTML = '<h2 class="rd-h2">' + esc(C.tr('news.q.title')) + '</h2>';
        qs.forEach((q, qi) => {
            const card = document.createElement('div');
            card.className = 'rd-q';
            const tr = q.tr && (q.tr.q || q.tr.options) ? q.tr : null;
            card.innerHTML = '<div class="rd-q__n">' + esc(C.tr('news.q.of').replace('{i}', qi + 1).replace('{n}', qs.length)) + '</div>' +
                '<div class="rd-q__text">' + esc(q.q) + '</div>' +
                (tr && tr.q && state.level === 'easy' ? '<div class="rd-q__tr">' + esc(tr.q) + '</div>' : '');
            const opts = document.createElement('div');
            opts.className = 'rd-q__opts';
            q.options.forEach((o, oi) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'rd-q__opt';
                b.innerHTML = '<span class="rd-q__ja">' + esc(o) + '</span>' +
                    (tr && tr.options && tr.options[oi] && state.level === 'easy' ? '<span class="rd-q__optr">' + esc(tr.options[oi]) + '</span>' : '');
                b.addEventListener('click', () => answer(qi, oi, card));
                opts.appendChild(b);
            });
            card.appendChild(opts);
            const fb = document.createElement('div');
            fb.className = 'rd-q__fb';
            card.appendChild(fb);
            box.appendChild(card);
        });
        const done = document.createElement('div');
        done.id = 'rd-quiz-done';
        done.hidden = true;
        box.appendChild(done);
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function answer(qi, oi, card) {
        if (state.answers[qi] != null) return;
        state.answers[qi] = oi;
        const q = state.story.questions[state.level][qi];
        const opts = card.querySelectorAll('.rd-q__opt');
        opts.forEach((b, k) => {
            b.disabled = true;
            if (k === q.answer) b.classList.add('is-right');
            else if (k === oi) b.classList.add('is-wrong');
        });
        const fb = card.querySelector('.rd-q__fb');
        const tr = q.tr && q.tr.options ? q.tr.options[q.answer] : '';
        fb.textContent = oi === q.answer ? C.tr('news.q.correct') : C.tr('news.q.wrong') + q.options[q.answer] + (tr ? ' — ' + tr : '');
        fb.classList.add(oi === q.answer ? 'is-right' : 'is-wrong');
        const qs = state.story.questions[state.level];
        if (Object.keys(state.answers).length >= qs.length) finishQuiz();
    }

    function finishQuiz() {
        const qs = state.story.questions[state.level];
        const score = qs.filter((q, i) => state.answers[i] === q.answer).length;
        const box = el('rd-quiz-done');
        box.hidden = false;
        box.innerHTML = '<div class="rd-result">' + esc(C.tr('news.q.result').replace('{score}', score).replace('{n}', qs.length)) + '</div>' +
            '<h2 class="rd-h2">' + esc(C.tr('news.vocab.title')) + '</h2><div class="rd-vocab" id="rd-vocab"></div>' +
            '<button type="button" class="btn btn--primary btn--block rd-finish" id="rd-finish">' + esc(C.tr('news.finish')) + '</button>';
        renderVocab(el('rd-vocab'));
        el('rd-finish').addEventListener('click', () => finishStory(score, qs.length));
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (typeof animeiTrack === 'function') animeiTrack('news_quiz', { id: state.story.id, level: state.level, score, total: qs.length });
    }

    function renderVocab(box) {
        box.innerHTML = '';
        for (const v of state.story.vocab || []) {
            const row = document.createElement('div');
            row.className = 'rd-vocab__row';
            const saved = state.ctx.saved.has(v.word);
            row.innerHTML = '<div class="rd-vocab__w"><span class="rd-vocab__ja">' + esc(v.word) + '</span>' +
                (v.reading && v.reading !== v.word ? '<span class="rd-vocab__r">' + esc(v.reading) + '</span>' : '') + '</div>' +
                '<div class="rd-vocab__g">' + esc(v.gloss || '') + (v.level && /^N\d$/.test(v.level) ? ' <i>' + esc(v.level) + '</i>' : '') + '</div>' +
                '<button type="button" class="rd-vocab__add' + (saved ? ' is-on' : '') + '"' + (saved ? ' disabled' : '') + '>' + (saved ? '✓' : '★') + '</button>';
            row.querySelector('.rd-vocab__add').addEventListener('click', async (ev) => {
                const b = ev.currentTarget;
                b.disabled = true;
                try {
                    const example = findExample(v.word);
                    await saveWord({
                        kanji: v.word, kana: v.reading || v.word, romaji: '', translation: v.gloss || '',
                        sentence: example.text, sentenceTranslation: example.tr, hint: '', videoStart: 0, videoEnd: 0, videoUrl: '',
                    });
                    state.ctx.saved.add(v.word);
                    b.textContent = '✓'; b.classList.add('is-on');
                } catch (e) {
                    b.disabled = false;
                    if (typeof showSnackbar === 'function') showSnackbar(C.tr('popup.saveError'), { type: 'error' });
                }
            });
            box.appendChild(row);
        }
    }

    function findExample(word) {
        const L = lv();
        const trl = trLevel();
        for (let i = 0; i < L.sentences.length; i++) {
            if (L.sentences[i].text.includes(word) || L.sentences[i].tokens.some((tk) => tk.b === word)) {
                return { text: L.sentences[i].text, tr: trl ? trl.sentences[i] || '' : '' };
            }
        }
        return { text: '', tr: '' };
    }

    function finishStory(score, total) {
        C.markDone(state.story.id, { level: state.level, score, total });
        if (typeof showSnackbar === 'function') showSnackbar(C.tr('news.finished'), { type: 'success' });
        if (typeof animeiTrack === 'function') animeiTrack('news_done', { id: state.story.id, level: state.level });
        location.href = './news.html' + (state.story.date ? '?date=' + state.story.date : '');
    }

    // ---------- Инициализация ----------
    async function init() {
        try {
            await load();
        } catch (err) {
            el('rd-text').innerHTML = '<div class="news-empty">' + esc(C.tr('news.loadError')) + '</div>';
            return;
        }
        document.title = state.story.levels[state.level].title.text + ' — Animei';
        el('rd-back').href = './news.html' + (state.story.date ? '?date=' + state.story.date : '');
        renderLevelSeg();
        renderText();
        el('rd-text').addEventListener('click', onTextClick);
        el('rd-title').addEventListener('click', onTextClick);
        el('rd-furi').addEventListener('click', cycleFuri);
        el('rd-tr').addEventListener('click', () => {
            state.showTr = !state.showTr;
            el('rd-text').classList.toggle('rd-text--tr', state.showTr);
            el('rd-tr').classList.toggle('is-on', state.showTr);
            const trEl = el('rd-sbar').querySelector('.rd-sbar__tr');
            trEl.hidden = state.showTr || !trEl.textContent;
        });
        el('rd-listen').addEventListener('click', () => { if (state.speaking) stopSpeaking(); else speakFrom(0); });
        if (!window.speechSynthesis) el('rd-listen').hidden = true;
        el('rd-check').addEventListener('click', () => { stopSpeaking(); renderQuiz(true); });
        const bar = el('rd-sbar');
        bar.querySelector('.rd-sbar__speak').addEventListener('click', () => { const s = activeSentence(); if (s && window.speakJa) speakJa(s.text); });
        bar.querySelector('.rd-sbar__explain').addEventListener('click', openExplain);
        el('rd-word').querySelector('.news-sheet__x').addEventListener('click', () => wordLayer && wordLayer.close());
        el('rd-explain').querySelector('.explain-modal__close').addEventListener('click', () => explainLayer && explainLayer.close());
        if (!(await aiOn())) bar.querySelector('.rd-sbar__explain').hidden = true;
        if (typeof animeiTrack === 'function') animeiTrack('news_story', { id: state.story.id, level: state.level });
    }

    async function aiOn() {
        try { const { data: res } = await client.get('explain/status', { silentErrors: true }); return !!(res.data && res.data.available); }
        catch (e) { return false; }
    }

    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('pagehide', stopSpeaking);
})();
