// ========== Service Worker ==========

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(() => console.log('SW registered'))
            .catch(err => console.log('SW registration failed:', err));
    });
}

// ========== PWA Install ==========

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

// ========== Data Fetching ==========

async function fetchAndDecode(url) {
    const response = await fetch(url);
    const data = await response.json();

    const decodeHTML = (str) => {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = str;
        return textarea.value;
    };

    return JSON.parse(JSON.stringify(data), (_, value) =>
        typeof value === 'string' ? decodeHTML(value) : value
    );
}

function dataPath(file) {
    const inPages = window.location.pathname.includes('/pages/');
    return (inPages ? '../' : './') + 'data/' + file;
}

async function fetchDataFromServer() {
    try {
        const [data1, data2] = await Promise.all([
            fetchAndDecode(dataPath('data.json')),
            fetchAndDecode(dataPath('data2.json'))
        ]);

        const words1 = (data1.words ?? []).map(d => ({
            ...d,
            translatedSentence: d.translatedSentence
        }));

        const words2 = (data2.data ?? []).map(d => ({
            ...d,
            word: d.kanji,
            meaning: d.translation,
            translatedSentence: d.sentenceTranslation
        }));

        const allWords = [...words1, ...words2];
        localStorage.setItem('words', JSON.stringify(allWords));

        if (typeof onLoad === 'function') {
            onLoad();
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// ========== Shuffle ==========

function shuffle(array) {
    let currentIndex = array.length;
    while (currentIndex !== 0) {
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

// ========== UI: Sidebar ==========

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuBtn = document.querySelector('.menu-btn');

    if (menuBtn && sidebar && overlay) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.add('open');
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        });
    }

    // Profile dropdown
    const profileBtn = document.querySelector('.profile-btn');
    const profileMenu = document.getElementById('profile-menu');

    if (profileBtn && profileMenu) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('open');
        });

        document.addEventListener('click', () => {
            profileMenu.classList.remove('open');
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
});
