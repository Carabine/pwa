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
    setTodayWords([...shuffle(filteredTodayWords), currentWord])
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
        console.log(todayWords, 1)
        setTodayWords(todayWords.filter(w => w.data?.id !== currentWord.data.id))
        currentWord.showAt = calcNextDateToShow(currentWord.showAt, currentWord.period)
        if(todayWords.length < 0) return showNoWords()
    } else {
        console.log(todayWords, 2)
        setTodayWords(todayWords.filter(w => w.data?.id !== currentWord.data.id))
        setTodayWords([...shuffle(todayWords), currentWord])
    }
    currentWord = todayWords[0]
    saveWord(currentWord)
    displayFrontSideData(currentWord)
}

let progress
let todayWords = []
let currentWord

const setTodayWords = (words) => {
    todayWords = words
    todaysWordsOnChange()
}

const todaysWordsOnChange = () => {
    document.querySelector('.words-count .green').innerHTML = todayWords.filter(w => w.timesToShow === 1).length
    document.querySelector('.words-count .red').innerHTML = todayWords.filter(w => w.timesToShow === 2).length
}

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

    const freshWordsCount = Number(localStorage.getItem("freshWordsCount"))
    const temp = []
    const freshWords = words.slice(words.length - freshWordsCount, words.length)
    console.log(freshWords,words.length, words.length - freshWordsCount, freshWordsCount)
    const learnedWords = shuffle(words.slice(0, words.length - freshWordsCount))
    const slicedWords = [
        ...freshWords,
        ...learnedWords.slice(0, Math.round(learnedWords.length * 30 / 100)  )
    ]

    for(let i = 0; i < slicedWords.length; i++) {

            temp.push({
                data: slicedWords[i],
                showAt: removeTimeFromDate(new Date()),
                period: 0,
                timesToShow: 2,
            })

    }

    setProgress(temp)

    setTodayWords(progress)

    setTodayWords(shuffle(todayWords))

    currentWord = todayWords[0]
    displayFrontSideData(currentWord);
    console.log(localStorage.getItem('words'))
}

window.addEventListener('load', () => {
    let freshWordsCount = Number(localStorage.getItem("freshWordsCount") ?? "0")
    if(!freshWordsCount) {
        const words = JSON.parse(localStorage.getItem('words') ?? "[]")
        freshWordsCount = words.length
        localStorage.setItem("freshWordsCount", freshWordsCount.toString())
    }
    const freshWordsInput = document.querySelector('.fresh-words-input input')
    freshWordsInput.value = freshWordsCount

    freshWordsInput.addEventListener("input", e => {
        e.stopPropagation()
        localStorage.setItem("freshWordsCount", e.target.value)
        freshWordsInput.value = e.target.value
    })

    document.querySelector('.refresh-btn').addEventListener('click', onLoad);

    document.querySelector('.fetch-button').addEventListener('click', async () => {
        await fetchDataFromServer()
        onLoad()
    });

    onLoad()
});
