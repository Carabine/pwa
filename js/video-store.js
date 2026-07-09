// Клипы гостя — короткие видеофрагменты к словам. У незалогиненного
// пользователя нет места на сервере, поэтому клипы лежат в IndexedDB браузера
// (blob по ключу = id слова). При входе они заливаются в аккаунт
// (см. syncGuestWordsToAccount в words-store.js).
//
// Подключать ПЕРЕД words-store.js и study-core.js — они зовут getClip/putClip.

const CLIP_DB = 'animei-media';
const CLIP_STORE = 'clips';

function openClipDB() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB недоступен'));
            return;
        }
        const req = indexedDB.open(CLIP_DB, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(CLIP_STORE)) db.createObjectStore(CLIP_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
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
