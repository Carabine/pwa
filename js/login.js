// Опциональный вход/регистрация. Один экран, переключается между двумя режимами.
let authMode = 'login';

function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
}

function applyAuthMode() {
    const isLogin = authMode === 'login';
    setText('#auth-title', t(isLogin ? 'auth.loginTitle' : 'auth.registerTitle'));
    setText('#auth-subtitle', t(isLogin ? 'auth.loginSubtitle' : 'auth.registerSubtitle'));
    setText('#submit-btn', t(isLogin ? 'auth.signIn' : 'auth.signUp'));
    setText('#toggle-mode', t(isLogin ? 'auth.toRegister' : 'auth.toLogin'));
    const pw = document.getElementById('password');
    if (pw) pw.autocomplete = isLogin ? 'current-password' : 'new-password';
}

let authSubmitting = false;
async function submitAuth() {
    // Re-entry guard: без него двойной сабмит (двойной клик / Enter) запускал
    // перенос гостевых слов дважды параллельно → дубли слов на сервере.
    if (authSubmitting) return;

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        showSnackbar(t('auth.needFields'), { duration: 3000, type: 'error' });
        return;
    }

    authSubmitting = true;
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    const path = authMode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
    try {
        const { data } = await client.post(domain + path, { email, password }, { authorization: false });
        setRefreshedTokens(data);
        // Остатки ПРЕДЫДУЩЕГО аккаунта (карточки, расписание, колоды, «уже
        // знаю») чистим до того, как новая сессия начнёт синк: иначе они
        // считались бы своими и уезжали в чужой аккаунт. Гостевые слова этим не
        // затрагиваются — они переносятся строкой ниже.
        clearAccountScopedState();
        localStorage.setItem('animei:email', email);
        // Переносим слова, сохранённые до входа, в аккаунт.
        await syncGuestWordsToAccount();
        if (window.animeiTrack) animeiTrack('auth', authMode === 'login' ? 'login' : 'register');
        showSnackbar(t('auth.success'), { duration: 2000, type: 'success' });
        window.location.href = '../index.html';
    } catch (err) {
        const msg = err?.response?.data?.message || t('auth.error');
        showSnackbar(msg, { duration: 4000, type: 'error' });
        // Ошибка — разблокируем форму для повторной попытки. При успехе оставляем
        // заблокированной: идёт навигация на главную.
        authSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();               // уже вошёл — уводит на главную
    applyAuthMode();

    document.getElementById('auth-form').addEventListener('submit', (e) => {
        e.preventDefault();
        submitAuth();
    });
    document.getElementById('toggle-mode').addEventListener('click', () => {
        authMode = authMode === 'login' ? 'register' : 'login';
        applyAuthMode();
    });

    // «Глазик» показа пароля. В старом кеше HTML кнопки может не быть
    // (установленное PWA стартует со снапшота страницы при свежем JS) —
    // тогда оборачиваем поле и создаём её сами.
    const pw = document.getElementById('password');
    let eye = document.getElementById('pw-toggle');
    if (pw && !eye) {
        const wrap = document.createElement('div');
        wrap.className = 'pw-field';
        pw.parentNode.insertBefore(wrap, pw);
        wrap.appendChild(pw);
        eye = document.createElement('button');
        eye.type = 'button';
        eye.id = 'pw-toggle';
        eye.className = 'pw-field__eye';
        eye.tabIndex = -1;
        eye.setAttribute('aria-label', 'Показать пароль');
        eye.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
            + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
        wrap.appendChild(eye);
    }
    if (pw && eye) {
        eye.addEventListener('click', () => {
            const show = pw.type === 'password';
            pw.type = show ? 'text' : 'password';
            eye.classList.toggle('is-on', show);
        });
    }
});
