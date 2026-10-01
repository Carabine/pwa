// Клипы гостя — короткие видеофрагменты к словам. У незалогиненного
// пользователя нет места на сервере, поэтому клипы лежат в IndexedDB браузера
// (blob по ключу = id слова). При входе они заливаются в аккаунт
// (см. syncGuestWordsToAccount в words-store.js).
//
// Подключать ПЕРЕД words-store.js и study-core.js — они зовут getClip/putClip.

const CLIP_DB = 'animei-media';
const CLIP_STORE = 'clips';
// Свой звук для карточки слова (пользователь загрузил или записал) — отдельное
// хранилище, ключ = id слова. Версия БД поднята с 1 до 2, чтобы добавить его.
const AUDIO_STORE = 'audios';
// ИИ-разборы реплик для офлайна (версия 3). Ключ — explainKey(): тот же, что у
// кэша разборов в карточке, значение — { explanation, at }.
const EXPLAIN_STORE = 'explains';

function openClipDB() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB недоступен'));
            return;
        }
        const req = indexedDB.open(CLIP_DB, 3);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(CLIP_STORE)) db.createObjectStore(CLIP_STORE);
            if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE);
            if (!db.objectStoreNames.contains(EXPLAIN_STORE)) db.createObjectStore(EXPLAIN_STORE);
        };
        req.onsuccess = () => {
            const db = req.result;
            // Другая вкладка поднимает версию БД — отпускаем соединение, иначе
            // её обновление ждало бы закрытия этой вкладки.
            db.onversionchange = () => db.close();
            resolve(db);
        };
        req.onerror = () => reject(req.error);
        // Старая вкладка держит БД прежней версии: не висим молча — карточка
        // возьмёт видео из сети, а обновление пройдёт, когда вкладку закроют.
        req.onblocked = () => reject(new Error('IndexedDB занята другой вкладкой'));
    });
}

// Сохранить клип слова. Возвращает true/false, ошибки не пробрасывает —
// клип не должен ломать сохранение самого слова.
async function putClip(id, blob) {
    try {
        const db = await openClipDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(CLIP_STORE, 'readwrite');
            tx.objectStore(CLIP_STORE).put(blob, id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('Не удалось сохранить клип:', err);
        return false;
    }
}

// Достать blob клипа по id слова (или null).
async function getClip(id) {
    try {
        const db = await openClipDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(CLIP_STORE, 'readonly');
            const req = tx.objectStore(CLIP_STORE).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null;
    }
}

// Готовый objectURL для <video src> (или null). Отзывать через URL.revokeObjectURL
// вызывающему не обязательно — живёт до перезагрузки страницы.
async function getClipUrl(id) {
    const blob = await getClip(id);
    return blob ? URL.createObjectURL(blob) : null;
}

async function deleteClip(id) {
    try {
        const db = await openClipDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(CLIP_STORE, 'readwrite');
            tx.objectStore(CLIP_STORE).delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch { /* нечего удалять — и ладно */ }
}

// ---------- Свой звук карточки слова ----------
// Тот же приём, что и с клипами: blob по ключу = id слова. Пока хранится только
// в браузере (у гостя и у вошедшего одинаково — на сервере поля для звука нет),
// поэтому между устройствами не переносится. Ошибки не пробрасываем.

async function putAudio(id, blob) {
    try {
        const db = await openClipDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(AUDIO_STORE, 'readwrite');
            tx.objectStore(AUDIO_STORE).put(blob, id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('Не удалось сохранить звук карточки:', err);
        return false;
    }
}

async function getAudio(id) {
    try {
        const db = await openClipDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(AUDIO_STORE, 'readonly');
            const req = tx.objectStore(AUDIO_STORE).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null;
    }
}

// objectURL для <audio src> (или null). Живёт до перезагрузки страницы.
async function getAudioUrl(id) {
    const blob = await getAudio(id);
    return blob ? URL.createObjectURL(blob) : null;
}

async function deleteAudio(id) {
    try {
        const db = await openClipDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(AUDIO_STORE, 'readwrite');
            tx.objectStore(AUDIO_STORE).delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch { /* нечего удалять — и ладно */ }
}

// ---------- ИИ-разборы для офлайна ----------
// Ключ разбора: изучаемый язык | язык разбора | слово | реплика — как у кэша в
// карточке (studyRunExplain) и как считает сервер (язык разбора = язык меню).
function explainKey(sentence, word, lang, target) {
    return (target === 'en' ? 'en' : 'ja') + '|' + (lang || 'ru') + '|' + (word || '') + '|' + (sentence || '');
}

async function putExplain(key, explanation) {
    if (!key || !explanation) return false;
    try {
        const db = await openClipDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(EXPLAIN_STORE, 'readwrite');
            tx.objectStore(EXPLAIN_STORE).put({ explanation, at: Date.now() }, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        return false;
    }
}

async function getExplain(key) {
    try {
        const db = await openClipDB();
        const rec = await new Promise((resolve, reject) => {
            const tx = db.transaction(EXPLAIN_STORE, 'readonly');
            const req = tx.objectStore(EXPLAIN_STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        return rec ? rec.explanation : null;
    } catch {
        return null;
    }
}

// Есть ли запись (без чтения blob'а — клип может весить мегабайты).
async function hasMedia(store, key) {
    try {
        const db = await openClipDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readonly');
            const req = tx.objectStore(store).count(key);
            req.onsuccess = () => resolve(req.result > 0);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return false;
    }
}
const hasClip = (id) => hasMedia(CLIP_STORE, id);
const hasExplain = (key) => hasMedia(EXPLAIN_STORE, key);

// Сколько всего лежит на устройстве: { clips, explains } — для окна загрузок.
async function countMedia() {
    try {
        const db = await openClipDB();
        const count = (store) => new Promise((resolve) => {
            const req = db.transaction(store, 'readonly').objectStore(store).count();
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => resolve(0);
        });
        return { clips: await count(CLIP_STORE), explains: await count(EXPLAIN_STORE) };
    } catch {
        return { clips: 0, explains: 0 };
    }
}

// Все ключи разом: { clips, audios, explains } — наборы. Для «Загрузить всё»
// в настройках: проверять сотни слов по одному — сотни открытий БД.
async function mediaKeys() {
    const empty = { clips: new Set(), audios: new Set(), explains: new Set() };
    try {
        const db = await openClipDB();
        return await new Promise((resolve) => {
            const tx = db.transaction([CLIP_STORE, AUDIO_STORE, EXPLAIN_STORE], 'readonly');
            const out = { ...empty };
            const grab = (store, name) => {
                const req = tx.objectStore(store).getAllKeys();
                req.onsuccess = () => { out[name] = new Set(req.result.map(String)); };
            };
            grab(CLIP_STORE, 'clips');
            grab(AUDIO_STORE, 'audios');
            grab(EXPLAIN_STORE, 'explains');
            tx.oncomplete = () => resolve(out);
            tx.onerror = () => resolve(empty);
        });
    } catch {
        return empty;
    }
}

// Смена аккаунта: клипы, звук и разборы прошлого аккаунта с устройства убираем.
// Гостевые (ключ local-*) не трогаем — их при входе переносит в аккаунт
// syncGuestWordsToAccount. Выход ставит флаг animei:mediaPurge
// (clearAccountScopedState в axiosClient.js) и сразу перезагружает страницу —
// поэтому чистку доделываем здесь, при старте.
async function purgeAccountMedia() {
    try {
        const db = await openClipDB();
        await new Promise((resolve) => {
            const tx = db.transaction([CLIP_STORE, AUDIO_STORE, EXPLAIN_STORE], 'readwrite');
            tx.objectStore(EXPLAIN_STORE).clear();
            for (const store of [CLIP_STORE, AUDIO_STORE]) {
                const req = tx.objectStore(store).openKeyCursor();
                req.onsuccess = () => {
                    const cur = req.result;
                    if (!cur) return;
                    if (!String(cur.key).startsWith('local-')) tx.objectStore(store).delete(cur.primaryKey);
                    cur.continue();
                };
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
        return true;
    } catch {
        return false;
    }
}
(function purgeOnStart() {
    try {
        if (localStorage.getItem('animei:mediaPurge') !== '1') return;
        purgeAccountMedia().then((ok) => { if (ok) localStorage.removeItem('animei:mediaPurge'); });
    } catch { /* localStorage недоступен */ }
})();

// ---------- Фоновое докеширование медиа с сервера ----------
// У вошедшего клипы/звук карточек живут на сервере. Чтобы повторение работало
// без сети (метро/самолёт), складываем копию в IndexedDB; дальше карточка берёт
// её первой (см. study-core/words-store). kind: 'clip'|'audio'.
// Возвращает промис true/false; повторный вызов для того же файла
// присоединяется к идущей загрузке. Если подключён js/downloads.js, загрузка
// видна в окне «Загрузки» (opts.label — подпись, обычно само слово) с прогрессом.
const mediaCacheInFlight = new Map();

function cacheMediaFromUrl(kind, id, url, opts = {}) {
    const key = kind + ':' + id;
    if (!id || !url) return Promise.resolve(false);
    if (mediaCacheInFlight.has(key)) return mediaCacheInFlight.get(key);
    const task = window.AnimeiDownloads
        ? AnimeiDownloads.track(key, { kind, label: opts.label || '' })
        : null;
    const job = (async () => {
        try {
            if (task) task.set('active');
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const total = Number(resp.headers.get('content-length')) || 0;
            let blob;
            if (task && resp.body && resp.body.getReader) {
                // Читаем по кускам ради прогресса в окне загрузок.
                const reader = resp.body.getReader();
                const chunks = [];
                let loaded = 0;
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    loaded += value.length;
                    task.progress(loaded, total);
                }
                blob = new Blob(chunks, { type: resp.headers.get('content-type') || 'video/mp4' });
            } else {
                blob = await resp.blob();
            }
            if (!blob || !blob.size) throw new Error('empty');
            const ok = kind === 'clip' ? await putClip(id, blob) : await putAudio(id, blob);
            if (task) task.done(ok);
            return ok;
        } catch (err) {
            // нет сети — докешируем в другой раз
            if (task) task.done(false, err && err.message);
            return false;
        } finally {
            mediaCacheInFlight.delete(key);
        }
    })();
    mediaCacheInFlight.set(key, job);
    return job;
}
