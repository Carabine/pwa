// Плеер: видео с Kodik (HLS через наш прокси) + японские субтитры
// с kitsunekko, размеченные по словам. Клик по слову — словарь и
// сохранение в коллекцию.

const params = new URLSearchParams(window.location.search);
const shikimoriId = params.get('id');
// let: ссылка может прийти без названий (только ?id= — поделились, админка,
// внешний сайт) — тогда достаём их из каталога до загрузки субтитров (см. ниже):
// без названия /subtitles/episode отвечал 400 и субтитров не было вовсе.
let titleRu = params.get('title') || '';
let titleRomaji = params.get('name') || titleRu;

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
// До загрузки каталога селекты пусты — показываем их призрачными полосками
// (setSelectGhost объявлена ниже, hoisting; вызовы строго ПОСЛЕ всех const —
// иначе TDZ-ошибка валит весь скрипт). Слот сезона тоже зарезервирован
// призраком: его позднее появление не должно дёргать раскладку.
setSelectGhost(translationSelect, true);
setSelectGhost(episodeSelect, true);
setSelectGhost(seasonSelect, true);
const transcriptList = document.getElementById('transcript-list');
const subsStatus = document.getElementById('subs-status');
// Язык субтитров в статусе — сразу по языку изучения. Раньше в разметке стояло
// «Ищем японские субтитры», и в режиме «учу английский» эта строка висела всю
// загрузку каталога: английский текст ставился, только когда дорожки уже
// выбраны. В разметке теперь нейтральное «Ищем субтитры…». Ключ меняем вместе
// с текстом, иначе повторное применение переводов вернуло бы прежний.
if (subsStatus) {
    subsStatus.dataset.i18n = learnEn() ? 'subs.searchingEn' : 'subs.searching';
    subsStatus.textContent = t(subsStatus.dataset.i18n);
}
const jumpBtn = document.getElementById('transcript-jump');
const subsFixBtn = document.getElementById('subs-fix');
// «Не совпадают?» — тихая ссылка в блоке настроек; появляется, когда субтитры
// подобраны (до этого синхронизировать нечего).
// В английском режиме ручной подбор файла не нужен: текст с того же источника.
function setSubsFixVisible(v) { subsFixBtn.hidden = !v || (!!state.enMode && !state.subsForeign); }
const subsPreciseBtn = document.getElementById('subs-precise');
const subsPreciseStatus = document.getElementById('subs-precise-status');

// ---------- Не-Kodik источники («оригинал») ----------
// Вся специфика источников — в одной таблице: loadStream и разбросанные раньше
// if-по-провайдеру читают её. Новый источник видео = запись здесь (+ бэкенд:
// роут и регистрация путей в services/streamPaths.js).
//   endpoint/params/streamUrl — как получить поток;
//   direct       — прямой mp4: нативный <video>, без hls.js (AnimeJoy);
//   qualities    — эндпоинт отдаёт список качеств + auto-манифест (KAA);
//   overlaySubs  — выбранный язык накладываем мягким слоем (KAA, чистый кадр);
//   intro        — эндпоинт возвращает тайминги опенинга (res.data.intro);
//   audioLang    — язык звука фиксирован источником (megaplay: всегда японский);
//   burnLang     — язык субтитров, которые УВИДИТ пользователь (вжатых или
//                  наложенных нами) — для подписи дорожки;
//   pictureSub   — что вжато в саму картинку (null = чистый кадр); нет ключа —
//                  решает isJpTrack;
//   autoSyncable:false — автосинк пропускаем (alass не тянет аудио с их CDN);
//   syncIntroEnd — передавать синку конец опенинга (сабы из архива без него,
//                  и весь диалог смещён примерно на его длину).
const PROVIDERS = {
    // Оригинальная японская дорожка: свой эндпоинт, без выбора качества
    // (в мастер-плейлисте свои варианты, hls.js выберет сам).
    megaplay: {
        endpoint: 'catalog/megaplay-stream',
        // dub — английский дубляж (режим «учу английский»), иначе японский звук.
        params: (ep) => ({ mal: state.megaMal, ep: ep.number, type: state.audioWant === 'en' ? 'dub' : 'sub' }),
        streamUrl: (d) => d.hls,
        intro: true,
        audioLang: 'ja',
        autoSyncable: false,
        // …зато свои EN-сабы под свой монтаж: японские выравниваем по ним кусками
        // (subtitles/align-ref). У MegaPlay монтаж не как у ТВ-файлов из архива —
        // сдвиг меняется по ходу серии (Dragon Ball Kai: −2 → −134 → −194с).
        refSync: true,
        syncIntroEnd: true,
        // Мягкие английские сабы плеера — слоем поверх чистой картинки.
        overlaySubs: true,
        pictureSub: null,
    },
    // Оригинальная японская дорожка (маппинг shikimori→showId→wixmp через наш
    // прокси), без выбора качества; в картинку вжат английский саб.
    allanime: {
        endpoint: 'catalog/allanime-stream',
        params: (ep) => ({ shikimoriId, ep: ep.number }),
        streamUrl: (d) => d.hls,
        burnLang: 'en',
    },
    // Японская дорожка прямым mp4 (не HLS). Качество выбирает бэкенд (берёт
    // максимальное), поэтому переключателя нет; intro размечает сам AnimeJoy.
    animejoy: {
        endpoint: 'catalog/animejoy-stream',
        params: (ep) => ({ shikimoriId, ep: ep.number }),
        streamUrl: (d) => d.video,
        direct: true,
        intro: true,
        pictureSub: 'ru',
    },
    // Чистое видео без вшитых субтитров, японская дорожка отдельно. Качество НЕ
    // прячем: отдаём весь список как есть, чтобы в переключателе было честно
    // видно, что доступно (у них бывает и 1080p, и только 360p).
    kickassanime: {
        endpoint: 'catalog/kickassanime-stream',
        params: (ep) => ({ shikimoriId, ep: ep.number, sub: state.subLang || 'en',
            // Английский дубляж (режим «учу английский») — тот же мастер, другая
            // аудиодорожка; бэкенд сшивает манифест с ней (?audio=en).
            ...(state.audioWant ? { audio: state.audioWant } : {}) }),
        qualities: true,
        overlaySubs: true,
        burnLang: 'en',
        pictureSub: null,
    },
};

const state = {
    // Режим «учу английский» (LearnLang): 'dub' — английская озвучка KAA,
    // 'sub' — озвучки нет, японский звук с английским текстом, '' — обычный
    // японский режим. audioWant — язык звука для запроса потока ('en' | '').
    enMode: '',
    audioWant: '',
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
    humanLangs: [],        // языки человеческих сабов (anime365) для этой серии
    subLang: null,         // выбранный язык субтитров; null = «оригинал», без наложения
    provider: 'kodik',     // источник текущей дорожки: 'kodik' | 'megaplay'
    megaMal: null,         // MAL id для MegaPlay-дорожки (оригинальное аудио)
    megaIntro: null,       // { start, end } интро потока MegaPlay — помогает автосинку
    megaSubUrl: null,
    fallbackEpNumber: null,  // серия, на которой остаёмся при автопереходе на другую дорожку      // EN-сабы MegaPlay (наш /proxy/seg) — эталон для синка японских (refSync)
    cues: [],
    activeCueIndex: -1,
    offset: 0,
    segs: null,            // кусочный сдвиг поверх offset: [{ from, d }] (см. cueOff)
    // Стартовые значения берём из глобальных настроек (js/settings.js).
    autoPause: !!(window.AnimeiSettings && window.AnimeiSettings.get('autopause')),
    autoPauseAt: null,
    showRu: window.AnimeiSettings ? window.AnimeiSettings.get('playerTranslation') !== false : true,
    // Чтение над словами — ОДИН режим: 'kana' ЛИБО 'romaji' (или/или, без «выкл»:
    // чтение всегда сверху). Настройка ОБЩАЯ на всё приложение (см. settings.js,
    // studyTranscription): тогл «あ | A» здесь и «Транскрипция» в настройках —
    // одно и то же, поэтому и читаем, и пишем через AnimeiSettings.
    readingMode: (function () {
        const S = window.AnimeiSettings;
        if (S) return S.get('studyTranscription') === 'kana' ? 'kana' : 'romaji';
        // Настройки почему-то не загрузились — идём по зеркальным ключам.
        const saved = localStorage.getItem('animei:readingMode');
        if (saved === 'romaji' || saved === 'kana') return saved;
        return localStorage.getItem('animei:romaji') === 'off' ? 'kana' : 'romaji';
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

    if (!titleRomaji) {
        try {
            const { data: r } = await client.get('catalog/by-ids', { params: { ids: shikimoriId }, silentErrors: true });
            const a = r && r.data && r.data[0];
            if (a) {
                titleRomaji = a.name || a.russian || '';
                if (!titleRu) titleRu = a.russian || titleRomaji;
            }
        } catch { /* без названия — как раньше */ }
    }

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
        // Режим «учу английский»: первой — дорожка с английской озвучкой KAA
        // (текст серии тоже английский, см. loadSubtitles). Озвучки нет —
        // берём чистое видео KAA с японским звуком и английскими субтитрами
        // (читаем по-английски, слушаем оригинал). Нет и его — честно говорим и
        // показываем обычные японские дорожки.
        state.enMode = '';
        if (learnEn()) {
            // Дубляж KAA первым (чистый мастер с обеими дорожками), MegaPlay — вторым.
            const enDub = info.translations.filter((tr) => tr.audio === 'en')
                .sort((a, b) => (a.provider === 'kickassanime' ? 0 : 1) - (b.provider === 'kickassanime' ? 0 : 1));
            const kaaSub = tracks.filter((tr) => tr.provider === 'kickassanime');
            if (enDub.length) { tracks = enDub; state.enMode = 'dub'; }
            else if (kaaSub.length) {
                tracks = kaaSub; state.enMode = 'sub';
                showSnackbar(t('player.noEnglishDub'), { duration: 7000 });
            } else {
                // Ни озвучки, ни английских сабов: играем японское, но говорим об
                // этом не всплывашкой на 7 секунд, а строкой над списком реплик.
                const note = document.createElement('div');
                note.className = 'transcript__note';
                note.textContent = t('player.enFallback');
                transcriptList.prepend(note);
            }
        }
        document.body.classList.toggle('is-en', !!state.enMode);
        const readingSeg = document.getElementById('reading-toggle');
        if (readingSeg) readingSeg.hidden = !!state.enMode;
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
            const isFallbackOrig = (p) => !!PROVIDERS[p];
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

        // Какие человеческие субтитры есть у тайтла (anime365). Спрашиваем ДО
        // отрисовки селекта, но не блокируем плеер надолго: не ответили за пару
        // секунд — покажем варианты без них, селект перерисуется позже.
        await withHumanLangs(1);

        renderTranslations();
        // По умолчанию — субтитры на языке интерфейса, если они есть у тайтла;
        // иначе первый доступный вариант (обычно английский, реже «оригинал»).
        // Русские сабы бывают и ВШИТЫМИ (Kodik: lang=null + burned='ru') — для
        // RU/UK-интерфейса это тоже «русские», без этого дефолт съезжал на
        // английские у тайтлов, где у KickAssAnime нет своей русской дорожки.
        const wantSub = (state.enMode || getLang() === 'en') ? 'en' : 'ru';
        let pref = state.subOptions.findIndex((o) =>
            o.lang === wantSub || (wantSub === 'ru' && o.burned === 'ru'));
        if (pref < 0) pref = 0;
        await selectTranslation(pref);
    } catch (err) {
        console.error(err);
        videoLoading.classList.add('is-error'); videoLoading.textContent = t('player.notFound');
    }
}

// Языки человеческих субтитров для серии (бэкенд /subtitles/human без lang).
// Промах — не ошибка: просто в селекте будет меньше вариантов.
async function withHumanLangs(episodeNumber) {
    try {
        const { data: res } = await client.get('subtitles/human', {
            params: { shikimoriId, title: titleRomaji, episode: episodeNumber },
            timeout: 12000,
            silentErrors: true,
        });
        state.humanLangs = Array.isArray(res.data?.langs) ? res.data.langs : [];
    } catch {
        state.humanLangs = [];
    }
}

// Человеческие субтитры слоем поверх видео. Тем же механизмом, что и «вжатые»
// сабы источника (state.burnedCues), — рисуются в кадре и уходят из транскрипта.
async function loadHumanSubs(lang, episodeNumber) {
    clearBurnedSubs();
    if (!lang) return;
    try {
        const { data: res } = await client.get('subtitles/human', {
            params: { shikimoriId, title: titleRomaji, episode: episodeNumber, lang },
            timeout: 30000,
            silentErrors: true,
        });
        const cues = res.data?.cues || [];
        state.burnedCues = cues.map((c) => ({ start: c.s, end: c.e, text: c.text }));
        if (state.burnedCues.length) videoWrap?.classList.add('has-burned-sub');
    } catch (err) {
        console.log('[human-sub]', err.message);
    }
}

// Режим «учу английский» (LearnLang, settings.js): английская дорожка и
// английский текст серии; японские подсказки (чтение над словами, ромадзи,
// авто-колода по JLPT) в нём не участвуют.
function learnEn() {
    return !!(window.LearnLang && LearnLang.get() === 'en');
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

// Дубляж: японской дорожки у тайтла нет вовсе, и в фолбэке (см. loadInfo) мы
// показываем то, что есть, — русскую озвучку Kodik. Такую дорожку НЕЛЬЗЯ
// подписывать «Оригинал»: у NANA все четыре дорожки — озвучки, а селект обещал
// оригинал, хотя из динамика шла русская речь.
function isDubTrack(tr) {
    return !!tr && !isJpTrack(tr) && !PROVIDERS[tr.provider];
}

// Язык ЗВУКА выбранной дорожки — для Whisper (автосинк-верификатор и точный подбор).
// MegaPlay и Kodik-дорожки с оригинальной японской озвучкой (сабы/ориг) = японская
// РЕЧЬ, даже если субтитры русские. Раньше здесь всегда брался subsLang() (язык
// перевода сабов), поэтому по японскому аудио whisper запускался с `-l ru` и матчинг
// всегда падал («не удалось»). Дубляж — на языке перевода.
function trackAudioLang(tr) {
    if (tr && tr.audio === 'en') return 'en';   // английский дубляж KAA
    if (PROVIDERS[state.provider]?.audioLang) return PROVIDERS[state.provider].audioLang;
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
    if (PROVIDERS[tr.provider]?.burnLang) return PROVIDERS[tr.provider].burnLang;
    if (isJpTrack(tr)) return 'ru';
    return null;
}

// Что ВШИТО в саму картинку источника — независимо от того, накладываем мы
// что-то сверху или нет. Нужно для честной подписи варианта «оригинал»:
// у KickAssAnime кадр чистый, а у AnimeJoy/Sibnet и сабовых дорожек Kodik
// русский текст вжат в видео и никуда не денется.
function pictureSubLang(tr) {
    if (!tr) return null;
    const p = PROVIDERS[tr.provider];
    if (p && 'pictureSub' in p) return p.pictureSub;
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

    // Английский режим: одна дорожка (дубляж или чистое видео KAA) и английские
    // сабы слоем поверх — выбирать тут нечего.
    if (state.enMode) {
        return state.translations.map((track) => ((track.subLangs || []).includes('en')
            ? { lang: 'en', track }
            : { lang: null, track }));
    }

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

    // Человеческие субтитры от anime365 (см. бэкенд /subtitles/human) — слоем
    // поверх ЛЮБОГО источника. Нужны там, где своих мягких сабов у источника
    // нет: у «Семьи шпиона» единственная японская дорожка — AnimeJoy с вшитым
    // русским, и английские субтитры взять было больше неоткуда. Картинка при
    // этом может быть уже с текстом — так и подписываем, чтобы человек знал,
    // что строк будет две, и сам решал.
    const best = kaa || state.translations[0];
    for (const lang of state.humanLangs) {
        // Язык уже представлен — своей дорожкой KAA или вшитым в картинку
        // текстом. Второй строкой того же языка поверх первой смысла нет.
        if (opts.some((o) => o.lang === lang || o.burned === lang)) continue;
        if (!best) break;
        opts.push({ lang, track: best, human: true, overBurned: pictureSubLang(best) });
    }

    // «Оригинал» — без наложения. Чистая картинка приятнее, но сойдёт любая.
    const orig = kaa || state.translations[0];
    if (orig && !opts.some((o) => o.track === orig && !o.lang)) {
        opts.push({ lang: null, track: orig });
    }
    return opts;
}

function renderTranslations() {
    setSelectGhost(translationSelect, false);
    state.subOptions = buildSubOptions();
    translationSelect.innerHTML = '';
    state.subOptions.forEach((o, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        const q = o.track.maxHeight ? ' · ' + o.track.maxHeight + 'p' : '';
        let name;
        // Наш слой поверх картинки, в которой субтитры уже вшиты: строк на
        // экране будет две. Обещать чистый кадр здесь нельзя.
        const over = o.human && o.overBurned ? window.t('subs.overBurned') : '';
        if (o.track.audio === 'en') {
            // Два дубляжа (KAA и MegaPlay) — второй нумеруем, источники не называем.
            const dubs = state.subOptions.filter((x) => x.track.audio === 'en');
            name = window.t('subs.englishDub') + (dubs.length > 1 && dubs.indexOf(o) > 0 ? ' · ' + (dubs.indexOf(o) + 1) : '');
        }
        else if (o.lang === 'en') name = window.t('subs.langEn') + over;
        else if (o.lang === 'ru') name = window.t('subs.langRu') + over;
        else if (o.burned === 'ru') {
            // Русские субтитры, но вшитые в картинку — не наш слой. Для
            // пользователя это всё равно «русские», поэтому и называем так,
            // уточняя, что текст в самом видео.
            name = window.t('subs.langRuBurned');
        } else if (isDubTrack(o.track)) {
            // Не оригинал вовсе — озвучка. Называем студию, чтобы было видно,
            // что именно играет, и не обещаем японскую речь.
            name = window.t('subs.dubbed') + ' · ' + (o.track.title || '');
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

async function selectTranslation(index) {
    const opt = state.subOptions[index] || state.subOptions[0];
    if (!opt) return;
    const t = opt.track;
    state.subLang = opt.lang;
    translationSelect.value = String(state.subOptions.indexOf(opt));
    state.provider = t.provider || 'kodik';
    state.audioWant = t.audio === 'en' ? 'en' : '';
    // Новая дорожка — свои сезоны/серии; сброс запомненного сезона обязателен.
    // Не-Kodik источники — оригинальные дорожки без Kodik-машинерии серий:
    // рисуем 1..N по числу серий тайтла.
    if (PROVIDERS[state.provider]) {
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
// Селект без данных — призрачная полоска (класс в player.css), а не пустой
// выпадающий список, который выглядит сломанным.
function setSelectGhost(sel, on) {
    if (!sel) return;
    sel.classList.toggle('select--ghost', on);
    if (on) sel.innerHTML = '';
    sel.disabled = on;
}

async function loadEpisodes(media, restoreSaved) {
    setSelectGhost(episodeSelect, true);
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
        setSelectGhost(episodeSelect, false);
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
    setSelectGhost(episodeSelect, false);
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

    // Автопереход на другую дорожку после ошибки потока — остаёмся на той же серии
    // (сохранённая серия у каждой дорожки своя, у новой её обычно нет → была бы 1-я).
    if (state.fallbackEpNumber != null) {
        const want = state.fallbackEpNumber;
        state.fallbackEpNumber = null;
        const i = state.episodes.findIndex((e) => Number(e.number) === Number(want));
        if (i >= 0) { selectEpisode(i); return; }
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
    seasonGroup.classList.remove('season-none');
    setSelectGhost(seasonSelect, false);
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
    // Сезонов нет — схлопываем зарезервированный слот (на телефоне плавно).
    seasonGroup.classList.add('season-none');
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

// Источник в ключах «где я остановился». У разных дорожек РАЗНЫЕ нарезки (Kodik
// режет интро/пересказ, KickAssAnime и AnimeJoy — нет) и РАЗНЫЕ списки серий,
// поэтому один общий номер серии и таймкод на все источники промахивались: после
// смены дорожки «продолжить» попадало не туда. Строим часть ключа так же, как в
// offsetStorageKey — по id дорожки (или провайдеру).
function trackKeyPart() {
    const tr = selectedTrack();
    return tr.id || tr.provider || 'k';
}

function epStorageKey() {
    return 'animei:lastEpisode:' + shikimoriId + ':' + trackKeyPart() + ':s' + state.seasonIndex;
}

function seasonStorageKey() {
    return 'animei:lastSeason:' + shikimoriId;
}

// ---------- «Продолжить смотреть» ----------
// Позиция просмотра переживает закрытие вкладки: animei:watchPos:{id} — сезон/
// серия/таймкод текущего тайтла, animei:lastWatch — единый указатель для
// карточки «Продолжить» на главной (последнее, что смотрели вообще).
function watchPosKey() {
    return 'animei:watchPos:' + shikimoriId + ':' + trackKeyPart();
}

function loadWatchPos() {
    const own = lsJson(watchPosKey());
    if (own) return own;
    // Разовый переезд со старого ключа (без дорожки): позицию не теряем, но
    // дальше она уже пишется по своей дорожке. Промах на длину интро возможен
    // ровно один раз — это меньшее зло, чем «продолжить» с нуля.
    return lsJson('animei:watchPos:' + shikimoriId);
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
            // И старый ключ без дорожки — иначе фолбэк в loadWatchPos поднимет
            // позицию досмотренной серии обратно.
            localStorage.removeItem('animei:watchPos:' + shikimoriId);
            const lw = lsJson('animei:lastWatch');
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
    return lsJson('animei:lastSession');
}

function rememberSessionWord(word) {
    if (!word || !word.id) return;
    const epIndex = Number(episodeSelect.value);
    const ep = state.episodes[epIndex];
    const epNum = ep?.number ?? epIndex + 1;
    // Язык сессии: слова английского просмотра не должны смешиваться с
    // японскими и предлагаться в другом режиме (см. renderSessionCard).
    const lang = learnEn() ? 'en' : 'ja';
    let s = loadLastSession();
    if (!s || s.processed || String(s.animeId) !== String(shikimoriId) || s.epNum !== epNum || (s.lang || 'ja') !== lang) {
        s = { animeId: shikimoriId, title: titleRu || titleRomaji || '', epNum, lang, words: [], processed: false };
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
        const wReading = w.kana ? (w.romaji && state.readingMode === 'romaji' ? w.romaji
            : readingForDisplay(w.kana, { surface: w.kanji })) : '';
        row.querySelector('.session-word__kanji').textContent = w.kanji + (wReading ? ' · ' + wReading : '');
        row.querySelector('.session-word__tr').textContent = w.translation || '';
        list.appendChild(row);
    });

    // «Назад» на телефоне убирает карточку итогов серии, а не уводит с плеера.
    let panelLayer = AnimeiBack.open(() => { panelLayer = null; panel.remove(); });
    const dismissPanel = () => {
        if (panelLayer) AnimeiBack.close(panelLayer);
        else panel.remove();
    };

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
            const picked = lsJson('srs:pickedFirst', []);
            for (const id of ids) if (!picked.includes(id)) picked.push(id);
            localStorage.setItem('srs:pickedFirst', JSON.stringify(picked));
            s.processed = true;
            localStorage.setItem('animei:lastSession', JSON.stringify(s));
        } catch { /* недоступен */ }
        if (window.animeiTrack) window.animeiTrack('session_card', 'player_pick:' + ids.length);
        AnimeiBack.navigate('./study.html');
    });
    panel.querySelector('.session-panel__next')?.addEventListener('click', () => {
        dismissPanel();
        selectEpisode(endedEpIndex + 1);
    });
    panel.querySelector('.session-panel__close').addEventListener('click', dismissPanel);
    panel.querySelector('.session-panel__next') && (panel.querySelector('.session-panel__next').textContent = t('session.next'));

    document.body.appendChild(panel);
}

// Номер «поколения» выбора серии. Запросы потока и субтитров асинхронные, и
// ответ МЕДЛЕННОЙ первой серии мог прийти после быстрой второй — тогда в селекте
// стояла вторая, а видео и/или субтитры были от первой. Каждый выбор серии
// увеличивает счётчик, а всё, что пишет общий state после await, сперва
// проверяет, что поколение не сменилось.
function bumpEpisodeGen() {
    state.epGen = (state.epGen || 0) + 1;
    return state.epGen;
}
const isStaleGen = (gen) => gen !== state.epGen;

async function selectEpisode(index) {
    const ep = state.episodes[index];
    if (!ep) return;
    const gen = bumpEpisodeGen();

    episodeSelect.value = index;
    syncMobBar();
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
    state.segKey = null;
    // Сабы источника принадлежат конкретной дорожке — при смене серии или
    // провайдера гасим их, иначе поверх нового видео висел бы старый текст.
    clearBurnedSubs();

    // Сабы под номер серии
    loadSubtitles(ep.number);

    // Не-Kodik источники («оригинал») — вся специфика в таблице PROVIDERS выше.
    const prov = PROVIDERS[state.provider];
    if (prov) {
        try {
            const { data: res } = await client.get(prov.endpoint, { params: prov.params(ep) });
            // Пока ждали ответ, пользователь мог выбрать другую серию — тогда это
            // видео уже чужое, и трогать общий state нельзя.
            if (isStaleGen(gen)) return;
            state.qualities = prov.qualities ? (res.data.qualities || {}) : {};
            state.masterUrl = prov.qualities ? (res.data.auto || null) : null;
            state.megaIntro = prov.intro ? (res.data.intro || null) : null;
            state.megaSubUrl = prov.refSync ? (res.data.subtitle || null) : null;
            state.pendingSeek = null;
            let url;
            if (prov.qualities) {
                const chosen = pickQuality();
                url = chosen.url || Object.values(state.qualities)[0];
            } else {
                url = prov.streamUrl(res.data);
            }
            state.currentVideoUrl = apiOrigin() + url;
            (prov.direct ? attachDirectVideo : attachVideo)(state.currentVideoUrl);
            updateQualityUI();
            // Выбранный язык — мягким слоем поверх чистой картинки (KAA);
            // «Оригинал» — ничего не накладываем, показываем как отдал источник.
            if (currentSubOption()?.human) loadHumanSubs(state.subLang, ep.number);
            else if (prov.overlaySubs && state.subLang) loadBurnedSubs(res.data.subtitle);
            state.syncPromise = maybeAutoSync();
        } catch (err) {
            console.error(err);
            // Серия не загрузилась с этого источника — пробуем следующую дорожку той же
            // серии, а не оставляем зрителя с ошибкой. Английский режим: дубляжа нет
            // (наличие проверяется по первой серии). Остальные: у AnimeJoy прямые файлы
            // есть только у свежих тайтлов — у архивных дорожка по умолчанию отдавала 404
            // (04.10.2026: Shigatsu wa Kimi no Uso, RU-интерфейс).
            const cur = currentSubOption();
            const idx = state.subOptions.indexOf(cur);
            if (idx >= 0 && idx + 1 < state.subOptions.length && !isStaleGen(gen)) {
                showSnackbar(t(state.enMode ? 'player.enFallbackTrack' : 'player.trackFallback'), { duration: 5000 });
                state.fallbackEpNumber = ep.number;
                await selectTranslation(idx + 1);
                return;
            }
            videoLoading.classList.add('is-error');
            videoLoading.textContent = t('player.streamError');
        }
        return;
    }

    try {
        const { data: res } = await client.get('catalog/stream', {
            params: { type: 'seria', id: ep.id, hash: ep.hash },
        });
        if (isStaleGen(gen)) return;   // серию успели переключить — ответ устарел

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
        // Тот же слой человеческих субтитров, что и у «оригинальных» источников:
        // дорожки Kodik своих мягких сабов не отдают вовсе.
        if (currentSubOption()?.human) loadHumanSubs(state.subLang, ep.number);
        state.syncPromise = maybeAutoSync();   // видео готово — пробуем автосинк (ждёт ещё и субтитры)
    } catch (err) {
        console.error(err);
        videoLoading.classList.add('is-error'); videoLoading.textContent = t('player.streamError');
    }
}

function apiOrigin() {
    return window.ANIMEI_ORIGIN || client.defaults.baseURL.replace(/\/api\/v1\/?$/, '');
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
            // Видео не поднялось даже после ретраев — сигнал о больном источнике.
            if (window.animeiTrack) animeiTrack('video_error', String(data.type || 'unknown'));
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

    // «Назад» на телефоне закрывает меню качества, а не уводит с плеера.
    let layer = null;
    const hideMenu = () => { layer = null; wrap.classList.remove('is-open'); };
    const closeMenu = () => { if (layer) AnimeiBack.close(layer); else hideMenu(); };

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
        // Не держим два меню открытыми сразу (качество/скорость/звук). Соседние
        // меню — тоже слои, поэтому просим их закрыться самих (событие ниже), а не
        // снимаем класс мимо AnimeiBack — иначе их запись зависла бы в history.
        document.dispatchEvent(new CustomEvent('animei:player-menu', { detail: wrap }));
        buildMenu();
        wrap.classList.add('is-open');
        layer = AnimeiBack.open(hideMenu);
    });

    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target) && wrap.classList.contains('is-open')) closeMenu();
    });
    document.addEventListener('animei:player-menu', (e) => {
        if (e.detail !== wrap && wrap.classList.contains('is-open')) closeMenu();
    });
})();

// ---------- Субтитры ----------

// Скелетон транскрипта: пока ищем/грузим субтитры, под статусом — «призрачные
// реплики» (тайм-код + японская строка из «слов» + строка перевода) с волной
// прозрачности. Ширины фиксированы, чтобы картинка не прыгала между сериями.
// renderTranscript() скелетон не трогает (чистит только .cue) — убираем сами.
// Ширины «слов» в реплике (% строки) и ширина перевода под ней. Скелетон
// повторяет настоящую структуру: над каждым словом — чтение, под строкой —
// перевод. Раньше это были просто три полоски в ряд, и на загрузке было
// непонятно, что за список едет.
const SKEL_ROWS = [
    [[38, 24, 15], 55],
    [[28, 33], 40],
    [[45, 18, 12], 62],
    [[22, 30], 35],
    [[40, 26], 48],
];

function setSubsSkeleton(on) {
    // Той же меткой накрываем шапку списка: заглушки вместо «Субтитры»,
    // покрытия и авто-колоды, пока их нечем заполнить.
    const panel = document.getElementById('transcript');
    if (panel) panel.classList.toggle('is-loading', !!on);
    let el = document.getElementById('subs-skel');
    if (!on) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = 'subs-skel';
    el.setAttribute('aria-hidden', 'true');
    // Паттерн дважды — призраки заполняют всю видимую область даже на высокой
    // десктопной панели (статус теперь плавает поверх, а не занимает верх).
    for (const [jpWidths, ruWidth] of [...SKEL_ROWS, ...SKEL_ROWS]) {
        const row = document.createElement('div');
        row.className = 'subs-skel__row';
        row.appendChild(document.createElement('i')).className = 'subs-skel__time';
        const jp = document.createElement('div');
        jp.className = 'subs-skel__jp';
        jpWidths.forEach((w, i) => {
            const word = document.createElement('span');
            word.className = 'subs-skel__w';
            word.style.width = w + '%';
            const read = document.createElement('i');
            read.className = 'subs-skel__read';
            // Чтение над словом то короче, то длиннее самого слова — как ромадзи
            // над кандзи; одинаковая ширина выглядела как таблица.
            read.style.width = (i % 2 ? 62 : 88) + '%';
            word.appendChild(read);
            word.appendChild(document.createElement('i')).className = 'subs-skel__word';
            jp.appendChild(word);
        });
        row.appendChild(jp);
        const ru = document.createElement('i');
        ru.className = 'subs-skel__ru';
        ru.style.width = ruWidth + '%';
        row.appendChild(ru);
        el.appendChild(row);
    }
    subsStatus.after(el);
}

// Скелетон ставим сразу при загрузке страницы, не дожидаясь списка серий:
// первые секунды (пока едут серии и поток) на месте субтитров была пустая
// чёрная простыня с одной строкой «Ищем японские субтитры…».
setSubsSkeleton(true);
subsStatus.classList.add('transcript__status--searching');
// Строка реплики под видео — тоже под заглушкой с первого кадра. Без этого
// до загрузки субтитров карточка стоит пустой полоской в 14px: содержимого
// ещё нет, а высоту ей держать нечем. Элементы ищем по id: их константы
// объявлены ниже по файлу, и обращение к ним отсюда попало бы в TDZ.
{
    const jp = document.getElementById('now-cue-jp');
    const ru = document.getElementById('now-cue-ru');
    if (jp) jp.innerHTML = '<span class="skel skel-bar" style="width: 72%"></span>';
    if (ru) ru.innerHTML = '<span class="skel skel-bar" style="width: 46%"></span>';
}

async function loadSubtitles(episodeNumber = 1) {
    // Поколение выбора серии на момент запроса: ответ по МЕДЛЕННОЙ серии не
    // должен перетереть субтитры уже выбранной другой (см. bumpEpisodeGen).
    const gen = state.epGen || 0;
    // Исключённые файлы (клик «попробовать другой») живут в рамках одной серии.
    if (state.subsExcludedEp !== episodeNumber) {
        state.subsExcluded = [];
        state.subsExcludedEp = episodeNumber;
    }
    state.subsFile = '';
    const altBtn = document.getElementById('subs-alt-file');
    if (altBtn) altBtn.hidden = true;
    state.cues = [];
    state.activeCueIndex = -1;
    setFollowCue(true);           // новая серия — снова едем за репликой
    nowCueJp.textContent = '';
    nowCueRu.textContent = '';
    updateNowCue(-1);
    // Пока субтитры едут, полоса реплики — скелетон-полоски (общий .skel из
    // motion.css), а не пустая рамка. Снимаются любым updateNowCue/очисткой.
    nowCueJp.innerHTML = '<span class="skel skel-bar" style="width: 72%"></span>';
    nowCueRu.innerHTML = '<span class="skel skel-bar" style="width: 46%"></span>';
    renderTranscript();
    subsStatus.style.display = '';
    subsStatus.dataset.i18n = state.enMode ? 'subs.searchingEn' : 'subs.searching';
    subsStatus.textContent = t(subsStatus.dataset.i18n);
    // Пока идёт поиск — компактная строка со спиннером вплотную над скелетоном
    // (без модификатора это крупный центрированный текст для «не найдены»).
    subsStatus.classList.add('transcript__status--searching');
    setSubsSkeleton(true);
    // «Не те субтитры?» видна и во время загрузки: раньше её место в шапке
    // пустовало, а ручной выбор файла полезен, не дожидаясь автоподбора.
    setSubsFixVisible(true);

    try {
        // Субтитры подбираются автоматически по названию и номеру серии (ручного
        // выбора файла нет — он путал сдвиг: у разных файлов свои тайминги).
        const { data: res } = await client.get('subtitles/episode', {
            params: {
                title: titleRomaji, episode: episodeNumber, translate: subsLang(),
                // Наш id тайтла = MAL id: по нему сервер точно находит серию у
                // anime365 и подмешивает человеческий перевод вместо машинного.
                shikimoriId,
                // Английский режим: текст серии английский (сабы KAA/MegaPlay/anime365);
                // source — откуда видео, чтобы взять сабы того же источника.
                ...(state.enMode ? { lang: 'en', source: state.provider } : {}),
                // Уже не подошедшие файлы — сервер подберёт следующий кандидат.
                ...(state.subsExcluded && state.subsExcluded.length
                    ? { exclude: JSON.stringify(state.subsExcluded) } : {}),
            },
            timeout: 180000,
        });
        const cues = res.data.cues;
        if (isStaleGen(gen)) return;   // серию переключили, пока искали субтитры

        state.cues = cues;
        state.subsFile = res.data.file || '';
        // Английский режим: текст не с того источника, что видео (сабов у
        // источника не нашлось) — тайминг может разойтись. Говорим об этом и
        // возвращаем ручной сдвиг («Не совпадают субтитры?»).
        state.subsForeign = !!(state.enMode && res.data.source && res.data.source !== state.provider);
        const oldNote = transcriptList.querySelector('.transcript__note--foreign');
        if (oldNote) oldNote.remove();
        if (state.subsForeign) {
            const note = document.createElement('div');
            note.className = 'transcript__note transcript__note--foreign';
            note.textContent = t('subs.foreignEn');
            transcriptList.prepend(note);
        }
        subsStatus.style.display = 'none';
        // Английская озвучка + английские сабы: текст — перевод японского, а не
        // сценарий дубляжа. Предупреждаем один раз за сессию.
        if (state.enMode === 'dub' && !sessionStorage.getItem('animei:enTextNote')) {
            try { sessionStorage.setItem('animei:enTextNote', '1'); } catch { /* приватный режим */ }
            showSnackbarOnce('enTextNote', t('player.enTextNote'), { duration: 7000 });
        }
        subsStatus.classList.remove('transcript__status--searching');
        setSubsSkeleton(false);
        // Сабы готовы — скелетон из полосы реплики убираем (до первой реплики
        // она штатно пустая).
        if (nowCueIdx < 0) { nowCueJp.textContent = ''; nowCueRu.textContent = ''; }
        // Подобрали (или выбрали) файл — предлагаем сменить, если серия не та
        setSubsFixVisible(true);

        // Разовая миграция: сдвиги, сохранённые ПРЕЖНИМИ (ошибочными) версиями
        // автосинка, могут быть неверны — чистим все один раз, чтобы автосинк
        // пересчитал их свежим, исправленным методом. Бамп «7» (01.09): серверный
        // кэш сдвига не различал ИСТОЧНИК видео (ответ, посчитанный по нарезке
        // Kodik, уезжал зрителю KickAssAnime), консенсус соседних серий перебивал
        // верные серии (у «Наруто» первая серия получала −31с), а продолжения
        // получали субтитры чужого сезона — все сдвиги той эпохи мусорные.
        // Уровень миграций сравниваем ЧИСЛОМ: прежнее `!== '7'` срабатывало и на
        // «8», и каждая загрузка сабов стирала ВСЕ сохранённые сдвиги (в том числе
        // ручные) — с 24.09 сдвиги не переживали перезагрузку.
        const resetLevel = parseInt(localStorage.getItem('animei:subsOffsetReset'), 10) || 0;
        if (resetLevel < 7) {
            Object.keys(localStorage)
                .filter((k) => k.startsWith('animei:subsOffset:'))
                .forEach((k) => localStorage.removeItem(k));
            localStorage.setItem('animei:subsOffsetReset', '7');
        }
        // Бамп «8» (24.09): автосинк теперь применяет и малые ОТРИЦАТЕЛЬНЫЕ сдвиги
        // (см. lagging в maybeAutoSync). Сохранённые прежде нули автосинка
        // («сдвиг мал — оставляем 0») сбрасываем, чтобы он пересчитал; ручные
        // сдвиги, точный подбор и консенсус НЕ трогаем.
        if (resetLevel < 8) {
            Object.keys(localStorage)
                .filter((k) => k.startsWith('animei:subsOffset:') && !k.endsWith(':m'))
                .forEach((k) => {
                    const m = localStorage.getItem(k + ':m');
                    if (m === 'manual' || m === 'whisper-verified' || m === 'consensus') return;
                    localStorage.removeItem(k);
                    localStorage.removeItem(k + ':m');
                });
            localStorage.setItem('animei:subsOffsetReset', '8');
        }
        state.offset = parseFloat(localStorage.getItem(offsetStorageKey())) || 0;
        state.segs = loadSegs(offsetStorageKey());
        updateOffsetLabel();
        renderTranscript();
        updateNowCue(state.activeCueIndex);
        // Если серия пойдёт на автосинк — прячем тайм-коды сразу (ещё до готовности
        // видео), чтобы не мелькнуло неверное время между загрузкой сабов и синком.
        if (autoSyncEligible()) setSyncing(true);
        state.syncPromise = maybeAutoSync();   // субтитры готовы — пробуем автосинк (ждёт ещё и видео)

        // Одноразовая подсказка новичку: сабы из архива часто чуть съезжают,
        // а кнопка «Сейчас!» неочевидна
        if (!localStorage.getItem('animei:syncHintShown') && !state.enMode) {
            localStorage.setItem('animei:syncHintShown', '1');
            showSnackbarOnce('syncHint', t('player.syncHint'), { duration: 6000 });
        }
    } catch (err) {
        console.error(err);
        setSubsSkeleton(false);
        nowCueJp.textContent = '';
        nowCueRu.textContent = '';
        subsStatus.classList.remove('transcript__status--searching');
        if (err.response?.status === 404) {
            // Сабов в архиве нет. Не тупик: можно смотреть без них или принести своё видео.
            subsStatus.textContent = '';
            // Сигнал качества: к серии вообще не нашлось субтитров.
            if (window.animeiTrack) animeiTrack('subs_missing', (titleRomaji || '') + ' · эп ' + episodeNumber);
            subsStatus.append(t(state.enMode ? 'subs.notFoundEn' : 'subs.notFound'));
            if (!state.enMode) {
                subsStatus.appendChild(document.createElement('br'));
                const link = document.createElement('a');
                link.href = './watch.html';
                link.textContent = t('subs.notFoundLink');
                subsStatus.appendChild(link);
            }
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
    return currentSubOption()?.track || state.translations[parseInt(translationSelect.value, 10)] || {};
}

// Выбранный вариант субтитров целиком (не только его дорожка): по нему видно,
// наш ли это слой поверх видео (human) или мягкие сабы самого источника.
function currentSubOption() {
    const i = parseInt(translationSelect.value, 10);
    if (!state.subOptions.length) return null;
    return state.subOptions[i] || state.subOptions[0];
}

// Кусочный сдвиг: монтаж источника бывает не таким, как у файла субтитров, и
// одного сдвига на серию мало (у Kodik «One Punch Man» 2 опенинг длиннее: до
// него сабы на месте, после — всё на +10с). Сервер находит такие куски и
// проверяет каждый по звуку (subtitles/segments). state.segs = [{ from, d }]:
// реплики, начинающиеся в сабах с from и дальше, получают к state.offset
// добавку d. Ручные «±» двигают базу state.offset — все куски вместе с ней.
function segDelta(segs, start) {
    let d = 0;
    if (segs) {
        for (const s of segs) {
            if (start >= s.from) d = s.d;
            else break;
        }
    }
    return d;
}

// Сдвиг конкретной реплики (с учётом её куска). Все переводы «время сабов →
// время видео» идут через него.
function cueOff(cue) {
    return state.offset + segDelta(state.segs, cue.start);
}

// Куски храним отдельно от сдвига: старые разовые чистки перебирают все ключи
// «animei:subsOffset:*» и не должны их задеть.
function segStorageKey(offsetKey) {
    return offsetKey.replace('animei:subsOffset:', 'animei:subsSeg:');
}

function loadSegs(offsetKey) {
    try {
        const v = JSON.parse(localStorage.getItem(segStorageKey(offsetKey)));
        return Array.isArray(v) && v.length ? v : null;
    } catch {
        return null;
    }
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
    // Английский текст берётся с того же KAA, что и видео, — тайминги совпадают.
    if (state.enMode) return false;
    // Несинкуемые по звуку источники (megaplay) — см. maybeAutoSync; синк по их
    // собственным субтитрам (refSync) при этом идёт.
    if (PROVIDERS[state.provider]?.autoSyncable === false && !refSyncReady()) return false;
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
    await autoSyncOnce();
    // Не ждём: кусочный сдвиг считается минуты и приходит, когда готов.
    maybeSegments();
}

async function autoSyncOnce() {
    if (window.AnimeiSettings && window.AnimeiSettings.get('autoSyncSubs') === false) { setSyncing(false); return; }
    const key = offsetStorageKey();
    if (state.autoSyncKey === key) return;                       // уже пробовали для этой серии
    if (!state.cues.length || !state.currentVideoUrl) return;    // ждём вторую половину — время держим спрятанным
    // Уже есть сохранённый сдвиг — доверяем ему, не перезапрашиваем (у автосинка
    // один результат на серию; серверный Whisper-верификатор помогает НОВЫМ зрителям
    // серии через кэш — тем, у кого своего сохранённого сдвига ещё нет).
    if (localStorage.getItem(key) !== null) { state.autoSyncKey = key; setSyncing(false); return; }
    // autoSyncable:false (megaplay): alass не может вытащить аудио с их CDN
    // (extractWav упирается в таймаут ~110с) → автосинк только зря держит баннер
    // «синхронизация» пару минут и всё равно ничего не находит. Если у источника
    // есть свои субтитры — выравниваем по ним (доли секунды), иначе пропускаем.
    if (refSyncReady()) { await refSyncOnce(key); return; }
    if (PROVIDERS[state.provider]?.autoSyncable === false) { state.autoSyncKey = key; setSyncing(false); return; }
    // Английский режим: текст и видео с одного источника (KAA), синк не нужен.
    if (state.enMode) { state.autoSyncKey = key; setSyncing(false); return; }
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

    // syncIntroEnd (megaplay): передаём конец интро — субтитры из архива обычно
    // без него, и весь диалог смещён примерно на его длину.
    const introEnd = (PROVIDERS[state.provider]?.syncIntroEnd && state.megaIntro) ? state.megaIntro.end : 0;

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
        const { offset, confidence, matched, method, agree } = res.data || {};
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
        // Исключение из порога 1.2с (24.09, «Атака титанов»): сабы, ОТСТАЮЩИЕ от
        // речи, — всегда рассинхрон, а не «естественное упреждение» (упреждение
        // даёт alass ПОЛОЖИТЕЛЬНЫЙ сдвиг). Отрицательный сдвиг от 0.7с, когда alass
        // и онсеты согласны (agree) и уверенность высокая, применяем: у «Атаки»
        // все дорожки давали −0.9…−1.0, порог их прятал, а Whisper по звуку
        // подтвердил −0.9 (47 совпадений, conf 0.97).
        const lagging = offset <= -0.7 && method === 'alass' && agree === true && confidence >= 0.9;
        if (trusted && (Math.abs(offset) >= 1.2 || method === 'whisper-verified' || lagging)) {
            state.offset = offset;
            updateOffsetLabel();
            saveOffset();
            // Метод сдвига: 'whisper-verified' → в следующий раз не перезапрашиваем.
            localStorage.setItem(key + ':m', method || 'alass');
            renderTranscript();
            updateNowCue(state.activeCueIndex);
            // Плашку «Субтитры синхронизированы автоматически» не показываем:
            // подгонка сдвига — рутина, о которой сообщать нечего, а всплывашка
            // лезла поверх текста ровно в тот момент, когда его начинают читать.
            // В статистику событие по-прежнему пишем.
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

// Кусочный сдвиг (см. cueOff). Один раз на серию спрашиваем сервер, не разный
// ли у этой серии сдвиг по кускам. Посчитано — применяем сразу; нет — сервер
// ставит расчёт в очередь (звук всей серии + проверка Whisper'ом, 1–3 мин), и
// мы опрашиваем его, пока зритель на этой серии. Только японская речь: куски
// сервер проверяет по японскому тексту реплик.
// Синк по субтитрам самого источника (MegaPlay): японские реплики выравниваются
// по его EN-сабам на сервере, ответ — куски сдвига, как у maybeSegments.
function refSyncReady() {
    return !!(PROVIDERS[state.provider]?.refSync && state.megaSubUrl);
}
async function refSyncOnce(key) {
    state.autoSyncKey = key;
    const all = state.cues.filter((c) => Number.isFinite(c.start)).slice(0, 1500);
    if (all.length < 30) { setSyncing(false); return; }
    setSyncing(true);
    try {
        const { data: res } = await client.post('subtitles/align-ref', {
            refUrl: state.megaSubUrl,
            starts: all.map((c) => c.start),
            ends: all.map((c) => (Number.isFinite(c.end) ? c.end : c.start + 2)),
        }, { timeout: 30000, silentErrors: true });
        const segs = res.data && res.data.segments;
        if (offsetStorageKey() !== key || localStorage.getItem(key) !== null) return;
        if (Array.isArray(segs) && segs.length) {
            applySegments(key, segs);
            if (window.animeiTrack) animeiTrack('subs_refsync', String(segs.length));
        }
    } catch { /* не вышло — сабы остаются как есть, кнопка «Не совпадают?» на месте */ }
    finally { setSyncing(false); }
}

async function maybeSegments() {
    const key = offsetStorageKey();
    if (state.segKey === key) return;
    if (!state.cues.length || !state.currentVideoUrl) return;
    state.segKey = key;
    const sk = segStorageKey(key);
    if (localStorage.getItem(sk + ':q')) return;                      // уже узнавали
    if (localStorage.getItem(key + ':m') === 'manual') return;        // сдвиг выставлен руками
    if (window.AnimeiSettings && window.AnimeiSettings.get('autoSyncSubs') === false) return;
    if (state.enMode || PROVIDERS[state.provider]?.autoSyncable === false) return;
    const audioLang = trackAudioLang(selectedTrack());
    if (audioLang !== 'ja') return;

    // Ключ серии на сервере — тот же, что у subtitles/align: по репликам окна.
    const win = state.cues
        .filter((c) => Number.isFinite(c.start) && c.start >= 0 && c.start < 340)
        .slice(0, 260);
    if (win.length < 5) return;
    const base = { videoUrl: state.currentVideoUrl, cues: win.map((c) => c.start), introEnd: 0, audioLang };
    const all = state.cues.filter((c) => Number.isFinite(c.start)).slice(0, 1500);
    const full = {
        ...base,
        allStarts: all.map((c) => c.start),
        allEnds: all.map((c) => (Number.isFinite(c.end) ? c.end : c.start + 2)),
        allTexts: all.map((c) => c.text || ''),
    };
    const deadline = Date.now() + 10 * 60 * 1000;
    let body = full;   // полный список нужен только чтобы поставить расчёт в очередь
    while (Date.now() < deadline) {
        if (offsetStorageKey() !== key) return;
        try {
            const { data: res } = await client.post('subtitles/segments', body, { timeout: 30000, silentErrors: true });
            const r = res.data || {};
            if (Array.isArray(r.segments) && r.segments.length >= 2) {
                applySegments(key, r.segments);
                return;
            }
            // Посчитано и кусков нет — запоминаем, больше не спрашиваем.
            if (r.known) { localStorage.setItem(sk + ':q', '1'); return; }
            if (!r.pending) return;   // не взяли в расчёт (очередь, рестарт) — спросим в другой заход
        } catch { /* сеть — пробуем на следующем круге */ }
        body = base;
        await new Promise((res) => setTimeout(res, 15000));
    }
}

function applySegments(key, segments) {
    if (offsetStorageKey() !== key) return;
    if (localStorage.getItem(key + ':m') === 'manual') return;
    const base = segments[0].offset;
    state.offset = base;
    state.segs = segments.slice(1).map((s) => ({ from: s.from, d: Math.round((s.offset - base) * 10) / 10 }));
    saveOffset();
    localStorage.setItem(key + ':m', 'segments');
    const sk = segStorageKey(key);
    localStorage.setItem(sk, JSON.stringify(state.segs));
    localStorage.setItem(sk + ':q', '1');
    updateOffsetLabel();
    renderTranscript();
    updateNowCue(state.activeCueIndex);
    refreshOffsetDisplay();
    if (window.animeiTrack) animeiTrack('subs_segments', String(segments.length));
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
            // done — результат готов. unknown/ok:false — джобы больше нет (бэкенд
            // перезапустили) или подбор нельзя выполнить: тоже выходим, а не ждём
            // впустую до конца пятиминутного таймаута.
            if (s.done || s.unknown || s.ok === false) return s;
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
    const introEnd = (PROVIDERS[state.provider]?.syncIntroEnd && state.megaIntro) ? state.megaIntro.end : 0;
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
            // Сдвиг мог прийти двумя путями: распознали речь этой серии (точный) или
            // взяли согласованный сдвиг соседних серий дорожки. Второй тоже верен, но
            // говорим о нём честно — и не помечаем как whisper-verified.
            const bySiblings = r.method === 'sibling-consensus';
            if (offsetStorageKey() === key) {   // серия не сменилась за время подбора
                state.offset = r.offset;
                updateOffsetLabel();
                saveOffset();
                localStorage.setItem(key + ':m', bySiblings ? 'consensus' : 'whisper-verified');
                renderTranscript();
                updateNowCue(state.activeCueIndex);
                refreshOffsetDisplay();
            }
            setPreciseLoading(false);
            if (window.animeiTrack) animeiTrack('subs_precise', bySiblings ? 'consensus' : 'ok');
            const msg = t(bySiblings ? 'subs.precise.consensus' : 'subs.precise.done');
            if (subsPreciseStatus) subsPreciseStatus.textContent = msg;
            showSnackbar(msg, { duration: 3500 });
            setTimeout(closeSubsPicker, 900);
        } else {
            setPreciseLoading(false);
            // Почти нет совпадений по содержанию (votes≤2) — это не «сдвиг не
            // нашёлся», а скорее ФАЙЛ от другой серии: говорим об этом прямо и
            // предлагаем взять следующий кандидат из архива.
            const wrongFile = r.reason === 'no-match' && (r.votes || 0) <= 2 && !!state.subsFile;
            if (window.animeiTrack) animeiTrack('subs_precise', wrongFile ? 'wrong_file' : (r.reason || 'fail'));
            // Подбор оборвался не по существу (перезапуск бэкенда, занятый верификатор) —
            // это «повтори», а не «не получилось»: следующая попытка обычно проходит.
            const lost = r.reason === 'lost' || r.reason === 'busy' || r.unknown;
            if (subsPreciseStatus) {
                subsPreciseStatus.textContent = t(
                    wrongFile ? 'subs.wrongFile' : (lost ? 'subs.precise.retry' : 'subs.precise.fail'));
            }
            const altBtn = document.getElementById('subs-alt-file');
            if (altBtn && wrongFile) altBtn.hidden = false;
        }
    } catch {
        setPreciseLoading(false);
        if (subsPreciseStatus) subsPreciseStatus.textContent = t('subs.precise.fail');
    } finally {
        preciseBusy = false;
        if (subsPreciseBtn) subsPreciseBtn.disabled = false;
    }
}

// formatTime — общий, из app.js.

const KANJI_RE = /[一-龯㐀-䶵々〆ヶ]/;

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

// Ромадзи: window.kanaToRomaji из romaji.js (общая таблица на всё приложение).

// Пословная раскладка (в стиле lexirise): каждое слово — отдельный столбик
// [чтение сверху][слово]. Одинаково строит и ЦЕНТРАЛЬНЫЙ оверлей под видео, и
// СПИСОК субтитров справа (renderTranscript) — чтобы выглядели как эталон.
function buildWordCells(cue) {
    if (!cue.tokens || !cue.tokens.length) {
        const span = document.createElement('span');
        span.textContent = cue.text;
        return [span];
    }

    // Английская реплика (токены entok, pos 'en'/'punct'): без чтения над
    // словами, знаки препинания липнут к предыдущему слову.
    if (cue.tokens.some((tk) => tk.pos === 'en')) return buildEnglishCells(cue);

    return cue.tokens.map((tok) => {
        fixKanaReading(tok);
        const cell = document.createElement('span');
        cell.className = 'ncw';
        if (KATAKANA_WORD_RE.test(tok.surface)) cell.classList.add('ncw--kata');

        // Над словом — ОДНО чтение по выбранному режиму: кана ЛИБО ромадзи, не оба.
        let reading = '';
        // Токен целиком — из него ромадзи узнаёт частицы: 僕は → boku wa.
        if (state.readingMode === 'romaji') reading = kanaToRomaji(tok.reading || tok.surface, tok);
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

// Английская реплика: слово — ячейка в том же flex-ряду (зазор ряда = пробел),
// пунктуация без пробела перед ней приклеивается к предыдущей ячейке.
function buildEnglishCells(cue) {
    const out = [];
    for (const tok of cue.tokens) {
        if (tok.pos === 'punct' && !tok.pre && out.length) {
            out[out.length - 1].appendChild(document.createTextNode(tok.surface));
            continue;
        }
        const cell = document.createElement('span');
        cell.className = 'ncw ncw--en';
        const w = document.createElement('span');
        w.textContent = tok.surface;
        w.className = 'ncw__jp tok';
        if (tok.learnable) {
            w.classList.add('tok--learnable');
            w.dataset.base = tok.base || tok.surface;
            if (state.knownWords.has(tok.base) || state.knownWords.has(tok.surface)) {
                w.classList.add('tok--known');
            }
            w.addEventListener('click', (e) => {
                e.stopPropagation();
                openWordPopup(tok, cue, e);
            });
        }
        cell.appendChild(w);
        out.push(cell);
    }
    return out;
}

// Кана-чтение слова для показа над ним — только если в слове есть кандзи (у
// чисто-канного слова чтение совпадает с ним самим, дублировать не нужно).
function readingKana(tok) {
    if (!tok.reading || tok.reading === tok.surface) return '';
    // Катакана (имена, заимствования): новичок её часто ещё не читает — даём
    // хирагану сверху, как фуригану над кандзи.
    if (!KANJI_RE.test(tok.surface) && !KATAKANA_RE.test(tok.surface)) return '';
    return tok.reading;
}

const KATAKANA_RE = /[ァ-ヺ]/;
const KATAKANA_WORD_RE = /^[ァ-ヺー・]+$/;
const KANA_ONLY_RE = /^[ぁ-ゖァ-ヺー・]+$/;

// Слово без кандзи читается ровно так, как написано. MeCab же у незнакомых ему
// имён чтения не знает: フリー|レン склеиваются в フリーレン, а чтение остаётся
// «ふりー» — над именем висел обрубок «furii». Берём чтение из самого написания.
// Токен правим на месте — тем же объектом пользуются карточка слова и сохранение.
function fixKanaReading(tok) {
    if (!KANA_ONLY_RE.test(tok.surface || '')) return;
    const kana = tok.surface.replace(/[ァ-ヶ]/g,
        (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    tok.reading = kana;
    if (tok.base === tok.surface) tok.baseReading = kana;
}

// Чтение слова для карточек попапа и итогов серии — в том же режиме, что и над
// субтитрами (тогл «あ | A»). Раньше здесь всегда стояла кана: выбравший ромадзи
// упирался в хирагану, которую как раз ещё и не читает.
function readingForDisplay(kana, tok) {
    if (!kana) return '';
    if (state.readingMode !== 'romaji' || typeof kanaToRomaji !== 'function') return kana;
    return kanaToRomaji(kana, tok) || kana;
}

// Иконка «искры ИИ» — та же, что в кнопке разбора словарной карточки.
const AI_ICON_SVG = '<svg class="ai-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 2 9.15 6.15 5 8l4.15 1.85L11 14l1.85-4.15L17 8l-4.15-1.85L11 2Zm7.5 9-1.1 2.4-2.4 1.1 2.4 1.1 1.1 2.4 1.1-2.4 2.4-1.1-2.4-1.1L18.5 11Z"/></svg>';

function renderTranscript() {
    transcriptList.querySelectorAll('.cue').forEach(el => el.remove());

    // Сотни реплик вставляем одним куском: DocumentFragment вместо appendChild
    // в живой список на каждую строку (рендер зовётся и при смене режима чтения).
    const frag = document.createDocumentFragment();
    state.cues.forEach((cue, i) => {
        const div = document.createElement('div');
        div.className = 'cue';
        div.dataset.index = i;

        const time = document.createElement('div');
        time.className = 'cue__time';
        // Показываем время С УЧЁТОМ сдвига — иначе после автосинка (напр. +85с у
        // оригинальной дорожки) тайм-коды реплик не совпадали с позицией видео.
        time.textContent = formatTime(Math.max(0, cue.start + cueOff(cue)));
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
            video.currentTime = cue.start + cueOff(cue) + 0.01;
            video.play().catch(() => {});
        });

        frag.appendChild(div);
    });
    transcriptList.appendChild(frag);

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
    hideWordHint();   // облачко привязано к слову прошлой реплики
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

// ---------- Подсказка «нажми на слово» ----------
// 04–05.10.2026 новички почти не нажимали на слова в субтитрах (на видео у них
// английские сабы, японская строка — ниже). Облачко над словом в строке под
// видео: в паузу (человек как раз читает) или раз через ~20 с просмотра. Само
// исчезает (8 с / смена реплики; крестик — навсегда), не перекрывает нажатия, не больше 3 показов,
// после первого открытого слова — никогда.
const WORD_HINT_KEY = 'animei:wordHint';   // 'done' или число показов
const WORD_HINT_MAX = 3;
var wordHintShown = false;      // за эту страницу уже показывали (var: updateNowCue выше может позвать hideWordHint раньше этих строк)
var wordHintHide = null;
var wordHintWatched = 0, wordHintLastT = null;
function wordHintState() {
    try { return localStorage.getItem(WORD_HINT_KEY); } catch { return 'done'; }
}
function hideWordHint() {
    if (wordHintHide) { wordHintHide(); wordHintHide = null; }
}
function markWordHintDone() {
    hideWordHint();
    try { localStorage.setItem(WORD_HINT_KEY, 'done'); } catch { /* приватный режим */ }
}
function maybeWordHint() {
    if (wordHintShown || nowCue.hidden || !popup.hidden) return;
    const st = wordHintState();
    if (st === 'done' || Number(st) >= WORD_HINT_MAX) return;
    const words = [...nowCueJp.querySelectorAll('.tok--learnable:not(.tok--known)')];
    const el = words.find((w) => /[一-龯]/.test(w.dataset.base || w.textContent)) || words[0];
    if (!el) return;
    wordHintShown = true;
    try { localStorage.setItem(WORD_HINT_KEY, String((Number(st) || 0) + 1)); } catch { /* ок */ }
    el.classList.add('tok--hint');
    const tip = document.createElement('div');
    tip.className = 'word-hint';
    tip.setAttribute('role', 'status');
    tip.innerHTML = '<span class="word-hint__ic" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v2"/><path d="M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L4 15a1.5 1.5 0 0 1 2.5-1.7L9 16"/></svg></span>'
        + '<span class="word-hint__tx"><b></b><small></small></span>'
        + '<button type="button" class="word-hint__x"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>';
    tip.querySelector('b').textContent = t('player.wordHint');
    tip.querySelector('small').textContent = t('player.wordHintSub');
    const close = tip.querySelector('.word-hint__x');
    close.setAttribute('aria-label', t('aria.close'));
    // Крестик — «понял, больше не показывай»
    close.addEventListener('click', (e) => { e.stopPropagation(); markWordHintDone(); });
    // В <body>, а не в строку под видео: та обрезает всё, что выходит за её край.
    // В полноэкранном режиме — внутрь видео-обёртки (иначе не видно поверх кадра).
    const host = document.fullscreenElement || document.body;
    host.appendChild(tip);
    const hb = host === document.body ? { left: -scrollX, top: -scrollY } : host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const maxLeft = (host === document.body ? document.documentElement.clientWidth : hb.width) - tip.offsetWidth - 6;
    const left = Math.max(6, Math.min(maxLeft, r.left - hb.left + r.width / 2 - tip.offsetWidth / 2));
    tip.style.left = left + 'px';
    tip.style.top = (r.top - hb.top - tip.offsetHeight - 10) + 'px';
    tip.style.setProperty('--arrow', (r.left - hb.left + r.width / 2 - left) + 'px');
    const timer = setTimeout(hideWordHint, 8000);
    // прокрутили или повернули экран — облачко уехало бы от слова
    const onMove = () => hideWordHint();
    window.addEventListener('scroll', onMove, { passive: true, capture: true, once: true });
    window.addEventListener('resize', onMove, { once: true });
    wordHintHide = () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', onMove, { capture: true });
        window.removeEventListener('resize', onMove);
        tip.remove();
        el.classList.remove('tok--hint');
    };
}
// пауза — момент, когда человек читает строку
video.addEventListener('pause', () => { if (video.currentTime > 2) setTimeout(maybeWordHint, 250); });
// или ~20 с реального просмотра (без перемоток)
video.addEventListener('timeupdate', () => {
    const tNow = video.currentTime;
    if (wordHintLastT !== null && !video.paused) {
        const d = tNow - wordHintLastT;
        if (d > 0 && d < 2) wordHintWatched += d;
    }
    wordHintLastT = tNow;
    if (!wordHintShown && wordHintWatched >= 20) maybeWordHint();
});

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
    // Компактно: в шапке — «знакомо N%», полный текст «Ты знаешь N% слов этой
    // серии (K из N)» — в подсказке (title), чтобы не занимать строку. Значок
    // книги убран: словом понятнее, чем эмодзи с голой цифрой.
    // Слово («знакомо») в отдельной обёртке: на узких телефонах строка целиком
    // не помещается и налезает на «Авто-колоду» — там CSS оставляет один процент.
    const tpl = t('player.coverageShort');
    const cut = tpl.indexOf('{p}');
    el.textContent = '';
    if (cut > 0) {
        const word = document.createElement('span');
        word.className = 'cov-w';
        word.textContent = tpl.slice(0, cut);
        el.appendChild(word);
    }
    el.append(pct + (cut >= 0 ? tpl.slice(cut + 3) : ''));
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

// Вызывается каждый кадр (cueSyncLoop) — сканировать с нуля дорого. Реплики
// отсортированы, поэтому держим стартовый индекс: реплика, закончившаяся до t,
// уже никогда не совпадёт. При перемотке назад, смене сдвига или новом списке
// начинаем сначала — результат идентичен полному проходу.
let cueScanFrom = 0, cueScanT = -1, cueScanOffset = 0, cueScanList = null, cueScanSegs = null;
function findCueIndex(t) {
    if (state.cues !== cueScanList || t < cueScanT || state.offset !== cueScanOffset
        || state.segs !== cueScanSegs) {
        cueScanFrom = 0;
        cueScanList = state.cues;
    }
    cueScanT = t;
    cueScanOffset = state.offset;
    cueScanSegs = state.segs;
    while (cueScanFrom < state.cues.length
        && state.cues[cueScanFrom].end + cueOff(state.cues[cueScanFrom]) < t) cueScanFrom++;
    for (let i = cueScanFrom; i < state.cues.length; i++) {
        const c = state.cues[i];
        if (t >= c.start + cueOff(c) && t <= c.end + cueOff(c)) return i;
        if (c.start + cueOff(c) > t) return -1;
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
    wordSeenMap = lsJson('animei:wordSeen', {});
    if (!wordSeenMap || typeof wordSeenMap !== 'object') wordSeenMap = {};
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
        // Водяной знак источника («kaa.lt» первой строкой) — не реплика.
        state.burnedCues = parseVttCues(await r.text())
            .filter((c) => !/^\s*(?:kaa\.(?:lt|to|si)|krussdomi\.com)\s*$/i.test(c.text || ''));
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
let burnedScanFrom = 0, burnedScanT = -1, burnedScanList = null;
function syncBurnedSub() {
    if (!burnedSub || !state.burnedCues.length) return;
    const t = video.currentTime;
    // Тот же приём, что в findCueIndex: покадровый вызов, стартовый индекс
    // двигаем мимо уже закончившихся реплик, при перемотке назад — сброс.
    if (state.burnedCues !== burnedScanList || t < burnedScanT) {
        burnedScanFrom = 0;
        burnedScanList = state.burnedCues;
    }
    burnedScanT = t;
    while (burnedScanFrom < state.burnedCues.length
        && state.burnedCues[burnedScanFrom].end < t) burnedScanFrom++;
    let idx = -1;
    for (let i = burnedScanFrom; i < state.burnedCues.length; i++) {
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
            state.autoPauseAt = state.cues[idx].end + cueOff(state.cues[idx]);
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
            if (state.cues[i].start + cueOff(state.cues[i]) <= t) idx = i;
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
                if (state.cues[i].start + cueOff(state.cues[i]) <= t) idx = i;
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
        if (times[i]) times[i].textContent = formatTime(Math.max(0, cue.start + cueOff(cue)));
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
        ? state.cues[state.activeCueIndex].end + cueOff(state.cues[state.activeCueIndex])
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
        if (window.AnimeiSettings) window.AnimeiSettings.set('studyTranscription', state.readingMode);
        else localStorage.setItem('animei:readingMode', state.readingMode);
        applyReadingPref();
        // Попап слова открыт — его чтение перерисовываем тем же режимом,
        // иначе внутри попапа остаётся прошлый.
        const ctx = state.popupContext;
        if (ctx && !popup.hidden) {
            popupReading.textContent = readingForDisplay(
                (ctx.dict && ctx.dict.reading) || ctx.tok.baseReading || ctx.tok.reading || '',
                { surface: ctx.tok.base, pos: ctx.tok.pos });
        }
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
    video.currentTime = cue.start + cueOff(cue) + 0.01;
    if (state.autoPause) state.autoPauseAt = cue.end + cueOff(cue);
    video.play().catch(() => {});
}

// Повторить текущую (или последнюю прозвучавшую) реплику
function replayCue() {
    let cue = state.activeCueIndex >= 0 ? state.cues[state.activeCueIndex] : null;
    if (!cue) {
        const t = video.currentTime;
        cue = [...state.cues].reverse().find(c => c.start + cueOff(c) <= t);
    }
    if (cue) seekToCue(cue);
}

function nextCue() {
    const t = video.currentTime;
    const next = state.cues.find(c => c.start + cueOff(c) > t + 0.05);
    if (next) seekToCue(next);
}

// Порог 0.8с: в начале реплики «назад» уходит к предыдущей, а не к её же старту
// (к старту текущей ведёт «повторить»).
function prevCue() {
    const t = video.currentTime;
    let cue = null;
    for (const c of state.cues) {
        if (c.start + cueOff(c) < t - 0.8) cue = c;
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
// Чип «Уже знаю» (под чтением слова): в разметке его может НЕ быть, если HTML
// страницы пришёл из старого кеша (установленное PWA иногда стартует со
// снапшота страницы при уже свежем JS — версия в сайдбаре новая, а элементов
// нового HTML нет). Поэтому не полагаемся на разметку: нет — создаём сами.
// Содержимое (галочка + подпись) выставляем всегда: у клиента со старым HTML
// внутри кнопки мог остаться голый текст прежнего варианта.
// Кружок-чекбокс + подпись: пустой кружок читается как «можно тапнуть»,
// залитый зелёный с галочкой — как «отмечено» (та же метафора, что у выбора
// слов на странице «Мои слова»).
const KNOWN_CHIP_HTML = '<span class="word-popup__known-box"><svg viewBox="0 0 24 24" fill="none" '
    + 'stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M20 6 9 17l-5-5"/></svg></span><span class="word-popup__known-label"></span>';
const popupKnown = (() => {
    let el = document.getElementById('popup-known');
    if (!el) {
        const home = document.getElementById('popup-reading')?.parentElement;
        if (!home) return null;
        el = document.createElement('button');
        el.id = 'popup-known';
        el.type = 'button';
        el.className = 'word-popup__known';
        home.appendChild(el);
    }
    el.innerHTML = KNOWN_CHIP_HTML;
    return el;
})();
const popupExplainBtn = document.getElementById('popup-explain-btn');
// Меняем только текстовую подпись, чтобы иконка ИИ в кнопке не пропадала.
const popupExplainLabel = popupExplainBtn.querySelector('.btn-label') || popupExplainBtn;

// ---------- Подписи частей речи ----------
// jisho отдаёт английские термины («Adverb (fukushi)», «Godan verb with 'ru'
// ending») — переводим в короткие подписи на языке интерфейса. Набор меток у
// jisho конечный, правила по префиксам/ключевым словам; порядок важен (частные
// раньше общих). Непокрытая метка — как есть, но без скобочного термина.
const POS_RULES = [
    [/genitive/i,             { ru: 'существительное (+の)', uk: 'іменник (+の)', en: 'noun (+の)' }],
    [/^noun.*suru/i,          { ru: 'существительное (+する)', uk: 'іменник (+する)', en: 'noun (+する)' }],
    [/^noun|^proper noun/i,   { ru: 'существительное', uk: 'іменник', en: 'noun' }],
    [/^adverb.*'to'/i,        { ru: 'наречие (+と)', uk: 'прислівник (+と)', en: 'adverb (+と)' }],
    [/^adverb/i,              { ru: 'наречие', uk: 'прислівник', en: 'adverb' }],
    [/^i-adjective/i,         { ru: 'い-прилагательное', uk: 'い-прикметник', en: 'i-adjective' }],
    [/^na-adjective/i,        { ru: 'な-прилагательное', uk: 'な-прикметник', en: 'na-adjective' }],
    [/^no-adjective/i,        { ru: 'прилагательное (+の)', uk: 'прикметник (+の)', en: 'no-adjective' }],
    [/^pre-noun adjectival/i, { ru: 'приимённое (рэнтайси)', uk: 'приіменне (рентайсі)', en: 'pre-noun adjectival' }],
    [/^taru-adjective/i,      { ru: 'たる-прилагательное', uk: 'たる-прикметник', en: 'taru-adjective' }],
    [/^godan verb/i,          { ru: 'глагол (годан)', uk: 'дієслово (ґодан)', en: 'godan verb' }],
    [/^ichidan verb/i,        { ru: 'глагол (итидан)', uk: 'дієслово (ітідан)', en: 'ichidan verb' }],
    [/^suru verb/i,           { ru: 'する-глагол', uk: 'する-дієслово', en: 'suru verb' }],
    [/^kuru verb/i,           { ru: 'глагол (куру)', uk: 'дієслово (куру)', en: 'kuru verb' }],
    [/^(nidan|yodan) verb/i,  { ru: 'глагол (устар.)', uk: 'дієслово (застар.)', en: 'archaic verb' }],
    [/^transitive verb/i,     { ru: 'переходный', uk: 'перехідне', en: 'transitive' }],
    [/^intransitive verb/i,   { ru: 'непереходный', uk: 'неперехідне', en: 'intransitive' }],
    [/^auxiliary verb/i,      { ru: 'вспомогательный глагол', uk: 'допоміжне дієслово', en: 'auxiliary verb' }],
    [/^auxiliary/i,           { ru: 'вспомогательное', uk: 'допоміжне', en: 'auxiliary' }],
    [/^expression/i,          { ru: 'выражение', uk: 'вираз', en: 'expression' }],
    [/^conjunction/i,         { ru: 'союз', uk: 'сполучник', en: 'conjunction' }],
    [/^particle/i,            { ru: 'частица', uk: 'частка', en: 'particle' }],
    [/^interjection/i,        { ru: 'междометие', uk: 'вигук', en: 'interjection' }],
    [/^pronoun/i,             { ru: 'местоимение', uk: 'займенник', en: 'pronoun' }],
    [/^prefix/i,              { ru: 'приставка', uk: 'префікс', en: 'prefix' }],
    [/^suffix/i,              { ru: 'суффикс', uk: 'суфікс', en: 'suffix' }],
    [/^counter/i,             { ru: 'счётное слово', uk: 'лічильне слово', en: 'counter' }],
    [/^numeric/i,             { ru: 'числительное', uk: 'числівник', en: 'numeral' }],
    [/^copula/i,              { ru: 'связка', uk: 'зв’язка', en: 'copula' }],
    [/^wikipedia/i,           { ru: 'из Википедии', uk: 'з Вікіпедії', en: 'from Wikipedia' }],
];

function posLabel(posList) {
    const lang = (typeof getLang === 'function') ? getLang() : 'ru';
    const out = [];
    for (const p of posList || []) {
        let label = null;
        for (const [re, tr] of POS_RULES) {
            if (re.test(p)) { label = tr[lang] || tr.en; break; }
        }
        if (!label) label = String(p).replace(/\s*\([^)]*\)/g, '').trim();
        if (label && !out.includes(label)) out.push(label);
    }
    return out.join(', ');
}

// ---------- Тихая отметка «уже знаю» в попапе слова ----------
// Слово уходит в известные (known-store, страница «Мои слова» → «Известные
// слова»): зелёная подсветка, процент покрытия и авто-колода сразу считают его
// знакомым — карточка при этом НЕ создаётся. Повторный клик снимает отметку.

function updateKnownBtn(base) {
    if (!popupKnown) return;
    const on = !!(window.KnownWords && KnownWords.has(base));
    popupKnown.classList.toggle('is-on', on);
    // Меняем только подпись — кружок-чекбокс живёт в кнопке постоянно.
    const label = popupKnown.querySelector('.word-popup__known-label');
    if (label) label.textContent = t('popup.known');
    popupKnown.title = t('popup.known.title');
}

popupKnown?.addEventListener('click', () => {
    const ctx = state.popupContext;
    if (!ctx || !window.KnownWords) return;
    const base = ctx.tok.base;
    if (KnownWords.has(base)) {
        // Снять отметку: слово снова «новое» (подсветку пересобираем).
        KnownWords.remove(base);
        state.knownWords.delete(base);
        renderTranscript();
        updateNowCue(state.activeCueIndex);
        updateCoverage();
        updateKnownBtn(base);
    } else {
        KnownWords.addMany([base]);
        state.knownWords.add(base);
        markKnownEverywhere(base);
        updateCoverage();
        updateKnownBtn(base);
        if (state.popupContext) state.popupContext.outcome = 'known';
        if (window.animeiTrack) window.animeiTrack('known_word', base);
        showSnackbar(t('popup.knownAdded'), { duration: 2500 });
        closeWordPopup();
    }
});

// Кнопка «Назад» (в т.ч. системная на Android/жест) должна закрывать открытую
// словарную карточку / разбор предложения, а не уводить со страницы просмотра.
// Общий менеджер слоёв (AnimeiBack в app.js) держит history в порядке.
let popupLayer = null;
function markPopupOpen() {
    if (popupLayer) return;
    popupLayer = AnimeiBack.open(() => { popupLayer = null; popup.hidden = true; notePopupClosed(); });
}
function closeWordPopup() {
    if (popup.hidden) return;
    if (popupLayer) AnimeiBack.close(popupLayer);
    else { popup.hidden = true; notePopupClosed(); }
}
// Воронка «нажал на слово → сохранил»: 04.10.2026 из плеера за 10 дней не
// сохранили ни одного слова поштучно, и было непонятно, где обрыв — не находят
// слова или открывают и закрывают. word_open — открыл карточку слова,
// word_skip — закрыл, ничего не сделав (не сохранил и не «уже знаю»).
function notePopupClosed() {
    const ctx = state.popupContext;
    if (!ctx || !ctx.tok || ctx.outcome) return;
    ctx.outcome = 'closed';
    if (window.animeiTrack) window.animeiTrack('word_skip', ctx.tok.base);
}

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
    markWordHintDone();   // нашёл, что слова нажимаются, — подсказка больше не нужна
    // Карточку другого слова открыли поверх — прошлое считается закрытым без действия
    notePopupClosed();
    state.popupContext = { tok, cue, dict: null, event };
    if (window.animeiTrack) window.animeiTrack('word_open', tok.base);

    popupWord.textContent = tok.base;
    updateKnownBtn(tok.base);
    // Английское слово: чтение — транскрипция из словаря (придёт ниже).
    const en = tok.pos === 'en';
    // Показываем слово (tok.base) и чтение согласованно — от базовой формы:
    // baseReading (かえる), а не поверхностное tok.reading (かえっ). Ниже, если
    // найдётся словарная статья, чтение уточнится из неё.
    popupReading.textContent = en ? '' : readingForDisplay(tok.baseReading || tok.reading || '',
        { surface: tok.base, pos: tok.pos });
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
        // silentErrors: у попапа своя обработка ошибки («Словарь не отвечает» +
        // «Повторить» прямо в теле) — глобальный снекбар дублировал бы её.
        const { data: res } = await client.get('dictionary', {
            params: {
                q: tok.base, lang: (typeof getLang === 'function') ? getLang() : 'ru',
                // Английское слово — англо-русский словарь с транскрипцией.
                ...(en ? { target: 'en' } : {}),
            },
            silentErrors: true,
        });
        const entries = res.data || [];
        if (state.popupContext?.tok !== tok) return;

        state.popupContext.dict = entries[0] || null;

        if (!entries.length) {
            popupBody.innerHTML = '<div class="dict-loading"></div>';
            popupBody.firstChild.textContent = t('popup.notFound');
            return;
        }

        if (entries[0].reading) {
            popupReading.textContent = en ? entries[0].reading : readingForDisplay(entries[0].reading,
                { surface: tok.base, pos: tok.pos });
        }

        popupBody.innerHTML = '';
        // Одно значение вместо словарной статьи. У 来る словарь отдаёт три
        // смысла по три-четыре синонима — шесть строк, из которых при беглом
        // взгляде нужна одна. Берём тот же shortTranslation, что уходит в
        // карточку при сохранении (words-store.js): он предпочитает варианты
        // без скобочных уточнений и режет близкие синонимы — так в попапе и в
        // сохранённом слове написано одно и то же.
        const senses = entries[0].senses || [];
        const main = shortTranslation(entries[0], 1)
            || (senses[0] && senses[0].definitions && senses[0].definitions[0]) || '';
        if (main) {
            const div = document.createElement('div');
            div.className = 'sense sense--main';
            div.textContent = main;
            popupBody.appendChild(div);
        }
        // Остальные смыслы — одной тихой строкой, по одному слову на смысл.
        // Прогоняем каждый через тот же shortTranslation, чтобы и здесь
        // работало правило про скобки-пояснения и скобки-управление.
        const rest = senses.slice(1)
            .map((sense) => shortTranslation({ senses: [sense] }, 1))
            .filter((d) => d && d !== main);
        const uniq = rest.filter((d, i) => rest.indexOf(d) === i).slice(0, 3);
        if (uniq.length) {
            const div = document.createElement('div');
            div.className = 'sense sense--more';
            div.textContent = uniq.join(' · ');
            popupBody.appendChild(div);
        }

        const meta = [];
        if (entries[0].isCommon) meta.push(t('popup.common'));
        if (entries[0].jlpt?.length) meta.push(entries[0].jlpt[0].toUpperCase());
        if (en) {
            // Часть речи, уровень по частоте и форма из реплики, если она
            // отличается от словарной (celebrating → celebrate).
            const pos = entries[0].senses?.[0]?.pos?.[0];
            if (pos) meta.push(pos);
            if (entries[0].level) meta.push(entries[0].level);
            if (tok.surface.toLowerCase() !== tok.base) meta.push(t('popup.form').replace('{s}', tok.surface));
        }
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

// Блок «как запомнить»: иероглиф + слово-ключ, из каких ключей собран и
// короткая история — та же логика, что у WaniKani/jpdb и метода Хайсига.
function buildMnemonics(items) {
    const list = document.createElement('div');
    for (const m of items) {
        const row = document.createElement('div');
        row.className = 'explain__part explain__mnemo';
        const jp = document.createElement('span');
        jp.className = 'explain__jp';
        jp.textContent = m.kanji;
        const key = document.createElement('span');
        key.className = 'explain__reading';
        key.textContent = m.keyword ? ' ' + m.keyword : '';
        row.append(jp, key);
        if (m.parts) {
            const parts = document.createElement('div');
            parts.className = 'explain__keys';
            parts.textContent = m.parts;
            row.appendChild(parts);
        }
        if (m.story) {
            const story = document.createElement('div');
            story.className = 'explain__meaning';
            story.textContent = m.story;
            row.appendChild(story);
        }
        list.appendChild(row);
    }
    return list;
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
            if (!b.reading && /^[\x00-\x7F]+$/.test(b.part || '')) {
                readingText = '';   // английский кусок — чтения нет
            } else if (state.readingMode === 'romaji') {
                const rom = kanaToRomaji(b.reading || b.part, { surface: b.part });
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

    if (data.mnemonics?.length) {
        renderExplainSection(t('explain.mnemonics'), buildMnemonics(data.mnemonics));
    }

    popupExplain.hidden = false;
    popupExplainBtn.hidden = true;
    // Попап подрос — пересчитаем позицию, чтобы не уехал за край экрана
    if (state.popupContext?.event) positionPopup(state.popupContext.event);
}

// Получить разбор реплики (из кеша или с сервера). Общий для кнопки в словарной
// карточке и для иконки ИИ у реплики.
// word — слово, ради которого открыли разбор: от него зависит блок «как
// запомнить» (у иконки реплики слова нет, разбираем всю реплику).
async function fetchExplain(cue, word) {
    const lang = typeof getLang === 'function' ? getLang() : 'ru';
    const key = (state.enMode ? 'en|' : '') + lang + '|' + (word || '') + '|' + cue.text;
    const cached = explainCache.get(key);
    if (cached) return cached;
    const params = { sentence: cue.text, context: cueContext(cue), lang };
    if (word) params.word = word;
    if (state.enMode) params.target = 'en';   // английская реплика — свой промпт
    const { data: res } = await client.get('explain', { params, timeout: 60000, silentErrors: true });
    const data = res.data.explanation;
    explainCache.set(key, data);
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
    formMessage(popupExplainBtn, '');
    if (window.animeiTrack) window.animeiTrack('explain', 'player');

    try {
        const data = await fetchExplain(ctx.cue, ctx.tok?.base || ctx.tok?.surface);
        // Пока ждали ответ, могли открыть другое слово той же реплики — это ок,
        // разбор относится к реплике, а не к слову
        if (!popup.hidden && state.popupContext?.cue.text === sentence) {
            renderExplain(data);
        }
    } catch (err) {
        console.error(err);
        formMessage(popupExplainBtn, explainErrorText(err));   // рядом с кнопкой, а не тостом
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
    formMessage(popupSave, '');

    try {
        const dict = ctx.dict;
        // Не больше двух значений — иначе карточка длинная (логика отбора и
        // склейки похожих вариантов — в shortTranslation, words-store.js).
        const translation = shortTranslation(dict);

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
            videoStart: Math.max(0, ctx.cue.start + cueOff(ctx.cue)),
            videoEnd: ctx.cue.end + cueOff(ctx.cue),
            videoUrl: state.currentVideoUrl || '',
            hint: '',
        });

        state.knownWords.add(ctx.tok.base);
        // Слово стало «своим» — сразу зелёное везде, где встречается, и растёт
        // процент покрытия серии: маленькое видимое вознаграждение за клик.
        markKnownEverywhere(ctx.tok.base);
        updateCoverage();
        ctx.outcome = 'saved';
        if (window.animeiTrack) window.animeiTrack('save_word', ctx.tok.base);
        rememberSessionWord(savedWord);
        // Подтверждение — на самой кнопке; куда попадёт слово — один раз.
        markDone(popupSave, t('popup.saved'));
        showSnackbarOnce('savedWord', t('popup.savedSnack'), { type: 'success' });
        state.activeCueIndex = -2;
    } catch (err) {
        console.error(err);
        popupSave.disabled = false;
        popupSave.textContent = t('popup.save');
        // Причина — не обязательно «не вошёл»: вошедшему пишем про связь.
        formMessage(popupSave, t(typeof isSignedIn === 'function' && isSignedIn() ? 'popup.saveErrorNet' : 'popup.saveError'));
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

// Список известных слов досинхронизировался с сервером (вошёл на новом
// устройстве, скопировали слова на аккаунт) — плеер прочитал его раньше,
// без этого подсветка и покрытие оставались старыми до перезагрузки.
document.addEventListener('known:changed', () => {
    if (!window.KnownWords) return;
    for (const k of KnownWords.all()) state.knownWords.add(k);
    renderTranscript();
    updateCoverage();
});

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
    // «Сброс» — значит «без сдвига вовсе», куски тоже убираем.
    state.segs = null;
    localStorage.removeItem(segStorageKey(offsetStorageKey()));
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

// «Назад» на телефоне закрывает шторку настройки субтитров, а не уводит с плеера.
let subsPickerLayer = null;

function openSubsPicker() {
    subsPicker.hidden = false;
    if (!subsPickerLayer) {
        subsPickerLayer = AnimeiBack.open(() => { subsPickerLayer = null; subsPicker.hidden = true; });
    }
    setPreciseLoading(preciseBusy);
    if (subsPreciseStatus) subsPreciseStatus.textContent = t('subs.precise.hint');
    if (subsPreciseBtn) subsPreciseBtn.disabled = preciseBusy;
    labelManualButtons();
    refreshOffsetDisplay();
}

function closeSubsPicker() {
    if (subsPickerLayer) AnimeiBack.close(subsPickerLayer);
    else subsPicker.hidden = true;
}

subsFixBtn.addEventListener('click', openSubsPicker);
if (subsPreciseBtn) subsPreciseBtn.addEventListener('click', preciseSyncSubs);

// «Попробовать другой файл субтитров»: текущий файл в исключения, сдвиг этой
// серии сбрасываем (он относился к прежнему файлу) и подбираем заново.
async function tryOtherSubsFile() {
    const altBtn = document.getElementById('subs-alt-file');
    if (!state.subsFile || !altBtn || altBtn.disabled) return;
    altBtn.disabled = true;
    formMessage(altBtn, '');
    const prev = state.subsFile;
    state.subsExcluded.push(prev);
    localStorage.removeItem(offsetStorageKey());
    localStorage.removeItem(offsetStorageKey() + ':m');
    localStorage.removeItem(segStorageKey(offsetStorageKey()));
    localStorage.removeItem(segStorageKey(offsetStorageKey()) + ':q');
    state.offset = 0;
    state.segs = null;
    state.autoSyncKey = null;   // автосинк заново для нового файла
    state.segKey = null;
    const ep = state.episodes[parseInt(episodeSelect.value, 10)];
    const epNum = ep && ep.number != null ? ep.number : 1;
    try {
        await loadSubtitles(epNum);
        if (!state.cues.length) {
            // Другого файла в архиве нет — возвращаем прежний, чтобы не остаться без сабов.
            state.subsExcluded = state.subsExcluded.filter((n) => n !== prev);
            formMessage(altBtn, t('subs.noOther'), 'info');   // у кнопки, а не тостом поверх видео
            await loadSubtitles(epNum);
        } else {
            formMessage(altBtn, t('subs.otherLoaded'), 'success');
            state.syncPromise = maybeAutoSync();
        }
    } finally {
        altBtn.disabled = false;
    }
}
document.getElementById('subs-alt-file')?.addEventListener('click', tryOtherSubsFile);
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
translationSelect.addEventListener('change', () => {
    const opt = state.subOptions[parseInt(translationSelect.value, 10)];
    // В статистику — только ручная смена дорожки; автовыбор при загрузке не действие.
    if (opt && window.animeiTrack) window.animeiTrack('voiceover', (isJpTrack(opt.track) ? '🇯🇵 ' : '') + (opt.track.title || ''));
    selectTranslation(parseInt(translationSelect.value, 10));
});
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

// ---------- Горячие клавиши под значком «i» ----------
// Постоянная строка подсказок нужна только первое время, поэтому по умолчанию
// она свёрнута, а выбор пользователя запоминаем.

const hotkeysToggle = document.getElementById('hotkeys-toggle');
const hotkeysHint = document.getElementById('hotkeys-hint');

if (hotkeysToggle && hotkeysHint) {
    const setHotkeysOpen = (open) => {
        hotkeysHint.hidden = !open;
        hotkeysToggle.setAttribute('aria-expanded', String(open));
        hotkeysToggle.classList.toggle('is-open', open);
    };
    let open = false;
    try { open = localStorage.getItem('animei:hotkeysOpen') === '1'; } catch { /* недоступен */ }
    setHotkeysOpen(open);
    hotkeysToggle.addEventListener('click', () => {
        open = hotkeysHint.hidden;
        setHotkeysOpen(open);
        try { localStorage.setItem('animei:hotkeysOpen', open ? '1' : '0'); } catch { /* недоступен */ }
    });
}

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
setMobileTab('settings'); // на ПК классы ни на что не влияют, на телефоне вкладок больше нет

// ---------- Телефон: строка под видео и шторка настроек ----------
// На телефоне под кадром должен быть сразу текст, поэтому вместо вкладок и
// блока настроек — одна строка «название · Серия N · › · ⋯», а всё редкое
// (сезон, дорожка, выбор серии, режимы, синхронизация, горячие клавиши)
// открывается шторкой по «⋯». Разметка та же, что на ПК, — меняется оформление.
// Элементы ищем внутри функций, а не в константах модуля: syncMobBar зовёт
// selectEpisode, объявленный на тысячу строк выше, — на константы из этого
// места он налетел бы во «временной мёртвой зоне» при первой загрузке.
function syncMobBar() {
    syncFsEpisode();
    const bar = document.getElementById('mob-bar');
    if (!bar) return;
    const name = document.getElementById('mob-bar-name');
    // Название приходит параметром адреса, но по ссылке без него (закладка,
    // расшаренный url) строка оставалась пустой — тогда берём его из селекта
    // сезона, он заполняется из каталога.
    if (name && !name.textContent) {
        const season = document.getElementById('season-select');
        const opt = season && season.selectedOptions[0];
        name.textContent = titleRu || titleRomaji || (opt ? opt.textContent.trim() : '');
    }
    // Настоящие данные пришли — снимаем скелетон строки и показываем «⋯».
    const more = document.getElementById('mob-bar-more');
    if (more) more.hidden = false;
    // Серия — зеркало селекта из шторки: те же опции (с группами сезонов),
    // то же текущее значение. Пересобираем, когда список серий сменился.
    const wrap = document.getElementById('mob-bar-ep-wrap');
    if (wrap && episodeSelect) {
        let sel = document.getElementById('mob-bar-ep');
        if (!sel) {
            wrap.innerHTML = '';
            sel = document.createElement('select');
            sel.id = 'mob-bar-ep';
            sel.className = 'mob-bar__ep';
            sel.setAttribute('aria-label', window.t('controls.episode'));
            sel.addEventListener('change', () => {
                const idx = parseInt(sel.value, 10);
                if (Number.isInteger(idx) && String(idx) !== String(episodeSelect.value)) selectEpisode(idx);
            });
            wrap.appendChild(sel);
        }
        mirrorEpisodeSelect(sel);
    }
    bar.hidden = false;
}

// Зеркало селекта серий из шторки: те же опции (с группами сезонов) и то же
// текущее значение. Опции пересобираем, только когда сменился сам список.
function mirrorEpisodeSelect(sel) {
    const sig = episodeSelect.innerHTML.length + ':' + state.episodes.length;
    if (sel.dataset.sig !== sig) {
        sel.innerHTML = episodeSelect.innerHTML;
        sel.dataset.sig = sig;
    }
    sel.value = episodeSelect.value;
    sel.disabled = episodeSelect.disabled;
}

// Во весь экран: серия и «следующая» в правом верхнем углу кадра (показ —
// стилями .video-wrap.is-fs). Синхронизируем при каждой смене серии/списка.
function syncFsEpisode() {
    const sel = document.getElementById('fs-ep-select');
    const next = document.getElementById('fs-ep-next');
    if (!sel || !episodeSelect) return;
    mirrorEpisodeSelect(sel);
    if (next) next.disabled = episodeSelect.disabled || !state.episodes[Number(episodeSelect.value) + 1];
}
document.getElementById('fs-ep-select')?.addEventListener('change', (e) => {
    const idx = parseInt(e.target.value, 10);
    if (Number.isInteger(idx) && String(idx) !== String(episodeSelect.value)) selectEpisode(idx);
});
document.getElementById('fs-ep-next')?.addEventListener('click', () => {
    const idx = Number(episodeSelect.value) + 1;
    if (state.episodes[idx]) selectEpisode(idx);
});

function setSheet(open) {
    const layout = document.querySelector('.player-layout');
    if (!layout) return;
    layout.classList.toggle('sheet-open', open);
    const more = document.getElementById('mob-bar-more');
    if (more) more.setAttribute('aria-expanded', String(open));
}

document.getElementById('mob-bar-more')?.addEventListener('click',
    () => setSheet(!document.querySelector('.player-layout').classList.contains('sheet-open')));
document.getElementById('sheet-close')?.addEventListener('click', () => setSheet(false));
// Тап по затемнению закрывает шторку. Затемнение — ::after самой раскладки,
// поэтому целью клика оказывается она сама.
playerLayout?.addEventListener('click', (e) => {
    if (e.target === playerLayout && playerLayout.classList.contains('sheet-open')) setSheet(false);
});
// Выбрал серию или дорожку — шторка своё дело сделала, закрываем.
episodeSelect?.addEventListener('change', () => { syncMobBar(); setSheet(false); });
document.getElementById('translation-select')?.addEventListener('change', () => setSheet(false));
document.getElementById('season-select')?.addEventListener('change', () => setSheet(false));

// Следим за шириной кадра 16:9 и перекладываем её в --video-w на .player-layout
// (десктоп):
//  1) левую колонку грида сужаем ровно до видео и центрируем пару «видео+сабы»
//     (см. player.css, min-width: 901px) — между ними больше нет большого отступа;
//  2) блоки под видео (now-cue/настройки/подсказки) ограничиваем этой же шириной.
// Сама формула — window.fitVideoWidth из инлайн-скрипта player.html: она обязана
// отработать до первой отрисовки, иначе видно узкую раскладку.
(function matchVideoWidth() {
    const vw = document.querySelector('.video-wrap');
    const layout = document.querySelector('.player-layout');
    if (!layout || !vw || !window.ResizeObserver || typeof window.fitVideoWidth !== 'function') return;
    let raf = 0;
    const remeasure = () => { raf = 0; window.fitVideoWidth(); };
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
