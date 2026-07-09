// Режим для новичков: готовая колода из 50 простых слов из известных аниме
// (starter-deck.js). Проходится как cram — расписание не трогаем, на карточке
// есть кнопка «В коллекцию».

// Что из колоды уже есть в коллекции — чтобы кнопки показывали «✓ В коллекции»
window.starterSavedKanji = new Set();
starterLoadSavedSet().then((set) => { window.starterSavedKanji = set; });

startStudy({ scheduled: false, deck: starterDeckWords(), collectable: true });
