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

    // Короткие метки вместо utm_source: ?r=lj в ссылке не выглядит рекламным
    // хвостом, а в панели разворачивается в понятное имя площадки. Неизвестный
    // код проходит как есть; ?r=tg-name — это канал tg_name.
    var REF_CODES = {
        lj: 'reddit_learnjapanese', sp: 'reddit_sideproject', hn: 'hn', ph: 'ph',
        ih: 'ih', hb: 'habr', vc: 'vc', at: 'alternativeto', un: 'uneed'
    };
    function refCode(v) {
        v = v.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
        if (!v) return null;
        if (REF_CODES[v]) return REF_CODES[v];
        if (v.indexOf('tg-') === 0) return 'tg_' + v.slice(3);
        return v;
    }

    // Откуда пришёл посетитель: метка из адреса, иначе домен реферера.
    // Переход внутри своего же сайта (лендинг -> приложение) источником не
    // считается — это 'direct', как и заход по закладке или из установленной PWA.
    function refSource() {
        try {
            var q = new URLSearchParams(location.search);
            var utm = q.get('r') || q.get('utm_source');
            if (utm) return refCode(utm);
            if (!document.referrer) return 'direct';
            var host = new URL(document.referrer).hostname.replace(/^www\./, '').toLowerCase();
            var own = location.hostname.replace(/^www\./, '').toLowerCase();
            return (!host || host === own) ? 'direct' : host.slice(0, 40);
        } catch (e) { return null; }
    }

    // Один раз на вкладку-сессию: иначе каждая открытая страница накручивала бы
    // источнику лишний заход.
    try {
        if (!sessionStorage.getItem('animei:refTracked')) {
            sessionStorage.setItem('animei:refTracked', '1');
            var src = refSource();
            if (src) send('ref', src);
        }
    } catch (e) { /* sessionStorage может быть недоступен */ }

    // Разовое событие входа в аккаунт — чтобы видеть переходы гость → аккаунт.
    try {
        if (currentUserId() && !sessionStorage.getItem('animei:sessionTracked')) {
            sessionStorage.setItem('animei:sessionTracked', '1');
            send('session', 'app/' + (file || 'index'));
        }
    } catch (e) { /* sessionStorage может быть недоступен */ }
})();
