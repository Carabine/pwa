// Плеер: видео с Kodik (HLS через наш прокси) + японские субтитры
// с kitsunekko, размеченные по словам. Клик по слову — словарь и
// сохранение в коллекцию.

const params = new URLSearchParams(window.location.search);
const shikimoriId = params.get('id');
const titleRu = params.get('title') || '';
const titleRomaji = params.get('name') || titleRu;

const video = document.getElementById('video');
const videoLoading = document.getElementById('video-loading');
const translationSelect = document.getElementById('translation-select');
const episodeSelect = document.getElementById('episode-select');
const seasonSelect = document.getElementById('season-select');
const seasonGroup = document.getElementById('season-group');
const transcriptList = document.getElementById('transcript-list');
const subsStatus = document.getElementById('subs-status');
const subsSource = document.getElementById('subs-source');
const jumpBtn = document.getElementById('transcript-jump');
const subsFixBtn = document.getElementById('subs-fix');

const state = {
    translations: [],
    episodes: [],          // серии, показанные в дропдауне серий сейчас
    rawEpisodes: [],       // весь список серий текущего тайтла как пришёл от Kodik
    episodeGroups: [],     // серии, разбитые по сезонам (по сбросу нумерации) — фолбэк
    franchiseSeasons: [],  // другие тайтлы-сезоны франшизы (каждый сезон — свой тайтл)
    seasonMode: 'single',  // 'franchise' | 'groups' | 'single'
    seasonIndex: 0,
    cues: [],
    activeCueIndex: -1,
    offset: 0,
    autoPause: false,
    autoPauseAt: null,
    showRu: true,
    furigana: localStorage.getItem('animei:furigana') !== 'off',
    romaji: localStorage.getItem('animei:romaji') === 'on',
    aiAvailable: false,
    knownWords: new Set(),
    hls: null,
    currentVideoUrl: '',   // адрес текущего HLS-потока — уходит в слово, чтобы сервер нарезал клип
    popupContext: null,
    followCue: true,       // список сам едет за текущей репликой; сбрасываем, когда листают вручную
    manualSubs: null,      // выбранный вручную файл сабов { path, name } — не пересчитываем по номеру серии
};

// Кэш ИИ-разборов на время сессии: повторный клик по той же реплике мгновенный
const explainCache = new Map();

// Заголовок — название тайтла из каталога. Если открыли плеер напрямую без
// названия, оставляем статичное «Загрузка…» из разметки (i18n его не трогает).
if (titleRu) {
    document.getElementById('anime-title').textContent = titleRu;
    document.title = titleRu + ' — Animei';
}

// ---------- Загрузка тайтла ----------

async function init() {
    if (!shikimoriId) {
        videoLoading.textContent = t('player.noTitle');
        return;
    }

    loadKnownWords();
    loadFranchise();   // параллельно: другие сезоны франшизы для дропдауна

    try {
        const { data: res } = await client.get('catalog/anime/' + shikimoriId);
        const info = res.data;

        // Субтитровые дорожки — это оригинальная японская озвучка, их наверх.
        // Среди них по умолчанию Crunchyroll — у них самое стабильное качество
        state.translations = [...info.translations].sort((a, b) => {
            if (a.type !== b.type) return a.type === 'subtitles' ? -1 : 1;
            const aCr = /crunchyroll/i.test(a.title) ? 0 : 1;
            const bCr = /crunchyroll/i.test(b.title) ? 0 : 1;
            if (aCr !== bCr) return aCr - bCr;
            return a.title.localeCompare(b.title);
        });

        if (!state.translations.length) {
            videoLoading.textContent = t('player.noPlayers');
            return;
        }

        renderTranslations();
        await selectTranslation(0);
    } catch (err) {
        console.error(err);
        videoLoading.textContent = t('player.notFound');
    }
}

function renderTranslations() {
    translationSelect.innerHTML = '';
    state.translations.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        const label = t.type === 'subtitles' ? '🇯🇵 ' + window.t('player.jpAudio') + ' · ' : '🎙 ';
        opt.textContent = label + t.title;
        translationSelect.appendChild(opt);
    });
}

async function selectTranslation(index) {
    const t = state.translations[index];
    translationSelect.value = index;
    // Новая дорожка — свои сезоны/серии; сброс запомненного сезона обязателен
    await loadEpisodes({ mediaType: t.mediaType, mediaId: t.mediaId, mediaHash: t.mediaHash }, true);
}

// Загрузка списка серий выбранной дорожки. Kodik часто отдаёт все сезоны одним
// плоским списком (у «Атаки титанов» это 1–25, спешл, снова 1–25), а его данные
// о сезонах ненадёжны (у разных сезонов один и тот же serial). Поэтому сезоны
// восстанавливаем сами — по сбросу нумерации серий.
async function loadEpisodes(media, restoreSaved) {
    episodeSelect.innerHTML = '<option>' + window.t('player.loading') + '</option>';

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
        populateEpisodes(restoreSaved);
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
    state.episodes.forEach((ep, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = ep.title || (window.t('controls.episode') + ' ' + ep.number);
        episodeSelect.appendChild(opt);
    });

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

function fillSeasonSelect(labels, selectedIndex) {
    seasonGroup.hidden = false;
    seasonSelect.innerHTML = '';
    labels.forEach((label, i) => {
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
        fillSeasonSelect(state.franchiseSeasons.map(s => s.russian || s.name), cur >= 0 ? cur : undefined);
        return;
    }
    if (state.episodeGroups.length >= 2) {
        state.seasonMode = 'groups';
        fillSeasonSelect(seasonLabels(state.episodeGroups), state.seasonIndex);
        return;
    }
    state.seasonMode = 'single';
    seasonGroup.hidden = true;
}

// Переход на другой сезон-тайтл франшизы — перезагружаем плеер с его id
function navigateToSeason(season) {
    if (!season || String(season.shikimoriId) === String(shikimoriId)) return;
    const params = new URLSearchParams({
        id: season.shikimoriId,
        title: season.russian || season.name || '',
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

async function selectEpisode(index) {
    const ep = state.episodes[index];
    if (!ep) return;

    episodeSelect.value = index;
    localStorage.setItem(epStorageKey(), String(index));
    if (window.animeiTrack) window.animeiTrack('play', (titleRu || titleRomaji || 'аниме') + ' · эп ' + (ep.number ?? index + 1));
    videoLoading.style.display = 'flex';
    videoLoading.textContent = t('player.videoLoading');

    // Сабы под номер серии
    loadSubtitles(ep.number);

    try {
        const { data: res } = await client.get('catalog/stream', {
            params: { type: 'seria', id: ep.id, hash: ep.hash },
        });

        const hlsUrl = apiOrigin() + res.data.hls;
        state.currentVideoUrl = hlsUrl;
        attachVideo(hlsUrl);
    } catch (err) {
        console.error(err);
        videoLoading.textContent = t('player.streamError');
    }
}

function apiOrigin() {
    return client.defaults.baseURL.replace(/\/api\/v1\/?$/, '');
}

function attachVideo(hlsUrl) {
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }

    if (Hls.isSupported()) {
        state.hls = new Hls({ maxBufferLength: 60 });
        state.hls.loadSource(hlsUrl);
        state.hls.attachMedia(video);
        state.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoLoading.style.display = 'none';
            video.play().catch(() => {});
        });
        state.hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
                videoLoading.style.display = 'flex';
                videoLoading.textContent = t('player.videoError') + data.type;
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
            videoLoading.style.display = 'none';
            video.play().catch(() => {});
        }, { once: true });
    } else {
        videoLoading.textContent = t('player.noHls');
    }
    // Стандартные кнопки браузера не включаем — управление своё (player-ui.js)
}

// ---------- Субтитры ----------

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
    subsSource.textContent = '';
    subsFixBtn.hidden = true;

    try {
        let cues, fileName;
        if (state.manualSubs) {
            // Пользователь сам выбрал файл — берём именно его, без подбора по номеру.
            // Источник может быть jimaku (по ссылке) или kitsunekko (по пути).
            const ms = state.manualSubs;
            const endpoint = ms.source === 'jimaku' ? 'subtitles/jimaku/cues' : 'subtitles/cues';
            const params = ms.source === 'jimaku'
                ? { url: ms.url, name: ms.name, translate: subsLang() }
                : { path: ms.path, translate: subsLang() };
            const { data: res } = await client.get(endpoint, { params, timeout: 180000 });
            cues = res.data;
            fileName = ms.name;
        } else {
            const { data: res } = await client.get('subtitles/episode', {
                params: { title: titleRomaji, episode: episodeNumber, translate: subsLang() },
                timeout: 180000,
            });
            cues = res.data.cues;
            fileName = res.data.file;
        }

        state.cues = cues;
        subsSource.textContent = fileName;
        subsStatus.style.display = 'none';
        // Подобрали (или выбрали) файл — предлагаем сменить, если серия не та
        subsFixBtn.hidden = false;

        state.offset = parseFloat(localStorage.getItem(offsetStorageKey())) || 0;
        updateOffsetLabel();
        renderTranscript();
        updateNowCue(state.activeCueIndex);

        // Одноразовая подсказка новичку: сабы из архива часто чуть съезжают,
        // а кнопка «Сейчас!» неочевидна
        if (!localStorage.getItem('animei:syncHintShown')) {
            localStorage.setItem('animei:syncHintShown', '1');
            showSnackbar(t('player.syncHint'), { duration: 6000 });
        }
    } catch (err) {
        console.error(err);
        // Даже когда авто-подбор не сработал, оставляем ручной выбор доступным
        subsFixBtn.hidden = false;
        if (err.response?.status === 404) {
            // Не тупик: можно выбрать субтитры вручную, посмотреть без них или принести свои
            subsStatus.textContent = '';
            subsStatus.append(t('subs.notFound'));
            subsStatus.appendChild(document.createElement('br'));
            const pick = document.createElement('a');
            pick.href = '#';
            pick.textContent = t('subs.pickManually');
            pick.addEventListener('click', (e) => { e.preventDefault(); openSubsPicker(); });
            subsStatus.appendChild(pick);
            subsStatus.appendChild(document.createTextNode(' · '));
            const link = document.createElement('a');
            link.href = './watch.html';
            link.textContent = t('subs.notFoundLink');
            subsStatus.appendChild(link);
        } else {
            subsStatus.textContent = t('subs.error');
        }
    }
}

function offsetStorageKey() {
    return 'animei:subsOffset:' + shikimoriId + ':s' + state.seasonIndex + ':' + episodeSelect.value;
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

function applyFuriganaPref() {
    const btn = document.getElementById('furigana-toggle');
    btn.classList.toggle('chip-btn--active', state.furigana);
    transcriptList.classList.toggle('no-furigana', !state.furigana);
    nowCue.classList.toggle('no-furigana', !state.furigana);
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

function applyRomajiPref() {
    const btn = document.getElementById('romaji-toggle');
    btn.classList.toggle('chip-btn--active', state.romaji);
    transcriptList.classList.toggle('show-romaji', state.romaji);
    nowCue.classList.toggle('show-romaji', state.romaji);
}

function buildTokensHtml(cue) {
    if (!cue.tokens || !cue.tokens.length) {
        const span = document.createElement('span');
        span.textContent = cue.text;
        return [span];
    }

    return cue.tokens.map((tok) => {
        const span = document.createElement('span');
        appendWithFurigana(span, tok.surface, tok.reading);
        span.className = 'tok';
        if (tok.learnable) {
            span.classList.add('tok--learnable');
            if (state.knownWords.has(tok.base) || state.knownWords.has(tok.surface)) {
                span.classList.add('tok--known');
            }
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                openWordPopup(tok, cue, e);
            });
        }
        return span;
    });
}

function renderTranscript() {
    transcriptList.querySelectorAll('.cue').forEach(el => el.remove());

    state.cues.forEach((cue, i) => {
        const div = document.createElement('div');
        div.className = 'cue';
        div.dataset.index = i;

        const time = document.createElement('div');
        time.className = 'cue__time';
        time.textContent = formatTime(cue.start);
        div.appendChild(time);

        const jp = document.createElement('div');
        jp.className = 'cue__jp';
        buildTokensHtml(cue).forEach(s => jp.appendChild(s));
        div.appendChild(jp);

        // Ромадзи всегда в разметке, но по умолчанию скрыто (показывает CSS-класс)
        const romaji = romajiForCue(cue);
        if (romaji) {
            const rm = document.createElement('div');
            rm.className = 'cue__romaji';
            rm.textContent = romaji;
            div.appendChild(rm);
        }

        if (cue.translation) {
            const ru = document.createElement('div');
            ru.className = 'cue__ru';
            ru.textContent = cue.translation;
            div.appendChild(ru);
        }

        div.addEventListener('click', () => {
            video.currentTime = cue.start + state.offset + 0.01;
            video.play().catch(() => {});
        });

        transcriptList.appendChild(div);
    });
}

// ---------- Текущая реплика под видео ----------

const nowCue = document.getElementById('now-cue');
const nowCueJp = document.getElementById('now-cue-jp');
const nowCueRomaji = document.getElementById('now-cue-romaji');
const nowCueRu = document.getElementById('now-cue-ru');

function updateNowCue(idx) {
    // Пока субтитры загружены, блок всегда на месте — чтобы верстка не прыгала.
    if (!state.cues.length) {
        nowCue.hidden = true;
        return;
    }
    nowCue.hidden = false;
    if (idx < 0) return; // между репликами оставляем последнюю строку, не мигаем
    const cue = state.cues[idx];
    // Реплика под видео — те же кликабельные слова с фуриганой, что и в списке
    nowCueJp.innerHTML = '';
    buildTokensHtml(cue).forEach(s => nowCueJp.appendChild(s));
    nowCueRomaji.textContent = romajiForCue(cue);
    nowCueRu.textContent = cue.translation || '';
    nowCueRu.style.display = (cue.translation && state.showRu) ? '' : 'none';
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

video.addEventListener('timeupdate', () => {
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

    if (idx >= 0) {
        const el = transcriptList.querySelector(`.cue[data-index="${idx}"]`);
        if (el) {
            el.classList.add('cue--active');
            // Едем за репликой только пока пользователь не листает список сам
            if (state.followCue) scrollCueIntoView(el);
        }
        if (state.autoPause) {
            state.autoPauseAt = state.cues[idx].end + state.offset;
        }
    }
});

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

function setFollowCue(on) {
    state.followCue = on;
    jumpBtn.hidden = on;
    jumpBtn.classList.toggle('is-visible', !on);
    if (on) {
        const el = transcriptList.querySelector('.cue--active');
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
}, { passive: true });

jumpBtn.addEventListener('click', () => setFollowCue(true));

// ---------- Сдвиг сабов ----------

const offsetValue = document.getElementById('offset-value');

function updateOffsetLabel() {
    offsetValue.textContent = (state.offset >= 0 ? '+' : '') + state.offset.toFixed(1) + 's';
    localStorage.setItem(offsetStorageKey(), String(state.offset));
    state.activeCueIndex = -2; // перерисовать оверлей
}

document.getElementById('offset-minus').addEventListener('click', () => { state.offset -= 0.5; updateOffsetLabel(); });
document.getElementById('offset-plus').addEventListener('click', () => { state.offset += 0.5; updateOffsetLabel(); });
document.getElementById('offset-zero').addEventListener('click', () => { state.offset = 0; updateOffsetLabel(); });

// «Сейчас!» — текущая или ближайшая следующая реплика должна звучать в этот момент
document.getElementById('offset-sync').addEventListener('click', () => {
    if (!state.cues.length) return;
    const t = video.currentTime;
    let target = state.cues.find(c => c.start + state.offset >= t) || state.cues[state.cues.length - 1];
    state.offset = t - target.start;
    updateOffsetLabel();
    showSnackbar(t('subs.synced'), { duration: 2500 });
});

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

// あ — показать/скрыть фуригану (чтения над кандзи)
document.getElementById('furigana-toggle').addEventListener('click', () => {
    state.furigana = !state.furigana;
    localStorage.setItem('animei:furigana', state.furigana ? 'on' : 'off');
    applyFuriganaPref();
});

// Rōmaji — показать/скрыть транскрипцию латиницей
document.getElementById('romaji-toggle').addEventListener('click', () => {
    state.romaji = !state.romaji;
    localStorage.setItem('animei:romaji', state.romaji ? 'on' : 'off');
    applyRomajiPref();
});

// ---------- Хоткеи ----------

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    const currentCue = state.activeCueIndex >= 0 ? state.cues[state.activeCueIndex] : null;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            video.paused ? video.play() : video.pause();
            break;
        case 'KeyA': {
            // Повторить текущую (или последнюю прозвучавшую) реплику
            e.preventDefault();
            let cue = currentCue;
            if (!cue) {
                const t = video.currentTime;
                cue = [...state.cues].reverse().find(c => c.start + state.offset <= t);
            }
            if (cue) {
                video.currentTime = cue.start + state.offset + 0.01;
                if (state.autoPause) state.autoPauseAt = cue.end + state.offset;
                video.play().catch(() => {});
            }
            break;
        }
        case 'KeyS':
            e.preventDefault();
            toggleAutoPause();
            break;
        case 'KeyD': {
            e.preventDefault();
            const t = video.currentTime;
            const next = state.cues.find(c => c.start + state.offset > t + 0.05);
            if (next) {
                video.currentTime = next.start + state.offset + 0.01;
                if (state.autoPause) state.autoPauseAt = next.end + state.offset;
                video.play().catch(() => {});
            }
            break;
        }
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

// Узнаём один раз, настроен ли на сервере ИИ; если нет — кнопки разбора не будет
client.get('explain/status')
    .then(({ data: res }) => {
        state.aiAvailable = !!res?.data?.available;
        // Карточка уже открыта, а статус пришёл позже — показываем кнопку разбора сразу
        if (state.aiAvailable && !popup.hidden && popupExplain.hidden) popupExplainBtn.hidden = false;
    })
    .catch(() => {});

async function openWordPopup(tok, cue, event) {
    video.pause();

    state.popupContext = { tok, cue, dict: null, event };

    popupWord.textContent = tok.base;
    popupReading.textContent = tok.reading || '';
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
    popupExplainBtn.textContent = t('popup.explain');

    popup.hidden = false;
    positionPopup(event);

    try {
        const { data: res } = await client.get('dictionary', { params: { q: tok.base } });
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
            rd.textContent = b.reading && b.reading !== b.part ? ' ' + b.reading : '';
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

popupExplainBtn.addEventListener('click', async () => {
    const ctx = state.popupContext;
    if (!ctx) return;

    const sentence = ctx.cue.text;
    const cached = explainCache.get(sentence);
    if (cached) {
        renderExplain(cached);
        return;
    }

    popupExplainBtn.disabled = true;
    popupExplainBtn.textContent = t('popup.explaining');

    try {
        const { data: res } = await client.get('explain', {
            params: { sentence, context: cueContext(ctx.cue) },
            timeout: 60000,
        });
        const data = res.data.explanation;
        explainCache.set(sentence, data);
        // Пока ждали ответ, могли открыть другое слово той же реплики — это ок,
        // разбор относится к реплике, а не к слову
        if (!popup.hidden && state.popupContext?.cue.text === sentence) {
            renderExplain(data);
        }
    } catch (err) {
        console.error(err);
        const limited = err.response?.data?.reason === 'limited' || err.response?.status === 429;
        showSnackbar(limited ? t('popup.explainLimited') : t('popup.explainError'), { duration: 3500, type: 'error' });
        popupExplainBtn.disabled = false;
        popupExplainBtn.textContent = t('popup.explain');
    }
});

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

document.getElementById('popup-close').addEventListener('click', () => { popup.hidden = true; });

document.addEventListener('click', (e) => {
    if (!popup.hidden && !popup.contains(e.target) && !e.target.classList.contains('tok--learnable')) {
        popup.hidden = true;
    }
});

popupSave.addEventListener('click', async () => {
    const ctx = state.popupContext;
    if (!ctx) return;

    // Вход не требуется: гость — слово сохранится локально, вошедший — в аккаунт.
    popupSave.disabled = true;
    popupSave.textContent = t('popup.saving');

    try {
        const dict = ctx.dict;
        // Не больше двух значений — иначе перевод в карточке слишком длинный
        const translation = dict
            ? dict.senses.flatMap(s => s.definitions).slice(0, 2).join('; ')
            : '';

        await saveWord({
            kanji: ctx.tok.base,
            kana: dict?.reading || ctx.tok.reading || '',
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
        if (window.animeiTrack) window.animeiTrack('save_word', ctx.tok.base);
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
    } catch { /* нет слов — просто без подсветки */ }
}

// ---------- Ручной выбор субтитров ----------
// Авто-подбор ищет тайтл в архиве по названию и угадывает файл серии по номеру —
// иногда промахивается (не тот сезон/серия). Здесь можно выбрать файл руками.

const subsPicker = document.getElementById('subs-picker');
const subsPickerInput = document.getElementById('subs-picker-input');
const subsPickerList = document.getElementById('subs-picker-list');
let subsPickerTimer = null;
let subsPickerSeq = 0;   // защита от гонок: показываем только ответ на последний запрос
let subsPickerMode = 'shows';                 // 'shows' — верхнее поле ищет тайтл; 'files' — фильтрует файлы
let subsPickerCurrent = { show: null, files: [] };

function pickerStatus(key) {
    subsPickerList.innerHTML = `<div class="subs-picker__status">${t(key)}</div>`;
}

function openSubsPicker() {
    subsPicker.hidden = false;
    subsPickerMode = 'shows';
    subsPickerInput.placeholder = t('subs.picker.search');
    if (!subsPickerInput.value) subsPickerInput.value = titleRomaji || titleRu || '';
    subsPickerInput.focus();
    subsPickerInput.select();
    searchSubsShows(subsPickerInput.value.trim());
}

function closeSubsPicker() {
    subsPicker.hidden = true;
}

// Вернуться от списка файлов к поиску тайтла
function backToShows() {
    subsPickerMode = 'shows';
    subsPickerInput.placeholder = t('subs.picker.search');
    subsPickerInput.value = titleRomaji || titleRu || '';
    searchSubsShows(subsPickerInput.value.trim());
}

async function searchSubsShows(query) {
    subsPickerMode = 'shows';
    if (!query || query.length < 2) { pickerStatus('subs.picker.hint'); return; }
    const seq = ++subsPickerSeq;
    pickerStatus('subs.picker.searching');
    try {
        // Сначала jimaku (чистая разбивка по сезонам), при пустом ответе — kitsunekko
        let shows = [];
        try {
            const { data: jr } = await client.get('subtitles/jimaku/search', { params: { title: query } });
            shows = (jr.data || []).map((e) => ({ source: 'jimaku', id: e.id, title: e.title, sub: e.sub }));
        } catch { /* jimaku недоступен — идём в kitsunekko */ }

        if (!shows.length) {
            const { data: kr } = await client.get('subtitles/search', { params: { title: query } });
            shows = (kr.data || []).map((s) => ({ source: 'kitsunekko', dir: s.dir, title: s.title }));
        }

        if (seq !== subsPickerSeq) return;
        if (!shows.length) { pickerStatus('subs.picker.nothing'); return; }
        renderSubsShows(shows);
    } catch (err) {
        console.error(err);
        if (seq === subsPickerSeq) pickerStatus('subs.picker.error');
    }
}

function renderSubsShows(shows) {
    subsPickerList.innerHTML = '';
    for (const show of shows) {
        const item = document.createElement('div');
        item.className = 'subs-picker__item';
        const title = document.createElement('span');
        title.textContent = show.title;
        item.appendChild(title);
        if (show.sub) {
            const sub = document.createElement('span');
            sub.className = 'subs-picker__item-sub';
            sub.textContent = show.sub;
            item.appendChild(sub);
        }
        item.addEventListener('click', () => openSubsFiles(show));
        subsPickerList.appendChild(item);
    }
}

async function openSubsFiles(show) {
    const seq = ++subsPickerSeq;
    pickerStatus('subs.picker.loadingFiles');
    try {
        const req = show.source === 'jimaku'
            ? client.get('subtitles/jimaku/files', { params: { id: show.id } })
            : client.get('subtitles/files', { params: { dir: show.dir } });
        const { data: res } = await req;
        if (seq !== subsPickerSeq) return;
        const files = res.data || [];
        if (!files.length) { pickerStatus('subs.picker.noFiles'); return; }
        // Переходим в режим фильтра файлов: верхнее поле теперь сужает список
        // (у популярных тайтлов десятки-сотни файлов — иначе не найти нужную серию)
        subsPickerMode = 'files';
        subsPickerCurrent = { show, files };
        subsPickerInput.value = '';
        subsPickerInput.placeholder = t('subs.picker.filterFiles');
        subsPickerInput.focus();
        renderSubsFiles('');
    } catch (err) {
        console.error(err);
        if (seq === subsPickerSeq) pickerStatus('subs.picker.error');
    }
}

function renderSubsFiles(filter) {
    const { show, files } = subsPickerCurrent;
    subsPickerList.innerHTML = '';

    const back = document.createElement('div');
    back.className = 'subs-picker__item subs-picker__item--back';
    back.textContent = '← ' + show.title;
    back.addEventListener('click', backToShows);
    subsPickerList.appendChild(back);

    const q = (filter || '').toLowerCase();
    const shown = q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files;

    if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'subs-picker__status';
        empty.textContent = t('subs.picker.nothing');
        subsPickerList.appendChild(empty);
        return;
    }

    for (const file of shown) {
        const item = document.createElement('div');
        item.className = 'subs-picker__item';
        item.textContent = file.name;
        item.addEventListener('click', () => chooseSubsFile(file));
        subsPickerList.appendChild(item);
    }
}

function chooseSubsFile(file) {
    const src = subsPickerCurrent.show?.source;
    state.manualSubs = src === 'jimaku'
        ? { source: 'jimaku', url: file.url, name: file.name }
        : { source: 'kitsunekko', path: file.path, name: file.name };
    closeSubsPicker();
    loadSubtitles();   // грузим выбранный файл (episodeNumber игнорируется при manualSubs)
    showSnackbar(t('subs.picker.chosen'), { duration: 2500 });
}

subsFixBtn.addEventListener('click', openSubsPicker);
document.getElementById('subs-picker-close').addEventListener('click', closeSubsPicker);
subsPickerInput.addEventListener('input', () => {
    clearTimeout(subsPickerTimer);
    if (subsPickerMode === 'files') {
        // фильтр файлов — мгновенно, без запроса на сервер
        renderSubsFiles(subsPickerInput.value.trim());
    } else {
        subsPickerTimer = setTimeout(() => searchSubsShows(subsPickerInput.value.trim()), 400);
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !subsPicker.hidden) closeSubsPicker();
});

// ---------- Селекты ----------
// При смене серии/перевода авто-подбор снова в силе — сбрасываем ручной выбор
translationSelect.addEventListener('change', () => { state.manualSubs = null; selectTranslation(parseInt(translationSelect.value, 10)); });
episodeSelect.addEventListener('change', () => { state.manualSubs = null; selectEpisode(parseInt(episodeSelect.value, 10)); });
// Смена сезона: франшиза — переход на другой тайтл; группы — фильтр на клиенте
seasonSelect.addEventListener('change', () => {
    const idx = parseInt(seasonSelect.value, 10);
    if (state.seasonMode === 'franchise') {
        navigateToSeason(state.franchiseSeasons[idx]);
        return;
    }
    state.manualSubs = null;
    state.seasonIndex = idx;
    localStorage.setItem(seasonStorageKey(), String(idx));
    populateEpisodes(false);
});

// ---------- Свернуть блок настроек под видео (телефон) ----------
// На узком экране настройки+хоткеи отжимают субтитры далеко вниз. Прячем их
// за одну кнопку, чтобы список реплик умещался в экран сразу под видео.

const controlsToggle = document.getElementById('controls-toggle');
const playerMain = document.querySelector('.player-main');

function setControlsCollapsed(collapsed) {
    playerMain.classList.toggle('controls-collapsed', collapsed);
    controlsToggle.setAttribute('aria-expanded', String(!collapsed));
}

controlsToggle.addEventListener('click', () => {
    setControlsCollapsed(!playerMain.classList.contains('controls-collapsed'));
});
// По умолчанию настройки видны (в т.ч. на телефоне); свернуть можно кнопкой

applyFuriganaPref();
applyRomajiPref();
init();
