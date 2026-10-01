// Прописи — данные: расписание повторений по знакам, кэш штрихов, настройки,
// дневная статистика, встроенный набор каны.
//
// Всё в localStorage этого устройства, ключи animei:kanji:*. Это осознанно
// отдельный контур от SRS слов: письмо — другой навык, и один знак встречается
// в десятке слов, так что повторять его нужно один раз, а не десять.
// К аккаунту не привязано (как и колоды до фазы 2): знак — он и есть знак.
//
// Наружу: window.KanjiStore = { srs, strokes, settings, days, KANA }
(function () {
    const SRS_KEY = 'animei:kanji:srs';
    const STROKES_KEY = 'animei:kanji:strokes';
    const SETTINGS_KEY = 'animei:kanji:settings';
    const DAYS_KEY = 'animei:kanji:days';
    const DAY = 24 * 3600 * 1000;

    const read = (k, fb) => (typeof lsJson === 'function' ? lsJson(k, fb) : fb);
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* тесно — переживём */ } };

    // ---- Расписание ---------------------------------------------------------
    // Уровень 0..8; интервал — дни до следующего повторения. Первый интервал
    // короткий (4 часа): новый знак хочется закрепить ещё раз в тот же день.
    const INTERVALS = [DAY / 6, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY, 120 * DAY, 240 * DAY];
    const LEARNED_LEVEL = 4;   // с этого уровня знак считаем «выученным»
    const MAX_LEVEL = INTERVALS.length - 1;

    let srsData = null;
    function srsLoad() {
        if (!srsData) {
            const raw = read(SRS_KEY, {});
            srsData = (raw && typeof raw === 'object') ? raw : {};
        }
        return srsData;
    }

    const srs = {
        get(ch) { return srsLoad()[ch] || null; },
        level(ch) { const r = srsLoad()[ch]; return r ? r.l : 0; },
        isNew(ch) { return !srsLoad()[ch]; },
        isDue(ch, now = Date.now()) { const r = srsLoad()[ch]; return !!r && r.due <= now; },
        isLearned(ch) { const r = srsLoad()[ch]; return !!r && r.l >= LEARNED_LEVEL; },

        // Оценка попытки. again — знак не вспомнился (много подсказок/ошибок):
        // уровень в ноль, повторить через 10 минут (сессия сама вернёт его в
        // очередь). hard — с трудом: шаг назад. good/easy — вперёд.
        rate(ch, grade, now = Date.now()) {
            const all = srsLoad();
            const r = all[ch] || { l: 0, due: 0, seen: 0, miss: 0, first: now };
            r.seen += 1;
            r.last = now;
            if (grade === 'again') {
                r.l = 0;
                r.miss += 1;
                r.due = now + 10 * 60 * 1000;
            } else if (grade === 'hard') {
                r.l = Math.max(0, r.l - 1);
                r.miss += 1;
                r.due = now + INTERVALS[r.l];
            } else if (grade === 'easy') {
                r.l = Math.min(MAX_LEVEL, r.l + 2);
                r.due = now + INTERVALS[r.l];
            } else {
                r.l = Math.min(MAX_LEVEL, r.l + 1);
                r.due = now + INTERVALS[r.l];
            }
            all[ch] = r;
            write(SRS_KEY, all);
            return r;
        },

        reset(ch) {
            const all = srsLoad();
            delete all[ch];
            write(SRS_KEY, all);
        },

        // Сводка по набору знаков: сколько новых, на сегодня, выучено.
        stats(chars, now = Date.now()) {
            const all = srsLoad();
            const s = { total: chars.length, fresh: 0, due: 0, learned: 0, seen: 0 };
            for (const ch of chars) {
                const r = all[ch];
                if (!r) { s.fresh += 1; continue; }
                s.seen += 1;
                if (r.due <= now) s.due += 1;
                if (r.l >= LEARNED_LEVEL) s.learned += 1;
            }
            return s;
        },

        INTERVALS, LEARNED_LEVEL, MAX_LEVEL,
    };

    // ---- Штрихи: кэш + загрузка пачками -----------------------------------
    // В кэше держим до ~600 знаков (≈ 0.5 МБ) — хватает на все колоды обычного
    // пользователя, и прописи работают офлайн. Сервер и так отдаёт штрихи с
    // Cache-Control на месяц, это второй слой на случай пустого HTTP-кэша.
    const STROKES_MAX = 600;
    let strokeCache = null;
    function strokesLoad() {
        if (!strokeCache) {
            const raw = read(STROKES_KEY, null);
            strokeCache = (raw && raw.v === 1 && raw.m && typeof raw.m === 'object') ? raw.m : {};
        }
        return strokeCache;
    }
    function strokesSave() {
        const m = strokesLoad();
        const keys = Object.keys(m);
        if (keys.length > STROKES_MAX) {
            // Выкидываем самые старые по времени записи.
            keys.sort((a, b) => (m[a].t || 0) - (m[b].t || 0));
            for (const k of keys.slice(0, keys.length - STROKES_MAX)) delete m[k];
        }
        write(STROKES_KEY, { v: 1, m });
    }

    const strokes = {
        get(ch) { const r = strokesLoad()[ch]; return r || null; },

        // Догрузить недостающие знаки. Возвращает Map ch → запись (или null,
        // если знака нет в справочнике — такие помечаем, чтобы не спрашивать
        // сервер каждый раз).
        async ensure(chars) {
            const m = strokesLoad();
            const need = [...new Set(chars)].filter((c) => !m[c]);
            if (need.length && typeof client !== 'undefined') {
                let changed = false;
                for (let i = 0; i < need.length; i += 50) {
                    const batch = need.slice(i, i + 50);
                    try {
                        const { data: res } = await client.get('kanji/strokes', { params: { chars: batch.join('') } });
                        const got = (res && res.data) || {};
                        for (const c of batch) {
                            m[c] = got[c] ? { s: got[c].s, n: got[c].n || [], p: got[c].parts || [], t: Date.now() }
                                : { none: true, t: Date.now() };
                            changed = true;
                        }
                    } catch (e) {
                        // Нет сети — отдаём, что есть; не помечаем «нет в справочнике».
                        break;
                    }
                }
                if (changed) strokesSave();
            }
            const out = new Map();
            for (const c of chars) out.set(c, m[c] && !m[c].none ? m[c] : null);
            return out;
        },
    };

    // ---- Настройки ---------------------------------------------------------
    const DEFAULTS = {
        tolerance: 'normal',   // strict | normal | loose
        newPerSession: 5,      // новых знаков за сессию
        maxPerSession: 15,     // всего знаков за сессию
        numbers: true,         // номера штрихов в показе
        speak: true,           // озвучивать слово
        vibrate: true,
    };
    let settingsData = null;
    const settings = {
        all() {
            if (!settingsData) settingsData = Object.assign({}, DEFAULTS, read(SETTINGS_KEY, {}) || {});
            return settingsData;
        },
        get(k) { return settings.all()[k]; },
        set(k, v) {
            settings.all()[k] = v;
            write(SETTINGS_KEY, settingsData);
        },
        DEFAULTS,
    };

    // ---- Дневная статистика ------------------------------------------------
    // { '2026-10-01': { w: написано знаков, p: без единой ошибки } }
    function dayKey(ts = Date.now()) {
        const d = new Date(ts);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    const days = {
        add(perfect) {
            const all = read(DAYS_KEY, {}) || {};
            const k = dayKey();
            const r = all[k] || { w: 0, p: 0 };
            r.w += 1;
            if (perfect) r.p += 1;
            all[k] = r;
            // Храним только последние 60 дней.
            const keys = Object.keys(all).sort();
            for (const old of keys.slice(0, Math.max(0, keys.length - 60))) delete all[old];
            write(DAYS_KEY, all);
        },
        today() { return (read(DAYS_KEY, {}) || {})[dayKey()] || { w: 0, p: 0 }; },
        // Серия дней подряд с письмом (сегодня или вчера — считается живой).
        streak() {
            const all = read(DAYS_KEY, {}) || {};
            let n = 0;
            let t = Date.now();
            if (!all[dayKey(t)]) t -= DAY;
            while (all[dayKey(t)] && all[dayKey(t)].w > 0) { n += 1; t -= DAY; }
            return n;
        },
    };

    // ---- Кана ------------------------------------------------------------
    // Встроенный набор для новичков: без неё прописи начинаются с иероглифов,
    // а писать с нуля лучше с азбуки. Ромадзи — подпись вместо слова-контекста.
    const ROMA = ['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko', 'sa', 'shi', 'su', 'se', 'so',
        'ta', 'chi', 'tsu', 'te', 'to', 'na', 'ni', 'nu', 'ne', 'no', 'ha', 'hi', 'fu', 'he', 'ho',
        'ma', 'mi', 'mu', 'me', 'mo', 'ya', 'yu', 'yo', 'ra', 'ri', 'ru', 're', 'ro', 'wa', 'wo', 'n'];
    const HIRA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
    const KATA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const KANA = {
        hira: [...HIRA].map((c, i) => ({ ch: c, roma: ROMA[i] })),
        kata: [...KATA].map((c, i) => ({ ch: c, roma: ROMA[i] })),
    };

    window.KanjiStore = { srs, strokes, settings, days, KANA, dayKey };
})();
