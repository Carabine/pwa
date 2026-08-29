// «Из любимого аниме» на странице новичка: после выбора тайтла (поиск в
// beginner-study.js → BeginnerDeck.open) сканируем субтитры первых серий,
// отбираем простые слова по JLPT (дефолт N5, переключается), показываем список
// с галочками — «Создать колоду» сохраняет слова в словарь и складывает в
// новую колоду. Плеер НЕ открывается: видеопоток серии для нарезки клипа
// резолвится напрямую (catalog/stream), сдвиг сабов — серверным
// subtitles/align (у него кэш по seriesKey, как в плеере).
//
// Подключается после: i18n.js (t), axiosClient (client), words-store
// (saveWord, shortTranslation), decks-store (Decks), snackbar, app.js.
window.BeginnerDeck = (function () {
    'use strict';

    const SCAN_MAX = 6;       // сколько первых серий сканируем
    const MAX_WORDS = 50;
    const DICT_POOL = 4;
    const SAVE_POOL = 3;

    // Отбор — как в авто-колоде плеера (js/episode-deck.js).
    const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '副詞']);
    const KANJI = /[一-龯]/;
    const STOPLIST = new Set([
        'する', 'ある', 'いる', 'なる', 'いう', '言う', 'やる', 'できる', 'ない',
        'こと', '事', 'もの', '物', 'よう', 'ん', 'の',
        'これ', 'それ', 'あれ', 'どれ', 'ここ', 'そこ', 'あそこ', 'どこ',
        'こう', 'そう', 'ああ', 'どう', 'こんな', 'そんな', 'あんな', 'どんな',
        '何', 'なに', 'なん', 'だれ', '誰', 'いつ', 'なぜ', 'どうして',
        'ください', '下さい', 'いただく', '頂く', 'くれる', 'もらう', '貰う',
    ]);

    let jlptMap = null;
    function loadJlpt() {
        if (jlptMap) return Promise.resolve(jlptMap);
        return fetch('../data/jlpt-n5n4.json')
            .then((r) => { if (!r.ok) throw new Error('jlpt ' + r.status); return r.json(); })
            .then((data) => { jlptMap = data; return data; });
    }

    function apiOrigin() {
        return window.ANIMEI_ORIGIN || location.origin;
    }

    // ---------- Состояние открытой панели ----------
    let panel = null;
    let anime = null;         // выбранный тайтл из поиска
    let level = '5';          // '5' | '54' | '4' — дефолт N5 (фича для новичка)
    let candidates = [];
    let cueSets = null;       // [{ep, epNumber, cues, videoUrl?, offset?, ready?}]
    let scanning = false;
    let creating = false;
    let scanToken = 0;

    const levelAllows = (lvl) => (level === '54' ? lvl === 5 || lvl === 4 : lvl === Number(level));

    // ---------- Скан серий ----------

    async function loadEpisodes() {
        // Дорожка с японским звуком (type subtitles) — из неё же берём поток
        // для нарезки клипов. Нет такой — слова сохранятся без видео.
        const { data: a } = await client.get('catalog/anime/' + anime.shikimoriId, { silentErrors: true });
        const track = (a.data.translations || [])
            .filter((tr) => tr.type === 'subtitles' && tr.mediaId && tr.mediaHash)
            .sort((x, y) => (/crunchyroll/i.test(y.title) ? 1 : 0) - (/crunchyroll/i.test(x.title) ? 1 : 0))[0];
        if (!track) return [];
        const { data: e } = await client.get('catalog/episodes', {
            params: { mediaType: track.mediaType, mediaId: track.mediaId, mediaHash: track.mediaHash },
            silentErrors: true,
        });
        const eps = e.data.episodes || [];
        // seriesKey — для серверного кэша сдвига (subtitles/align).
        return eps.map((ep) => ({ ep, trackId: track.id || 'k' }));
    }

    async function scan(token) {
        let episodes = [];
        try { episodes = await loadEpisodes(); } catch { /* тайтла нет на источнике */ }
        const total = Math.min(episodes.length || SCAN_MAX, SCAN_MAX);
        const sets = [];
        for (let i = 0; i < total; i++) {
            if (token !== scanToken) return null;
            setScan(t('edeck.scan').replace('{i}', i + 1).replace('{n}', total));
            const epNumber = episodes[i] ? (episodes[i].ep.number != null ? episodes[i].ep.number : i + 1) : i + 1;
            try {
                const { data: res } = await client.get('subtitles/episode', {
                    params: { title: anime.name || anime.russian, episode: epNumber, translate: subsLang() },
                    timeout: 180000,
                    silentErrors: true,
                });
                const cues = (res.data && res.data.cues) || [];
                if (cues.length) sets.push({ src: episodes[i] || null, epNumber, cues });
            } catch { /* серия без сабов — дальше */ }
        }
        setScan('');
        return sets;
    }

    function cueScore(cue) {
        const dur = cue.end - cue.start;
        const len = (cue.text || '').length;
        let s = 0;
        if (dur >= 1 && dur <= 10) s += 2;
        else if (dur > 10 && dur <= 16) s += 1;
        if (len >= 4 && len <= 30) s += 2;
        else if (len <= 45) s += 1;
        if (cue.translation) s += 1;
        return s;
    }

    function collectCandidates() {
        const have = window.starterSavedKanji || new Set();
        const byBase = new Map();
        for (const set of cueSets) {
            for (const cue of set.cues) {
                for (const tok of (cue.tokens || [])) {
                    if (!tok.learnable || !CONTENT_POS.has(tok.pos)) continue;
                    const base = tok.base || tok.surface;
                    if (STOPLIST.has(base)) continue;
                    if (base.length < 2 && !KANJI.test(base)) continue;
                    const lvl = jlptMap[base] || jlptMap[tok.surface] || 0;
                    if (!lvl || !levelAllows(lvl)) continue;
                    if (have.has(base)) continue;   // уже в словаре пользователя

                    let e = byBase.get(base);
                    if (!e) {
                        e = { base, level: lvl, count: 0, tok, cue, ep: set, cueScore: -1, dict: undefined, translation: '' };
                        byBase.set(base, e);
                    }
                    e.count++;
                    if (!e.tok.baseReading && tok.baseReading) e.tok = tok;
                    const s = cueScore(cue);
                    if (s > e.cueScore) { e.cueScore = s; e.cue = cue; e.ep = set; }
                }
            }
        }
        return [...byBase.values()]
            .sort((a, b) => (b.count + (b.level === 5 ? 0.3 : 0)) - (a.count + (a.level === 5 ? 0.3 : 0)))
            .slice(0, MAX_WORDS);
    }

    // ---------- Переводы (превью в списке) ----------

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const is429 = (err) => err && err.response && err.response.status === 429;

    async function fetchDict(entry) {
        const { data: res } = await client.get('dictionary', {
            params: { q: entry.base, lang: (typeof getLang === 'function') ? getLang() : 'ru' },
            silentErrors: true,
        });
        entry.dict = (res.data && res.data[0]) || null;
        entry.translation = shortTranslation(entry.dict);
    }

    function loadTranslations(entries) {
        let idx = 0;
        const run = async () => {
            while (idx < entries.length) {
                const e = entries[idx++];
                if (e.dict !== undefined) continue;
                try { await fetchDict(e); } catch { /* прочерк */ }
                if (candidates.includes(e)) updateRow(e);
            }
        };
        Promise.all(Array.from({ length: DICT_POOL }, run));
    }

    // ---------- Поток и сдвиг серии-источника (для клипа) ----------

    async function ensureEpContext(set) {
        if (set.ready) return set.ready;
        set.ready = (async () => {
            set.videoUrl = '';
            set.offset = 0;
            if (!set.src) return set;   // тайтла нет на видео-источнике — без клипа
            try {
                const { data: res } = await client.get('catalog/stream', {
                    params: { type: 'seria', id: set.src.ep.id, hash: set.src.ep.hash },
                    silentErrors: true,
                });
                const url = res.data.hls || Object.values(res.data.qualities || {})[0] || '';
                set.videoUrl = url ? apiOrigin() + url : '';
            } catch { return set; }
            if (!set.videoUrl) return set;
            setScan(t('edeck.sync').replace('{n}', set.epNumber));
            try {
                const inWin = set.cues
                    .filter((c) => Number.isFinite(c.start) && c.start >= 0 && c.start < 340)
                    .slice(0, 260);
                if (inWin.length >= 5) {
                    const { data: res } = await client.post('subtitles/align', {
                        videoUrl: set.videoUrl,
                        cues: inWin.map((c) => c.start),
                        cueEnds: inWin.map((c) => (Number.isFinite(c.end) ? c.end : c.start + 2)),
                        cueTexts: inWin.map((c) => c.text || ''),
                        audioLang: 'ja',
                        seriesKey: anime.shikimoriId + ':' + (set.src.trackId || 'k') + ':s0',
                        introEnd: 0,
                    }, { timeout: 130000, silentErrors: true });
                    const { offset, confidence, matched, method } = res.data || {};
                    // Пороги доверия — как у автосинка плеера (maybeAutoSync).
                    const strong = confidence >= 0.6;
                    const okModerate = confidence >= 0.4 && (matched || 0) >= 12 && Math.abs(offset) <= 20;
                    const okSmall = confidence >= 0.34 && (matched || 0) >= 20 && Math.abs(offset) <= 6;
                    if (Number.isFinite(offset) && (strong || okModerate || okSmall)
                        && (Math.abs(offset) >= 1.2 || method === 'whisper-verified')) {
                        set.offset = offset;
                    }
                }
            } catch { /* без синка — режем по таймингам сабов */ }
            return set;
        })();
        return set.ready;
    }

    // ---------- Сохранение ----------

    async function saveEntry(entry) {
        if (entry.dict === undefined) {
            try { await fetchDict(entry); }
            catch (err) {
                if (is429(err)) { await sleep(10000); try { await fetchDict(entry); } catch { /* без перевода */ } }
            }
        }
        const dict = entry.dict || null;
        const cue = entry.cue;
        const set = await ensureEpContext(entry.ep);
        const word = await saveWord({
            kanji: entry.base,
            kana: (dict && dict.reading) || entry.tok.baseReading || entry.tok.reading || '',
            romaji: '',
            translation: entry.translation || shortTranslation(dict),
            sentence: cue.text,
            sentenceTranslation: cue.translation || '',
            videoStart: Math.max(0, cue.start + (set.offset || 0)),
            videoEnd: cue.end + (set.offset || 0),
            videoUrl: set.videoUrl || '',
            hint: '',
        });
        if (window.starterSavedKanji) window.starterSavedKanji.add(entry.base);
        return word;
    }

    async function createDeck() {
        if (creating) return;
        const picked = selectedEntries();
        if (!picked.length) return;
        creating = true;
        setBusy(true);

        const icon = /^\d{1,10}$/.test(String(anime.shikimoriId)) ? '/catalog/deck-icon/' + anime.shikimoriId : '';
        const name = String(animeTitle(anime) || 'Anime').trim().slice(0, 50);
        const deck = window.Decks.create(name, '📺', icon);
        let done = 0, failed = 0;
        const total = picked.length;
        const createBtn = panel.querySelector('.bdeck__create');
        const tick = () => {
            createBtn.textContent = t('edeck.creating').replace('{i}', done + failed).replace('{n}', total);
        };
        tick();

        let idx = 0;
        const worker = async () => {
            while (idx < picked.length) {
                const entry = picked[idx++];
                let attempt = 0;
                for (;;) {
                    try {
                        const word = await saveEntry(entry);
                        if (word && word.id) window.Decks.toggle(deck.id, word.id);
                        done++;
                    } catch (err) {
                        if (is429(err) && attempt < 3) { attempt++; await sleep(10000 * attempt); continue; }
                        console.error('Не удалось сохранить слово:', entry.base, err);
                        failed++;
                    }
                    break;
                }
                tick();
            }
        };
        await Promise.all(Array.from({ length: SAVE_POOL }, worker));
        setScan('');
        creating = false;

        if (!done) {
            window.Decks.remove(deck.id);
            setBusy(false);
            showSnackbar(t('edeck.error'), { duration: 4000, type: 'error' });
            return;
        }
        if (window.animeiTrack) window.animeiTrack('beginner_deck', 'anime_created:' + done);
        showSnackbar(
            (failed ? t('edeck.partial').replace('{k}', done).replace('{n}', total)
                : t('edeck.done').replace('{name}', deck.name).replace('{n}', done)),
            { duration: 4000, type: failed ? 'error' : undefined },
        );
        // Сразу к учёбе новой колоды: клипы догоняют в фоне («видео готовится»).
        setTimeout(() => { location.href = './deck-study.html?deck=' + encodeURIComponent(deck.id); }, 1200);
    }

    // ---------- UI ----------

    function setScan(msg) {
        const el = panel && panel.querySelector('.bdeck__scan');
        if (!el) return;
        el.hidden = !msg;
        el.textContent = msg || '';
    }

    function setBusy(on) {
        panel.classList.toggle('bdeck--busy', on);
        panel.querySelectorAll('input, .bdeck__seg button, .deck-anime__back').forEach((x) => { x.disabled = on; });
    }

    function selectedEntries() {
        const out = [];
        panel.querySelectorAll('.bdeck-row input:checked').forEach((cb) => {
            const e = candidates[Number(cb.closest('.bdeck-row').dataset.idx)];
            if (e) out.push(e);
        });
        return out;
    }

    function updateCount() {
        const n = selectedEntries().length;
        panel.querySelector('.bdeck__count').textContent =
            t('edeck.selected').replace('{n}', n).replace('{m}', candidates.length);
        const btn = panel.querySelector('.bdeck__create');
        btn.disabled = creating || n === 0;
        if (!creating) btn.textContent = t('edeck.create').replace('{n}', n);
        const all = panel.querySelector('.bdeck__all input');
        all.checked = n === candidates.length && n > 0;
        all.indeterminate = n > 0 && n < candidates.length;
    }

    function updateRow(entry) {
        const row = panel.querySelector(`.bdeck-row[data-base="${(window.CSS && CSS.escape) ? CSS.escape(entry.base) : entry.base}"]`);
        if (!row) return;
        const tr = row.querySelector('.bdeck-row__tr');
        tr.classList.remove('bdeck-row__tr--loading');
        tr.textContent = entry.translation || '—';
    }

    function renderList() {
        const listEl = panel.querySelector('.bdeck__list');
        listEl.innerHTML = '';
        if (!candidates.length && !scanning) {
            const msg = document.createElement('div');
            msg.className = 'bdeck__empty';
            msg.textContent = t('edeck.empty');
            listEl.appendChild(msg);
        }
        candidates.forEach((e, i) => {
            const row = document.createElement('label');
            row.className = 'bdeck-row';
            row.dataset.idx = i;
            row.dataset.base = e.base;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.addEventListener('change', updateCount);
            row.appendChild(cb);

            const main = document.createElement('div');
            main.className = 'bdeck-row__main';
            const top = document.createElement('div');
            top.className = 'bdeck-row__top';
            const word = document.createElement('span');
            word.className = 'bdeck-row__word';
            word.textContent = e.base;
            const read = document.createElement('span');
            read.className = 'bdeck-row__read';
            read.textContent = e.tok.baseReading || e.tok.reading || '';
            const badge = document.createElement('span');
            badge.className = 'bdeck-row__badge bdeck-row__badge--n' + e.level;
            badge.textContent = 'N' + e.level;
            top.append(word, read, badge);
            if (e.count > 1) {
                const freq = document.createElement('span');
                freq.className = 'bdeck-row__freq';
                freq.textContent = '×' + e.count;
                top.appendChild(freq);
            }
            main.appendChild(top);

            const tr = document.createElement('div');
            tr.className = 'bdeck-row__tr';
            if (e.dict !== undefined) tr.textContent = e.translation || '—';
            else { tr.classList.add('bdeck-row__tr--loading'); tr.textContent = '…'; }
            main.appendChild(tr);

            const sent = document.createElement('div');
            sent.className = 'bdeck-row__sent';
            sent.textContent = e.cue.text;
            main.appendChild(sent);

            row.appendChild(main);
            listEl.appendChild(row);
        });
        updateCount();
    }

    async function rebuild() {
        const token = ++scanToken;
        scanning = true;
        candidates = [];
        renderList();
        if (!cueSets) {
            cueSets = await scan(token);
            if (token !== scanToken) return;
            if (cueSets === null) { cueSets = []; }
        }
        scanning = false;
        candidates = collectCandidates();
        renderList();
        if (candidates.length) loadTranslations(candidates);
    }

    function open(pickedAnime, onBack) {
        anime = pickedAnime;
        level = '5';
        cueSets = null;
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.className = 'deck-choice bdeck';
        panel.innerHTML =
            '<div class="deck-choice__title"></div>' +
            '<div class="bdeck__seg"></div>' +
            '<div class="bdeck__bar"><label class="bdeck__all"><input type="checkbox" checked> <span></span></label>' +
            '<span class="bdeck__count"></span></div>' +
            '<div class="bdeck__scan" hidden></div>' +
            '<div class="bdeck__list"></div>' +
            '<button class="bdeck__create" type="button"></button>' +
            '<button class="deck-anime__back" type="button"></button>';
        panel.querySelector('.deck-choice__title').textContent = String(animeTitle(anime) || '').slice(0, 60);
        panel.querySelector('.bdeck__all span').textContent = t('edeck.selectAll');

        const seg = panel.querySelector('.bdeck__seg');
        for (const [val, label] of [['5', 'N5'], ['54', 'N5+N4'], ['4', 'N4']]) {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.level = val;
            b.textContent = label;
            b.classList.toggle('is-on', val === level);
            b.addEventListener('click', () => {
                if (creating || level === b.dataset.level) return;
                level = b.dataset.level;
                seg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
                // Сабы уже отсканированы — пересобираем мгновенно из cueSets.
                candidates = cueSets ? collectCandidates() : [];
                renderList();
                if (candidates.length) loadTranslations(candidates);
            });
            seg.appendChild(b);
        }

        panel.querySelector('.bdeck__all input').addEventListener('change', (e) => {
            panel.querySelectorAll('.bdeck-row input').forEach((cb) => { cb.checked = e.target.checked; });
            updateCount();
        });
        panel.querySelector('.bdeck__create').addEventListener('click', createDeck);
        panel.querySelector('.deck-anime__back').textContent = t('beginner.anime.back');
        panel.querySelector('.deck-anime__back').addEventListener('click', () => {
            if (creating) return;
            scanToken++;
            panel.remove();
            panel = null;
            if (onBack) onBack();
        });

        document.querySelector('.main.study').prepend(panel);
        loadJlpt()
            .then(rebuild)
            .catch(() => { scanning = false; renderList(); showSnackbar(t('edeck.error'), { duration: 3500, type: 'error' }); });
        if (window.animeiTrack) window.animeiTrack('beginner_deck', 'anime_scan:' + anime.shikimoriId);
    }

    return { open };
})();
