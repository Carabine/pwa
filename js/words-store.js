// Единое хранилище слов.
// Гость (не вошёл) — слова лежат локально в браузере (localStorage).
// Вошедший — слова хранятся на сервере, в его аккаунте.
// Когда гость входит или регистрируется, его локальные слова
// автоматически переносятся в аккаунт (см. syncGuestWordsToAccount).
//
// Зависит от axiosClient.js: client, isLoggedIn. Поэтому подключается ПОСЛЕ него.

const GUEST_WORDS_KEY = 'animei:guestWords';

function isSignedIn() {
    return typeof isLoggedIn === 'function' && isLoggedIn();
}

function getGuestWords() {
    return lsJson(GUEST_WORDS_KEY, []);
}

function setGuestWords(words) {
    localStorage.setItem(GUEST_WORDS_KEY, JSON.stringify(words));
}

// Локальный id для гостевого слова (чтобы можно было удалять/редактировать).
function makeLocalId() {
    return 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Приводим слово к полной серверной форме: в БД все поля обязательные
// (строки и videoStart/videoEnd — Int), поэтому проставляем дефолты.
function normalizeWord(payload) {
    return {
        // Изучаемый язык записи (см. LearnLang в settings.js). Японская
        // письменность — всегда ja, даже если включён английский режим.
        // Уже помеченную запись (перенос гостя в аккаунт, импорт) не
        // перекрашиваем под текущий режим — иначе английское слово гостя
        // становилось японским при входе в японском режиме.
        lang: (payload.lang === 'en' || payload.lang === 'ja') ? payload.lang
            : (window.LearnLang ? LearnLang.tagFor(payload.kanji) : 'ja'),
        kanji: payload.kanji ?? '',
        kana: payload.kana ?? '',
        romaji: payload.romaji ?? '',
        translation: payload.translation ?? '',
        sentence: payload.sentence ?? '',
        sentenceTranslation: payload.sentenceTranslation ?? '',
        hint: payload.hint ?? '',
        videoStart: payload.videoStart ?? 0,
        videoEnd: payload.videoEnd ?? 0,
        videoUrl: payload.videoUrl ?? '',
        ...(payload.trimStart !== null && payload.trimStart !== '' && Number.isFinite(Number(payload.trimStart))
            ? { trimStart: Number(payload.trimStart) } : {}),
        ...(payload.trimEnd !== null && payload.trimEnd !== '' && Number.isFinite(Number(payload.trimEnd))
            ? { trimEnd: Number(payload.trimEnd) } : {}),
    };
}

// Запас с каждой стороны клипа: режем шире реального слова, чтобы потом можно
// было «добавить» секунды к началу/концу (см. редактор длины в study-core).
const CLIP_MARGIN = 2;

// Попросить сервер нарезать клип из HLS и вернуть его как blob (для гостя).
// С pad=true режем с запасом ±CLIP_MARGIN секунд. Ошибки не пробрасываем —
// без клипа слово всё равно сохранится.
async function requestClip(data, pad) {
    const wordDur = Number(data.videoEnd) - Number(data.videoStart);
    if (!data.videoUrl || !(wordDur > 0)) return null;
    const lead = pad ? Math.min(CLIP_MARGIN, Number(data.videoStart)) : 0;
    const start = Math.max(0, Number(data.videoStart) - lead);
    const duration = Math.min(wordDur + lead + (pad ? CLIP_MARGIN : 0), 30);
    try {
        const { data: blob } = await client.post('words/clip', {
            url: data.videoUrl,
            start,
            duration,
        }, { responseType: 'blob' });
        return blob instanceof Blob && blob.size ? blob : null;
    } catch (err) {
        console.warn('Не удалось получить видеоклип:', err);
        return null;
    }
}

// Сохранить слово. payload — в серверной форме:
// { kanji, kana, romaji, translation, sentence, sentenceTranslation, hint, videoStart, videoEnd, videoUrl }
async function saveWord(payload) {
    const data = normalizeWord(payload);
    // Дедупликация у гостя: одно слово — одна карточка. Повторное сохранение
    // возвращает уже существующую (у вошедшего то же самое делает бэкенд).
    if (!isSignedIn() && data.kanji) {
        const existing = getGuestWords().find((w) => w && w.kanji === data.kanji);
        if (existing) return existing;
    }
    if (isSignedIn()) {
        // Клип режет и хранит сервер (см. POST /words) — videoUrl уходит туда.
        // uiLang — язык ИИ-разбора: сервер сразу считает разбор реплики в фоне.
        const { data: res } = await client.post('words', { ...data, uiLang: explainLang() });
        const saved = res?.data ?? res;
        // Офлайн-копии пополняем сразу, не задерживая ответ: слово — в кэш
        // списка, клип — в IndexedDB, как только сервер его дорежет.
        rememberWordInCache(saved);
        warmSavedWordOffline(saved);
        return saved;
    }
    // Клип режем с запасом ±CLIP_MARGIN, а окно воспроизведения (trimStart/End)
    // указывает на само слово внутри клипа — его границы можно двигать ±1с.
    const wordDur = Number(data.videoEnd) - Number(data.videoStart);
    const lead = wordDur > 0 ? Math.min(CLIP_MARGIN, Number(data.videoStart)) : 0;
    // Готовый общий клип (стартовая колода) — не режем, а ссылаемся напрямую:
    // ТОЛЬКО наши статичные mp4 (/storage/... или /app/media/starter/...).
    // Раньше «общим» считалась ЛЮБАЯ абсолютная ссылка, а state.currentVideoUrl
    // плеера абсолютный — гостевые слова из плеера оставались с HLS-манифестом
    // вместо нарезанного клипа (манифест в <video> не играет и протухает).
    const sharedUrl = (() => {
        const s = String(data.videoUrl || '');
        if (!/^https?:\/\//.test(s)) return '';
        try {
            return /^\/(?:storage|app\/media\/starter)\/[\w.-]+\.mp4$/.test(new URL(s).pathname) ? s : '';
        } catch { return ''; }
    })();
    const word = {
        id: makeLocalId(),
        // Дата сохранения нужна «Моему прогрессу» (график пополнения словаря):
        // у вошедшего её проставляет сервер, у гостя проставить некому.
        createdAt: new Date().toISOString(),
        ...data,
        ...(sharedUrl ? { video: sharedUrl } : {}),
        trimStart: Number.isFinite(data.trimStart) ? data.trimStart : (wordDur > 0 ? lead : null),
        // +0.35с хвоста, как на сервере: тайминг реплики в сабах часто
        // кончается на последнем слоге, окно резало его (запас в клипе есть).
        trimEnd: Number.isFinite(data.trimEnd) ? data.trimEnd : (wordDur > 0 ? lead + wordDur + 0.35 : null),
    };
    const words = getGuestWords();
    words.push(word);
    setGuestWords(words);
    warmGuestExplain(word);

    // У гостя клип хранится в браузере. Ждём его, чтобы видео было готово
    // к первому показу карточки, но неудача клипа не ломает сохранение слова.
    // Если клип ожидался, но не получился — мягко предупреждаем (слово-то есть).
    if (!sharedUrl && typeof putClip === 'function' && wordDur > 0) {
        const blob = await requestClip(data, true);
        const stored = blob ? await putClip(word.id, blob) : false;
        if (!stored && typeof showSnackbar === 'function') {
            showSnackbar(
                typeof t === 'function' ? t('words.clipFailed') : 'Слово сохранено, но видео не удалось нарезать',
                { duration: 3500, type: 'error' },
            );
        }
    }
    return word;
}

// ---------- ИИ-разбор сразу при сохранении ----------
// Разбор реплики считается десятки секунд — пусть он будет готов к первому
// открытию карточки. Язык разбора = язык интерфейса, как в самой карточке
// (studyRunExplain в study-core.js): иначе ключ кэша не совпадёт.
function explainLang() {
    return typeof getLang === 'function' ? getLang() : 'ru';
}

// У вошедшего разбор считает сервер (POST /words). Гостевое слово сервер не
// видит — шлём тот же запрос, что пошлёт карточка, и ответ не ждём: он ляжет
// в серверный кэш разборов.
function warmGuestExplain(word) {
    if (!word || !word.sentence || !word.kanji || typeof client === 'undefined') return;
    // С загрузчиком (js/downloads.js) разбор ещё и ляжет на устройство — для офлайна.
    if (window.AnimeiDownloads) { AnimeiDownloads.computeExplain(word); return; }
    const params = { sentence: word.sentence, lang: explainLang(), word: word.kanji };
    if (word.lang === 'en') params.target = 'en';
    client.get('explain', { params, timeout: 90000, silentErrors: true }).catch(() => { /* не вышло — карточка спросит сама */ });
}

// Получить все слова пользователя (серверная форма).
// У вошедшего последний успешный список кешируется: без сети (метро/самолёт)
// учёба и словарь работают по нему, а клипы — из IndexedDB (см. study-core).
const WORDS_CACHE_KEY = 'animei:wordsCache';

// ---------- Офлайн-копии только что сохранённого слова ----------
// У вошедшего клип режется на сервере ФОНОМ, а в браузер попадает только когда
// карточку показали (докеширование в study-core). Поэтому «сохранил слово в
// плеере → выключил сеть → сел учить» давало карточку без видео, а самого слова
// не было и в списке: WORDS_CACHE_KEY обновляется только в fetchWords. Здесь
// дописываем слово в кэш и, дождавшись нарезки, тянем клип в IndexedDB.

// Паузы между опросами готовности клипа (мс). Нарезка занимает секунды, но на
// длинном эпизоде и медленном источнике доходит до полуминуты — дальше ждать
// незачем: клип придёт обычным путём, при показе карточки.
const CLIP_WAIT_DELAYS = [2000, 3000, 5000, 8000, 12000, 20000];

function serverClipUrl(word) {
    return (word && (word.Video ? word.Video.url : word.video)) || '';
}

// Заменить (или добавить) слово в офлайн-копии списка. Копии ещё нет — не
// создаём её из одного слова: соберёт fetchWords, когда список загрузится.
function rememberWordInCache(word) {
    if (!word || !word.id) return;
    const cached = lsJson(WORDS_CACHE_KEY);
    if (!Array.isArray(cached)) return;
    const idx = cached.findIndex((w) => w && w.id === word.id);
    if (idx >= 0) cached[idx] = { ...cached[idx], ...word };
    else cached.push(word);
    try { localStorage.setItem(WORDS_CACHE_KEY, JSON.stringify(cached)); }
    catch { /* тесно в localStorage — не страшно */ }
}

// Прогревы идут по одному и в порядке сохранения: колода серии создаёт слова
// пачкой, и десяток параллельных опросов с качками отобрал бы канал у того, что
// человек делает прямо сейчас. Длину очереди ограничиваем — при массовом
// импорте остальные клипы приедут обычным путём, префетчем в учёбе.
const CLIP_WARM_QUEUE_LIMIT = 30;
let clipWarmQueue = Promise.resolve();
let clipWarmPending = 0;

function warmSavedWordOffline(word) {
    if (clipWarmPending >= CLIP_WARM_QUEUE_LIMIT) return;
    clipWarmPending++;
    clipWarmQueue = clipWarmQueue
        .then(() => warmClipToStore(word))
        .catch(() => {})
        .finally(() => { clipWarmPending--; });
}

// Дождаться серверной нарезки и утащить клип в браузер. Ничего не пробрасывает
// и никого не ждёт: слово уже сохранено, это фоновая подстраховка на офлайн.
async function warmClipToStore(word) {
    if (!word || !word.id || typeof cacheMediaFromUrl !== 'function') return;
    // «Экономия трафика» — вперёд не забегаем, ровно как префетч в study-core.
    const conn = navigator.connection;
    if (conn && conn.saveData) return;

    const label = word.kanji || word.kana || '';
    // Разбор сервер начал считать при сохранении — заберём готовый, когда
    // досчитает (js/downloads.js, пачкой и без обращения к ИИ).
    if (window.AnimeiDownloads) AnimeiDownloads.wantExplains([word], 15000);

    let url = serverClipUrl(word);          // общий клип колоды — готов сразу
    if (!url && Number(word.videoEnd) > Number(word.videoStart)) {
        // Пока сервер режет — в окне загрузок «режется на сервере…».
        const task = window.AnimeiDownloads
            ? AnimeiDownloads.track('clip:' + word.id, { kind: 'clip', label }) : null;
        if (task) task.set('waiting');
        for (const delay of CLIP_WAIT_DELAYS) {
            await sleep(delay);
            try {
                const { data: res } = await client.get(`words/${word.id}/clip`);
                url = (res && res.data && res.data.url) || '';
            } catch {                       // нет сети или слово удалили — ждать нечего
                if (task) task.done(false, 'later');
                return;
            }
            if (url) break;
        }
        // Не дорезался за ~50 с — скачается докачкой при следующем запуске.
        if (!url && task) task.done(false, 'later');
    }
    if (!url) return;
    // В кэше списка слово лежит без клипа (ответ POST /words его ещё не знал) —
    // иначе офлайн-карточка не поняла бы, что видео у неё есть.
    rememberWordInCache({ id: word.id, Video: { url } });
    await cacheMediaFromUrl('clip', word.id, url, { label });
}

async function fetchWords() {
    if (isSignedIn()) {
        try {
            const { data: res } = await client.get('words');
            const words = res.data ?? [];
            try { localStorage.setItem(WORDS_CACHE_KEY, JSON.stringify(words)); } catch { /* тесно в localStorage — не страшно */ }
            return words;
        } catch (err) {
            const cached = lsJson(WORDS_CACHE_KEY);
            if (Array.isArray(cached)) {
                console.warn('Слова с сервера не загрузились — работаем по локальной копии');
                return cached;
            }
            throw err;
        }
    }
    return getGuestWords();
}

async function deleteWord(id) {
    if (isSignedIn()) {
        await client.delete('words/' + id);
        // Локальные офлайн-копии клипа/звука больше не нужны.
        if (typeof deleteClip === 'function') deleteClip(id);
        if (typeof deleteAudio === 'function') deleteAudio(id);
        return;
    }
    setGuestWords(getGuestWords().filter((w) => w.id !== id));
    if (typeof deleteClip === 'function') deleteClip(id);
}

async function updateWord(id, patch) {
    if (isSignedIn()) {
        // Через исходящий ящик (axiosClient.js): правка сначала ложится в
        // localStorage, потом уходит на сервер. Без него правки, сделанные при
        // обрыве связи, пропадали молча — интерфейс показывал новое значение, а
        // при следующей загрузке возвращалось старое серверное (ловили на окне
        // клипа: clip-trim зовёт updateWord вообще без await).
        if (typeof queueWordPatch === 'function') {
            queueWordPatch(id, patch);
            await flushWordPatches();
            return;
        }
        await client.patch('words/' + id, patch);
        return;
    }
    setGuestWords(getGuestWords().map((w) => (w.id === id ? { ...w, ...patch } : w)));
}

// ---------- Свой звук карточки ----------
// У вошедшего звук хранится на сервере (Word.audio) и доступен с любого
// устройства; у гостя — в браузере (IndexedDB, video-store.js). Возвращает URL
// для проигрывания (или '').
function audioBlobExt(blob) {
    const t = (blob && blob.type) || '';
    if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
    if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
    if (t.includes('ogg')) return 'ogg';
    if (t.includes('wav')) return 'wav';
    return 'webm';
}

async function setWordAudio(word, blob) {
    if (!blob || !blob.size) return '';
    if (isSignedIn()) {
        const form = new FormData();
        form.append('audio', blob, 'audio.' + audioBlobExt(blob));
        // Content-Type: undefined — чтобы браузер сам выставил multipart с boundary.
        const { data: res } = await client.post(`words/${word.id}/audio`, form, {
            headers: { 'Content-Type': undefined },
        });
        word.audio = (res && res.data && res.data.url) || '';
        // Обновляем офлайн-копию — иначе из кеша играл бы старый звук.
        if (typeof putAudio === 'function') putAudio(word.id, blob);
        return word.audio;
    }
    if (typeof putAudio === 'function' && await putAudio(word.id, blob)) {
        return typeof getAudioUrl === 'function' ? await getAudioUrl(word.id) : '';
    }
    return '';
}

async function clearWordAudio(word) {
    if (isSignedIn()) {
        try { await client.delete(`words/${word.id}/audio`); }
        catch (err) { console.warn('Не удалось удалить звук:', err); }
        word.audio = '';
        if (typeof deleteAudio === 'function') await deleteAudio(word.id);
        return;
    }
    if (typeof deleteAudio === 'function') await deleteAudio(word.id);
}

async function getWordAudioUrl(word) {
    if (word && word.audio) {
        // Сначала офлайн-копия из IndexedDB; сети нет — звук всё равно играет.
        // Нет копии — отдаём серверный URL и фоном докешируем.
        if (word.id && typeof getAudio === 'function') {
            const blob = await getAudio(word.id);
            if (blob) return URL.createObjectURL(blob);
            if (typeof cacheMediaFromUrl === 'function') cacheMediaFromUrl('audio', word.id, word.audio);
        }
        return word.audio;
    }
    if (word && word.id && typeof getAudioUrl === 'function') return await getAudioUrl(word.id);
    return '';
}

// Перенести локальные слова гостя в только что вошедший аккаунт.
// Вызывать сразу после успешного входа/регистрации (токены уже сохранены).
// single-flight: два параллельных вызова (напр. двойной сабмит формы входа)
// прочитали бы один и тот же localStorage и создали дубли слов / погонялись за
// удалением медиа. Повторный вызов возвращает уже идущий промис.
let guestSyncInFlight = null;
function syncGuestWordsToAccount() {
    if (guestSyncInFlight) return guestSyncInFlight;
    guestSyncInFlight = runGuestSync().finally(() => { guestSyncInFlight = null; });
    return guestSyncInFlight;
}

async function runGuestSync() {
    const words = getGuestWords();
    if (!words.length) return;

    // Слова пересоздаются на сервере с новыми id — запоминаем old→new, чтобы
    // потом перенести на них членство в локальных колодах (иначе колоды опустеют).
    const idMap = {};
    // Слова, которые перенести НЕ удалось (сеть/сервер): остаются в гостевом
    // хранилище до следующей попытки. Раньше список очищался целиком — при
    // частично упавшем переносе слова терялись безвозвратно.
    const failed = [];

    for (const w of words) {
        // id локальный — на сервер не отправляем, там свой сгенерится.
        const { id, ...payload } = w;
        try {
            // videoUrl гостя (ссылка на HLS) уже протухла — сервер не переклипует,
            // поэтому заливаем сам сохранённый в браузере blob отдельным запросом.
            // Исключение: общий готовый клип (w.video = абсолютный /storage/*.mp4) —
            // его сохраняем как videoUrl, чтобы серверная карточка тоже на него
            // сослалась (blob'а у такой карточки нет). trimStart/trimEnd передаём явно.
            const sharedUrl = String(w.video || '');
            const { data: res } = await client.post('words', {
                ...normalizeWord({ ...payload, videoUrl: sharedUrl }),
                ...(Number.isFinite(w.trimStart) ? { trimStart: w.trimStart } : {}),
                ...(Number.isFinite(w.trimEnd) ? { trimEnd: w.trimEnd } : {}),
            });
            const saved = res?.data ?? res;
            if (saved?.id) idMap[id] = saved.id;

            // Заморозку переносим отдельным PATCH: POST /words её не принимает —
            // это состояние карточки, а не её содержимое. Не вышло — слово всё
            // равно в аккаунте, просто «оттаяло».
            if (saved?.id && w.frozen) {
                await client.patch('words/' + saved.id, { frozen: true }).catch(() => {});
            }

            if (saved?.id && typeof getClip === 'function') {
                const blob = await getClip(id);
                if (blob) {
                    const form = new FormData();
                    form.append('clip', blob, 'clip.mp4');
                    // Сбрасываем дефолтный application/json, чтобы браузер сам
                    // выставил multipart/form-data с boundary — иначе multer не
                    // разберёт файл.
                    await client.post(`words/${saved.id}/video`, form, {
                        headers: { 'Content-Type': undefined },
                    });
                }
            }
            // Свой звук гостя тоже переносим в аккаунт.
            let audioMoved = true;
            if (saved?.id && typeof getAudio === 'function') {
                const audioBlob = await getAudio(id);
                if (audioBlob) {
                    const form = new FormData();
                    form.append('audio', audioBlob, 'audio.' + audioBlobExt(audioBlob));
                    audioMoved = await client.post(`words/${saved.id}/audio`, form, {
                        headers: { 'Content-Type': undefined },
                    }).then(() => true).catch(() => false);
                }
            }
            if (typeof deleteClip === 'function') await deleteClip(id);
            // Локальную запись стираем ТОЛЬКО если она реально уехала в аккаунт.
            // Раньше ошибка загрузки проглатывалась, а blob всё равно удалялся —
            // единственная копия своего звука пропадала молча.
            if (audioMoved && typeof deleteAudio === 'function') await deleteAudio(id);
        } catch (err) {
            console.error('Не удалось перенести слово в аккаунт:', err);
            failed.push(w);
        }
    }

    // Переносим членство в колодах со старых локальных id на новые серверные.
    if (typeof window !== 'undefined' && window.Decks) window.Decks.remapIds(idMap);

    // Очищаем только перенесённое; упавшие слова ждут следующего вызова синка.
    setGuestWords(failed);
    if (failed.length && typeof showSnackbar === 'function') {
        showSnackbar(
            typeof t === 'function' ? t('words.syncPartial') : 'Часть слов не перенеслась — они сохранены локально',
            { duration: 4000, type: 'error' },
        );
    }
}

// ---------- Короткий перевод для карточки ----------

// Ключ сравнения значений. Гугл переводит каждый английский глосс отдельно и
// капитализирует его как начало предложения, поэтому «window» и «window (of a
// computer)» превращаются в «окно» и «Окно» — для человека это одно значение.
// Регистр, ё/е, скобочные уточнения и пунктуацию из сравнения убираем.
function glossKey(text) {
    return String(text)
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/^(?:to|чтобы|щоб|быть|бути)\s+/, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

// Одно значение поглощает другое, если целиком содержит его слова:
// «уйти» и «уйти назад» в карточке — по сути один и тот же перевод.
function glossCovers(a, b) {
    return ` ${a} `.includes(` ${b} `);
}

// Короткий перевод для карточки: самые «очевидные» значения словарной статьи.
// jisho иногда ставит первым формальный вариант со скобочным уточнением (у 戦う
// это «to make war (on)», а простое «to fight» — в хвосте), поэтому сначала
// берём определения БЕЗ скобок (сохраняя порядок jisho), затем — уточнённые со
// снятыми скобками. Реверсить весь список нельзя: для большинства слов порядок
// jisho верный. Из похожих вариантов оставляем только первый — второй «окно»
// после «окно» ничего не объясняет, а карточку удлиняет.
function shortTranslation(dict, limit = 2) {
    if (!dict || !dict.senses) return '';
    const all = dict.senses.flatMap((s) => s.definitions || []);
    // Скобки бывают двух сортов, и это решает порядок. Короткая скобка —
    // управление глагола: «вести войну (на)», без предлога вариант неполный и
    // обычно формальный, такие уводим в хвост. Длинная — пояснение к готовому
    // переводу: «прийти (пространственно или во времени)», сам перевод здесь
    // главный, и терять его нельзя (у 来る из-за этого первым значением
    // оказывалось «подойти» вместо «прийти»).
    const parenWords = (d) => {
        const m = /\(([^)]*)\)/.exec(d);
        return m ? m[1].trim().split(/\s+/).filter(Boolean).length : 0;
    };
    const strip = (d) => d.replace(/\s*\([^)]*\)/g, '').trim();
    const clean = all.filter((d) => parenWords(d) === 0 || parenWords(d) >= 3).map(strip);
    const qualified = all.filter((d) => { const n = parenWords(d); return n > 0 && n < 3; }).map(strip);

    const picked = [];
    const keys = [];
    for (const def of [...clean, ...qualified]) {
        const text = String(def || '').trim();
        const key = glossKey(text);
        if (!key) continue;
        if (keys.some((k) => glossCovers(k, key) || glossCovers(key, k))) continue;
        picked.push(text);
        keys.push(key);
        if (picked.length >= limit) break;
    }
    return picked.join('; ');
}
