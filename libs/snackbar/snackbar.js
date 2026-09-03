// Тост-уведомление приложения.
//
// Вид и цвета держит CSS (см. «СНЕКБАР» в css/app/misc.css). Раньше этот файл
// проставлял их ИНЛАЙНОМ из собственной палитры Material — и инлайн перебивал
// классы, которые уже были написаны на токенах темы: подтверждение приходило
// ярко-синим #2196f3 мимо всей палитры приложения и мимо светлой темы.
//
// Тип сообщения теперь несёт только значок слева: фон и рамка у всех тостов
// одинаковые, как у карточек приложения.

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

function showSnackbar(message, options = {}) {
    const { duration = 3000, type = 'info' } = options;
    const kind = SNACKBAR_ICONS[type] ? type : 'info';

    let container = document.getElementById('snackbar-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'snackbar-container';
        document.body.appendChild(container);
    }

    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar snackbar--' + kind;
    // role=status — сообщение читается вслух само, без перехвата фокуса.
    snackbar.setAttribute('role', 'status');
    snackbar.innerHTML = '<span class="snackbar__ico">' + SNACKBAR_ICONS[kind] + '</span>'
        + '<span class="snackbar__text"></span>';
    snackbar.querySelector('.snackbar__text').textContent = message;

    container.appendChild(snackbar);

    // Класс появления — следующим кадром, иначе перехода не будет: элемент
    // должен успеть отрисоваться в исходном состоянии.
    requestAnimationFrame(() => requestAnimationFrame(() => snackbar.classList.add('show')));

    let removed = false;
    const drop = () => {
        if (removed) return;
        removed = true;
        snackbar.remove();
        if (!container.children.length) container.remove();
    };

    setTimeout(() => {
        snackbar.classList.remove('show');
        snackbar.classList.add('hide');
        snackbar.addEventListener('transitionend', drop, { once: true });
        // Подстраховка: при prefers-reduced-motion переход почти нулевой, а на
        // скрытой вкладке события может не быть вовсе — тост не должен зависать.
        setTimeout(drop, 600);
    }, duration);

    // Тап по тосту закрывает его сразу: длинное сообщение иногда мешает.
    snackbar.addEventListener('click', drop);

    return snackbar;
}
