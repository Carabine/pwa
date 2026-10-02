// ===== Разговоры: тап по персонажу — короткая беседа по-японски (ответы на выбор) и вопрос про слово из словаря.
// Справа — меню действий для того, что рядом (поговорить, заказать у ятай, сменить станцию); диалог — окном сбоку.
// Встраивается build-walk.mjs (общая область видимости с walk.js: data, camera, inside, LIFE, audio, toast…).
const TALK = (() => {
    const ROLE_NAME = { chef: 'Повар', ramenChef: 'Повар', cook: 'Хозяйка', vendor: 'Продавец', waiter: 'Официантка', barista: 'Бариста', clerk: 'Продавец', bookClerk: 'Продавец', teacher: 'Учитель', student: 'Ученик', student1r: 'Студент', family: 'Хозяин', elder: 'Бабушка', couple: 'Сосед', bar: 'Гость', party: 'Гость', ramenGuest: 'Гость', cafeGuest: 'Гость', shopper: 'Покупатель', reader: 'Читатель', gamer: 'Игрок', drummer: 'Игрок', worker: 'Сосед', sleeper: 'Ученик' };
    const ROLE_GROUP = { chef: 'food', ramenChef: 'food', cook: 'food', vendor: 'food', waiter: 'serve', barista: 'serve', clerk: 'serve', bookClerk: 'serve', teacher: 'teach', student: 'study', student1r: 'study', family: 'home', elder: 'home', couple: 'home', gamer: 'play', drummer: 'play', sleeper: 'sleep' };
    const STAFF = new Set(['food', 'serve']), FRIEND = new Set(['study', 'play']);
    // темы по группам: реплика персонажа и ответы [мой jp, ru, его ответ [jp, ru]]
    const TOPICS = {
        food: [
            [['今日は何にする？おすすめは焼き鳥だよ。', 'Что сегодня будешь? Советую якитори.'], [['じゃあ、それをください！', 'Тогда его, пожалуйста!', ['はいよ！ちょっと待っててね。', 'Сейчас! Подожди немного.']], ['辛いのはありますか？', 'А есть что-нибудь острое?', ['あるよ！激辛ラーメン、挑戦する？', 'Есть! Очень острый рамэн — рискнёшь?']], ['見ているだけです。', 'Я просто смотрю.', ['どうぞ、ゆっくり見ていってね。', 'Смотри сколько хочешь.']]]],
            [['ここで働いて、もう十年になるんだ。', 'Я работаю тут уже десять лет.'], [['すごいですね！', 'Ничего себе!', ['ありがとう。毎日楽しいよ。', 'Спасибо. Каждый день в радость.']], ['大変じゃないですか？', 'А не тяжело?', ['夏は暑いけど、お客さんの笑顔が好きでね。', 'Летом жарко, но я люблю улыбки гостей.']]]],
            [['日本の料理で何が一番好き？', 'Какое японское блюдо тебе нравится больше всего?'], [['ラーメンです！', 'Рамэн!', ['いいね！味噌？それとも醤油？', 'Отлично! Мисо или сёю?']], ['お寿司です。', 'Суши.', ['魚屋の大将が喜ぶよ。', 'Хозяин рыбной лавки обрадуется.']], ['まだ分かりません。', 'Пока не знаю.', ['じゃあ、全部食べてみなきゃ！', 'Значит, надо попробовать всё!']]]],
            [['今夜は冷えるね。温かいスープはどう？', 'Холодно сегодня. Тёплого супа?'], [['いただきます！', 'С удовольствием!', ['熱いから気をつけてね。', 'Горячий, осторожно.']], ['お腹いっぱいです。', 'Я сыт.', ['そっか。また今度おいで。', 'Понятно. Приходи в другой раз.']]]],
            [['お祭り、楽しんでる？', 'Как тебе фестиваль?'], [['はい、とても！', 'Очень нравится!', ['もうすぐ花火だよ！', 'Скоро фейерверк!']], ['人が多いですね。', 'Народу много.', ['年に一度だからね！', 'Раз в году ведь!']]]],
        ],
        serve: [
            [['ご注文はお決まりですか？', 'Готовы заказать?'], [['お水をください。', 'Воды, пожалуйста.', ['かしこまりました。', 'Сию минуту.']], ['おすすめは何ですか？', 'Что посоветуете?', ['今日はケーキセットが人気ですよ。', 'Сегодня популярен сет с тортом.']], ['もう少し考えます。', 'Ещё подумаю.', ['ごゆっくりどうぞ。', 'Не торопитесь.']]]],
            [['日本は初めてですか？', 'Вы впервые в Японии?'], [['はい、初めてです！', 'Да, впервые!', ['ようこそ！楽しんでくださいね。', 'Добро пожаловать! Отдыхайте.']], ['いいえ、三回目です。', 'Нет, уже третий раз.', ['日本がお好きなんですね！', 'Значит, вам нравится Япония!']]]],
            [['今日はお仕事帰りですか？', 'Вы с работы?'], [['はい、疲れました…', 'Да, устал…', ['お疲れ様です。ゆっくりしていってください。', 'Вы хорошо потрудились. Отдохните.']], ['いいえ、散歩中です。', 'Нет, гуляю.', ['いい夜ですもんね。', 'Вечер и правда чудесный.']]]],
            [['袋はご利用ですか？', 'Пакет нужен?'], [['はい、お願いします。', 'Да, пожалуйста.', ['三円になります。', 'С вас три иены.']], ['いいえ、大丈夫です。', 'Нет, не надо.', ['ご協力ありがとうございます。', 'Спасибо, что бережёте природу.']]]],
        ],
        teach: [
            [['宿題はやりましたか？', 'Домашнее задание сделали?'], [['はい、やりました！', 'Да, сделал!', ['えらいですね！', 'Молодец!']], ['すみません、忘れました…', 'Простите, забыл…', ['明日は持ってきてくださいね。', 'Завтра принесите, хорошо?']], ['難しかったです。', 'Было трудно.', ['どこが分からなかった？一緒に見ましょう。', 'Что было непонятно? Давайте разберём.']]]],
            [['漢字の勉強、進んでいますか？', 'Как продвигаются кандзи?'], [['毎日少しずつです。', 'Понемногу каждый день.', ['それが一番の近道です。', 'Это самый короткий путь.']], ['全然だめです…', 'Совсем плохо…', ['大丈夫。焦らないで。', 'Ничего. Не торопитесь.']]]],
            [['日本語で一番難しいのは何ですか？', 'Что самое трудное в японском?'], [['敬語です。', 'Вежливая речь.', ['日本人にも難しいですよ。', 'Даже японцам трудно.']], ['漢字です。', 'Кандзи.', ['覚えるほど楽しくなりますよ。', 'Чем больше учишь, тем интереснее.']], ['聞き取りです。', 'Аудирование.', ['アニメはいい練習になりますね。', 'Аниме — отличная тренировка.']]]],
        ],
        study: [
            [['明日のテスト、勉強した？', 'К завтрашнему тесту готовился?'], [['少しだけ…', 'Чуть-чуть…', ['私も！一緒にやろう！', 'Я тоже! Давай вместе!']], ['うん、完璧！', 'Да, всё выучил!', ['すごい！教えて！', 'Круто! Научи!']], ['テストがあるの！？', 'Есть тест?!', ['あるよ！しっかりして！', 'Есть! Соберись!']]]],
            [['放課後、何するの？', 'Что делаешь после уроков?'], [['アニメを見る！', 'Смотрю аниме!', ['何見てるの？私も好き！', 'Что смотришь? Я тоже люблю!']], ['ゲームセンターに行く。', 'Иду в игровой зал.', ['いいな、私も行きたい！', 'Везёт, я тоже хочу!']], ['バイトだよ。', 'Подработка.', ['大変だね、頑張って！', 'Тяжело, держись!']]]],
            [['お腹すいた…コンビニ行かない？', 'Есть хочу… Сходим в комбини?'], [['行こう行こう！', 'Пошли!', ['おにぎり買おう！', 'Купим онигири!']], ['今ダイエット中…', 'Я на диете…', ['えー、一個だけ！', 'Ну-у, одну штучку!']]]],
        ],
        home: [
            [['お茶、飲む？', 'Чаю выпьешь?'], [['はい、いただきます。', 'Да, спасибо.', ['熱いから気をつけてね。', 'Горячий, осторожно.']], ['冷たいのがいいです。', 'Лучше холодного.', ['麦茶があるよ。', 'Есть ячменный чай.']]]],
            [['今日はどこへ行ってきたの？', 'Где сегодня был?'], [['お祭りに行きました！', 'На фестивале!', ['いいね！花火は見た？', 'Здорово! Фейерверк видел?']], ['神社に行きました。', 'В храме.', ['何をお願いしたの？', 'О чём загадал желание?']], ['ずっと家にいました。', 'Весь день дома.', ['たまにはそれもいいね。', 'Иногда и так хорошо.']]]],
            [['この町、昔はもっと静かだったのよ。', 'Раньше этот город был тише.'], [['へえ、そうなんですか。', 'Вот как?', ['駅ができてから、にぎやかになったの。', 'Когда построили станцию, стало оживлённо.']], ['今の方が好きです。', 'Мне больше нравится сейчас.', ['ふふ、若い人はみんなそう言うね。', 'Хе-хе, молодые всегда так говорят.']]]],
            [['ご飯、食べていく？', 'Поужинаешь с нами?'], [['いいんですか？', 'А можно?', ['もちろん！たくさん作ったから。', 'Конечно! Я много наготовила.']], ['今日は帰ります。', 'Сегодня пойду домой.', ['そう。気をつけてね。', 'Хорошо. Будь осторожен.']]]],
        ],
        guest: [
            [['いい夜ですね。', 'Хороший вечер, правда?'], [['そうですね。', 'И правда.', ['こういう夜は一杯飲みたくなるね。', 'В такой вечер хочется выпить.']], ['ちょっと寒いです。', 'Холодновато.', ['温かいものでも飲もうよ。', 'Давай выпьем чего-нибудь тёплого.']]]],
            [['ここ、よく来るんですか？', 'Часто сюда заходите?'], [['初めてです。', 'Впервые.', ['いい所でしょう？ここのおでんは最高だよ。', 'Хорошее место, правда? Одэн тут лучший.']], ['たまに来ます。', 'Иногда.', ['じゃあ、また会えるね。', 'Значит, ещё увидимся.']]]],
            [['どこから来たんですか？', 'Откуда вы?'], [['ロシアから来ました。', 'Из России.', ['遠いですね！日本語、上手！', 'Далеко! Хорошо говорите по-японски!']], ['ウクライナから来ました。', 'Из Украины.', ['遠いところからようこそ！', 'Добро пожаловать издалека!']], ['秘密です。', 'Секрет.', ['ははは、ミステリアスだね。', 'Ха-ха, загадочно.']]]],
            [['最近、何かいいアニメ見た？', 'Смотрел что-нибудь хорошее из аниме?'], [['フリーレンを見ています。', 'Смотрю «Фрирен».', ['いいね！あれは泣けるよ。', 'Отлично! Там можно и поплакать.']], ['進撃の巨人が好きです。', 'Люблю «Атаку титанов».', ['あの最終回、どう思った？', 'А как тебе финал?']], ['あまり見ません。', 'Почти не смотрю.', ['もったいない！今度おすすめ教えるよ。', 'Зря! Посоветую тебе что-нибудь.']]]],
        ],
        play: [
            [['一緒にやる？', 'Сыграем вместе?'], [['うん、やろう！', 'Давай!', ['よし、負けないよ！', 'Отлично, не проиграю!']], ['見てるだけでいいよ。', 'Я лучше посмотрю.', ['じゃあ、応援してね！', 'Тогда болей за меня!']]]],
            [['あと少しでハイスコアなんだ！', 'Ещё чуть-чуть до рекорда!'], [['頑張って！', 'Удачи!', ['ありがとう！集中、集中…', 'Спасибо! Сосредоточься…']], ['コツを教えて！', 'Научи приёму!', ['リズムを体で覚えるんだよ。', 'Запоминай ритм телом.']]]],
        ],
        sleep: [
            [['ぐー…', 'Хррр…'], [['起きてください！', 'Проснись!', ['…はっ！寝てないよ！', '…А? Я не сплю!']], ['しーっ、静かに。', 'Тсс, тихо.', ['…むにゃむにゃ…', '…мням-мням…']]]],
        ],
    };
    const REACT = [['へえ、そうなんだ。', 'Вот как.'], ['いいですね！', 'Здорово!'], ['なるほど。', 'Понятно.'], ['本当ですか？', 'Правда?'], ['面白い！', 'Интересно!'], ['わかります。', 'Понимаю.'], ['それはいい！', 'Это здорово!']];
    // вопрос про слово — разными словами
    const QUIZ_ASK = [
        (w) => ['「' + w + '」って、どういう意味だっけ？', 'Слушай, а что значит «' + w + '»?'],
        (w) => ['日本語の勉強してるんだよね？「' + w + '」は分かる？', 'Ты ведь учишь японский? «' + w + '» знаешь?'],
        (w) => ['さっき「' + w + '」って聞いたんだけど、何のこと？', 'Только что слышал «' + w + '» — это о чём?'],
        (w) => ['クイズ！「' + w + '」の意味は？', 'Викторина! Что значит «' + w + '»?'],
        (w) => ['友だちが「' + w + '」って言ってたけど、意味が分からなくて…', 'Друг сказал «' + w + '», а я не понял…'],
    ];
    const QUIZ_OK = [['そうそう！', 'Точно!'], ['さすが！', 'Как и ожидалось!'], ['よく知ってるね！', 'Хорошо знаешь!'], ['正解！', 'Верно!'], ['ありがとう、すっきりした！', 'Спасибо, теперь всё ясно!']];
    const QUIZ_BAD = [['惜しい！', 'Почти!'], ['うーん、ちょっと違うかな。', 'Хм, не совсем.'], ['あれ？違うと思うよ。', 'Хм, кажется, нет.']];
    const BYE_ME = [['じゃあ、またね！', 'Ну, пока!'], ['そろそろ行きます。', 'Мне пора.'], ['ありがとうございました！', 'Спасибо!']];
    const BYE_THEM = [['またね！', 'Пока!'], ['気をつけてね！', 'Береги себя!'], ['また来てね！', 'Заходи ещё!'], ['じゃあね〜', 'Давай!']];
    const BYE_STAFF = [['ありがとうございました！', 'Спасибо, что зашли!'], ['またお越しくださいませ！', 'Ждём вас снова!'], ['まいどあり！', 'Спасибо за покупку!']];
    let el = null, cur = null, score = { ok: 0, all: 0 };
    // ---- окно диалога сбоку: шапка (кто), лента реплик, задание, варианты ответа ----
    function ui() {
        if (el) return el;
        el = document.createElement('div'); el.id = 'talk';
        el.innerHTML = '<div class="th"><div class="av"></div><div class="tt"><div class="nm"></div><div class="rl"></div></div><button class="tx" aria-label="Закрыть">×</button></div><div class="log"></div><div class="task"></div><div class="opts"></div>';
        document.body.appendChild(el);
        el.querySelector('.tx').addEventListener('click', () => close());
        ['pointerdown', 'touchstart', 'wheel'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
        return el;
    }
    let jaVoice = null;
    function speak(text) {
        try {
            if (!window.speechSynthesis) return;
            if (!jaVoice) jaVoice = speechSynthesis.getVoices().find((v) => /^ja/i.test(v.lang)) || null;
            const u = new SpeechSynthesisUtterance(String(text).replace(/[「」]/g, '')); u.lang = 'ja-JP'; u.rate = 0.9; if (jaVoice) u.voice = jaVoice;
            speechSynthesis.cancel(); speechSynthesis.speak(u);
        } catch (e) { /* нет синтеза речи */ }
    }
    const jpOf = (w) => w.kanji || w.kana;
    const meaning = (w) => String(w.translation || '').split(/[;,(]/)[0].trim();
    function pool() { return ((typeof data !== 'undefined' && data && data.words) || []).filter((w) => jpOf(w) && meaning(w)); }
    // слово для вопроса: случайно из нескольких подходящих (а не всегда одно и то же «пора повторить»),
    // уже спрошенные за последние 15 минут не повторяем
    const asked = new Map();
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const sample = (a, n) => shuffle(a.slice()).slice(0, n);
    function pickWord(pref) {
        const P = pool(); if (P.length < 4) return null;
        const now = Date.now(), fresh = P.filter((w) => !asked.has(jpOf(w)) || now - asked.get(jpOf(w)) > 15 * 60e3);
        const src = fresh.length >= 4 ? fresh : P;
        const tiers = [src.filter((w) => w._state === 'due' || w._state === 'worn'), src.filter((w) => w._state === 'warm'), src.filter((w) => w._state === 'new'), src];
        const r = Math.random(), order = r < 0.45 ? [0, 1, 2, 3] : r < 0.7 ? [1, 0, 2, 3] : r < 0.9 ? [2, 1, 0, 3] : [3];
        let cand = src; for (const i of order) if (tiers[i].length) { cand = tiers[i]; break; }
        if (pref) { const pp = src.filter(pref); if (pp.length && Math.random() < 0.6) cand = pp; }
        const w = pick(cand); asked.set(jpOf(w), now); return w;
    }
    function distractors(w, n, key) {
        const P = pool().filter((x) => x !== w && key(x) !== key(w)), out = [], seen = new Set([key(w)]);
        while (out.length < n && P.length) { const x = P.splice(Math.floor(Math.random() * P.length), 1)[0]; if (!seen.has(key(x))) { seen.add(key(x)); out.push(x); } }
        return out;
    }
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    function msg(who, jp, ru) {
        const m = document.createElement('div'); m.className = 'm ' + who;
        m.innerHTML = '<div class="jp">' + esc(jp) + (who === 'c' ? ' <button class="spk" aria-label="Озвучить">🔊</button>' : '') + '</div>' + (ru ? '<div class="ru">' + esc(ru) + '</div>' : '');
        if (who === 'c') m.querySelector('.spk').addEventListener('click', () => speak(jp));
        const log = el.querySelector('.log'); log.appendChild(m); log.scrollTop = log.scrollHeight;
    }
    function head() {
        el.querySelector('.av').textContent = cur.icon || '💬';
        el.querySelector('.nm').textContent = cur.name;
        el.querySelector('.rl').textContent = (cur.sub || '') + (cur.kind === 'order' && score.all ? (cur.sub ? ' · ' : '') + 'заказов верно: ' + score.ok + ' из ' + score.all : '');
    }
    // ---- шаг: реплика персонажа в ленту, задание, варианты ответа ----
    function show(line, opts, task) {
        const e = ui(); e.classList.add('on'); acts.hidden = true; head();
        msg('c', line[0], line[1]);
        e.querySelector('.task').innerHTML = task || ''; e.querySelector('.task').hidden = !task;
        const box = e.querySelector('.opts'); box.innerHTML = '';
        opts.forEach((o, i) => {
            const b = document.createElement('button'); b.className = 'op';
            b.innerHTML = (FINE ? '<kbd>' + (i + 1) + '</kbd>' : '') + '<span><b>' + esc(o.jp) + '</b>' + (o.ru ? '<small>' + esc(o.ru) + '</small>' : '') + '</span>';
            b.addEventListener('click', () => { if (box.dataset.busy) return; box.dataset.busy = '1'; buzz(8); if (o.say !== false) msg('p', o.jp, o.ru); o.go(b); });
            box.appendChild(b);
        });
        delete box.dataset.busy;
        box.classList.toggle('four', opts.length === 4);
        if (cur.ch && !cur.ch.cat) { cur.ch.faceUntil = LIFE.S.t + 30; cur.ch.talkUntil = LIFE.S.t + 1.6; } // реплика — в ленте окна, пузырь над головой не дублируем
        hideHint();
    }
    const end = (line) => { show(line, []); cur.ended = true; setTimeout(() => { if (cur && cur.ended) close(); }, 1900); };
    function close() {
        if (!el) return; el.classList.remove('on');
        if (cur && cur.ch) cur.ch.faceUntil = 0;
        cur = null; lastKey = '';
    }
    function begin(c) { cur = c; ui().querySelector('.log').innerHTML = ''; }
    // ---- вопрос «что значит слово?»: варианты — переводы ----
    function quiz(w, ask, after) {
        if (!w) return after();
        const opts = shuffle([w].concat(distractors(w, 3, meaning))).map((x) => ({ jp: meaning(x), go: (b) => {
            const ok = x === w; b.classList.add(ok ? 'good' : 'bad');
            if (!ok) [...el.querySelectorAll('.op')].forEach((bb) => { if (bb.querySelector('b').textContent === meaning(w)) bb.classList.add('good'); });
            if (ok) audio.ding();
            const kana = w.kana && w.kana !== jpOf(w) ? ' (' + w.kana + ')' : '';
            const line = ok ? pick(QUIZ_OK) : (() => { const b0 = pick(QUIZ_BAD); return [b0[0], b0[1] + ' «' + jpOf(w) + '»' + kana + ' — это «' + meaning(w) + '».']; })();
            const next = ok ? sample([['えへへ。', 'Хе-хе.'], ['まあね！', 'Ну да!'], ['勉強してるからね。', 'Я же учусь.']], 2) : sample([['なるほど！', 'Понятно!'], ['覚えておきます。', 'Запомню.'], ['あ、そっか！', 'А, точно!']], 2);
            setTimeout(() => show(line, next.map(([j, r]) => ({ jp: j, ru: r, go: after }))), 650);
        } }));
        show(ask, opts, '<span class="big">' + esc(jpOf(w)) + '</span>' + (w.kana && w.kana !== jpOf(w) ? '<span class="kana">' + esc(w.kana) + '</span>' : '') + '<span class="q">Что это значит?</span>');
    }
    // ---- беседа: приветствие (по времени суток и роли) → тема → реакция → иногда вопрос про слово → прощание ----
    const met = new Map(), usedTopics = new Map();
    function greetLines(group, meet, ch) {
        const h = new Date().getHours(), staff = STAFF.has(group), friend = FRIEND.has(group);
        const base = h < 11 ? ['おはようございます', 'Доброе утро'] : h < 18 ? ['こんにちは', 'Добрый день'] : ['こんばんは', 'Добрый вечер'];
        let say;
        if (meet > 0) say = staff ? ['あ、またいらっしゃいましたね！', 'О, вы снова к нам!'] : pick([['あ、また会ったね！', 'О, снова ты!'], ['おっ、また来たの？', 'О, опять ты здесь?']]);
        else if (staff && ch.greet && ch.greet[0]) say = [ch.greet[0], ch.greet[1]];
        else if (friend) say = pick([['やあ！元気？', 'Привет! Как дела?'], ['おっ、どうしたの？', 'О, ты чего?']]);
        else say = [base[0] + '！', base[1] + '!'];
        let me;
        if (friend) me = [['元気だよ！', 'Отлично!'], ['まあまあかな。', 'Так себе.'], ['ちょっと眠い…', 'Сонный немного…']];
        else me = [[base[0] + '。', base[1] + '.'], meet ? ['お久しぶりです。', 'Давно не виделись.'] : ['はじめまして。', 'Приятно познакомиться.'], ['どうも。', 'Здравствуйте.']];
        return { say, me };
    }
    function talk(ch) {
        if (!ch) return;
        if (ch.cat) { LIFE.say(ch, pick([['にゃー', 'Мяу'], ['ゴロゴロ…', 'Мррр…'], ['ふにゃ？', 'Мя?']]), 1.8, LIFE.S.t, inside.on ? null : scene); return; }
        const role = ch.role || 'guest', group = ch.wordText ? 'word' : (ROLE_GROUP[role] || 'guest');
        const meet = met.get(ch) || 0; met.set(ch, meet + 1);
        begin({ kind: 'talk', ch, inside: inside.on, icon: ch.wordText ? '❓' : '💬', name: ch.wordText ? ch.wordText : (ROLE_NAME[role] || 'Прохожий'), sub: ch.wordText ? 'человек-слово' : (meet ? 'снова встретились' : 'разговор') });
        const staff = STAFF.has(group);
        const finish = () => end(staff ? pick(BYE_STAFF) : pick(BYE_THEM));
        const farewell = (canMore) => {
            const say = staff ? ['他に何かありますか？', 'Что-нибудь ещё?'] : pick([['今日は話せて楽しかった！', 'Было приятно поболтать!'], ['あ、もうこんな時間！', 'Ой, уже столько времени!'], ['また話そうね。', 'Поболтаем ещё как-нибудь.']]);
            const opts = sample(BYE_ME, 2).map(([j, r]) => ({ jp: j, ru: r, go: finish }));
            if (canMore) opts.unshift({ jp: staff ? 'あと一つ、いいですか？' : 'もう少し話そう！', ru: staff ? 'Можно ещё вопрос?' : 'Давай ещё поболтаем!', go: () => topic(false) });
            show(say, opts);
        };
        const afterTopic = (first) => {
            const w = group === 'sleep' ? null : pickWord();
            if (w && Math.random() < (first ? 0.6 : 0.8)) return quiz(w, pick(QUIZ_ASK)(jpOf(w)), () => farewell(first));
            farewell(first);
        };
        const topic = (first) => {
            const list = TOPICS[group] || TOPICS.guest, used = usedTopics.get(ch) || new Set(); usedTopics.set(ch, used);
            let idx = list.map((_, i) => i).filter((i) => !used.has(i)); if (!idx.length) { used.clear(); idx = list.map((_, i) => i); }
            const i = pick(idx); used.add(i); const [say, answers] = list[i];
            if (group === 'sleep') return show(say, answers.map(([j, r, rep]) => ({ jp: j, ru: r, go: () => end(rep) })));
            show(say, sample(answers, Math.min(3, answers.length)).map(([j, r, rep]) => ({ jp: j, ru: r, go: () => show(rep, sample(REACT, 2).map(([rj, rr]) => ({ jp: rj, ru: rr, go: () => afterTopic(first) }))) })));
        };
        if (ch.wordText) { const w = pool().find((x) => jpOf(x) === ch.wordText) || null; if (w) return quiz(w, pick([['私は誰でしょう？', 'Угадай, кто я?'], ['私の名前、知ってる？', 'Знаешь, как меня зовут?']]), () => farewell(false)); }
        if (group === 'sleep') return topic(true);
        const g = greetLines(group, meet, ch);
        show(g.say, sample(g.me, 2).map(([j, r]) => ({ jp: j, ru: r, go: () => topic(true) })));
    }
    // ---- заказ у ятай ----
    const FOODISH = (w) => { const m = propMeta(jpOf(w)); return !!m && (m.where.indexOf('izakaya') >= 0 || m.where.indexOf('konbini') >= 0); };
    function order(stall) {
        const ch = stall.ch; if (!ch || pool().length < 4) { toast('Нужно хотя бы 4 слова с переводом'); return; }
        begin({ kind: 'order', ch, stall, inside: false, icon: '🍢', name: 'Продавец', sub: stall.food });
        const round = (first) => {
            const w = pickWord(FOODISH); if (!w) return close();
            const opts = shuffle([w].concat(distractors(w, 3, jpOf))).map((x) => ({ jp: jpOf(x), go: (b) => {
                const ok = x === w; score.all++; if (ok) score.ok++; head();
                b.classList.add(ok ? 'good' : 'bad'); if (ok) audio.ding(); else [...el.querySelectorAll('.op')].forEach((bb) => { if (bb.querySelector('b').textContent === jpOf(w)) bb.classList.add('good'); });
                const next = [{ jp: pick(['もう一つください！', 'あと一つお願いします！']), ru: 'Ещё одну, пожалуйста!', go: () => round(false) }, { jp: pick(['ありがとう！', 'それで全部です。']), ru: 'Спасибо, это всё!', go: () => end(pick(BYE_STAFF)) }];
                const k = w.kana && w.kana !== jpOf(w) ? ' (' + w.kana + ')' : '';
                const okL = pick([['はい、「' + jpOf(w) + '」ですね！どうぞ！', 'Да, «' + jpOf(w) + '»! Держите!'], ['まいど！「' + jpOf(w) + '」ひとつ！', 'Благодарю! Один «' + jpOf(w) + '»!'], ['「' + jpOf(w) + '」ね、ちょっと待ってて！', '«' + jpOf(w) + '», минутку!']]);
                const badL = pick([['えっ？「' + jpOf(x) + '」？うちにはないよ…', 'А? «' + jpOf(x) + '»? Такого у нас нет…'], ['「' + jpOf(x) + '」？それはちょっと…', '«' + jpOf(x) + '»? Это вряд ли…'], ['うーん、「' + jpOf(x) + '」は売ってないなあ。', 'Хм, «' + jpOf(x) + '» не продаём.']]);
                setTimeout(() => show(ok ? okL : [badL[0], badL[1] + ' Ты хотел «' + jpOf(w) + '»' + k + '.'], next), 600);
            } }));
            show(first ? pick([['いらっしゃい！何にしますか？', 'Добро пожаловать! Что будете?'], ['へい、らっしゃい！何にする？', 'Заходи! Что возьмёшь?'], ['いらっしゃいませ！ご注文は？', 'Добро пожаловать! Ваш заказ?']]) : pick([['はい、次は？', 'Так, что ещё?'], ['ほかには？', 'Что-нибудь ещё?'], ['もう一つ？何にする？', 'Ещё одну? Что именно?']]), opts, '<span class="q">Скажи продавцу, что хочешь:</span><span class="want">«' + esc(meaning(w)) + '»</span>');
        };
        round(true);
    }
    // ---- выбор персонажа по тапу ----
    const _ray = new THREE.Raycaster(), _p = new THREE.Vector2();
    function pickChar(x, y) {
        const list = (inside.on ? LIFE.S.room : LIFE.S.loose).filter((c) => c.root.visible && c.root.parent && c.root.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position) < 6);
        if (!list.length) return null;
        _p.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); _ray.setFromCamera(_p, camera); _ray.far = 6;
        const hits = _ray.intersectObjects(list.map((c) => c.root), true); if (!hits.length) return null;
        let o = hits[0].object; while (o && !(o.userData && o.userData.char)) o = o.parent;
        return o ? { ch: o.userData.char, dist: hits[0].distance } : null;
    }
    // ---- меню действий справа: что можно сделать с тем, что рядом и перед глазами ----
    const acts = document.createElement('div'); acts.id = 'acts'; acts.hidden = true; document.body.appendChild(acts);
    ['pointerdown', 'touchstart'].forEach((ev) => acts.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
    let actList = [], lastKey = '', frameN = 0;
    const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const _d = new THREE.Vector3(), _w = new THREE.Vector3();
    function nearby() {
        const cam = camera.position, out = [];
        camera.getWorldDirection(_d); _d.y = 0; _d.normalize();
        // лоток с продавцом
        if (!inside.on && th.festival && FESTIVAL.stalls) {
            let best = null, bd = 1.9; FESTIVAL.stalls.forEach((s) => { if (!s.ch) return; const d = flat(s.front, cam); if (d < bd) { bd = d; best = s; } });
            if (best) { out.push({ icon: '🍢', t: 'Заказать', fn: () => order(best) }, { icon: '💬', t: 'Поговорить', fn: () => talk(best.ch) }); return out; }
        }
        // ближайший человек перед глазами
        let ch = null, cd = inside.on ? 3.6 : 3.4;
        (inside.on ? LIFE.S.room : LIFE.S.loose).forEach((c) => {
            if (!c.root.visible || !c.root.parent) return; c.root.getWorldPosition(_w); const d = flat(_w, cam); if (d > cd || d < 0.2) return;
            const dot = ((_w.x - cam.x) * _d.x + (_w.z - cam.z) * _d.z) / d; if (dot < 0.55) return; cd = d; ch = c;
        });
        if (ch) {
            if (ch.cat) out.push({ icon: '🐾', t: 'Погладить кота', fn: () => talk(ch) });
            else if (ch.wordText) out.push({ icon: '❓', t: 'Кто это?', s: ch.wordText, fn: () => talk(ch) });
            else out.push({ icon: '💬', t: 'Поговорить', s: ROLE_NAME[ch.role] || 'прохожий', fn: () => talk(ch) });
        }
        // радио в комнате
        if (inside.on && typeof radio !== 'undefined' && radio.g && radio.g.parent) { radio.g.getWorldPosition(_w); if (flat(_w, cam) < 2.4) out.push({ icon: '📻', t: 'Сменить станцию', fn: () => radioNext() }); }
        return out;
    }
    function renderActs(list) {
        const key = list.map((a) => a.icon + a.t + (a.s || '')).join('|'); if (key === lastKey) return; lastKey = key; actList = list;
        acts.innerHTML = ''; acts.hidden = !list.length;
        list.forEach((a, i) => {
            const b = document.createElement('button'); b.className = i ? '' : 'main';
            b.innerHTML = (FINE && !i ? '<kbd>E</kbd>' : '') + '<span class="ic">' + a.icon + '</span><span class="lb">' + esc(a.t) + '</span>';
            b.addEventListener('click', () => { buzz(10); a.fn(); lastKey = ''; });
            acts.appendChild(b);
        });
    }
    function update() {
        if (cur) {
            const p = cur.ch && cur.ch.root.getWorldPosition(new THREE.Vector3());
            if (!p || flat(p, camera.position) > (cur.kind === 'order' ? 3.6 : 4.5) || (cur.inside !== undefined && cur.inside !== inside.on)) close();
            return;
        }
        if ((frameN++ % 6) !== 0) return;
        renderActs(nearby());
    }
    // клавиши: E — главное действие, 1–4 — вариант ответа, Esc — закрыть разговор
    addEventListener('keydown', (e) => {
        if (cur && el) {
            const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
            if (n != null) { const b = el.querySelectorAll('.op')[n]; if (b) b.click(); return; }
            if (e.code === 'Escape') close();
            return;
        }
        if (e.code === 'KeyE' && actList[0] && !acts.hidden) { actList[0].fn(); lastKey = ''; }
    });
    return { talk, order, close, pickChar, update, get open() { return !!cur; } };
})();
