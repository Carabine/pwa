// ========== Display ==========

function displayFrontSideData(word) {
    const cardBackSide = document.querySelector('.back-side');
    const cardFrontSide = document.querySelector('.front-side');

    cardBackSide.innerHTML = '';
    cardFrontSide.innerHTML = '';

    const wordEl = document.createElement('div');
    wordEl.classList.add('word');
    wordEl.innerText = word.data.word ?? '';
    cardFrontSide.appendChild(wordEl);

    const showBtn = document.createElement('button');
    showBtn.classList.add('show-btn');
    showBtn.innerHTML = 'Show';
    showBtn.addEventListener('click', () => displayBackSideData(word));

    document.querySelector('.buttons').innerHTML = '';
    document.querySelector('.buttons').appendChild(showBtn);
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

    if (word.data.audio) {
        const audio = document.createElement('audio');
        audio.src = word.data.audio;
        audio.controls = true;
        audio.volume = 0.4;
        cardBackSide.appendChild(audio);
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
}

// ========== Study Logic ==========

let progress;
let todayWords = [];
let currentWord;

function saveWord(word) {
    setProgress(progress.map(p => p.data.id !== word.data.id ? p : word));
}

function setProgress(data) {
    localStorage.setItem('progress', JSON.stringify(data));
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
    todayWords = [...shuffle(filtered), currentWord];
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
        todayWords = todayWords.filter(w => w.data.id !== currentWord.data.id);
        currentWord.showAt = calcNextDateToShow(currentWord.showAt, currentWord.period);
        if (todayWords.length === 0) {
            alert('No more words for today!');
            return;
        }
    } else {
        todayWords = todayWords.filter(w => w.data.id !== currentWord.data.id);
        todayWords = [...shuffle(todayWords), currentWord];
    }
    currentWord = todayWords[0];
    saveWord(currentWord);
    displayFrontSideData(currentWord);
}

// ========== Init ==========

function onLoad() {
    const words = JSON.parse(localStorage.getItem('words') ?? '[]');
    progress = JSON.parse(localStorage.getItem('progress') ?? '[]');

    if (progress.length === 0) {
        const temp = [];
        const length = words.length > 4 ? 4 : words.length;
        for (let i = 0; i < length; i++) {
            temp.push({
                data: words[i],
                showAt: removeTimeFromDate(new Date()),
                period: 0,
                timesToShow: 3,
            });
        }
        setProgress(temp);
    }

    const synced = [];
    for (const word of words) {
        const progressItem = progress.find(p => p.data.id === word.id);
        if (progressItem) {
            synced.push({ ...progressItem, data: word });
        }
    }
    setProgress(synced);

    todayWords = progress.filter(p => new Date(p.showAt) <= removeTimeFromDate(new Date()));

    if (!todayWords.length) {
        alert('No words to study today!');
        return;
    }

    todayWords = shuffle(todayWords);
    currentWord = todayWords[0];
    displayFrontSideData(currentWord);
}

window.addEventListener('load', async () => {
    await fetchDataFromServer();
    onLoad();
});
