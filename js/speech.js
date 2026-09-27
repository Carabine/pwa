// Озвучка текста встроенным синтезом речи браузера: японский голос для
// японских карточек, английский — для английских (режим «учу английский»).
// Голоса подбираем по языку; если синтеза нет вовсе — кнопки озвучки не
// показываем. speakJa/canSpeakJa оставлены как прежнее имя для японского.

(function () {
    'use strict';

    const voices = { ja: null, en: null };

    function pickVoice() {
        const list = window.speechSynthesis ? speechSynthesis.getVoices() : [];
        voices.ja = list.find((v) => /^ja/i.test(v.lang)) || null;
        // Американский голос предпочтительнее (дубляжи аниме — американские),
        // но подойдёт любой английский.
        voices.en = list.find((v) => /^en[-_]US/i.test(v.lang))
            || list.find((v) => /^en/i.test(v.lang)) || null;
    }

    if (window.speechSynthesis) {
        pickVoice();
        speechSynthesis.onvoiceschanged = pickVoice;
    }

    const LANG_TAG = { ja: 'ja-JP', en: 'en-US' };

    window.canSpeakJa = function () {
        return !!window.speechSynthesis;
    };

    window.speakAny = function (text, lang = 'ja') {
        if (!window.speechSynthesis || !text) return;
        const code = lang === 'en' ? 'en' : 'ja';
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = LANG_TAG[code];
        if (voices[code]) u.voice = voices[code];
        u.rate = 0.9;
        speechSynthesis.speak(u);
    };

    window.speakJa = function (text) { window.speakAny(text, 'ja'); };
})();
