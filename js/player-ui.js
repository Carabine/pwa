// Своё управление видео вместо стандартного браузерного.
// Панель в стиле лендинга (градиент сакура→фиолет), большая кнопка Play,
// полноэкранный режим, в котором остаются наши субтитры и словарь.
// Подключается ПОСЛЕ player.js — использует тот же элемент <video>.

(function () {
    'use strict';

    const video = document.getElementById('video');
    const wrap = document.getElementById('video-wrap');
    const ui = document.getElementById('player-ui');
    if (!video || !wrap || !ui) return;

    const bigPlay = document.getElementById('big-play');
    const playBtn = document.getElementById('ctrl-play');
    const muteBtn = document.getElementById('ctrl-mute');
    const volumeSlider = document.getElementById('ctrl-volume');
    const timeLabel = document.getElementById('ctrl-time');
    const speedBtn = document.getElementById('ctrl-speed');
    const fsBtn = document.getElementById('ctrl-fs');
    const seek = document.getElementById('seek');
    const seekFill = document.getElementById('seek-fill');
    const seekBuffered = document.getElementById('seek-buffered');

    const ICONS = {
        play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.55.88l10.8-6.86a1.04 1.04 0 0 0 0-1.76L9.55 4.26A1.04 1.04 0 0 0 8 5.14z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
        volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.3 5.7a9 9 0 0 1 0 12.6"/></svg>',
        volumeLow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
        muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/></svg>',
        fs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
        fsExit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h3a2 2 0 0 0 2-2V3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/></svg>',
        // «Театр»: кадр видео + правая колонка (субтитры) + нижняя полоса (реплика).
        theater: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M15 5v14"/><path d="M3 14.5h12"/></svg>',
    };

    const VOLUME_KEY = 'animei:volume';
    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

    // Большая кнопка Play центрируется по области НАД нижними контролами
    // (top: calc(...) c --controls-h в css) — панель видна вместе с кнопкой
    // и центр всего кадра казался смещённым вниз.
    const bottomPanel = ui.querySelector('.player-ui__bottom');
    if (bottomPanel) {
        const syncControlsH = () => {
            // Считаем только видимую часть панели (без прозрачного паддинга под
            // градиент сверху) — с полной высотой кнопка задиралась слишком высоко.
            const pad = parseFloat(getComputedStyle(bottomPanel).paddingTop) || 0;
            wrap.style.setProperty('--controls-h', (bottomPanel.offsetHeight - pad) + 'px');
        };
        if (window.ResizeObserver) new ResizeObserver(syncControlsH).observe(bottomPanel);
        else syncControlsH();
    }

    // ---------- Время ----------

    function fmt(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    }

    function updateTime() {
        timeLabel.textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
        if (!dragging && video.duration > 0) {
            seekFill.style.width = (video.currentTime / video.duration * 100) + '%';
        }
    }

    function updateBuffered() {
        if (!(video.duration > 0) || !video.buffered.length) return;
        // Показываем буфер вокруг текущей позиции — этого достаточно для полосы
        let end = 0;
        for (let i = 0; i < video.buffered.length; i++) {
            if (video.buffered.start(i) <= video.currentTime + 0.5) end = Math.max(end, video.buffered.end(i));
        }
        seekBuffered.style.width = Math.min(100, end / video.duration * 100) + '%';
    }

    // ---------- Play / pause ----------

    function updatePlayState() {
        const paused = video.paused;
        playBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
        wrap.classList.toggle('is-paused', paused);
        if (paused) showUi(); else scheduleHide();
    }

    function togglePlay() {
        video.paused ? video.play().catch(() => {}) : video.pause();
    }

    playBtn.addEventListener('click', togglePlay);
    bigPlay.addEventListener('click', togglePlay);
    video.addEventListener('play', updatePlayState);
    video.addEventListener('pause', updatePlayState);
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('durationchange', updateTime);
    video.addEventListener('progress', updateBuffered);
    video.addEventListener('timeupdate', updateBuffered);

    // ---------- Перемотка ----------

    let dragging = false;

    function seekRatio(e) {
        const rect = seek.getBoundingClientRect();
        return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    }

    seek.addEventListener('pointerdown', (e) => {
        if (!(video.duration > 0)) return;
        dragging = true;
        seek.setPointerCapture(e.pointerId);
        seekFill.style.width = seekRatio(e) * 100 + '%';
    });

    seek.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        seekFill.style.width = seekRatio(e) * 100 + '%';
    });

    seek.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        dragging = false;
        video.currentTime = seekRatio(e) * video.duration;
    });

    seek.addEventListener('pointercancel', () => { dragging = false; });

    function seekBy(delta) {
        if (!(video.duration > 0)) return;
        video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + delta));
        showUi();
    }

    // ---------- Клики и тапы по видео ----------
    // Одиночный — плей/пауза (с задержкой TAP_WINDOW, чтобы не мигать паузой при
    // двойном), двойной по левой/правой трети — перемотка ±10 сек, по центру —
    // полный экран. Серия тапов по тому же краю продолжает мотать без пауз между
    // «двойными» (как в YouTube), надпись копит сумму. Свой детектор вместо
    // dblclick — на iOS dblclick по <video> приходит нестабильно.

    const DBLTAP_SEEK = 10; // сек за один двойной тап
    const TAP_WINDOW = 350; // мс между тапами одной серии

    function makeSeekFlash(side) {
        const el = document.createElement('div');
        el.className = 'player-ui__seek-flash player-ui__seek-flash--' + (side < 0 ? 'left' : 'right');
        wrap.appendChild(el);
        return el;
    }
    const flashLeft = makeSeekFlash(-1);
    const flashRight = makeSeekFlash(1);

    let tapTime = 0;
    let tapTimer = null;
    let streakSide = 0;  // −1/1 — идёт серия перемоток в эту сторону
    let streakTotal = 0; // сумма секунд за серию (для надписи)
    let flashTimer = null;

    function flashSeek(side) {
        streakTotal += DBLTAP_SEEK;
        seekBy(side * DBLTAP_SEEK);
        const el = side < 0 ? flashLeft : flashRight;
        (side < 0 ? flashRight : flashLeft).classList.remove('is-on');
        el.textContent = (side < 0 ? '−' : '+') + streakTotal + ' сек';
        el.classList.add('is-on');
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => el.classList.remove('is-on'), 700);
    }

    function tapSide(e) {
        const rect = video.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        return x < 1 / 3 ? -1 : x > 2 / 3 ? 1 : 0;
    }

    video.addEventListener('click', (e) => {
        const now = performance.now();
        const side = tapSide(e);
        const inSeries = now - tapTime < TAP_WINDOW;
        tapTime = now;
        if (inSeries) {
            clearTimeout(tapTimer);
            tapTimer = null;
            if (streakSide) {
                // Серию продолжает только тап по тому же краю, чужой — гасит её
                if (side === streakSide) flashSeek(side);
                else { streakSide = 0; streakTotal = 0; }
                return;
            }
            if (side) { streakSide = side; streakTotal = 0; flashSeek(side); }
            else toggleFullscreen();
            return;
        }
        streakSide = 0;
        streakTotal = 0;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(togglePlay, TAP_WINDOW);
    });

    // ---------- Громкость ----------
    // Без всплывающей панели: ползунок сидит в одном ряду с кнопкой звука и просто
    // ВЫЕЗЖАЕТ вправо при наведении/фокусе (как в YouTube). Кнопка и ползунок — в
    // одной группе .player-ui__vol, поэтому наведение не «срывается» при
    // перетаскивании. Клик по кнопке — мьют. На таче hover нет: тап по кнопке
    // мьютит и ненадолго показывает ползунок (is-open), который сам сворачивается
    // по таймеру или тапу мимо — иначе раскрытый ползунок было не закрыть.

    const volWrap = muteBtn.closest('.player-ui__vol');
    const touchLike = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    let volHideTimer = null;

    function showVolPopup() {
        volWrap.classList.add('is-open');
        clearTimeout(volHideTimer);
        volHideTimer = setTimeout(() => volWrap.classList.remove('is-open'), 3000);
    }

    if (touchLike) {
        // Тап мимо группы звука — закрываем ползунок сразу, не дожидаясь таймера.
        document.addEventListener('click', (e) => {
            if (!volWrap.contains(e.target)) {
                clearTimeout(volHideTimer);
                volWrap.classList.remove('is-open');
            }
        });
    }

    function volumeIcon() {
        if (video.muted || video.volume === 0) return ICONS.muted;
        return video.volume < 0.5 ? ICONS.volumeLow : ICONS.volume;
    }

    function updateVolumeUi() {
        muteBtn.innerHTML = volumeIcon();
        const v = video.muted ? 0 : video.volume;
        volumeSlider.value = v;
        volumeSlider.style.setProperty('--vol', (v * 100) + '%'); // заливка дорожки (webkit)
    }

    volumeSlider.addEventListener('input', () => {
        video.volume = parseFloat(volumeSlider.value);
        video.muted = video.volume === 0;
        localStorage.setItem(VOLUME_KEY, String(video.volume));
        // Пока пользователь крутит громкость — не даём попапу свернуться под пальцем.
        if (touchLike) showVolPopup();
    });

    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        // Сняли мьют кнопкой, а уровень был 0 — вернём слышимую громкость.
        if (!video.muted && video.volume === 0) {
            video.volume = 0.5;
            localStorage.setItem(VOLUME_KEY, '0.5');
        }
        if (touchLike) showVolPopup();
    });

    video.addEventListener('volumechange', updateVolumeUi);

    const savedVolume = parseFloat(localStorage.getItem(VOLUME_KEY));
    if (isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) video.volume = savedVolume;
    updateVolumeUi();

    // ---------- Скорость ----------
    // Меню выбора скорости над кнопкой — как у качества/звука, а не циклом по клику.

    (function setupSpeedControl() {
        const speedWrap = document.createElement('div');
        speedWrap.className = 'player-ui__speed-wrap';
        speedBtn.parentNode.insertBefore(speedWrap, speedBtn);
        speedWrap.appendChild(speedBtn);

        const menu = document.createElement('div');
        menu.className = 'player-ui__speed-menu';
        speedWrap.appendChild(menu);

        const fmtRate = (r) => (r === 1 ? '1' : String(r)) + '×';
        const closeMenu = () => speedWrap.classList.remove('is-open');

        function syncBtn() {
            speedBtn.textContent = fmtRate(video.playbackRate);
            speedBtn.classList.toggle('is-custom', video.playbackRate !== 1);
        }

        function buildMenu() {
            menu.innerHTML = '';
            const cur = video.playbackRate;
            SPEEDS.forEach((r) => {
                const opt = document.createElement('button');
                opt.type = 'button';
                opt.className = 'player-ui__speed-opt' + (r === cur ? ' is-active' : '');
                opt.textContent = fmtRate(r);
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeMenu();
                    video.playbackRate = r;
                    syncBtn();
                });
                menu.appendChild(opt);
            });
        }

        speedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (speedWrap.classList.contains('is-open')) { closeMenu(); return; }
            // Не держим два меню открытыми сразу (качество/скорость/звук).
            document.querySelectorAll('.player-ui__quality-wrap.is-open, .player-ui__speed-wrap.is-open, .player-ui__vol.is-open')
                .forEach((w) => { if (w !== speedWrap) w.classList.remove('is-open'); });
            buildMenu();
            speedWrap.classList.add('is-open');
        });

        document.addEventListener('click', (e) => {
            if (!speedWrap.contains(e.target)) closeMenu();
        });

        video.addEventListener('ratechange', syncBtn);
        syncBtn();
    })();

    // ---------- Полный экран ----------
    // Разворачиваем не <video>, а всю обёртку: тогда наши панель, субтитры
    // и словарная карточка остаются видны. Субтитры и попап на время
    // полного экрана переносим внутрь обёртки — иначе браузер их спрячет.

    const nowCue = document.getElementById('now-cue');
    const popup = document.getElementById('word-popup');
    const layoutEl = document.querySelector('.player-layout');
    const theaterBtn = document.getElementById('ctrl-theater');
    const homes = new Map();

    function moveIn(el, target) {
        if (!el) return;
        homes.set(el, { parent: el.parentNode, next: el.nextSibling });
        (target || wrap).appendChild(el);
    }

    function moveBack(el) {
        const home = homes.get(el);
        if (!el || !home) return;
        home.parent.insertBefore(el, home.next);
        homes.delete(el);
    }

    function isFs() {
        return document.fullscreenElement === wrap;
    }

    function toggleFullscreen() {
        if (isFs()) {
            document.exitFullscreen().catch(() => {});
        } else if (wrap.requestFullscreen) {
            wrap.requestFullscreen().catch(() => {});
        } else if (video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen(); // iPhone: только нативный полноэкранный плеер
        }
    }

    // Телефон/планшет — грубый указатель или узкий экран.
    const mobileLike = () => touchLike || window.matchMedia('(max-width: 820px)').matches;

    function lockLandscape() {
        try {
            const o = screen.orientation;
            if (o && o.lock) o.lock('landscape').catch(() => {});
        } catch (e) { /* не поддерживается — ничего страшного */ }
    }
    function unlockOrientation() {
        try {
            const o = screen.orientation;
            if (o && o.unlock) o.unlock();
        } catch (e) {}
    }

    // ---------- «Театр»: видео крупно + субтитры справа + реплика снизу ----------
    // Реальный fullscreen на всю раскладку (нужен для блокировки ориентации на
    // Android); где его нет для <div> (iOS) — fixed-оверлей через класс .theater.
    // Словарный попап переносим ВНУТРЬ раскладки — иначе в реальном fullscreen
    // (виден только fullscreen-элемент) он бы не показывался.
    let savedMtab = null;

    // Театр = реальный fullscreen всей раскладки + авто-поворот в альбомную.
    // Раньше ломалось не из-за fullscreen, а из-за бага в обработчике
    // fullscreenchange (он на входе в театр тут же делал unlockOrientation +
    // возвращал попап). Обработчик ниже это учитывает. Если fullscreen/lock не
    // выйдет (напр. iOS для <div>), остаётся оверлей, а CSS сам разложит по
    // фактической ориентации (портрет — стопкой).
    function enterTheater() {
        if (!layoutEl) return;
        savedMtab = layoutEl.classList.contains('mtab-settings') ? 'settings'
            : layoutEl.classList.contains('mtab-subs') ? 'subs' : '';
        layoutEl.classList.remove('mtab-settings', 'mtab-subs');
        layoutEl.classList.add('theater');
        moveIn(popup, layoutEl);
        if (theaterBtn) theaterBtn.classList.add('is-active');
        if (layoutEl.requestFullscreen) {
            layoutEl.requestFullscreen().then(lockLandscape).catch(() => {});
        }
    }

    function exitTheater() {
        if (!layoutEl) return;
        layoutEl.classList.remove('theater');
        moveBack(popup);
        if (savedMtab) layoutEl.classList.add('mtab-' + savedMtab);
        savedMtab = null;
        if (theaterBtn) theaterBtn.classList.remove('is-active');
        unlockOrientation();
        if (document.fullscreenElement === layoutEl) document.exitFullscreen().catch(() => {});
    }

    function toggleTheater() {
        if (layoutEl && layoutEl.classList.contains('theater')) exitTheater();
        else enterTheater();
    }

    fsBtn.addEventListener('click', toggleFullscreen);
    fsBtn.innerHTML = ICONS.fs;
    if (theaterBtn) {
        theaterBtn.addEventListener('click', toggleTheater);
        theaterBtn.innerHTML = ICONS.theater;
    }

    document.addEventListener('fullscreenchange', () => {
        const el = document.fullscreenElement;
        const inWrap = el === wrap;
        wrap.classList.toggle('is-fs', inWrap);
        fsBtn.innerHTML = inWrap ? ICONS.fsExit : ICONS.fs;

        // Видео-fullscreen (кнопка «на весь экран»)
        if (inWrap) {
            if (mobileLike()) lockLandscape();       // телефон — только видео + альбомная
            else { moveIn(nowCue); moveIn(popup); }  // ПК — субтитры/словарь поверх
            return;
        }
        // Вошли в театр (fullscreen на всю раскладку) — только докручиваем поворот,
        // НИКАКОЙ уборки (класс/попап уже выставлены в enterTheater).
        if (el === layoutEl) {
            lockLandscape();
            return;
        }
        // Ничего не в fullscreen. Возвращаем перенесённое из видео-fs.
        moveBack(nowCue);
        // Если театр был активен и его закрыли системно (Esc/жест «назад») — гасим.
        if (layoutEl && layoutEl.classList.contains('theater')) {
            layoutEl.classList.remove('theater');
            moveBack(popup);
            if (savedMtab) layoutEl.classList.add('mtab-' + savedMtab);
            savedMtab = null;
            if (theaterBtn) theaterBtn.classList.remove('is-active');
        } else {
            moveBack(popup);
        }
        unlockOrientation();
    });

    // ---------- Автоскрытие панели ----------

    let hideTimer = null;

    function showUi() {
        wrap.classList.add('show-ui');
        scheduleHide();
    }

    function scheduleHide() {
        clearTimeout(hideTimer);
        if (video.paused) return; // на паузе панель не прячем
        hideTimer = setTimeout(() => wrap.classList.remove('show-ui'), 2600);
    }

    wrap.addEventListener('pointermove', showUi);
    wrap.addEventListener('touchstart', showUi, { passive: true });
    wrap.addEventListener('mouseleave', () => {
        if (!video.paused) {
            clearTimeout(hideTimer);
            wrap.classList.remove('show-ui');
        }
    });

    // ---------- Хоткеи: F — весь экран, M — звук, стрелки — ±5 секунд ----------
    // Space/A/S/D живут в player.js.

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        switch (e.code) {
            case 'KeyF':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 'KeyM':
                e.preventDefault();
                video.muted = !video.muted;
                break;
            case 'ArrowLeft':
                e.preventDefault();
                seekBy(-5);
                break;
            case 'ArrowRight':
                e.preventDefault();
                seekBy(5);
                break;
            case 'Escape':
                // Театр — не реальный fullscreen, поэтому Esc закрываем сами.
                if (layoutEl && layoutEl.classList.contains('theater')) {
                    e.preventDefault();
                    exitTheater();
                }
                break;
        }
    });

    // ---------- Старт ----------

    updatePlayState();
    updateVolumeUi();
    updateTime();
})();
