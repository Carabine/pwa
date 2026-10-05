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
    // «Забыли пароль?» — только в режиме входа: при регистрации забывать нечего.
    const forgot = document.getElementById('forgot-link');
    if (forgot) forgot.hidden = !isLogin;
    renderGoogleButton();   // «Sign in with» ↔ «Sign up with»
}

// ---------- Вход через Google (Google Identity Services) ----------
// Кнопка появляется, только если на сервере задан Client ID (GET auth/config).
// Google отдаёт ID-токен; сервер проверяет его получателя и подпись и находит
// или заводит аккаунт по подтверждённой почте. Дальше — как обычный вход.
let googleReady = false;
let googleSubmitting = false;
async function initGoogleLogin() {
    let cid = null;
    try {
        const { data } = await client.get(domain + '/api/v1/auth/config', { authorization: false, silentErrors: true });
        cid = data && data.googleClientId;
    } catch { return; }
    if (!cid) return;
    const loaded = await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
    });
    if (!loaded || !window.google?.accounts?.id) return;
    google.accounts.id.initialize({ client_id: cid, callback: onGoogleCredential, ux_mode: 'popup', auto_select: false });
    googleReady = true;
    document.getElementById('google-login').hidden = false;
    renderGoogleButton();
}

function renderGoogleButton() {
    const slot = document.getElementById('google-btn');
    if (!googleReady || !slot) return;
    slot.innerHTML = '';
    google.accounts.id.renderButton(slot, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: authMode === 'login' ? 'signin_with' : 'signup_with',
        width: Math.min(400, slot.clientWidth || 320),
        locale: document.documentElement.lang || 'en',
    });
}

async function onGoogleCredential(resp) {
    if (googleSubmitting || authSubmitting || !resp || !resp.credential) return;
    googleSubmitting = true;
    const slot = document.getElementById('google-btn');
    formMessage(slot, '');
    try {
        const { data } = await client.post(domain + '/api/v1/auth/oauth',
            { provider: 'google', idToken: resp.credential }, { authorization: false, silentErrors: true });
        setRefreshedTokens(data);
        // Как при обычном входе: следы прошлого аккаунта — вон, гостевые слова — в аккаунт
        clearAccountScopedState();
        if (data.email) localStorage.setItem('animei:email', data.email);
        await syncGuestWordsToAccount();
        if (window.animeiTrack) animeiTrack('auth', data.created ? 'register_google' : 'login_google');
        window.location.href = '../index.html';
    } catch (err) {
        formMessage(slot, err?.response?.data?.code ? errorText(err) : t('auth.googleError'));
        googleSubmitting = false;
    }
}

let authSubmitting = false;
async function submitAuth() {
    // Re-entry guard: без него двойной сабмит (двойной клик / Enter) запускал
    // перенос гостевых слов дважды параллельно → дубли слов на сервере.
    if (authSubmitting) return;

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const submitBtn = document.getElementById('submit-btn');
    if (!email || !password) {
        formMessage(submitBtn, t('auth.needFields'));
        return;
    }
    formMessage(submitBtn, '');

    authSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;

    const path = authMode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
    try {
        // silentErrors — ошибку покажем у формы, без общего тоста сверху.
        const { data } = await client.post(domain + path, { email, password }, { authorization: false, silentErrors: true });
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
        markDone(submitBtn, t('auth.success'));
        window.location.href = '../index.html';
    } catch (err) {
        // Код с сервера точнее общего «проверь почту и пароль» (занятая почта,
        // лимит попыток), но текст берём из словаря, а не с сервера.
        const msg = err?.response?.data?.code ? errorText(err) : t('auth.error');
        formMessage(submitBtn, msg);
        // Ошибка — разблокируем форму для повторной попытки. При успехе оставляем
        // заблокированной: идёт навигация на главную.
        authSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();               // уже вошёл — уводит на главную
    applyAuthMode();
    initGoogleLogin();

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
        eye.setAttribute('data-i18n-aria', 'aria.showPassword');
        eye.setAttribute('aria-label', t('aria.showPassword'));
        eye.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
            + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
        wrap.appendChild(eye);
    }
    if (pw && eye) {
        eye.addEventListener('click', () => {
            const show = pw.type === 'password';
            pw.type = show ? 'text' : 'password';
            eye.classList.toggle('is-on', show);
            // Подпись идёт за состоянием: после показа кнопка уже прячет пароль.
            const key = show ? 'aria.hidePassword' : 'aria.showPassword';
            eye.setAttribute('data-i18n-aria', key);
            eye.setAttribute('aria-label', t(key));
        });
    }
});
