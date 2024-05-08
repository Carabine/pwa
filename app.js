// Check if the browser supports service workers
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
        const data = {
            "words": [
                {
                    "id": "423432432",
                    "kana": "ざんねんな",
                    "word": "残念な",
                    "audio": "https://media.kanjialive.com/examples_audio/audio-mp3/zan-noko(ru)_06_a.mp3",
                    "video": "https://i.imgur.com/4LJ5Xgc.mp4",
                    "meaning": "unfortunate, disappointing",
                    "sentence": "残念 … 何が"
                },
                {
                    "id": "2324324",
                    "kana": "ゆめ",
                    "word": "夢",
                    "audio": "https://media.kanjialive.com/examples_audio/audio-mp3/yume_06_d.mp3",
                    "video": "https://i.imgur.com/53Etqza.mp4",
                    "meaning": "dream [n.]",
                    "sentence": "夢 か 何か 寝不足 だ な"
                },
                {
                    "id": "12345",
                    "kana": "さくや",
                    "word": "昨夜",
                    "audio": "https://media.kanjialive.com/examples_audio/audio-mp3/saku(jitsu)_06_a.mp3",
                    "video": "https://i.imgur.com/cgt9CW6.mp4",
                    "meaning": "last night",
                    "sentence": "昨夜 の 本当 びっくり し た"
                }
            ]
        }
        // Update localStorage with the fetched data
        console.log(JSON.stringify(data.words))
        localStorage.setItem('words', JSON.stringify(data.words));
        // Display the fetched data
        onLoad()
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function displayFrontSideData(data) {
    const cardBackSide = document.querySelector('.back-side');
    const cardFrontSide = document.querySelector('.front-side');

    cardBackSide.innerHTML = ''
    cardFrontSide.innerHTML = ''

    const wordEl = document.createElement("div")
    wordEl.classList.add("word")
    wordEl.innerText = data.word

    cardFrontSide.appendChild(wordEl);

    const showBtn = document.createElement("button")
    showBtn.innerHTML = 'Show'

    showBtn.addEventListener("click", () => displayBackSideData(data))

    document.querySelector(".buttons").innerHTML = ''

    document.querySelector(".buttons").appendChild(showBtn)
}

function displayBackSideData(data) {
    console.log(123)
    const cardBackSide = document.querySelector('.back-side');
    // Clear previous data
    // Display new data

    const video = document.createElement("video")
    video.src = data.video
    video.controls = true
    video.autoplay = true
    video.height = 300
    video.width = 500

    const audio = document.createElement("audio")
    audio.src = data.audio
    audio.controls = true
    audio.volume = 0.4

    const hiraganaEl = document.createElement("div")
    hiraganaEl.classList.add("hiragana")
    hiraganaEl.innerText = data.kana

    const sentenceEl = document.createElement("div")
    sentenceEl.classList.add("sentence")
    sentenceEl.innerText = data.sentence

    const meaningEl = document.createElement("div")
    meaningEl.classList.add("meaning")
    meaningEl.innerText = data.meaning

    cardBackSide.appendChild(video);
    cardBackSide.appendChild(audio);
    cardBackSide.appendChild(meaningEl);
    cardBackSide.appendChild(hiraganaEl);
    cardBackSide.appendChild(sentenceEl);

    console.log(localStorage.getItem('words'))

    const keepWordBtn = document.createElement("button")
    keepWordBtn.innerHTML = "Bad"

    const buryWordBtn = document.createElement("button")
    buryWordBtn.innerHTML = "Good"

    keepWordBtn.addEventListener('click', keepWord);
    buryWordBtn.addEventListener('click', buryWord);

    document.querySelector(".buttons").innerHTML = ''

    document.querySelector(".buttons").appendChild(keepWordBtn)
    document.querySelector(".buttons").appendChild(buryWordBtn)
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

let wordsPool
let currentWord

const setWordsPool = (data) => {
    localStorage.setItem("wordsPool", JSON.stringify(data))
    wordsPool = data
}

const keepWord = () => {
    const filteredPool = wordsPool.filter(w => w.id !== currentWord.id)
    setWordsPool([...shuffle(filteredPool), currentWord])
    currentWord = wordsPool[0]
    displayFrontSideData(currentWord)
}

const buryWord = () => {
    setWordsPool(wordsPool.filter(w => w.id !== currentWord.id))
    currentWord = wordsPool[0]
    displayFrontSideData(currentWord)
}

const refresh = () => {
    const words = JSON.parse(localStorage.getItem('words') ?? "[]")

    setWordsPool(words)
    currentWord = wordsPool[0]
    displayFrontSideData(currentWord)
}

document.querySelector('.fetch-button').addEventListener('click', fetchDataFromServer);

document.querySelector('.refresh-btn').addEventListener('click', refresh);

const onLoad = () => {
    console.log(localStorage.getItem('wordsPool'))
    const words = JSON.parse(localStorage.getItem('words') ?? "[]")
    wordsPool = JSON.parse(localStorage.getItem('wordsPool') ?? "[]")

    if (words) {
        if(wordsPool.length === 0) {
            setWordsPool(shuffle(words))
            wordsPool = words
        }

        currentWord = wordsPool[0]
        displayFrontSideData(currentWord);
        console.log(localStorage.getItem('words'))
    }

}
// On page load, check if data is available in localStorage and display it
window.addEventListener('load', () => {
    onLoad()
});

// Check if the app can be installed
window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // Prevent the default browser install prompt
});
