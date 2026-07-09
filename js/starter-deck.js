// Стартовая колода для новичков: 50 простых слов и фраз из известных аниме.
// Нужна тем, у кого коллекция ещё пустая — можно начать учиться сразу,
// не собирая слова из субтитров.
//
// Формат карточки:
//   k  — слово (кандзи или кана), ложится в поле kanji
//   r  — чтение хираганой
//   ro — ромадзи
//   a  — из какого аниме (международное название)
//   s  — простое предложение-пример на японском
//   t  — переводы по языкам: [перевод слова, перевод предложения]
//
// Первые 15 карточек — ядро колоды: именно их предлагаем добавить
// при пустой коллекции (см. study-core.js).

const STARTER_CORE_COUNT = 15;

const STARTER_DECK = [
    { k: '友達', r: 'ともだち', ro: 'tomodachi', a: 'Naruto', s: '友達を守る！',
      t: { ru: ['друг', 'Я защищу своих друзей!'], uk: ['друг', 'Я захищу своїх друзів!'], en: ['friend', 'I will protect my friends!'] } },
    { k: '夢', r: 'ゆめ', ro: 'yume', a: 'One Piece', s: '海賊王になるのが夢だ！',
      t: { ru: ['мечта; сон', 'Моя мечта — стать королём пиратов!'], uk: ['мрія; сон', 'Моя мрія — стати королем піратів!'], en: ['dream', 'My dream is to become the Pirate King!'] } },
    { k: '仲間', r: 'なかま', ro: 'nakama', a: 'One Piece', s: '仲間はいつも一緒だ。',
      t: { ru: ['товарищ; свои', 'Товарищи всегда вместе.'], uk: ['товариш; свої', 'Товариші завжди разом.'], en: ['comrade; crewmate', 'Comrades are always together.'] } },
    { k: '諦める', r: 'あきらめる', ro: 'akirameru', a: 'Naruto', s: '諦めないで！',
      t: { ru: ['сдаваться; отказываться', 'Не сдавайся!'], uk: ['здаватися; відмовлятися', 'Не здавайся!'], en: ['to give up', "Don't give up!"] } },
    { k: '大丈夫', r: 'だいじょうぶ', ro: 'daijoubu', a: 'One-Punch Man', s: '大丈夫？',
      t: { ru: ['в порядке; всё хорошо', 'Ты в порядке?'], uk: ['у порядку; все гаразд', 'Ти в порядку?'], en: ['okay; all right', 'Are you okay?'] } },
    { k: '魔法', r: 'まほう', ro: 'mahou', a: 'Frieren', s: '魔法は不思議だ。',
      t: { ru: ['магия', 'Магия удивительна.'], uk: ['магія', 'Магія дивовижна.'], en: ['magic', 'Magic is mysterious.'] } },
    { k: '勇者', r: 'ゆうしゃ', ro: 'yuusha', a: 'Frieren', s: '勇者ヒンメルはそう言った。',
      t: { ru: ['герой', 'Так сказал герой Химмель.'], uk: ['герой', 'Так сказав герой Хіммель.'], en: ['hero', 'That is what the hero Himmel said.'] } },
    { k: '巨人', r: 'きょじん', ro: 'kyojin', a: 'Attack on Titan', s: '巨人が壁を壊した！',
      t: { ru: ['великан; титан', 'Титан разрушил стену!'], uk: ['велетень; титан', 'Титан зруйнував стіну!'], en: ['giant; titan', 'A titan broke the wall!'] } },
    { k: '戦う', r: 'たたかう', ro: 'tatakau', a: 'Attack on Titan', s: '戦え！',
      t: { ru: ['сражаться', 'Сражайся!'], uk: ['битися', 'Бийся!'], en: ['to fight', 'Fight!'] } },
    { k: '鬼', r: 'おに', ro: 'oni', a: 'Demon Slayer', s: '鬼は夜に来る。',
      t: { ru: ['демон; они', 'Демоны приходят ночью.'], uk: ['демон; оні', 'Демони приходять уночі.'], en: ['demon; oni', 'Demons come at night.'] } },
    { k: '名前', r: 'なまえ', ro: 'namae', a: 'Your Name', s: '君の名前は？',
      t: { ru: ['имя', 'Как тебя зовут?'], uk: ["ім'я", 'Як тебе звати?'], en: ['name', 'What is your name?'] } },
    { k: '好き', r: 'すき', ro: 'suki', a: 'Kaguya-sama', s: '君が好きだ。',
      t: { ru: ['нравится; любимый', 'Ты мне нравишься.'], uk: ['подобається; улюблений', 'Ти мені подобаєшся.'], en: ['to like; beloved', 'I like you.'] } },
    { k: 'ありがとう', r: 'ありがとう', ro: 'arigatou', a: 'Haikyuu!!', s: '本当にありがとう。',
      t: { ru: ['спасибо', 'Спасибо большое.'], uk: ['дякую', 'Щиро дякую.'], en: ['thank you', 'Thank you so much.'] } },
    { k: '行く', r: 'いく', ro: 'iku', a: 'One Piece', s: '一緒に行こう！',
      t: { ru: ['идти; ехать', 'Пойдём вместе!'], uk: ['іти; їхати', 'Ходімо разом!'], en: ['to go', "Let's go together!"] } },
    { k: '待つ', r: 'まつ', ro: 'matsu', a: 'Naruto', s: 'ちょっと待って！',
      t: { ru: ['ждать', 'Подожди немного!'], uk: ['чекати', 'Зачекай трохи!'], en: ['to wait', 'Wait a second!'] } },

    // ---- дальше остальная колода (для режима новичков) ----
    { k: '頑張る', r: 'がんばる', ro: 'ganbaru', a: 'My Hero Academia', s: '明日も頑張ろう！',
      t: { ru: ['стараться изо всех сил', 'Завтра тоже постараемся!'], uk: ['старатися з усіх сил', 'Завтра теж постараємося!'], en: ['to do your best', "Let's do our best tomorrow too!"] } },
    { k: '旅', r: 'たび', ro: 'tabi', a: 'Frieren', s: '旅はまだ続く。',
      t: { ru: ['путешествие', 'Путешествие ещё продолжается.'], uk: ['подорож', 'Подорож ще триває.'], en: ['journey', 'The journey still continues.'] } },
    { k: '自由', r: 'じゆう', ro: 'jiyuu', a: 'Attack on Titan', s: '自由はあの空にある。',
      t: { ru: ['свобода', 'Свобода — там, в небе.'], uk: ['свобода', 'Свобода — там, у небі.'], en: ['freedom', 'Freedom is up in that sky.'] } },
    { k: '呼吸', r: 'こきゅう', ro: 'kokyuu', a: 'Demon Slayer', s: '水の呼吸！',
      t: { ru: ['дыхание', 'Дыхание воды!'], uk: ['дихання', 'Дихання води!'], en: ['breathing', 'Water breathing!'] } },
    { k: '妹', r: 'いもうと', ro: 'imouto', a: 'Demon Slayer', s: '妹を守りたい。',
      t: { ru: ['младшая сестра', 'Хочу защитить младшую сестру.'], uk: ['молодша сестра', 'Хочу захистити молодшу сестру.'], en: ['younger sister', 'I want to protect my little sister.'] } },
    { k: '会う', r: 'あう', ro: 'au', a: 'Your Name', s: 'また会いましょう。',
      t: { ru: ['встречаться', 'Давай встретимся снова.'], uk: ['зустрічатися', 'Зустріньмося знову.'], en: ['to meet', "Let's meet again."] } },
    { k: '世界', r: 'せかい', ro: 'sekai', a: 'Death Note', s: '新しい世界を作る。',
      t: { ru: ['мир (вселенная)', 'Я создам новый мир.'], uk: ['світ', 'Я створю новий світ.'], en: ['world', 'I will create a new world.'] } },
    { k: '正義', r: 'せいぎ', ro: 'seigi', a: 'Death Note', s: 'これが正義だ。',
      t: { ru: ['справедливость', 'Вот это — справедливость.'], uk: ['справедливість', 'Ось це — справедливість.'], en: ['justice', 'This is justice.'] } },
    { k: '死神', r: 'しにがみ', ro: 'shinigami', a: 'Death Note', s: '死神はリンゴが好きだ。',
      t: { ru: ['бог смерти; синигами', 'Бог смерти любит яблоки.'], uk: ['бог смерті; сініґамі', 'Бог смерті любить яблука.'], en: ['god of death; shinigami', 'The shinigami loves apples.'] } },
    { k: '呪い', r: 'のろい', ro: 'noroi', a: 'Jujutsu Kaisen', s: '呪いは怖い。',
      t: { ru: ['проклятие', 'Проклятия страшные.'], uk: ['прокляття', 'Прокляття страшні.'], en: ['curse', 'Curses are scary.'] } },
    { k: '力', r: 'ちから', ro: 'chikara', a: 'Jujutsu Kaisen', s: 'もっと力が欲しい。',
      t: { ru: ['сила', 'Хочу больше силы.'], uk: ['сила', 'Хочу більше сили.'], en: ['power; strength', 'I want more power.'] } },
    { k: '先生', r: 'せんせい', ro: 'sensei', a: 'Assassination Classroom', s: '先生、質問があります。',
      t: { ru: ['учитель', 'Учитель, у меня вопрос.'], uk: ['учитель', 'Учителю, у мене запитання.'], en: ['teacher', 'Teacher, I have a question.'] } },
    { k: '先輩', r: 'せんぱい', ro: 'senpai', a: 'Haikyuu!!', s: '先輩、待ってください！',
      t: { ru: ['старший товарищ; семпай', 'Семпай, подождите!'], uk: ['старший товариш; семпай', 'Семпаю, зачекайте!'], en: ['senior; senpai', 'Senpai, please wait!'] } },
    { k: '猫', r: 'ねこ', ro: 'neko', a: 'Sailor Moon', s: '黒い猫が話した！',
      t: { ru: ['кот; кошка', 'Чёрная кошка заговорила!'], uk: ['кіт; кішка', 'Чорна кішка заговорила!'], en: ['cat', 'The black cat spoke!'] } },
    { k: '月', r: 'つき', ro: 'tsuki', a: 'Sailor Moon', s: '月がきれいだね。',
      t: { ru: ['луна; месяц', 'Луна красивая, правда?'], uk: ['місяць (на небі)', 'Місяць гарний, правда?'], en: ['moon', 'The moon is beautiful, right?'] } },
    { k: '星', r: 'ほし', ro: 'hoshi', a: 'Dragon Ball', s: '空に星がたくさんある。',
      t: { ru: ['звезда', 'На небе много звёзд.'], uk: ['зірка', 'На небі багато зірок.'], en: ['star', 'There are many stars in the sky.'] } },
    { k: '強い', r: 'つよい', ro: 'tsuyoi', a: 'Dragon Ball', s: 'あいつは強すぎる！',
      t: { ru: ['сильный', 'Он слишком силён!'], uk: ['сильний', 'Він занадто сильний!'], en: ['strong', 'That guy is too strong!'] } },
    { k: '元気', r: 'げんき', ro: 'genki', a: 'Dragon Ball', s: '元気ですか？',
      t: { ru: ['бодрый; здоровый', 'Как дела? (Ты бодр?)'], uk: ['бадьорий; здоровий', 'Як справи? (Ти бадьорий?)'], en: ['energetic; well', 'How are you? (Are you well?)'] } },
    { k: '飛ぶ', r: 'とぶ', ro: 'tobu', a: "Kiki's Delivery Service", s: '空を飛びたい！',
      t: { ru: ['летать', 'Хочу летать по небу!'], uk: ['літати', 'Хочу літати в небі!'], en: ['to fly', 'I want to fly in the sky!'] } },
    { k: '森', r: 'もり', ro: 'mori', a: 'My Neighbor Totoro', s: '森にトトロがいる。',
      t: { ru: ['лес', 'В лесу живёт Тоторо.'], uk: ['ліс', 'У лісі живе Тоторо.'], en: ['forest', 'Totoro lives in the forest.'] } },
    { k: '雨', r: 'あめ', ro: 'ame', a: 'My Neighbor Totoro', s: '雨が降っている。',
      t: { ru: ['дождь', 'Идёт дождь.'], uk: ['дощ', 'Іде дощ.'], en: ['rain', 'It is raining.'] } },
    { k: '風', r: 'かぜ', ro: 'kaze', a: 'The Wind Rises', s: '風が強い。',
      t: { ru: ['ветер', 'Ветер сильный.'], uk: ['вітер', 'Вітер сильний.'], en: ['wind', 'The wind is strong.'] } },
    { k: '心', r: 'こころ', ro: 'kokoro', a: 'Clannad', s: '心が痛い。',
      t: { ru: ['сердце; душа', 'На сердце больно.'], uk: ['серце; душа', 'На серці боляче.'], en: ['heart; soul', 'My heart hurts.'] } },
    { k: '涙', r: 'なみだ', ro: 'namida', a: 'Your Lie in April', s: '涙が止まらない。',
      t: { ru: ['слёзы', 'Слёзы не останавливаются.'], uk: ['сльози', 'Сльози не зупиняються.'], en: ['tears', 'The tears will not stop.'] } },
    { k: '笑う', r: 'わらう', ro: 'warau', a: 'Spy x Family', s: '彼女はいつも笑っている。',
      t: { ru: ['смеяться; улыбаться', 'Она всегда улыбается.'], uk: ['сміятися; усміхатися', 'Вона завжди усміхається.'], en: ['to laugh; to smile', 'She is always smiling.'] } },
    { k: 'ごめん', r: 'ごめん', ro: 'gomen', a: 'Horimiya', s: '遅れてごめん！',
      t: { ru: ['прости', 'Прости за опоздание!'], uk: ['вибач', 'Вибач за запізнення!'], en: ['sorry', 'Sorry I am late!'] } },
    { k: '助ける', r: 'たすける', ro: 'tasukeru', a: 'Attack on Titan', s: '助けて！',
      t: { ru: ['спасать; помогать', 'Помогите! Спасите!'], uk: ['рятувати; допомагати', 'Допоможіть! Рятуйте!'], en: ['to help; to save', 'Help me!'] } },
    { k: '分かる', r: 'わかる', ro: 'wakaru', a: 'Jujutsu Kaisen', s: '分かった。',
      t: { ru: ['понимать', 'Понял.'], uk: ['розуміти', 'Зрозумів.'], en: ['to understand', 'Got it.'] } },
    { k: '食べる', r: 'たべる', ro: 'taberu', a: 'Spirited Away', s: '何か食べたい。',
      t: { ru: ['есть (кушать)', 'Хочу что-нибудь съесть.'], uk: ['їсти', 'Хочу щось з’їсти.'], en: ['to eat', 'I want to eat something.'] } },
    { k: '水', r: 'みず', ro: 'mizu', a: 'Dr. Stone', s: '水をください。',
      t: { ru: ['вода', 'Дайте воды, пожалуйста.'], uk: ['вода', 'Дайте води, будь ласка.'], en: ['water', 'Water, please.'] } },
    { k: '火', r: 'ひ', ro: 'hi', a: 'Fire Force', s: '火に気をつけて。',
      t: { ru: ['огонь', 'Осторожно с огнём.'], uk: ['вогонь', 'Обережно з вогнем.'], en: ['fire', 'Be careful with fire.'] } },
    { k: '空', r: 'そら', ro: 'sora', a: 'Your Name', s: '空がきれいだ。',
      t: { ru: ['небо', 'Небо красивое.'], uk: ['небо', 'Небо гарне.'], en: ['sky', 'The sky is beautiful.'] } },
    { k: '声', r: 'こえ', ro: 'koe', a: 'A Silent Voice', s: '君の声が聞きたい。',
      t: { ru: ['голос', 'Хочу услышать твой голос.'], uk: ['голос', 'Хочу почути твій голос.'], en: ['voice', 'I want to hear your voice.'] } },
    { k: '学校', r: 'がっこう', ro: 'gakkou', a: 'Assassination Classroom', s: '学校に行きたくない。',
      t: { ru: ['школа', 'Не хочу идти в школу.'], uk: ['школа', 'Не хочу йти до школи.'], en: ['school', 'I do not want to go to school.'] } },
    { k: '忘れる', r: 'わすれる', ro: 'wasureru', a: 'Your Name', s: '君を忘れない。',
      t: { ru: ['забывать', 'Я тебя не забуду.'], uk: ['забувати', 'Я тебе не забуду.'], en: ['to forget', 'I will not forget you.'] } },
];

// Видеоклипы к карточкам: настоящие моменты из серий, нарезаны скриптом
// animei-backend/scripts/build-starter-clips.mjs. Файлы лежат в pwa/media/starter/.
// Ключ — слово; s — реальная фраза из серии, tr — переводы фразы,
// a — аниме, откуда клип, len — длительность в секундах.
const STARTER_CLIPS = {};

// Карточка с учётом найденного клипа: фраза, переводы фразы и аниме
// подменяются на настоящие — из той серии, откуда вырезан клип.
function starterCard(card) {
    const c = STARTER_CLIPS[card.k];
    if (!c) return card;
    const t = {};
    for (const lang of ['ru', 'uk', 'en']) {
        t[lang] = [card.t[lang] ? card.t[lang][0] : card.t.ru[0], c.tr[lang] || c.tr.ru];
    }
    return { ...card, s: c.s, a: c.a, clip: c.clip, len: c.len, t };
}

function starterMergedDeck() {
    return STARTER_DECK.map(starterCard);
}

// Адрес клипа: страницы лежат в /app/pages/, клипы — в /app/media/starter/.
function starterClipUrl(card) {
    if (!card.clip) return '';
    const inPages = window.location.pathname.includes('/pages/');
    const rel = (inPages ? '../' : './') + 'media/starter/' + card.clip;
    return new URL(rel, window.location.href).href;
}

// Переводы карточки на текущем языке интерфейса (запасной — русский).
function starterTr(card) {
    const lang = typeof getLang === 'function' ? getLang() : 'ru';
    return card.t[lang] || card.t.ru;
}

// Карточка в серверной форме слова — для сохранения в коллекцию.
// videoUrl указывает на готовый клип: сервер (или ручка /words/clip для гостя)
// перекодирует его в личный клип слова, как это происходит со словами из плеера.
function starterWordPayload(card) {
    const tr = starterTr(card);
    return {
        kanji: card.k,
        kana: card.r,
        romaji: card.ro,
        translation: tr[0],
        sentence: card.s,
        sentenceTranslation: tr[1],
        hint: t('starter.fromAnime') + ' ' + card.a,
        videoStart: 0,
        videoEnd: card.len ? Math.ceil(card.len) : 0,
        videoUrl: starterClipUrl(card),
    };
}

// Вся колода в форме слов для движка обучения (режим для новичков).
function starterDeckWords() {
    return starterMergedDeck().map((card, i) => {
        const tr = starterTr(card);
        return {
            id: 'starter-' + i,
            kanji: card.k,
            word: card.k,
            kana: card.r,
            romaji: card.ro,
            meaning: tr[0],
            translation: tr[0],
            sentence: card.s,
            translatedSentence: tr[1],
            sentenceTranslation: tr[1],
            anime: card.a,
            video: starterClipUrl(card),
            _card: card,
        };
    });
}

// Слова из колоды, которых ещё нет в коллекции (сравниваем по написанию).
async function starterLoadSavedSet() {
    try {
        const words = await fetchWords();
        return new Set(words.map((w) => w.kanji));
    } catch {
        return new Set();
    }
}

// Добавить в коллекцию до limit слов из колоды (уже добавленные пропускаем).
// Возвращает, сколько реально добавили.
async function addStarterWords(limit) {
    const have = await starterLoadSavedSet();
    let added = 0;
    for (const card of starterMergedDeck()) {
        if (added >= limit) break;
        if (have.has(card.k)) continue;
        await saveWord(starterWordPayload(card));
        have.add(card.k);
        added++;
    }
    // Обновляем локальную копию слов, чтобы колода собралась заново
    if (typeof fetchDataFromServer === 'function') await fetchDataFromServer();
    return added;
}
