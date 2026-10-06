// Сторож воспроизведения: сам замечает, что плеер «играет» не по-настоящему,
// и шлёт отчёт на сервер (POST /stats/player-issue → блок «Сбои плеера» в админке).
//
// Зачем: 29.09 вечером на телефоне плеер «показывал только картинку», а наутро
// всё играло — ни в логах сервера (сегменты шли с 200), ни в статистике (хиты
// владельца не пишутся) следов не осталось. Такие сбои живут только в браузере,
// поэтому ловим их там же, в момент, пока состояние <video> ещё можно снять.
//
// Что считаем сбоем (каждый вид — один отчёт на поток):
//   frozen_picture — время идёт, а новых кадров нет (картинка застыла, звук идёт);
//   no_audio       — время идёт, а звук не декодируется (картинка без звука);
//   stuck          — не на паузе, а время стоит дольше STUCK_S;
//   media_error    — <video> упал с ошибкой;
//   hls_fatal      — фатальная ошибка hls.js (даже если потом поднялись);
//   js_error       — необработанная JS-ошибка на странице плеера.
// К отчёту прикладываем снимок <video>/hls и журнал последних событий плеера —
// по нему видно, что было ДО сбоя (перемотка, смена качества, уход в фон…).
//
// Подключать ПОСЛЕ player.js (нужны video, state, titleRomaji).
(function () {
    'use strict';

    if (typeof video === 'undefined' || !video) return;

    const ENDPOINT = (window.ANIMEI_ORIGIN || location.origin) + '/api/v1/stats/player-issue';
    const TICK_MS = 2000;
    const WINDOW_S = 8;        // столько секунд видео должно пройти без кадров/звука
    const STUCK_S = 12;        // столько секунд без движения времени при «играет»
    const LOG_MAX = 50;
    const PAGE_MAX = 6;        // отчётов со страницы, дальше — молчим

    const t0 = performance.now();
    const log = [];
    let sentOnPage = 0;
    let sentKinds = new Set(); // сбрасывается на каждом новом потоке
    let jsErrors = 0;
    let fragHost = '';         // CDN последнего сегмента (у KAA хосты ротируются)

    const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

    function note(e, d) {
        const last = log[log.length - 1];
        // Одинаковые события подряд (bufferStalledError раз в секунду) — счётчиком.
        if (last && last.e === e && last.d === d) { last.n = (last.n || 1) + 1; return; }
        log.push({ s: r1((performance.now() - t0) / 1000), e, t: r1(video.currentTime), d });
        if (log.length > LOG_MAX) log.shift();
    }

    function hostOf(u) {
        try {
            const url = new URL(u, location.href);
            const inner = url.searchParams.get('url');
            return inner ? new URL(inner).host : url.host;
        } catch { return ''; }
    }

    function ranges(tr) {
        const out = [];
        for (let i = 0; i < tr.length && i < 6; i++) out.push([r1(tr.start(i)), r1(tr.end(i))]);
        return out;
    }

    function counters() {
        const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
        return {
            frames: q ? q.totalVideoFrames : null,
            dropped: q ? q.droppedVideoFrames : null,
            // Chrome/Android: байты, реально прошедшие через декодеры. Самый прямой
            // признак «звук/картинка не идёт», когда currentTime при этом бежит.
            aBytes: typeof video.webkitAudioDecodedByteCount === 'number' ? video.webkitAudioDecodedByteCount : null,
            vBytes: typeof video.webkitVideoDecodedByteCount === 'number' ? video.webkitVideoDecodedByteCount : null,
        };
    }

    function snapshot() {
        const hls = typeof state !== 'undefined' ? state.hls : null;
        let hlsInfo = null;
        if (hls) {
            const lvl = hls.levels && hls.levels[hls.currentLevel];
            hlsInfo = {
                level: hls.currentLevel,
                height: lvl ? lvl.height : null,
                codecs: lvl ? [lvl.videoCodec, lvl.audioCodec].filter(Boolean).join(',') : null,
                levels: hls.levels ? hls.levels.length : null,
                audioTracks: hls.audioTracks ? hls.audioTracks.length : null,
                audioTrack: hls.audioTrack,
                bw: Math.round((hls.bandwidthEstimate || 0) / 1000),
            };
        }
        return Object.assign({
            t: r1(video.currentTime),
            dur: r1(video.duration),
            paused: video.paused,
            ended: video.ended,
            seeking: video.seeking,
            rs: video.readyState,
            ns: video.networkState,
            err: video.error ? (video.error.code + ' ' + (video.error.message || '')).trim() : null,
            muted: video.muted,
            vol: r1(video.volume),
            rate: video.playbackRate,
            w: video.videoWidth,
            h: video.videoHeight,
            buf: ranges(video.buffered),
            played: ranges(video.played).length,
            hls: hlsInfo,
        }, counters());
    }

    function context() {
        const sel = typeof translationSelect !== 'undefined' && translationSelect
            ? translationSelect.options[translationSelect.selectedIndex] : null;
        const epSel = typeof episodeSelect !== 'undefined' && episodeSelect
            ? episodeSelect.options[episodeSelect.selectedIndex] : null;
        const conn = navigator.connection || {};
        let owner = false;
        try { owner = localStorage.getItem('animei:owner') === '1'; } catch { /* ок */ }
        let visitorId = null;
        try { visitorId = localStorage.getItem('animei:visitorId'); } catch { /* ок */ }
        return {
            ver: typeof APP_VERSION === 'string' ? APP_VERSION : null,
            shikimoriId: typeof shikimoriId !== 'undefined' ? shikimoriId : null,
            title: typeof titleRomaji === 'string' ? titleRomaji.slice(0, 120) : '',
            ep: epSel ? epSel.textContent.trim().slice(0, 40) : null,
            source: typeof state !== 'undefined' ? state.provider : null,
            track: sel ? sel.textContent.trim().slice(0, 80) : null,
            quality: typeof currentQualityKey === 'function' ? currentQualityKey() : null,
            enMode: typeof state !== 'undefined' ? state.enMode || '' : '',
            host: typeof state !== 'undefined' ? hostOf(state.currentVideoUrl || video.currentSrc) : '',
            fragHost,
            visible: document.visibilityState,
            online: navigator.onLine,
            net: conn.effectiveType ? conn.effectiveType + (conn.downlink ? ' ' + conn.downlink + 'Mb' : '') : null,
            pageAgeS: Math.round((performance.now() - t0) / 1000),
            owner,
            visitorId,
            automated: navigator.webdriver === true,
        };
    }

    function report(kind, detail) {
        if (sentKinds.has(kind) || sentOnPage >= PAGE_MAX) return;
        sentKinds.add(kind);
        sentOnPage += 1;
        note('REPORT', kind);
        const body = Object.assign({ kind, detail: String(detail || '').slice(0, 500) }, context(), {
            v: snapshot(),
            log: log.slice(-40),
        });
        try {
            fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                keepalive: true,
            }).catch(() => { /* отчёт не должен мешать просмотру */ });
        } catch { /* ок */ }
        // Для владельца в консоли — чтобы при отладке на телефоне сразу видеть.
        console.warn('[watchdog]', kind, detail || '', body.v);
    }
    // Ручной отчёт из консоли: animeiPlayerReport('что видно глазами').
    window.animeiPlayerReport = (text) => { sentKinds.delete('manual'); report('manual', text); };

    // ---------- Журнал событий <video> ----------
    ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'stalled', 'play', 'pause',
        'seeking', 'seeked', 'ended', 'emptied', 'abort'].forEach((ev) => {
        video.addEventListener(ev, () => note(ev, ev === 'loadstart' ? hostOf(video.currentSrc) : undefined));
    });
    video.addEventListener('volumechange', () => note('volume', (video.muted ? 'muted ' : '') + r1(video.volume)));
    video.addEventListener('error', () => {
        const e = video.error;
        note('error', e ? e.code + ' ' + (e.message || '') : '?');
        report('media_error', e ? 'code ' + e.code + ': ' + (e.message || '') : 'no error object');
    });
    // Новый поток (смена серии/дорожки/качества) — новые шансы на отчёт.
    video.addEventListener('loadstart', () => { sentKinds = new Set(); resetBase(); });
    document.addEventListener('visibilitychange', () => { note('visibility', document.visibilityState); resetBase(); });
    window.addEventListener('online', () => note('net', 'online'));
    window.addEventListener('offline', () => note('net', 'offline'));

    // ---------- hls.js: вешаемся на каждый новый экземпляр ----------
    let hooked = null;
    function hookHls() {
        const hls = typeof state !== 'undefined' ? state.hls : null;
        if (!hls || hls === hooked || typeof Hls === 'undefined') return;
        hooked = hls;
        const E = Hls.Events;
        hls.on(E.MANIFEST_PARSED, (_, d) => note('manifest', (d.levels || []).map((l) => l.height).join('/') +
            ' audio:' + ((d.audioTracks || []).length)));
        hls.on(E.BUFFER_CODECS, (_, d) => note('codecs', Object.keys(d || {}).map((k) =>
            k + '=' + ((d[k] && (d[k].codec || d[k].levelCodec)) || '?')).join(' ')));
        hls.on(E.LEVEL_SWITCHED, (_, d) => note('level', String(hls.levels && hls.levels[d.level] ? hls.levels[d.level].height : d.level)));
        hls.on(E.FRAG_LOADED, (_, d) => { if (d.frag && d.frag.url) fragHost = hostOf(d.frag.url); });
        hls.on(E.AUDIO_TRACK_SWITCHED, (_, d) => note('audioTrack', String(d.id)));
        hls.on(E.ERROR, (_, d) => {
            const code = d.response && d.response.code ? ' http ' + d.response.code : '';
            const frag = d.frag ? ' ' + (d.frag.type || '') + '#' + d.frag.sn : '';
            const text = (d.fatal ? 'FATAL ' : '') + d.type + '/' + d.details + frag + code +
                (d.error && d.error.message ? ' · ' + d.error.message.slice(0, 120) : '');
            note('hlsError', text);
            if (d.fatal) report('hls_fatal', text);
        });
    }

    // ---------- JS-ошибки страницы ----------
    window.addEventListener('error', (e) => {
        if (!e.message || jsErrors >= 3) return; // ошибки загрузки ресурсов без message не про нас
        jsErrors += 1;
        note('jsError', e.message.slice(0, 160));
        sentKinds.delete('js_error');
        report('js_error', e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno +
            (e.error && e.error.stack ? '\n' + e.error.stack.slice(0, 300) : ''));
    });
    window.addEventListener('unhandledrejection', (e) => {
        const r = e.reason;
        // axios-ошибки запросов (4xx/5xx) — это не про воспроизведение, их видно в логах сервера.
        if (!r || r.isAxiosError || jsErrors >= 3) return;
        const msg = (r && r.message) || String(r);
        // Браузер пропустил анимацию перехода между страницами (@view-transition в
        // motion.css) — отклоняет своё же обещание. Зрителю ничем не мешает, а в
        // «Сбоях плеера» висело как ошибка (04.10: Android Chrome 146, Kimetsu ep1).
        // Safari пишет то же иначе: «Skipping view transition because skipTransition()…».
        if (/^Transition was (skipped|aborted)|^Skipping view transition/.test(msg)) { e.preventDefault(); return; }
        jsErrors += 1;
        note('rejection', msg.slice(0, 160));
        sentKinds.delete('js_error');
        report('js_error', 'unhandled rejection: ' + msg + (r && r.stack ? '\n' + r.stack.slice(0, 300) : ''));
    });

    // ---------- Сторож ----------
    // База — точка отсчёта окна: сколько было времени/кадров/байт звука, когда
    // воспроизведение последний раз «честно» шло. Паузы, перемотки и фон её
    // сбрасывают: там кадры и звук и не должны идти.
    let base = null;
    let stuckSince = null;
    function resetBase() { base = null; stuckSince = null; }

    function tick() {
        hookHls();
        const playingIntent = !video.paused && !video.ended && !video.seeking;
        if (!playingIntent || document.visibilityState !== 'visible' || video.playbackRate === 0) {
            resetBase();
            return;
        }
        const now = performance.now();
        const ct = video.currentTime;
        const c = counters();

        // stuck: «играет», а время не двигается.
        if (base && Math.abs(ct - base.ct) < 0.05) {
            if (!stuckSince) stuckSince = base.at;
            if ((now - stuckSince) / 1000 >= STUCK_S) {
                report('stuck', 'time frozen at ' + r1(ct) + ' for ' + Math.round((now - stuckSince) / 1000) + 's, rs=' + video.readyState);
            }
            return;
        }
        stuckSince = null;

        if (!base || ct < base.ct) { base = Object.assign({ ct, at: now }, c); return; }
        const advanced = ct - base.ct;
        if (advanced < WINDOW_S) return;

        const hasVideo = video.videoWidth > 0 || (c.vBytes !== null && c.vBytes > 0);
        if (hasVideo && c.frames !== null && c.frames === base.frames &&
            (c.vBytes === null || c.vBytes === base.vBytes)) {
            report('frozen_picture', 'time ' + r1(base.ct) + '→' + r1(ct) + ' but no new frames (total ' + c.frames + ')');
        }
        if (c.aBytes !== null && c.aBytes === base.aBytes && !video.muted && video.volume > 0) {
            report('no_audio', 'time ' + r1(base.ct) + '→' + r1(ct) + ' but audio decoder got 0 bytes (total ' + c.aBytes + ')');
        }
        base = Object.assign({ ct, at: now }, c);
    }
    setInterval(tick, TICK_MS);
})();
