// ========== Modal ==========

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal-overlay');
    const openModalBtn = document.getElementById('open-modal-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');

    openModalBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
});

// ========== Display ==========

function displayFrontSideData(word) {
    const cardBackSide = document.querySelector('.back-side');
    const cardFrontSide = document.querySelector('.front-side');

    cardBackSide.innerHTML = '';
    cardFrontSide.innerHTML = '';

    const wordEl = document.createElement('div');
    wordEl.classList.add('word');
    wordEl.innerText = word.data?.word ?? '';
    cardFrontSide.appendChild(wordEl);

    const showBtn = document.createElement('button');
    showBtn.classList.add('show-btn');
    showBtn.innerHTML = 'Show answer';
    showBtn.addEventListener('click', () => displayBackSideData(word));

    document.querySelector('.buttons').innerHTML = '';
    document.querySelector('.buttons').appendChild(showBtn);
    document.querySelector('.hint-btn').classList.add('hidden');
}

function displayBackSideData(word) {
    const cardBackSide = document.querySelector('.back-side');

    const videoSrc = word.data.Video ? word.data.Video.url : (word.data.video ?? '');

    if (videoSrc) {
        const video = document.createElement('video');
        video.src = videoSrc;
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '100%';
        cardBackSide.appendChild(video);
    }

    const meaningEl = document.createElement('div');
    meaningEl.classList.add('meaning');
    meaningEl.innerText = word.data.meaning ?? '';
    cardBackSide.appendChild(meaningEl);

    const hiraganaEl = document.createElement('div');
    hiraganaEl.classList.add('hiragana');
    hiraganaEl.innerText = word.data.kana ?? '';
    cardBackSide.appendChild(hiraganaEl);

    const sentenceEl = document.createElement('div');
    sentenceEl.classList.add('sentence');
    sentenceEl.innerText = word.data.sentence ?? '';
    cardBackSide.appendChild(sentenceEl);

    const translatedSentenceEl = document.createElement('div');
    translatedSentenceEl.classList.add('translatedSentence');
    translatedSentenceEl.innerText = word.data.translatedSentence ?? '';
    cardBackSide.appendChild(translatedSentenceEl);

    const keepWordBtn = document.createElement('button');
    keepWordBtn.innerHTML = 'Bad';
    keepWordBtn.classList.add('keep-word-btn');
    keepWordBtn.addEventListener('click', keepWord);

    const buryWordBtn = document.createElement('button');
    buryWordBtn.innerHTML = 'Good';
    buryWordBtn.classList.add('bury-word-btn');
    buryWordBtn.addEventListener('click', buryWord);

    document.querySelector('.buttons').innerHTML = '';
    document.querySelector('.buttons').appendChild(keepWordBtn);
    document.querySelector('.buttons').appendChild(buryWordBtn);

    if (word.data.hint) {
        document.querySelector('.hint-btn').classList.remove('hidden');
        document.querySelector('#modal-content').innerHTML = word.data.hint;
    }
}

// ========== Study Logic ==========

let progress;
let todayWords = [];
let currentWord;

function setTodayWords(words) {
    todayWords = words;
    updateWordCounts();
}

function updateWordCounts() {
    document.querySelector('.words-count .green').innerHTML = todayWords.filter(w => w.timesToShow === 1).length;
    document.querySelector('.words-count .red').innerHTML = todayWords.filter(w => w.timesToShow === 2).length;
}

function saveWord(word) {
    setProgress(progress.map(p => p.data.id !== word.data.id ? p : word));
}

function setProgress(data) {
    progress = data;
}

function removeTimeFromDate(date) {
    return new Date(date.setHours(0, 0, 0, 0));
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function keepWord() {
    const filtered = todayWords.filter(w => w.data.id !== currentWord.data.id);
    setTodayWords([...shuffle(filtered), currentWord]);
    currentWord = todayWords[0];
    displayFrontSideData(currentWord);
}

function calcNextDateToShow(showAt, period) {
    if (period) {
        return addDays(removeTimeFromDate(new Date()), period * 2);
    }
    return addDays(removeTimeFromDate(new Date()), 1);
}

function buryWord() {
    currentWord.timesToShow--;
    if (currentWord.timesToShow < 1) {
        setTodayWords(todayWords.filter(w => w.data?.id !== currentWord.data.id));
        currentWord.showAt = calcNextDateToShow(currentWord.showAt, currentWord.period);
    } else {
        setTodayWords(todayWords.filter(w => w.data?.id !== currentWord.data.id));
        setTodayWords([...shuffle(todayWords), currentWord]);
    }
    if (!todayWords.length) {
        onLoad();
        return;
    }
    currentWord = todayWords[0];
    saveWord(currentWord);
    displayFrontSideData(currentWord);
}

// ========== Init ==========

function onLoad() {
    const words = JSON.parse(localStorage.getItem('words') ?? '[]');
    progress = JSON.parse(localStorage.getItem('progress') ?? '[]');

    const temp = [];
    for (let i = 0; i < words.length; i++) {
        temp.push({
            data: words[i],
            showAt: removeTimeFromDate(new Date()),
            period: 0,
            timesToShow: 2,
        });
    }

    setProgress(temp);
    setTodayWords(progress);
    setTodayWords(shuffle(todayWords));

    currentWord = todayWords[0];
    if (!currentWord) return;
    displayFrontSideData(currentWord);
}

window.addEventListener('load', async () => {
    await fetchDataFromServer();
    onLoad();
});
