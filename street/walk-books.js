// ===== Книги на полках: короткие рассказы для чтения =====
// «Новая история из ваших слов» пишет сервер (POST /api/v1/street/story: ИИ + чтения MeCab, кэш),
// три сказки встроены и читаются без сети. Читалка: страницы, фуригана, перевод по тапу на фразу,
// ваши слова подсвечены (тап — чтение и перевод), чтение вслух нейроголосом, вопросы в конце.
// Встраивается build-walk.mjs.
const BOOKS = (() => {
    const API = (location.protocol === 'file:' ? 'https://animei.space' : '') + '/api/v1/';
    const LS_KEY = 'street:books:v1';
    const CLASSICS = [
        { id: 'momotaro', title: '桃太郎', titleTr: 'Момотаро — мальчик из персика', classic: true, sentences: [
            ['むかしむかし、おじいさんとおばあさんがいました。', 'Давным-давно жили-были дедушка и бабушка.'],
            ['おばあさんは川で大きな桃を見つけました。', 'Бабушка нашла в реке большой персик.'],
            ['桃の中から、元気な男の子が出てきました。', 'Из персика появился бойкий мальчик.'],
            ['二人は男の子を「桃太郎」と呼びました。', 'Старики назвали мальчика «Момотаро».'],
            ['桃太郎は大きくなって、鬼の島へ行きました。', 'Момотаро вырос и отправился на остров демонов.'],
            ['道で、犬と猿と鳥に会いました。', 'По дороге он встретил собаку, обезьяну и птицу.'],
            ['桃太郎は、みんなにきびだんごをあげました。', 'Момотаро угостил всех рисовыми колобками кибидango.'],
            ['みんなで力を合わせて、鬼に勝ちました。', 'Объединив силы, они победили демонов.'],
            ['桃太郎は宝物を持って、家に帰りました。', 'Момотаро вернулся домой с сокровищами.'],
            ['おじいさんとおばあさんは、とても喜びました。', 'Дедушка и бабушка очень обрадовались.'],
        ], questions: [
            { q: '桃太郎はどこから出てきましたか？', tr: 'Откуда появился Момотаро?', options: ['桃の中', '川の中', '鬼の島'], answer: 0 },
            { q: '桃太郎は道でだれに会いましたか？', tr: 'Кого Момотаро встретил по дороге?', options: ['犬と猿と鳥', 'おばあさん', '鬼'], answer: 0 },
        ] },
        { id: 'tsuru', title: '鶴の恩返し', titleTr: 'Благодарность журавля', classic: true, sentences: [
            ['雪の日、おじいさんはわなにかかった鶴を助けました。', 'В снежный день дедушка спас журавля, попавшего в ловушку.'],
            ['その夜、きれいな娘が家に来ました。', 'Той ночью в дом пришла красивая девушка.'],
            ['娘は「はたを織ります。でも、見ないでください」と言いました。', 'Девушка сказала: «Я буду ткать. Только не смотрите».'],
            ['娘が織った布は、とても美しかったです。', 'Ткань, которую она соткала, была очень красивой.'],
            ['布は高く売れて、二人はうれしくなりました。', 'Ткань продалась дорого, и старики обрадовались.'],
            ['でも、おばあさんはどうしても見たくなりました。', 'Но бабушке ужасно захотелось посмотреть.'],
            ['そっと戸を開けると、鶴が自分の羽で布を織っていました。', 'Она тихонько открыла дверь — журавль ткал ткань из своих перьев.'],
            ['「見られてしまいましたね」と鶴は言いました。', '«Вы меня увидели», — сказал журавль.'],
            ['鶴は空へ飛んでいって、もう帰りませんでした。', 'Журавль улетел в небо и больше не вернулся.'],
        ], questions: [
            { q: '娘は、本当は何でしたか？', tr: 'Кем на самом деле была девушка?', options: ['鶴', '猫', 'おばあさん'], answer: 0 },
            { q: '娘は何をしましたか？', tr: 'Что делала девушка?', options: ['はたを織りました', '料理を作りました', '歌を歌いました'], answer: 0 },
        ] },
        { id: 'urashima', title: '浦島太郎', titleTr: 'Урасима Таро', classic: true, sentences: [
            ['浦島太郎は、海の近くに住む若い漁師でした。', 'Урасима Таро был молодым рыбаком и жил у моря.'],
            ['ある日、子どもたちにいじめられている亀を助けました。', 'Однажды он спас черепаху, которую обижали дети.'],
            ['亀は「お礼に竜宮城へ連れていきます」と言いました。', 'Черепаха сказала: «В благодарность отвезу тебя в подводный дворец».'],
            ['海の下のお城には、美しい乙姫様がいました。', 'В подводном дворце жила прекрасная принцесса Отохимэ.'],
            ['太郎は毎日ごちそうを食べて、楽しく過ごしました。', 'Таро каждый день пировал и весело проводил время.'],
            ['帰る日、乙姫様は小さな箱をくれました。', 'В день возвращения принцесса подарила ему маленькую шкатулку.'],
            ['「この箱は、決して開けないでください。」', '«Никогда не открывай эту шкатулку».'],
            ['村に帰ると、知っている人はだれもいませんでした。', 'Вернувшись в деревню, он не встретил ни одного знакомого.'],
            ['三百年もたっていたのです。', 'Оказалось, прошло целых триста лет.'],
            ['太郎が箱を開けると、白いけむりが出て、おじいさんになりました。', 'Таро открыл шкатулку — вышел белый дым, и он стал стариком.'],
        ], questions: [
            { q: '太郎はだれを助けましたか？', tr: 'Кого спас Таро?', options: ['亀', '鶴', '犬'], answer: 0 },
            { q: '箱を開けると、どうなりましたか？', tr: 'Что случилось, когда он открыл шкатулку?', options: ['おじいさんになった', '子どもになった', '鶴になった'], answer: 0 },
        ] },
        { id: 'issun', title: '一寸法師', titleTr: 'Иссумбоси — мальчик с вершок', classic: true, sentences: [
            ['むかし、とても小さな男の子がいました。名前は一寸法師です。', 'Давным-давно жил очень маленький мальчик по имени Иссумбоси.'],
            ['一寸法師は、おわんの船に乗って、都へ行きました。', 'Иссумбоси поплыл в столицу в лодке из чашки.'],
            ['はしをかいにして、川を進みました。', 'Вместо весла он грёб палочкой для еды.'],
            ['都で、一寸法師はお姫様の家で働くことになりました。', 'В столице он стал служить в доме принцессы.'],
            ['ある日、大きな鬼がお姫様をさらおうとしました。', 'Однажды огромный демон захотел похитить принцессу.'],
            ['一寸法師は針の刀で、鬼のおなかの中で戦いました。', 'Иссумбоси сражался мечом-иголкой прямо в животе у демона.'],
            ['鬼は「いたい！」と泣いて、逃げていきました。', 'Демон заплакал «Больно!» и убежал.'],
            ['鬼が落とした小づちを振ると、一寸法師は大きくなりました。', 'Иссумбоси взмахнул молоточком, который обронил демон, — и вырос.'],
            ['一寸法師とお姫様は、幸せに暮らしました。', 'Иссумбоси и принцесса жили долго и счастливо.'],
        ], questions: [
            { q: '一寸法師は何に乗って都へ行きましたか？', tr: 'На чём Иссумбоси поплыл в столицу?', options: ['おわん', '馬', '電車'], answer: 0 },
            { q: '一寸法師の刀は何でしたか？', tr: 'Чем был меч Иссумбоси?', options: ['針', 'はし', '木の枝'], answer: 0 },
        ] },
        { id: 'kasajizo', title: 'かさじぞう', titleTr: 'Шляпы для Дзидзо', classic: true, sentences: [
            ['雪の多い村に、やさしいおじいさんとおばあさんが住んでいました。', 'В снежной деревне жили добрые дедушка и бабушка.'],
            ['お正月のもちを買うお金がありませんでした。', 'У них не было денег на новогодние моти.'],
            ['おじいさんは、かさを作って町へ売りに行きました。', 'Дедушка сплёл соломенные шляпы и пошёл продавать их в город.'],
            ['でも、かさは一つも売れませんでした。', 'Но не продал ни одной.'],
            ['帰り道、雪の中に六人のおじぞうさまが立っていました。', 'По дороге домой в снегу стояли шесть статуй Дзидзо.'],
            ['おじいさんは、おじぞうさまの頭にかさをかぶせてあげました。', 'Дедушка надел им на головы свои шляпы.'],
            ['かさが一つ足りなかったので、自分の手ぬぐいをかぶせました。', 'Одной шляпы не хватило — и он отдал своё полотенце.'],
            ['その夜、外から「よいしょ、よいしょ」と声が聞こえました。', 'Ночью снаружи послышалось: «Ёйсё, ёйсё».'],
            ['戸を開けると、おもちや野菜がたくさん置いてありました。', 'Они открыли дверь — а там гора моти и овощей.'],
            ['おじぞうさまからのお礼だったのです。', 'Это Дзидзо пришли отблагодарить.'],
        ], questions: [
            { q: 'おじいさんは町で何を売りましたか？', tr: 'Что дедушка продавал в городе?', options: ['かさ', 'おもち', '野菜'], answer: 0 },
            { q: 'おじぞうさまは何人いましたか？', tr: 'Сколько было статуй Дзидзо?', options: ['六人', '三人', '十人'], answer: 0 },
        ] },
        { id: 'nezumi', title: 'ねずみの嫁入り', titleTr: 'Свадьба мышки', classic: true, sentences: [
            ['ねずみのお父さんは、娘を一番強い人と結婚させたいと思いました。', 'Отец-мышь хотел выдать дочь за самого сильного на свете.'],
            ['「一番強いのは、お日さまだ。」', '«Сильнее всех — солнце».'],
            ['でも、お日さまは「雲のほうが強いよ。私をかくすから」と言いました。', 'Но солнце сказало: «Облако сильнее — оно меня закрывает».'],
            ['雲は「風のほうが強いよ。私をとばすから」と言いました。', 'Облако сказало: «Ветер сильнее — он меня уносит».'],
            ['風は「かべのほうが強いよ。私を止めるから」と言いました。', 'Ветер сказал: «Стена сильнее — она меня останавливает».'],
            ['かべは「ねずみのほうが強いよ。私に穴をあけるから」と言いました。', 'Стена сказала: «Мышь сильнее — она прогрызает во мне дыры».'],
            ['「なんだ、一番強いのはねずみだったのか！」', '«Вот как! Сильнее всех — мышь!»'],
            ['娘は、となりの元気なねずみと結婚しました。', 'И дочь вышла замуж за бойкого мышонка-соседа.'],
        ], questions: [
            { q: 'お日さまより強いのは何ですか？', tr: 'Кто сильнее солнца?', options: ['雲', '風', 'かべ'], answer: 0 },
            { q: '娘はだれと結婚しましたか？', tr: 'За кого вышла замуж дочь?', options: ['ねずみ', 'お日さま', 'かべ'], answer: 0 },
        ] },
        { id: 'konbini', title: 'コンビニの夜', titleTr: 'Ночь в комбини', classic: true, story: true, sentences: [
            ['夜十一時、ぼくはコンビニでアルバイトをしています。', 'В одиннадцать вечера я подрабатываю в комбини.'],
            ['毎晩、同じおばあさんが牛乳を買いに来ます。', 'Каждый вечер одна и та же бабушка приходит за молоком.'],
            ['「こんばんは。今日も寒いですね。」とおばあさんは笑います。', '«Добрый вечер. Сегодня опять холодно», — улыбается бабушка.'],
            ['でも、今日は来ませんでした。', 'Но сегодня она не пришла.'],
            ['ぼくは少し心配になりました。', 'Я немного забеспокоился.'],
            ['次の日、おばあさんが小さな袋を持って来ました。', 'На следующий день бабушка пришла с маленьким пакетом.'],
            ['「昨日は孫が来ていたの。これ、おみやげよ。」', '«Вчера приезжал внук. Это тебе гостинец».'],
            ['袋の中には、あたたかいたい焼きが入っていました。', 'В пакете лежала тёплая тайяки.'],
            ['その夜のコンビニは、いつもより明るく見えました。', 'В ту ночь комбини казался светлее обычного.'],
        ], questions: [
            { q: 'おばあさんは毎晩何を買いますか？', tr: 'Что бабушка покупает каждый вечер?', options: ['牛乳', 'パン', 'お茶'], answer: 0 },
            { q: '袋の中に何がありましたか？', tr: 'Что было в пакете?', options: ['たい焼き', '牛乳', '手紙'], answer: 0 },
        ] },
        { id: 'ame', title: '雨の日の猫', titleTr: 'Кошка в дождливый день', classic: true, story: true, sentences: [
            ['雨の日、駅の前で小さな猫を見つけました。', 'В дождливый день у станции я нашла маленького котёнка.'],
            ['猫はぬれて、ふるえていました。', 'Он промок и дрожал.'],
            ['私はかさを猫の上にさしてあげました。', 'Я раскрыла над ним зонт.'],
            ['すると、猫は私のあとをついてきました。', 'И котёнок пошёл за мной.'],
            ['家に着くと、猫はドアの前で「にゃあ」と鳴きました。', 'У дома он мяукнул под дверью.'],
            ['母は「しかたないね」と言って、タオルを持ってきました。', 'Мама сказала «Что поделаешь» и принесла полотенце.'],
            ['猫の名前は「アメ」にしました。', 'Котёнка назвали «Амэ» — «Дождик».'],
            ['今では、アメは家で一番えらい顔をしています。', 'Теперь у Амэ самый важный вид во всём доме.'],
        ], questions: [
            { q: '猫はどこにいましたか？', tr: 'Где был котёнок?', options: ['駅の前', '学校', '公園'], answer: 0 },
            { q: '猫の名前は何ですか？', tr: 'Как зовут котёнка?', options: ['アメ', 'ユキ', 'タマ'], answer: 0 },
        ] },
        { id: 'ramen1', title: '初めてのラーメン', titleTr: 'Мой первый рамэн', classic: true, story: true, sentences: [
            ['日本に来て、初めてラーメン屋に入りました。', 'Приехав в Японию, я впервые зашёл в рамэнную.'],
            ['店の前に、食券を買う機械がありました。', 'У входа стоял автомат с талонами на еду.'],
            ['ボタンが多くて、どれを押せばいいか分かりませんでした。', 'Кнопок было много, и я не понимал, какую нажать.'],
            ['後ろのお兄さんが「これがおすすめですよ」と教えてくれました。', 'Парень сзади подсказал: «Вот эта — самая вкусная».'],
            ['カウンターに座ると、すぐにラーメンが来ました。', 'Едва я сел за стойку, принесли рамэн.'],
            ['店の人たちは、みんな大きな音で食べていました。', 'Все вокруг громко хлюпали.'],
            ['ぼくも少しはずかしかったけど、まねしてみました。', 'Мне было неловко, но я попробовал так же.'],
            ['熱いスープが、とてもおいしかったです。', 'Горячий бульон был очень вкусным.'],
            ['帰るとき、店の人に「ごちそうさまでした！」と言いました。', 'Уходя, я сказал повару: «Спасибо, было очень вкусно!»'],
        ], questions: [
            { q: '食券はどこで買いますか？', tr: 'Где покупают талон на еду?', options: ['機械', 'カウンター', '駅'], answer: 0 },
            { q: 'だれがおすすめを教えてくれましたか？', tr: 'Кто подсказал, что выбрать?', options: ['後ろのお兄さん', '店の人', '友達'], answer: 0 },
        ] },
    ].map((b) => Object.assign(b, { sentences: b.sentences.map(([ja, tr]) => ({ ja, tr })) }));
    // обложки: свой цвет и значок у каждой книги
    const COVER = { momotaro: ['#f4a6a0', '#c8505a', '🍑'], tsuru: ['#e8eef4', '#7a90a8', '🕊'], urashima: ['#8ac8d8', '#2a6a8a', '🐢'], issun: ['#f0d080', '#b0802a', '🥢'], kasajizo: ['#f4f0e8', '#8a7a6a', '⛄'], nezumi: ['#e0d4f0', '#7a6aa8', '🐭'], konbini: ['#a8d8f0', '#2a7ab8', '🏪'], ame: ['#b8c8e0', '#4a5a8a', '☔'], ramen1: ['#f4c890', '#c8602a', '🍜'] };
    const coverOf = (b, i) => COVER[b.id] || [['#ffd6e8', '#c8508a'], ['#d6f0e0', '#3a8a5a'], ['#fff0c8', '#b8862a'], ['#dcd6ff', '#5a4ab8']][i % 4].concat(['📗']);

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const KJ = /[㐀-鿿々〆ヶ]/;
    const hira = (s) => String(s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    function ruby(sf, rd) {
        if (!KJ.test(sf) || !rd) return esc(sf);
        const S = [...sf], R = [...hira(rd)], SH = S.map(hira); let a = 0, b = 0;
        while (a < S.length - 1 && a < R.length - 1 && !KJ.test(S[a]) && SH[a] === R[a]) a++;
        while (b < S.length - a - 1 && b < R.length - a - 1 && !KJ.test(S[S.length - 1 - b]) && SH[S.length - 1 - b] === R[R.length - 1 - b]) b++;
        const core = S.slice(a, S.length - b).join(''), rc = R.slice(a, R.length - b).join('');
        if (hira(core) === rc) return esc(sf);
        return esc(S.slice(0, a).join('')) + '<ruby>' + esc(core) + '<rt>' + esc(rc) + '</rt></ruby>' + esc(S.slice(S.length - b).join(''));
    }
    const lsGet = () => { try { const v = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
    const lsSet = (v) => { try { localStorage.setItem(LS_KEY, JSON.stringify(v.slice(0, 20))); } catch (e) { /* место кончилось */ } };
    const myWords = () => ((typeof data !== 'undefined' && data && data.words) || []).filter((w) => (w.kanji || w.kana) && w.translation);
    const meaningOf = (w) => String(w.translation || '').split(/[;,(]/)[0].trim();
    function wordMap() { const m = new Map(); myWords().forEach((w) => { if (w.kanji) m.set(w.kanji, w); if (w.kana && !m.has(w.kana)) m.set(w.kana, w); }); return m; }

    let el = null, book = null, view = 0, theme = 'street', furiOn = true, trOn = false, reading = null, busy = false;
    function ui() {
        if (el) return el;
        if (!document.getElementById('book-font')) { const l = document.createElement('link'); l.id = 'book-font'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;700;900&display=swap'; document.head.appendChild(l); }
        el = document.createElement('div'); el.id = 'book';
        el.innerHTML = '<div class="bh"><button class="b-lib" aria-label="Библиотека">‹</button><div class="bt"></div><button class="b-x" aria-label="Закрыть">×</button></div><div class="bb"></div><div class="bf"></div><div class="tip" hidden></div>';
        document.body.appendChild(el);
        el.querySelector('.b-x').addEventListener('click', close);
        el.querySelector('.b-lib').addEventListener('click', () => { stopRead(); book = null; library(); });
        el.addEventListener('click', onClick);
        ['pointerdown', 'touchstart', 'wheel'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
        ['keydown', 'keyup'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
        addEventListener('keydown', (e) => { if (!el.classList.contains('on')) return; if (e.code === 'Escape') close(); else if (book && e.code === 'ArrowRight') turn(1); else if (book && e.code === 'ArrowLeft') turn(-1); });
        addEventListener('resize', () => { if (book && el.classList.contains('on')) render(); });
        return el;
    }
    const wide = () => innerWidth >= 760 && innerHeight >= 430;
    const perPage = () => (wide() ? 4 : (innerHeight < 430 ? 3 : 4));
    function pages() { const n = perPage(), out = []; for (let i = 0; i < book.sentences.length; i += n) out.push(book.sentences.slice(i, i + n).map((s, k) => [s, i + k])); if (book.questions && book.questions.length) out.push('quiz'); return out; }
    const spreads = () => { const p = pages(); if (!wide()) return p.map((x) => [x]); const out = []; for (let i = 0; i < p.length; i += 2) out.push(p.slice(i, i + 2)); return out; };

    // ---------- библиотека ----------
    function library() {
        const e = ui(); e.classList.remove('reader'); e.querySelector('.b-lib').hidden = true;
        e.querySelector('.bt').innerHTML = '<b>Книжная полка</b><small>короткие рассказы для чтения</small>';
        const mine = lsGet();
        const dark = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0'); return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255); };
        const cover = (b, attr, i, note) => { const [bg, ink, ic] = coverOf(b, i); return '<button class="cover" ' + attr + ' style="--bg:' + bg + ';--bg2:' + dark(bg, 0.28) + ';--ink:' + ink + '"><span class="spine"></span><span class="ct">' + esc(b.title) + '</span><span class="ci">' + ic + '</span><span class="cs">' + esc(b.titleTr || '') + '</span>' + (note ? '<span class="cn">' + esc(note) + '</span>' : '') + '</button>'; };
        const shelf = (title, inner) => inner ? '<section class="shelf"><h5>' + title + '</h5><div class="row">' + inner + '</div></section>' : '';
        e.querySelector('.bb').innerHTML = '<div class="lib">'
            + '<button class="bk-new' + (busy ? ' busy' : '') + '" data-act="new"><span class="ic">✨</span><span><b>Новая история из ваших слов</b><small>' + (busy ? 'Пишу историю… обычно 20–40 секунд' : 'ИИ напишет короткий рассказ с вашими словами — о ' + esc(THEME_RU[theme] || 'ночной улице')) + '</small></span></button>'
            + shelf('Ваши истории', mine.map((b, i) => cover(b, 'data-mine="' + i + '"', i, b.used && b.used.length ? 'ваших слов: ' + b.used.length : '')).join(''))
            + shelf('Рассказы улицы', CLASSICS.map((b, i) => (b.story ? cover(b, 'data-classic="' + i + '"', i, '') : '')).join(''))
            + shelf('Японские сказки', CLASSICS.map((b, i) => (b.classic && !b.story ? cover(b, 'data-classic="' + i + '"', i, '') : '')).join(''))
            + '</div><div class="msg"></div>';
        e.querySelector('.bf').innerHTML = '';
    }
    const THEME_RU = { street: 'ночной улице', school: 'вечерней школе', izakaya: 'идзакае', cafe: 'кафе', home: 'квартире', shop: 'аниме-магазине', festival: 'фестивале', shrine: 'храме', books: 'книжной лавке', ramen: 'рамэнной', arcade: 'игровом зале', dev: 'разработчике' };
    const say = (t, kind) => { const m = el.querySelector('.bb .msg'); if (m) { m.textContent = t || ''; m.className = 'msg' + (kind ? ' ' + kind : ''); } };
    function pickWords() {
        const P = myWords(), rank = (w) => ({ due: 0, worn: 0, warm: 1, new: 1.5, lit: 3 }[w._state] ?? 1.5) + Math.random() * 2;
        return P.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 8).map((w) => ({ jp: w.kanji || w.kana, kana: w.kana || '', tr: meaningOf(w) }));
    }
    async function generate() {
        if (busy) return;
        const words = pickWords(); if (words.length < 3) { say('Добавьте в словарь хотя бы 3 слова — из них получится рассказ.', 'err'); return; }
        busy = true; library();
        try {
            const r = await fetch(API + 'street/story', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ words, theme, lang: 'ru' }) });
            if (r.status === 429) throw new Error('Слишком много новых историй за час — почитайте пока готовые.');
            if (!r.ok) throw new Error('Не получилось написать историю. Попробуйте ещё раз чуть позже.');
            const b = (await r.json()).data; b.sentences.forEach((s) => { s.tr = s.tr || s.ru || ''; });
            const list = lsGet().filter((x) => x.id !== b.id); list.unshift(b); lsSet(list);
            busy = false; open(null, b); if (typeof audio !== 'undefined') audio.ding();
        } catch (err) { busy = false; library(); say(err.message || 'Нет связи с сервером.', 'err'); }
    }
    // сказкам чтения берём у сервера разбора (MeCab), один раз; без сети — без фуриганы
    async function furiClassic(b) {
        const key = 'street:furi:' + b.id; let cache = null; try { cache = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { /* нет */ }
        if (cache && cache.length === b.sentences.length + 1) { b.titleT = cache[0]; b.sentences.forEach((s, i) => { s.t = cache[i + 1]; }); return; }
        try {
            const r = await fetch(API + 'analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: [b.title].concat(b.sentences.map((s) => s.ja)), merge: true }) });
            const j = r.ok ? await r.json() : null; if (!j || !j.data) return;
            const toks = j.data.map((arr) => (arr || []).map((t) => ({ s: t.surface, r: t.reading && t.reading !== t.surface ? t.reading : '', b: t.base && t.base !== t.surface ? t.base : '' })));
            b.titleT = toks[0]; b.sentences.forEach((s, i) => { s.t = toks[i + 1]; });
            try { localStorage.setItem(key, JSON.stringify(toks)); } catch (e) { /* место */ }
        } catch (e) { /* без сети */ }
    }

    // ---------- читалка ----------
    function sentHtml(s, i, wm) {
        const inner = s.t && s.t.length ? s.t.map((t) => { const w = wm.get(t.s) || (t.b && wm.get(t.b)); const body = furiOn ? ruby(t.s, t.r) : esc(t.s); return w ? '<span class="mine" data-w="' + esc(w.kanji || w.kana) + '">' + body + '</span>' : (t.r && KJ.test(t.s) ? '<span class="tk" data-s="' + esc(t.s) + '" data-r="' + esc(t.r) + '">' + body + '</span>' : body); }).join('') : esc(s.ja);
        return '<p class="s" data-i="' + i + '"><span class="ja">' + inner + '</span><span class="tr">' + esc(s.tr || '') + '</span></p>';
    }
    function quizHtml() {
        return '<div class="quiz"><h4>Вопросы</h4>' + book.questions.map((q, qi) => '<div class="q" data-q="' + qi + '"><div class="qq">' + esc(q.q) + '</div><div class="qt">' + esc(q.tr || '') + '</div><div class="qo">' + q.options.map((o, oi) => '<button data-qo="' + qi + ':' + oi + '">' + esc(o) + '</button>').join('') + '</div></div>').join('') + '</div>';
    }
    function render() {
        const e = ui(), sp = spreads(); view = Math.max(0, Math.min(view, sp.length - 1));
        e.classList.add('reader'); e.classList.toggle('tr', trOn); e.classList.toggle('wide', wide()); e.querySelector('.b-lib').hidden = false;
        const title = book.titleT && book.titleT.length && furiOn ? book.titleT.map((t) => ruby(t.s, t.r)).join('') : esc(book.title);
        e.querySelector('.bt').innerHTML = '<b>' + title + '</b><small>' + esc(book.titleTr || '') + '</small>';
        const wm = wordMap();
        const all = pages(), first = wide() ? view * 2 : view;
        e.querySelector('.bb').innerHTML = '<div class="spread">' + sp[view].map((pg, k) => '<div class="page">' + (pg === 'quiz' ? quizHtml() : pg.map(([s, i]) => sentHtml(s, i, wm)).join('')) + '<span class="pn">' + (first + k + 1) + '</span></div>').join('') + '</div>';
        e.querySelector('.bf').innerHTML = '<button class="nav" data-turn="-1"' + (view ? '' : ' disabled') + '>‹</button>'
            + '<button class="tg' + (furiOn ? ' on' : '') + '" data-tg="furi">あ</button><button class="tg' + (trOn ? ' on' : '') + '" data-tg="tr">Перевод</button><button class="tg' + (reading ? ' on' : '') + '" data-tg="read">' + (reading ? '■ Стоп' : '▶ Вслух') + '</button>'
            + '<span class="pg">' + (sp[view].length > 1 ? (first + 1) + '–' + (first + 2) : first + 1) + ' из ' + all.length + '</span><button class="nav" data-turn="1"' + (view < sp.length - 1 ? '' : ' disabled') + '>›</button>';
        hideTip();
    }
    function turn(d) { const n = spreads().length; const v = Math.max(0, Math.min(n - 1, view + d)); if (v === view) return; stopRead(); view = v; const bb = el.querySelector('.bb'); bb.classList.remove('flip', 'back'); void bb.offsetWidth; bb.classList.add('flip'); if (d < 0) bb.classList.add('back'); render(); }
    function hideTip() { const t = el && el.querySelector('.tip'); if (t) t.hidden = true; }
    function showTip(node, html) { const t = el.querySelector('.tip'); t.innerHTML = html; t.hidden = false; const r = node.getBoundingClientRect(), er = el.getBoundingClientRect(); t.style.left = Math.max(8, Math.min(er.width - 220, r.left - er.left + r.width / 2 - 100)) + 'px'; t.style.top = (r.top - er.top - t.offsetHeight - 8 < 40 ? r.bottom - er.top + 8 : r.top - er.top - t.offsetHeight - 8) + 'px'; }
    function onClick(ev) {
        const t = ev.target;
        const act = t.closest('[data-act],[data-mine],[data-classic],[data-turn],[data-tg],[data-qo]');
        const mw = t.closest('.mine'), tk = t.closest('.tk'), s = t.closest('p.s');
        if (mw) { const w = wordMap().get(mw.dataset.w); if (w) { showTip(mw, '<b>' + esc(w.kanji || w.kana) + '</b>' + (w.kana && w.kana !== w.kanji ? ' <span>' + esc(w.kana) + '</span>' : '') + '<div>' + esc(w.translation) + '</div><small>из вашего словаря</small>'); if (typeof ttsPlay === 'function' && audio.enabled) ttsPlay(w.kana || w.kanji, { volume: 0.9 }); } return; }
        if (tk) { showTip(tk, '<b>' + esc(tk.dataset.s) + '</b> <span>' + esc(tk.dataset.r) + '</span>'); return; }
        if (!act) { if (s) { s.classList.toggle('open'); hideTip(); } else hideTip(); return; }
        if (act.dataset.act === 'new') return generate();
        if (act.dataset.mine != null) return open(null, lsGet()[+act.dataset.mine]);
        if (act.dataset.classic != null) return open(null, CLASSICS[+act.dataset.classic]);
        if (act.dataset.turn) return turn(+act.dataset.turn);
        if (act.dataset.tg === 'furi') { furiOn = !furiOn; return render(); }
        if (act.dataset.tg === 'tr') { trOn = !trOn; return render(); }
        if (act.dataset.tg === 'read') { if (reading) stopRead(); else readAloud(); return; }
        if (act.dataset.qo) { const [qi, oi] = act.dataset.qo.split(':').map(Number), q = book.questions[qi], box = act.parentNode; if (box.dataset.done) return; box.dataset.done = '1'; act.classList.add(oi === q.answer ? 'good' : 'bad'); box.children[q.answer].classList.add('good'); if (oi === q.answer && typeof audio !== 'undefined') audio.ding(); }
    }
    // чтение вслух: фразы текущего разворота по очереди, текущая подсвечена
    function readAloud() {
        if (typeof ttsPlay !== 'function') return;
        const ps = [...el.querySelectorAll('.page p.s')]; if (!ps.length) return;
        reading = { k: 0, a: null }; render();
        const step = () => {
            if (!reading) return; const list = [...el.querySelectorAll('.page p.s')]; list.forEach((p) => p.classList.remove('now'));
            if (reading.k >= list.length) { stopRead(); return; }
            const p = list[reading.k], s = book.sentences[+p.dataset.i]; p.classList.add('now');
            const a = ttsPlay(s.ja, { volume: 0.95 }); reading.a = a;
            if (!a) { reading.k++; step(); return; }
            const go = () => { if (reading && reading.a === a) { reading.k++; setTimeout(step, 250); } };
            a.addEventListener('ended', go, { once: true }); a.addEventListener('error', go, { once: true });
        };
        step();
    }
    function stopRead() { if (reading && reading.a) { reading.a._cancel = true; reading.a.pause(); } const was = !!reading; reading = null; if (was && el && book) { el.querySelectorAll('p.s.now').forEach((p) => p.classList.remove('now')); const b = el.querySelector('[data-tg="read"]'); if (b) { b.classList.remove('on'); b.textContent = '▶ Вслух'; } } }

    async function open(th, b) {
        const e = ui(); e.classList.add('on'); if (th) theme = th;
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        if (typeof hideHint === 'function') hideHint();
        if (!b) { book = null; library(); return; }
        book = b; view = 0; if (typeof TALK !== 'undefined' && TALK.note) TALK.note('book', b.title);
        // варианты ответа перемешиваем при каждом открытии (в сказках верный стоял первым)
        (b.questions || []).forEach((q) => { const right = q.options[q.answer]; q.options = q.options.slice().sort(() => Math.random() - 0.5); q.answer = q.options.indexOf(right); });
        if (b.classic && !b.titleT) { render(); await furiClassic(b); if (book === b) render(); return; }
        render();
    }
    function close() { stopRead(); if (el) el.classList.remove('on'); }
    return { open, close, get on() { return !!(el && el.classList.contains('on')); } };
})();
