// ===== Настоящее аниме на экранах: телефон школьника под партой, канал «アニメ» в телевизорах =====
// Сначала — клипы из словаря пользователя (сцены из аниме, которые он смотрел и откуда брал слова,
// GET /api/v1/words/:id/clip), иначе — клипы стартовой колоды (популярные аниме, pwa/media/starter).
// Одно общее <video> без звука: декодируется один поток на всю комнату. С file:// видео не грузим
// (WebGL не возьмёт кадр с чужого домена без CORS) — там остаётся нарисованный «канал».
const ANITV = (() => {
    const OK = location.protocol !== 'file:';
    const STARTER = /*__STARTER_TV__*/[];
    let list = null, vid = null, tex = null, idx = 0, cur = null, loading = null, hls = null, hlsLoading = null;
    const lsJ = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const api = (p) => fetch('/api/v1/' + p).then((r) => (r.ok ? r.json() : null)).then((j) => j && j.data).catch(() => null);
    // где пользователь остановился в плеере: тайтл, серия, секунда и дорожка (источник) — из того же localStorage
    function lastWatch() {
        const lw = lsJ('animei:lastWatch'); if (!lw || !lw.id) return null;
        if (lw.updatedAt && Date.now() - lw.updatedAt > 60 * 864e5) return null;
        let best = null, track = null; const pre = 'animei:watchPos:' + lw.id + ':';
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k || !k.startsWith(pre)) continue; const v = lsJ(k); if (v && (!best || (v.updatedAt || 0) > (best.updatedAt || 0))) { best = v; track = k.slice(pre.length); } }
        return { id: String(lw.id), title: lw.title || lw.name || '', ep: Number((best && best.epNum) || lw.epNum || 1), time: Number((best && best.time != null ? best.time : lw.time) || 0), track, season: best ? best.seasonIndex || 0 : 0 };
    }
    // поток той же серии через те же ручки, что и плеер (все публичные, ссылки на /proxy того же сайта)
    async function resolveResume(lw) {
        const info = await api('catalog/anime/' + encodeURIComponent(lw.id)); const trs = (info && info.translations) || [];
        if (!trs.length) return null;
        const jp = (t) => t.type === 'subtitles' || /sub|субтитр|crunchyroll/i.test(String(t.id) + ' ' + (t.title || ''));
        const own = lw.track ? trs.find((t) => String(t.id) === lw.track) : null;
        const order = (own ? [own] : []).concat(trs.filter((t) => t !== own && !/dub/.test(String(t.id)) && jp(t)), trs.filter((t) => t !== own && !/dub/.test(String(t.id)) && !jp(t)));
        for (const t of order.slice(0, 3)) {
            let url = null, direct = false;
            if (t.provider === 'kickassanime') { const d = await api('catalog/kickassanime-stream?shikimoriId=' + encodeURIComponent(lw.id) + '&ep=' + lw.ep + '&sub=en'); url = d && (d.auto || Object.values(d.qualities || {})[0]); }
            else if (t.provider === 'animejoy') { const d = await api('catalog/animejoy-stream?shikimoriId=' + encodeURIComponent(lw.id) + '&ep=' + lw.ep); url = d && d.video; direct = true; }
            else if (t.provider === 'megaplay') { const d = await api('catalog/megaplay-stream?mal=' + encodeURIComponent(t.malId) + '&ep=' + lw.ep + '&type=sub'); url = d && d.hls; }
            else if (!t.provider && t.mediaId) {
                const e = await api('catalog/episodes?mediaType=' + encodeURIComponent(t.mediaType) + '&mediaId=' + encodeURIComponent(t.mediaId) + '&mediaHash=' + encodeURIComponent(t.mediaHash));
                const same = ((e && e.episodes) || []).filter((x) => Number(x.number) === lw.ep), ep = same[Math.min(lw.season || 0, same.length - 1)] || same[0];
                if (ep) { const d = await api('catalog/stream?type=seria&id=' + encodeURIComponent(ep.id) + '&hash=' + encodeURIComponent(ep.hash)); url = d && (d.master || d.hls); }
            }
            if (url) return { url, direct, title: lw.title, ep: lw.ep, time: lw.time, resume: true };
        }
        return null;
    }
    function loadHls() {
        if (window.Hls) return Promise.resolve(window.Hls);
        if (!hlsLoading) hlsLoading = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '../libs/hls/hls.min.js'; sc.onload = () => res(window.Hls); sc.onerror = rej; document.head.appendChild(sc); });
        return hlsLoading;
    }
    async function mineList() {
        try {
            if (typeof source === 'undefined' || source !== 'real') return [];
            const tok = localStorage.getItem('animei:accessToken'); if (!tok) return [];
            const ws = ((typeof data !== 'undefined' && data && data.words) || []).filter((w) => w && w.id)
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 12);
            const out = [];
            for (const w of ws) {
                if (out.length >= 6) break;
                try {
                    const r = await fetch('/api/v1/words/' + encodeURIComponent(w.id) + '/clip', { headers: { Authorization: 'Bearer ' + tok } });
                    if (r.status === 401 || r.status === 403) break;
                    if (!r.ok) continue;
                    const j = await r.json(); const u = j && j.data && j.data.url;
                    if (u) out.push({ url: u, title: w.kanji || w.kana || '', mine: true });
                } catch (e) { /* без сети */ }
            }
            return out;
        } catch (e) { return []; }
    }
    function load() {
        if (!loading) {
            const lw = lastWatch();
            loading = Promise.all([mineList(), lw ? resolveResume(lw).catch(() => null) : null]).then(([mine, res]) => {
                const st = STARTER.map(([f, a]) => ({ url: '../media/starter/' + f, title: a, mine: false })).sort(() => Math.random() - 0.5);
                list = (res ? [res] : []).concat(mine.sort(() => Math.random() - 0.5), st); return list;
            });
        }
        return loading;
    }
    async function play(it) {
        if (hls) { try { hls.destroy(); } catch (e) { /* уже */ } hls = null; }
        cur = it;
        if (it.resume && !it.direct && !vid.canPlayType('application/vnd.apple.mpegurl')) {
            const Hls = await loadHls().catch(() => null);
            if (!Hls || !Hls.isSupported()) { setTimeout(next, 100); return; }
            hls = new Hls({ startPosition: it.time > 5 ? it.time : -1, maxBufferLength: 20, maxMaxBufferLength: 40,
                fragLoadPolicy: { default: { maxTimeToFirstByteMs: 20000, maxLoadTimeMs: 60000, timeoutRetry: { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 4000 }, errorRetry: { maxNumRetry: 4, retryDelayMs: 1000, maxRetryDelayMs: 8000 } } } });
            hls.on(Hls.Events.ERROR, (e, d) => { if (d && d.fatal) { try { hls.destroy(); } catch (x) { /* уже */ } hls = null; setTimeout(next, 300); } });
            hls.loadSource(it.url); hls.attachMedia(vid);
        } else {
            vid.src = it.url;
            if (it.time > 5) vid.addEventListener('loadedmetadata', () => { try { vid.currentTime = it.time; } catch (e) { /* ок */ } }, { once: true });
        }
        const p = vid.play(); if (p && p.catch) p.catch(() => { /* автозапуск без звука почти всегда разрешён */ });
    }
    function next() {
        if (!vid || !list || !list.length) return;
        let it = list[idx++ % list.length];
        if (it.resume && idx > 1) it = list[idx++ % list.length] || it; // своё аниме — один раз, дальше клипы
        play(it);
    }
    // текстура видео (или null, если видео недоступно) — один раз на страницу
    function ensure() {
        if (!OK) return null;
        if (tex) return tex;
        vid = document.createElement('video');
        vid.muted = true; vid.defaultMuted = true; vid.playsInline = true; vid.setAttribute('playsinline', ''); vid.setAttribute('muted', ''); vid.preload = 'auto';
        vid.addEventListener('ended', next);
        vid.addEventListener('error', () => setTimeout(next, 400));
        tex = new THREE.VideoTexture(vid); tex.colorSpace = THREE.SRGBColorSpace;
        load().then(() => { if (!vid.src) next(); });
        return tex;
    }
    function pause() { if (vid && !vid.paused) vid.pause(); }
    function resume() { if (vid && vid.paused && (vid.src || hls)) { const p = vid.play(); if (p && p.catch) p.catch(() => {}); } }
    return { ensure, pause, resume, next, get title() { return cur ? cur.title : ''; }, get mine() { return !!(cur && cur.mine); }, get resumed() { return cur && cur.resume ? cur : null; } };
})();
