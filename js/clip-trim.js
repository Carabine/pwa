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
            const words = JSON.parse(localStorage.getItem('words') || '[]');
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
    function buildTrimEditor(clip, w) {
        const video = clip._video;
        const box = document.createElement('div');
        box.className = 'clip-trim';

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
            snack(tr('clip.saved'));
        }

        function group(labelKey, onMinus, onPlus) {
            const g = document.createElement('div');
            g.className = 'clip-trim__group';
            const lbl = document.createElement('span');
            lbl.className = 'clip-trim__label';
            lbl.textContent = tr(labelKey);
            const minus = document.createElement('button');
            minus.type = 'button';
            minus.className = 'clip-trim__btn';
            minus.textContent = '−1с';
            minus.title = tr('clip.earlier.title');
            minus.addEventListener('click', (ev) => { ev.stopPropagation(); onMinus(); });
            const plus = document.createElement('button');
            plus.type = 'button';
            plus.className = 'clip-trim__btn';
            plus.textContent = '+1с';
            plus.title = tr('clip.later.title');
            plus.addEventListener('click', (ev) => { ev.stopPropagation(); onPlus(); });
            g.append(lbl, minus, plus);
            return g;
        }

        const startGroup = group('clip.start',
            () => clampSave(clip._getStart() - 1, clip._getEnd()),
            () => clampSave(clip._getStart() + 1, clip._getEnd()));
        const endGroup = group('clip.end',
            () => { const e = clip._getEnd() == null ? (video.duration || 0) : clip._getEnd(); clampSave(clip._getStart(), e - 1); },
            () => { const e = clip._getEnd() == null ? (video.duration || 0) : clip._getEnd(); clampSave(clip._getStart(), e + 1); });

        box.append(startGroup, endGroup);
        return box;
    }

    // Собрать блок редактирования фрагмента для слова. Возвращает контейнер
    // (пустой, если у слова нет клипа — тогда CSS .clip-edit:empty его прячет).
    function buildForWord(w) {
        const container = document.createElement('div');
        container.className = 'clip-edit';

        function mount(src) {
            if (container.childElementCount) return; // уже смонтировали
            const title = document.createElement('div');
            title.className = 'clip-edit__title';
            title.textContent = tr('clip.edit.title');
            const clip = makeClipVideo(src, w);
            const editor = buildTrimEditor(clip, w);
            container.append(title, clip, editor);
        }

        const src = videoSrcOf(w);
        if (src) { mount(src); return container; }

        // Клип гостя лежит в IndexedDB — тянем асинхронно.
        if (w && w.id && Number(w.videoEnd) > Number(w.videoStart) && typeof getClipUrl === 'function') {
            getClipUrl(w.id).then((url) => { if (url) mount(url); }).catch(() => {});
        }
        return container;
    }

    window.AnimeiClipTrim = { buildForWord, hasClip };
})();
