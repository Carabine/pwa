function showSnackbar(message, options = {}) {
    const {
        duration = 3000,
        position = 'bottom-right',
        type = 'info' // Default type
    } = options;

    const colors = {
        info: { backgroundColor: '#2196f3', textColor: '#fff' },
        success: { backgroundColor: '#4caf50', textColor: '#fff' },
        error: { backgroundColor: '#f44336', textColor: '#fff' },
        warning: { backgroundColor: '#ff9800', textColor: '#fff' }
    };

    const { backgroundColor, textColor } = colors[type] || colors['info'];

    // Ensure snackbar container exists
    let container = document.getElementById('snackbar-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'snackbar-container';
        document.body.appendChild(container);
    }

    // Create snackbar element
    const snackbar = document.createElement('div');
    snackbar.classList.add('snackbar', type); // Add type class, but not 'show' yet
    snackbar.textContent = message;
    snackbar.style.backgroundColor = backgroundColor;
    snackbar.style.color = textColor;

    // Apply position styling
    applyPosition(container, position);

    // Append to container
    container.appendChild(snackbar);

    // Add the 'show' class after a short delay to trigger animation
    setTimeout(() => {
        snackbar.classList.add('show');
    }, 10);

    // Remove snackbar after duration
    setTimeout(() => {
        snackbar.classList.remove('show');
        snackbar.classList.add('hide');
        snackbar.addEventListener('transitionend', () => {
            snackbar.remove();
        });
    }, duration);
}

function applyPosition(container, position) {
    const [vertical, horizontal] = position.split('-');
    container.style.position = 'fixed';
    container.style[vertical] = '10px';
    container.style[horizontal] = '20px';
}