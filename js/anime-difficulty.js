// Кураторская разметка сложности ЯЗЫКА аниме (id Shikimori = id MAL).
// Только уверенные случаи: 'easy' — повседневная лексика и спокойный темп речи
// (SoL, Гибли), 'hard' — формальная/военная/научная речь или игра слов.
// Всё неразмеченное считаем 'medium' (жёлтая полоска) — см. difficultyOf в
// catalog.js. Это фронтенд-эвристика v1; при появлении частотного скоринга по
// нашим же субтитрам карта уйдёт на бэкенд.
window.AnimeDifficulty = {
    map: {
        // --- полегче: бытовые диалоги, мало жаргона ---
        12815: 'easy',   // Shirokuma Cafe / Кафе «Полярный медведь»
        5680:  'easy',   // K-On!
        34798: 'easy',   // Yuru Camp / Лагерь на свежем воздухе
        17549: 'easy',   // Non Non Biyori
        31376: 'easy',   // Flying Witch / Летающая ведьма
        28819: 'easy',   // Tanaka-kun wa Itsumo Kedaruge / Танака-кун всегда вялый
        14355: 'easy',   // Danshi Koukousei no Nichijou / Будни старшеклассников
        35860: 'easy',   // Karakai Jouzu no Takagi-san / Озорная Такаги
        42897: 'easy',   // Horimiya / Хоримия
        33206: 'easy',   // Kobayashi-san Chi no Maid Dragon / Дракон-горничная
        10162: 'easy',   // Usagi Drop / Брошенный кролик
        523:   'easy',   // Tonari no Totoro / Мой сосед Тоторо
        512:   'easy',   // Kiki's Delivery Service / Ведьмина служба доставки

        // --- сложный язык: формальная, военная, научная речь, игра слов ---
        1535:  'hard',   // Death Note — абстрактно-формальные рассуждения
        9253:  'hard',   // Steins;Gate — сленг + наука
        19:    'hard',   // Monster — взрослая, медицинская речь
        1575:  'hard',   // Code Geass — военно-политическая лексика
        5081:  'hard',   // Bakemonogatari — сплошная игра слов
        13601: 'hard',   // Psycho-Pass — казённо-техническая речь
        9756:  'hard',   // Madoka Magica — философские монологи
        40748: 'hard',   // Jujutsu Kaisen — плотный жаргон техник
        16498: 'hard',   // Attack on Titan — военные команды, архаизмы
        25777: 'hard',   // Attack on Titan S2
        35760: 'hard',   // Attack on Titan S3
        38524: 'hard',   // Attack on Titan S3 Part 2
        40028: 'hard',   // Attack on Titan: Final Season
    },
};
