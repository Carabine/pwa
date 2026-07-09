// Своя мини-статистика: при открытии страницы шлём один «хит», а также
// умеем трекать действия (сохранение слова, просмотр, учёба) через
// window.animeiTrack('event', 'деталь'). Никаких кук и внешних сервисов —
// только случайный анонимный id в localStorage. IP пишет бэкенд.
(function () {
    var domain = ['localhost', '127.0.0.1', ''].includes(window.location.hostname)
        ? 'http://localhost:3005'
        : window.location.origin;

    var KEY = 'animei:visitorId';
    var visitorId = localStorage.getItem(KEY);
    if (!visitorId) {
        visitorId = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : Date.now() + '-' + Math.random().toString(16).slice(2);
        localStorage.setItem(KEY, visitorId);
    }

    function send(event, page) {
        fetch(domain + '/api/v1/stats/hit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: event, page: page, visitorId: visitorId }),
            keepalive: true
        }).catch(function () { /* статистика не должна мешать приложению */ });
    }

    // Публичный трекер действий: window.animeiTrack('save_word', '食べる')
    window.animeiTrack = function (event, detail) {
        if (!event) return;
        send(String(event).slice(0, 40), String(detail || '-').slice(0, 200) || '-');
    };

    // Авто-хит открытия страницы: /pages/catalog.html -> app/catalog
    var file = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    send('page', 'app/' + (file || 'index'));
})();
