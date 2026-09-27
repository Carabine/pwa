// Логика страницы настроек. Читает/пишет через window.AnimeiSettings,
// смену пароля шлёт на бэкенд (POST /users/password). Язык хранится i18n
// отдельно (animei:lang) — при смене перезагружаем страницу.

(function () {
    const S = window.AnimeiSettings;
    if (!S) return;

    // ---- Вкладки: «Приложение» / «Аккаунт» ----
    // Активная вкладка живёт в хэше (#account), а не в состоянии страницы:
    // так на неё можно дать ссылку — этим и пользуется пункт «Настройки
    // аккаунта» в меню профиля (см. renderAuthState в app.js).
    const tabs = Array.from(document.querySelectorAll('.settings-tab'));
    if (tabs.length) {
        const panel = (name) => document.getElementById('panel-' + name);

        function showTab(name, push) {
            if (!panel(name)) name = 'app';
            tabs.forEach((btn) => {
                const on = btn.dataset.tab === name;
                btn.classList.toggle('is-active', on);
                btn.setAttribute('aria-selected', on ? 'true' : 'false');
                const p = panel(btn.dataset.tab);
                if (p) p.hidden = !on;
            });
            if (push) {
                // replaceState, а не хэш напрямую: смена вкладки не должна
                // копить записи в истории — «назад» уводит со страницы.
                const url = location.pathname + location.search + (name === 'app' ? '' : '#' + name);
                history.replaceState(history.state, '', url);
            }
        }

        // Вкладка из ссылки: и #account, и ?tab=account — на случай, если
        // хэш съест внешний переход.
        const fromUrl = () => {
            const h = (location.hash || '').replace('#', '');
            if (h) return h;
            const m = /[?&]tab=([a-z]+)/.exec(location.search);
            return m ? m[1] : 'app';
        };

        showTab(fromUrl(), false);
        tabs.forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab, true)));
        window.addEventListener('hashchange', () => showTab(fromUrl(), false));
    }

    // ---- Сегментированные переключатели (тема, размер субтитров) ----
    // norm — нормализация сохранённого значения перед подсветкой (легаси).
    function initSeg(id, key, onChange, norm) {
        const box = document.getElementById(id);
        if (!box) return;
        const cur = norm ? norm(S.get(key)) : String(S.get(key));
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
    initSeg('set-newPerDay', 'newPerDay');
    // Транскрипция — одна на всё приложение (субтитры, слова, карточки), поэтому
    // живёт в карточке «Субтитры», где раньше стоял отдельный тогл ромадзи.
    // Легаси-значения («Обе»/«Скрыть» из старых версий) = дефолт-ромадзи,
    // как в transcriptionMode() (study-core.js).
    initSeg('set-studyTranscription', 'studyTranscription', null,
        (v) => (v === 'kana' ? 'kana' : 'romaji'));

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
                const res = await client.post('users/password', { currentPassword: cur, newPassword: nw });
                // Смена пароля гасит все сессии на сервере — этому устройству
                // сервер сразу выдал новую пару, сохраняем её, чтобы не выкинуло.
                if (res?.data?.accessToken && res.data.refreshToken) setRefreshedTokens(res.data);
                showSnackbar(t('settings.passwordChanged'), { duration: 3000, type: 'success' });
                curEl.value = '';
                newEl.value = '';
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

// Английский режим: транскрипция кана/ромадзи — японская настройка, прячем
// ряд вместе с подсказкой (в английском чтение слова — из словаря).
(function () {
    if (!(window.LearnLang && LearnLang.get() === 'en')) return;
    const seg = document.getElementById('set-studyTranscription');
    const row = seg && seg.closest('.settings-row');
    if (row) row.style.display = 'none';   // у .settings-row свой display — [hidden] не сработал бы
    const hint = document.querySelector('p[data-i18n="settings.transcription.hint"]');
    if (hint) hint.style.display = 'none';
})();
