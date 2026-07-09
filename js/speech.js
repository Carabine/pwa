// Озвучка японского текста встроенным синтезом речи браузера.
// Голос подбираем японский; если его нет в системе — кнопки озвучки не показываем.

(function () {
    'use strict';

    let jaVoice = null;

    function pickVoice() {
        const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
        jaVoice = voices.find(v => /^ja/i.test(v.lang)) || null;
    }

    if (window.speechSynthesis) {
        pickVoice();
        speechSynthesis.onvoiceschanged = pickVoice;
    }

    window.canSpeakJa = function () {
        return !!window.speechSynthesis;
    };

    window.speakJa = function (text) {
        if (!window.speechSynthesis || !text) return;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP';
        if (jaVoice) u.voice = jaVoice;
        u.rate = 0.9;
        speechSynthesis.speak(u);
    };
})();
