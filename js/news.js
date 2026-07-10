// JP News — читалка новостей NHK для изучения японского.
// Список статей с оценкой сложности (JLPT) и персональным «сколько слов ты уже
// знаешь» (i+1); ридер с фуриганой, клик-словарём, сохранением в коллекцию и
// озвучкой. Логика фуриганы и попапа повторяет плеер (js/player.js).
//
// Зависит от: axiosClient.js (client), i18n.js (t, getLang), words-store.js
// (fetchWords, saveWord), speech.js (canSpeakJa, speakJa), snackbar.js.

const catsEl = document.getElementById('news-cats');
const gridEl = document.getElementById('news-grid');
const statusEl = document.getElementById('news-status');
const newsEl = document.getElementById('news');
const readerEl = document.getElementById('news-reader');
const rTitle = document.getElementById('news-reader-title');
const rTitleRu = document.getElementById('news-reader-title-ru');
const rMeta = document.getElementById('news-reader-meta');
const rBody = document.getElementById('news-reader-body');

const popup = document.getElementById('word-popup');
const popupWord = document.getElementById('popup-word');
const popupReading = document.getElementById('popup-reading');
const popupReadingText = document.getElementById('popup-reading-text');
const popupBody = document.getElementById('popup-body');
const popupSentence = document.getElementById('popup-sentence');
const popupSave = document.getElementById('popup-save');

const state = {
    category: '0',
    categories: [],
    items: [],
    knownWords: new Set(),
    furigana: localStorage.getItem('animei:furigana') !== 'off',
    showRu: true,
    popupContext: null,
};

// ---------- Известные слова (для подсветки и «% знакомых») ----------

async function loadKnownWords() {
    try {
        const words = await fetchWords();
        for (const w of words) if (w.kanji) state.knownWords.add(w.kanji);
    } catch { /* нет слов — просто без подсветки */ }
}

// ---------- Фуригана (как в плеере) ----------

const KANJI_RE = /[一-龯㐀-䶵々〆ヶ]/;
function isKanaChar(ch) {
    const c = ch.charCodeAt(0);
    return (c >= 0x3041 && c <= 0x3096) || (c >= 0x30a1 && c <= 0x30fa) || ch === 'ー';
}
function furiganaSegments(surface, reading) {
    if (!surface || !reading || !KANJI_RE.test(surface) || surface === reading) {
        return [{ text: surface, rt: null }];
    }
    let s = surface, r = reading, head = '', tail = '';
    while (s.length && r.length && isKanaChar(s[0]) && s[0] === r[0]) {
        head += s[0]; s = s.slice(1); r = r.slice(1);
    }
    while (s.length && r.length && isKanaChar(s[s.length - 1]) && s[s.length - 1] === r[r.length - 1]) {
        tail = s[s.length - 1] + tail; s = s.slice(0, -1); r = r.slice(0, -1);
    }
    const segs = [];
    if (head) segs.push({ text: head, rt: null });
    if (s) segs.push({ text: s, rt: r || null });
    if (tail) segs.push({ text: tail, rt: null });
    return segs.length ? segs : [{ text: surface, rt: null }];
}
function appendWithFurigana(el, surface, reading) {
    for (const seg of furiganaSegments(surface, reading)) {
        if (seg.rt) {
            const ruby = document.createElement('ruby');
            ruby.append(seg.text);
            const rt = document.createElement('rt');
            rt.textContent = seg.rt;
            ruby.appendChild(rt);
            el.appendChild(ruby);
        } else {
            el.append(seg.text);
        }
    }
}

// ---------- Мелкие помощники ----------

function localeTag() {
    return { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US' }[getLang()] || 'ru-RU';
}
function fmtDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString(localeTag(), {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        });
    } catch { return ''; }
}
function catLabel(id) {
    const key = 'news.cat.' + id;
    const label = t(key);
    if (label && label !== key) return label;
    const c = state.categories.find((x) => x.id === id);
    return c ? c.label : id;
}
function knownRatio(vocab) {
    if (!vocab || !vocab.length || !state.knownWords.size) return null;
    let k = 0;
    for (const b of vocab) if (state.knownWords.has(b)) k++;
    return k / vocab.length;
}

const JLPT_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1', 'none'];
function jlptBar(counts) {
    const total = JLPT_ORDER.reduce((s, k) => s + (counts[k] || 0), 0);
    const bar = document.createElement('div');
    bar.className = 'jlpt-bar';
    if (!total) return bar;
    for (const k of JLPT_ORDER) {
        const n = counts[k] || 0;
        if (!n) continue;
        const seg = document.createElement('span');
        seg.className = 'jlpt-' + k;
        seg.style.width = (n / total * 100) + '%';
        seg.title = k === 'none' ? t('news.advanced') : k;
        bar.appendChild(seg);
    }
    return bar;
}
function jlptBadge(level) {
    const span = document.createElement('span');
    span.className = 'jlpt-badge jlpt-' + (level || 'none');
    span.textContent = level || '—';
    return span;
}

// ---------- Категории ----------

function renderCats() {
    catsEl.innerHTML = '';
    const list = state.categories.length ? state.categories : [{ id: state.category }];
    for (const c of list) {
        const btn = document.createElement('button');
        btn.className = 'news-cat' + (c.id === state.category ? ' is-active' : '');
        btn.textContent = catLabel(c.id);
        btn.addEventListener('click', () => { if (c.id !== state.category) loadList(c.id); });
        catsEl.appendChild(btn);
    }
}

// ---------- Список ----------

function showStatus(key) {
    statusEl.textContent = t(key);
    statusEl.style.display = '';
    gridEl.innerHTML = '';
}
function skeletons(n = 6) {
    gridEl.innerHTML = Array.from({ length: n }, () => '<div class="news-skel"></div>').join('');
    statusEl.style.display = 'none';
}

async function loadList(category) {
    state.category = category;
    newsEl.classList.remove('is-reading');
    renderCats();
    skeletons();
    try {
        const { data: res } = await client.get('news/list', { params: { category } });
        state.items = res.data.items || [];
        state.categories = res.data.categories || state.categories;
        renderCats();
        if (!state.items.length) { showStatus('news.empty'); return; }
        renderList();
    } catch (err) {
        console.error(err);
        showStatus('news.error');
    }
}

function renderList() {
    statusEl.style.display = 'none';
    gridEl.innerHTML = '';

    for (const it of state.items) {
        const card = document.createElement('button');
        card.className = 'news-card';
        card.type = 'button';

        const top = document.createElement('div');
        top.className = 'news-card__top';
        const cat = document.createElement('span');
        cat.textContent = catLabel(it.category);
        const date = document.createElement('span');
        date.className = 'news-card__date';
        date.textContent = fmtDate(it.date);
        top.append(cat, date);

        const title = document.createElement('div');
        title.className = 'news-card__title';
        title.textContent = it.title;

        const summary = document.createElement('div');
        summary.className = 'news-card__summary';
        summary.textContent = it.summary || '';

        const foot = document.createElement('div');
        foot.className = 'news-card__foot';
        const diff = it.difficulty || {};
        if (diff.level) foot.appendChild(jlptBadge(diff.level));
        foot.appendChild(jlptBar(diff.counts || {}));

        const ratio = knownRatio(it.vocab);
        if (ratio !== null) {
            const known = document.createElement('span');
            known.className = 'news-known';
            known.innerHTML = t('news.youKnow') + ' <b>' + Math.round(ratio * 100) + '%</b>';
            foot.appendChild(known);
            // «в самый раз»: знаешь большинство, но не всё — комфортное i+1
            if ((it.vocab || []).length >= 6 && ratio >= 0.6 && ratio <= 0.94) {
                const fit = document.createElement('span');
                fit.className = 'news-fit';
                fit.textContent = t('news.fit');
                foot.appendChild(fit);
            }
        }

        card.append(top, title, summary, foot);
        card.addEventListener('click', () => openArticle(it.id));
        gridEl.appendChild(card);
    }
}

// ---------- Ридер ----------

function renderTokens(container, tokens, sentenceText, sentenceRu) {
    if (!tokens || !tokens.length) {
        container.append(sentenceText || '');
        return;
    }
    for (const tok of tokens) {
        const span = document.createElement('span');
        appendWithFurigana(span, tok.surface, tok.reading);
        span.className = 'tok';
        if (tok.learnable) {
            span.classList.add('tok--learnable');
            span.dataset.base = tok.base || tok.surface;
            if (state.knownWords.has(tok.base) || state.knownWords.has(tok.surface)) {
                span.classList.add('tok--known');
            }
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                openWordPopup(tok, sentenceText, sentenceRu, e);
            });
        }
        container.appendChild(span);
    }
}

function speakButton(text) {
    if (!window.canSpeakJa || !canSpeakJa()) return null;
    const btn = document.createElement('button');
    btn.className = 'news-speak';
    btn.type = 'button';
    btn.title = t('news.listen');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>';
    btn.addEventListener('click', () => speakJa(text));
    return btn;
}

async function openArticle(id) {
    newsEl.classList.add('is-reading');
    window.scrollTo(0, 0);
    rTitle.textContent = '';
    rTitleRu.textContent = '';
    rMeta.textContent = '';
    rBody.innerHTML = '<div class="news-status">' + t('news.loadingArticle') + '</div>';

    try {
        const { data: res } = await client.get('news/article', { params: { id, translate: 'ru' } });
        renderArticle(res.data);
        if (window.animeiTrack) window.animeiTrack('news_read', res.data.title?.text || id);
    } catch (err) {
        console.error(err);
        rBody.innerHTML = '<div class="news-status">' + t('news.error') + '</div>';
    }
}

function renderArticle(a) {
    // Заголовок
    rTitle.innerHTML = '';
    renderTokens(rTitle, a.title.tokens, a.title.text, a.title.translation);
    rTitleRu.textContent = a.title.translation || '';

    // Мета: дата, уровень, полоска, ссылка на источник
    rMeta.innerHTML = '';
    const date = document.createElement('span');
    date.textContent = fmtDate(a.date);
    rMeta.appendChild(date);
    const diff = a.difficulty || {};
    if (diff.level) rMeta.appendChild(jlptBadge(diff.level));
    rMeta.appendChild(jlptBar(diff.counts || {}));
    const ratio = knownRatio(a.vocab);
    if (ratio !== null) {
        const known = document.createElement('span');
        known.className = 'news-known';
        known.innerHTML = t('news.youKnow') + ' <b>' + Math.round(ratio * 100) + '%</b>';
        rMeta.appendChild(known);
    }
    if (a.link) {
        const src = document.createElement('a');
        src.href = a.link;
        src.target = '_blank';
        src.rel = 'noopener';
        src.textContent = 'NHK ↗';
        rMeta.appendChild(src);
    }

    // Тело: предложения
    rBody.innerHTML = '';
    for (const s of a.sentences) {
        const wrap = document.createElement('div');
        wrap.className = 'news-sentence';

        const jp = document.createElement('div');
        jp.className = 'news-sentence__jp';
        const spk = speakButton(s.text);
        if (spk) jp.appendChild(spk);
        renderTokens(jp, s.tokens, s.text, s.translation);

        const ru = document.createElement('div');
        ru.className = 'news-sentence__ru';
        ru.textContent = s.translation || '';

        wrap.append(jp, ru);
        rBody.appendChild(wrap);
    }
    applyReaderPrefs();
}

function applyReaderPrefs() {
    newsEl.classList.toggle('no-furigana', !state.furigana);
    document.getElementById('news-furigana').classList.toggle('is-active', state.furigana);
    document.getElementById('news-ru').classList.toggle('is-active', state.showRu);
    rBody.querySelectorAll('.news-sentence__ru').forEach((el) => {
        el.classList.toggle('is-hidden', !state.showRu);
    });
}

// ---------- Попап словаря ----------

function positionPopup(event) {
    if (window.matchMedia('(max-width: 640px)').matches) {
        popup.classList.add('word-popup--sheet');
        popup.style.left = '';
        popup.style.top = '';
        return;
    }
    popup.classList.remove('word-popup--sheet');
    const pad = 12;
    const header = document.querySelector('.header');
    const topLimit = Math.max(0, header ? header.getBoundingClientRect().bottom : 0) + pad;
    const rect = popup.getBoundingClientRect();
    let x = (event?.clientX ?? window.innerWidth / 2) + 14;
    let y = (event?.clientY ?? window.innerHeight / 2) + 14;
    if (x + rect.width + pad > window.innerWidth) x = window.innerWidth - rect.width - pad;
    if (y + rect.height + pad > window.innerHeight) y = window.innerHeight - rect.height - pad;
    x = Math.max(pad, x);
    y = Math.max(topLimit, y);
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
}

async function openWordPopup(tok, sentenceText, sentenceRu, event) {
    state.popupContext = { tok, sentence: sentenceText, sentenceRu: sentenceRu || '', dict: null };

    popupWord.textContent = tok.base || tok.surface;
    popupReadingText.textContent = tok.reading || '';
    // Значок уровня JLPT слова (из нашего словаря разметки)
    popupReading.querySelectorAll('.jlpt-badge').forEach((el) => el.remove());
    if (tok.jlpt) popupReading.appendChild(jlptBadge(tok.jlpt));

    popupSentence.textContent = sentenceText || '';
    popupBody.innerHTML = '<div class="dict-loading">' + t('popup.searching') + '</div>';
    popupSave.disabled = false;
    popupSave.textContent = t('popup.save');

    popup.hidden = false;
    positionPopup(event);

    try {
        const { data: res } = await client.get('dictionary', { params: { q: tok.base || tok.surface } });
        const entries = res.data || [];
        if (!entries.length) {
            popupBody.innerHTML = '<div class="dict-loading">' + t('popup.notFound') + '</div>';
            return;
        }
        state.popupContext.dict = entries[0];

        popupBody.innerHTML = '';
        for (const sense of entries[0].senses) {
            const div = document.createElement('div');
            div.className = 'sense';
            const pos = document.createElement('div');
            pos.className = 'sense__pos';
            pos.textContent = (sense.pos || []).join(', ');
            const defs = document.createElement('div');
            defs.textContent = (sense.definitions || []).join('; ');
            div.append(pos, defs);
            popupBody.appendChild(div);
        }
        // Уровень из словаря, если у токена его не было
        if (!tok.jlpt && entries[0].jlpt?.length) {
            popupReading.appendChild(jlptBadge(entries[0].jlpt[0].toUpperCase()));
        }
    } catch (err) {
        console.error(err);
        popupBody.innerHTML = '<div class="dict-loading">' + t('popup.noResponse') + '</div>';
    }
}

popupSave.addEventListener('click', async () => {
    const ctx = state.popupContext;
    if (!ctx) return;
    popupSave.disabled = true;
    popupSave.textContent = t('popup.saving');
    try {
        const dict = ctx.dict;
        let translation = '';
        if (dict) {
            const all = dict.senses.flatMap((s) => s.definitions || []);
            const clean = all.filter((d) => !/\(/.test(d));
            const qualified = all.filter((d) => /\(/.test(d)).map((d) => d.replace(/\s*\([^)]*\)/g, '').trim());
            translation = [...new Set([...clean, ...qualified].filter(Boolean))].slice(0, 2).join('; ');
        }
        await saveWord({
            kanji: ctx.tok.base || ctx.tok.surface,
            kana: dict?.reading || ctx.tok.reading || '',
            romaji: '',
            translation,
            sentence: ctx.sentence || '',
            sentenceTranslation: ctx.sentenceRu || '',
            videoStart: 0,
            videoEnd: 0,
            videoUrl: '',
            hint: '',
        });
        const base = ctx.tok.base || ctx.tok.surface;
        state.knownWords.add(base);
        // Подсветить это слово везде на странице
        document.querySelectorAll('.tok--learnable').forEach((el) => {
            if (el.dataset.base === base) el.classList.add('tok--known');
        });
        if (window.animeiTrack) window.animeiTrack('save_word', base);
        popupSave.textContent = t('popup.saved');
        if (window.showSnackbar) showSnackbar(t('popup.savedSnack'), { duration: 3000 });
    } catch (err) {
        console.error(err);
        popupSave.disabled = false;
        popupSave.textContent = t('popup.save');
        if (window.showSnackbar) showSnackbar(t('popup.saveError'), { duration: 3500, type: 'error' });
    }
});

document.getElementById('popup-close').addEventListener('click', () => { popup.hidden = true; });
document.addEventListener('click', (e) => {
    if (!popup.hidden && !popup.contains(e.target) && !e.target.classList.contains('tok--learnable')) {
        popup.hidden = true;
    }
});

// ---------- Настройки ридера ----------

document.getElementById('news-furigana').addEventListener('click', () => {
    state.furigana = !state.furigana;
    localStorage.setItem('animei:furigana', state.furigana ? 'on' : 'off');
    applyReaderPrefs();
});
document.getElementById('news-ru').addEventListener('click', () => {
    state.showRu = !state.showRu;
    applyReaderPrefs();
});
document.getElementById('news-back').addEventListener('click', () => {
    newsEl.classList.remove('is-reading');
});

// ---------- Старт ----------

(async function init() {
    await loadKnownWords();
    loadList('0');
    // Прямая ссылка на статью (?id=…) — сразу открываем ридер.
    const deepId = new URLSearchParams(window.location.search).get('id');
    if (deepId) openArticle(deepId);
})();
