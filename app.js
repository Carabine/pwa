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
        // const response = await fetch('your_server_endpoint');
        // const data = await response.json();
        const res = await fetch('data.json')
        const data = await res.json()
        // Update localStorage with the fetched data
        console.log(JSON.stringify(data.words))
        localStorage.setItem('words', JSON.stringify(data.words));
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
