// Режим для новичков: готовые колоды из starter-deck.js, проходятся как cram —
// расписание не трогаем, на карточке есть кнопка «В коллекцию».
//
// Две разные вещи (?deck=):
//   core — 15 карточек-сцен с видеоклипами из культовых аниме;
//   full — все 50 базовых слов (15 со сценами + 35 без видео).
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
        '</button>';
    box.querySelector('.deck-choice__title').textContent = t('beginner.choose');
    const core = box.querySelector('.deck-choice__opt--core');
    core.querySelector('b').textContent = t('beginner.core');
    core.querySelector('small').textContent = t('beginner.core.sub');
    const full = box.querySelector('.deck-choice__opt--full');
    full.querySelector('b').textContent = t('beginner.full');
    full.querySelector('small').textContent = t('beginner.full.sub');

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

    main.prepend(box);
})();
