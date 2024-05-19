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
    //video.height = 300
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

    const translatedSentenceEl = document.createElement("div")
    translatedSentenceEl.classList.add("translatedSentence")
    translatedSentenceEl.innerText = data.translatedSentence

    const meaningEl = document.createElement("div")
    meaningEl.classList.add("meaning")
    meaningEl.innerText = data.meaning

    cardBackSide.appendChild(video);
    cardBackSide.appendChild(audio);
    cardBackSide.appendChild(meaningEl);
    cardBackSide.appendChild(hiraganaEl);
    cardBackSide.appendChild(sentenceEl);
    cardBackSide.appendChild(translatedSentenceEl);

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

window.addEventListener('load', () => {
    document.querySelector('.fetch-button').addEventListener('click', async () => {
        await fetchDataFromServer()
        onLoad()
    });

    document.querySelector('.refresh-btn').addEventListener('click', refresh);

    onLoad()
});

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // Prevent the default browser install prompt
});