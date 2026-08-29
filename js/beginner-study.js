// Режим для новичков: готовые колоды из starter-deck.js, проходятся как cram —
// расписание не трогаем, на карточке есть кнопка «В коллекцию».
//
// Выбор (?deck=):
//   core — 15 карточек-сцен с видеоклипами из культовых аниме;
//   full — все 50 базовых слов (все со сценами);
//   третья карточка «Из любимого аниме» — поиск тайтла, дальше плеер сам
//   открывает «Авто-колоду» в режиме «Всё аниме» (?autodeck=anime, уровень
//   там по умолчанию N5) — вся механика скана серий и клипов живёт в плеере.
// Без параметра показываем выбор. CTA «Попробовать» с главной ведёт на core.
//
// Приход с лендинга (?from=landing): показываем сначала слова, которые
// пользователь сохранил в демо-плеере (animei:guestWords, fromLanding),
// а следом — 15 заготовленных карточек. Порядок сохраняем (ordered).

// Что из колоды уже есть в коллекции — чтобы кнопки показывали «✓ В коллекции»
window.starterSavedKanji = new Set();
starterLoadSavedSet().then((set) => { window.starterSavedKanji = set; });

(function () {
    const params = new URLSearchParams(location.search);
    const fromLanding = params.get('from') === 'landing';

    if (fromLanding && typeof window.landingWordsForStudy === 'function') {
        const landing = window.landingWordsForStudy();
        const starters = starterDeckWords().slice(0, STARTER_CORE_COUNT);
        // Убираем из стартовой части дубли слов, уже пришедших с лендинга.
        const landingKanji = new Set(landing.map((w) => w.kanji));
        const deck = [...landing, ...starters.filter((s) => !landingKanji.has(s.kanji))];
        if (window.animeiTrack) window.animeiTrack('onboarding', 'from_landing:' + landing.length);
        startStudy({ scheduled: false, deck, collectable: true, ordered: true });
        return;
    }

    function startDeck(kind) {
        const all = starterDeckWords();
        const deck = kind === 'core' ? all.slice(0, STARTER_CORE_COUNT) : all;
        if (window.animeiTrack) window.animeiTrack('beginner_deck', kind);
        // ordered: сперва карточки с видео, затем без — порядок как в колоде.
        startStudy({ scheduled: false, deck, collectable: true, ordered: true });
    }

    const chosen = params.get('deck');
    if (chosen === 'core' || chosen === 'full') {
        startDeck(chosen);
        return;
    }

    // Выбор колоды: 15 сцен (главное предложение) или все 50 слов.
    const main = document.querySelector('.main.study');
    if (!main) { startDeck('core'); return; }

    const box = document.createElement('div');
    box.className = 'deck-choice';
    box.innerHTML =
        '<div class="deck-choice__title"></div>' +
        '<button class="deck-choice__opt deck-choice__opt--core">' +
        '<span class="deck-choice__num">15</span>' +
        '<span class="deck-choice__txt"><b></b><small></small></span>' +
        '</button>' +
        '<button class="deck-choice__opt deck-choice__opt--full">' +
        '<span class="deck-choice__num">50</span>' +
        '<span class="deck-choice__txt"><b></b><small></small></span>' +
        '</button>' +
        '<button class="deck-choice__opt deck-choice__opt--anime">' +
        '<span class="deck-choice__num">📺</span>' +
        '<span class="deck-choice__txt"><b></b><small></small></span>' +
        '</button>';
    box.querySelector('.deck-choice__title').textContent = t('beginner.choose');
    const core = box.querySelector('.deck-choice__opt--core');
    core.querySelector('b').textContent = t('beginner.core');
    core.querySelector('small').textContent = t('beginner.core.sub');
    const full = box.querySelector('.deck-choice__opt--full');
    full.querySelector('b').textContent = t('beginner.full');
    full.querySelector('small').textContent = t('beginner.full.sub');
    const anime = box.querySelector('.deck-choice__opt--anime');
    anime.querySelector('b').textContent = t('beginner.anime');
    anime.querySelector('small').textContent = t('beginner.anime.sub');

    const pick = (kind) => {
        // Запоминаем выбор в адресе — перезагрузка не возвращает к вопросу.
        const url = new URL(location.href);
        url.searchParams.set('deck', kind);
        history.replaceState(null, '', url);
        box.remove();
        startDeck(kind);
    };
    core.addEventListener('click', () => pick('core'));
    full.addEventListener('click', () => pick('full'));
    anime.addEventListener('click', () => showAnimePicker(box));

    main.prepend(box);

    // ---------- «Из любимого аниме»: поиск тайтла ----------
    // Выбор тайтла открывает список простых слов прямо здесь
    // (js/beginner-deck.js): скан сабов первых серий, галочки, «Создать
    // колоду». Плеер для этого не нужен.
    function showAnimePicker(choiceBox) {
        choiceBox.hidden = true;
        if (window.animeiTrack) window.animeiTrack('beginner_deck', 'anime_search');

        const panel = document.createElement('div');
        panel.className = 'deck-choice deck-anime';
        panel.innerHTML =
            '<div class="deck-choice__title"></div>' +
            '<input class="deck-anime__input" type="search" autocomplete="off">' +
            '<div class="deck-anime__list"></div>' +
            '<button class="deck-anime__back" type="button"></button>';
        panel.querySelector('.deck-choice__title').textContent = t('beginner.anime.pick');
        const input = panel.querySelector('.deck-anime__input');
        input.placeholder = t('beginner.anime.ph');
        const list = panel.querySelector('.deck-anime__list');
        const back = panel.querySelector('.deck-anime__back');
        back.textContent = t('beginner.anime.back');
        back.addEventListener('click', () => {
            panel.remove();
            choiceBox.hidden = false;
        });

        const render = (items) => {
            list.innerHTML = '';
            // Ещё не вышедшие тайтлы (год в будущем) — в хвост: сабов и серий
            // у них нет, клик по ним приведёт в пустой плеер.
            const nowYear = new Date().getFullYear();
            const released = (a) => (Number(a.year) || 0) <= nowYear;
            const top = (items || [])
                .slice()
                .sort((a, b) => Number(released(b)) - Number(released(a)))
                .slice(0, 8);
            if (!top.length) {
                const empty = document.createElement('div');
                empty.className = 'deck-anime__empty';
                empty.textContent = t('beginner.anime.empty');
                list.appendChild(empty);
                return;
            }
            top.forEach((a) => {
                // Кнопка, не ссылка: слова показываем прямо здесь
                // (js/beginner-deck.js), в плеер не уводим.
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'deck-anime__row';
                row.innerHTML = (a.posterPreview
                    ? '<img src="' + a.posterPreview + '" alt="" loading="lazy">'
                    : '<span class="deck-anime__noimg"></span>') +
                    '<span class="deck-anime__txt"><b></b><small></small></span>';
                // Битый постер (у анонсов их часто нет) → серая заглушка.
                const img = row.querySelector('img');
                if (img) img.addEventListener('error', () => {
                    img.replaceWith(Object.assign(document.createElement('span'), { className: 'deck-anime__noimg' }));
                }, { once: true });
                row.querySelector('b').textContent = animeTitle(a);
                row.querySelector('small').textContent = [a.year, a.kind].filter(Boolean).join(' · ');
                row.addEventListener('click', () => {
                    panel.hidden = true;
                    window.BeginnerDeck.open(a, () => { panel.hidden = false; });
                });
                list.appendChild(row);
            });
        };

        let timer = null;
        let lastQ = '';
        input.addEventListener('input', () => {
            const q = input.value.trim();
            lastQ = q;
            clearTimeout(timer);
            if (q.length < 2) { list.innerHTML = ''; return; }
            timer = setTimeout(async () => {
                try {
                    const { data: res } = await client.get('catalog/search', { params: { q }, silentErrors: true });
                    if (q !== lastQ) return;   // пришёл устаревший ответ
                    render(res.data || []);
                } catch { /* сеть — просто без результатов */ }
            }, 350);
        });

        main.prepend(panel);
        // Автофокус не ставим: на телефоне он тут же открывает клавиатуру и
        // прыгает вьюпорт — пусть человек сам тапнет по полю.
    }
})();
