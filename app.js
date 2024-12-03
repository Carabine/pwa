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
        const response = await fetch('http://localhost:3005/words/test');
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

    // While there remain elements to shuffle...
    while (currentIndex != 0) {

        // Pick a remaining element...
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array
}
