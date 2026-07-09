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

async function submitAuth() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        showSnackbar(t('auth.needFields'), { duration: 3000, type: 'error' });
        return;
    }

    const path = authMode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
    try {
        const { data } = await client.post(domain + path, { email, password }, { authorization: false });
        setRefreshedTokens(data);
        localStorage.setItem('animei:email', email);
        // Переносим слова, сохранённые до входа, в аккаунт.
        await syncGuestWordsToAccount();
        showSnackbar(t('auth.success'), { duration: 2000, type: 'success' });
        window.location.href = '../index.html';
    } catch (err) {
        const msg = err?.response?.data?.message || t('auth.error');
        showSnackbar(msg, { duration: 4000, type: 'error' });
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
});
