// Тост-уведомление приложения.
//
// Вид и цвета держит CSS (см. «СНЕКБАР» в css/app/misc.css). Тип сообщения
// несёт только значок слева: фон и рамка у всех тостов одинаковые.
//
// Правила (редизайн уведомлений v0.0.616, по Material / GitHub Primer / NN/g):
//  • один тост за раз — новый заменяет старый, стопок нет;
//  • на телефоне тост СВЕРХУ, под шапкой: снизу он ложился на главные кнопки
//    экрана («Забыл / Помню», панель выбора слов, панель читалки);
//  • действие (обычно «Отменить») — одна кнопка справа и круговой таймер;
//    тост с действием живёт дольше и не исчезает, пока на нём палец/курсор;
//  • ошибка объявляется читалкам как alert, остальное — как status;
//  • закрыть: тап по тосту, смахнуть вверх (телефон) или вбок.
//
// showSnackbar(текст, { type, duration, action: { label, onClick }, onClose })
// → { close() }. onClose(reason): 'timeout' | 'action' | 'dismiss' | 'replaced'
// — для отложенных действий: «отменить не успели» = timeout/dismiss/replaced.

const SNACKBAR_ICON = (inner) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + inner + '</svg>';

const SNACKBAR_ICONS = {
    info: SNACKBAR_ICON('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
    success: SNACKBAR_ICON('<path d="M20 6 9 17l-5-5"/>'),
    error: SNACKBAR_ICON('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    warning: SNACKBAR_ICON('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'
        + '<path d="M12 9v4"/><path d="M12 17h.01"/>'),
};

// Ошибку человек должен успеть прочитать: короче 4 с не держим.
const SNACKBAR_MIN = { error: 4000, warning: 4000 };
const SNACKBAR_ACTION_DURATION = 6000;
let snackbarCurrent = null;

// На телефоне тост встаёт под шапку. Шапки нет или она уехала (полноэкранный
// плеер) — к верхнему краю с учётом выреза экрана.
function snackbarPlace(container) {
    if (!window.matchMedia('(max-width: 560px)').matches) {
        container.style.top = '';
        return;
    }
    const header = document.querySelector('.header');
    const r = header && header.offsetParent !== null ? header.getBoundingClientRect() : null;
    const top = r && r.bottom > 0 ? r.bottom + 8 : 8;
    container.style.top = `max(${Math.round(top)}px, calc(env(safe-area-inset-top, 0px) + 8px))`;
}

function showSnackbar(message, options = {}) {
    const { type = 'info', action = null, onClose = null } = options;
    const kind = SNACKBAR_ICONS[type] ? type : 'info';
    let duration = options.duration ?? (action ? SNACKBAR_ACTION_DURATION : 3000);
    duration = Math.max(duration, SNACKBAR_MIN[kind] || 0, action ? SNACKBAR_ACTION_DURATION : 0);

    // Один за раз: прежний уходит сразу (его отложенное действие — состоится).
    if (snackbarCurrent) snackbarCurrent.close('replaced');

    let container = document.getElementById('snackbar-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'snackbar-container';
        document.body.appendChild(container);
    }
    snackbarPlace(container);

    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar snackbar--' + kind + (action ? ' snackbar--action' : '');
    // Ошибка — alert (читалка перебьёт текущую речь), остальное — status.
    snackbar.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    snackbar.innerHTML = '<span class="snackbar__ico">' + SNACKBAR_ICONS[kind] + '</span>'
        + '<span class="snackbar__text"></span>';
    snackbar.querySelector('.snackbar__text').textContent = message;

    let timerRing = null;
    if (action && action.label) {
        // Круговой таймер вместо значка: видно, сколько осталось на «Отменить».
        snackbar.querySelector('.snackbar__ico').innerHTML =
            '<svg class="snackbar__timer" viewBox="0 0 24 24" aria-hidden="true">'
            + '<circle cx="12" cy="12" r="9" class="snackbar__timer-bg"/>'
            + '<circle cx="12" cy="12" r="9" class="snackbar__timer-fg" transform="rotate(-90 12 12)"/></svg>';
        timerRing = snackbar.querySelector('.snackbar__timer-fg');
        timerRing.style.animationDuration = duration + 'ms';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'snackbar__action';
        btn.textContent = action.label;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            close('action');
            try { if (action.onClick) action.onClick(); } catch (err) { console.error(err); }
        });
        snackbar.appendChild(btn);
    }

    container.appendChild(snackbar);
    requestAnimationFrame(() => requestAnimationFrame(() => snackbar.classList.add('show')));

    let closed = false;
    let timer = null;
    let left = duration;
    let startedAt = Date.now();

    function remove() {
        snackbar.remove();
        if (!container.children.length) container.remove();
    }
    function close(reason = 'dismiss') {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        if (snackbarCurrent === handle) snackbarCurrent = null;
        if (reason === 'replaced') remove();
        else {
            snackbar.classList.remove('show');
            snackbar.classList.add('hide');
            snackbar.addEventListener('transitionend', remove, { once: true });
            // При reduced-motion и на скрытой вкладке transitionend может не прийти.
            setTimeout(remove, 600);
        }
        if (onClose) { try { onClose(reason); } catch (err) { console.error(err); } }
    }
    function arm(ms) { clearTimeout(timer); startedAt = Date.now(); timer = setTimeout(() => close('timeout'), ms); }
    function pause() {
        if (closed) return;
        clearTimeout(timer);
        left = Math.max(800, left - (Date.now() - startedAt));
        if (timerRing) timerRing.style.animationPlayState = 'paused';
    }
    function resume() {
        if (closed) return;
        arm(left);
        if (timerRing) timerRing.style.animationPlayState = 'running';
    }
    arm(duration);

    // Пока на тосте курсор — не исчезает (успеть прочитать/нажать «Отменить»).
    snackbar.addEventListener('mouseenter', pause);
    snackbar.addEventListener('mouseleave', resume);

    // Тап закрывает; смахивание вверх или вбок — тоже.
    let sx = 0, sy = 0, swiping = false;
    snackbar.addEventListener('touchstart', (e) => {
        const tt = e.touches[0]; sx = tt.clientX; sy = tt.clientY; swiping = true; pause();
    }, { passive: true });
    snackbar.addEventListener('touchmove', (e) => {
        if (!swiping) return;
        const tt = e.touches[0];
        const dx = tt.clientX - sx, dy = tt.clientY - sy;
        snackbar.style.transform = `translate(${dx}px, ${Math.min(0, dy)}px)`;
        snackbar.style.opacity = String(Math.max(0.2, 1 - (Math.abs(dx) + Math.max(0, -dy)) / 220));
    }, { passive: true });
    snackbar.addEventListener('touchend', (e) => {
        if (!swiping) return;
        swiping = false;
        const tt = e.changedTouches[0];
        const dx = tt.clientX - sx, dy = tt.clientY - sy;
        if (Math.abs(dx) > 70 || dy < -40) { close('dismiss'); return; }
        snackbar.style.transform = '';
        snackbar.style.opacity = '';
        resume();
    });
    snackbar.addEventListener('click', () => close('dismiss'));

    const handle = { close, el: snackbar };
    snackbarCurrent = handle;
    return handle;
}

// ---------- Подтверждение на месте ----------
// Успех, который не нужно отменять, показываем самой кнопкой: «✓ Сохранено»
// зелёным (так делают GitHub, Instagram) — без всплывающего сообщения.
function markDone(btn, text) {
    if (!btn) return;
    if (text) btn.textContent = text;
    btn.classList.add('is-done');
    btn.disabled = true;
}

// Пояснение, которое нужно один раз в жизни (куда делось сохранённое слово и
// т.п.): показываем тостом при первом случае, дальше хватает «✓» на кнопке.
function showSnackbarOnce(key, message, options) {
    try {
        if (localStorage.getItem('animei:once:' + key)) return null;
        localStorage.setItem('animei:once:' + key, '1');
    } catch { /* без localStorage — покажем */ }
    return showSnackbar(message, options);
}

// ---------- Сообщение у формы ----------
// Ошибку формы — рядом с формой и до исправления (NN/g, GOV.UK): тост уезжал
// через 3 секунды и стоял на другом конце экрана. after — элемент, под которым
// встаёт строка (обычно кнопка отправки). Пустой текст — убрать. Строка сама
// уходит, как только человек начал править поля формы.
const formMessages = new WeakMap();   // элемент-якорь → его строка сообщения
function formMessage(after, text, type = 'error') {
    if (!after) return;
    let el = formMessages.get(after);
    if (el && !el.isConnected) el = null;
    if (!text) { if (el) el.remove(); formMessages.delete(after); return; }
    if (!el) {
        el = document.createElement('p');
        after.insertAdjacentElement('afterend', el);
        formMessages.set(after, el);
        const form = after.closest('form, section, .settings-card, .auth-card');
        if (form) form.addEventListener('input', () => { el.remove(); formMessages.delete(after); }, { once: true });
    }
    el.className = 'form-msg form-msg--' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = text;
}

// ---------- Подтверждение действия ----------
// Своё окно вместо confirm() браузера: системное выглядело чужим (заголовок
// «animei.space», кнопки «OK/Отмена» в стиле ОС) и на телефоне перекрывало
// всё. Только для действий, которые не отменить «Отменить»-тостом.
// confirmDialog({ title, text, ok, cancel, danger }) → Promise<boolean>.
function confirmDialog({ title = '', text = '', ok = 'OK', cancel, danger = false } = {}) {
    return new Promise((resolve) => {
        if (typeof modalLayer !== 'function') { resolve(window.confirm([title, text].filter(Boolean).join('\n\n'))); return; }
        const overlay = document.createElement('div');
        overlay.className = 'deck-sheet__overlay';
        const box = document.createElement('div');
        box.className = 'deck-editor confirm-dialog';
        box.setAttribute('role', 'alertdialog');
        box.setAttribute('aria-modal', 'true');
        const cancelLabel = cancel || (typeof t === 'function' ? t('common.cancel') : 'Отмена');
        box.innerHTML = '<div class="deck-editor__title confirm-dialog__title"></div>'
            + '<p class="confirm-dialog__text"></p>'
            + '<div class="confirm-dialog__foot"><button type="button" class="btn btn--ghost confirm-dialog__no"></button>'
            + '<button type="button" class="btn ' + (danger ? 'btn--danger' : 'btn--primary') + ' confirm-dialog__yes"></button></div>';
        box.querySelector('.confirm-dialog__title').textContent = title;
        const p = box.querySelector('.confirm-dialog__text');
        if (text) p.textContent = text; else p.remove();
        box.querySelector('.confirm-dialog__no').textContent = cancelLabel;
        box.querySelector('.confirm-dialog__yes').textContent = ok;
        overlay.appendChild(box);
        let answer = false;
        const modal = modalLayer(overlay, { afterHide: () => resolve(answer) });
        box.querySelector('.confirm-dialog__no').addEventListener('click', () => modal.close());
        box.querySelector('.confirm-dialog__yes').addEventListener('click', () => { answer = true; modal.close(); });
        modal.open();
        setTimeout(() => box.querySelector('.confirm-dialog__yes').focus(), 50);
    });
}
