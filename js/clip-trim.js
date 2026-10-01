// Редактор видео-фрагмента карточки: мини-плеер клипа + кнопки ±1с к началу/концу.
// Двигает окно [trimStart, trimEnd] и сохраняет его (updateWord + кэш words в
// localStorage). Раньше жил внутри обучения (study-core.js); теперь это общий
// модуль, и правку фрагмента делаем при редактировании карточки в словаре.
//
// Зависимости (подключать ПЕРЕД этим файлом): i18n.js (t), snackbar.js
// (showSnackbar), words-store.js (updateWord), video-store.js (getClipUrl) — все
// уже есть на words.html. Класс-стили .clip-player / .clip-trim идут из app.css.
(function () {
    'use strict';

    const ICONS = {
        play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.55.88l10.8-6.86a1.04 1.04 0 0 0 0-1.76L9.55 4.26A1.04 1.04 0 0 0 8 5.14z"/></svg>',
        volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.3 5.7a9 9 0 0 1 0 12.6"/></svg>',
        muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/></svg>',
    };

    function tr(key) {
        return typeof window.t === 'function' ? window.t(key) : key;
    }

    function snack(msg) {
        if (typeof showSnackbar === 'function') showSnackbar(msg, { duration: 1200 });
    }

    function videoSrcOf(word) {
        if (!word) return '';
        return word.Video ? word.Video.url : (word.video || '');
    }

    // Есть ли у слова видеофрагмент (прямая ссылка или клип гостя в IndexedDB).
    function hasClip(word) {
        if (!word) return false;
        if (videoSrcOf(word)) return true;
        return !!word.id && Number(word.videoEnd) > Number(word.videoStart);
    }

    // Сохранить окно клипа: у вошедшего — PATCH через updateWord, у гостя — в
    // guestWords; плюс кэш words в localStorage, чтобы пережило перезагрузку.
    function persistTrim(id, s, e) {
        try { if (typeof updateWord === 'function') updateWord(id, { trimStart: s, trimEnd: e }); } catch { /* не критично */ }
        try {
            const words = lsJson('words', []);
            const idx = words.findIndex((x) => x && x.id === id);
            if (idx >= 0) {
                words[idx].trimStart = s;
                words[idx].trimEnd = e;
                localStorage.setItem('words', JSON.stringify(words));
            }
        } catch { /* не критично */ }
    }

    // Мини-плеер клипа: короткое окно [tStart..tEnd] зациклено, поэтому нужны
    // только Play/Pause по центру и кнопка звука.
    function makeClipVideo(src, w) {
        const wrap = document.createElement('div');
        wrap.className = 'clip-player';

        const video = document.createElement('video');
        video.src = src;
        video.autoplay = false;
        video.loop = false;
        video.playsInline = true;
        video.muted = true; // в форме редактирования не пугаем звуком, звук — по кнопке
        wrap.appendChild(video);

        // Окно воспроизведения внутри клипа. Клип режется с запасом ±2с, границы
        // можно двигать ±1с.
        let tStart = Number.isFinite(Number(w && w.trimStart)) ? Math.max(0, Number(w.trimStart)) : 0;
        let tEnd = Number.isFinite(Number(w && w.trimEnd)) ? Number(w.trimEnd) : null;

        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = 'clip-player__play';
        playBtn.setAttribute('aria-label', 'Play/pause');
        playBtn.innerHTML = ICONS.play;
        wrap.appendChild(playBtn);

        const muteBtn = document.createElement('button');
        muteBtn.type = 'button';
        muteBtn.className = 'clip-player__mute';
        muteBtn.setAttribute('aria-label', 'Sound');
        muteBtn.innerHTML = ICONS.muted;
        wrap.appendChild(muteBtn);

        const toggle = () => {
            if (video.paused) {
                if (tEnd != null && video.currentTime >= tEnd - 0.05) video.currentTime = tStart;
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        };
        const sync = () => wrap.classList.toggle('is-paused', video.paused);

        function seekStart() {
            if (tStart > 0) { try { video.currentTime = tStart; } catch { /* not seekable yet */ } }
            sync();
        }
        if (video.readyState >= 1) seekStart();
        else video.addEventListener('loadedmetadata', seekStart, { once: true });

        // Держим воспроизведение в окне [tStart, tEnd] и зацикливаем — так удобнее
        // оценивать подрезку.
        video.addEventListener('timeupdate', () => {
            if (tEnd == null) return;
            if (video.currentTime >= tEnd - 0.02) video.currentTime = tStart;
        });

        video.addEventListener('play', sync);
        video.addEventListener('pause', sync);
        video.addEventListener('ended', sync);
        video.addEventListener('click', toggle);
        playBtn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            video.muted = !video.muted;
            muteBtn.innerHTML = video.muted ? ICONS.muted : ICONS.volume;
        });
        sync();

        // Наружу отдаём управление окном — для редактора кнопок ниже.
        wrap._video = video;
        wrap._getStart = () => tStart;
        wrap._getEnd = () => tEnd;
        wrap._apply = (s, e) => {
            tStart = s; tEnd = e;
            try { video.currentTime = tStart; } catch { /* ignore */ }
            video.play().catch(() => {});
        };
        return wrap;
    }

    // Панель «Видео-фрагмент»: две группы кнопок (−1с/+1с) для начала и конца.
    // Рядом с каждой подписью показываем текущее значение (в секундах) и длину
    // окна — чтобы было видно, что именно правишь.
    function buildTrimEditor(clip, w) {
        const video = clip._video;
        const box = document.createElement('div');
        box.className = 'clip-trim';

        // Секунды -> «2.5с» (без лишнего .0).
        const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1).replace(/\.0$/, '') : '—') + tr('clip.sec');

        let startVal = null, endVal = null, lenVal = null;

        // Текущий конец окна: если tEnd не задан — берём длительность клипа.
        function curEnd() {
            const e = clip._getEnd();
            if (e != null) return e;
            return Number.isFinite(video.duration) ? video.duration : null;
        }

        // Обновить показанные значения из текущего окна клипа.
        function refresh() {
            const s = clip._getStart();
            const e = curEnd();
            if (startVal) startVal.textContent = fmt(s);
            if (endVal) endVal.textContent = e == null ? '—' : fmt(e);
            if (lenVal) lenVal.textContent = (e != null && Number.isFinite(s)) ? fmt(Math.max(0, e - s)) : '—';
        }

        function clampSave(newStart, newEnd) {
            const dur = video.duration && Number.isFinite(video.duration) ? video.duration : (newEnd ?? 0) + 2;
            let s = Math.max(0, newStart);
            let e = newEnd == null ? null : newEnd;
            if (e != null) {
                e = Math.min(dur, e);
                s = Math.min(s, e - 0.3);
                e = Math.max(e, s + 0.3);
            }
            s = Math.max(0, s);
            clip._apply(s, e);
            w.trimStart = s;
            w.trimEnd = e;
            persistTrim(w.id, s, e);
            refresh();   // новые границы видны сразу — тост «Длина сохранена» на каждый тап был шумом
        }

        function group(labelKey, onMinus, onPlus) {
            const g = document.createElement('div');
            g.className = 'clip-trim__group';
            const lbl = document.createElement('span');
            lbl.className = 'clip-trim__label';
            lbl.textContent = tr(labelKey);
            const val = document.createElement('span');
            val.className = 'clip-trim__value';
            const minus = document.createElement('button');
            minus.type = 'button';
            minus.className = 'clip-trim__btn';
            minus.textContent = '−1' + tr('clip.sec');
            minus.title = tr('clip.earlier.title');
            minus.addEventListener('click', (ev) => { ev.stopPropagation(); onMinus(); });
            const plus = document.createElement('button');
            plus.type = 'button';
            plus.className = 'clip-trim__btn';
            plus.textContent = '+1' + tr('clip.sec');
            plus.title = tr('clip.later.title');
            plus.addEventListener('click', (ev) => { ev.stopPropagation(); onPlus(); });
            g.append(lbl, val, minus, plus);
            return { g, val };
        }

        const start = group('clip.start',
            () => clampSave(clip._getStart() - 1, clip._getEnd()),
            () => clampSave(clip._getStart() + 1, clip._getEnd()));
        startVal = start.val;
        const end = group('clip.end',
            () => { const e = curEnd() || 0; clampSave(clip._getStart(), e - 1); },
            () => { const e = curEnd() || 0; clampSave(clip._getStart(), e + 1); });
        endVal = end.val;

        // Итоговая длина окна — отдельной подписью справа.
        const lenGroup = document.createElement('div');
        lenGroup.className = 'clip-trim__group clip-trim__group--len';
        const lenLbl = document.createElement('span');
        lenLbl.className = 'clip-trim__label';
        lenLbl.textContent = tr('clip.length');
        lenVal = document.createElement('span');
        lenVal.className = 'clip-trim__value';
        lenGroup.append(lenLbl, lenVal);

        box.append(start.g, end.g, lenGroup);

        // Стартовые значения (длительность может подъехать позже — обновимся ещё раз).
        refresh();
        if (video.readyState < 1) video.addEventListener('loadedmetadata', refresh, { once: true });
        return box;
    }

    // Собрать блок редактирования фрагмента для слова. Возвращает контейнер
    // (пустой, если у слова нет клипа — тогда CSS .clip-edit:empty его прячет).
    function buildForWord(w) {
        const container = document.createElement('div');
        container.className = 'clip-edit';

        const isGuest = typeof w.id === 'string' && w.id.startsWith('local-');
        const expected = w && w.id && Number(w.videoEnd) > Number(w.videoStart);
        // Кому доступна повторная нарезка: вошедшему — серверная ручка /recut
        // (источник хранится в Word.sourceUrl), гостю — повторный /words/clip,
        // пока в его слове жива ссылка videoUrl.
        const canRecut = !!expected && (!isGuest || !!w.videoUrl);

        function recutButton(ghost) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'clip-edit__recut' + (ghost ? ' clip-edit__recut--ghost' : '');
            btn.textContent = tr('clip.recut');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.animeiTrack) animeiTrack('clip_recut', 'click');
                recut();
            });
            return btn;
        }

        function mount(src) {
            container.innerHTML = '';
            container.classList.remove('clip-edit--pending');
            const title = document.createElement('div');
            title.className = 'clip-edit__title';
            title.textContent = tr('clip.edit.title');
            const clip = makeClipVideo(src, w);
            const editor = buildTrimEditor(clip, w);
            container.append(title, clip, editor);
            // Файл может оказаться битым (нарезка оборвалась на середине) —
            // тогда вместо чёрного квадрата честная плашка с кнопкой рекатки.
            clip._video.addEventListener('error', () => {
                showPending('clip.unavailable', false, canRecut);
            }, { once: true });
            if (canRecut) container.appendChild(recutButton(true));
        }

        // Заглушка вместо пустоты: «видео готовится / загружается»;
        // withRetry — добавить кнопку «Нарезать заново».
        function showPending(msgKey, spinner, withRetry) {
            container.innerHTML = '';
            container.classList.add('clip-edit--pending');
            const note = document.createElement('div');
            note.className = 'clip-edit__pending';
            if (spinner) {
                const sp = document.createElement('span');
                sp.className = 'clip-spinner';
                note.appendChild(sp);
            }
            const txt = document.createElement('span');
            txt.textContent = tr(msgKey);
            note.appendChild(txt);
            container.appendChild(note);
            if (withRetry) container.appendChild(recutButton(false));
        }

        let recutting = false;
        async function recut() {
            if (recutting) return;
            recutting = true;
            showPending('clip.recutting', true);
            try {
                if (isGuest) {
                    // Гость: повторный запрос нарезки, blob — обратно в IndexedDB.
                    const blob = typeof requestClip === 'function' ? await requestClip(w, true) : null;
                    const stored = blob && typeof putClip === 'function' ? await putClip(w.id, blob) : false;
                    const url = stored && typeof getClipUrl === 'function' ? await getClipUrl(w.id) : '';
                    if (!url) throw Object.assign(new Error('stale'), { stale: true });
                    mount(url);
                } else {
                    const { data: res } = await client.post('words/' + w.id + '/recut', {}, { silentErrors: true });
                    const url = res && res.data && res.data.url;
                    if (!url) throw Object.assign(new Error('stale'), { stale: true });
                    w.Video = { url };
                    // Офлайн-копия старого (битого) клипа больше не годится.
                    if (typeof deleteClip === 'function') deleteClip(w.id);
                    // ?r= — мимо HTTP-кэша браузера: путь файла не изменился.
                    mount(url + (url.includes('?') ? '&' : '?') + 'r=' + Date.now());
                }
                snack(tr('clip.recutDone'));
            } catch (err) {
                const status = err && err.response && err.response.status;
                const stale = (err && err.stale) || status === 410 || status === 400;
                showPending('clip.unavailable', false, true);
                if (typeof showSnackbar === 'function') {
                    showSnackbar(tr(stale ? 'clip.recutStale' : 'clip.recutFail'), { duration: 5000, type: 'error' });
                }
            } finally {
                recutting = false;
            }
        }

        const src = videoSrcOf(w);
        if (src) { mount(src); return container; }

        if (!expected) return container;

        if (isGuest && typeof getClipUrl === 'function') {
            // Клип гостя лежит в IndexedDB — тянем асинхронно, пока показываем спиннер.
            showPending('clip.loading', true);
            getClipUrl(w.id)
                .then((url) => { url ? mount(url) : showPending('clip.unavailable', false, canRecut); })
                .catch(() => showPending('clip.unavailable', false, canRecut));
            return container;
        }

        // Вошедший: клип режет сервер в фоне. Пока Video.url пуст — он ещё
        // готовится; если фон нарезки упал — кнопка запускает нарезку заново.
        showPending('clip.preparing', true, canRecut);
        return container;
    }

    window.AnimeiClipTrim = { buildForWord, hasClip };
})();
