// Восстановление пароля. Одна страница на два шага:
//   без ?token — форма «пришлите ссылку на почту»;
//   с ?token   — форма нового пароля (ссылку проверяем ДО показа формы, чтобы
//                человек не придумывал пароль впустую).
//
// Ответ сервера на запрос письма всегда одинаковый: по этой форме нельзя
// проверить, зарегистрирован адрес или нет.

(function () {
    const $ = (id) => document.getElementById(id);
    const tr = (key, fallback) => (typeof t === 'function' ? t(key) : fallback) || fallback;

    const token = new URLSearchParams(window.location.search).get('token') || '';

    let sending = false;

    function setHead(title, subtitle) {
        $('reset-title').textContent = title;
        $('reset-subtitle').textContent = subtitle;
    }

    function show({ ask = false, form = false, again = false }) {
        $('ask-form').hidden = !ask;
        $('new-form').hidden = !form;
        $('again-btn').hidden = !again;
    }

    // Шаг 1: попросить письмо.
    function showAsk() {
        setHead(tr('reset.title', 'Восстановление пароля'),
            tr('reset.subtitle', 'Пришлём ссылку для нового пароля на вашу почту'));
        show({ ask: true });
        $('reset-email').focus();
    }

    function showSent(email) {
        setHead(tr('reset.sentTitle', 'Письмо отправлено'),
            tr('reset.sent', 'Если такой аккаунт есть, ссылка уже летит на {email}. Проверьте папку «Спам».')
                .replace('{email}', email));
        show({});
    }

    function showDead() {
        setHead(tr('reset.deadTitle', 'Ссылка не работает'),
            tr('reset.dead', 'Она устарела или уже использована. Запросите новую.'));
        show({ again: true });
    }

    // Шаг 2: новый пароль.
    function showNew() {
        setHead(tr('reset.newTitle', 'Новый пароль'),
            tr('reset.newSubtitle', 'Придумайте пароль — им и будете входить'));
        show({ form: true });
        $('reset-password').focus();
    }

    async function askLink(e) {
        e.preventDefault();
        if (sending) return;
        const email = $('reset-email').value.trim();
        if (!email) {
            showSnackbar(tr('reset.needEmail', 'Введите почту'), { duration: 3000, type: 'error' });
            return;
        }
        sending = true;
        $('ask-btn').disabled = true;
        try {
            await client.post('auth/forgot-password', { email }, { authorization: false });
            if (window.animeiTrack) animeiTrack('auth', 'forgot_request');
            showSent(email);
        } catch (err) {
            const msg = err?.response?.data?.message
                || tr('reset.failed', 'Не получилось. Попробуйте ещё раз чуть позже.');
            showSnackbar(msg, { duration: 4000, type: 'error' });
            sending = false;
            $('ask-btn').disabled = false;
        }
    }

    async function saveNew(e) {
        e.preventDefault();
        if (sending) return;
        const password = $('reset-password').value;
        if (password.length < 6) {
            showSnackbar(tr('reset.short', 'Пароль должен быть не короче 6 символов'),
                { duration: 3000, type: 'error' });
            return;
        }
        sending = true;
        $('new-btn').disabled = true;
        try {
            await client.post('auth/reset-password', { token, password }, { authorization: false });
            if (window.animeiTrack) animeiTrack('auth', 'forgot_done');
            setHead(tr('reset.doneTitle', 'Пароль обновлён'),
                tr('reset.done', 'Теперь войдите с новым паролем.'));
            show({});
            showSnackbar(tr('reset.doneTitle', 'Пароль обновлён'), { duration: 2500, type: 'success' });
            setTimeout(() => { window.location.href = './login.html'; }, 1600);
        } catch (err) {
            const msg = err?.response?.data?.message
                || tr('reset.failed', 'Не получилось. Попробуйте ещё раз чуть позже.');
            showSnackbar(msg, { duration: 4500, type: 'error' });
            sending = false;
            $('new-btn').disabled = false;
            // Ссылка мертва — форма пароля бесполезна, предлагаем запросить новую.
            if (err?.response?.status === 400) showDead();
        }
    }

    // «Глазик» показа пароля — та же логика, что на входе.
    function wireEye() {
        const pw = $('reset-password');
        const eye = $('pw-toggle');
        if (!pw || !eye) return;
        eye.addEventListener('click', () => {
            const show = pw.type === 'password';
            pw.type = show ? 'text' : 'password';
            eye.classList.toggle('is-on', show);
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof applyI18n === 'function') applyI18n();
        wireEye();
        $('ask-form').addEventListener('submit', askLink);
        $('new-form').addEventListener('submit', saveNew);
        $('again-btn').addEventListener('click', () => {
            // Токен из адреса убираем, иначе перезагрузка вернёт мёртвый шаг 2.
            window.location.href = './reset.html';
        });

        if (!token) { showAsk(); return; }

        try {
            const { data } = await client.get('auth/reset-password',
                { params: { token }, authorization: false });
            if (data?.valid) showNew();
            else showDead();
        } catch {
            // Нет сети — не врём, что ссылка плохая: предлагаем повторить.
            setHead(tr('reset.title', 'Восстановление пароля'),
                tr('reset.offline', 'Не удалось проверить ссылку — нет связи с сервером.'));
            show({ again: true });
        }
    });
})();
