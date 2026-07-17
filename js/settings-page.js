// Логика страницы настроек. Читает/пишет через window.AnimeiSettings,
// смену пароля шлёт на бэкенд (POST /users/password). Язык хранится i18n
// отдельно (animei:lang) — при смене перезагружаем страницу.

(function () {
    const S = window.AnimeiSettings;
    if (!S) return;

    // ---- Сегментированные переключатели (тема, размер субтитров) ----
    function initSeg(id, key, onChange) {
        const box = document.getElementById(id);
        if (!box) return;
        const cur = String(S.get(key));
        box.querySelectorAll('button').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.val === cur);
            btn.addEventListener('click', () => {
                S.set(key, btn.dataset.val);
                box.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                if (onChange) onChange(btn.dataset.val);
            });
        });
    }
    initSeg('set-theme', 'theme');
    initSeg('set-subSize', 'subSize');

    // ---- Язык ----
    const langSel = document.getElementById('set-language');
    if (langSel) {
        langSel.value = (typeof getLang === 'function') ? getLang() : (localStorage.getItem('animei:lang') || 'ru');
        langSel.addEventListener('change', () => {
            localStorage.setItem('animei:lang', langSel.value);
            if (typeof window.animeiTrack === 'function') window.animeiTrack('setting', 'language:' + langSel.value);
            window.location.reload();
        });
    }

    // ---- Чекбоксы ----
    function initToggle(id, key) {
        const el = document.getElementById(id);
        if (!el) return;
        el.checked = !!S.get(key);
        el.addEventListener('change', () => S.set(key, el.checked));
    }
    initToggle('set-playerRomaji', 'playerRomaji');
    initToggle('set-playerTranslation', 'playerTranslation');
    initToggle('set-autoSyncSubs', 'autoSyncSubs');
    initToggle('set-autopause', 'autopause');
    initToggle('set-loopClips', 'loopClips');

    // ---- Громкость ----
    const vol = document.getElementById('set-volume');
    if (vol) {
        vol.value = S.get('volume');
        vol.addEventListener('input', () => S.set('volume', parseFloat(vol.value)));
    }

    // ---- Аккаунт ----
    const stateEl = document.getElementById('account-state');
    const passBlock = document.getElementById('password-block');
    const loggedIn = typeof isLoggedIn === 'function' && isLoggedIn();

    if (stateEl) {
        if (loggedIn) {
            const email = localStorage.getItem('animei:email') || '';
            const wrap = document.createElement('div');
            wrap.className = 'account-email';
            wrap.innerHTML = `${t('settings.signedInAs')}: <b></b>`;
            wrap.querySelector('b').textContent = email;
            stateEl.appendChild(wrap);
            if (passBlock) passBlock.hidden = false;
        } else {
            const note = document.createElement('p');
            note.className = 'account-guest';
            note.textContent = t('settings.guest');
            const login = document.createElement('a');
            login.className = 'btn btn--primary';
            login.href = './login.html';
            login.textContent = t('settings.login');
            stateEl.appendChild(note);
            stateEl.appendChild(login);
        }
    }

    // ---- О приложении: версия деплоя (из сайдбара её убрали) ----
    const about = document.getElementById('settings-about');
    if (about && typeof APP_VERSION !== 'undefined') {
        about.textContent = 'Animei ' + APP_VERSION;
    }

    // ---- Смена пароля ----
    const saveBtn = document.getElementById('save-pass');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const curEl = document.getElementById('cur-pass');
            const newEl = document.getElementById('new-pass');
            const cur = curEl.value.trim();
            const nw = newEl.value.trim();
            if (!cur || !nw) {
                showSnackbar(t('settings.passwordFields'), { duration: 3000, type: 'error' });
                return;
            }
            if (nw.length < 6) {
                showSnackbar(t('settings.passwordShort'), { duration: 3000, type: 'error' });
                return;
            }
            saveBtn.disabled = true;
            try {
                await client.post('users/password', { currentPassword: cur, newPassword: nw });
                showSnackbar(t('settings.passwordChanged'), { duration: 3000, type: 'success' });
                curEl.value = '';
                newEl.value = '';
                if (typeof window.animeiTrack === 'function') window.animeiTrack('password_change', 'ok');
            } catch (err) {
                const status = err?.response?.status;
                const msg = status === 400 ? t('settings.passwordWrong') : t('settings.passwordError');
                showSnackbar(msg, { duration: 3500, type: 'error' });
            } finally {
                saveBtn.disabled = false;
            }
        });
    }
})();
