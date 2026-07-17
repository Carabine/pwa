// Режим для новичков: готовая колода из 50 простых слов из известных аниме
// (starter-deck.js). Проходится как cram — расписание не трогаем, на карточке
// есть кнопка «В коллекцию».
//
// Приход с лендинга (?from=landing): показываем сначала слова, которые
// пользователь сохранил в демо-плеере (animei:guestWords, fromLanding),
// а следом — 15 заготовленных карточек. Порядок сохраняем (ordered).

// Что из колоды уже есть в коллекции — чтобы кнопки показывали «✓ В коллекции»
window.starterSavedKanji = new Set();
starterLoadSavedSet().then((set) => { window.starterSavedKanji = set; });

(function () {
    const fromLanding = new URLSearchParams(location.search).get('from') === 'landing';

    if (fromLanding && typeof window.landingWordsForStudy === 'function') {
        const landing = window.landingWordsForStudy();
        const starters = starterDeckWords().slice(0, 15);
        // Убираем из стартовой части дубли слов, уже пришедших с лендинга.
        const landingKanji = new Set(landing.map((w) => w.kanji));
        const deck = [...landing, ...starters.filter((s) => !landingKanji.has(s.kanji))];
        if (window.animeiTrack) window.animeiTrack('onboarding', 'from_landing:' + landing.length);
        startStudy({ scheduled: false, deck, collectable: true, ordered: true });
        return;
    }

    // ordered: сперва 15 карточек с видео, затем 35 без — порядок как в колоде.
    startStudy({ scheduled: false, deck: starterDeckWords(), collectable: true, ordered: true });
})();
