// Плеер: видео с Kodik (HLS через наш прокси) + японские субтитры
// с kitsunekko, размеченные по словам. Клик по слову — словарь и
// сохранение в коллекцию.

const params = new URLSearchParams(window.location.search);
const shikimoriId = params.get('id');
const titleRu = params.get('title') || '';
const titleRomaji = params.get('name') || titleRu;

// Разовая чистка: до фикса (v0.0.68) при каждой загрузке серии в ключ сдвига
// субтитров писался «0», и автосинк, увидев «сдвиг уже задан», не запускался.
// У кого это залипло — убираем нулевые сдвиги один раз, чтобы автосинк отработал
// заново. Ненулевые (ручные/подобранные) не трогаем.
(function clearStaleZeroOffsets() {
    try {
        if (localStorage.getItem('animei:offsetZeroCleared')) return;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith('animei:subsOffset:') && localStorage.getItem(k) === '0') {
                localStorage.removeItem(k);
            }
        }
        localStorage.setItem('animei:offsetZeroCleared', '1');
    } catch { /* localStorage может быть недоступен */ }
})();

// Разовая чистка №2: автосинк до v0.0.99 брал крайний сдвиг «плато» совпадений
// (допуск ±0.6с) — мелкие сохранённые сдвиги систематически врали до ~0.5с.
// Сбрасываем их, чтобы уточнённый автосинк (медиана остатков на бэкенде)
// подобрал заново. Большие сдвиги (интро MegaPlay, десятки секунд) не трогаем:
// их главная часть верна, а потерять её при неудачном перезапуске дороже.
(function clearBiasedSmallOffsets() {
    try {
        if (localStorage.getItem('animei:offsetResync1')) return;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith('animei:subsOffset:')) continue;
            const v = parseFloat(localStorage.getItem(k));
            if (Number.isFinite(v) && Math.abs(v) <= 2) localStorage.removeItem(k);
        }
        localStorage.setItem('animei:offsetResync1', '1');
    } catch { /* localStorage может быть недоступен */ }
})();

const video = document.getElementById('video');
const burnedSub = document.getElementById('burned-sub');
const videoWrap = document.getElementById('video-wrap');
const videoLoading = document.getElementById('video-loading');
const translationSelect = document.getElementById('translation-select');
const episodeSelect = document.getElementById('episode-select');
const seasonSelect = document.getElementById('season-select');
const seasonGroup = document.getElementById('season-group');
const transcriptList = document.getElementById('transcript-list');
const subsStatus = document.getElementById('subs-status');
const jumpBtn = document.getElementById('transcript-jump');
const subsFixBtn = document.getElementById('subs-fix');
const subsPreciseBtn = document.getElementById('subs-precise');
const subsPreciseStatus = document.getElementById('subs-precise-status');

const state = {
    translations: [],
    episodes: [],          // серии, показанные в дропдауне серий сейчас
    rawEpisodes: [],       // весь список серий текущего тайтла как пришёл от Kodik
    episodeGroups: [],     // серии, разбитые по сезонам (по сбросу нумерации) — фолбэк
    franchiseSeasons: [],  // другие тайтлы-сезоны франшизы (каждый сезон — свой тайтл)
    seasonMode: 'single',  // 'franchise' | 'groups' | 'single'
    seasonIndex: 0,
    burnedCues: [],        // субтитры источника, рисуемые поверх видео как «вжатые»
    burnedIndex: -1,
    subOptions: [],        // варианты селекта: { lang: 'en'|'ru'|null, track }
    subLang: null,         // выбранный язык субтитров; null = «оригинал», без наложения
    provider: 'kodik',     // источник текущей дорожки: 'kodik' | 'megaplay'
    megaMal: null,         // MAL id для MegaPlay-дорожки (оригинальное аудио)
    megaIntro: null,       // { start, end } интро потока MegaPlay — помогает автосинку
    cues: [],
    activeCueIndex: -1,
    offset: 0,
    // Стартовые значения берём из глобальных настроек (js/settings.js).
    autoPause: !!(window.AnimeiSettings && window.AnimeiSettings.get('autopause')),
    autoPauseAt: null,
    showRu: window.AnimeiSettings ? window.AnimeiSettings.get('playerTranslation') !== false : true,
    // Чтение над словами — ОДИН режим: 'kana' ЛИБО 'romaji' (или/или, без «выкл»:
    // чтение всегда сверху). Мигрируем со старых раздельных ключей furigana/romaji.
    readingMode: (function () {
        const saved = localStorage.getItem('animei:readingMode');
        if (saved === 'romaji') return 'romaji';
        if (saved === 'kana') return 'kana';
        // Легаси-ключ плеера: уважаем явный выбор старых пользователей.
        const legacy = localStorage.getItem('animei:romaji');
        if (legacy === 'on') return 'romaji';
        if (legacy === 'off') return 'kana';
        return 'romaji'; // новый пользователь — по умолчанию ромадзи
    })(),
    aiAvailable: false,
    knownWords: new Set(),
    hls: null,
    qualities: {},         // { '720': '/proxy/hls?url=…', '480': …, '360': … } — по одному плейлисту на качество
    masterUrl: null,       // мастер-манифест со всеми качествами — режим «Авто» (ABR под скорость сети)
    pendingSeek: null,     // { time, playing } — восстановить позицию после смены качества
    resumeTime: null,      // сек — продолжить серию с сохранённой позиции просмотра
    currentVideoUrl: '',   // адрес текущего HLS-потока — уходит в слово, чтобы сервер нарезал клип
    popupContext: null,
    followCue: true,       // список сам едет за текущей репликой; сбрасываем, когда листают вручную
    syncing: false,        // идёт автосинк: не тащим список за репликой и прячем «К текущей»
    shortFormChibi: new Set(), // индексы групп-серий, определённых как короткометражки (чиби/PV)
    showExtras: false,     // показывать ли скрытые «доп. материалы» (чиби и т.п.)
    epLenCache: {},        // длительность серии по её id (сек) — чтобы не зондировать повторно
    autoSyncKey: null,     // для какой серии уже пытались автосинк субтитров
    syncPromise: null,     // промис текущего автосинка — сохранение клипа его ждёт
};

// Кэш ИИ-разборов на время сессии: повторный клик по той же реплике мгновенный
const explainCache = new Map();

// Название тайтла в шапку плеера не выводим (по просьбе — на странице с видео
// заголовок лишний). Оставляем его только во вкладке браузера.
if (titleRu) {
    document.title = titleRu + ' — Animei';
}

// Размер субтитров из глобальных настроек (js/settings.js) — влияет на строку
// под видео и на список субтитров (см. player.css [data-subsize]).
if (window.AnimeiSettings) {
    document.documentElement.setAttribute('data-subsize', window.AnimeiSettings.get('subSize') || 'md');
}

// ---------- Загрузка тайтла ----------

async function init() {
    if (!shikimoriId) {
        videoLoading.classList.add('is-error'); videoLoading.textContent = t('player.noTitle');
        return;
    }

    // Поэтапный статус загрузки: видно, что происходит, а не просто спиннер
    // на 10 секунд (холодный тайтл резолвится по внешним источникам долго).
    videoLoading.textContent = t('player.stageTracks');

    loadKnownWords();
    loadFranchise();   // параллельно: другие сезоны франшизы для дропдауна

    try {
        const { data: res } = await client.get('catalog/anime/' + shikimoriId);
        const info = res.data;

        // Дорожки с оригинальной японской озвучкой (субтитры) — наверх.
        // Kodik не всегда помечает их type='subtitles' (у «Тетради смерти»
        // японская дорожка так и терялась), поэтому распознаём ещё и по названию.
        // Оставляем только японскую речь (оригинал + сабовые дорожки Kodik/
        // AllAnime) — русские дубляжи для изучения языка бесполезны, убираем их
        // из выбора. Фолбэк: если у тайтла ВООБЩЕ нет японской дорожки, оставляем
        // что есть, чтобы не оставить пользователя без видео.
        let tracks = info.translations.filter(isJpTrack);
        // Раньше дубляжи возвращались в список ещё и тогда, когда японские дорожки
        // были только от запасных провайдеров: AllAnime и MegaPlay часто отваливались,
        // и без этого тайтл вообще не открывался. После подключения AnimeJoy + Sibnet
        // + KickAssAnime такие тайтлы (Гуль, ДжоДжо 5) играют сами, и десяток озвучек
        // в списке остался просто мусором. Теперь дубляжи показываем ТОЛЬКО когда
        // японской дорожки нет вовсе — чтобы не оставить пользователя без видео.
        if (!tracks.length) tracks = [...info.translations];
        state.translations = tracks.sort((a, b) => {
            const aJp = isJpTrack(a), bJp = isJpTrack(b);
            if (aJp !== bJp) return aJp ? -1 : 1;
            // MegaPlay — ЗАПАСНОЙ оригинал: он для тайтлов, где у Kodik нет своей
            // японской дорожки (напр. «Тетрадь смерти»). Если у Kodik есть родная
            // сабная дорожка (Crunchyroll «Субтитры»), она приоритетнее и идёт по
            // умолчанию — её субтитры совпадают с видео (MegaPlay — другой монтаж,
            // из-за чего сабы «уезжали»).
            // AllAnime — тоже ЗАПАСНОЙ оригинал (у него вжат англ. саб): если у
            // Kodik есть родная JP-дорожка, она приоритетнее и идёт по умолчанию.
            // AnimeJoy тоже запасной оригинал: прямой mp4 удобен пайплайну, но у
            // него вжат русский саб, а родная сабная дорожка Kodik точнее совпадает
            // с видео — поэтому Kodik остаётся приоритетнее.
            const isFallbackOrig = (p) => p === 'megaplay' || p === 'allanime'
                || p === 'animejoy' || p === 'kickassanime';
            const aMp = isFallbackOrig(a.provider) ? 1 : 0;
            const bMp = isFallbackOrig(b.provider) ? 1 : 0;
            if (aMp !== bMp) return aMp - bMp;
            const aCr = /crunchyroll|субтитр/i.test(a.title) ? 0 : 1;
            const bCr = /crunchyroll|субтитр/i.test(b.title) ? 0 : 1;
            if (aCr !== bCr) return aCr - bCr;
            return a.title.localeCompare(b.title);
        });

        if (!state.translations.length) {
            videoLoading.classList.add('is-error'); videoLoading.textContent = t('player.noPlayers');
            return;
        }

        renderTranslations();
        // По умолчанию — субтитры на языке интерфейса, если они есть у тайтла;
        // иначе первый доступный вариант (обычно английский, реже «оригинал»).
        // Русские сабы бывают и ВШИТЫМИ (Kodik: lang=null + burned='ru') — для
        // RU/UK-интерфейса это тоже «русские», без этого дефолт съезжал на
        // английские у тайтлов, где у KickAssAnime нет своей русской дорожки.
        const wantSub = getLang() === 'en' ? 'en' : 'ru';
        let pref = state.subOptions.findIndex((o) =>
            o.lang === wantSub || (wantSub === 'ru' && o.burned === 'ru'));
        if (pref < 0) pref = 0;
        await selectTranslation(pref);
    } catch (err) {
        console.error(err);
        videoLoading.classList.add('is-error'); videoLoading.textContent = t('player.notFound');
    }
}

// Оригинальная японская дорожка (озвучка + сабы). Kodik помечает такие
// type='subtitles', но не всегда — подстраховываемся по названию дорожки.
function isJpTrack(tr) {
    if (!tr) return false;
    if (tr.type === 'subtitles') return true;
    // Kodik метит оригинал непоследовательно, поэтому ловим по названию как можно
    // шире: сабы/субтитры, original/ориг, jp/jpn, японский, 日本語, オリジナル.
    return /субтитр|саб|subtitle|\bsub\b|\bjp\b|\bjpn\b|ориг|original|япон|japanese|日本語|オリジナル/i.test(tr.title || '');
}

// Язык ЗВУКА выбранной дорожки — для Whisper (автосинк-верификатор и точный подбор).
// MegaPlay и Kodik-дорожки с оригинальной японской озвучкой (сабы/ориг) = японская
// РЕЧЬ, даже если субтитры русские. Раньше здесь всегда брался subsLang() (язык
// перевода сабов), поэтому по японскому аудио whisper запускался с `-l ru` и матчинг
// всегда падал («не удалось»). Дубляж — на языке перевода.
function trackAudioLang(tr) {
    if (state.provider === 'megaplay') return 'ja';
    if (isJpTrack(tr)) return 'ja';
    return subsLang();
}

// Язык ВЖАТЫХ в видео субтитров источника (метаданных нет — выводим по провайдеру,
// для наших источников надёжно): AllAnime — английские, сабовые/оригинальные
// дорожки Kodik — русские. Дубляж (в фолбэке) вжатых сабов не несёт → null.
function subBurnLang(tr) {
    if (!tr) return null;
    // У KickAssAnime картинка чистая, но английские сабы мы накладываем сверху
    // сами (см. loadBurnedSubs) — на экране пользователь увидит именно их,
    // поэтому метку ставим по тому, что реально будет видно, а не по тому,
    // вжат текст в кадр или нарисован слоем.
    if (tr.provider === 'kickassanime') return 'en';
    if (tr.provider === 'allanime') return 'en';
    if (isJpTrack(tr)) return 'ru';
    return null;
}

// Что ВШИТО в саму картинку источника — независимо от того, накладываем мы
// что-то сверху или нет. Нужно для честной подписи варианта «оригинал»:
// у KickAssAnime кадр чистый, а у AnimeJoy/Sibnet и сабовых дорожек Kodik
// русский текст вжат в видео и никуда не денется.
function pictureSubLang(tr) {
    if (!tr) return null;
    if (tr.provider === 'kickassanime') return null;   // чистый кадр
    if (tr.provider === 'animejoy') return 'ru';
    if (isJpTrack(tr)) return 'ru';
    return null;
}

// Селект «Субтитры» — это выбор ЯЗЫКА, а не источника: источник подбираем сами.
// Английский и русский требуют чистой картинки (KickAssAnime) — на видео с
// вшитыми сабами второй слой поверх был бы кашей. «Оригинал» ничего не
// накладывает: показываем видео как его отдаёт источник.
// Недоступные языки в список не попадают — незачем вести пользователя в пустоту.
// Лучшая дорожка с ВШИТЫМИ русскими субтитрами среди обычных источников.
// Предпочитаем самую полную по числу серий: у одного тайтла бывает и полный
// сабовый релиз на 74 серии, и огрызок на 7.
function bestBurnedRuTrack() {
    return state.translations
        .filter((t) => t.provider !== 'kickassanime' && pictureSubLang(t) === 'ru')
        .sort((a, b) => (b.episodeCount || 0) - (a.episodeCount || 0))[0] || null;
}

function buildSubOptions() {
    const kaa = state.translations.find((t) => t.provider === 'kickassanime');
    const langs = (kaa && kaa.subLangs) || [];
    const opts = [];

    // Английские — только мягким слоем поверх чистой картинки.
    if (kaa && langs.includes('en')) opts.push({ lang: 'en', track: kaa });

    // Русские: если у KickAssAnime есть своя дорожка — берём её (чистый кадр +
    // наш слой). Иначе НЕ теряем русские субтитры: у Kodik они вшиты в видео, и
    // раньше пользователь смотрел именно их. Первая версия этого селекта
    // выбрасывала такие дорожки целиком — так пропали русские сабы у «Монстра».
    if (kaa && langs.includes('ru')) {
        opts.push({ lang: 'ru', track: kaa });
    } else {
        const ru = bestBurnedRuTrack();
        if (ru) opts.push({ lang: null, track: ru, burned: 'ru' });
    }

    // «Оригинал» — без наложения. Чистая картинка приятнее, но сойдёт любая.
    const orig = kaa || state.translations[0];
    if (orig && !opts.some((o) => o.track === orig && !o.lang)) {
        opts.push({ lang: null, track: orig });
    }
    return opts;
}

function renderTranslations() {
    state.subOptions = buildSubOptions();
    translationSelect.innerHTML = '';
    state.subOptions.forEach((o, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        const q = o.track.maxHeight ? ' · ' + o.track.maxHeight + 'p' : '';
        let name;
        if (o.lang === 'en') name = window.t('subs.langEn');
        else if (o.lang === 'ru') name = window.t('subs.langRu');
        else if (o.burned === 'ru') {
            // Русские субтитры, но вшитые в картинку — не наш слой. Для
            // пользователя это всё равно «русские», поэтому и называем так,
            // уточняя, что текст в самом видео.
            name = window.t('subs.langRuBurned');
        } else {
            // «Оригинал» = мы ничего не накладываем. Но в самом видео субтитры
            // могут быть ВШИТЫ (AnimeJoy/Sibnet — русские), и тогда обещание
            // «оригинал» вводило бы в заблуждение: текст на экране всё равно
            // будет. Пишем как есть.
            const burned = pictureSubLang(o.track);
            name = burned === 'ru' ? window.t('subs.originalBurnedRu')
                : burned === 'en' ? window.t('subs.originalBurnedEn')
                    : window.t('subs.originalClean');
        }
        opt.textContent = name + q;
        translationSelect.appendChild(opt);
    });
}

// Старый рендер по источникам оставлен на случай отката: если у тайтла нет
// чистого видео вовсе, выбор языков вырождается в единственный «оригинал».
function renderTranslationsBySource() {
    translationSelect.innerHTML = '';
    state.translations.forEach((tr, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        // Все дорожки теперь японские (дубляжи отфильтрованы) → флаг 🇯🇵 без
        // «озвучки»; 🎙 остаётся только для фолбэка (тайтл без японской дорожки).
        const label = isJpTrack(tr) ? '🇯🇵 ' : '🎙 ';
        // Заголовок оригинальной дорожки (AllAnime/MegaPlay) приходит с бэкенда
        // по-русски — локализуем через i18n; остальные — названия сабтитр-студий.
        // AnimeJoy — тоже оригинал, но с отдельной подписью: он может стоять в
        // списке рядом с AllAnime, и одинаковый ярлык на двух строках сбивал бы.
        const isDirectOrig = tr.id === 'animejoy-sub';
        const isOrig = tr.id === 'kickassanime-sub' || tr.id === 'allanime-sub'
            || tr.id === 'megaplay-sub' || tr.title === 'Оригинал (яп.)';
        // Метка языка вжатых субтитров источника (· рус./англ. сабы).
        const sl = subBurnLang(tr);
        const subTag = sl ? ' · ' + window.t(sl === 'en' ? 'player.subLangEn' : 'player.subLangRu') : '';
        // Максимальное качество показываем прямо в списке: у KickAssAnime оно
        // гуляет от тайтла к тайтлу, и юзер должен видеть это ДО выбора дорожки.
        const qTag = tr.maxHeight ? ' · ' + tr.maxHeight + 'p' : '';
        const name = isDirectOrig ? window.t('player.origJpDirect')
            : isOrig ? window.t('player.origJp')
                : tr.title;
        opt.textContent = label + name + subTag + qTag;
        translationSelect.appendChild(opt);
    });
}

async function selectTranslation(index) {
    const opt = state.subOptions[index] || state.subOptions[0];
    if (!opt) return;
    const t = opt.track;
    state.subLang = opt.lang;
    translationSelect.value = String(state.subOptions.indexOf(opt));
    state.provider = t.provider || 'kodik';
    if (window.animeiTrack) window.animeiTrack('voiceover', (isJpTrack(t) ? '🇯🇵 ' : '') + (t.title || ''));
    // Новая дорожка — свои сезоны/серии; сброс запомненного сезона обязателен.
    // AllAnime, как и MegaPlay, — оригинальная дорожка без Kodik-машинерии серий:
    // рисуем 1..N по числу серий тайтла.
    if (state.provider === 'megaplay' || state.provider === 'allanime'
        || state.provider === 'animejoy' || state.provider === 'kickassanime') {
        await loadMegaplayEpisodes(t, true);
    } else {
        await loadEpisodes({ mediaType: t.mediaType, mediaId: t.mediaId, mediaHash: t.mediaHash }, true);
    }
}

// MegaPlay-дорожка (оригинальное аудио): своего списка серий нет — рисуем 1..N
// по числу серий тайтла с Shikimori. Без Kodik-машинерии сезонов/чиби.
async function loadMegaplayEpisodes(t, restoreSaved) {
    state.megaMal = t.malId;
    const n = Math.max(1, t.episodeCount || 12);
    state.rawEpisodes = Array.from({ length: n }, (_, i) => ({ number: i + 1 }));
    state.episodeGroups = [state.rawEpisodes];
    state.shortFormChibi = new Set();
    state.showExtras = false;
    renderSeasons();          // одна группа + (обычно) нет франшизы -> сезоны скрыты
    populateEpisodes(restoreSaved);   // заполняет дропдаун серий и запускает серию
}

// Загрузка списка серий выбранной дорожки. Kodik часто отдаёт все сезоны одним
// плоским списком (у «Атаки титанов» это 1–25, спешл, снова 1–25), а его данные
// о сезонах ненадёжны (у разных сезонов один и тот же serial). Поэтому сезоны
// восстанавливаем сами — по сбросу нумерации серий.
async function loadEpisodes(media, restoreSaved) {
    episodeSelect.innerHTML = '<option>' + window.t('player.loading') + '</option>';
    // Этап 2 поэтапного статуса (только пока оверлей ещё висит без ошибки).
    if (!videoLoading.classList.contains('is-error')) {
        videoLoading.textContent = t('player.stageEpisodes');
    }

    try {
        const { data: res } = await client.get('catalog/episodes', { params: media });

        // Каталог/Kodik иногда отдаёт один и тот же список серий дважды (у «Финала»
        // это 1–12, а затем те же 1–12 с теми же id) — в селекте это выглядело как
        // задвоение. Убираем точные дубли по id (или по номеру+названию, если id
        // нет). Настоящие разные сезоны этим не затронуты: у них id различаются, и
        // splitIntoSeasons по-прежнему делит их по сбросу нумерации.
        const seenEp = new Set();
        state.rawEpisodes = (res.data.episodes || []).filter((e) => {
            const key = e.id != null ? 'id:' + e.id : 'nt:' + e.number + '|' + (e.title || '');
            if (seenEp.has(key)) return false;
            seenEp.add(key);
            return true;
        });
        state.episodeGroups = splitIntoSeasons(state.rawEpisodes);
        renderSeasons();   // задаёт state.seasonMode и наполняет дропдаун сезонов

        if (state.seasonMode === 'groups') {
            const savedSeason = parseInt(localStorage.getItem(seasonStorageKey()), 10);
            state.seasonIndex = restoreSaved && Number.isInteger(savedSeason) && savedSeason < state.episodeGroups.length
                ? savedSeason : 0;
            seasonSelect.value = state.seasonIndex;
        } else {
            state.seasonIndex = 0;
        }
        // Новая дорожка — сбрасываем прошлый детект чиби и показ доп. материалов.
        state.shortFormChibi = new Set();
        state.showExtras = false;
        populateEpisodes(restoreSaved);
        detectShortFormChibi();   // асинхронно: зондируем длины и прячем чиби/PV
    } catch (err) {
        console.error(err);
        episodeSelect.innerHTML = '<option>' + window.t('player.episodesError') + '</option>';
    }
}

// Другие сезоны франшизы: на Shikimori каждый сезон — отдельный тайтл. Если
// нашлись — дропдаун сезонов переключает между тайтлами (перезагрузка плеера).
async function loadFranchise() {
    try {
        const { data: res } = await client.get('catalog/franchise/' + shikimoriId);
        const seasons = res.data || [];
        if (seasons.length < 2) return;

        state.franchiseSeasons = seasons;
        const wasGroups = state.seasonMode === 'groups';
        renderSeasons();
        // Если до этого показывали урезанный сезон-группу — вернём весь список серий
        if (wasGroups && state.rawEpisodes.length) populateEpisodes(false, true);
    } catch (err) {
        console.error(err);   // нет франшизы — остаётся разбивка по номерам
    }
}

// Наполняем дропдаун серий сериями текущего режима сезона
function populateEpisodes(restoreSaved, keepCurrent) {
    const prevEp = keepCurrent ? state.episodes[parseInt(episodeSelect.value, 10)] : null;

    state.episodes = state.seasonMode === 'groups'
        ? (state.episodeGroups[state.seasonIndex] || [])
        : state.rawEpisodes;

    episodeSelect.innerHTML = '';

    // Если показываем плоский список (режим franchise/single), а внутри него
    // несколько блоков со сбросом нумерации (у «Атаки титанов» это 1–24, затем
    // снова 1–9), раскладываем их по <optgroup> с подписями сезонов/частей —
    // иначе выглядит как один список с внезапным сбросом на 1.
    const useOptgroups = state.seasonMode !== 'groups' && state.episodeGroups.length > 1;
    if (useOptgroups) {
        const labels = seasonLabels(state.episodeGroups);
        let flatIndex = 0;
        state.episodeGroups.forEach((group, gi) => {
            // Короткометражки (чиби/PV) прячем, но flatIndex держим сплошным —
            // значения опций должны совпадать с индексами в state.episodes.
            if (!state.showExtras && state.shortFormChibi.has(gi)) {
                flatIndex += group.length;
                return;
            }
            const og = document.createElement('optgroup');
            og.label = labels[gi];
            group.forEach((ep) => {
                const opt = document.createElement('option');
                opt.value = flatIndex++;   // индекс в плоском state.episodes
                opt.textContent = ep.title || (window.t('controls.episode') + ' ' + ep.number);
                og.appendChild(opt);
            });
            episodeSelect.appendChild(og);
        });
    } else {
        state.episodes.forEach((ep, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = ep.title || (window.t('controls.episode') + ' ' + ep.number);
            episodeSelect.appendChild(opt);
        });
    }

    // Перестроили список, но серия та же (пришла франшиза) — не трогаем видео
    if (keepCurrent) {
        const idx = prevEp ? state.episodes.findIndex(e => e.id === prevEp.id) : 0;
        episodeSelect.value = idx >= 0 ? idx : 0;
        return;
    }

    const saved = parseInt(localStorage.getItem(epStorageKey()), 10);
    const epIndex = restoreSaved && Number.isInteger(saved) && saved < state.episodes.length ? saved : 0;
    selectEpisode(epIndex);
}

// Плоский список серий -> массив сезонов. Новый сезон начинается там, где номер
// серии перестаёт расти (сбрасывается на 1 или меньше предыдущего).
function splitIntoSeasons(eps) {
    const groups = [];
    let cur = [];
    for (const ep of eps) {
        const n = ep.number || 0;
        if (cur.length && n <= (cur[cur.length - 1].number || 0)) {
            groups.push(cur);
            cur = [];
        }
        cur.push(ep);
    }
    if (cur.length) groups.push(cur);
    return groups;
}

// Подписи сезонов: одиночные короткие блоки (обычно спешлы/OVA) помечаем
// «Спешл», остальные нумеруем «Сезон 1», «Сезон 2»…
function seasonLabels(groups) {
    const maxSize = Math.max(...groups.map(g => g.length));
    let n = 0;
    return groups.map((g) => {
        if (g.length <= 2 && maxSize > 2) return window.t('controls.special');
        return window.t('controls.season') + ' ' + (++n);
    });
}

function fillSeasonSelect(labels, selectedIndex, skipSet) {
    seasonGroup.hidden = false;
    seasonSelect.innerHTML = '';
    labels.forEach((label, i) => {
        if (skipSet && skipSet.has(i)) return;   // прячем чиби-сезоны
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = label;
        seasonSelect.appendChild(opt);
    });
    if (Number.isInteger(selectedIndex)) seasonSelect.value = selectedIndex;
}

// Дропдаун сезонов. Приоритет — франшиза (каждый сезон отдельный тайтл на
// Shikimori); иначе — разбивка одного тайтла по сбросу нумерации; иначе прячем.
function renderSeasons() {
    if (state.franchiseSeasons.length >= 2) {
        state.seasonMode = 'franchise';
        const cur = state.franchiseSeasons.findIndex(s => String(s.shikimoriId) === String(shikimoriId));
        fillSeasonSelect(state.franchiseSeasons.map(s => animeTitle(s)), cur >= 0 ? cur : undefined);
        return;
    }
    if (state.episodeGroups.length >= 2) {
        state.seasonMode = 'groups';
        const skip = state.showExtras ? null : state.shortFormChibi;
        fillSeasonSelect(seasonLabels(state.episodeGroups), state.seasonIndex, skip);
        return;
    }
    state.seasonMode = 'single';
    seasonGroup.hidden = true;
}

// ---- Детект короткометражек (чиби/PV) по длине серии ----
// Kodik подмешивает к сезону мусорные короткометражки (у «Атаки титанов» это
// 9 чиби-серий после 24 настоящих). Отличаем их по длительности: настоящая
// серия ~24 мин, чиби — 2–5 мин. Прячем такие группы (с кнопкой «показать»).

async function probeEpisodeSeconds(ep) {
    if (!ep || ep.id == null || ep.hash == null) return 0;
    if (state.epLenCache[ep.id] != null) return state.epLenCache[ep.id];
    try {
        const { data: res } = await client.get('catalog/episode-length', {
            params: { type: 'seria', id: ep.id, hash: ep.hash },
            timeout: 20000,
        });
        const s = Number(res?.data?.seconds) || 0;
        state.epLenCache[ep.id] = s;
        return s;
    } catch {
        return 0;
    }
}

async function detectShortFormChibi() {
    const groups = state.episodeGroups;
    if (!groups || groups.length < 2 || groups.length > 8) return;

    // Зондируем длину первой серии каждой группы (репрезентативно).
    const lens = await Promise.all(groups.map((g) => probeEpisodeSeconds(g[0])));
    const maxLen = Math.max(0, ...lens);
    if (maxLen <= 0) return;

    const chibi = new Set();
    groups.forEach((g, gi) => {
        const len = lens[gi];
        // Короткая (< половины самой длинной) и короче 10 минут — считаем чиби/PV.
        if (len > 0 && len < 0.5 * maxLen && len < 600) chibi.add(gi);
    });
    // Никогда не прячем всё — если под фильтр попали все группы, отменяем.
    if (chibi.size >= groups.length) return;

    state.shortFormChibi = chibi;
    if (chibi.size) {
        // Перерисуем сезоны/серии, не трогая текущее видео (keepCurrent).
        renderSeasons();
        populateEpisodes(false, true);
        if (window.animeiTrack) window.animeiTrack('chibi_hidden', (titleRu || titleRomaji || '') + ' ×' + chibi.size);
    }
}

// Переход на другой сезон-тайтл франшизы — перезагружаем плеер с его id
function navigateToSeason(season) {
    if (!season || String(season.shikimoriId) === String(shikimoriId)) return;
    const params = new URLSearchParams({
        id: season.shikimoriId,
        title: animeTitle(season),
        name: season.name || '',
    });
    window.location.href = 'player.html?' + params.toString();
}

function epStorageKey() {
    return 'animei:lastEpisode:' + shikimoriId + ':s' + state.seasonIndex;
}

function seasonStorageKey() {
    return 'animei:lastSeason:' + shikimoriId;
}

// ---------- «Продолжить смотреть» ----------
// Позиция просмотра переживает закрытие вкладки: animei:watchPos:{id} — сезон/
// серия/таймкод текущего тайтла, animei:lastWatch — единый указатель для
// карточки «Продолжить» на главной (последнее, что смотрели вообще).
function watchPosKey() {
    return 'animei:watchPos:' + shikimoriId;
}

function loadWatchPos() {
    try {
        return JSON.parse(localStorage.getItem(watchPosKey()) || 'null');
    } catch { return null; }
}

function writeWatchPos(epIndex, epNum, time, dur) {
    try {
        const updatedAt = Date.now();
        localStorage.setItem(watchPosKey(), JSON.stringify({
            seasonIndex: state.seasonIndex, epIndex, epNum, time, dur, updatedAt,
        }));
        localStorage.setItem('animei:lastWatch', JSON.stringify({
            id: shikimoriId,
            title: titleRu || titleRomaji || '',
            name: titleRomaji || '',
            poster: localStorage.getItem('animei:poster:' + shikimoriId) || '',
            epNum, time, dur, updatedAt,
        }));
    } catch { /* localStorage может быть недоступен */ }
}

function saveWatchPos() {
    const epIndex = Number(episodeSelect.value);
    const ep = state.episodes[epIndex];
    const time = Math.floor(video.currentTime || 0);
    if (!ep || time <= 0) return;
    const dur = Number.isFinite(video.duration) ? Math.floor(video.duration) : 0;
    writeWatchPos(epIndex, ep.number ?? epIndex + 1, time, dur);
}

// Таймкод пишем раз в ~5 секунд во время воспроизведения + в моменты, когда
// пользователь может уйти (пауза, сворачивание, закрытие вкладки).
let lastWatchPosSave = 0;
video.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - lastWatchPosSave < 5000) return;
    lastWatchPosSave = now;
    saveWatchPos();
});
video.addEventListener('pause', saveWatchPos);
window.addEventListener('pagehide', saveWatchPos);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveWatchPos();
});

// Серия досмотрена: «Продолжить» должно вести на следующую серию с начала.
// Двигаем и запомненную серию (epStorageKey), чтобы плеер при следующем
// открытии сам встал на неё. Если серий больше нет — указатель убираем.
video.addEventListener('ended', () => {
    const epIndex = Number(episodeSelect.value);
    const cur = state.episodes[epIndex];
    const next = state.episodes[epIndex + 1];
    try {
        if (next) {
            localStorage.setItem(epStorageKey(), String(epIndex + 1));
            writeWatchPos(epIndex + 1, next.number ?? epIndex + 2, 0, 0);
        } else {
            localStorage.removeItem(watchPosKey());
            const lw = JSON.parse(localStorage.getItem('animei:lastWatch') || 'null');
            if (lw && String(lw.id) === String(shikimoriId)) localStorage.removeItem('animei:lastWatch');
        }
    } catch { /* localStorage может быть недоступен */ }
    if (window.animeiTrack) window.animeiTrack('episode_end', (titleRu || titleRomaji || 'аниме') + ' · эп ' + (cur?.number ?? epIndex + 1));
    showSessionPanel(epIndex);
});

// ---------- Слова текущей сессии просмотра ----------
// Каждое сохранённое из плеера слово запоминаем в animei:lastSession — из него
// главная строит карточку «в прошлый раз ты сохранил N слов», а конец серии —
// панель «выбери и повтори». Смена тайтла или серии начинает новую сессию.
function loadLastSession() {
    try {
        return JSON.parse(localStorage.getItem('animei:lastSession') || 'null');
    } catch { return null; }
}

function rememberSessionWord(word) {
    if (!word || !word.id) return;
    const epIndex = Number(episodeSelect.value);
    const ep = state.episodes[epIndex];
    const epNum = ep?.number ?? epIndex + 1;
    let s = loadLastSession();
    if (!s || s.processed || String(s.animeId) !== String(shikimoriId) || s.epNum !== epNum) {
        s = { animeId: shikimoriId, title: titleRu || titleRomaji || '', epNum, words: [], processed: false };
    }
    if (!s.words.some((w) => String(w.id) === String(word.id))) {
        s.words.push({ id: word.id, kanji: word.kanji, kana: word.kana || '', translation: word.translation || '' });
    }
    s.updatedAt = Date.now();
    try { localStorage.setItem('animei:lastSession', JSON.stringify(s)); } catch { /* недоступен */ }
}

// Панель в конце серии: «Сохранено N слов — выбери, что учить». Необязательная,
// закрывается одним тапом; при закрытии сессия остаётся необработанной, и её
// подхватит карточка на главной.
function showSessionPanel(endedEpIndex) {
    const s = loadLastSession();
    if (!s || s.processed || String(s.animeId) !== String(shikimoriId) || !s.words.length) return;
    if (document.getElementById('session-panel')) return;

    const next = state.episodes[endedEpIndex + 1];
    const panel = document.createElement('div');
    panel.className = 'session-panel';
    panel.id = 'session-panel';
    panel.innerHTML =
        '<div class="session-panel__card">' +
        '<button class="session-panel__close" aria-label="Close">×</button>' +
        '<div class="session-panel__title"></div>' +
        '<div class="session-panel__hint"></div>' +
        '<div class="session-panel__list"></div>' +
        '<div class="session-panel__actions">' +
        '<button class="btn btn--primary session-panel__study"></button>' +
        (next ? '<button class="btn session-panel__next"></button>' : '') +
        '</div></div>';

    panel.querySelector('.session-panel__title').textContent =
        t('session.title') + ': ' + s.words.length;
    panel.querySelector('.session-panel__hint').textContent = t('session.pick');

    const list = panel.querySelector('.session-panel__list');
    s.words.forEach((w, i) => {
        const row = document.createElement('label');
        row.className = 'session-word';
        row.innerHTML = '<input type="checkbox"><span class="session-word__kanji"></span><span class="session-word__tr"></span>';
        row.querySelector('input').checked = i < 5;
        row.querySelector('input').dataset.id = w.id;
        row.querySelector('.session-word__kanji').textContent = w.kanji + (w.kana ? ' · ' + w.kana : '');
        row.querySelector('.session-word__tr').textContent = w.translation || '';
        list.appendChild(row);
    });

    const studyBtn = panel.querySelector('.session-panel__study');
    const updateBtn = () => {
        const n = list.querySelectorAll('input:checked').length;
        studyBtn.textContent = t('session.study') + (n ? ' (' + n + ')' : '');
        studyBtn.disabled = !n;
    };
    list.addEventListener('change', updateBtn);
    updateBtn();

    studyBtn.addEventListener('click', () => {
        const ids = [...list.querySelectorAll('input:checked')].map((c) => c.dataset.id);
        try {
            const picked = JSON.parse(localStorage.getItem('srs:pickedFirst') || '[]');
            for (const id of ids) if (!picked.includes(id)) picked.push(id);
            localStorage.setItem('srs:pickedFirst', JSON.stringify(picked));
            s.processed = true;
            localStorage.setItem('animei:lastSession', JSON.stringify(s));
        } catch { /* недоступен */ }
        if (window.animeiTrack) window.animeiTrack('session_card', 'player_pick:' + ids.length);
        window.location.href = './study.html';
    });
    panel.querySelector('.session-panel__next')?.addEventListener('click', () => {
        panel.remove();
        selectEpisode(endedEpIndex + 1);
    });
    panel.querySelector('.session-panel__close').addEventListener('click', () => panel.remove());
    panel.querySelector('.session-panel__next') && (panel.querySelector('.session-panel__next').textContent = t('session.next'));

    document.body.appendChild(panel);
    if (window.animeiTrack) window.animeiTrack('session_card', 'player_shown:' + s.words.length);
}

async function selectEpisode(index) {
    const ep = state.episodes[index];
    if (!ep) return;

    episodeSelect.value = index;
    localStorage.setItem(epStorageKey(), String(index));

    // Если для этой серии есть сохранённая позиция — продолжим с неё после
    // загрузки потока. Самое начало и финальные титры не считаем.
    const wp = loadWatchPos();
    state.resumeTime = (wp
        && wp.seasonIndex === state.seasonIndex
        && wp.epIndex === index
        && wp.time > 30
        && (!wp.dur || wp.time < wp.dur - 60)) ? wp.time : null;

    if (window.animeiTrack) window.animeiTrack('play', (titleRu || titleRomaji || 'аниме') + ' · эп ' + (ep.number ?? index + 1));
    videoLoading.style.display = 'flex';
    videoLoading.classList.remove('is-error'); videoLoading.textContent = t('player.videoLoading');

    // Новая серия: адрес старого видео больше не актуален — обнуляем ЕГО ДО загрузки
    // нового потока. Иначе автосинк, который запускает loadSubtitles ниже, успеет
    // выровнять свежие субтитры по звуку ПРЕДЫДУЩЕЙ серии, впустую займёт autoSyncKey,
    // и правильный проход (после загрузки нового видео) будет пропущен — серия
    // останется без синхронизации. С пустым currentVideoUrl тот преждевременный
    // вызов выйдет по guard'у, а синк сделает вызов после setState нового видео.
    state.currentVideoUrl = '';
    state.autoSyncKey = null;
    // Сабы источника принадлежат конкретной дорожке — при смене серии или
    // провайдера гасим их, иначе поверх нового видео висел бы старый текст.
    clearBurnedSubs();

    // Сабы под номер серии
    loadSubtitles(ep.number);

    // AllAnime — оригинальная японская дорожка: свой эндпоинт (маппинг shikimori→
    // showId → wixmp через наш прокси), без выбора качества (мастер-плейлист сам).
    if (state.provider === 'allanime') {
        try {
            const { data: res } = await client.get('catalog/allanime-stream', {
                params: { shikimoriId, ep: ep.number },
            });
            state.qualities = {};
            state.masterUrl = null;
            state.megaIntro = null;
            state.pendingSeek = null;
            state.currentVideoUrl = apiOrigin() + res.data.hls;
            attachVideo(state.currentVideoUrl);
            updateQualityUI();
            state.syncPromise = maybeAutoSync();
        } catch (err) {
            console.error(err);
            videoLoading.classList.add('is-error');
            videoLoading.textContent = t('player.streamError');
        }
        return;
    }

    // KickAssAnime — чистое видео без вшитых субтитров, японская дорожка отдельно.
    // Качество НЕ прячем: отдаём весь список как есть, чтобы в переключателе было
    // честно видно, что доступно у этого источника (у них бывает и 1080p, и только
    // 360p — молчаливая подмена выглядела бы как поломка).
    if (state.provider === 'kickassanime') {
        try {
            const { data: res } = await client.get('catalog/kickassanime-stream', {
                params: { shikimoriId, ep: ep.number, sub: state.subLang || 'en' },
            });
            state.qualities = res.data.qualities || {};
            state.masterUrl = res.data.auto || null;
            state.megaIntro = null;
            state.pendingSeek = null;
            const chosen = pickQuality();
            state.currentVideoUrl = apiOrigin() + (chosen.url || Object.values(state.qualities)[0]);
            attachVideo(state.currentVideoUrl);
            updateQualityUI();
            // «Оригинал» — ничего не накладываем, показываем как отдал источник.
            if (state.subLang) loadBurnedSubs(res.data.subtitle);
            state.syncPromise = maybeAutoSync();
        } catch (err) {
            console.error(err);
            videoLoading.classList.add('is-error');
            videoLoading.textContent = t('player.streamError');
        }
        return;
    }

    // AnimeJoy — японская дорожка прямым mp4 (не HLS). Качество выбирает бэкенд
    // (берёт максимальное из списка PlayerJS), поэтому переключателя качества нет.
    // intro приходит с готовыми таймингами опенинга — их размечает сам AnimeJoy.
    if (state.provider === 'animejoy') {
        try {
            const { data: res } = await client.get('catalog/animejoy-stream', {
                params: { shikimoriId, ep: ep.number },
            });
            state.qualities = {};
            state.masterUrl = null;
            state.megaIntro = res.data.intro || null;
            state.pendingSeek = null;
            state.currentVideoUrl = apiOrigin() + res.data.video;
            attachDirectVideo(state.currentVideoUrl);
            updateQualityUI();
            state.syncPromise = maybeAutoSync();
        } catch (err) {
            console.error(err);
            videoLoading.classList.add('is-error');
            videoLoading.textContent = t('player.streamError');
        }
        return;
    }

    // MegaPlay — оригинальная японская дорожка: свой эндпоинт, без выбора качества
    // (в мастер-плейлисте свои варианты, hls.js выберет сам).
    if (state.provider === 'megaplay') {
        try {
            const { data: res } = await client.get('catalog/megaplay-stream', {
                params: { mal: state.megaMal, ep: ep.number, type: 'sub' },
            });
            state.qualities = {};
            state.masterUrl = null;
            state.megaIntro = res.data.intro || null;
            state.pendingSeek = null;
            state.currentVideoUrl = apiOrigin() + res.data.hls;
            attachVideo(state.currentVideoUrl);
            updateQualityUI();
            state.syncPromise = maybeAutoSync();
        } catch (err) {
            console.error(err);
            videoLoading.classList.add('is-error'); videoLoading.textContent = t('player.streamError');
        }
        return;
    }

    try {
        const { data: res } = await client.get('catalog/stream', {
            params: { type: 'seria', id: ep.id, hash: ep.hash },
        });

        // Kodik отдаёт по ссылке на каждое качество (360/480/720). По умолчанию
        // «Авто» (мастер-манифест, hls.js подстраивает уровень под скорость);
        // запомненный ручной выбор уважаем, сменить можно кнопкой.
        state.qualities = res.data.qualities || {};
        state.masterUrl = res.data.master || null;
        const chosen = pickQuality();
        const hlsUrl = apiOrigin() + (chosen.url || res.data.hls);
        state.pendingSeek = null;   // новая серия — с начала
        state.currentVideoUrl = hlsUrl;
        attachVideo(hlsUrl);
        updateQualityUI();
        state.syncPromise = maybeAutoSync();   // видео готово — пробуем автосинк (ждёт ещё и субтитры)
    } catch (err) {
        console.error(err);
        videoLoading.classList.add('is-error'); videoLoading.textContent = t('player.streamError');
    }
}

function apiOrigin() {
    return client.defaults.baseURL.replace(/\/api\/v1\/?$/, '');
}

// AnimeJoy отдаёт не плейлист, а готовый mp4 — hls.js тут не нужен и только
// сломает загрузку. Отдаём файл нативному <video>: Range наш прокси проксирует,
// так что перемотка работает. Файлы не faststart (moov в хвосте), поэтому до
// первого кадра браузер делает лишний запрос к концу файла — это нормально.
function attachDirectVideo(url) {
    if (!videoLoading.classList.contains('is-error')) {
        videoLoading.textContent = t('player.videoLoading');
    }
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
        videoLoading.style.display = 'none';
        resumeAfterAttach();
    }, { once: true });
    video.addEventListener('error', () => {
        videoLoading.style.display = 'flex';
        videoLoading.classList.add('is-error');
        videoLoading.textContent = t('player.videoError') + (video.error?.code || '');
    }, { once: true });
}

function attachVideo(hlsUrl) {
    // Этап 3 поэтапного статуса: дорожки и серии найдены, грузим сам поток.
    if (!videoLoading.classList.contains('is-error')) {
        videoLoading.textContent = t('player.videoLoading');
    }
    // hls.js грузим лениво (см. loadHlsJs в app.js): страница плеера открывается
    // без 530 КБ библиотеки, она подъезжает только когда реально нужен HLS.
    if (typeof Hls === 'undefined') {
        videoLoading.style.display = 'flex';
        loadHlsJs().then(() => attachVideo(hlsUrl)).catch(() => {
            videoLoading.classList.add('is-error');
            videoLoading.textContent = t('player.videoError') + 'hls';
        });
        return;
    }

    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }

    if (Hls.isSupported()) {
        const hls = new Hls({
            maxBufferLength: 60,
            // Плохой интернет: стартуем с осторожной оценки скорости (~1.2 Мбит),
            // чтобы первый сегмент в «Авто» не оказался 720p на еле живой сети —
            // дальше ABR меряет реальную скорость и поднимает уровень сам.
            abrEwmaDefaultEstimate: 1200000,
            // Наш прокси тянет холодные сегменты с CDN источника — первый байт
            // может прийти сильно позже дефолтных 10с; не считаем это таймаутом.
            fragLoadPolicy: {
                default: {
                    maxTimeToFirstByteMs: 20000,
                    maxLoadTimeMs: 120000,
                    timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
                    errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
                },
            },
            manifestLoadPolicy: {
                default: {
                    maxTimeToFirstByteMs: 20000,
                    maxLoadTimeMs: 30000,
                    timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
                    errorRetry: { maxNumRetry: 4, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
                },
            },
            playlistLoadPolicy: {
                default: {
                    maxTimeToFirstByteMs: 20000,
                    maxLoadTimeMs: 30000,
                    timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
                    errorRetry: { maxNumRetry: 4, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
                },
            },
        });
        state.hls = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoLoading.style.display = 'none';
            resumeAfterAttach();
        });
        // В «Авто» показываем на кнопке фактический уровень — на слабой сети
        // видно, что плеер честно опустился на 360p, а не «сломалось».
        hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
            if (currentQualityKey() !== 'auto') return;
            const btn = document.getElementById('ctrl-quality');
            const h = hls.levels?.[data.level]?.height;
            if (btn && h) btn.textContent = t('ui.quality.auto') + ' · ' + h + 'p';
        });
        // Обрывы сети лечим сами: hls.js после исчерпания ретраев останавливает
        // загрузку насовсем — перезапускаем её с растущей паузой, а не хороним
        // просмотр табличкой «ошибка». Ошибки декодера — recoverMediaError().
        let netRetries = 0;
        let mediaRetries = 0;
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
            netRetries = 0;
            if (!videoLoading.classList.contains('is-error')) videoLoading.style.display = 'none';
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 6) {
                netRetries += 1;
                videoLoading.style.display = 'flex';
                videoLoading.classList.remove('is-error');
                videoLoading.textContent = t('player.reconnecting');
                const delay = Math.min(1000 * 2 ** (netRetries - 1), 15000);
                setTimeout(() => {
                    if (state.hls === hls) hls.startLoad(video.currentTime || -1);
                }, delay);
                return;
            }
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 2) {
                mediaRetries += 1;
                if (mediaRetries === 2) hls.swapAudioCodec();
                hls.recoverMediaError();
                return;
            }
            videoLoading.style.display = 'flex';
            videoLoading.classList.add('is-error'); videoLoading.textContent = t('player.videoError') + data.type;
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
            videoLoading.style.display = 'none';
            resumeAfterAttach();
        }, { once: true });
    } else {
        videoLoading.classList.add('is-error'); videoLoading.textContent = t('player.noHls');
    }
    // Стандартные кнопки браузера не включаем — управление своё (player-ui.js)
}

// После загрузки потока: если это была смена качества — вернуть позицию и
// прежнее состояние воспроизведения; если для серии есть сохранённая позиция
// просмотра — продолжить с неё; иначе просто запустить с начала.
function resumeAfterAttach() {
    const seek = state.pendingSeek;
    state.pendingSeek = null;
    if (seek) {
        try { if (seek.time > 0) video.currentTime = seek.time; } catch { /* поток короче — игнор */ }
        if (seek.playing) video.play().catch(() => {});
    } else {
        const rt = state.resumeTime;
        state.resumeTime = null;
        if (rt) {
            try { video.currentTime = rt; } catch { /* поток короче — игнор */ }
            if (window.animeiTrack) window.animeiTrack('resume', 'seek:' + rt);
        }
        video.play().catch(() => {});
    }
}

// ---------- Качество видео ----------

// Ключи качеств от высокого к низкому: '720' | '480' | '360' …
function qualityKeys() {
    return Object.keys(state.qualities).sort((a, b) => Number(b) - Number(a));
}

// «Авто» доступно, когда бэкенд дал мастер-манифест и есть из чего выбирать.
function hasAutoQuality() {
    return !!state.masterUrl && qualityKeys().length > 1;
}

function currentQualityKey() {
    const keys = qualityKeys();
    if (!keys.length) return null;
    const pref = localStorage.getItem('animei:quality');
    if (pref && state.qualities[pref]) return pref;
    // Не выбирал / выбрал «Авто» / выбор не существует у этого источника —
    // авто-качество, а без мастера по-старому лучшее из доступного.
    return hasAutoQuality() ? 'auto' : keys[0];
}

function pickQuality() {
    const key = currentQualityKey();
    if (key === 'auto') return { key, url: state.masterUrl };
    return key ? { key, url: state.qualities[key] } : { key: null, url: '' };
}

function updateQualityUI() {
    const btn = document.getElementById('ctrl-quality');
    if (!btn) return;
    const wrap = btn.closest('.player-ui__quality-wrap') || btn;
    const keys = qualityKeys();
    const show = keys.length > 1;
    wrap.style.display = show ? '' : 'none';
    if (!show) return;
    const cur = currentQualityKey();
    btn.textContent = cur === 'auto' ? t('ui.quality.auto') : cur + 'p';
    btn.classList.toggle('is-custom', hasAutoQuality() ? cur !== 'auto' : cur !== keys[0]);
}

// Смена качества на лету: запоминаем позицию/состояние и перегружаем поток
// с URL нужного качества (у Kodik это отдельный плейлист на каждое качество,
// поэтому переключаем источник, а не уровень внутри hls.js). 'auto' — мастер-
// манифест со всеми качествами, уровень дальше выбирает сам hls.js.
function switchQuality(key) {
    const url = key === 'auto' ? state.masterUrl : state.qualities[key];
    if (!url) return;
    localStorage.setItem('animei:quality', key);
    state.pendingSeek = { time: video.currentTime, playing: !video.paused };
    videoLoading.style.display = 'flex';
    videoLoading.classList.remove('is-error'); videoLoading.textContent = t('player.videoLoading');
    state.currentVideoUrl = apiOrigin() + url;
    attachVideo(state.currentVideoUrl);
    updateQualityUI();
}

// Нормальный селектор качества: кнопка с текущим качеством открывает список
// (720p / 480p / 360p) над собой — выбираешь нужное, а не циклишь по кругу.
(function setupQualityControl() {
    const btn = document.getElementById('ctrl-quality');
    if (!btn) return;
    btn.hidden = false; // видимостью управляет обёртка (updateQualityUI)

    const wrap = document.createElement('div');
    wrap.className = 'player-ui__quality-wrap';
    wrap.style.display = 'none';
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);

    const menu = document.createElement('div');
    menu.className = 'player-ui__quality-menu';
    wrap.appendChild(menu);

    const closeMenu = () => wrap.classList.remove('is-open');

    function buildMenu() {
        menu.innerHTML = '';
        const cur = currentQualityKey();
        const keys = hasAutoQuality() ? ['auto', ...qualityKeys()] : qualityKeys();
        keys.forEach((k) => {
            const opt = document.createElement('button');
            opt.type = 'button';
            opt.className = 'player-ui__quality-opt' + (k === cur ? ' is-active' : '');
            opt.textContent = k === 'auto' ? t('ui.quality.auto') : k + 'p';
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                closeMenu();
                if (k !== currentQualityKey()) switchQuality(k);
            });
            menu.appendChild(opt);
        });
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (qualityKeys().length <= 1) return;
        if (wrap.classList.contains('is-open')) { closeMenu(); return; }
        // Не держим два меню открытыми сразу (качество/скорость/звук).
        document.querySelectorAll('.player-ui__quality-wrap.is-open, .player-ui__speed-wrap.is-open, .player-ui__vol.is-open')
            .forEach((w) => { if (w !== wrap) w.classList.remove('is-open'); });
        buildMenu();
        wrap.classList.add('is-open');
    });

    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) closeMenu();
    });
})();

// ---------- Субтитры ----------

// Скелетон транскрипта: пока ищем/грузим субтитры, под статусом — «призрачные
// реплики» (тайм-код + японская строка из «слов» + строка перевода) с волной
// прозрачности. Ширины фиксированы, чтобы картинка не прыгала между сериями.
// renderTranscript() скелетон не трогает (чистит только .cue) — убираем сами.
const SKEL_ROWS = [
    [[38, 24, 15], 55],
    [[28, 33], 40],
    [[45, 18, 12], 62],
    [[22, 30], 35],
    [[40, 26], 48],
];

function setSubsSkeleton(on) {
    let el = document.getElementById('subs-skel');
    if (!on) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = 'subs-skel';
    el.setAttribute('aria-hidden', 'true');
    for (const [jpWidths, ruWidth] of SKEL_ROWS) {
        const row = document.createElement('div');
        row.className = 'subs-skel__row';
        row.appendChild(document.createElement('i')).className = 'subs-skel__time';
        for (const w of jpWidths) {
            const bar = document.createElement('i');
            bar.className = 'subs-skel__jp';
            bar.style.width = w + '%';
            row.appendChild(bar);
        }
        const ru = document.createElement('i');
        ru.className = 'subs-skel__ru';
        ru.style.width = ruWidth + '%';
        row.appendChild(ru);
        el.appendChild(row);
    }
    subsStatus.after(el);
}

async function loadSubtitles(episodeNumber = 1) {
    state.cues = [];
    state.activeCueIndex = -1;
    setFollowCue(true);           // новая серия — снова едем за репликой
    nowCueJp.textContent = '';
    nowCueRu.textContent = '';
    updateNowCue(-1);
    renderTranscript();
    subsStatus.style.display = '';
    subsStatus.textContent = t('subs.searching');
    setSubsSkeleton(true);
    subsFixBtn.hidden = true;

    try {
        // Субтитры подбираются автоматически по названию и номеру серии (ручного
        // выбора файла нет — он путал сдвиг: у разных файлов свои тайминги).
        const { data: res } = await client.get('subtitles/episode', {
            params: { title: titleRomaji, episode: episodeNumber, translate: subsLang() },
            timeout: 180000,
        });
        const cues = res.data.cues;

        state.cues = cues;
        subsStatus.style.display = 'none';
        setSubsSkeleton(false);
        // Подобрали (или выбрали) файл — предлагаем сменить, если серия не та
        subsFixBtn.hidden = false;

        // Разовая миграция: сдвиги, сохранённые ПРЕЖНИМИ (ошибочными) версиями
        // автосинка, могут быть неверны — чистим все один раз, чтобы автосинк
        // пересчитал их свежим, исправленным методом (alass, который корректно
        // находит и большие сдвиги от обрезки интро). Ручной правки сдвига в UI нет,
        // поэтому любое сохранённое значение — от автосинка, стирать безопасно.
        if (localStorage.getItem('animei:subsOffsetReset') !== '5') {
            Object.keys(localStorage)
                .filter((k) => k.startsWith('animei:subsOffset:'))
                .forEach((k) => localStorage.removeItem(k));
            localStorage.setItem('animei:subsOffsetReset', '5');
        }
        state.offset = parseFloat(localStorage.getItem(offsetStorageKey())) || 0;
        updateOffsetLabel();
        renderTranscript();
        updateNowCue(state.activeCueIndex);
        // Если серия пойдёт на автосинк — прячем тайм-коды сразу (ещё до готовности
        // видео), чтобы не мелькнуло неверное время между загрузкой сабов и синком.
        if (autoSyncEligible()) setSyncing(true);
        state.syncPromise = maybeAutoSync();   // субтитры готовы — пробуем автосинк (ждёт ещё и видео)

        // Одноразовая подсказка новичку: сабы из архива часто чуть съезжают,
        // а кнопка «Сейчас!» неочевидна
        if (!localStorage.getItem('animei:syncHintShown')) {
            localStorage.setItem('animei:syncHintShown', '1');
            showSnackbar(t('player.syncHint'), { duration: 6000 });
        }
    } catch (err) {
        console.error(err);
        setSubsSkeleton(false);
        if (err.response?.status === 404) {
            // Сабов в архиве нет. Не тупик: можно смотреть без них или принести своё видео.
            subsStatus.textContent = '';
            subsStatus.append(t('subs.notFound'));
            subsStatus.appendChild(document.createElement('br'));
            const link = document.createElement('a');
            link.href = './watch.html';
            link.textContent = t('subs.notFoundLink');
            subsStatus.appendChild(link);
        } else {
            subsStatus.textContent = t('subs.error');
        }
    }
}

// Дорожка, РЕАЛЬНО выбранная в селекте. Селект теперь показывает subOptions
// (язык субтитров; источник лежит в opt.track), а не translations — но три
// места индексировали translations значением селекта и получали ЧУЖУЮ дорожку:
// у автосинка и точного подбора ломались язык аудио для Whisper (дубляж вместо
// японской озвучки → «не удалось» всегда), ключ сдвига и консенсус серий.
function selectedTrack() {
    const i = parseInt(translationSelect.value, 10);
    if (state.subOptions.length) return (state.subOptions[i] || state.subOptions[0]).track || {};
    return state.translations[i] || {};   // фолбэк: старый рендер по источникам
}

function offsetStorageKey() {
    // Сдвиг субтитров зависит от ТАЙМИНГА ИСТОЧНИКА: у разных дорожек (русский
    // дубляж Kodik, оригинальная озвучка MegaPlay) своё смещение относительно
    // одних и тех же субтитров. Раньше ключ был только по серии — и сдвиг,
    // подобранный под дубляж, ошибочно применялся к оригиналу (субтитры «уезжали»).
    // Теперь ключ включает выбранный перевод и номер серии.
    const tr = selectedTrack();
    const ep = state.episodes[parseInt(episodeSelect.value, 10)];
    const epNum = ep && ep.number != null ? ep.number : episodeSelect.value;
    const src = tr.id || tr.provider || 'k';
    return 'animei:subsOffset:' + shikimoriId + ':' + src + ':s' + state.seasonIndex + ':ep' + epNum;
}

// ---------- Индикатор синхронизации субтитров ----------
// Пока идёт автосинк, сдвиг ещё не применён — тайм-коды реплик могут быть
// неверными. Прячем их и показываем баннер «синхронизируем…», чтобы не вводить
// в заблуждение; раскрываем время, когда синк завершился (или заведомо не нужен).
let syncSafetyTimer = null;

function setSyncing(on) {
    if (!transcriptList) return;
    state.syncing = on;
    transcriptList.classList.toggle('is-syncing', on);
    // Во время синка не тащим список за репликой и убираем «К текущей» — тайминги
    // ещё могут быть неверными. Сами субтитры при этом остаются кликабельными.
    if (typeof updateJumpVisibility === 'function') updateJumpVisibility();
    let banner = document.getElementById('subs-syncing');
    if (on) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'subs-syncing';
            banner.className = 'subs-syncing';
            const spin = document.createElement('span');
            spin.className = 'subs-syncing__spin';
            const txt = document.createElement('span');
            txt.textContent = t('subs.syncing');
            banner.appendChild(spin);
            banner.appendChild(txt);
            // Вешаем баннер НА ПАНЕЛЬ субтитров (не в прокручиваемый список) — как
            // плавающую «пилюлю» под шапкой. Иначе (sticky внутри списка) при
            // прокрутке он наезжал на реплики: текст ложился на текст.
            (transcriptList.parentElement || transcriptList).appendChild(banner);
        }
        // Предохранитель: если поток так и не поднялся (ошибка стрима), не держим
        // время скрытым вечно — показываем не дольше жизни запроса автосинка.
        clearTimeout(syncSafetyTimer);
        syncSafetyTimer = setTimeout(() => setSyncing(false), 140000);
    } else {
        clearTimeout(syncSafetyTimer);
        if (banner) banner.remove();
    }
}

// Будет ли автосинк вообще запущен для текущей серии — по тем же условиям, что и
// maybeAutoSync, но без готовности видео (его дожидаемся). Нужно, чтобы спрятать
// время сразу при отрисовке сабов, а не только в момент запроса.
function autoSyncEligible() {
    if (window.AnimeiSettings && window.AnimeiSettings.get('autoSyncSubs') === false) return false;
    // MegaPlay не автосинкаем — см. maybeAutoSync (alass не тянет аудио с их CDN).
    if (state.provider === 'megaplay') return false;
    const key = offsetStorageKey();
    if (state.autoSyncKey === key) return false;
    if (localStorage.getItem(key) !== null) return false;
    const starts = state.cues.filter((c) => Number.isFinite(c.start) && c.start >= 0 && c.start < 340);
    return starts.length >= 5;
}

// Автосинхронизация субтитров. Если пользователь не задавал сдвиг вручную, просим
// бэкенд сопоставить речь в аудио (silencedetect) с таймингами реплик и, если
// сдвиг найден уверенно, применяем его. Один раз на серию; ждём, пока готовы И
// субтитры, И видеопоток (вызывается из обоих мест).
async function maybeAutoSync() {
    if (window.AnimeiSettings && window.AnimeiSettings.get('autoSyncSubs') === false) { setSyncing(false); return; }
    const key = offsetStorageKey();
    if (state.autoSyncKey === key) return;                       // уже пробовали для этой серии
    if (!state.cues.length || !state.currentVideoUrl) return;    // ждём вторую половину — время держим спрятанным
    // Уже есть сохранённый сдвиг — доверяем ему, не перезапрашиваем (у автосинка
    // один результат на серию; серверный Whisper-верификатор помогает НОВЫМ зрителям
    // серии через кэш — тем, у кого своего сохранённого сдвига ещё нет).
    if (localStorage.getItem(key) !== null) { state.autoSyncKey = key; setSyncing(false); return; }
    // MegaPlay: alass не может вытащить аудио с их CDN (extractWav упирается в
    // таймаут ~110с и возвращает «не смог») → автосинк только зря держит баннер
    // «синхронизация» пару минут и всё равно ничего не находит. Пропускаем: для
    // японской дорожки синк делает кнопка «Не совпадают?» (точный подбор по звуку).
    if (state.provider === 'megaplay') { state.autoSyncKey = key; setSyncing(false); return; }
    state.autoSyncKey = key;

    // Отдаём реплики шире (до 340с) — бэкенд анализирует более длинное окно, чтобы
    // у тайтлов с медленным началом было за что зацепиться (см. sync.service.js).
    // Старты И концы (параллельно, по индексам) — по интервалам речи alass строит
    // синтетический srt для VAD-выравнивания.
    const inWin = state.cues
        .filter((c) => Number.isFinite(c.start) && c.start >= 0 && c.start < 340)
        .slice(0, 260);
    const cueStarts = inWin.map((c) => c.start);
    const cueEnds = inWin.map((c) => (Number.isFinite(c.end) ? c.end : c.start + 2));
    if (cueStarts.length < 5) { setSyncing(false); return; }

    // Ключ дорожки-сериала — для консенсуса сдвига по сериям (у одной дорожки
    // обрезка интро одинакова, выброс одной серии правится по «соседям»).
    const trSel = selectedTrack();
    const seriesKey = shikimoriId + ':' + (trSel.id || trSel.provider || 'k') + ':s' + state.seasonIndex;

    // Тексты реплик на языке ЗВУКА — для фоновой Whisper-верификации по содержанию.
    // Японская дорожка (MegaPlay/сабы) → оригинал реплик; дубляж → на языке перевода.
    const audioLang = trackAudioLang(trSel);
    const cueTexts = inWin.map((c) => (audioLang === 'ja' ? (c.text || '') : (c.translation || c.text || '')));

    // Для MegaPlay передаём конец интро — субтитры из архива обычно без него,
    // и весь диалог смещён примерно на его длину (у автосинка иначе не тот диапазон).
    const introEnd = (state.provider === 'megaplay' && state.megaIntro) ? state.megaIntro.end : 0;

    // Показываем «синхронизируем…» и прячем тайм-коды на время запроса (может
    // занять секунды: бэкенд декодирует до ~340с звука через ffmpeg silencedetect).
    setSyncing(true);
    try {
        const { data: res } = await client.post('subtitles/align', {
            videoUrl: state.currentVideoUrl,
            cues: cueStarts,
            cueEnds,
            cueTexts,
            audioLang,
            seriesKey,
            introEnd,
        }, { timeout: 130000 });
        const { offset, confidence, matched, method } = res.data || {};
        // За время запроса серия могла смениться или пользователь мог тронуть сдвиг —
        // тогда не трогаем.
        if (offsetStorageKey() !== key || localStorage.getItem(key) !== null) return;
        // Применяем: либо высокая уверенность, либо средняя, но с реальной опорой
        // (много совпадений) и НЕБОЛЬШИМ сдвигом — маленький сдвиг почти незаметен
        // даже при неточности, а «зависший» рассинхрон раздражает сильнее. Большие
        // сдвиги (интро MegaPlay) по-прежнему требуют высокой уверенности.
        const strong = confidence >= 0.6;
        const okModerate = confidence >= 0.4 && (matched || 0) >= 12 && Math.abs(offset) <= 20;
        // Малый сдвиг с большой опорой: у дубляжа (Kodik) тайминг речи не совпадает
        // с японскими сабами дословно, поэтому доля совпадений упирается в ~0.4 даже
        // при верном сдвиге. Но если совпадений МНОГО (>=20) и сдвиг НЕБОЛЬШОЙ (<=6с),
        // сигнал реальный, а риск минимален — маленький сдвиг незаметен даже если чуть
        // мимо. Без этого серии вроде «Наруто 62» (offset 2.8, conf 0.39) не синкались.
        const okSmall = confidence >= 0.34 && (matched || 0) >= 20 && Math.abs(offset) <= 6;
        const trusted = Number.isFinite(offset) && (strong || okModerate || okSmall);
        // ВАЖНО: применяем только ЗАМЕТНЫЙ сдвиг (>=1.2с). Мелкий (<1.2с) — это обычно
        // естественное упреждение саба перед речью, а не рассинхрон; alass/онсеты
        // меряют по НАЧАЛУ РЕЧИ и дают такой «сдвиг» даже у идеально timed-сабов (напр.
        // «Атака титанов»: все дорожки дают −0.8с). Двигать их — только портить то, что
        // уже синхронно. Крупные сдвиги (обрезка интро, Наруто −31) применяются как есть.
        // Точный подбор (whisper-verified) — авторитетный общий сдвиг, найденный
        // другим пользователем: применяем ЛЮБОЙ его размер (даже <1.2с), чтобы точный
        // результат раздавался всем. Порог 1.2с — только для alass/онсетов (там мелкий
        // «сдвиг» обычно естественное упреждение, а не рассинхрон).
        if (trusted && (Math.abs(offset) >= 1.2 || method === 'whisper-verified')) {
            state.offset = offset;
            updateOffsetLabel();
            saveOffset();
            // Метод сдвига: 'whisper-verified' → в следующий раз не перезапрашиваем.
            localStorage.setItem(key + ':m', method || 'alass');
            renderTranscript();
            updateNowCue(state.activeCueIndex);
            showSnackbar(t('subs.autoSynced'), { duration: 3500 });
            if (window.animeiTrack) window.animeiTrack('autosync', offset.toFixed(1) + ' · ' + confidence.toFixed(2));
        } else if (trusted) {
            // Сдвиг мал — субтитры уже практически синхронны, оставляем как есть (0).
            // Фиксируем это (offset 0 + метод), чтобы не перезапрашивать каждый заход.
            state.offset = 0;
            saveOffset();
            localStorage.setItem(key + ':m', method || 'alass');
        }
    } catch { /* автосинк — не критично, остаются ручные «Сейчас!»/«Сдвиг» */ }
    finally {
        // Раскрываем время только если серия та же. Иначе (пользователь успел
        // переключить серию за время запроса) баннер/таймер уже принадлежат новой
        // серии — не гасим их, чтобы у неё не мелькнуло неверное время.
        if (offsetStorageKey() === key) setSyncing(false);
    }
}

// Точный подбор сдвига по запросу («не те?» → Whisper). Распознаёт речь дубляжа и
// матчит по содержанию — сервер считает синхронно (пара минут), показываем прогресс.
let preciseBusy = false;

// Опрос фоновой джобы точного подбора: короткие запросы каждые 5с (до ~5 мин).
// Обрыв сети на отдельном опросе не фатален — просто ждём следующего.
async function pollPreciseSync(jobId) {
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, 5000));
        try {
            const { data } = await client.get('subtitles/precise-sync/status', {
                params: { jobId }, timeout: 20000,
            });
            const s = data.data || {};
            if (s.done) return s;
        } catch { /* временный обрыв — продолжаем опрос */ }
    }
    return { ok: false, reason: 'timeout' };
}

async function preciseSyncSubs() {
    if (preciseBusy || !state.cues.length || !state.currentVideoUrl) return;
    const inWin = state.cues
        .filter((c) => Number.isFinite(c.start) && c.start >= 0 && c.start < 400)
        .slice(0, 300);
    const cueStarts = inWin.map((c) => c.start);
    if (cueStarts.length < 5) return;
    const trSel = selectedTrack();
    const audioLang = trackAudioLang(trSel);
    const cueTexts = inWin.map((c) => (audioLang === 'ja' ? (c.text || '') : (c.translation || c.text || '')));
    const seriesKey = shikimoriId + ':' + (trSel.id || trSel.provider || 'k') + ':s' + state.seasonIndex;
    const introEnd = (state.provider === 'megaplay' && state.megaIntro) ? state.megaIntro.end : 0;
    const key = offsetStorageKey();

    preciseBusy = true;
    if (subsPreciseBtn) subsPreciseBtn.disabled = true;
    setPreciseLoading(true);   // явный лоадер: «распознаём речь… сохранится навсегда»
    try {
        // Расчёт идёт в фоне на сервере: POST быстро отдаёт jobId, дальше опрашиваем
        // статус короткими запросами — они переживают обрыв мобильной сети (раньше
        // один длинный запрос рвался с 499 и показывал ошибку).
        const { data: res } = await client.post('subtitles/precise-sync', {
            videoUrl: state.currentVideoUrl, cues: cueStarts, cueTexts, audioLang, seriesKey, introEnd,
        }, { timeout: 20000 });
        let r = res.data || {};
        if (r.ok && r.pending && r.jobId) r = await pollPreciseSync(r.jobId);
        if (r.ok && Number.isFinite(r.offset)) {
            if (offsetStorageKey() === key) {   // серия не сменилась за время подбора
                state.offset = r.offset;
                updateOffsetLabel();
                saveOffset();
                localStorage.setItem(key + ':m', 'whisper-verified');   // точный — больше не трогаем
                renderTranscript();
                updateNowCue(state.activeCueIndex);
                refreshOffsetDisplay();
            }
            setPreciseLoading(false);
            if (subsPreciseStatus) subsPreciseStatus.textContent = t('subs.precise.done');
            showSnackbar(t('subs.precise.done'), { duration: 3500 });
            setTimeout(closeSubsPicker, 900);
        } else {
            setPreciseLoading(false);
            if (subsPreciseStatus) subsPreciseStatus.textContent = t('subs.precise.fail');
        }
    } catch {
        setPreciseLoading(false);
        if (subsPreciseStatus) subsPreciseStatus.textContent = t('subs.precise.fail');
    } finally {
        preciseBusy = false;
        if (subsPreciseBtn) subsPreciseBtn.disabled = false;
    }
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
}

// ---------- Фуригана ----------
// Чтение приходит с сервера хираганой для каждого слова. Над кандзи вешаем
// его через <ruby>, совпадающую кану по краям (окуригану) оставляем как есть.

const KANJI_RE = /[一-龯㐀-䶵々〆ヶ]/;

function isKanaChar(ch) {
    const c = ch.charCodeAt(0);
    return (c >= 0x3041 && c <= 0x3096) || (c >= 0x30a1 && c <= 0x30fa) || ch === 'ー';
}

// 降る + ふる → [{text:'降', rt:'ふ'}, {text:'る', rt:null}]
function furiganaSegments(surface, reading) {
    if (!surface || !reading || !KANJI_RE.test(surface) || surface === reading) {
        return [{ text: surface, rt: null }];
    }

    let s = surface, r = reading, head = '', tail = '';
    while (s.length && r.length && isKanaChar(s[0]) && s[0] === r[0]) {
        head += s[0]; s = s.slice(1); r = r.slice(1);
    }
    while (s.length && r.length && isKanaChar(s[s.length - 1]) && s[s.length - 1] === r[r.length - 1]) {
        tail = s[s.length - 1] + tail; s = s.slice(0, -1); r = r.slice(0, -1);
    }

    const segs = [];
    if (head) segs.push({ text: head, rt: null });
    if (s) segs.push({ text: s, rt: r || null });
    if (tail) segs.push({ text: tail, rt: null });
    return segs.length ? segs : [{ text: surface, rt: null }];
}

function appendWithFurigana(el, surface, reading) {
    for (const seg of furiganaSegments(surface, reading)) {
        if (seg.rt) {
            const ruby = document.createElement('ruby');
            ruby.append(seg.text);
            const rt = document.createElement('rt');
            rt.textContent = seg.rt;
            ruby.appendChild(rt);
            el.appendChild(ruby);
        } else {
            el.append(seg.text);
        }
    }
}

// Один переключатель чтения над словами: кана ЛИБО ромадзи (без «выкл»).
// Применяется и к центральному оверлею (buildWordCells), и к списку субтитров
// справа — оба показывают чтение НАД каждым словом (пословно, как эталон).
function applyReadingPref() {
    const seg = document.getElementById('reading-toggle');
    if (seg) {
        // Сегмент-контрол (кана | ромадзи) — подсвечиваем активный сегмент, как
        // в переключателе чтения японских новостей: сразу видно, что это выбор.
        seg.querySelectorAll('.reading-seg__btn').forEach((b) =>
            b.classList.toggle('active', b.dataset.reading === state.readingMode));
    }
    // Перерисовываем список — чтение над словами строится по текущему режиму.
    if (typeof renderTranscript === 'function') renderTranscript();
    // renderTranscript пересобирает реплики — вернём подсветку текущей.
    if (state.activeCueIndex >= 0) {
        const el = transcriptList.querySelector(`.cue[data-index="${state.activeCueIndex}"]`);
        if (el) el.classList.add('cue--active');
    }
    if (typeof updateNowCue === 'function') updateNowCue(state.activeCueIndex);
}

// ---------- Ромадзи ----------
// Транскрипция латиницей для тех, кто ещё не читает кану. Чтения приходят с
// сервера хираганой — переводим их в ромадзи (упрощённый Хепбёрн).

const ROMAJI_DIGRAPHS = {
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho', 'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo', 'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo', 'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo', 'ぢゃ': 'ja', 'ぢゅ': 'ju', 'ぢょ': 'jo',
    'てぃ': 'ti', 'でぃ': 'di', 'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
    'しぇ': 'she', 'ちぇ': 'che', 'じぇ': 'je', 'うぃ': 'wi', 'うぇ': 'we', 'ゔ': 'vu',
};

const ROMAJI_MONO = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ん': 'n',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ー': '',
};

function kanaToRomaji(input) {
    if (!input) return '';
    // Катакану приводим к хирагане — таблица одна на обе слоговые азбуки
    const s = input.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const two = s.slice(i, i + 2);
        if (ROMAJI_DIGRAPHS[two]) { out += ROMAJI_DIGRAPHS[two]; i++; continue; }
        const ch = s[i];
        if (ch === 'っ' || ch === 'ッ') {
            // маленькое цу удваивает согласный следующего слога (っち → tchi)
            const nr = ROMAJI_DIGRAPHS[s.slice(i + 1, i + 3)] || ROMAJI_MONO[s[i + 1]] || '';
            if (nr) out += nr[0] === 'c' ? 't' : nr[0];
            continue;
        }
        if (ch === 'ー') { // тире продлевает предыдущую гласную
            const last = out[out.length - 1];
            if ('aeiou'.includes(last)) out += last;
            continue;
        }
        out += ROMAJI_MONO[ch] ?? ch;
    }
    return out;
}

// Строка ромадзи для реплики: по чтениям токенов, знаки препинания без пробела
function romajiForCue(cue) {
    if (!cue.tokens || !cue.tokens.length) return '';
    return cue.tokens
        .map((tok) => kanaToRomaji(tok.reading || tok.surface))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+([.,!?、。」』】）)])/g, '$1')
        .replace(/([「『【（(])\s+/g, '$1')
        .trim();
}

// Пословная раскладка (в стиле lexirise): каждое слово — отдельный столбик
// [чтение сверху][слово]. Одинаково строит и ЦЕНТРАЛЬНЫЙ оверлей под видео, и
// СПИСОК субтитров справа (renderTranscript) — чтобы выглядели как эталон.
function buildWordCells(cue) {
    if (!cue.tokens || !cue.tokens.length) {
        const span = document.createElement('span');
        span.textContent = cue.text;
        return [span];
    }

    return cue.tokens.map((tok) => {
        const cell = document.createElement('span');
        cell.className = 'ncw';

        // Над словом — ОДНО чтение по выбранному режиму: кана ЛИБО ромадзи, не оба.
        let reading = '';
        if (state.readingMode === 'romaji') reading = kanaToRomaji(tok.reading || tok.surface);
        else if (state.readingMode === 'kana') reading = readingKana(tok);
        if (reading && reading !== tok.surface) {
            const rm = document.createElement('span');
            rm.className = 'ncw__read';
            rm.textContent = reading;
            cell.appendChild(rm);
        }

        // Само слово — без внутренней фуриганы (чтение теперь одной строкой сверху).
        // Классы .tok сохраняем, чтобы работали стили и клик по изучаемому слову.
        const jp = document.createElement('span');
        jp.textContent = tok.surface;
        jp.className = 'ncw__jp tok';
        if (tok.learnable) {
            jp.classList.add('tok--learnable');
            // База слова в data-атрибуте: после сохранения подсвечиваем все
            // вхождения этого слова (оверлей + список) без пере-рендера.
            jp.dataset.base = tok.base || tok.surface;
            if (state.knownWords.has(tok.base) || state.knownWords.has(tok.surface)) {
                jp.classList.add('tok--known');
            }
            jp.addEventListener('click', (e) => {
                e.stopPropagation();
                openWordPopup(tok, cue, e);
            });
        }
        cell.appendChild(jp);
        return cell;
    });
}

// Кана-чтение слова для показа над ним — только если в слове есть кандзи (у
// чисто-канного слова чтение совпадает с ним самим, дублировать не нужно).
function readingKana(tok) {
    if (!tok.reading || tok.reading === tok.surface) return '';
    if (!KANJI_RE.test(tok.surface)) return '';
    return tok.reading;
}

// Иконка «искры ИИ» — та же, что в кнопке разбора словарной карточки.
const AI_ICON_SVG = '<svg class="ai-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 2 9.15 6.15 5 8l4.15 1.85L11 14l1.85-4.15L17 8l-4.15-1.85L11 2Zm7.5 9-1.1 2.4-2.4 1.1 2.4 1.1 1.1 2.4 1.1-2.4 2.4-1.1-2.4-1.1L18.5 11Z"/></svg>';

function renderTranscript() {
    transcriptList.querySelectorAll('.cue').forEach(el => el.remove());

    state.cues.forEach((cue, i) => {
        const div = document.createElement('div');
        div.className = 'cue';
        div.dataset.index = i;

        const time = document.createElement('div');
        time.className = 'cue__time';
        // Показываем время С УЧЁТОМ сдвига — иначе после автосинка (напр. +85с у
        // оригинальной дорожки) тайм-коды реплик не совпадали с позицией видео.
        time.textContent = formatTime(Math.max(0, cue.start + state.offset));
        div.appendChild(time);

        // Реплика — ПОСЛОВНО, как эталон (полоска субтитров под видео): над каждым
        // словом одно чтение (кана ИЛИ ромадзи), само слово ниже (см. buildWordCells).
        const jp = document.createElement('div');
        jp.className = 'cue__jp';
        buildWordCells(cue).forEach(s => jp.appendChild(s));
        div.appendChild(jp);

        if (cue.translation) {
            const ru = document.createElement('div');
            ru.className = 'cue__ru';
            ru.textContent = cue.translation;
            div.appendChild(ru);
        }

        // ИИ-разбор реплики — иконка в правом верхнем углу строки. Кнопки в DOM
        // всегда; видимы, только когда ИИ доступен (класс ai-on на списке).
        const aiBtn = document.createElement('button');
        aiBtn.type = 'button';
        aiBtn.className = 'cue__ai';
        aiBtn.title = t('words.explain');
        aiBtn.innerHTML = AI_ICON_SVG;
        aiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSentenceExplain(cue, e);
        });
        div.appendChild(aiBtn);

        div.addEventListener('click', () => {
            video.currentTime = cue.start + state.offset + 0.01;
            video.play().catch(() => {});
        });

        transcriptList.appendChild(div);
    });

    // Сабы (пере)загружены — пересчитываем «ты знаешь N% слов серии».
    updateCoverage();
}

// ---------- Текущая реплика под видео ----------

const nowCue = document.getElementById('now-cue');
const nowCueJp = document.getElementById('now-cue-jp');
const nowCueRu = document.getElementById('now-cue-ru');

// Реплика, показанная в блоке под видео (в тишине там остаётся последняя —
// иконка ИИ должна разбирать именно её, а не «ничего»).
let nowCueIdx = -1;

document.getElementById('now-cue-ai').addEventListener('click', (e) => {
    e.stopPropagation();
    const cue = state.cues[nowCueIdx];
    if (cue) openSentenceExplain(cue, e);
});
// По умолчанию кнопка ИИ скрыта (inline перебивает класс .ai-on) — иначе при
// старте, когда реплики ещё нет, она висела «без предложения». Покажем её только
// когда под видео реально появится разбираемая реплика (updateNowCue, idx>=0).
document.getElementById('now-cue-ai').style.display = 'none';

function updateNowCue(idx) {
    // Пока субтитры загружены, блок всегда на месте — чтобы верстка не прыгала.
    if (!state.cues.length) {
        nowCue.hidden = true;
        return;
    }
    nowCue.hidden = false;
    if (idx < 0) {
        // Тишина. Между репликами оставляем последнюю (не мигаем), но если реплики
        // ещё не было ни одной — прячем кнопку ИИ: разбирать нечего (нет предложения).
        if (nowCueIdx < 0) {
            const aiBtn0 = document.getElementById('now-cue-ai');
            if (aiBtn0) aiBtn0.style.display = 'none';
        }
        return;
    }
    nowCueIdx = idx;
    const cue = state.cues[idx];
    // Кнопку ИИ-разбора прячем, если в реплике нет разбираемых слов (музыка «♪»,
    // звуки, пустая строка) — разбирать нечего.
    const aiBtn = document.getElementById('now-cue-ai');
    if (aiBtn) aiBtn.style.display = cueHasWords(cue) ? '' : 'none';
    // Реплика под видео — пословно: над каждым словом ромадзи, само слово с
    // фуриганой, а перевод одной строкой ниже (см. buildWordCells).
    nowCueJp.innerHTML = '';
    buildWordCells(cue).forEach(s => nowCueJp.appendChild(s));
    nowCueRu.textContent = cue.translation || '';
    nowCueRu.style.display = (cue.translation && state.showRu) ? '' : 'none';
}

// Есть ли в реплике разбираемые (кликабельные) слова.
function cueHasWords(cue) {
    return !!(cue && cue.tokens && cue.tokens.some((tk) => tk.learnable));
}

// ---------- Покрытие серии словарём ----------
// «Ты знаешь N% слов этой серии» — считаем по уникальным словарным формам
// из токенов сабов против сохранённых слов. Обновляется после загрузки сабов,
// подгрузки словаря и каждого сохранения — цифра растёт прямо во время сессии.
function updateCoverage() {
    const el = document.getElementById('episode-coverage');
    if (!el) return;
    const bases = new Set();
    for (const c of state.cues) {
        for (const tk of (c.tokens || [])) {
            if (tk.learnable) bases.add(tk.base || tk.surface);
        }
    }
    // На горстке слов процент — шум (сабы ещё не загрузились или это клип).
    if (bases.size < 30) { el.hidden = true; return; }
    let known = 0;
    for (const b of bases) if (state.knownWords.has(b)) known++;
    // Крайние значения не округляем до вырожденных: 2 из 417 — это «<1%»,
    // а не обидный «0%»; и наоборот, 99.6% ещё не «100%».
    let pct = Math.round((100 * known) / bases.size);
    if (pct === 0 && known > 0) pct = '<1';
    else if (pct === 100 && known < bases.size) pct = 99;
    // Компактно: в шапке — короткий значок «📖 N%», полный текст «Ты знаешь N%
    // слов этой серии (K из N)» — в подсказке (title), чтобы не занимать строку.
    el.textContent = '📖 ' + pct + '%';
    el.title = t('player.coverage')
        .replace('{p}', pct)
        .replace('{k}', known)
        .replace('{n}', bases.size);
    el.hidden = false;
}

// Подсветить слово как «известное» во всех уже отрисованных местах — оверлей
// под видео и список субтитров — без пере-рендера (он сбил бы скролл списка).
function markKnownEverywhere(base) {
    if (!base) return;
    const esc = (window.CSS && CSS.escape) ? CSS.escape(base) : base.replace(/"/g, '\\"');
    document.querySelectorAll(`.tok--learnable[data-base="${esc}"]`)
        .forEach((tok) => tok.classList.add('tok--known'));
}

function findCueIndex(t) {
    // Реплики отсортированы — ищем текущую по времени с учётом сдвига
    for (let i = 0; i < state.cues.length; i++) {
        const c = state.cues[i];
        if (t >= c.start + state.offset && t <= c.end + state.offset) return i;
        if (c.start + state.offset > t) return -1;
    }
    return -1;
}

// ---------- Счётчик встреч сохранённых слов ----------
// Когда реплика становится активной, отмечаем в ней встречи слов, которые
// пользователь уже сохранил (animei:wordSeen = {base: n}). Попап показывает
// «встречалось N раз» — ощущение прогресса прямо во время просмотра.
let wordSeenMap = null;
function loadWordSeen() {
    if (wordSeenMap) return wordSeenMap;
    try {
        wordSeenMap = JSON.parse(localStorage.getItem('animei:wordSeen') || '{}');
        if (!wordSeenMap || typeof wordSeenMap !== 'object') wordSeenMap = {};
    } catch { wordSeenMap = {}; }
    return wordSeenMap;
}

let wordSeenSaveTimer = null;
function countSeenWords(cue) {
    if (!cue || !cue.tokens || !state.knownWords.size) return;
    const map = loadWordSeen();
    let changed = false;
    const inCue = new Set();
    for (const tok of cue.tokens) {
        if (!tok.learnable || !tok.base || inCue.has(tok.base)) continue;
        if (!state.knownWords.has(tok.base) && !state.knownWords.has(tok.surface)) continue;
        inCue.add(tok.base);
        map[tok.base] = (map[tok.base] || 0) + 1;
        changed = true;
    }
    if (!changed) return;
    clearTimeout(wordSeenSaveTimer);
    wordSeenSaveTimer = setTimeout(() => {
        try { localStorage.setItem('animei:wordSeen', JSON.stringify(map)); } catch { /* недоступен */ }
    }, 1500);
}

// ---------- Субтитры источника поверх видео ----------
// Нужны там, где картинка чистая (KickAssAnime): у остальных источников сабы
// вжаты в кадр, и второй слой поверх превратился бы в кашу.

function parseVttCues(text) {
    const out = [];
    const ts = (v) => {
        const m = String(v).trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
        if (!m) return null;
        return (Number(m[1] || 0)) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    };
    const blocks = String(text).split(/\n\s*\n/);
    for (const raw of blocks) {
        const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
        const tl = lines.find((l) => l.includes('-->'));
        if (!tl) continue;
        const parts = tl.split('-->');
        const start = ts(parts[0]);
        const end = ts(parts[1]);
        if (start === null || end === null) continue;
        // Теги оформления (<i>, <c.name>) и позиционные настройки не рисуем.
        const body = lines.slice(lines.indexOf(tl) + 1).join('\n').replace(/<[^>]+>/g, '').trim();
        if (body) out.push({ start, end, text: body });
    }
    return out.sort((a, b) => a.start - b.start);
}

async function loadBurnedSubs(url) {
    clearBurnedSubs();
    if (!url) return;
    try {
        const r = await fetch(apiOrigin() + url);
        if (!r.ok) return;
        state.burnedCues = parseVttCues(await r.text());
        // Реплики есть — помечаем контейнер, чтобы в полноэкранном режиме CSS
        // спрятал учебный оверлей и в кадре осталась одна строка текста.
        if (state.burnedCues.length) videoWrap?.classList.add('has-burned-sub');
    } catch (err) {
        console.log('[burned-sub]', err.message);
    }
}

function clearBurnedSubs() {
    state.burnedCues = [];
    state.burnedIndex = -1;
    if (burnedSub) {
        burnedSub.textContent = '';
        burnedSub.classList.remove('is-on');
    }
    // Флаг на контейнере: по нему CSS убирает учебный оверлей в полноэкранном
    // режиме, чтобы в кадре не было двух блоков текста друг на друге.
    videoWrap?.classList.remove('has-burned-sub');
}

// Отдельный цикл: учебные реплики (state.cues) и сабы источника живут независимо —
// у них разные тайминги и разные источники, одно не должно гасить другое.
function syncBurnedSub() {
    if (!burnedSub || !state.burnedCues.length) return;
    const t = video.currentTime;
    let idx = -1;
    for (let i = 0; i < state.burnedCues.length; i++) {
        const c = state.burnedCues[i];
        if (t >= c.start && t <= c.end) { idx = i; break; }
        if (c.start > t) break;   // список отсортирован — дальше только позже
    }
    if (idx === state.burnedIndex) return;
    state.burnedIndex = idx;
    if (idx < 0) {
        burnedSub.classList.remove('is-on');
        // Текст тоже чистим: невидимый остаток мешал отладке и мог мигнуть
        // при следующем показе до подстановки новой реплики.
        burnedSub.textContent = '';
        return;
    }
    burnedSub.textContent = state.burnedCues[idx].text;
    burnedSub.classList.add('is-on');
}

function syncCues() {
    if (!state.cues.length) return;
    const t = video.currentTime;

    // Авто-пауза в конце реплики
    if (state.autoPause && state.autoPauseAt !== null && t >= state.autoPauseAt) {
        video.pause();
        state.autoPauseAt = null;
    }

    const idx = findCueIndex(t);
    if (idx === state.activeCueIndex) return;

    const prev = transcriptList.querySelector('.cue--active');
    if (prev) prev.classList.remove('cue--active');

    state.activeCueIndex = idx;
    updateNowCue(idx);
    if (idx >= 0) countSeenWords(state.cues[idx]);

    if (idx >= 0) {
        const el = transcriptList.querySelector(`.cue[data-index="${idx}"]`);
        if (el) {
            el.classList.add('cue--active');
            // Едем за репликой только пока пользователь не листает список сам и не
            // идёт автосинк (тайминги во время синка ненадёжны).
            if (state.followCue && !state.syncing) scrollCueIntoView(el);
        }
        if (state.autoPause) {
            state.autoPauseAt = state.cues[idx].end + state.offset;
        }
    }
    // Реплика сменилась, пока список пролистан вручную — стрелка «К текущей» могла
    // поменять сторону (текущая реплика уехала выше/ниже кадра).
    if (!jumpBtn.hidden) updateJumpDirection();
}

// timeupdate срабатывает всего ~4 раза в секунду — реплика появлялась с опозданием
// до четверти секунды (а с тормозами браузера и больше). Во время воспроизведения
// сверяемся с currentTime каждый кадр (как в watch.js); timeupdate оставляем для
// перемотки на паузе. syncCues дешёвый: при том же индексе выходит сразу.
video.addEventListener('timeupdate', () => { syncCues(); syncBurnedSub(); });
(function cueSyncLoop() {
    if (!video.paused && !video.ended) { syncCues(); syncBurnedSub(); }
    requestAnimationFrame(cueSyncLoop);
})();

// ---------- Слежение за списком ----------
// Пока followCue включён, список сам подкручивается к текущей реплике.
// Как только пользователь листает сам — отключаем слежение и показываем
// кнопку «К текущей», чтобы можно было вернуться к цитате одним нажатием.

let programmaticScroll = false;
let programmaticScrollTimer = null;

function scrollCueIntoView(el) {
    programmaticScroll = true;
    clearTimeout(programmaticScrollTimer);
    // Помечаем окно, в котором scroll-события — наши, а не пользовательские.
    // На телефоне плавная прокрутка длится дольше 400 мс — берём с запасом,
    // иначе поздний scroll-эвент примут за ручное листание и слежение отключится.
    programmaticScrollTimer = setTimeout(() => { programmaticScroll = false; }, 700);
    // Крутим ТОЛЬКО сам список, а не страницу. scrollIntoView с block:'center'
    // прокручивает все родительские скроллы, а на телефоне прокручивается и body —
    // из-за этого уезжала вся страница с видео, а реплика внутри панели субтитров
    // не двигалась (сабы «не скроллились совсем»). Считаем сдвиг вручную.
    const listRect = transcriptList.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = (elRect.top - listRect.top) - (transcriptList.clientHeight - el.offsetHeight) / 2;
    transcriptList.scrollBy({ top: delta, behavior: 'smooth' });
}

// «К текущей» видна только когда пользователь листал сам И не идёт автосинк.
function updateJumpVisibility() {
    const show = !state.followCue && !state.syncing;
    jumpBtn.hidden = !show;
    jumpBtn.classList.toggle('is-visible', show);
    if (show) updateJumpDirection();
}

// Стрелку на кнопке разворачиваем по направлению к текущей реплике: если она выше
// видимой области списка (пользователь пролистал вниз) — стрелка вверх; если ниже —
// вниз. Класс --up разворачивает иконку (см. player.css).
function currentCueEl() {
    let el = transcriptList.querySelector('.cue--active');
    // Между репликами активной нет — берём последнюю прозвучавшую (как в setFollowCue).
    if (!el && state.cues.length) {
        const t = video.currentTime;
        let idx = 0;
        for (let i = 0; i < state.cues.length; i++) {
            if (state.cues[i].start + state.offset <= t) idx = i;
            else break;
        }
        el = transcriptList.querySelector(`.cue[data-index="${idx}"]`);
    }
    return el;
}

function updateJumpDirection() {
    if (jumpBtn.hidden) return;
    const listRect = transcriptList.getBoundingClientRect();
    // Панель субтитров может быть display:none (напр. вкладка «Настройки» на телефоне) —
    // тогда rect нулевой, и измерение затёрло бы верную сторону стрелки. Не трогаем.
    if (!listRect.height) return;
    const el = currentCueEl();
    if (!el) return;
    const elRect = el.getBoundingClientRect();
    const cueMid = elRect.top + elRect.height / 2;
    // Реплика выше видимой области → возвращаться вверх; иначе (ниже/в кадре) — вниз.
    jumpBtn.classList.toggle('transcript__jump--up', cueMid < listRect.top);
}

function setFollowCue(on) {
    state.followCue = on;
    updateJumpVisibility();
    if (on) {
        let el = transcriptList.querySelector('.cue--active');
        // Между репликами активной нет (в тишине класс снимается) — кнопка
        // «молчала». Едем к последней прозвучавшей реплике, а до первой — к первой.
        if (!el && state.cues.length) {
            const t = video.currentTime;
            let idx = 0;
            for (let i = 0; i < state.cues.length; i++) {
                if (state.cues[i].start + state.offset <= t) idx = i;
                else break;
            }
            el = transcriptList.querySelector(`.cue[data-index="${idx}"]`);
        }
        if (el) scrollCueIntoView(el);
    }
}

// Любая явная попытка прокрутки колесом/пальцем — это ручное листание
['wheel', 'touchmove'].forEach((ev) => {
    transcriptList.addEventListener(ev, () => { if (state.followCue) setFollowCue(false); }, { passive: true });
});
// Ловим и перетаскивание ползунка скроллбара: любой scroll, который сделали не мы
transcriptList.addEventListener('scroll', () => {
    if (!programmaticScroll && state.followCue) setFollowCue(false);
    else updateJumpDirection(); // кнопка видна — держим стрелку в актуальную сторону
}, { passive: true });

jumpBtn.addEventListener('click', () => setFollowCue(true));

// ---------- Автосинк субтитров ----------
// Ручной «Сдвиг сабов» убран из интерфейса; смещение теперь подбирает ТОЛЬКО
// автосинк (maybeAutoSync). Эти помощники пересчитывают тайм-коды/оверлей и
// сохраняют найденное смещение, чтобы не подгонять его при каждой загрузке.

function updateOffsetLabel() {
    state.activeCueIndex = -2; // перерисовать оверлей
    updateTranscriptTimes();   // тайм-коды в транскрипте — с учётом нового сдвига
}

// Лёгкое обновление тайм-кодов в списке реплик (без полной перерисовки токенов).
function updateTranscriptTimes() {
    const times = transcriptList.querySelectorAll('.cue__time');
    state.cues.forEach((cue, i) => {
        if (times[i]) times[i].textContent = formatTime(Math.max(0, cue.start + state.offset));
    });
}

// Смещение, найденное автосинком, сохраняем — чтобы не пересчитывать заново.
function saveOffset() {
    localStorage.setItem(offsetStorageKey(), String(state.offset));
}

// ---------- Режимы ----------

const autopauseBtn = document.getElementById('autopause-btn');
const ruToggle = document.getElementById('ru-toggle');

function toggleAutoPause() {
    state.autoPause = !state.autoPause;
    state.autoPauseAt = state.autoPause && state.activeCueIndex >= 0
        ? state.cues[state.activeCueIndex].end + state.offset
        : null;
    autopauseBtn.classList.toggle('chip-btn--active', state.autoPause);
}

autopauseBtn.addEventListener('click', toggleAutoPause);

// RU — показать/скрыть русский перевод в списке субтитров
ruToggle.addEventListener('click', () => {
    state.showRu = !state.showRu;
    ruToggle.classList.toggle('chip-btn--active', state.showRu);
    transcriptList.classList.toggle('hide-ru', !state.showRu);
    updateNowCue(state.activeCueIndex);
});

// Чтение над словами — сегмент-контрол «кана | ромадзи» (или/или, без «выкл»):
// тап по сегменту сразу выбирает режим.
document.querySelectorAll('#reading-toggle .reading-seg__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (btn.dataset.reading === state.readingMode) return;
        state.readingMode = btn.dataset.reading;
        localStorage.setItem('animei:readingMode', state.readingMode);
        applyReadingPref();
    });
});

// Лейбл кнопки перевода = язык перевода сабов (subsLang следует за интерфейсом):
// у EN-интерфейса перевод английский, поэтому «EN», а не всегда «RU».
ruToggle.textContent = ({ ru: 'RU', uk: 'UA', en: 'EN' })[subsLang()] || 'RU';

// Стартовое состояние переключателей из глобальных настроек (перевод, авто-пауза).
ruToggle.classList.toggle('chip-btn--active', state.showRu);
transcriptList.classList.toggle('hide-ru', !state.showRu);
autopauseBtn.classList.toggle('chip-btn--active', state.autoPause);

// ---------- Навигация по репликам ----------
// Общие для хоткеев, кнопок у строки субтитров и свайпа на телефоне.

function seekToCue(cue) {
    video.currentTime = cue.start + state.offset + 0.01;
    if (state.autoPause) state.autoPauseAt = cue.end + state.offset;
    video.play().catch(() => {});
}

// Повторить текущую (или последнюю прозвучавшую) реплику
function replayCue() {
    let cue = state.activeCueIndex >= 0 ? state.cues[state.activeCueIndex] : null;
    if (!cue) {
        const t = video.currentTime;
        cue = [...state.cues].reverse().find(c => c.start + state.offset <= t);
    }
    if (cue) seekToCue(cue);
}

function nextCue() {
    const t = video.currentTime;
    const next = state.cues.find(c => c.start + state.offset > t + 0.05);
    if (next) seekToCue(next);
}

// Порог 0.8с: в начале реплики «назад» уходит к предыдущей, а не к её же старту
// (к старту текущей ведёт «повторить»).
function prevCue() {
    const t = video.currentTime;
    let cue = null;
    for (const c of state.cues) {
        if (c.start + state.offset < t - 0.8) cue = c;
        else break;
    }
    if (cue) seekToCue(cue);
}


// Свайп по строке субтитров на телефоне: влево — следующая, вправо — предыдущая.
let cueSwipe = null;
nowCue.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    cueSwipe = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
nowCue.addEventListener('touchend', (e) => {
    if (!cueSwipe) return;
    const dx = e.changedTouches[0].clientX - cueSwipe.x;
    const dy = e.changedTouches[0].clientY - cueSwipe.y;
    cueSwipe = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) (dx < 0 ? nextCue : prevCue)();
}, { passive: true });

// ---------- Хоткеи ----------

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            video.paused ? video.play() : video.pause();
            break;
        case 'KeyA':
            e.preventDefault();
            replayCue();
            break;
        case 'KeyQ':
            e.preventDefault();
            prevCue();
            break;
        case 'KeyS':
            e.preventDefault();
            toggleAutoPause();
            break;
        case 'KeyD':
            e.preventDefault();
            nextCue();
            break;
    }
});

// ---------- Словарная карточка ----------

const popup = document.getElementById('word-popup');
const popupWord = document.getElementById('popup-word');
const popupReading = document.getElementById('popup-reading-text');
const popupBody = document.getElementById('popup-body');
const popupSentence = document.getElementById('popup-sentence');
const popupSave = document.getElementById('popup-save');
const popupExplain = document.getElementById('popup-explain');
const popupExplainBtn = document.getElementById('popup-explain-btn');
// Меняем только текстовую подпись, чтобы иконка ИИ в кнопке не пропадала.
const popupExplainLabel = popupExplainBtn.querySelector('.btn-label') || popupExplainBtn;

// Кнопка «Назад» (в т.ч. системная на Android/жест) должна закрывать открытую
// словарную карточку / разбор предложения, а не уводить со страницы просмотра.
// Открытие карточки кладёт одну запись в history, закрытие — снимает её; системный
// «назад» ловим через popstate и просто прячем карточку, никуда не переходя.
let popupHistoryOpen = false;
function markPopupOpen() {
    if (popupHistoryOpen) return;
    popupHistoryOpen = true;
    history.pushState({ animeiPopup: 1 }, '');
}
function closeWordPopup() {
    if (popup.hidden) return;
    if (popupHistoryOpen) {
        history.back();           // снимет нашу запись → popstate спрячет карточку
    } else {
        popup.hidden = true;
    }
}
window.addEventListener('popstate', () => {
    if (popupHistoryOpen) {
        popupHistoryOpen = false;
        popup.hidden = true;
    }
});

// Узнаём один раз, настроен ли на сервере ИИ; если нет — кнопки разбора не будет
client.get('explain/status')
    .then(({ data: res }) => {
        state.aiAvailable = !!res?.data?.available;
        // Иконки ИИ-разбора у реплик (список и строка под видео) — только с ИИ.
        transcriptList.classList.toggle('ai-on', state.aiAvailable);
        nowCue.classList.toggle('ai-on', state.aiAvailable);
        // Карточка уже открыта, а статус пришёл позже — показываем кнопку разбора сразу
        if (state.aiAvailable && !popup.hidden && popupExplain.hidden) popupExplainBtn.hidden = false;
    })
    .catch(() => {});

async function openWordPopup(tok, cue, event) {
    video.pause();

    popup.classList.remove('word-popup--sentence');
    state.popupContext = { tok, cue, dict: null, event };

    popupWord.textContent = tok.base;
    // Показываем слово (tok.base) и чтение согласованно — от базовой формы:
    // baseReading (かえる), а не поверхностное tok.reading (かえっ). Ниже, если
    // найдётся словарная статья, чтение уточнится из неё.
    popupReading.textContent = tok.baseReading || tok.reading || '';
    popupSentence.textContent = cue.text;
    popupBody.innerHTML = '<div class="dict-loading"></div>';
    popupBody.firstChild.textContent = t('popup.searching');
    popupSave.disabled = false;
    popupSave.textContent = t('popup.save');

    // Блок ИИ-разбора: сворачиваем прошлый, кнопку показываем заново
    popupExplain.hidden = true;
    popupExplain.innerHTML = '';
    popupExplainBtn.hidden = !state.aiAvailable;
    popupExplainBtn.disabled = false;
    popupExplainLabel.textContent = t('popup.explain');

    popup.hidden = false;
    markPopupOpen();
    positionPopup(event);

    try {
        // lang: глоссы jisho английские — бэкенд переводит их на язык интерфейса
        const { data: res } = await client.get('dictionary', {
            params: { q: tok.base, lang: (typeof getLang === 'function') ? getLang() : 'ru' },
        });
        const entries = res.data || [];
        if (state.popupContext?.tok !== tok) return;

        state.popupContext.dict = entries[0] || null;

        if (!entries.length) {
            popupBody.innerHTML = '<div class="dict-loading"></div>';
            popupBody.firstChild.textContent = t('popup.notFound');
            return;
        }

        if (entries[0].reading) popupReading.textContent = entries[0].reading;

        popupBody.innerHTML = '';
        for (const sense of entries[0].senses) {
            const div = document.createElement('div');
            div.className = 'sense';
            const pos = document.createElement('div');
            pos.className = 'sense__pos';
            pos.textContent = sense.pos.join(', ');
            const defs = document.createElement('div');
            defs.textContent = sense.definitions.join('; ');
            div.appendChild(pos);
            div.appendChild(defs);
            popupBody.appendChild(div);
        }

        const meta = [];
        if (entries[0].isCommon) meta.push(t('popup.common'));
        if (entries[0].jlpt?.length) meta.push(entries[0].jlpt[0].toUpperCase());
        // Сохранённое слово встретилось снова — покажем, в который раз:
        // маленькое «оно работает», не выходя из просмотра.
        const seenCount = loadWordSeen()[tok.base] || 0;
        if (seenCount >= 2 && (state.knownWords.has(tok.base) || state.knownWords.has(tok.surface))) {
            meta.push(t('popup.seen').replace('{n}', seenCount));
        }
        if (meta.length) {
            const tag = document.createElement('div');
            tag.className = 'sense__pos';
            tag.textContent = meta.join(' · ');
            popupBody.appendChild(tag);
        }
    } catch (err) {
        console.error(err);
        if (state.popupContext?.tok !== tok) return;
        // Словарь не ответил — даём кнопку повторить, а не глухую ошибку
        popupBody.innerHTML = '';
        const msg = document.createElement('div');
        msg.className = 'dict-loading';
        msg.textContent = t('popup.noResponse');
        const retry = document.createElement('button');
        retry.className = 'chip-btn word-popup__retry';
        retry.textContent = t('popup.retry');
        retry.addEventListener('click', () => openWordPopup(tok, cue, state.popupContext.event));
        popupBody.appendChild(msg);
        popupBody.appendChild(retry);
    }
}

// ---------- ИИ-разбор реплики ----------

// Соседние реплики отправляем как контекст: ИИ лучше понимает диалог
function cueContext(cue) {
    const i = state.cues.indexOf(cue);
    return [state.cues[i - 1], state.cues[i + 1]]
        .filter(Boolean).map(c => c.text).join('\n');
}

function renderExplainSection(title, node) {
    const sec = document.createElement('div');
    sec.className = 'explain__section';
    const h = document.createElement('div');
    h.className = 'explain__title';
    h.textContent = title;
    sec.appendChild(h);
    sec.appendChild(node);
    popupExplain.appendChild(sec);
}

function renderExplain(data) {
    popupExplain.innerHTML = '';

    if (data.translation) {
        const p = document.createElement('div');
        p.className = 'explain__translation';
        p.textContent = data.translation;
        renderExplainSection(t('explain.translation'), p);
    }

    if (data.breakdown?.length) {
        const list = document.createElement('div');
        for (const b of data.breakdown) {
            const row = document.createElement('div');
            row.className = 'explain__part';
            const jp = document.createElement('span');
            jp.className = 'explain__jp';
            jp.textContent = b.part;
            const rd = document.createElement('span');
            rd.className = 'explain__reading';
            // Чтение из ИИ всегда хираганой. В ромадзи-режиме показываем латиницей
            // ДАЖЕ для чисто-канных слов (やっている → yatteiru): фраза равна чтению,
            // но ромадзи-читателю подсказка всё равно нужна. В режиме каны — только
            // фуригана к словам с кандзи (когда чтение отличается от написания).
            let readingText;
            if (state.readingMode === 'romaji') {
                const rom = kanaToRomaji(b.reading || b.part);
                readingText = rom && rom !== b.part ? rom : '';
            } else {
                readingText = b.reading && b.reading !== b.part ? b.reading : '';
            }
            rd.textContent = readingText ? ' ' + readingText : '';
            const mean = document.createElement('div');
            mean.className = 'explain__meaning';
            mean.textContent = b.meaning;
            row.appendChild(jp);
            row.appendChild(rd);
            row.appendChild(mean);
            list.appendChild(row);
        }
        renderExplainSection(t('explain.parts'), list);
    }

    if (data.grammar?.length) {
        const list = document.createElement('div');
        for (const g of data.grammar) {
            const row = document.createElement('div');
            row.className = 'explain__part';
            const point = document.createElement('span');
            point.className = 'explain__jp';
            point.textContent = g.point;
            const expl = document.createElement('div');
            expl.className = 'explain__meaning';
            expl.textContent = g.explanation;
            row.appendChild(point);
            row.appendChild(expl);
            list.appendChild(row);
        }
        renderExplainSection(t('explain.grammar'), list);
    }

    popupExplain.hidden = false;
    popupExplainBtn.hidden = true;
    // Попап подрос — пересчитаем позицию, чтобы не уехал за край экрана
    if (state.popupContext?.event) positionPopup(state.popupContext.event);
}

// Получить разбор реплики (из кеша или с сервера). Общий для кнопки в словарной
// карточке и для иконки ИИ у реплики.
async function fetchExplain(cue) {
    const cached = explainCache.get(cue.text);
    if (cached) return cached;
    const { data: res } = await client.get('explain', {
        params: { sentence: cue.text, context: cueContext(cue) },
        timeout: 60000,
    });
    const data = res.data.explanation;
    explainCache.set(cue.text, data);
    return data;
}

function explainErrorText(err) {
    const limited = err.response?.data?.reason === 'limited' || err.response?.status === 429;
    return limited ? t('popup.explainLimited') : t('popup.explainError');
}

popupExplainBtn.addEventListener('click', async () => {
    const ctx = state.popupContext;
    if (!ctx) return;

    const sentence = ctx.cue.text;
    popupExplainBtn.disabled = true;
    popupExplainLabel.textContent = t('popup.explaining');
    if (window.animeiTrack) window.animeiTrack('explain', 'player');

    try {
        const data = await fetchExplain(ctx.cue);
        // Пока ждали ответ, могли открыть другое слово той же реплики — это ок,
        // разбор относится к реплике, а не к слову
        if (!popup.hidden && state.popupContext?.cue.text === sentence) {
            renderExplain(data);
        }
    } catch (err) {
        console.error(err);
        showSnackbar(explainErrorText(err), { duration: 3500, type: 'error' });
        popupExplainBtn.disabled = false;
        popupExplainLabel.textContent = t('popup.explain');
    }
});

// ИИ-разбор реплики БЕЗ клика по слову: та же карточка, но в «режиме предложения» —
// без словарной части и кнопки сохранения, разбор грузится сразу.
async function openSentenceExplain(cue, event) {
    video.pause();

    popup.classList.add('word-popup--sentence');
    state.popupContext = { tok: null, cue, dict: null, event };

    popupWord.textContent = t('words.explain');
    popupReading.textContent = '';
    // Предложение — пословно, с чтением над словами как в субтитрах (кана или
    // ромадзи по текущему режиму); по словам можно кликать в словарь.
    popupSentence.innerHTML = '';
    buildWordCells(cue).forEach(s => popupSentence.appendChild(s));
    popupBody.innerHTML = '';
    popupExplainBtn.hidden = true;
    popupExplain.hidden = false;
    popupExplain.innerHTML = '<div class="dict-loading"></div>';
    popupExplain.firstChild.textContent = t('popup.explaining');

    popup.hidden = false;
    markPopupOpen();
    positionPopup(event);
    if (window.animeiTrack) window.animeiTrack('explain', 'player_cue');

    try {
        const data = await fetchExplain(cue);
        // Пока ждали, могли открыть другую реплику/слово — не перетираем чужое
        if (!popup.hidden && state.popupContext?.cue === cue) renderExplain(data);
    } catch (err) {
        console.error(err);
        if (!popup.hidden && state.popupContext?.cue === cue) {
            popupExplain.innerHTML = '<div class="dict-loading"></div>';
            popupExplain.firstChild.textContent = explainErrorText(err);
        }
    }
}

function positionPopup(event) {
    // На телефоне карточка не помещается рядом со словом и вылазит за экран —
    // показываем её нижним листом на всю ширину (позицию задаёт CSS).
    if (window.matchMedia('(max-width: 640px)').matches) {
        popup.classList.add('word-popup--sheet');
        popup.style.left = '';
        popup.style.top = '';
        return;
    }
    popup.classList.remove('word-popup--sheet');

    const pad = 12;
    // Верхняя граница — под шапкой, иначе карточка заезжает под неё
    const header = document.querySelector('.header');
    const topLimit = Math.max(0, header ? header.getBoundingClientRect().bottom : 0) + pad;
    const rect = popup.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY - rect.height - pad;

    if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - rect.width - pad;
    if (x < pad) x = pad;
    if (y < topLimit) y = event.clientY + pad;   // не влезло сверху — показываем снизу от слова
    if (y + rect.height > window.innerHeight - pad) y = window.innerHeight - rect.height - pad;
    if (y < topLimit) y = topLimit;              // всё равно упирается — прижимаем к низу шапки

    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
}

document.getElementById('popup-close').addEventListener('click', () => { closeWordPopup(); });

document.addEventListener('click', (e) => {
    if (!popup.hidden && !popup.contains(e.target) && !e.target.classList.contains('tok--learnable')) {
        closeWordPopup();
    }
});

popupSave.addEventListener('click', async () => {
    const ctx = state.popupContext;
    if (!ctx) return;

    // Вход не требуется: гость — слово сохранится локально, вошедший — в аккаунт.
    popupSave.disabled = true;
    popupSave.textContent = t('popup.saving');

    // Клип режем по СИНХРОНИЗИРОВАННОМУ времени (cue.start + сдвиг). Автосинк
    // субтитров считается асинхронно и может занять несколько секунд — если он
    // ещё не закончил, ждём его, иначе фрагмент вырежется по несмещённым таймингам
    // и не совпадёт с репликой. Обычно к моменту сохранения синк уже готов —
    // тогда ожидание мгновенное.
    try { await state.syncPromise; } catch { /* автосинк не критичен */ }

    try {
        const dict = ctx.dict;
        // Для карточки берём самые «очевидные» значения. jisho иногда ставит первым
        // формальный вариант со скобочным уточнением (у 戦う это «to make war (on)»,
        // а простое «to fight» — в хвосте). Поэтому сначала берём определения БЕЗ
        // скобок (обычно это чистое ядро смысла), сохраняя порядок jisho, и лишь
        // затем — уточнённые (со снятыми скобками). Не больше двух — иначе длинно.
        // Реверсить весь список нельзя: для большинства слов порядок jisho верный.
        let translation = '';
        if (dict) {
            const all = dict.senses.flatMap(s => s.definitions);
            const clean = all.filter(d => !/\(/.test(d));
            const qualified = all.filter(d => /\(/.test(d)).map(d => d.replace(/\s*\([^)]*\)/g, '').trim());
            const ordered = [...new Set([...clean, ...qualified].filter(Boolean))];
            translation = ordered.slice(0, 2).join('; ');
        }

        const savedWord = await saveWord({
            kanji: ctx.tok.base,
            // Учим словарную форму (kanji = base), поэтому и чтение — от неё:
            //   1) dict.reading — чтение словарной статьи для tok.base (帰る → かえる);
            //   2) tok.baseReading — чтение базовой формы от бэкенда (для спряжённых
            //      слов без словарной статьи), напр. かえる;
            //   3) tok.reading — запасной вариант (чтение поверхностной формы).
            // baseReading используется только если бэкенд его прислал, поэтому
            // порядок деплоя фронта/бэка не важен — регрессии нет.
            kana: dict?.reading || ctx.tok.baseReading || ctx.tok.reading || '',
            romaji: '',
            translation,
            sentence: ctx.cue.text,
            sentenceTranslation: ctx.cue.translation || '',
            videoStart: Math.max(0, ctx.cue.start + state.offset),
            videoEnd: ctx.cue.end + state.offset,
            videoUrl: state.currentVideoUrl || '',
            hint: '',
        });

        state.knownWords.add(ctx.tok.base);
        // Слово стало «своим» — сразу зелёное везде, где встречается, и растёт
        // процент покрытия серии: маленькое видимое вознаграждение за клик.
        markKnownEverywhere(ctx.tok.base);
        updateCoverage();
        if (window.animeiTrack) window.animeiTrack('save_word', ctx.tok.base);
        rememberSessionWord(savedWord);
        popupSave.textContent = t('popup.saved');
        showSnackbar(t('popup.savedSnack'), { duration: 3000 });
        state.activeCueIndex = -2;
    } catch (err) {
        console.error(err);
        popupSave.disabled = false;
        popupSave.textContent = t('popup.save');
        showSnackbar(t('popup.saveError'), { duration: 3500, type: 'error' });
    }
});

// ---------- Известные слова ----------

async function loadKnownWords() {
    try {
        // Вошёл — с сервера; гость — из локально сохранённых слов.
        const words = await fetchWords();
        for (const w of words) {
            if (w.kanji) state.knownWords.add(w.kanji);
        }
        // Плюс импортированные «известные слова» (Anki/списки, known-store.js):
        // подсвечиваются как знакомые и не предлагаются в колодах из серии.
        if (window.KnownWords) {
            for (const k of KnownWords.all()) state.knownWords.add(k);
        }
        // Словарь мог прийти позже сабов — пересчитываем покрытие серии.
        updateCoverage();
    } catch { /* нет слов — просто без подсветки */ }
}

// ---------- Синхронизация субтитров («Не те?») ----------
// Ручной выбор файла субтитров убран — работает авто-подбор. Кнопка «Не те?»
// открывает панель ТОЛЬКО с точной синхронизацией по звуку.

const subsPicker = document.getElementById('subs-picker');
const subsPreciseLoading = document.getElementById('subs-precise-loading');
const subsOffsetInput = document.getElementById('subs-offset-input');

// Показываем текущий сдвиг в поле ввода как число (без единицы — она рядом).
// Не перезаписываем, пока пользователь сам печатает в поле.
function refreshOffsetDisplay() {
    if (subsOffsetInput && document.activeElement !== subsOffsetInput) {
        subsOffsetInput.value = String(Math.round(state.offset * 10) / 10);
    }
}

// Ввод сдвига числом напрямую (абсолютное значение). Как и кнопки — ручной сдвиг,
// сохраняется только у этого пользователя (localStorage).
function setOffsetAbsolute(v) {
    if (!state.cues.length || !Number.isFinite(v)) return;
    state.offset = Math.max(-600, Math.min(600, Math.round(v * 10) / 10));
    applyManualOffset();
}

// Ручной сдвиг субтитров: применяем, сохраняем НАВСЕГДА для этой серии (метод
// 'manual' — автосинк такую серию больше не трогает) и перерисовываем тайминги.
function applyManualOffset() {
    updateOffsetLabel();
    saveOffset();
    localStorage.setItem(offsetStorageKey() + ':m', 'manual');
    if (typeof updateNowCue === 'function') updateNowCue(state.activeCueIndex);
    refreshOffsetDisplay();
}

function nudgeOffset(delta) {
    if (!state.cues.length) return;
    // Ограничиваем разумным диапазоном (обрезка интро редко больше пары минут).
    state.offset = Math.max(-600, Math.min(600, Math.round((state.offset + delta) * 10) / 10));
    applyManualOffset();
}

function resetOffset() {
    state.offset = 0;
    applyManualOffset();
}

// Подписи кнопок шага — только число со знаком (единица показана у поля ввода).
function labelManualButtons() {
    document.querySelectorAll('.subs-manual__btn').forEach((btn) => {
        const d = parseFloat(btn.dataset.delta);
        btn.textContent = (d > 0 ? '+' : '−') + Math.abs(d);
    });
}

function setPreciseLoading(on) {
    if (subsPreciseLoading) subsPreciseLoading.hidden = !on;
    if (subsPreciseStatus) subsPreciseStatus.hidden = on;   // подсказку прячем на время загрузки
}

function openSubsPicker() {
    subsPicker.hidden = false;
    setPreciseLoading(preciseBusy);
    if (subsPreciseStatus) subsPreciseStatus.textContent = t('subs.precise.hint');
    if (subsPreciseBtn) subsPreciseBtn.disabled = preciseBusy;
    labelManualButtons();
    refreshOffsetDisplay();
}

function closeSubsPicker() {
    subsPicker.hidden = true;
}

subsFixBtn.addEventListener('click', openSubsPicker);
if (subsPreciseBtn) subsPreciseBtn.addEventListener('click', preciseSyncSubs);
document.getElementById('subs-picker-close').addEventListener('click', closeSubsPicker);
document.querySelectorAll('.subs-manual__btn').forEach((btn) => {
    btn.addEventListener('click', () => nudgeOffset(parseFloat(btn.dataset.delta)));
});
if (subsOffsetInput) {
    // Применяем по Enter/уходу из поля; запятую тоже принимаем как разделитель.
    subsOffsetInput.addEventListener('change', () => {
        const v = parseFloat(String(subsOffsetInput.value).replace(',', '.'));
        if (Number.isFinite(v)) setOffsetAbsolute(v);
        refreshOffsetDisplay();   // нормализуем показ (или вернём текущее при вводе мусора)
    });
    subsOffsetInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') subsOffsetInput.blur(); });
}
document.getElementById('subs-offset-reset').addEventListener('click', resetOffset);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !subsPicker.hidden) closeSubsPicker();
});

// ---------- Селекты ----------
translationSelect.addEventListener('change', () => { selectTranslation(parseInt(translationSelect.value, 10)); });
episodeSelect.addEventListener('change', () => { selectEpisode(parseInt(episodeSelect.value, 10)); });
// Смена сезона: франшиза — переход на другой тайтл; группы — фильтр на клиенте
seasonSelect.addEventListener('change', () => {
    const idx = parseInt(seasonSelect.value, 10);
    if (state.seasonMode === 'franchise') {
        navigateToSeason(state.franchiseSeasons[idx]);
        return;
    }
    state.seasonIndex = idx;
    localStorage.setItem(seasonStorageKey(), String(idx));
    populateEpisodes(false);
});

// ---------- Свернуть блок настроек под видео (телефон) ----------
// На узком экране настройки+хоткеи отжимают субтитры далеко вниз. Прячем их
// за одну кнопку, чтобы список реплик умещался в экран сразу под видео.

const controlsToggle = document.getElementById('controls-toggle');
const controlsToggleState = document.getElementById('controls-toggle-state');
const playerMain = document.querySelector('.player-main');

function setControlsCollapsed(collapsed) {
    playerMain.classList.toggle('controls-collapsed', collapsed);
    controlsToggle.setAttribute('aria-expanded', String(!collapsed));
    // Подпись у шеврона показывает, что сделает клик: развёрнуто → «Скрыть».
    controlsToggleState.textContent = t(collapsed ? 'controls.expand' : 'controls.collapse');
}

controlsToggle.addEventListener('click', () => {
    setControlsCollapsed(!playerMain.classList.contains('controls-collapsed'));
});
// По умолчанию настройки видны (в т.ч. на телефоне); свернуть можно кнопкой

// ---------- Телефон: табы «Субтитры / Настройки» ----------
// На узком экране субтитры и настройки не стекаются друг под другом, а
// переключаются табами. Класс живёт на .player-layout (родитель и настроек,
// и списка субтитров); на десктопе классы ни на что не влияют (правила — в @media).
const playerLayout = document.querySelector('.player-layout');
const mobileTabs = document.getElementById('mobile-tabs');

function setMobileTab(tab) {
    if (!playerLayout) return;
    playerLayout.classList.toggle('mtab-subs', tab === 'subs');
    playerLayout.classList.toggle('mtab-settings', tab === 'settings');
    if (mobileTabs) {
        mobileTabs.querySelectorAll('.mobile-tabs__btn').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.mtab === tab);
        });
    }
}

if (mobileTabs) {
    mobileTabs.querySelectorAll('.mobile-tabs__btn').forEach((b) => {
        b.addEventListener('click', () => setMobileTab(b.dataset.mtab));
    });
}
setMobileTab('settings'); // по умолчанию — настройки (выбрать серию/дорожку)

// Следим за шириной кадра 16:9 и кладём её в --video-w на .player-layout (десктоп):
//  1) левую колонку грида сужаем ровно до видео и центрируем пару «видео+сабы»
//     (см. player.css, min-width: 901px) — между ними больше нет большого отступа;
//  2) блоки под видео (now-cue/настройки/подсказки) ограничиваем этой же шириной.
(function matchVideoWidth() {
    const vw = document.querySelector('.video-wrap');
    const layout = document.querySelector('.player-layout');
    if (!layout || !vw || !window.ResizeObserver) return;
    let raf = 0;
    const remeasure = () => {
        raf = 0;
        // В театре свой грид, --video-w там не используется. Если записать замер
        // театрального кадра, после выхода грид строится от него и видео залипает
        // ужатым (колонка = ширина видео = колонка) до перезагрузки.
        if (layout.classList.contains('theater')) return;
        // Перед замером снимаем прошлое значение: колонка грида и max-width кадра
        // сами сделаны из --video-w, поэтому замер «с ограничителем» всегда ≤
        // прошлого — храповик: после уменьшения окна (или ранних reflow при
        // загрузке) видео не могло вырасти обратно и залипало ужатым.
        layout.style.removeProperty('--video-w');
        // Пол в 320px: в очень низком окне кадр схлопывается и без пола замер
        // ужимал бы до этой же ширины настройки/подсказки под видео (max-width).
        const w = Math.max(320, Math.round(vw.getBoundingClientRect().width));
        layout.style.setProperty('--video-w', w + 'px');
    };
    // Через rAF: и чтобы не ловить «ResizeObserver loop» от синхронной правки
    // стилей в колбэке, и как дедуп двух наблюдателей.
    const schedule = () => { if (!raf) raf = requestAnimationFrame(remeasure); };
    const ro = new ResizeObserver(schedule);
    ro.observe(vw);
    // Смотрим и за раскладкой: когда окно растёт, зажатый старым --video-w кадр
    // сам не меняется — без этого перезамер не случился бы вовсе.
    ro.observe(layout);
    // Поздние шрифты меняют высоту блоков под видео — перемеряем, не дожидаясь
    // случайного resize (в Firefox стартовый замер до шрифтов заметно уже).
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
})();

applyReadingPref();
init();
