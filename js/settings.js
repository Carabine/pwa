// Единый клиентский стор пользовательских настроек.
// Хранится в localStorage под ключом animei:settings (JSON).
// Часть значений «зеркалится» в уже существующие ключи (animei:volume,
// animei:romaji), чтобы плеер и другие модули, читающие их напрямую, видели
// выбор пользователя без переписывания их логики.
//
// Подключать РАНО (до i18n/app), чтобы тема применялась как можно быстрее.
// Наружу: window.AnimeiSettings { get, set, all, DEFAULTS, effectiveTheme, applyTheme }
// и глобальный lsJson().

// Чтение JSON из localStorage: отсутствующее/битое значение → fallback.
// Живёт здесь, потому что settings.js — первый наш скрипт на каждой странице.
function lsJson(key, fallback = null) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

(function () {
    const KEY = 'animei:settings';
    const UNIFIED_KEY = 'animei:readingUnified';   // отметка о слиянии настроек чтения

    const DEFAULTS = {
        theme: 'dark',                 // dark | light | system
        // Плеер / субтитры
        subSize: 'md',                 // sm | md | lg — размер текста субтитров
        playerTranslation: true,       // показывать перевод в списке субтитров
        autoSyncSubs: true,            // автоматически подгонять сдвиг субтитров
        // Воспроизведение / звук
        volume: 1,                     // громкость по умолчанию 0..1
        autopause: false,              // авто-пауза после каждой реплики
        loopClips: false,              // зацикливать клипы слов в карточках
        // Режим обучения
        newPerDay: 20,                 // сколько новых карточек вводить в день (очередь сверх лимита ждёт)
        // Одна транскрипция на всё приложение: чтение над субтитрами, в «Моих
        // словах», в «Своём видео» и на карточках. Раньше их было две
        // (studyTranscription + playerRomaji), и они расходились.
        studyTranscription: 'romaji',  // kana | romaji (легаси both/none = romaji)
        studySentenceRomaji: true,     // ромадзи над каждым словом предложения (при ромадзи-транскрипции)
        studyAutoplayClip: true,       // автозапуск клипа на обороте карточки
        // Что учим: ja | en. Не путать с языком интерфейса (animei:lang) —
        // тот про меню, этот про слова, план и карточки. См. window.LearnLang.
        learnLang: 'ja',
    };

    const state = { ...DEFAULTS, ...lsJson(KEY, {}) };

    // Подхватываем актуальные значения из «легаси»-ключей, которые пишет плеер,
    // чтобы настройки отражали текущее состояние.
    const legacyVol = parseFloat(localStorage.getItem('animei:volume'));
    if (!Number.isNaN(legacyVol)) state.volume = Math.min(1, Math.max(0, legacyVol));
    // Слияние двух старых настроек чтения в одну. Плеер хранил свой выбор в
    // animei:readingMode (совсем старый ключ — animei:romaji), карточки — в
    // studyTranscription. Ромадзи стоял дефолтом у обеих, поэтому явным
    // выбором считаем только кану: выбрал её где-нибудь — получаешь кану везде.
    if (localStorage.getItem(UNIFIED_KEY) !== '1') {
        const legacyMode = localStorage.getItem('animei:readingMode');
        const legacyRomaji = localStorage.getItem('animei:romaji');
        const kana = state.studyTranscription === 'kana'
            || legacyMode === 'kana' || legacyRomaji === 'off';
        state.studyTranscription = kana ? 'kana' : 'romaji';
        try { localStorage.setItem(UNIFIED_KEY, '1'); } catch { /* quota */ }
        persist();
    }
    // Плеер, «Мои слова» и «Своё видео» читают ключ напрямую — держим его в паре.
    mirrorReading();

    // Зеркало транскрипции в ключи плеера: их читают модули, которые про
    // AnimeiSettings могут не знать (и старые вкладки, открытые до обновления).
    function mirrorReading() {
        const mode = state.studyTranscription === 'kana' ? 'kana' : 'romaji';
        try {
            localStorage.setItem('animei:readingMode', mode);
            localStorage.setItem('animei:romaji', mode === 'romaji' ? 'on' : 'off');
        } catch { /* quota */ }
    }

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
        if (k === 'studyTranscription') mirrorReading();
        if (k === 'theme') applyTheme();

        // Громкость крутят ползунком — это десятки событий на одно движение, не выбор.
        if (k !== 'volume' && typeof window.animeiTrack === 'function') {
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
        const th = effectiveTheme();
        document.documentElement.setAttribute('data-theme', th);
        // Цвет системной строки браузера держим в паре с темой. Первое значение
        // ставит инлайн-бутстрап в <head> (до первой отрисовки), здесь — все
        // последующие смены: ручная в настройках и системная при theme:'system'.
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', th === 'light' ? '#f4f5fa' : '#0a0a0f');
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

// Изучаемый язык — одна настройка на всё приложение (AnimeiSettings.learnLang).
// Язык лежит ВНУТРИ записи слова (word.lang), а не в отдельных ключах
// хранилища: синк, офлайн-ящики и гостевое зеркало о языках не знают, меняются
// только фильтры при чтении. У старых записей поля нет — они японские.
// Переключатель живёт в меню профиля (app.js, renderAuthState) и показывается
// только при русском/украинском интерфейсе: английский интерфейс + английский
// как цель — перевод EN→EN, бессмысленно.
(function () {
    const LANGS = ['ja', 'en'];
    const JP_RE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;

    function get() {
        const v = window.AnimeiSettings.get('learnLang');
        return LANGS.includes(v) ? v : 'ja';
    }

    // Язык записи: явное поле, иначе японский — до появления английского других
    // слов не было. (Сервер поле lang пока не хранит — см. концепцию, этап 0.)
    function wordLang(w) {
        return (w && LANGS.includes(w.lang)) ? w.lang : 'ja';
    }

    // Какой язык проставить новому слову: японская письменность всегда ja —
    // из японского плеера в английском режиме слово не должно уехать в EN.
    function tagFor(text) {
        return JP_RE.test(String(text || '')) ? 'ja' : get();
    }

    function filter(words, lang = get()) {
        if (!Array.isArray(words)) return [];
        return words.filter((w) => w && wordLang(w) === lang);
    }

    // Английский режим открыт всем: английская дорожка KAA, английский текст
    // серии, словарь и карточки подключены (v0.0.586). Оставлено как точка
    // отключения на случай, если источник ляжет.
    function englishAvailable() {
        return true;
    }

    window.LearnLang = {
        LANGS,
        get,
        set: (v) => { if (LANGS.includes(v)) window.AnimeiSettings.set('learnLang', v); },
        wordLang,
        tagFor,
        filter,
        englishAvailable,
    };
})();
