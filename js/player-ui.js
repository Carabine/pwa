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
    };

    const VOLUME_KEY = 'animei:volume';
    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

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
    video.addEventListener('click', togglePlay);
    video.addEventListener('dblclick', toggleFullscreen);
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

    // ---------- Громкость ----------
    // Клик по кнопке звука открывает панельку с ползунком — единый стиль и
    // поведение с меню скорости/качества. Раньше панель выезжала по hover и
    // капризничала при перетаскивании (уводишь курсор с тонкого ползунка — она
    // закрывается, и звук «не доезжал» до края). Теперь: клик — открыть, тянуть
    // сколько нужно, клик мимо — закрыть. Мьют — кнопкой в панельке и клавишей M.

    const volGroup = muteBtn.closest('.player-ui__vol');
    const volPopup = document.querySelector('.player-ui__vol-popup');

    // Кнопка mute и проценты внутри панельки (ползунок уже есть в разметке).
    const volMute = document.createElement('button');
    volMute.type = 'button';
    volMute.className = 'player-ui__vol-mute';
    volMute.setAttribute('aria-label', 'Mute');
    const volPct = document.createElement('span');
    volPct.className = 'player-ui__vol-pct';
    if (volPopup) {
        volPopup.insertBefore(volMute, volumeSlider);
        volPopup.appendChild(volPct);
    }

    function volumeIcon() {
        if (video.muted || video.volume === 0) return ICONS.muted;
        return video.volume < 0.5 ? ICONS.volumeLow : ICONS.volume;
    }

    function updateVolumeUi() {
        const icon = volumeIcon();
        muteBtn.innerHTML = icon;
        volMute.innerHTML = icon;
        const v = video.muted ? 0 : video.volume;
        volumeSlider.value = v;
        volumeSlider.style.setProperty('--vol', (v * 100) + '%'); // заливка дорожки (webkit)
        volPct.textContent = Math.round(v * 100) + '%';
    }

    volumeSlider.addEventListener('input', () => {
        video.volume = parseFloat(volumeSlider.value);
        video.muted = video.volume === 0;
        localStorage.setItem(VOLUME_KEY, String(video.volume));
    });

    volMute.addEventListener('click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
    });

    const closeVol = () => { if (volGroup) volGroup.classList.remove('is-open'); };
    const openVol = () => {
        if (!volGroup) return;
        // не держим несколько плеерных меню открытыми сразу
        document.querySelectorAll('.player-ui__quality-wrap.is-open, .player-ui__speed-wrap.is-open')
            .forEach((w) => w.classList.remove('is-open'));
        volGroup.classList.add('is-open');
    };

    // На тач-раскладке панель громкости скрыта (см. CSS) — там кнопка просто
    // мьютит, как раньше; ползунок звука на телефоне малополезен.
    const isTouchLayout = () => window.matchMedia('(max-width: 900px)').matches;

    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!volGroup || isTouchLayout()) { video.muted = !video.muted; return; }
        volGroup.classList.contains('is-open') ? closeVol() : openVol();
    });

    document.addEventListener('click', (e) => {
        if (volGroup && !volGroup.contains(e.target)) closeVol();
    });

    video.addEventListener('volumechange', updateVolumeUi);

    const savedVolume = parseFloat(localStorage.getItem(VOLUME_KEY));
    if (isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) video.volume = savedVolume;

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
    const homes = new Map();

    function moveIn(el) {
        if (!el) return;
        homes.set(el, { parent: el.parentNode, next: el.nextSibling });
        wrap.appendChild(el);
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

    fsBtn.addEventListener('click', toggleFullscreen);
    fsBtn.innerHTML = ICONS.fs;

    document.addEventListener('fullscreenchange', () => {
        const fs = isFs();
        wrap.classList.toggle('is-fs', fs);
        fsBtn.innerHTML = fs ? ICONS.fsExit : ICONS.fs;
        if (fs) {
            moveIn(nowCue);
            moveIn(popup);
        } else {
            moveBack(nowCue);
            moveBack(popup);
        }
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
        }
    });

    // ---------- Старт ----------

    updatePlayState();
    updateVolumeUi();
    updateTime();
})();
