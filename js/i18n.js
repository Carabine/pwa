// Локализация интерфейса: русский, украинский, английский.
// Статичные тексты помечаются data-i18n="ключ", динамические берутся через t('ключ').

const I18N = {
    ru: {
        'page.catalog': 'Каталог — Animei',
        'page.beginner': 'Для новичков — Animei',
        'page.player': 'Плеер — Animei',
        'watch.prep': 'Подготовка…',
        'watch.step.download': 'Скачивание видео',
        'watch.step.audio': 'Извлечение аудио из потока',
        'watch.step.transcribe': 'Транскрипция (Whisper)',
        'watch.step.tokenize': 'Токенизация (MeCab)',
        'watch.step.translate': 'Перевод',
        'watch.loadingFile': 'Загрузка файла…',
        'watch.doneSegs': 'Готово — %n сегментов',
        'watch.errorPrefix': 'Ошибка: ',
        'watch.back': 'Назад',
        'player.origJp': 'Оригинал (яп.)',
        'player.origJpDirect': 'Оригинал (яп., прямой)',
        'player.origJpClean': 'Оригинал (яп., без сабов)',
        'subs.langEn': 'Английские',
        'subs.langRu': 'Русские',
        'subs.langRuBurned': 'Русские (вшиты в видео)',
        'subs.langOriginal': 'Оригинал',
        'subs.originalClean': 'Оригинал (без субтитров)',
        'subs.originalBurnedRu': 'Оригинал (рус. сабы вшиты)',
        'subs.originalBurnedEn': 'Оригинал (англ. сабы вшиты)',
        'player.subLangRu': 'рус. сабы',
        'player.subLangEn': 'англ. сабы',
        'nav.admin': 'Админка',
        'decks.untitled': 'Колода',
        'clip.sec': 'с',
        'session.title': 'Слова из последнего просмотра',
        'session.pick': 'Выбери, что учить сегодня — остальные останутся в «Моих словах»',
        'session.study': 'Учить выбранные',
        'session.later': 'Позже',
        'session.next': 'Следующая серия',
        'beginner.choose': 'С чего начнём?',
        'beginner.core': 'Сцены из аниме',
        'beginner.core.sub': 'Карточки с видео — реплики культовых сцен',
        'beginner.full': 'Базовые слова',
        'beginner.full.sub': 'Вся стартовая колода: 15 сцен + 35 частых слов',
        'hub.continue': 'Продолжить просмотр',
        'hub.continue.ep': 'Серия',
        'hub.study': 'Учёба',
        'hub.study.sub': 'Ежедневное интервальное повторение',
        'hub.custom': 'Повторить всё',
        'hub.custom.sub': 'Все слова без расписания',
        'hub.beginner': 'Для новичков',
        'hub.beginner.sub': 'Готовая колода: 50 простых слов из известных аниме',
        'hub.catalog': 'Каталог аниме',
        'hub.catalog.sub': 'Смотри аниме и кликай по словам — учи их в карточках',
        'hub.catalog.badge': 'словарь',
        'hub.watch': 'Своё видео',
        'hub.watch.sub': 'Загрузи файл или ссылку',
        'nav.home': 'Главная',
        'nav.catalog': 'Поиск аниме',
        'nav.watch': 'Своё видео',
        'nav.dictionary': 'Мои слова',
        'nav.news': 'JP News',
        'nav.feedback': 'Обратная связь',
        'nav.site': '← На сайт Animei',
        'nav.logout': 'Выйти',
        'nav.login': 'Войти',

        'ui.quality.title': 'Качество видео',
        'ui.quality.auto': 'Авто',

        'auth.loginTitle': 'С возвращением',
        'auth.loginSubtitle': 'Войди, чтобы слова синхронизировались между устройствами',
        'auth.registerTitle': 'Создать аккаунт',
        'auth.registerSubtitle': 'Аккаунт нужен, чтобы твои слова хранились и не терялись',
        'auth.email': 'Почта',
        'auth.password': 'Пароль',
        'auth.signIn': 'Войти',
        'auth.signUp': 'Создать аккаунт',
        'auth.toRegister': 'Нет аккаунта? Создать',
        'auth.toLogin': 'Уже есть аккаунт? Войти',
        'auth.optional': 'Вход не обязателен — учиться можно и без аккаунта',
        'auth.back': '← В приложение',
        'auth.needFields': 'Введи почту и пароль',
        'auth.success': 'Готово, ты вошёл',
        'auth.error': 'Не получилось — проверь почту и пароль',

        'catalog.title': 'Каталог',
        'catalog.placeholder': 'Название аниме — например, Фрирен или Naruto',
        'header.search': 'Поиск аниме',
        'catalog.hint': 'Введи название — и смотри с японскими субтитрами через пару секунд',
        'catalog.searching': 'Ищем…',
        'catalog.empty': 'Ничего не нашли — попробуй другое написание',
        'catalog.filter.all': 'Все',
        'catalog.filter.easy': '🎓 Полегче',
        'catalog.picks': 'Проверенные простые тайтлы:',
        'catalog.easyEmpty': 'В этом списке простых тайтлов нет — попробуй подборку выше.',
        'catalog.diff.easy': '🎓 полегче',
        'catalog.diff.medium': 'средне',
        'catalog.diff.hard': 'сложный язык',
        'catalog.error': 'Ошибка поиска — проверь, запущен ли сервер',
        'catalog.popular': 'Популярное',
        'catalog.hint': 'Открой любое аниме и кликай по словам в субтитрах — они попадут в твой словарь и в карточки для изучения.',
        'kind.tv': 'Сериал', 'kind.movie': 'Фильм', 'kind.ova': 'OVA', 'kind.ona': 'ONA', 'kind.special': 'Спешл',
        'catalog.ep': 'эп.',

        'player.loading': 'Загрузка…',
        'player.videoLoading': 'Загружаем видео…',
        'player.noTitle': 'Тайтл не выбран — вернись в каталог',
        'player.noPlayers': 'Для этого тайтла не нашлось ни одного плеера',
        'player.notFound': 'Этого тайтла нет в видеобазе',
        'player.episodesError': 'Ошибка загрузки серий',
        'player.streamError': 'Не получилось загрузить эту серию',
        'player.videoError': 'Ошибка видео: ',
        'player.reconnecting': 'Обрыв связи — переподключаемся…',
        'player.noHls': 'Браузер не поддерживает HLS',
        'player.movie': 'Фильм',
        'player.jpAudio': 'япон. озвучка',
        'player.episode': 'серия',
        'controls.translation': 'Субтитры',
        'controls.episode': 'Серия',
        'controls.mode': 'Режим',
        'controls.autopause': '⏸ Авто-пауза',
        'controls.autopause.title': 'Пауза после каждой реплики (S)',
        'controls.ru.title': 'Показывать перевод в списке субтитров',
        'controls.hideVideo': 'Скрыть видео',
        'controls.showVideo': 'Показать видео',
        'controls.hideVideo.title': 'Спрятать картинку, оставить звук и субтитры — тренировка на слух',
        'player.videoHidden': 'Видео скрыто — звук играет',
        'hotkeys.space': 'пауза',
        'hotkeys.a': 'повторить реплику',
        'player.coverage': 'Ты знаешь {p}% слов этой серии ({k} из {n})',
        'hotkeys.s': 'авто-пауза',
        'hotkeys.d': 'следующая',
        'hotkeys.f': 'весь экран',
        'hotkeys.click': 'клик по слову',
        'hotkeys.dict': 'словарь',
        'ui.play.title': 'Играть/пауза (Space)',
        'ui.mute.title': 'Звук (M)',
        'ui.speed.title': 'Скорость воспроизведения',
        'ui.fs.title': 'Во весь экран (F)',
        'ui.theater.title': 'Кино-режим: видео + субтитры сбоку',
        'transcript.title': 'Субтитры',
        'subs.searching': 'Ищем японские субтитры…',
        'subs.syncing': 'Синхронизируем субтитры со звуком…',
        'subs.notFound': 'Для этого тайтла нет японских сабов в архиве 😔 Видео можно смотреть без них',
        'subs.error': 'Не удалось загрузить субтитры',
        'subs.synced': 'Сабы подогнаны под текущий момент',
        'subs.wrong': 'Не совпадают?',
        'subs.wrong.title': 'Субтитры не совпадают со звуком? Синхронизировать точно',
        'edeck.label': 'Карточки',
        'edeck.btn': '🎴 Колода из серии',
        'edeck.btn.title': 'Собрать колоду из простых (N5–N4) слов этой серии',
        'edeck.title': 'Колода из серии',
        'edeck.sub': 'Простые слова (N5–N4) из этой серии. Сними галочки с ненужных.',
        'edeck.selectAll': 'Выбрать все',
        'edeck.selected': 'выбрано {n} из {m}',
        'edeck.createIdle': 'Создать колоду',
        'edeck.create': 'Создать колоду ({n})',
        'edeck.creating': 'Сохраняем {i}/{n}…',
        'edeck.done': 'Колода «{name}» создана: слов — {n}',
        'edeck.partial': 'Колода создана, но сохранилось лишь {k} из {n} слов',
        'edeck.fewWords': 'В этой серии не нашлось достаточно простых (N5–N4) слов',
        'edeck.error': 'Не удалось создать колоду',
        'edeck.freq.title': 'Сколько раз слово встречается в серии',
        'subs.sync.title': 'Синхронизация субтитров',
        'subs.precise.btn': '🎯 Точно синхронизировать по звуку',
        'subs.precise.hint': 'Найдём точный сдвиг по звуку и сохраним его навсегда для этой серии.',
        'subs.precise.working': '🎧 Распознаём речь… это может занять пару минут. Найденный сдвиг сохранится навсегда для этой серии.',
        'subs.precise.done': '✓ Субтитры точно синхронизированы.',
        'subs.precise.fail': 'Не удалось точно подобрать. Сдвиньте субтитры вручную ниже.',
        'subs.manual.title': 'Сдвинуть вручную',
        'subs.manual.hint': '«+» — позже, «−» — раньше. Сохранится для этой серии.',
        'subs.manual.reset': 'Сбросить',
        'subs.manual.sec': 'с',
        'subs.backToCurrent': 'К текущей',
        'subs.backToCurrent.title': 'Вернуться к текущей реплике',
        'subs.pickManually': 'Выбрать субтитры вручную',
        'subs.picker.title': 'Выбрать субтитры вручную',
        'subs.picker.search': 'Название аниме на латинице',
        'subs.picker.filterFiles': 'Фильтр файлов (напр. S01E01 или - 01)',
        'subs.picker.hint': 'Введите название аниме на латинице',
        'subs.picker.searching': 'Ищем в архиве…',
        'subs.picker.nothing': 'Ничего не нашли — попробуйте другое название',
        'subs.picker.error': 'Архив субтитров не отвечает',
        'subs.picker.loadingFiles': 'Загружаем список серий…',
        'subs.picker.noFiles': 'В этом тайтле нет файлов субтитров',
        'subs.picker.chosen': 'Субтитры выбраны',
        'popup.searching': 'Ищем в словаре…',
        'popup.notFound': 'В словаре такого нет — но можно сохранить как есть',
        'popup.noResponse': 'Словарь не отвечает',
        'popup.seen': 'встретилось ×{n}',
        'popup.save': 'Сохранить слово',
        'popup.saving': 'Сохраняем…',
        'popup.saved': '✓ Сохранено',
        'popup.savedSnack': 'Слово сохранено — появится в карточках',
        'popup.saveError': 'Не удалось сохранить — войди в аккаунт',
        'popup.loginNeeded': 'Войди в аккаунт, чтобы сохранять слова',
        'popup.common': 'частое слово',
        'popup.retry': 'Повторить',
        'popup.explain': 'Разобрать предложение',
        'popup.explaining': 'Готовим разбор…',
        'popup.explainLimited': 'Сервис перегружен — попробуй через минуту',
        'popup.explainError': 'Не удалось получить разбор — проверь соединение',
        'explain.translation': 'Перевод',
        'explain.parts': 'По частям',
        'explain.grammar': 'Грамматика',
        'controls.reading.title': 'Чтение над словами: кана ⇄ ромадзи',
        'controls.reading.kana': 'Кана над словами',
        'controls.reading.romaji': 'Ромадзи над словами',
        'controls.season': 'Сезон',
        'controls.special': 'Спешл',
        'controls.settings': 'Настройки видео',
        'controls.collapse': 'Скрыть',
        'controls.expand': 'Показать',
        'mtab.subs': 'Субтитры',
        'mtab.settings': 'Настройки',
        'words.explain': 'ИИ-разбор предложения',
        'words.explainShort': 'Разбор',
        'words.explaining': 'Готовим разбор…',
        'words.explainError': 'Не удалось получить разбор — попробуй позже',
        'player.syncHint': 'Субтитры сами синхронизируются со звуком — обычно ничего настраивать не нужно.',
        'subs.notFoundLink': 'Загрузить своё видео с сабами',

        'study.title': 'Учёба',
        'study.back': '← Назад',
        'study.showAnswer': 'Показать ответ',
        'study.again': 'Забыл',
        'study.good': 'Помню',
        'study.hint.min': '< 1 мин',
        'study.hint.soon': 'скоро',
        'study.hint.tomorrow': 'завтра',
        'study.hint.days': 'через {n} дн',
        'study.new': 'Новые',
        'study.learning': 'Учу',
        'study.review': 'Повторить',
        'study.remaining': 'Осталось',
        'study.doneCount': 'Пройдено',
        'study.restart': 'Начать заново',
        'study.allDone': 'На сегодня всё',
        'study.nothingDue': 'Сейчас повторять нечего — загляни позже',
        'study.noWords': 'В коллекции пока нет слов. Добавляй их при просмотре аниме — кликом по слову в субтитрах.',
        'study.reviewed': 'Карточек пройдено:',
        'study.tomorrow': 'Завтра ждёт:',
        'study.alreadyKnow': 'Уже знаю это слово',
        'study.queuedNew': 'Новых слов ждёт в очереди:',
        'study.close': 'Закрыть',
        'study.listen': 'Озвучить',

        'starter.offer.title': 'Начни с готовой колоды',
        'starter.offer.text': 'Карточек пока нет. Добавь 15 простых слов из известных аниме и начни учиться прямо сейчас — свои слова соберёшь позже при просмотре.',
        'starter.add': 'Добавить 15 слов',
        'starter.open': 'Колода для новичков',
        'starter.added': 'Добавлено слов:',
        'starter.addOne': '+ В коллекцию',
        'starter.addedOne': '✓ В коллекции',
        'starter.addAll': 'Добавить всю колоду в коллекцию',
        'starter.fromAnime': 'Из аниме:',

        'home.due': 'к повторению',
        'home.new': 'новых',
        'home.today': 'Сегодня:',
        'home.allClear': 'На сегодня всё повторено ✓',
        'home.streak': '🔥 ',

        'plan.title': 'План на сегодня',
        'plan.reviews': 'повторений',
        'plan.min': 'мин',
        'plan.start': 'Начать',
        'plan.resume': 'Продолжить',
        'plan.of': 'из',
        'plan.done.title': 'На сегодня всё ✓',
        'plan.done.sub': 'Слова повторены. Смотри дальше — новые придут из серий.',
        'plan.done.cta': 'Смотреть аниме',
        'plan.empty.title': 'Начни с готовой колоды',
        'plan.empty.sub': '15 карточек со сценами из культовых аниме. Понравятся — добавишь в свои слова.',
        'plan.empty.cta': 'Попробовать',
        'week.title': 'Эта неделя',
        'week.days': 'Вс,Пн,Вт,Ср,Чт,Пт,Сб',
        'hub.more': 'Ещё',
        'hub.watchAnime': 'Смотреть аниме',
        'install.cta': 'Установить приложение',
        'install.ios': 'Нажми «Поделиться» в панели браузера и выбери «На экран „Домой“».',
        'install.hide': 'Скрыть',

        'words.syncPartial': 'Часть слов не перенеслась в аккаунт — они сохранены локально и перенесутся позже',
        'words.title': 'Мои слова',
        'words.loading': 'Загрузка…',
        'words.empty': 'В коллекции пока нет слов. Кликай по словам в субтитрах во время просмотра — они появятся здесь.',
        'words.openCatalog': 'Открыть каталог',
        'words.filter': 'Поиск по слову или переводу…',
        'words.filterShort': 'Поиск слова…',
        'words.nothingFound': 'Ничего не нашлось',
        'words.clip': 'Есть видеофрагмент',
        'words.edit': 'Изменить',
        'words.cancel': 'Отмена',
        'words.save': 'Сохранить',
        'words.savedSnack': 'Сохранено',
        'words.delete.title': 'Удалить слово',
        'words.word': 'Слово',
        'words.reading': 'Чтение',
        'words.meaning': 'Значение',
        'words.sentence': 'Предложение',
        'words.sentenceTranslation': 'Перевод предложения',
        'words.hint': 'Подсказка',
        'words.export': 'Экспорт (текст)',
        'words.export.title': 'Простой текстовый файл — резервная копия',
        'words.exportAnki': 'Экспорт в Anki',
        'words.exportAnki.title': 'Готовая колода с аудио из ваших клипов',
        'words.exportAnki.busy': 'Готовим колоду…',
        'words.exportAnki.done': 'Колода скачана — импортируйте файл в Anki',
        'words.exportAnki.fail': 'Не удалось собрать колоду. Попробуйте ещё раз',
        'words.videoPreparing': 'Видео готовится — появится через минуту',
        'words.clipFailed': 'Слово сохранено, но видео не удалось нарезать',
        'words.audioRemove': 'Убрать звук',
        'words.tts': 'Озвучка',
        'words.ttsGen': '🔊 Сгенерировать озвучку',
        'words.ttsRegen': 'Перегенерировать',
        'words.ttsBusy': 'Генерируем…',
        'words.ttsDone': 'Озвучка готова',
        'words.ttsFail': 'Не удалось сгенерировать озвучку',

        'decks.all': 'Все',
        'decks.createFirst': 'Создать колоду',
        'decks.create': 'Создать колоду',
        'decks.study': 'Учить',
        'decks.manage': 'Управление колодой',
        'decks.add': 'В колоды',
        'decks.sheetTitle': 'Добавить в колоды',
        'decks.noneYet': 'Колод пока нет — создайте первую',
        'decks.newTitle': 'Новая колода',
        'decks.namePlaceholder': 'Название колоды',
        'decks.created': 'Колода создана',
        'decks.added': 'Добавлено в колоду',
        'decks.removed': 'Убрано из колоды',
        'decks.hint': 'Собирайте слова в свои колоды и учите их отдельно. Колоды хранятся на этом устройстве.',
        'decks.save': 'Сохранить',
        'decks.delete': 'Удалить колоду',
        'decks.deleteConfirm': 'Удалить колоду? Слова останутся в словаре.',
        'decks.deleted': 'Колода удалена',
        'decks.empty': 'В этой колоде пока нет слов. Добавьте их из словаря — кнопка «⋯» на карточке.',
        'decks.addedN': 'Добавлено в колоду: {n}',
        'decks.noDeck': 'Без колоды',
        'decks.noneEmpty': 'Все слова разложены по колодам',
        'words.deleteConfirmOne': 'Удалить слово «{w}»?',
        'words.actions': 'Действия',
        'words.copy': 'Скопировать',
        'words.copied': 'Скопировано',
        'words.select': 'Выбрать',
        'words.selectedN': 'Выбрано: {n}',
        'words.selectAll': 'Все',
        'words.toDeck': 'В колоду',
        'words.fromDeck': 'Из колоды',
        'words.bulkDelete': 'Удалить',
        'words.bulkDeleteConfirm': 'Удалить выбранные слова ({n})? Их нельзя будет восстановить.',
        'words.bulkDeleted': 'Удалено слов: {n}',
        'words.removedFromDeckN': 'Убрано из колоды: {n}',
        'words.close': 'Закрыть',
        'words.view.list': 'Список',
        'words.view.cards': 'Карточки',
        'words.sort.new': 'Сначала новые',
        'words.sort.old': 'Сначала старые',
        'words.sort.az': 'По алфавиту',
        'known.title': 'Известные слова',
        'known.import': 'Импорт известных слов',
        'known.hint': 'Подходит колода Anki (.apkg) — возьмём из неё уже изученные слова, — а также текстовые экспорты из jpdb, Takoboto, Akebi, LingQ, Migaku и других приложений (CSV/TSV/простой список: из каждой строки берём японское слово). WaniKani подключается по API-токену ниже. Эти слова считаются знакомыми: подсвечиваются в субтитрах, входят в процент покрытия и не предлагаются в колодах из серий. Список хранится на этом устройстве.',
        'known.apkgReading': 'Читаем колоду…',
        'known.apkgLearnedOnly': 'Только изученные ({k} из {n})',
        'known.apkgModern': 'Формат .apkg слишком новый. В Anki при экспорте включите «Support older Anki versions» или экспортируйте «Notes in Plain Text».',
        'known.apkgFail': 'Не удалось прочитать колоду Anki',
        'known.paste': 'Слова из Anki или простого списка…',
        'known.file': 'Выбрать файл',
        'known.recognized': 'Распознано слов: {n}',
        'known.importDo': 'Импортировать',
        'known.imported': 'Добавлено известных слов: {n}',
        'known.nothingNew': 'Новых слов нет — всё уже в списке',
        'known.none': 'Известных слов пока нет. Импортируйте список из Anki или другого приложения — эти слова перестанут предлагаться как новые.',
        'known.clear': 'Очистить список',
        'known.clearConfirm': 'Удалить все известные слова ({n})?',
        'known.cleared': 'Список очищен',
        'known.more': '…и ещё {n}',
        'known.toDeck': 'В колоду на повторение',
        'known.deckName': 'Известные слова',
        'known.toDeckConfirm': 'Создать карточки из {n} слов и собрать их в новую колоду? Чтение и перевод подтянем из словаря — это займёт немного времени.',
        'known.toDeckLimit': 'За раз берём не больше {n} слов — отфильтруйте список, если нужен другой набор.',
        'known.toDeckDone': 'Готово: {n} карточек в колоде «{d}»',
        'known.toDeckFail': 'Не получилось собрать колоду — попробуйте ещё раз',
        'known.wkToken': 'API-токен WaniKani',
        'known.wkLoad': 'Из WaniKani',
        'known.wkBusy': 'WaniKani: {n}…',
        'known.wkFail': 'WaniKani не ответил — проверьте API-токен',

        'feedback.title': 'Обратная связь',
        'feedback.text': 'Помоги сделать изучение японского ещё лучше — поделись мыслями, идеями или проблемами.',
        'feedback.telegram': 'Напиши нам в Telegram:',
        'feedback.thanks': 'Спасибо, что помогаешь!',

        'nav.settings': 'Настройки',
        'nav.account': 'Настройки аккаунта',

        'settings.title': 'Настройки',
        'settings.general': 'Общие',
        'settings.account': 'Аккаунт',
        'settings.appearance': 'Оформление',
        'settings.theme': 'Тема',
        'settings.theme.dark': 'Тёмная',
        'settings.theme.light': 'Светлая',
        'settings.theme.system': 'Как в системе',
        'settings.language': 'Язык',
        'settings.subs': 'Субтитры',
        'settings.subSize': 'Размер субтитров',
        'settings.size.sm': 'Мелкий',
        'settings.size.md': 'Средний',
        'settings.size.lg': 'Крупный',
        'settings.playerRomaji': 'Ромадзи в плеере по умолчанию',
        'settings.playerTranslation': 'Показывать перевод субтитров',
        'settings.playback': 'Воспроизведение и звук',
        'settings.study': 'Обучение',
        'settings.newPerDay': 'Новых карточек в день',
        'settings.newPerDay.hint': 'Слова сверх лимита не пропадают — ждут в очереди и вводятся в следующие дни.',
        'settings.volume': 'Громкость по умолчанию',
        'settings.autopause': 'Авто-пауза после реплики',
        'settings.loopClips': 'Зацикливать клипы слов',
        'settings.signedInAs': 'Вы вошли как',
        'settings.guest': 'Ты не вошёл — настройки хранятся только в этом браузере.',
        'settings.login': 'Войти',
        'settings.logout': 'Выйти',
        'settings.changePassword': 'Смена пароля',
        'settings.currentPassword': 'Текущий пароль',
        'settings.newPassword': 'Новый пароль',
        'settings.savePassword': 'Обновить пароль',
        'settings.passwordChanged': 'Пароль обновлён',
        'settings.passwordWrong': 'Неверный текущий пароль',
        'settings.passwordShort': 'Новый пароль слишком короткий (минимум 6)',
        'settings.passwordFields': 'Заполни оба поля',
        'settings.passwordError': 'Не удалось сменить пароль',
        'settings.saved': 'Сохранено',
        'settings.savedHint': 'Настройки применяются сразу',

        'study.settings.title': 'Настройки обучения',
        'study.settings.open': 'Настройки обучения',
        'study.editCard': 'Редактировать карточку',
        'study.transcription': 'Транскрипция слова',
        'study.transcription.kana': 'Хирагана',
        'study.transcription.romaji': 'Ромадзи',
        'study.transcription.both': 'Обе',
        'study.transcription.none': 'Скрыть',
        'study.sentenceRomaji': 'Ромадзи предложения',
        'study.autoplayClip': 'Автозапуск клипа',

        'clip.length': 'Длина аудио',
        'clip.start': 'Начало',
        'clip.end': 'Конец',
        'clip.earlier.title': 'Раньше на 1 секунду',
        'clip.later.title': 'Позже на 1 секунду',
        'clip.reset': 'Сброс',
        'clip.reset.title': 'Вернуть исходную длину',
        'clip.saved': 'Длина сохранена',
        'clip.edit.title': 'Видео-фрагмент',
        'clip.loading': 'Видео загружается…',
        'clip.preparing': 'Видео готовится…',
        'clip.unavailable': 'Видео недоступно',
        'clip.soon': 'Видео пока нет',

        'subs.autoSynced': 'Субтитры синхронизированы автоматически',
        'settings.autoSync': 'Автосинхронизация субтитров',
    },

    // uk/en живут в js/i18n/{uk,en}.js и грузятся лениво только для
    // выбранного языка (см. инлайн-загрузчик в <head> страниц).
    get uk() { return window.I18N_UK; },
    get en() { return window.I18N_EN; },
};

const LANG_KEY = 'animei:lang';

// Формы слова «серия» для правильного согласования с числом.
// ru/uk: [1 серия, 2–4 серии, 5+ серий]; en: [1 episode, N episodes].
const EPISODE_FORMS = {
    ru: ['серия', 'серии', 'серий'],
    uk: ['серія', 'серії', 'серій'],
    en: ['episode', 'episodes', 'episodes'],
};

function pluralIndex(n, lang) {
    if (lang === 'en') return n === 1 ? 0 : 1;
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 0;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
    return 2;
}

// «12 серий», «2 серии», «1 серия» — с правильным окончанием под число.
function tEpisodes(n) {
    const lang = getLang();
    const forms = EPISODE_FORMS[lang] || EPISODE_FORMS.ru;
    return n + ' ' + forms[pluralIndex(n, lang)];
}

// «5 дней подряд» — серия занятий без пропусков.
const STREAK_FORMS = {
    ru: ['день подряд', 'дня подряд', 'дней подряд'],
    uk: ['день поспіль', 'дні поспіль', 'днів поспіль'],
    en: ['day streak', 'day streak', 'day streak'],
};

function tStreak(n) {
    const lang = getLang();
    const forms = STREAK_FORMS[lang] || STREAK_FORMS.ru;
    return n + ' ' + forms[pluralIndex(n, lang)];
}

// Язык браузера/системы, если пользователь ещё не выбирал вручную.
// Поддерживаем ru / uk / en; всё остальное — русский по умолчанию.
function detectLang() {
    // Сначала язык самого браузера (navigator.language), затем остальной список.
    const prefs = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
    for (const raw of prefs) {
        const code = String(raw).toLowerCase().split('-')[0];
        if (I18N[code]) return code;
    }
    return 'ru';
}

function getLang() {
    const saved = localStorage.getItem(LANG_KEY);
    // Явный выбор пользователя важнее системного языка.
    return I18N[saved] ? saved : detectLang();
}

function t(key) {
    return I18N[getLang()][key] ?? I18N.ru[key] ?? key;
}

// Название тайтла по локали: для RU — русское (Shikimori.russian), для остальных
// (uk/en) — ромадзи (Shikimori.name), т.к. украинских/английских названий у нас
// нет, а ромадзи — международный стандарт (лучше, чем показывать русское).
function animeTitle(a) {
    if (!a) return '';
    return getLang() === 'ru' ? (a.russian || a.name || '') : (a.name || a.russian || '');
}

// Язык перевода субтитров и фраз следует за языком интерфейса
function subsLang() {
    const lang = getLang();
    return ['uk', 'en'].includes(lang) ? lang : 'ru';
}

function applyI18n() {
    document.documentElement.lang = getLang();

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        el.title = t(el.dataset.i18nTitle);
    });
}

// Переключатель языка в шапке (вставляется на каждой странице)
function mountLangSwitcher() {
    const right = document.querySelector('.header__right');
    if (!right) return;

    const select = document.createElement('select');
    select.className = 'lang-select';
    for (const [code, label] of [['ru', 'RU'], ['uk', 'UA'], ['en', 'EN']]) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = label;
        select.appendChild(opt);
    }
    select.value = getLang();
    select.addEventListener('change', () => {
        localStorage.setItem(LANG_KEY, select.value);
        // Проще перезагрузить: динамические тексты тоже подтянутся на новом языке
        window.location.reload();
    });

    right.insertBefore(select, right.firstChild);
}

// Ссылка «На сайт» — со страниц приложения обратно на лендинг (в меню-сайдбар)
function mountSiteLink() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.querySelector('.sidebar__site')) return;
    const a = document.createElement('a');
    a.href = '/';
    a.className = 'sidebar__site';
    a.setAttribute('data-i18n', 'nav.site');
    a.textContent = t('nav.site');
    sidebar.appendChild(a);
}

document.addEventListener('DOMContentLoaded', () => {
    mountLangSwitcher();
    mountSiteLink();
    applyI18n();
});
