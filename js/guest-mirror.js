// Зеркало гостевой коллекции на сервере.
//
// У человека без аккаунта слова и колоды живут только в localStorage его
// браузера — на сервере их нет вообще, и владелец не видел, что собирают до
// регистрации. Этот модуль отправляет СНИМОК коллекции (слова + колоды) под
// анонимным visitorId — тем же, что у статистики. Снимок односторонний:
// обратно на устройство ничего не приходит, коллекция из него не
// восстанавливается, источник правды остаётся в браузере.
//
// Вошёл в аккаунт — снимок удаляется: слова переезжают в аккаунт
// (syncGuestWordsToAccount), и там их видно точнее.
//
// Зависит от words-store.js (getGuestWords) и, если есть, decks-store.js
// (window.Decks). Подключать ПОСЛЕ них.
(function () {
    var SIG_KEY = 'animei:mirrorSig';       // подпись последнего отправленного снимка
    var VISITOR_KEY = 'animei:visitorId';   // общий анонимный id со статистикой
    var WORDS_MAX = 1500;
    var domain = window.ANIMEI_ORIGIN || window.location.origin;

    function ls(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function signedIn() {
        return typeof isLoggedIn === 'function' && isLoggedIn();
    }

    // Дешёвая подпись (djb2): снимок отправляем, только если он изменился —
    // иначе каждая открытая страница слала бы одно и то же.
    function sign(text) {
        var h = 5381;
        for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
        return String(h);
    }

    // Берём только то, что нужно посмотреть глазами: без ссылок на видео,
    // клипов и служебных полей.
    function snapshot() {
        var words = (getGuestWords() || []).slice(0, WORDS_MAX).map(function (w) {
            return {
                id: w.id,
                kanji: w.kanji,
                kana: w.kana,
                translation: w.translation,
                sentence: w.sentence,
                sentenceTranslation: w.sentenceTranslation,
            };
        });
        // Колоды знает не каждая страница: decks-store.js подключён не везде
        // (на главной, например, его нет). Оттуда колоды НЕ отправляем вовсе —
        // сервер сохранит те, что были: иначе заход на главную стирал бы их.
        var snap = { words: words };
        if (window.Decks && typeof Decks.all === 'function') {
            snap.decks = Decks.all().map(function (d) {
                return {
                    id: d.id,
                    name: d.name,
                    emoji: d.emoji,
                    wordIds: d.wordIds,
                    createdAt: d.createdAt,
                    updatedAt: d.updatedAt,
                };
            });
        }
        return snap;
    }

    function push() {
        if (typeof getGuestWords !== 'function') return;   // страница без словаря
        var id = ls(VISITOR_KEY);
        if (!id) return;

        if (signedIn()) {
            // Слова уехали в аккаунт — гостевой снимок больше не нужен.
            if (!ls(SIG_KEY)) return;
            fetch(domain + '/api/v1/guest/mirror/' + encodeURIComponent(id), {
                method: 'DELETE',
                keepalive: true,
            }).then(function (r) {
                if (r.ok) { try { localStorage.removeItem(SIG_KEY); } catch (e) { /* приват-режим */ } }
            }).catch(function () { /* зеркало не должно мешать приложению */ });
            return;
        }

        var snap = snapshot();
        // Пустая коллекция у нового браузера — слать нечего. Если раньше что-то
        // отправляли (человек всё удалил), снимок уходит и сервер чистит запись.
        if (!snap.words.length && !(snap.decks && snap.decks.length) && !ls(SIG_KEY)) return;

        var body = JSON.stringify({ visitorId: id, words: snap.words, decks: snap.decks });
        var sig = sign(body);
        if (sig === ls(SIG_KEY)) return;

        fetch(domain + '/api/v1/guest/mirror', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
            keepalive: true,
        }).then(function (r) {
            if (r.ok) { try { localStorage.setItem(SIG_KEY, sig); } catch (e) { /* приват-режим */ } }
        }).catch(function () { /* нет сети — отправим при следующем заходе */ });
    }

    // При заходе — с задержкой, чтобы не соревноваться с загрузкой страницы;
    // при уходе (вкладку свернули, закрыли, ушли в фон на телефоне) — сразу,
    // это главный момент: за визит человек как раз что-то собрал.
    setTimeout(push, 4000);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') push();
    });
    window.addEventListener('pagehide', push);
})();
