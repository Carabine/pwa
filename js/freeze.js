// Заморозка — «пока не учу, но пусть лежит».
//
// Отличается от удаления (слово исчезает) и от «уже знаю» (слово считается
// выученным): замороженное слово остаётся в словаре, в колодах, в покрытии и в
// подсветке субтитров, но не попадает в ежедневную учёбу. Расписание повторений
// НЕ трогаем — разморозили и продолжили ровно с того места, где остановились.
//
// Заморозить можно по-разному:
//   • слово — явно, флагом на самой карточке (у вошедшего едет на сервер полем
//     Word.frozen, у гостя лежит в его локальном слове);
//   • колоду — флагом Deck.frozen (см. decks-store.js).
//
// Колода — это ярлык, а не папка: одно слово живёт в нескольких колодах сразу.
// Поэтому заморозка колоды не «замораживает её слова» скопом (иначе разморозка
// разморозила бы и то, что человек прятал руками), а действует по правилу:
// слово выпадает из учёбы, если ВСЕ его колоды заморожены. Есть хоть одна живая
// колода — слово учится; нет колод вовсе — заморозка колод его не касается.
(function () {
    // Слова из замороженных колод, не состоящие ни в одной живой. Считаем разом,
    // а не через Decks.decksOf на каждое слово: словарь бывает на тысячи
    // карточек, и пообъектный обход колод на каждой сборке очереди заметен.
    function frozenByDecks() {
        const out = new Set();
        if (!window.Decks) return out;
        const alive = new Set();
        for (const d of Decks.all()) {
            for (const id of d.wordIds) (d.frozen ? out : alive).add(id);
        }
        for (const id of alive) out.delete(id);
        return out;
    }

    const Freeze = {
        // Явная заморозка самого слова (без учёта колод).
        isWord(word) { return !!(word && word.frozen); },

        // Понадобится ли слово в ежедневной учёбе. deckSet — результат
        // frozenByDecks(); передаём его снаружи, когда проверяем весь список.
        isActive(word, deckSet) {
            if (!word) return false;
            if (word.frozen) return true;
            const set = deckSet || frozenByDecks();
            return set.has(word.id);
        },

        frozenByDecks,

        // Отфильтровать список слов для учёбы. Набор замороженных колод
        // считаем один раз на весь список.
        forStudy(words) {
            const set = frozenByDecks();
            return (words || []).filter((w) => !(w.frozen || set.has(w.id)));
        },

        // Заморозить/разморозить слово. Уходит обычным PATCH (у вошедшего —
        // через офлайн-ящик правок), плюс сразу правим локальный слепок
        // 'words': по нему собирается очередь учёбы и считается главная, а
        // обновляется он только при следующей загрузке списка с сервера.
        async setWord(id, on) {
            const frozen = !!on;
            if (typeof updateWord === 'function') await updateWord(id, { frozen });
            const words = lsJson('words', []);
            if (Array.isArray(words)) {
                let hit = false;
                for (const w of words) {
                    if (w && w.id === id) { w.frozen = frozen; hit = true; }
                }
                if (hit) {
                    try { localStorage.setItem('words', JSON.stringify(words)); }
                    catch { /* тесно в localStorage — переживём */ }
                }
            }
            // Офлайн-копия списка (у вошедшего) — чтобы без сети не «оттаяло».
            if (typeof rememberWordInCache === 'function') rememberWordInCache({ id, frozen });
            return frozen;
        },
    };

    window.Freeze = Freeze;
})();
