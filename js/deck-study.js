// Изучение одной колоды — cram-режим через общий движок study-core.js.
// Глобальное SRS-расписание НЕ трогаем: колода — это дополнительная тренировка
// кураторского набора, а не второй контур повторений. Порядок карточек в колоде
// осмысленный (порядок добавления), поэтому не перемешиваем (ordered).
(function () {
    const id = new URLSearchParams(location.search).get('deck');
    const deck = window.Decks ? Decks.get(id) : null;

    const titleEl = document.querySelector('.deck-run-title');
    if (titleEl) titleEl.textContent = deck ? `${deck.emoji} ${deck.name}` : '';

    if (!deck) { startStudy({ scheduled: false, deck: [] }); return; }

    // Слова колоды берём из актуальной коллекции по сохранённым id, сохраняя
    // порядок колоды и молча пропуская отсутствующие (мёртвые) id.
    fetchWords()
        .then((all) => {
            const byId = new Map(all.map((w) => [w.id, w]));
            const cards = deck.wordIds.map((wid) => byId.get(wid)).filter(Boolean);
            startStudy({ scheduled: false, deck: cards, ordered: true });
        })
        .catch(() => startStudy({ scheduled: false, deck: [] }));
})();
