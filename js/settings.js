// Единый клиентский стор пользовательских настроек.
// Хранится в localStorage под ключом animei:settings (JSON).
// Часть значений «зеркалится» в уже существующие ключи (animei:volume,
// animei:romaji), чтобы плеер и другие модули, читающие их напрямую, видели
// выбор пользователя без переписывания их логики.
//
// Подключать РАНО (до i18n/app), чтобы тема применялась как можно быстрее.
// Наружу: window.AnimeiSettings { get, set, all, DEFAULTS, effectiveTheme, applyTheme }.

(function () {
    const KEY = 'animei:settings';

    const DEFAULTS = {
        theme: 'dark',                 // dark | light | system
        // Плеер / субтитры
        subSize: 'md',                 // sm | md | lg — размер текста субтитров
        playerRomaji: true,            // показывать ромадзи в плеере по умолчанию
        playerTranslation: true,       // показывать перевод в списке субтитров
        autoSyncSubs: true,            // автоматически подгонять сдвиг субтитров
        // Воспроизведение / звук
        volume: 1,                     // громкость по умолчанию 0..1
        autopause: false,              // авто-пауза после каждой реплики
        loopClips: false,              // зацикливать клипы слов в карточках
        // Режим обучения
        newPerDay: 20,                 // сколько новых карточек вводить в день (очередь сверх лимита ждёт)
        studyTranscription: 'romaji',  // kana | romaji | both | none — транскрипция слова
        studySentenceRomaji: true,     // ромадзи над каждым словом предложения (при ромадзи-транскрипции)
        studyAutoplayClip: true,       // автозапуск клипа на обороте карточки
    };

    function readStore() {
        try {
            return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
        } catch {
            return { ...DEFAULTS };
        }
    }

    const state = readStore();

    // Подхватываем актуальные значения из «легаси»-ключей, которые пишет плеер,
    // чтобы настройки отражали текущее состояние.
    const legacyVol = parseFloat(localStorage.getItem('animei:volume'));
    if (!Number.isNaN(legacyVol)) state.volume = Math.min(1, Math.max(0, legacyVol));
    const legacyRomaji = localStorage.getItem('animei:romaji');
    if (legacyRomaji != null) state.playerRomaji = legacyRomaji === 'on';

    function persist() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ }
    }

    function get(k) {
        return k in state ? state[k] : DEFAULTS[k];
    }

    function set(k, v) {
        state[k] = v;
        persist();

        // Зеркалим ключи, которые читают другие модули напрямую.
        if (k === 'volume') localStorage.setItem('animei:volume', String(v));
        if (k === 'playerRomaji') localStorage.setItem('animei:romaji', v ? 'on' : 'off');
        if (k === 'theme') applyTheme();

        if (typeof window.animeiTrack === 'function') {
            window.animeiTrack('setting', k + ':' + v);
        }
        document.dispatchEvent(new CustomEvent('animei:settingchange', { detail: { key: k, value: v } }));
    }

    function effectiveTheme() {
        const th = state.theme;
        if (th === 'system') {
            return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
                ? 'light' : 'dark';
        }
        return th === 'light' ? 'light' : 'dark';
    }

    function applyTheme() {
        document.documentElement.setAttribute('data-theme', effectiveTheme());
    }

    // Применяем тему сразу (скрипт подключается рано — до первой отрисовки контента).
    applyTheme();

    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: light)');
        const onSystemChange = () => { if (state.theme === 'system') applyTheme(); };
        if (mq.addEventListener) {
            mq.addEventListener('change', onSystemChange);
        } else if (mq.addListener) {
            mq.addListener(onSystemChange); // Safari <14
        }
    }

    window.AnimeiSettings = {
        get,
        set,
        all: () => ({ ...state }),
        DEFAULTS,
        effectiveTheme,
        applyTheme,
    };
})();
