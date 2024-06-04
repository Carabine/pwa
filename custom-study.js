function displayFrontSideData(word) {
    const cardBackSide = document.querySelector('.back-side');
    const cardFrontSide = document.querySelector('.front-side');

    cardBackSide.innerHTML = ''
    cardFrontSide.innerHTML = ''

    const wordEl = document.createElement("div")
    wordEl.classList.add("word")
    wordEl.innerText = word.data.word

    cardFrontSide.appendChild(wordEl);

    const showBtn = document.createElement("button")
    showBtn.innerHTML = 'Show'

    showBtn.addEventListener("click", () => displayBackSideData(word))

    document.querySelector(".buttons").innerHTML = ''

    document.querySelector(".buttons").appendChild(showBtn)
}

function displayBackSideData(word) {
    console.log(123)
    const cardBackSide = document.querySelector('.back-side');
    // Clear previous data
    // Display new data

    const video = document.createElement("video")
    video.src = word.data.video
    video.controls = true
    video.autoplay = true
    //video.height = 300
    video.width = 500

    const audio = document.createElement("audio")
    audio.src = word.data.audio
    audio.controls = true
    audio.volume = 0.4

    const hiraganaEl = document.createElement("div")
    hiraganaEl.classList.add("hiragana")
    hiraganaEl.innerText = word.data.kana

    const sentenceEl = document.createElement("div")
    sentenceEl.classList.add("sentence")
    sentenceEl.innerText = word.data.sentence

    const translatedSentenceEl = document.createElement("div")
    translatedSentenceEl.classList.add("translatedSentence")
    translatedSentenceEl.innerText = word.data.translatedSentence

    const meaningEl = document.createElement("div")
    meaningEl.classList.add("meaning")
    meaningEl.innerText = word.data.meaning

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

const keepWord = () => {
    const filteredTodayWords = todayWords.filter(w => w.data.id !== currentWord.data.id)
    todayWords = [...shuffle(filteredTodayWords), currentWord]
    currentWord = todayWords[0]
    displayFrontSideData(currentWord)
}

const calcNextDateToShow = (showAt, period) => {
    if(period) {
        return addDays(removeTimeFromDate(new Date()), period * 2)
    } else {
        return addDays(removeTimeFromDate(new Date()), 1)
    }
}

const showNoWords = () => {
    alert("NO WORDS")
}

const buryWord = () => {
    currentWord.timesToShow--
    if(currentWord.timesToShow < 1) {
        todayWords = todayWords.filter(w => w.data.id !== currentWord.data.id)
        currentWord.showAt = calcNextDateToShow(currentWord.showAt, currentWord.period)
        if(todayWords.length < 0) return showNoWords()
    } else {
        todayWords = todayWords.filter(w => w.data.id !== currentWord.data.id)
        todayWords = [...shuffle(todayWords), currentWord]
    }
    currentWord = todayWords[0]
    saveWord(currentWord)
    displayFrontSideData(currentWord)

}

let progress
let todayWords = []
let currentWord

const saveWord = (word) => {
    setProgress(progress.map(p => p.data.id !== word.data.id ? p : word))
}

const setProgress = (data) => {
    progress = data
}

function removeTimeFromDate(date) {
    return new Date(date.setHours(0,0,0,0));
}

function addDays(date, days) {
    console.log(date, days)
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    console.log(result)
    return result;
}

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const onLoad = () => {
    console.log(localStorage.getItem('wordsPool'))
    const words = JSON.parse(localStorage.getItem('words') ?? "[]")
    progress = JSON.parse(localStorage.getItem('progress') ?? "[]")

    const freshWordsCount = localStorage.getItem("freshWordsCount") ?? 0
    const temp = []
    for(let i = 0; i <= words.length; i++) {
        console.log(new Date())
        console.log(removeTimeFromDate(new Date()))
        const isFreshWord = i < words.length - freshWordsCount
        if(isFreshWord || randomInteger(0, 1)) {
            temp.push({
                data: words[i],
                showAt: removeTimeFromDate(new Date()),
                period: 0,
                timesToShow: 2,
            })
        }
    }
    console.log(temp)
    setProgress(temp)

    todayWords = progress

    todayWords = shuffle(todayWords)

    currentWord = todayWords[0]
    displayFrontSideData(currentWord);
    console.log(localStorage.getItem('words'))
}

window.addEventListener('load', () => {
    const freshWordsInput = document.querySelector('.fresh-words-input input')
    freshWordsInput.value = localStorage.getItem("freshWordsCount") ?? 0

    freshWordsInput.addEventListener("input", e => {
        e.stopPropagation()
        localStorage.setItem("freshWordsCount", e.target.value)
        freshWordsInput.value = e.target.value
    })
    document.querySelector('.fetch-button').addEventListener('click', async () => {
        await fetchDataFromServer()
        onLoad()
    });

    onLoad()
});
