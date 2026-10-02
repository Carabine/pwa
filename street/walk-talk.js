// ===== Разговоры: тап по персонажу — короткая беседа по-японски (ответы на выбор) и вопрос про слово из словаря.
// Заказ у ятай на Мацури: подошёл к лотку — продавец спрашивает «何にしますか？», надо выбрать нужное японское слово.
// Встраивается build-walk.mjs (общая область видимости с walk.js: data, camera, inside, LIFE, audio, toast…).
const TALK = (() => {
    const ROLE_NAME = { chef: 'Повар', ramenChef: 'Повар', cook: 'Хозяйка', vendor: 'Продавец', waiter: 'Официантка', barista: 'Бариста', clerk: 'Продавец', bookClerk: 'Продавец', teacher: 'Учитель', student: 'Ученик', student1r: 'Студент', family: 'Хозяин', elder: 'Бабушка', couple: 'Сосед', bar: 'Гость', party: 'Гость', ramenGuest: 'Гость', cafeGuest: 'Гость', shopper: 'Покупатель', reader: 'Читатель', gamer: 'Игрок', drummer: 'Игрок', worker: 'Сосед', sleeper: 'Ученик' };
    const GREET_OPTS = [['こんばんは！', 'Добрый вечер!'], ['はじめまして。', 'Приятно познакомиться.']];
    // [вопрос/реплика персонажа, ответы: [мой ответ jp, ru, его ответ jp, ru]]
    const SMALL = {
        food: [['お腹すいてる？', 'Проголодался?'], [['はい、ぺこぺこです！', 'Да, ужасно голоден!', 'じゃあ、たくさん食べてね！', 'Тогда ешь побольше!'], ['いいえ、大丈夫です。', 'Нет, спасибо.', 'そっか。また来てね！', 'Ну ладно. Заходи ещё!']]],
        serve: [['ご注文はお決まりですか？', 'Готовы заказать?'], [['水をください。', 'Воды, пожалуйста.', 'はい、少々お待ちください。', 'Минутку, пожалуйста.'], ['もう少し考えます。', 'Я ещё подумаю.', 'ごゆっくりどうぞ。', 'Не торопитесь.']]],
        teach: [['宿題はやりましたか？', 'Домашнее задание сделал?'], [['はい、やりました！', 'Да, сделал!', 'えらいですね！', 'Молодец!'], ['すみません、まだです…', 'Простите, ещё нет…', '明日までにね。', 'К завтрашнему дню, хорошо?']]],
        study: [['テスト、難しかったね。', 'Контрольная была трудная, да?'], [['うん、とても難しかった。', 'Ага, очень.', '一緒に勉強しよう！', 'Давай заниматься вместе!'], ['簡単だったよ！', 'Было легко!', 'すごい！', 'Круто!']]],
        home: [['お茶、飲む？', 'Чаю выпьешь?'], [['はい、いただきます。', 'Да, с удовольствием.', 'どうぞ、熱いよ。', 'Держи, горячий.'], ['今日はいいです。', 'Сегодня не надо.', 'そう、残念。', 'Жаль.']]],
        guest: [['いい夜ですね。', 'Хороший вечер, правда?'], [['そうですね！', 'И правда!', 'ここ、よく来るんですか？', 'Часто сюда заходите?'], ['ちょっと寒いです。', 'Немного холодно.', '温かい物を飲もう！', 'Выпьем чего-нибудь тёплого!']]],
        play: [['一緒にやる？', 'Сыграем вместе?'], [['うん、やろう！', 'Давай!', 'よし、負けないよ！', 'Отлично, не проиграю!'], ['見てるだけです。', 'Я только посмотрю.', 'じゃあ、応援してね！', 'Тогда болей за меня!']]],
        sleep: [['ぐー…', 'Хррр…'], [['起きてください！', 'Проснись!', '…はっ！寝てないよ！', '…А? Я не сплю!']]],
    };
    const ROLE_SMALL = { chef: 'food', ramenChef: 'food', cook: 'food', vendor: 'food', waiter: 'serve', barista: 'serve', clerk: 'serve', bookClerk: 'serve', teacher: 'teach', student: 'study', student1r: 'study', family: 'home', elder: 'home', couple: 'home', gamer: 'play', drummer: 'play', sleeper: 'sleep' };

    let el = null, cur = null, coolUntil = new Map(), score = { ok: 0, all: 0 };
    function ui() {
        if (el) return el;
        el = document.createElement('div'); el.id = 'talk';
        el.innerHTML = '<button class="tx" aria-label="Закрыть">×</button><div class="who"></div><div class="say"><div class="row"><span class="jp"></span><button class="spk" aria-label="Озвучить">🔊</button></div><div class="ru"></div></div><div class="task"></div><div class="opts"></div>';
        document.body.appendChild(el);
        el.querySelector('.tx').addEventListener('click', () => close());
        el.querySelector('.spk').addEventListener('click', () => speak(el.querySelector('.jp').textContent));
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
    // слово для вопроса: сначала то, что пора повторить или забывается, потом то, что учишь
    function pickWord(pref) {
        const P = pool(); if (P.length < 4) return null;
        const rank = (w) => ({ due: 0, worn: 0, warm: 1, new: 2, lit: 3 }[w._state] ?? 2) + Math.random() * 1.6 - (pref && pref(w) ? 1.2 : 0);
        return P.slice().sort((a, b) => rank(a) - rank(b))[0];
    }
    function distractors(w, n, key) {
        const P = pool().filter((x) => x !== w && key(x) !== key(w)), out = [], seen = new Set([key(w)]);
        while (out.length < n && P.length) { const x = P.splice(Math.floor(Math.random() * P.length), 1)[0]; if (!seen.has(key(x))) { seen.add(key(x)); out.push(x); } }
        return out;
    }
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

    // ---- отрисовка шага: реплика персонажа, задание, варианты ----
    function show(line, opts, task) {
        const e = ui(); e.classList.add('on');
        e.querySelector('.who').textContent = cur.name + (cur.kind === 'order' && score.all ? ' · заказов: ' + score.ok + ' из ' + score.all : '');
        e.querySelector('.jp').textContent = line[0]; e.querySelector('.ru').textContent = line[1] || '';
        e.querySelector('.task').innerHTML = task || ''; e.querySelector('.task').hidden = !task;
        const box = e.querySelector('.opts'); box.innerHTML = '';
        opts.forEach((o) => { const b = document.createElement('button'); b.className = 'op' + (o.cls ? ' ' + o.cls : ''); b.innerHTML = '<b>' + o.jp + '</b>' + (o.ru ? '<small>' + o.ru + '</small>' : ''); b.addEventListener('click', () => { buzz(8); o.go(b); }); box.appendChild(b); });
        box.classList.toggle('four', opts.length === 4);
        // реплика и пузырём над головой
        if (cur.ch && !cur.ch.cat) { cur.ch.faceUntil = LIFE.S.t + 30; LIFE.say(cur.ch, line, 3.2, LIFE.S.t, inside.on ? null : scene); }
        hideHint();
    }
    const end = (line) => { show(line, []); setTimeout(() => { if (cur && cur.ended) close(); }, 1700); cur.ended = true; };
    function close() {
        if (!el) return; el.classList.remove('on');
        if (cur && cur.ch) cur.ch.faceUntil = 0;
        if (cur && cur.stall) coolUntil.set(cur.stall, LIFE.S.t + 25);
        cur = null;
    }
    // ---- вопрос «что значит слово?»: варианты — переводы ----
    function quiz(w, ask, after) {
        if (!w) return after();
        const opts = shuffle([w].concat(distractors(w, 3, meaning))).map((x) => ({ jp: meaning(x), go: (b) => {
            const ok = x === w; b.classList.add(ok ? 'good' : 'bad');
            if (!ok) [...el.querySelectorAll('.op')].forEach((bb) => { if (bb.textContent === meaning(w)) bb.classList.add('good'); });
            if (ok) audio.ding();
            setTimeout(() => show(ok ? ['そうそう！よく知ってるね！', 'Точно! Хорошо знаешь!'] : ['ちがうよ。', 'Не-а. «' + jpOf(w) + '»' + (w.kana && w.kana !== jpOf(w) ? ' (' + w.kana + ')' : '') + ' — это «' + meaning(w) + '».'], [{ jp: 'なるほど！', ru: 'Понятно!', go: after }]), 650);
        } }));
        show(ask, opts, '<span class="big">' + jpOf(w) + '</span>' + (w.kana && w.kana !== jpOf(w) ? '<span class="kana">' + w.kana + '</span>' : ''));
    }
    // ---- беседа с персонажем ----
    function talk(ch) {
        if (!ch) return;
        if (ch.cat) { LIFE.say(ch, Math.random() < 0.5 ? ['にゃー', 'Мяу'] : ['ゴロゴロ…', 'Мррр…'], 1.8, LIFE.S.t); return; }
        const role = ch.role || (ch.wordText ? 'word' : 'guest');
        cur = { kind: 'talk', ch, inside: inside.on, name: ch.wordText ? ch.wordText : (ROLE_NAME[role] || 'Прохожий') };
        const bye = () => show(['またね！', 'Ещё увидимся!'], [{ jp: 'じゃあ、またね！', ru: 'Ну, пока!', go: () => end(['気をつけてね！', 'Береги себя!']) }]);
        // человек-слово: угадай, кто я
        if (ch.wordText) { const w = pool().find((x) => jpOf(x) === ch.wordText) || null; if (w) return quiz(w, ['私は誰でしょう？', 'Угадай, кто я?'], bye); }
        const small = SMALL[ROLE_SMALL[role] || 'guest'];
        const greet = (ch.greet && ch.greet[0]) ? [ch.greet[0], ch.greet[1]] : ['こんばんは！', 'Добрый вечер!'];
        const w = role === 'sleeper' ? null : pickWord();
        const toSmall = () => show(small[0], small[1].map((r) => ({ jp: r[0], ru: r[1], go: () => show([r[2], r[3]], [{ jp: role === 'sleeper' ? 'すみません！' : 'ところで…', ru: role === 'sleeper' ? 'Извини!' : 'Кстати…', go: () => (w ? quiz(w, ['ところで、「' + jpOf(w) + '」ってどういう意味？', 'Кстати, что значит «' + jpOf(w) + '»?'], bye) : bye()) }]) })));
        if (role === 'sleeper') return toSmall();
        show(greet, GREET_OPTS.map(([j, r]) => ({ jp: j, ru: r, go: toSmall })));
    }
    // ---- заказ у ятай ----
    const FOODISH = (w) => { const m = propMeta(jpOf(w)); return !!m && (m.where.indexOf('izakaya') >= 0 || m.where.indexOf('konbini') >= 0); };
    function order(stall) {
        const ch = stall.ch; if (!ch || pool().length < 4) return;
        cur = { kind: 'order', ch, stall, name: 'Продавец · ' + stall.food };
        const round = (first) => {
            const w = pickWord(FOODISH); if (!w) return close();
            const opts = shuffle([w].concat(distractors(w, 3, jpOf))).map((x) => ({ jp: jpOf(x), go: (b) => {
                const ok = x === w; score.all++; if (ok) score.ok++;
                b.classList.add(ok ? 'good' : 'bad'); if (ok) audio.ding(); else [...el.querySelectorAll('.op')].forEach((bb) => { if (bb.querySelector('b').textContent === jpOf(w)) bb.classList.add('good'); });
                const next = [{ jp: 'もう一つください！', ru: 'Ещё одну, пожалуйста!', go: () => round(false) }, { jp: 'ありがとう！', ru: 'Спасибо!', go: () => end(['まいどあり！', 'Спасибо за покупку!']) }];
                setTimeout(() => show(ok ? ['はい、「' + jpOf(w) + '」ですね！どうぞ！', 'Да, «' + jpOf(w) + '»! Держите!'] : ['えっ？「' + jpOf(x) + '」？うちにはないよ…', 'А? «' + jpOf(x) + '»? Такого нет… Ты хотел «' + jpOf(w) + '» (' + (w.kana || '') + ')'], next), 600);
            } }));
            show(first ? ['いらっしゃい！何にしますか？', 'Добро пожаловать! Что будете?'] : ['はい、次は？', 'Так, что ещё?'], opts, 'Скажи продавцу, что хочешь: <b>«' + meaning(w) + '»</b>');
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
    // каждый кадр: подошёл к лотку — продавец спрашивает; ушёл — закрываем
    const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    function update() {
        if (cur) { const p = cur.ch && cur.ch.root.getWorldPosition(new THREE.Vector3()); if (!p || flat(p, camera.position) > (cur.kind === 'order' ? 3.4 : 4.5) || (cur.inside !== undefined && cur.inside !== inside.on)) close(); return; }
        if (inside.on || !th.festival || !FESTIVAL.stalls) return;
        for (const s of FESTIVAL.stalls) {
            if (!s.ch || (coolUntil.get(s) || 0) > LIFE.S.t) continue;
            if (flat(s.front, camera.position) < 1.25) { order(s); if (cur) cur.inside = false; break; }
        }
    }
    return { talk, order, close, pickChar, update, get open() { return !!cur; } };
})();
