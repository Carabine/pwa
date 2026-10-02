// ===== Настоящее аниме на экранах: телефон школьника под партой, канал «アニメ» в телевизорах =====
// Сначала — клипы из словаря пользователя (сцены из аниме, которые он смотрел и откуда брал слова,
// GET /api/v1/words/:id/clip), иначе — клипы стартовой колоды (популярные аниме, pwa/media/starter).
// Одно общее <video> без звука: декодируется один поток на всю комнату. С file:// видео не грузим
// (WebGL не возьмёт кадр с чужого домена без CORS) — там остаётся нарисованный «канал».
const ANITV = (() => {
    const OK = location.protocol !== 'file:';
    const STARTER = /*__STARTER_TV__*/[];
    let list = null, vid = null, tex = null, idx = 0, cur = null, loading = null;
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
        if (!loading) loading = mineList().then((mine) => {
            const st = STARTER.map(([f, a]) => ({ url: '../media/starter/' + f, title: a, mine: false })).sort(() => Math.random() - 0.5);
            list = mine.sort(() => Math.random() - 0.5).concat(st); return list;
        });
        return loading;
    }
    function next() {
        if (!vid || !list || !list.length) return;
        cur = list[idx++ % list.length];
        vid.src = cur.url;
        const p = vid.play(); if (p && p.catch) p.catch(() => { /* автозапуск без звука почти всегда разрешён */ });
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
    function resume() { if (vid && vid.paused && vid.src) { const p = vid.play(); if (p && p.catch) p.catch(() => {}); } }
    return { ensure, pause, resume, next, get title() { return cur ? cur.title : ''; }, get mine() { return !!(cur && cur.mine); } };
})();
