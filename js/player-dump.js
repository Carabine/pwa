// Отладочная выгрузка текущей дорожки — ТОЛЬКО для владельца. Живёт в настройках
// видео (группа «Для админа», чипы 30 с / 2 мин / серия), а не кнопкой в панели
// плеера: там она теснила нужные на каждый день кнопки.
//
// Зачем: разбор проблем с источниками требует самого файла. Какой РЕАЛЬНО язык
// звука (метка «SUB» у источника врёт — на этом сгорел solarmovies/embedmaster),
// где именно уехали субтитры, что вжато в кадр. До этого приходилось ходить по
// ssh на VPS и гонять ffmpeg по прокси-ссылке руками.
//
// Чипы — УДОБСТВО, а не защита: и тикет (/admin/stream-dump/ticket), и сам
// стрим (/proxy/dump) закрыты на сервере через hasOwnerAccess. Кто угодно может
// показать группу в DevTools — и получит 403. Публичной кнопки «скачать серию»
// здесь нет намеренно: это не функция изучения языка.
//
// Подключать ПОСЛЕ player.js (нужны state, client, t, video).
(function () {
    'use strict';

    const group = document.getElementById('dump-group');
    const buttons = document.getElementById('dump-buttons');
    if (!group || !buttons) return;

    // Сколько выгружать от текущей позиции. dur: null = до конца серии.
    const RANGES = [
        { key: 's30', dur: 30 },
        { key: 'm2', dur: 120 },
        { key: 'full', dur: null },
    ];

    function tr(key, fallback) {
        const s = typeof t === 'function' ? t(key) : key;
        return s === key ? fallback : s;
    }

    function snack(msg) {
        if (typeof showSnackbar === 'function') showSnackbar(msg, { duration: 2200 });
    }

    // Имя файла для разбора: по нему сразу видно тайтл, серию и ИСТОЧНИК —
    // без источника скачанные куски не отличить друг от друга, а вся отладка
    // как раз про «у какого провайдера что не так».
    function dumpName() {
        const select = document.getElementById('episode-select');
        const ep = state.episodes && select ? state.episodes[parseInt(select.value, 10)] : null;
        const title = (typeof titleRomaji === 'string' && titleRomaji) || 'anime';
        const parts = [title];
        if (state.seasonIndex) parts.push('s' + (state.seasonIndex + 1));
        if (ep && ep.number != null) parts.push('ep' + ep.number);
        parts.push(state.provider || 'kodik');
        return parts.join('_');
    }

    // Субтитры серии для выгрузки — мягкими дорожками (сервер кладёт их в MKV):
    // оригинал и перевод, со сдвигом, который сейчас стоит в плеере (cueOff —
    // с учётом кусков). Время — секунды видео.
    const SUB_LANG = { ru: ['rus', 'Русский'], uk: ['ukr', 'Українська'], en: ['eng', 'English'] };
    function subTracks() {
        const cues = (state.cues || []).filter((c) => Number.isFinite(c.start));
        if (!cues.length) return [];
        const at = (c) => {
            const off = typeof cueOff === 'function' ? cueOff(c) : (state.offset || 0);
            const end = Number.isFinite(c.end) && c.end > c.start ? c.end : c.start + 2;
            return [c.start + off, end + off];
        };
        const tracks = [{
            lang: state.enMode ? 'eng' : 'jpn',
            title: state.enMode ? 'English' : '日本語',
            cues: cues.filter((c) => c.text).map((c) => [...at(c), c.text]),
        }];
        // Перевод — если он у реплик реально есть (у части источников его нет).
        const withTr = cues.filter((c) => c.translation);
        const ui = typeof subsLang === 'function' ? subsLang() : 'ru';
        const trLang = SUB_LANG[ui] || SUB_LANG.ru;
        if (withTr.length >= cues.length * 0.2 && trLang[0] !== tracks[0].lang) {
            tracks.push({ lang: trLang[0], title: trLang[1], cues: withTr.map((c) => [...at(c), c.translation]) });
        }
        return tracks;
    }

    async function startDump(dur) {
        if (!state.currentVideoUrl) { snack(tr('dump.noStream', 'Поток ещё не загружен')); return; }

        // Целую серию берём с начала: «с текущей позиции до конца» для разбора
        // почти никогда не нужно, а промахнуться позицией — легко.
        const start = dur == null ? 0 : Math.floor(video.currentTime || 0);

        try {
            const { data: res } = await client.post('admin/stream-dump/ticket', {
                url: state.currentVideoUrl,
                start,
                dur,
                name: dumpName(),
                subs: subTracks(),
            });

            const url = (window.ANIMEI_ORIGIN || location.origin)
                + '/proxy/dump?t=' + encodeURIComponent(res.data.ticket);

            // Отдаём родному загрузчику: файл пишется сразу на диск, с прогрессом,
            // и серия не висит гигабайтным blob'ом в памяти вкладки.
            // Если сервер откажет (429 «уже идёт выгрузка»), в загрузки упадёт
            // крошечный файл с текстом ошибки — плеер при этом не страдает.
            const a = document.createElement('a');
            a.href = url;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            a.remove();

            snack(dur == null
                ? tr('dump.startedFull', 'Выгрузка серии началась')
                : tr('dump.started', 'Выгрузка фрагмента началась'));
        } catch (err) {
            const code = err && err.response && err.response.status;
            snack(code === 403
                ? tr('dump.denied', 'Нет доступа к выгрузке')
                : code === 409
                    ? tr('dump.busy', 'Уже идёт выгрузка — дождитесь её конца')
                    : tr('dump.error', 'Не удалось начать выгрузку'));
        }
    }

    // ---------- Чипы диапазонов ----------
    // Шторку настроек не закрываем: закрытие идёт через history.go(-1), и
    // начатая в этот момент загрузка отменялась («качает не с первого раза»).
    RANGES.forEach((r) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip-btn';
        chip.textContent = tr('dump.range.' + r.key, r.dur == null
            ? 'Серия целиком'
            : (r.dur < 60 ? r.dur + ' с отсюда' : (r.dur / 60) + ' мин отсюда'));
        chip.addEventListener('click', () => startDump(r.dur));
        buttons.appendChild(chip);
    });

    // ---------- Показ группы ----------
    // Кэш animei:isAdmin ведёт app.js (он же рисует ссылку на админку). Читаем
    // его, а не дёргаем whoami ещё раз: лишний запрос на каждом открытии плеера
    // не нужен, а ошибиться кэш может только в сторону «показали лишние чипы»,
    // которые без ключа/сессии всё равно получат 403.
    try {
        if (localStorage.getItem('animei:isAdmin') === 'yes') group.style.display = '';
    } catch { /* приватный режим — группы не будет, это нормально */ }
})();
