if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(() => console.log('Service Worker registered'))
            .catch((err) => console.error('Service Worker failed:', err));
    });
}

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const installButton = document.getElementById('install-button');
    installButton.style.display = 'block';

    installButton.addEventListener('click', () => {
        deferredPrompt.prompt();

        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            deferredPrompt = null;
        });
    });
});


const emitLocalStorageEvent = (key, oldValue, newValue) => {
    window.dispatchEvent(new CustomEvent('localStorageChanged', {
        detail: { key, oldValue, newValue }
    }));
};

const originalSetItem = localStorage.setItem;
localStorage.setItem = function (key, value) {
    const oldValue = localStorage.getItem(key);
    originalSetItem.apply(this, [key, value]);
    emitLocalStorageEvent(key, oldValue, value);
};

const originalRemoveItem = localStorage.removeItem;
localStorage.removeItem = function (key) {
    const oldValue = localStorage.getItem(key);
    originalRemoveItem.apply(this, [key]);
    emitLocalStorageEvent(key, oldValue, null);
};

window.addEventListener('localStorageChanged', (event) => {
    const { key, oldValue, newValue } = event.detail;
    console.log(`LocalStorage changed: ${key}, Old: ${oldValue}, New: ${newValue}`);
    if(key === accessTokenKey) {
        checkAuth()
    }
});

async function fetchDataFromServer() {
    try {
        // const response = await client.get(domain + '/words')
        // const { data } = response;
        const res = await fetch('./data2.json')
        const data = await res.json()
        console.log(data)
        //const res = await fetch('data.json')
        //const data = await res.json()
        //console.log(JSON.stringify(data.words))
        const changedData = data.data.map(d => ({...d, url: d.url, word: d.kanji, meaning: d.translation, translatedSentence: d.sentenceTranslation}))
        localStorage.setItem('words', JSON.stringify(changedData));
        // Display the fetched data
        onLoad()
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function shuffle(array) {
    let currentIndex = array.length;

    while (currentIndex != 0) {

        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array
}

window.addEventListener('DOMContentLoaded', function (evt) {
    checkAuth()

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuBtn = document.querySelector('.menu-btn');
    const logoutBtn = document.querySelector('#logout-btn');
    const profileButton = document.getElementById("profile-button");
    const dropdownMenu = document.getElementById("profile-menu");

    function openSidebar() {
        sidebar?.classList.add('active-sidebar');
        overlay?.classList.add('active');
    }

    function closeSidebar() {
        sidebar?.classList.remove('active-sidebar');
        overlay?.classList.remove('active');
    }

    menuBtn?.addEventListener('click', openSidebar);
    overlay?.addEventListener('click', closeSidebar);
    logoutBtn?.addEventListener('click', logout);

    profileButton?.addEventListener("click", function (event) {
        dropdownMenu.classList.toggle("hidden");

        event.stopPropagation();
    });

    window.addEventListener("click", function (event) {
        if (!profileButton?.contains(event.target) && !dropdownMenu?.contains(event.target)) {
            dropdownMenu.classList.add("hidden");
        }
    });
})