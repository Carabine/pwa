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

    // ---- Что учим: японский / английский (переехало из шторки в меню профиля) ----
    (function initLearn() {
        const card = document.getElementById('learn-card');
        const box = document.getElementById('learn-options');
        if (!card || !box || !window.LearnLang || typeof learnLangVisible !== 'function' || !learnLangVisible()) return;
        const cur = LearnLang.get();
        const counts = (typeof learnLangCounts === 'function') ? learnLangCounts() : { ja: 0, en: 0 };
        const enOk = LearnLang.englishAvailable();
        const esc = (x) => (typeof escHtml === 'function' ? escHtml(x) : String(x));
        const opt = (code, glyph, enabled) =>
            `<button type="button" class="learn-sheet__opt${code === cur ? ' is-on' : ''}${enabled ? '' : ' is-soon'}" data-lang="${code}"${enabled ? '' : ' disabled'}>` +
            `<span class="learn-sheet__glyph learn-sheet__glyph--${code}">${glyph}</span>` +
            `<span class="learn-sheet__body"><span class="learn-sheet__name">${esc(t('learn.' + code))}</span>` +
            `<span class="learn-sheet__desc">${esc(t('learn.' + code + '.desc'))}</span></span>` +
            `<span class="learn-sheet__count">${enabled ? esc(tWords(counts[code])) : esc(t('learn.soon'))}</span>` +
            `<span class="learn-sheet__radio" aria-hidden="true"></span></button>`;
        box.innerHTML = opt('ja', 'あ', true) + opt('en', 'A', enOk);
        card.hidden = false;
        box.querySelectorAll('.learn-sheet__opt').forEach((b) => {
            b.addEventListener('click', () => {
                const code = b.dataset.lang;
                if (code === cur) return;
                LearnLang.set(code);
                if (window.animeiTrack) animeiTrack('learn_lang', code);
                window.location.reload();
            });
        });
    })();

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
                formMessage(saveBtn, t('settings.passwordFields'));
                return;
            }
            if (nw.length < 6) {
                formMessage(saveBtn, t('settings.passwordShort'));
                return;
            }
            formMessage(saveBtn, '');
            saveBtn.disabled = true;
            try {
                const res = await client.post('users/password', { currentPassword: cur, newPassword: nw }, { silentErrors: true });
                // Смена пароля гасит все сессии на сервере — этому устройству
                // сервер сразу выдал новую пару, сохраняем её, чтобы не выкинуло.
                if (res?.data?.accessToken && res.data.refreshToken) setRefreshedTokens(res.data);
                formMessage(saveBtn, t('settings.passwordChanged'), 'success');
                curEl.value = '';
                newEl.value = '';
            } catch (err) {
                const status = err?.response?.status;
                const msg = status === 400 ? t('settings.passwordWrong') : t('settings.passwordError');
                formMessage(saveBtn, msg);
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

// Офлайн-доступ: «Загрузить всё» — видео, звук и ИИ-разборы всех карточек на
// устройство (AnimeiDownloads.downloadAll, js/downloads.js). Строка состояния
// считает, что уже лежит на устройстве, — по ней видно, что офлайн «точно».
(function () {
    const card = document.getElementById('offline-card');
    if (!card || !window.AnimeiDownloads || typeof mediaKeys !== 'function') return;
    const D = window.AnimeiDownloads;
    const statusEl = document.getElementById('offline-status');
    const prog = document.getElementById('offline-progress');
    const bar = prog.querySelector('.offline-dl__bar > span');
    const progText = prog.querySelector('.offline-dl__text');
    const allBtn = document.getElementById('offline-all');
    const stopBtn = document.getElementById('offline-stop');
    card.hidden = false;

    const fill = (key, map) => Object.keys(map).reduce((s, k) => s.replace('{' + k + '}', map[k]), t(key));

    async function renderStatus() {
        statusEl.classList.remove('is-complete');
        statusEl.textContent = t('settings.offline.checking');
        let st;
        try { st = await D.status(); } catch { st = null; }
        if (!st) { statusEl.textContent = ''; return; }
        if (!st.words) {
            statusEl.textContent = t('settings.offline.empty');
            allBtn.disabled = true;
            return;
        }
        const complete = st.clipsHave >= st.clipsNeed && st.explainsHave >= st.explainsNeed;
        statusEl.textContent = complete
            ? t('settings.offline.all')
            : fill('settings.offline.status', { ch: st.clipsHave, cn: st.clipsNeed, eh: st.explainsHave, en: st.explainsNeed });
        statusEl.classList.toggle('is-complete', complete);
        allBtn.disabled = false;
    }

    function setRunning(on) {
        allBtn.hidden = on;
        stopBtn.hidden = !on;
        prog.hidden = !on;
    }

    function onProgress(p) {
        if (p.phase === 'end') return;
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        bar.style.width = pct + '%';
        const phase = p.phase && p.phase !== 'start' ? ' · ' + t('settings.offline.phase.' + p.phase) : '';
        progText.textContent = fill('settings.offline.progress', { done: p.done, total: p.total }) + phase;
    }

    allBtn.addEventListener('click', async () => {
        const actions = card.querySelector('.offline-dl__actions');
        if (!navigator.onLine || (window.ANIMEI_NET && !window.ANIMEI_NET.isOnline())) {
            formMessage(actions, t('settings.offline.noNet'));
            return;
        }
        formMessage(actions, '');
        setRunning(true);
        bar.style.width = '0%';
        progText.textContent = t('settings.offline.checking');
        if (window.animeiTrack) window.animeiTrack('offline_all', 'start');
        let r = null;
        try { r = await D.downloadAll({ onProgress }); } catch { r = null; }
        setRunning(false);
        // Итог — в самой карточке, рядом с кнопкой (строка состояния выше
        // тоже обновится), а не тостом сверху страницы.
        const actions2 = card.querySelector('.offline-dl__actions');
        if (r && r.reason === 'offline') formMessage(actions2, t('settings.offline.noNet'));
        else if (r && r.cancelled) formMessage(actions2, t('settings.offline.stopped'), 'info');
        else if (r && r.failed) formMessage(actions2, fill('settings.offline.doneFailed', { n: r.failed }));
        else if (r) formMessage(actions2, t('settings.offline.done'), 'success');
        renderStatus();
    });
    stopBtn.addEventListener('click', () => D.cancelAll());

    // Уход со страницы обрывает загрузку — предупреждаем, пока она идёт.
    window.addEventListener('beforeunload', (e) => {
        if (D.isDownloadingAll()) { e.preventDefault(); e.returnValue = ''; }
    });

    renderStatus();
})();
