// Своя мини-статистика: при открытии страницы шлём один «хит», а также
// умеем трекать действия (сохранение слова, просмотр, учёба) через
// window.animeiTrack('event', 'деталь'). Никаких кук и внешних сервисов —
// только случайный анонимный id в localStorage. IP пишет бэкенд.
(function () {
    // Канонический origin API из axiosClient.js (грузится раньше на всех страницах).
    var domain = window.ANIMEI_ORIGIN || window.location.origin;

    var KEY = 'animei:visitorId';
    var visitorId = localStorage.getItem(KEY);
    if (!visitorId) {
        visitorId = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : Date.now() + '-' + Math.random().toString(16).slice(2);
        localStorage.setItem(KEY, visitorId);
    }

    // id аккаунта (если вошёл) — достаём из access-токена (JWT), чтобы связывать
    // события с пользователем. Токен уже лежит в localStorage у axiosClient.
    function currentUserId() {
        try {
            var token = localStorage.getItem('animei:accessToken');
            if (!token) return null;
            var part = token.split('.')[1];
            if (!part) return null;
            var json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
            var payload = JSON.parse(json);
            return payload && payload.userId ? String(payload.userId).slice(0, 64) : null;
        } catch (e) { return null; }
    }

    function send(event, page) {
        var body = { event: event, page: page, visitorId: visitorId };
        var uid = currentUserId();
        if (uid) body.userId = uid;
        fetch(domain + '/api/v1/stats/hit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
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

    // Разовое событие входа в аккаунт — чтобы видеть переходы гость → аккаунт.
    try {
        if (currentUserId() && !sessionStorage.getItem('animei:sessionTracked')) {
            sessionStorage.setItem('animei:sessionTracked', '1');
            send('session', 'app/' + (file || 'index'));
        }
    } catch (e) { /* sessionStorage может быть недоступен */ }
})();
