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
    try {
        return JSON.parse(localStorage.getItem(GUEST_WORDS_KEY) || '[]');
    } catch {
        return [];
    }
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
    if (isSignedIn()) {
        // Клип режет и хранит сервер (см. POST /words) — videoUrl уходит туда.
        const { data: res } = await client.post('words', data);
        return res?.data ?? res;
    }
    // Клип режем с запасом ±CLIP_MARGIN, а окно воспроизведения (trimStart/End)
    // указывает на само слово внутри клипа — его границы можно двигать ±1с.
    const wordDur = Number(data.videoEnd) - Number(data.videoStart);
    const lead = wordDur > 0 ? Math.min(CLIP_MARGIN, Number(data.videoStart)) : 0;
    const word = {
        id: makeLocalId(),
        ...data,
        trimStart: wordDur > 0 ? lead : null,
        trimEnd: wordDur > 0 ? lead + wordDur : null,
    };
    const words = getGuestWords();
    words.push(word);
    setGuestWords(words);

    // У гостя клип хранится в браузере. Ждём его, чтобы видео было готово
    // к первому показу карточки, но неудача клипа не ломает сохранение слова.
    // Если клип ожидался, но не получился — мягко предупреждаем (слово-то есть).
    if (typeof putClip === 'function' && wordDur > 0) {
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

// Получить все слова пользователя (серверная форма).
async function fetchWords() {
    if (isSignedIn()) {
        const { data: res } = await client.get('words');
        return res.data ?? [];
    }
    return getGuestWords();
}

async function deleteWord(id) {
    if (isSignedIn()) {
        await client.delete('words/' + id);
        return;
    }
    setGuestWords(getGuestWords().filter((w) => w.id !== id));
    if (typeof deleteClip === 'function') deleteClip(id);
}

async function updateWord(id, patch) {
    if (isSignedIn()) {
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
        return;
    }
    if (typeof deleteAudio === 'function') await deleteAudio(word.id);
}

async function getWordAudioUrl(word) {
    if (word && word.audio) return word.audio;
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

    for (const w of words) {
        // id локальный — на сервер не отправляем, там свой сгенерится.
        const { id, ...payload } = w;
        try {
            // videoUrl гостя (ссылка на HLS) уже протухла — сервер не переклипует,
            // поэтому заливаем сам сохранённый в браузере blob отдельным запросом.
            // trimStart/trimEnd передаём явно, чтобы окно клипа не сбросилось.
            const { data: res } = await client.post('words', {
                ...normalizeWord({ ...payload, videoUrl: '' }),
                ...(Number.isFinite(w.trimStart) ? { trimStart: w.trimStart } : {}),
                ...(Number.isFinite(w.trimEnd) ? { trimEnd: w.trimEnd } : {}),
            });
            const saved = res?.data ?? res;
            if (saved?.id) idMap[id] = saved.id;

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
            if (saved?.id && typeof getAudio === 'function') {
                const audioBlob = await getAudio(id);
                if (audioBlob) {
                    const form = new FormData();
                    form.append('audio', audioBlob, 'audio.' + audioBlobExt(audioBlob));
                    await client.post(`words/${saved.id}/audio`, form, {
                        headers: { 'Content-Type': undefined },
                    }).catch(() => {});
                }
            }
            if (typeof deleteClip === 'function') await deleteClip(id);
            if (typeof deleteAudio === 'function') await deleteAudio(id);
        } catch (err) {
            console.error('Не удалось перенести слово в аккаунт:', err);
        }
    }

    // Переносим членство в колодах со старых локальных id на новые серверные.
    if (typeof window !== 'undefined' && window.Decks) window.Decks.remapIds(idMap);

    setGuestWords([]);
}
