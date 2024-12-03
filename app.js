if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js', { scope: '/' })
        .then(function(registration) {
            console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch(function(error) {
            console.error('Service Worker registration failed:', error);
        });
}


async function fetchDataFromServer() {
    try {
        const response = await fetch('https://animei.space/words/test');
        const data = await response.json();
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
