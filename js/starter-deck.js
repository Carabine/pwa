// Стартовая колода для новичков: 50 простых слов и фраз из известных аниме.
// Нужна тем, у кого коллекция ещё пустая — можно начать учиться сразу,
// не собирая слова из субтитров.
//
// Формат карточки:
//   k    — слово (кандзи или кана), ложится в поле kanji
//   r    — чтение хираганой
//   ro   — ромадзи
//   a    — из какого аниме (международное название)
//   s    — простое предложение-пример на японском
//   t    — переводы по языкам: [перевод слова, перевод предложения]
//   clip — (только у ядра) абсолютный URL готового видеоклипа реальной сцены
//   len  — (только у ядра) длительность клипа в секундах
//   ts/te — окно воспроизведения внутри клипа, как в seed-аккаунте
//
// Первые 17 карточек (STARTER_CORE_COUNT) — ядро колоды: реальные сцены из
// аниме с видеоклипами (курируются в seed-аккаунте). Клипы перерезаны из
// KickAssAnime конвейером _pp/kaa-recut.mjs — картинка без вшитых субтитров,
// поэтому поверх неё рисуются свои (см. starterClipClean). Исключение —
// 仕事: у KickAssAnime нет серверов у «Семьи шпиона», там остался старый клип
// из /storage с вшитым русским фансабом.
// Их показываем первыми и предлагаем добавить при пустой коллекции.
// Остальные 35 тоже с видео: клипы им подставляет STARTER_CLIPS (см. ниже),
// файлы лежат в pwa/media/starter/.

// Размер ядра. По умолчанию — 15 статичных карточек; если с сервера приехал фид
// ядра (см. refreshStarterCore), значение подстраивается под число seed-карточек.
let STARTER_CORE_COUNT = 17;

// Индекс «написание|реплика → карточка» для подписей поверх клипа
// (см. starterClipCaption). Объявлен здесь, а не рядом с функцией: ядро
// применяется ещё до неё, и сброс индекса не должен падать на TDZ.
let starterCaptionIndex = null;

const STARTER_DECK = [
    // ---- Ядро: 17 карточек с видеоклипами реальных сцен ----
    { k: '戦う', r: 'たたかう', ro: 'tatakau', a: 'Attack on Titan', s: '戦え、戦え',
      clip: 'kaa-tatakau.mp4', len: 8.83, ts: 0.9, te: 8.1,
      t: { ru: ['сражаться, воевать', 'Не сражаясь, не победить… Сражайся, сражайся!'], uk: ['битися, воювати', 'Не б’ючись, не перемогти… Бийся, бийся!'], en: ['to fight', "If you don't fight, you can't win… Fight, fight!"] } },
    { k: '僕', r: 'ぼく', ro: 'boku', a: 'Tokyo Ghoul', s: '僕は喰種だ',
      clip: 'kaa-boku.mp4', len: 5.85, ts: 2, te: 5.2,
      t: { ru: ['я (мужское)', 'Я — гуль'], uk: ['я (чоловіче «боку»)', 'Я — гуль'], en: ['I, me (male "boku")', 'I am… a ghoul'] } },
    { k: '勝つ', r: 'かつ', ro: 'katsu', a: 'Attack on Titan', s: 'エレンが勝ったんだ',
      clip: 'kaa-katsu.mp4', len: 4.31, ts: 2.1, te: 4.3,
      t: { ru: ['побеждать, выигрывать', 'Эрен победил!'], uk: ['перемагати, вигравати', 'Ерен переміг!'], en: ['to win', 'Eren won!'] } },
    { k: '計画', r: 'けいかく', ro: 'keikaku', a: 'Death Note', s: 'まさに計画どおりに事は進んでいる',
      clip: 'kaa-keikaku.mp4', len: 5.44, ts: 2.2, te: 5.4,
      t: { ru: ['план', 'Всё идёт точно по плану'], uk: ['план', 'Усе йде точно за планом'], en: ['plan', 'Everything is going just as planned'] } },
    { k: '悪魔', r: 'あくま', ro: 'akuma', a: 'Chainsaw Man', s: '悪魔だ…',
      clip: 'kaa-akuma.mp4', len: 6.2, ts: 2, te: 5.5,
      t: { ru: ['дьявол, демон', 'Это дьявол…'], uk: ['диявол, демон', 'Це диявол…'], en: ['devil, demon', "It's a devil…"] } },
    { k: '最強', r: 'さいきょう', ro: 'saikyou', a: 'Jujutsu Kaisen', s: '大丈夫 僕 最強だから',
      clip: 'kaa-saikyou.mp4', len: 5.51, ts: 2, te: 5.5,
      t: { ru: ['сильнейший', 'Всё в порядке — ведь я сильнейший'], uk: ['найсильніший', 'Усе гаразд — адже я найсильніший'], en: ['the strongest', "It's fine — because I'm the strongest"] } },
    { k: '心臓', r: 'しんぞう', ro: 'shinzou', a: 'Chainsaw Man', s: 'これは契約だ 私の心臓をやる',
      clip: 'kaa-shinzou.mp4', len: 6.41, ts: 2, te: 6.4,
      t: { ru: ['сердце', 'Это контракт — отдаю тебе своё сердце'], uk: ['серце', 'Це контракт — віддаю тобі своє серце'], en: ['heart', "This is a contract — I'll give you my heart"] } },
    { k: '来る', r: 'くる', ro: 'kuru', a: 'My Hero Academia', s: '私が来た！',
      clip: 'kaa-kuru.mp4', len: 4.44, ts: 2, te: 3.7,
      t: { ru: ['приходить', 'Я пришёл!'], uk: ['приходити', 'Я прийшов!'], en: ['to come', 'I am here!'] } },
    { k: '大丈夫', r: 'だいじょうぶ', ro: 'daijoubu', a: 'My Hero Academia', s: 'もう大丈夫だ 少年',
      clip: 'kaa-daijoubu.mp4', len: 7.28, ts: 2, te: 6.6,
      t: { ru: ['всё в порядке', 'Теперь всё хорошо, юноша'], uk: ['усе гаразд', 'Тепер усе добре, юначе'], en: ['okay; all right', "It's all right now, young man"] } },
    { k: '妹', r: 'いもうと', ro: 'imouto', a: 'Demon Slayer', s: '妹だ… 俺の妹なんだ！',
      clip: 'kaa-imouto.mp4', len: 6.32, ts: 2.2, te: 5.6,
      t: { ru: ['младшая сестра', 'Это сестра… моя младшая сестра!'], uk: ['молодша сестра', 'Це сестра… моя молодша сестра!'], en: ['younger sister', "She's my sister… my little sister!"] } },
    { k: '助ける', r: 'たすける', ro: 'tasukeru', a: 'Jujutsu Kaisen', s: 'お前は強いから人を助けろ',
      clip: 'kaa-tasukeru.mp4', len: 5.1, ts: 1.9, te: 5,
      t: { ru: ['спасать, помогать', 'Ты сильный — так спасай людей'], uk: ['рятувати, допомагати', 'Ти сильний — тож рятуй людей'], en: ['to save, to help', "You're strong, so save people"] } },
    { k: '仲間', r: 'なかま', ro: 'nakama', a: 'Attack on Titan', s: '仲間の死を嘆く時間はまだないんだよ',
      clip: 'kaa-nakama.mp4', len: 7.23, ts: 3.9, te: 7.2,
      t: { ru: ['товарищ; свои', 'Ещё не время оплакивать павших товарищей.'], uk: ['товариш; свої', 'Ще не час оплакувати полеглих товаришів.'], en: ['comrade; ally', "There's no time to mourn fallen comrades yet."] } },
    { k: '仕事', r: 'しごと', ro: 'shigoto', a: 'Spy x Family', s: 'まあ ただの仕事だよ',
      clip: 'https://animei.space/storage/4143aca7-f738-446a-af44-e0c5bf83ea1e.mp4', len: 8, ts: 0, te: 2.4,
      t: { ru: ['работа; дело', 'Да так, обычная работа.'], uk: ['робота; справа', 'Та так, звичайна робота.'], en: ['work; job', "It's just an ordinary job."] } },
    { k: '趣味', r: 'しゅみ', ro: 'shumi', a: 'One-Punch Man', s: '趣味でヒーローをやっている者だ',
      clip: 'kaa-shumi.mp4', len: 5.55, ts: 2, te: 5.3,
      t: { ru: ['хобби, увлечение', 'Я герой по хобби'], uk: ['хобі, захоплення', 'Я герой за хобі'], en: ['hobby', "I'm a hero as a hobby"] } },
    { k: '人間', r: 'にんげん', ro: 'ningen', a: 'Frieren', s: '私は もっと人間を知ろうと思う',
      clip: 'kaa-ningen.mp4', len: 7.21, ts: 3.2, te: 6.5,
      t: { ru: ['человек; люди', 'Хочу больше узнать о людях.'], uk: ['людина; люди', 'Хочу більше дізнатися про людей.'], en: ['human; people', 'I want to understand people more.'] } },

    { k: '今', r: 'いま', ro: 'ima', a: 'Frieren', s: '今では 幸せそうに笑ってるんだよ',
      clip: 'kaa-ima.mp4', len: 7.15, ts: 0.6, te: 6.5,
      t: { ru: ['сейчас; теперь', 'А теперь они счастливо улыбаются.'], uk: ['зараз; тепер', 'А тепер вони щасливо усміхаються.'], en: ['now; nowadays', 'And now they’re smiling happily.'] } },
    { k: '私', r: 'わたし', ro: 'watashi', a: 'Frieren', s: 'フリーレン なぜ 私のところへ？',
      clip: 'kaa-watashi.mp4', len: 8.3, ts: 1.3, te: 7.6,
      t: { ru: ['я', 'Фрирен, почему ты пришла ко мне?'], uk: ['я', 'Фрірен, чому ти прийшла до мене?'], en: ['I, me', 'Frieren, why did you come to me?'] } },

    // ---- Дополнение: 35 карточек (клипы подставляет STARTER_CLIPS ниже) ----
    { k: '友達', r: 'ともだち', ro: 'tomodachi', a: 'Naruto', s: '友達を守る！',
      t: { ru: ['друг', 'Я защищу своих друзей!'], uk: ['друг', 'Я захищу своїх друзів!'], en: ['friend', 'I will protect my friends!'] } },
    { k: '夢', r: 'ゆめ', ro: 'yume', a: 'One Piece', s: '海賊王になるのが夢だ！',
      t: { ru: ['мечта; сон', 'Моя мечта — стать королём пиратов!'], uk: ['мрія; сон', 'Моя мрія — стати королем піратів!'], en: ['dream', 'My dream is to become the Pirate King!'] } },
    { k: '諦める', r: 'あきらめる', ro: 'akirameru', a: 'Naruto', s: '諦めないで！',
      t: { ru: ['сдаваться; отказываться', 'Не сдавайся!'], uk: ['здаватися; відмовлятися', 'Не здавайся!'], en: ['to give up', "Don't give up!"] } },
    { k: '魔法', r: 'まほう', ro: 'mahou', a: 'Frieren', s: '魔法は不思議だ。',
      t: { ru: ['магия', 'Магия удивительна.'], uk: ['магія', 'Магія дивовижна.'], en: ['magic', 'Magic is mysterious.'] } },
    { k: '勇者', r: 'ゆうしゃ', ro: 'yuusha', a: 'Frieren', s: '勇者ヒンメルはそう言った。',
      t: { ru: ['герой', 'Так сказал герой Химмель.'], uk: ['герой', 'Так сказав герой Хіммель.'], en: ['hero', 'That is what the hero Himmel said.'] } },
    { k: '巨人', r: 'きょじん', ro: 'kyojin', a: 'Attack on Titan', s: '巨人が壁を壊した！',
      t: { ru: ['великан; титан', 'Титан разрушил стену!'], uk: ['велетень; титан', 'Титан зруйнував стіну!'], en: ['giant; titan', 'A titan broke the wall!'] } },
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
    { k: '頑張る', r: 'がんばる', ro: 'ganbaru', a: 'My Hero Academia', s: '明日も頑張ろう！',
      t: { ru: ['стараться изо всех сил', 'Завтра тоже постараемся!'], uk: ['старатися з усіх сил', 'Завтра теж постараємося!'], en: ['to do your best', "Let's do our best tomorrow too!"] } },
    { k: '旅', r: 'たび', ro: 'tabi', a: 'Frieren', s: '旅はまだ続く。',
      t: { ru: ['путешествие', 'Путешествие ещё продолжается.'], uk: ['подорож', 'Подорож ще триває.'], en: ['journey', 'The journey still continues.'] } },
    { k: '自由', r: 'じゆう', ro: 'jiyuu', a: 'Attack on Titan', s: '自由はあの空にある。',
      t: { ru: ['свобода', 'Свобода — там, в небе.'], uk: ['свобода', 'Свобода — там, у небі.'], en: ['freedom', 'Freedom is up in that sky.'] } },
    { k: '会う', r: 'あう', ro: 'au', a: 'Your Name', s: 'また会いましょう。',
      t: { ru: ['встречаться', 'Давай встретимся снова.'], uk: ['зустрічатися', 'Зустріньмося знову.'], en: ['to meet', "Let's meet again."] } },
    { k: '世界', r: 'せかい', ro: 'sekai', a: 'Death Note', s: '新しい世界を作る。',
      t: { ru: ['мир (вселенная)', 'Я создам новый мир.'], uk: ['світ', 'Я створю новий світ.'], en: ['world', 'I will create a new world.'] } },
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
    { k: '強い', r: 'つよい', ro: 'tsuyoi', a: 'Dragon Ball', s: 'あいつは強すぎる！',
      t: { ru: ['сильный', 'Он слишком силён!'], uk: ['сильний', 'Він занадто сильний!'], en: ['strong', 'That guy is too strong!'] } },
    { k: '元気', r: 'げんき', ro: 'genki', a: 'Dragon Ball', s: '元気ですか？',
      t: { ru: ['бодрый; здоровый', 'Как дела? (Ты бодр?)'], uk: ['бадьорий; здоровий', 'Як справи? (Ти бадьорий?)'], en: ['energetic; well', 'How are you? (Are you well?)'] } },
    { k: '飛ぶ', r: 'とぶ', ro: 'tobu', a: "Kiki's Delivery Service", s: '空を飛びたい！',
      t: { ru: ['летать', 'Хочу летать по небу!'], uk: ['літати', 'Хочу літати в небі!'], en: ['to fly', 'I want to fly in the sky!'] } },
    { k: '心', r: 'こころ', ro: 'kokoro', a: 'Clannad', s: '心が痛い。',
      t: { ru: ['сердце; душа', 'На сердце больно.'], uk: ['серце; душа', 'На серці боляче.'], en: ['heart; soul', 'My heart hurts.'] } },
    { k: '笑う', r: 'わらう', ro: 'warau', a: 'Spy x Family', s: '彼女はいつも笑っている。',
      t: { ru: ['смеяться; улыбаться', 'Она всегда улыбается.'], uk: ['сміятися; усміхатися', 'Вона завжди усміхається.'], en: ['to laugh; to smile', 'She is always smiling.'] } },
    { k: 'ごめん', r: 'ごめん', ro: 'gomen', a: 'Horimiya', s: '遅れてごめん！',
      t: { ru: ['прости', 'Прости за опоздание!'], uk: ['вибач', 'Вибач за запізнення!'], en: ['sorry', 'Sorry I am late!'] } },
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
    { k: '学校', r: 'がっこう', ro: 'gakkou', a: 'Assassination Classroom', s: '学校に行きたくない。',
      t: { ru: ['школа', 'Не хочу идти в школу.'], uk: ['школа', 'Не хочу йти до школи.'], en: ['school', 'I do not want to go to school.'] } },
    { k: '忘れる', r: 'わすれる', ro: 'wasureru', a: 'Your Name', s: '君を忘れない。',
      t: { ru: ['забывать', 'Я тебя не забуду.'], uk: ['забувати', 'Я тебе не забуду.'], en: ['to forget', 'I will not forget you.'] } },
];

// Видеоклипы 35 карточек дополнения: реальные сцены, нарезанные конвейером
// animei-backend/scripts/build-starter-clips.mjs (реплика найдена в сабах серии
// и подтверждена whisper'ом по звуку). Файлы лежат в pwa/media/starter/. У ядра
// клип задан прямо в карточке (абсолютный URL /storage), сюда не входит.
const STARTER_CLIPS = {
    '友達': { clip: '01-tomodachi.mp4', len: 4.6, ts: 3.1, te: 4.6, s: '友達なんだ 放っとけねえよ！', a: 'Jujutsu Kaisen',
        tr: { ru: 'Он мой друг — я его не брошу!', uk: 'Він мій друг — я його не покину!', en: 'He\'s my friend — I\'m not leaving him behind!' } },
    '夢': { clip: '02-yume.mp4', len: 5, ts: 0, te: 5, s: '僕も小さい時からの夢を かなえることにしました', a: 'One Piece',
        tr: { ru: 'Я тоже решил исполнить свою детскую мечту.', uk: 'Я теж вирішив здійснити свою дитячу мрію.', en: 'I decided to make my childhood dream come true, too.' } },
    '諦める': { clip: '03-akirameru.mp4', len: 7.9, ts: 4.3, te: 7.9, s: 'フェルンだって 魔法使いになることを諦めなかった', a: 'Frieren',
        tr: { ru: 'Даже Ферн не отказалась от мечты стать волшебницей.', uk: 'Навіть Ферн не відмовилася від мрії стати чарівницею.', en: 'Even Fern didn\'t give up on becoming a mage.' } },
    '魔法': { clip: '03-mahou.mp4', len: 7.1, ts: 0, te: 6.8, s: '魔法で 馬車を 向こう側に運んだりできるだろ', a: 'Frieren',
        tr: { ru: 'Ты же можешь магией перенести повозку на ту сторону?', uk: 'Ти ж можеш магією перенести віз на той бік?', en: 'You could just carry the wagon across with magic, right?' } },
    '勇者': { clip: '04-yuusha.mp4', len: 7.4, ts: 0, te: 4.6, s: '勇者 ヒンメルなら そうしました', a: 'Frieren',
        tr: { ru: 'Герой Химмель поступил бы именно так.', uk: 'Герой Хіммель вчинив би саме так.', en: 'That is what the hero Himmel would have done.' } },
    '巨人': { clip: '05-kyojin.mp4', len: 10, ts: 0, te: 7.6, s: 'トロスト区に閉じ込めた巨人の掃討戦には', a: 'Attack on Titan',
        tr: { ru: 'В зачистке титанов, запертых в районе Трост…', uk: 'У зачистці титанів, замкнених у районі Трост…', en: 'In the operation to clear out the titans trapped in Trost…' } },
    '鬼': { clip: '06-oni.mp4', len: 4.9, ts: 0, te: 4.6, s: 'これじゃ私が 血も涙もねえ鬼みてえだろ！', a: 'Jujutsu Kaisen',
        tr: { ru: 'Я же так выгляжу как бессердечный демон!', uk: 'Я ж так виглядаю як безсердечний демон!', en: 'This makes me look like a heartless demon!' } },
    '名前': { clip: '07-namae.mp4', len: 10, ts: 0, te: 6.8, s: '名前だけって… 私 偉そうな男って無理', a: 'Jujutsu Kaisen',
        tr: { ru: 'Только по имени?.. Не выношу заносчивых парней.', uk: 'Лише на ім’я?.. Не зношу зарозумілих хлопців.', en: 'Just first names?.. I can\'t stand cocky guys.' } },
    '好き': { clip: '04-suki.mp4', len: 5.8, ts: 0, te: 5.3, s: 'フリーレン まだ魔法は好きか？', a: 'Frieren',
        tr: { ru: 'Фрирен, тебе всё ещё нравится магия?', uk: 'Фрірен, тобі все ще подобається магія?', en: 'Frieren, do you still like magic?' } },
    'ありがとう': { clip: '12-arigatou.mp4', len: 8.4, ts: 1.7, te: 8.4, s: 'ありがとう！ 早速 ライブハウスへ ゴー！', a: 'Bocchi the Rock!',
        tr: { ru: 'Спасибо! Скорее в лайв-хаус!', uk: 'Дякую! Мерщій у лайв-хаус!', en: 'Thanks! Off to the live house, let\'s go!' } },
    '行く': { clip: '08-iku.mp4', len: 9.6, ts: 2.2, te: 9.6, s: 'じゃあ フェルン 蒼月草を探しに行こうか', a: 'Frieren',
        tr: { ru: 'Что ж, Ферн, пойдём искать лунную траву.', uk: 'Що ж, Ферн, ходімо шукати місячну траву.', en: 'Well then, Fern, let\'s go look for bluemoon weed.' } },
    '待つ': { clip: '09-matsu.mp4', len: 8.6, ts: 0, te: 8.6, s: 'この街で ２年以上 待つことになりそうだと言われたら', a: 'Frieren',
        tr: { ru: 'Когда мне сказали, что ждать в этом городе придётся больше двух лет…', uk: 'Коли мені сказали, що чекати в цьому місті доведеться понад два роки…', en: 'When they told me we might wait in this town for over two years…' } },
    '頑張る': { clip: '10-ganbaru.mp4', len: 3.9, ts: 0.7, te: 3.6, s: 'いやいや 頑張ったんだよ？', a: 'Jujutsu Kaisen',
        tr: { ru: 'Да нет же, я правда старался!', uk: 'Та ні ж, я справді старався!', en: 'No no, I really did my best!' } },
    '旅': { clip: '16-tabi.mp4', len: 4.9, ts: 0, te: 3.6, s: 'あなたの旅に 連れていってくれませんか？', a: 'Frieren',
        tr: { ru: 'Возьмёте меня с собой в путешествие?', uk: 'Візьмете мене із собою в подорож?', en: 'Will you take me on your journey?' } },
    '自由': { clip: '11-jiyuu.mp4', len: 5.4, ts: 0, te: 5.4, s: 'さてと 晴れて自由の身だ', a: 'Jujutsu Kaisen',
        tr: { ru: 'Ну вот — теперь я наконец свободен.', uk: 'Ну ось — тепер я нарешті вільний.', en: 'Well then — I\'m finally a free man.' } },
    '会う': { clip: '12-au.mp4', len: 5.6, ts: 0, te: 3.4, s: 'いつかきっと会いましょう！', a: 'One Piece',
        tr: { ru: 'Когда-нибудь мы обязательно встретимся!', uk: 'Колись ми обов’язково зустрінемося!', en: 'Someday we\'ll surely meet again!' } },
    '世界': { clip: '13-sekai.mp4', len: 7.6, ts: 0, te: 4.9, s: '私たちは世界を救った 勇者パーティーですよ', a: 'Frieren',
        tr: { ru: 'Мы — отряд героев, спасший мир.', uk: 'Ми — загін героїв, що врятував світ.', en: 'We are the hero party that saved the world.' } },
    '力': { clip: '25-chikara.mp4', len: 2.9, ts: 0, te: 2.6, s: '呪力なし 素の力であれか', a: 'Jujutsu Kaisen',
        tr: { ru: 'Без проклятой энергии, голой силой?', uk: 'Без проклятої енергії, голою силою?', en: 'No cursed energy — just raw strength?' } },
    '先生': { clip: '14-sensei.mp4', len: 5.6, ts: 0, te: 5.6, s: 'その頃には 先生 死んでるでしょ', a: 'Frieren',
        tr: { ru: 'К тому времени вы, учитель, уже умрёте.', uk: 'На той час ви, вчителю, вже помрете.', en: 'By then you\'ll be dead, sensei.' } },
    '先輩': { clip: '15-senpai.mp4', len: 4.1, ts: 1.7, te: 4.1, s: 'だ から 先輩が持ってる… って', a: 'Jujutsu Kaisen',
        tr: { ru: 'Поэтому она и есть у семпая…', uk: 'Тому вона і є в семпая…', en: 'That\'s why senpai has it…' } },
    '猫': { clip: '16-neko.mp4', len: 9.8, ts: 3.7, te: 9.1, s: '猫ちゃん なんか お酒くさ い！', a: 'Natsume Yuujinchou',
        tr: { ru: 'Котик, от тебя несёт саке!', uk: 'Котику, від тебе тхне саке!', en: 'Kitty, you reek of sake!' } },
    '月': { clip: '02-tsuki.mp4', len: 5, ts: 0, te: 2.8, s: '今日は 月がきれいですね', a: 'Demon Slayer',
        tr: { ru: 'Луна сегодня прекрасна.', uk: 'Місяць сьогодні прекрасний.', en: 'The moon is beautiful today.' } },
    '強い': { clip: '17-tsuyoi.mp4', len: 7.4, ts: 0, te: 5.6, s: '強い相手に 自分から ケンカを売りに行くような⸺', a: 'Frieren',
        tr: { ru: 'Это как самому лезть в драку с сильным противником…', uk: 'Це як самому лізти в бійку з сильним супротивником…', en: 'It\'s like picking a fight with a stronger opponent…' } },
    '元気': { clip: '18-genki.mp4', len: 6.4, ts: 4.4, te: 6.4, s: '伏黒！ 今度こそ元気そうだな', a: 'Jujutsu Kaisen',
        tr: { ru: 'Фусигуро! В этот раз ты выглядишь бодрым.', uk: 'Фушіґуро! Цього разу ти виглядаєш бадьорим.', en: 'Fushiguro! You look well this time.' } },
    '飛ぶ': { clip: '33-tobu.mp4', len: 5.1, ts: 1.7, te: 5.1, s: '飛んで 上から越えちまうってことは', a: 'Frieren',
        tr: { ru: 'Значит, перелетим её сверху…', uk: 'Отже, перелетимо її зверху…', en: 'So we\'ll just fly over it from above…' } },
    '心': { clip: '19-kokoro.mp4', len: 4.8, ts: 0, te: 4.8, s: '呪いは人の心から生まれる', a: 'Jujutsu Kaisen',
        tr: { ru: 'Проклятия рождаются из сердец людей.', uk: 'Прокляття народжуються з людських сердець.', en: 'Curses are born from people\'s hearts.' } },
    '笑う': { clip: '39-warau.mp4', len: 4.1, ts: 0, te: 4, s: 'ヤバい！ かわい過ぎて笑っちゃう', a: 'Bocchi the Rock!',
        tr: { ru: 'С ума сойти! Так мило, что не могу не смеяться.', uk: 'З глузду з’їхати! Так мило, що я не можу не сміятися.', en: 'That\'s crazy! It\'s so cute I can\'t help laughing.' } },
    'ごめん': { clip: '00-gomen.mp4', len: 5.1, ts: 0.7, te: 5.1, s: 'ごめんな でも大丈夫', a: 'Jujutsu Kaisen',
        tr: { ru: 'Прости. Но всё в порядке.', uk: 'Вибач. Але все гаразд.', en: 'I\'m sorry. But it\'s okay.' } },
    '分かる': { clip: '20-wakaru.mp4', len: 5.4, ts: 0.9, te: 5.4, s: 'それは… 分かりませんな', a: 'Frieren',
        tr: { ru: 'Этого… я не знаю.', uk: 'Цього… я не знаю.', en: 'That… I don\'t know.' } },
    '食べる': { clip: '01-taberu.mp4', len: 4.9, ts: 1.7, te: 4.6, s: 'ごめん それ… 俺 食べちゃった', a: 'Jujutsu Kaisen',
        tr: { ru: 'Прости… я это съел.', uk: 'Вибач… я це з’їв.', en: 'Sorry… I ate it.' } },
    '水': { clip: '21-mizu.mp4', len: 6.4, ts: 1.7, te: 6.4, s: '水は どんな形にもなれる', a: 'Demon Slayer',
        tr: { ru: 'Вода может принять любую форму.', uk: 'Вода може набути будь-якої форми.', en: 'Water can take any shape.' } },
    '火': { clip: '22-hi.mp4', len: 5, ts: 0, te: 4.9, s: '火仕事をする家は そういう子が生まれると', a: 'Demon Slayer',
        tr: { ru: 'В семьях, что работают с огнём, рождаются такие дети.', uk: 'У родинах, що працюють з вогнем, народжуються такі діти.', en: 'Families that work with fire have children like that.' } },
    '空': { clip: '00-sora.mp4', len: 6.3, ts: 2.8, te: 5.6, s: 'じゃなきゃ 空の魔物が素通りだ', a: 'Frieren',
        tr: { ru: 'Иначе чудища с неба пройдут беспрепятственно.', uk: 'Інакше чудовиська з неба пройдуть безперешкодно.', en: 'Otherwise the monsters of the sky would slip right through.' } },
    '学校': { clip: '48-gakkou.mp4', len: 4.9, ts: 0, te: 4.9, s: '表向きには 私立の宗教系学校とされている', a: 'Jujutsu Kaisen',
        tr: { ru: 'Официально это частная религиозная школа.', uk: 'Офіційно це приватна релігійна школа.', en: 'Officially, it is a private religious school.' } },
    '忘れる': { clip: '23-wasureru.mp4', len: 10, ts: 0, te: 6.9, s: 'よく埋めた場所を忘れるんだ', a: 'Frieren',
        tr: { ru: 'Я вечно забываю, где его закопал.', uk: 'Я вічно забуваю, де його закопав.', en: 'I always forget where I buried it.' } },
};

// Карточка с учётом найденного клипа: фраза, переводы фразы и аниме
// подменяются на настоящие — из той серии, откуда вырезан клип.
function starterCard(card) {
    const c = STARTER_CLIPS[card.k];
    if (!c) return card;
    const t = {};
    for (const lang of ['ru', 'uk', 'en']) {
        t[lang] = [card.t[lang] ? card.t[lang][0] : card.t.ru[0], c.tr[lang] || c.tr.ru];
    }
    // ts/te — окно воспроизведения (сама фраза): клип нарезан с запасами по
    // краям, играем только реплику — как у карточек seed-ядра.
    return {
        ...card,
        s: c.s,
        a: c.a,
        clip: c.clip,
        len: c.len,
        ...(c.ts != null && c.te != null ? { ts: c.ts, te: c.te } : {}),
        t,
    };
}

// ---- Синхронизация порядка ядра с админкой (seed@animei.space) ----
// Владелец переставляет карточки в админке → порядок пишется на сервере
// (PUT /admin/seed-order → static/seed-order.json). Колода тянет его через
// публичный GET /api/v1/starter/order и переставляет ЯДРО (первые
// STARTER_CORE_COUNT) по kanji. Кэшируем в localStorage: применяем порядок
// сразу и синхронно (без мигания), а с сервера обновляем в фоне — новый
// порядок вступит в силу со следующей загрузки. Нет сети/кэша/файла — остаётся
// статичный порядок массива STARTER_DECK (оффлайн-надёжно).
const STARTER_ORDER_KEY = 'animei:starterOrder';

function loadStarterOrder() {
    const arr = lsJson(STARTER_ORDER_KEY);
    return Array.isArray(arr) && arr.length ? arr : null;
}

let starterOrder = loadStarterOrder();

function starterApiBase() {
    return window.ANIMEI_ORIGIN || location.origin;
}

function refreshStarterOrder() {
    try {
        fetch(starterApiBase() + '/api/v1/starter/order')
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                if (j && Array.isArray(j.data) && j.data.length) {
                    starterOrder = j.data;
                    try { localStorage.setItem(STARTER_ORDER_KEY, JSON.stringify(j.data)); } catch { /* приватный режим */ }
                }
            })
            .catch(() => { /* оффлайн — оставляем кэш/статичный порядок */ });
    } catch { /* нет fetch/localStorage */ }
}
if (typeof window !== 'undefined') refreshStarterOrder();

// ---- Ядро колоды приезжает из админки (seed@animei.space) ----
// Раньше наружу отдавались только порядок и тайминги, поэтому правка текста
// карточки в админке (перевод, фраза, чтение) до учеников не доезжала вообще, а
// добавленная/удалённая seed-карточка не меняла колоду: ядро жило захардкоженной
// копией в STARTER_DECK. Теперь фронт строит ЯДРО из полного фида
// GET /api/v1/starter/core, а статичные карточки остаются оффлайн-фолбэком и
// источником переводов на uk/en (в seed-карточке перевод только один, русский).
// Кэш в localStorage — применяем синхронно при загрузке (без мигания), с сервера
// обновляем в фоне. Нет сети и кэша — колода целиком статичная, как раньше.
const STARTER_CORE_KEY = 'animei:starterCore';
const STATIC_CORE_COUNT = 15;
const STATIC_CORE = STARTER_DECK.slice(0, STATIC_CORE_COUNT);
const STATIC_EXTRA = STARTER_DECK.slice(STATIC_CORE_COUNT);

// Название аниме из подсказки seed-карточки. Формат подсказки —
// «Атака титанов • S4E9 @ 21:59» (у части карточек — «Из аниме: X» или пусто):
// берём кусок до разделителя серии и снимаем подпись-префикс.
function animeFromHint(hint) {
    let s = String(hint || '').split('•')[0].split('@')[0].trim();
    const i = s.indexOf(':');
    if (i >= 0) s = s.slice(i + 1).trim();
    return s;
}

// Карточка ядра из seed-записи: тексты/чтение/клип/окно — из админки, переводы на
// uk/en — из статичной карточки с тем же словом (в seed их просто нет). Карточки,
// которой нет в STARTER_DECK (добавлена в админке), показываем на всех языках с
// русским переводом — лучше, чем не показать её вовсе.
function starterCoreCard(it, staticCard) {
    const ru = [it.translation || '', it.sentenceTranslation || ''];
    const t = {};
    for (const lang of ['ru', 'uk', 'en']) {
        const s = staticCard && staticCard.t[lang];
        // Русский всегда из админки. Для uk/en берём статичный перевод, но только
        // если фраза-пример не изменилась: иначе перевод будет не от той фразы.
        const sameSentence = staticCard && staticCard.s === it.sentence;
        t[lang] = (lang === 'ru' || !s || !sameSentence) ? ru : s.slice();
    }
    return {
        k: it.kanji,
        r: it.kana || (staticCard ? staticCard.r : ''),
        ro: it.romaji || (staticCard ? staticCard.ro : ''),
        // Название аниме: у статичной карточки оно международное («Attack on Titan»),
        // в seed-подсказке — русское, поэтому статичное в приоритете.
        a: (staticCard ? staticCard.a : '') || animeFromHint(it.hint),
        s: it.sentence || (staticCard ? staticCard.s : ''),
        clip: it.clip || (staticCard ? staticCard.clip : ''),
        len: staticCard ? staticCard.len : Math.ceil(Number(it.videoEnd) || 0),
        ts: Number.isFinite(it.trimStart) ? it.trimStart : (staticCard ? staticCard.ts : 0),
        te: Number.isFinite(it.trimEnd) ? it.trimEnd : (staticCard ? staticCard.te : 0),
        t,
    };
}

// Ядро из фида (null — фида нет, работаем на статичном массиве).
let starterCore = null;

function applyStarterCore(list) {
    if (!Array.isArray(list) || !list.length) return;
    const staticByKanji = new Map(STATIC_CORE.map((c) => [c.k, c]));
    const cards = list
        .filter((it) => it && it.kanji)
        .map((it) => starterCoreCard(it, staticByKanji.get(it.kanji)));
    if (!cards.length) return;
    starterCore = cards;
    STARTER_CORE_COUNT = cards.length;
    starterCaptionIndex = null;   // ядро поменялось — искать подписи заново
}

try {
    applyStarterCore(lsJson(STARTER_CORE_KEY));
} catch { /* неожиданная форма кэша — остаётся статичное ядро */ }

function refreshStarterCore() {
    try {
        fetch(starterApiBase() + '/api/v1/starter/core')
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                if (!j || !Array.isArray(j.data) || !j.data.length) return;
                applyStarterCore(j.data);
                try { localStorage.setItem(STARTER_CORE_KEY, JSON.stringify(j.data)); } catch { /* приватный режим */ }
            })
            .catch(() => { /* оффлайн — оставляем кэш/статичное ядро */ });
    } catch { /* нет fetch/localStorage */ }
}
if (typeof window !== 'undefined') refreshStarterCore();

// Ядро + дополнение (35 карточек, клипы — из STARTER_CLIPS). Фид уже приходит в порядке админки,
// поэтому переставлять его не нужно; на статичном ядре порядок применяем сами по
// starterOrder (по kanji), карточки не из списка держатся в хвосте ядра.
function orderedStarterDeck() {
    if (starterCore) {
        // Слово, добавленное в seed, могло уже лежать в дополнении — не дублируем.
        const inCore = new Set(starterCore.map((c) => c.k));
        return [...starterCore, ...STATIC_EXTRA.filter((c) => !inCore.has(c.k))];
    }
    if (!starterOrder || !starterOrder.length) return STARTER_DECK;
    const pos = new Map(starterOrder.map((k, i) => [k, i]));
    const origIdx = new Map(STATIC_CORE.map((c, i) => [c, i]));
    const sortedCore = STATIC_CORE.slice().sort((a, b) => {
        const pa = pos.has(a.k) ? pos.get(a.k) : Infinity;
        const pb = pos.has(b.k) ? pos.get(b.k) : Infinity;
        return pa !== pb ? pa - pb : origIdx.get(a) - origIdx.get(b);
    });
    return [...sortedCore, ...STATIC_EXTRA];
}

function starterMergedDeck() {
    return orderedStarterDeck().map(starterCard);
}

// Адрес клипа. Абсолютный URL (клипы ядра из /storage) — как есть; иначе файл
// из локальной папки /app/media/starter/ (страницы лежат в /app/pages/).
function starterClipUrl(card) {
    if (!card.clip) return '';
    if (/^https?:\/\//.test(card.clip)) return card.clip;
    return new URL(appUrl('media/starter/' + card.clip), window.location.href).href;
}

// Свои субтитры поверх клипа (.clip-player__cap в media.css) рисуем ТОЛЬКО
// там, где картинка чистая. У клипов из русских фансаб-рипов русский текст
// вшит в кадр — своя строка легла бы поверх чужой. Чистые клипы перерезаны из
// KickAssAnime конвейером _pp/kaa-recut.mjs, у них имя файла `kaa-*.mp4`
// (правило работает и для ссылки из фида ядра, где путь абсолютный).
function starterClipClean(card) {
    if (!card) return false;
    if (card.clean) return true;
    return /(^|\/)kaa-[\w-]+\.mp4(\?|$)/.test(String(card.clip || ''));
}

// Строка-подпись для клипа карточки: перевод реплики на языке интерфейса.
function starterClipCaptionText(card) {
    if (!starterClipClean(card)) return '';
    const lang = typeof getLang === 'function' ? getLang() : 'ru';
    const tr = (card.t && card.t[lang]) || (card.t && card.t.ru);
    return (tr && tr[1]) || '';
}

// Тот же перевод, но для слова, УЖЕ сохранённого в коллекцию: его личный клип
// нарезан из того же файла колоды, значит и картинка та же. Узнаём карточку по
// написанию + реплике. Зовёт study-core (см. makeClipVideo).
function starterClipCaption(word) {
    if (!word) return '';
    const k = word.kanji || word.word || '';
    const s = String(word.sentence || '').trim();
    if (!k || !s) return '';
    if (!starterCaptionIndex) {
        starterCaptionIndex = new Map();
        for (const card of starterMergedDeck()) {
            if (!card.clip || !starterClipClean(card)) continue;
            starterCaptionIndex.set(card.k + '|' + String(card.s || '').trim(), card);
        }
    }
    const card = starterCaptionIndex.get(k + '|' + s);
    return card ? starterClipCaptionText(card) : '';
}
if (typeof window !== 'undefined') window.starterClipCaption = starterClipCaption;

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
        trimStart: card.ts,
        trimEnd: card.te,
    };
}

// Вся колода в форме слов для движка обучения (режим для новичков).
function starterDeckWords() {
    return starterMergedDeck().map((card, i) => {
        const tr = starterTr(card);
        const video = starterClipUrl(card);
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
            video,
            trimStart: card.ts,
            trimEnd: card.te,
            clipCaption: video ? starterClipCaptionText(card) : '',
            noClip: !video,   // нет клипа → на обороте показываем плашку «Видео пока нет»
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

// Добавить в коллекцию до limit слов (уже добавленные пропускаем). По умолчанию
// берём всю базовую колоду, но можно передать конкретные карточки — тогда
// добавится ровно то, что человек проходил, а не всё подряд.
// Возвращает, сколько реально добавили.
async function addStarterWords(limit, cards) {
    const have = await starterLoadSavedSet();
    let added = 0;
    for (const card of (cards && cards.length ? cards : starterMergedDeck())) {
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
