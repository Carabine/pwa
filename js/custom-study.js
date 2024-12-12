document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal-overlay');
    const openModalBtn = document.getElementById('open-modal-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');

    openModalBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    });
});

function displayFrontSideData(word) {
    const cardBackSide = document.querySelector('.back-side');
    const cardFrontSide = document.querySelector('.front-side');

    cardBackSide.innerHTML = ''
    cardFrontSide.innerHTML = ''

    const wordEl = document.createElement("div")
    wordEl.classList.add("word")
    wordEl.innerText = word.data?.word ?? ''

    cardFrontSide.appendChild(wordEl);

    const showBtn = document.createElement("button")
    showBtn.classList.add('show-btn')
    showBtn.innerHTML = 'Show answer'

    showBtn.addEventListener("click", () => displayBackSideData(word))

    document.querySelector(".buttons").innerHTML = ''

    document.querySelector(".buttons").appendChild(showBtn)

    document.querySelector('.hint-btn').classList.add("hidden")
}

function displayBackSideData(word) {
    console.log(123)
    const cardBackSide = document.querySelector('.back-side');
    // Clear previous data
    // Display new data

    const video = document.createElement("video")
    console.log(word)
    video.src = word.data.Video.url
    //video.src = 'https://drive.google.com/uc?export=download&id=11ca1x_2lQqdJJy6qX7lDWKHMoJjpZ0gR'
    video.controls = true
    video.autoplay = true
    //video.height = 300
    video.width = 500

    // var startTime = word.data.videoStart;
    // var endTime = word.data.videoEnd;
    //
    // video.currentTime = startTime;
    //
    // video.addEventListener('timeupdate', function() {
    //     if (video.currentTime >= endTime) {
    //         video.pause();
    //         video.currentTime = startTime;
    //     }
    // }, false);

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
    cardBackSide.appendChild(meaningEl);
    cardBackSide.appendChild(hiraganaEl);
    cardBackSide.appendChild(sentenceEl);
    cardBackSide.appendChild(translatedSentenceEl);

    console.log(localStorage.getItem('words'))

    const keepWordBtn = document.createElement("button")
    keepWordBtn.innerHTML = "Bad"
    keepWordBtn.classList.add('keep-word-btn')

    const buryWordBtn = document.createElement("button")
    buryWordBtn.innerHTML = "Good"
    buryWordBtn.classList.add('bury-word-btn')

    keepWordBtn.addEventListener('click', keepWord);
    buryWordBtn.addEventListener('click', buryWord);

    document.querySelector(".buttons").innerHTML = ''

    document.querySelector(".buttons").appendChild(keepWordBtn)
    document.querySelector(".buttons").appendChild(buryWordBtn)
    if(word.data.hint) {
        document.querySelector('.hint-btn').classList.remove("hidden")
        document.querySelector('#modal-content').innerHTML = word.data.hint
    }
}

const keepWord = () => {
    const filteredTodayWords = todayWords.filter(w => w.data.id !== currentWord.data.id)
    setTodayWords([...shuffle(filteredTodayWords), currentWord])
    currentWord = todayWords[0]
    console.log(todayWords)
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
    if(!todayWords.length) {
        onLoad()
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
    if(!currentWord) {
        console.log("no words", todayWords)
        return
    }
    displayFrontSideData(currentWord);
    console.log(localStorage.getItem('words'))
}

window.addEventListener('load', async() => {
    await fetchDataFromServer()

    localStorage.setItem('freshWordsCount', 999)

    let freshWordsCount = Number(localStorage.getItem("freshWordsCount") ?? "0")
    if(!freshWordsCount) {
        const words = JSON.parse(localStorage.getItem('words') ?? "[]")
        freshWordsCount = words.length
        localStorage.setItem("freshWordsCount", freshWordsCount.toString())
    }

    onLoad()
});
