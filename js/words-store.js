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

// Попросить сервер нарезать клип из HLS и вернуть его как blob (для гостя).
// Ошибки не пробрасываем — без клипа слово всё равно сохранится.
async function requestClip(data) {
    const duration = Number(data.videoEnd) - Number(data.videoStart);
    if (!data.videoUrl || !(duration > 0)) return null;
    try {
        const { data: blob } = await client.post('words/clip', {
            url: data.videoUrl,
            start: data.videoStart,
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
    const word = { id: makeLocalId(), ...data };
    const words = getGuestWords();
    words.push(word);
    setGuestWords(words);

    // У гостя клип хранится в браузере. Ждём его, чтобы видео было готово
    // к первому показу карточки, но неудача клипа не ломает сохранение слова.
    if (typeof putClip === 'function') {
        const blob = await requestClip(data);
        if (blob) await putClip(word.id, blob);
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

// Перенести локальные слова гостя в только что вошедший аккаунт.
// Вызывать сразу после успешного входа/регистрации (токены уже сохранены).
async function syncGuestWordsToAccount() {
    const words = getGuestWords();
    if (!words.length) return;

    for (const w of words) {
        // id локальный — на сервер не отправляем, там свой сгенерится.
        const { id, ...payload } = w;
        try {
            // videoUrl гостя (ссылка на HLS) уже протухла — сервер не переклипует,
            // поэтому заливаем сам сохранённый в браузере blob отдельным запросом.
            const { data: res } = await client.post('words', normalizeWord({ ...payload, videoUrl: '' }));
            const saved = res?.data ?? res;

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
            if (typeof deleteClip === 'function') await deleteClip(id);
        } catch (err) {
            console.error('Не удалось перенести слово в аккаунт:', err);
        }
    }

    setGuestWords([]);
}
