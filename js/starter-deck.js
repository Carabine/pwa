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
// Первые 15 карточек (STARTER_CORE_COUNT) — ядро колоды: реальные сцены из
// аниме с видеоклипами (курируются в seed-аккаунте, клипы лежат в /storage).
// Их показываем первыми и предлагаем добавить при пустой коллекции.
// Остальные 35 — пока без видео (плашка «Видео пока нет» на обороте карточки).

const STARTER_CORE_COUNT = 15;

const STARTER_DECK = [
    // ---- Ядро: 15 карточек с видеоклипами реальных сцен ----
    { k: 'やつ', r: 'やつ', ro: 'yatsu', a: 'Chainsaw Man', s: 'パワーは いいやつだぜ',
      clip: 'https://animei.space/storage/d44fdfb0-8fbe-40d0-bfb2-90cc35ec3f2d.mp4', len: 9, ts: 3, te: 7,
      t: { ru: ['тип, чувак (разг.)', 'Пауэр — славный малый!'], uk: ['тип, чувак (розм.)', 'Пауер — славний хлопака!'], en: ['guy, dude (casual)', 'Power is a good one!'] } },
    { k: '来る', r: 'くる', ro: 'kuru', a: 'My Hero Academia', s: '私が来た！',
      clip: 'https://animei.space/storage/998397d8-f2c0-4748-a1b2-2599b8ef6f95.mp4', len: 9, ts: 2, te: 11,
      t: { ru: ['приходить', 'Я пришёл! (Всемогущий)'], uk: ['приходити', 'Я прийшов! (Всемогутній)'], en: ['to come', 'I am here! (All Might)'] } },
    { k: '最強', r: 'さいきょう', ro: 'saikyou', a: 'Jujutsu Kaisen', s: '大丈夫 僕 最強だから',
      clip: 'https://animei.space/storage/d0aa00a3-4b44-41ca-8a1c-eedfc2d33798.mp4', len: 9, ts: 4, te: 8,
      t: { ru: ['сильнейший', 'Всё в порядке — ведь я сильнейший (Годзё)'], uk: ['найсильніший', 'Усе гаразд — адже я найсильніший (Ґодзьо)'], en: ['the strongest', "It's fine — because I'm the strongest (Gojo)"] } },
    { k: '趣味', r: 'しゅみ', ro: 'shumi', a: 'One-Punch Man', s: '趣味でヒーローをやっている者だ',
      clip: 'https://animei.space/storage/040287f3-bd69-4d1c-8858-3a6ed8253e72.mp4', len: 9, ts: 4, te: 9,
      t: { ru: ['хобби, увлечение', 'Я герой по хобби (Сайтама)'], uk: ['хобі, захоплення', 'Я герой за хобі (Сайтама)'], en: ['hobby', "I'm a hero as a hobby (Saitama)"] } },
    { k: '助ける', r: 'たすける', ro: 'tasukeru', a: 'Jujutsu Kaisen', s: 'お前は強いから人を助けろ',
      clip: 'https://animei.space/storage/aaac9758-f82e-4259-a670-9a6b8fffe367.mp4', len: 9, ts: 4, te: 8,
      t: { ru: ['спасать, помогать', 'Ты сильный — так спасай людей (дед Итадори)'], uk: ['рятувати, допомагати', 'Ти сильний — тож рятуй людей (дід Ітадорі)'], en: ['to save, to help', "You're strong, so save people (Itadori's grandpa)"] } },
    { k: '悪魔', r: 'あくま', ro: 'akuma', a: 'Chainsaw Man', s: '悪魔だ…',
      clip: 'https://animei.space/storage/ab4f158d-dd1b-47c5-b2f5-9f0c1b52f04e.mp4', len: 9, ts: 3, te: 8,
      t: { ru: ['дьявол, демон', 'Это дьявол…'], uk: ['диявол, демон', 'Це диявол…'], en: ['devil, demon', "It's a devil…"] } },
    { k: '大丈夫', r: 'だいじょうぶ', ro: 'daijoubu', a: 'My Hero Academia', s: 'もう大丈夫だ 少年',
      clip: 'https://animei.space/storage/8210c932-9e63-4ee4-99e7-b18020b8d592.mp4', len: 9, ts: 2, te: 11,
      t: { ru: ['всё в порядке', 'Теперь всё хорошо, юноша (Всемогущий)'], uk: ['усе гаразд', 'Тепер усе добре, юначе (Всемогутній)'], en: ['okay; all right', "It's all right now, young man (All Might)"] } },
    { k: 'スパイ', r: 'スパイ', ro: 'supai', a: 'Spy x Family', s: '早速 スパイごっこか',
      clip: 'https://animei.space/storage/7cc25f16-2cd4-4d37-b57d-3f9c19a7d060.mp4', len: 6, ts: 2, te: 5,
      t: { ru: ['шпион', 'Уже играешь в шпионов?'], uk: ['шпигун', 'Вже граєш у шпигунів?'], en: ['spy', 'Playing spies already?'] } },
    { k: '仲間', r: 'なかま', ro: 'nakama', a: 'Attack on Titan', s: '仲間の死を嘆く時間はまだないんだよ',
      clip: 'https://animei.space/storage/85224c52-0861-4035-accd-151a27b04a72.mp4', len: 9, ts: 5, te: 10,
      t: { ru: ['товарищ; свои', 'Ещё не время оплакивать павших товарищей.'], uk: ['товариш; свої', 'Ще не час оплакувати полеглих товаришів.'], en: ['comrade; ally', "There's no time to mourn fallen comrades yet."] } },
    { k: '心臓', r: 'しんぞう', ro: 'shinzou', a: 'Chainsaw Man', s: 'これは契約だ 私の心臓をやる',
      clip: 'https://animei.space/storage/0617ecef-5ee9-44e7-bac7-e081db1df99f.mp4', len: 9, ts: 6, te: 10,
      t: { ru: ['сердце', 'Это контракт — отдаю тебе своё сердце (Почита)'], uk: ['серце', 'Це контракт — віддаю тобі своє серце (Почіта)'], en: ['heart', "This is a contract — I'll give you my heart (Pochita)"] } },
    { k: '僕', r: 'ぼく', ro: 'boku', a: 'Tokyo Ghoul', s: '僕は喰種だ',
      clip: 'https://animei.space/storage/e843e894-085b-4149-87a8-fe039f9273bf.mp4?v=jp', len: 11, ts: 2.5, te: 6.5,
      t: { ru: ['я (мужское «боку»)', 'Я — гуль'], uk: ['я (чоловіче «боку»)', 'Я — гуль'], en: ['I, me (male "boku")', 'I am… a ghoul'] } },
    { k: '妹', r: 'いもうと', ro: 'imouto', a: 'Demon Slayer', s: '妹だ… 俺の妹なんだ！',
      clip: 'https://animei.space/storage/d3c7fd2b-699d-412f-a133-9bab943aea49.mp4', len: 9, ts: 2, te: 11,
      t: { ru: ['младшая сестра', 'Это сестра… моя младшая сестра! (Тандзиро)'], uk: ['молодша сестра', 'Це сестра… моя молодша сестра! (Танджіро)'], en: ['younger sister', "She's my sister… my little sister! (Tanjiro)"] } },
    { k: '勝つ', r: 'かつ', ro: 'katsu', a: 'Attack on Titan', s: 'エレンが勝ったんだ',
      clip: 'https://animei.space/storage/e99231c7-a8e1-40c8-a98f-6a11f2f92038.mp4', len: 9, ts: 6, te: 7,
      t: { ru: ['побеждать, выигрывать', 'Эрен победил! (Армин)'], uk: ['перемагати, вигравати', 'Ерен переміг! (Армін)'], en: ['to win', 'Eren won! (Armin)'] } },
    { k: '計画', r: 'けいかく', ro: 'keikaku', a: 'Death Note', s: 'まさに計画どおりに事は進んでいる',
      clip: 'https://animei.space/storage/ab8a5d0a-7a84-4cc8-90ce-afd6b0db0034.mp4?v=jp', len: 11, ts: 3.5, te: 7,
      t: { ru: ['план', 'Всё идёт точно по плану (Лайт)'], uk: ['план', 'Усе йде точно за планом (Лайт)'], en: ['plan', 'Everything is going just as planned (Light)'] } },
    { k: '戦う', r: 'たたかう', ro: 'tatakau', a: 'Attack on Titan', s: '戦え、戦え',
      clip: 'https://animei.space/storage/11e076bb-1818-449e-8b22-7d274d737f37.mp4', len: 15, ts: 8, te: 12,
      t: { ru: ['сражаться, воевать', 'Не сражаясь, не победить… Сражайся, сражайся! (Эрен)'], uk: ['битися, воювати', 'Не б’ючись, не перемогти… Бийся, бийся! (Ерен)'], en: ['to fight', "If you don't fight, you can't win… Fight, fight! (Eren)"] } },

    // ---- Дополнение: 35 карточек (пока без видео) ----
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

// Видеоклипы к карточкам: у ядра клип задан прямо в карточке (поле clip —
// абсолютный URL). Этот объект оставлен для обратной совместимости и как точка
// расширения; сейчас пуст.
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

// Адрес клипа. Абсолютный URL (клипы ядра из /storage) — как есть; иначе файл
// из локальной папки /app/media/starter/ (страницы лежат в /app/pages/).
function starterClipUrl(card) {
    if (!card.clip) return '';
    if (/^https?:\/\//.test(card.clip)) return card.clip;
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
