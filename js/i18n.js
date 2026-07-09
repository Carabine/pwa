// Локализация интерфейса: русский, украинский, английский.
// Статичные тексты помечаются data-i18n="ключ", динамические берутся через t('ключ').

const I18N = {
    ru: {
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
        'nav.catalog': 'Каталог',
        'nav.watch': 'Своё видео',
        'nav.dictionary': 'Словарь',
        'nav.feedback': 'Обратная связь',
        'nav.site': '← На сайт Animei',
        'nav.logout': 'Выйти',
        'nav.login': 'Войти',

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
        'catalog.hint': 'Введи название — и смотри с японскими субтитрами через пару секунд',
        'catalog.searching': 'Ищем…',
        'catalog.empty': 'Ничего не нашли — попробуй другое написание',
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
        'player.noHls': 'Браузер не поддерживает HLS',
        'player.movie': 'Фильм',
        'player.jpAudio': 'япон. озвучка',
        'player.episode': 'серия',
        'controls.translation': 'Дорожка',
        'controls.episode': 'Серия',
        'controls.offset': 'Сдвиг сабов',
        'controls.mode': 'Режим',
        'controls.now': 'Сейчас!',
        'controls.now.title': 'Считать, что текущая реплика должна звучать прямо сейчас',
        'controls.autopause': '⏸ Авто-пауза',
        'controls.autopause.title': 'Пауза после каждой реплики (S)',
        'controls.ru.title': 'Показывать перевод в списке субтитров',
        'hotkeys.space': 'пауза',
        'hotkeys.a': 'повторить реплику',
        'hotkeys.s': 'авто-пауза',
        'hotkeys.d': 'следующая',
        'hotkeys.f': 'весь экран',
        'hotkeys.click': 'клик по слову',
        'hotkeys.dict': 'словарь',
        'ui.play.title': 'Играть/пауза (Space)',
        'ui.mute.title': 'Звук (M)',
        'ui.speed.title': 'Скорость воспроизведения',
        'ui.fs.title': 'Во весь экран (F)',
        'transcript.title': 'Субтитры',
        'subs.searching': 'Ищем японские субтитры…',
        'subs.notFound': 'Для этого тайтла нет японских сабов в архиве 😔 Видео можно смотреть без них',
        'subs.error': 'Не удалось загрузить субтитры',
        'subs.synced': 'Сабы подогнаны под текущий момент',
        'subs.wrong': 'Не те?',
        'subs.wrong.title': 'Субтитры не от этой серии? Выбрать файл вручную',
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
        'popup.save': '+ В коллекцию',
        'popup.saving': 'Сохраняем…',
        'popup.saved': '✓ Сохранено',
        'popup.savedSnack': 'Слово в коллекции — появится в карточках',
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
        'controls.furigana.title': 'Показывать чтения над иероглифами',
        'controls.romaji.title': 'Показывать транскрипцию латиницей (ромадзи) — если пока не читаешь хирагану',
        'controls.season': 'Сезон',
        'controls.special': 'Спешл',
        'controls.settings': 'Настройки видео',
        'words.explain': 'ИИ-разбор предложения',
        'words.explaining': 'Готовим разбор…',
        'words.explainError': 'Не удалось получить разбор — попробуй позже',
        'player.syncHint': 'Сабы не совпадают с речью? Дождись начала реплики и нажми «Сейчас!»',
        'controls.earlier.title': 'Показывать сабы на полсекунды раньше',
        'controls.later.title': 'Показывать сабы на полсекунды позже',
        'controls.reset.title': 'Убрать сдвиг',
        'subs.notFoundLink': 'Загрузить своё видео с сабами',

        'study.title': 'Учёба',
        'study.back': '← Назад',
        'study.showAnswer': 'Показать ответ',
        'study.again': 'Забыл',
        'study.good': 'Помню',
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

        'words.title': 'Словарь',
        'words.loading': 'Загрузка…',
        'words.empty': 'В коллекции пока нет слов. Кликай по словам в субтитрах во время просмотра — они появятся здесь.',
        'words.openCatalog': 'Открыть каталог',
        'words.filter': 'Поиск по слову или переводу…',
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
        'words.export': 'Скачать слова',
        'words.export.title': 'Файл подходит для Anki и как резервная копия',
        'words.import': 'Загрузить из файла',
        'words.imported': 'Добавлено слов:',
        'words.importNothing': 'Новых слов в файле не нашлось',
        'words.importError': 'Не удалось прочитать файл',

        'feedback.title': 'Обратная связь',
        'feedback.text': 'Помоги сделать изучение японского ещё лучше — поделись мыслями, идеями или проблемами.',
        'feedback.telegram': 'Напиши нам в Telegram:',
        'feedback.thanks': 'Спасибо, что помогаешь!',
    },

    uk: {
        'hub.study': 'Навчання',
        'hub.study.sub': 'Щоденне інтервальне повторення',
        'hub.custom': 'Повторити все',
        'hub.custom.sub': 'Усі слова без розкладу',
        'hub.beginner': 'Для початківців',
        'hub.beginner.sub': 'Готова колода: 50 простих слів із відомих аніме',
        'hub.catalog': 'Каталог аніме',
        'hub.catalog.sub': 'Дивись аніме й клікай по словах — вивчай їх у картках',
        'hub.catalog.badge': 'словник',
        'hub.watch': 'Своє відео',
        'hub.watch.sub': 'Завантаж файл або посилання',
        'nav.home': 'Головна',
        'nav.catalog': 'Каталог',
        'nav.watch': 'Своє відео',
        'nav.dictionary': 'Словник',
        'nav.feedback': 'Зворотний зв’язок',
        'nav.site': '← На сайт Animei',
        'nav.logout': 'Вийти',
        'nav.login': 'Увійти',

        'auth.loginTitle': 'З поверненням',
        'auth.loginSubtitle': 'Увійди, щоб слова синхронізувалися між пристроями',
        'auth.registerTitle': 'Створити акаунт',
        'auth.registerSubtitle': 'Акаунт потрібен, щоб твої слова зберігалися й не губилися',
        'auth.email': 'Пошта',
        'auth.password': 'Пароль',
        'auth.signIn': 'Увійти',
        'auth.signUp': 'Створити акаунт',
        'auth.toRegister': 'Немає акаунта? Створити',
        'auth.toLogin': 'Уже є акаунт? Увійти',
        'auth.optional': 'Вхід не обов’язковий — вчитися можна й без акаунта',
        'auth.back': '← До застосунку',
        'auth.needFields': 'Введи пошту й пароль',
        'auth.success': 'Готово, ти увійшов',
        'auth.error': 'Не вдалося — перевір пошту й пароль',

        'catalog.title': 'Каталог',
        'catalog.placeholder': 'Назва аніме — наприклад, Фрірен або Naruto',
        'catalog.hint': 'Введи назву — і вже за кілька секунд дивись із японськими субтитрами',
        'catalog.searching': 'Шукаємо…',
        'catalog.empty': 'Нічого не знайшли — спробуй інше написання',
        'catalog.error': 'Помилка пошуку — перевір, чи запущений сервер',
        'catalog.popular': 'Популярне',
        'catalog.hint': 'Відкрий будь-яке аніме й клікай по словах у субтитрах — вони потраплять у твій словник і в картки для вивчення.',
        'kind.tv': 'Серіал', 'kind.movie': 'Фільм', 'kind.ova': 'OVA', 'kind.ona': 'ONA', 'kind.special': 'Спешл',
        'catalog.ep': 'еп.',

        'player.loading': 'Завантаження…',
        'player.videoLoading': 'Завантажуємо відео…',
        'player.noTitle': 'Тайтл не обрано — повернись до каталогу',
        'player.noPlayers': 'Для цього тайтла не знайшлося жодного плеєра',
        'player.notFound': 'Цього тайтла немає у відеобазі',
        'player.episodesError': 'Помилка завантаження серій',
        'player.streamError': 'Не вдалося завантажити цю серію',
        'player.videoError': 'Помилка відео: ',
        'player.noHls': 'Браузер не підтримує HLS',
        'player.movie': 'Фільм',
        'player.jpAudio': 'япон. озвучка',
        'player.episode': 'серія',
        'controls.translation': 'Доріжка',
        'controls.episode': 'Серія',
        'controls.offset': 'Зсув сабів',
        'controls.mode': 'Режим',
        'controls.now': 'Зараз!',
        'controls.now.title': 'Вважати, що поточна репліка має звучати саме зараз',
        'controls.autopause': '⏸ Авто-пауза',
        'controls.autopause.title': 'Пауза після кожної репліки (S)',
        'controls.ru.title': 'Показувати переклад у списку субтитрів',
        'hotkeys.space': 'пауза',
        'hotkeys.a': 'повторити репліку',
        'hotkeys.s': 'авто-пауза',
        'hotkeys.d': 'наступна',
        'hotkeys.f': 'на весь екран',
        'hotkeys.click': 'клік по слову',
        'hotkeys.dict': 'словник',
        'ui.play.title': 'Грати/пауза (Space)',
        'ui.mute.title': 'Звук (M)',
        'ui.speed.title': 'Швидкість відтворення',
        'ui.fs.title': 'На весь екран (F)',
        'transcript.title': 'Субтитри',
        'subs.searching': 'Шукаємо японські субтитри…',
        'subs.notFound': 'В архіві немає японських сабів для цього тайтла 😔 Відео можна дивитися й без них',
        'subs.error': 'Не вдалося завантажити субтитри',
        'subs.synced': 'Саби підігнано під поточний момент',
        'subs.wrong': 'Не ті?',
        'subs.wrong.title': 'Субтитри не від цієї серії? Вибрати файл вручну',
        'subs.backToCurrent': 'До поточної',
        'subs.backToCurrent.title': 'Повернутися до поточної репліки',
        'subs.pickManually': 'Вибрати субтитри вручну',
        'subs.picker.title': 'Вибрати субтитри вручну',
        'subs.picker.search': 'Назва аніме латиницею',
        'subs.picker.filterFiles': 'Фільтр файлів (напр. S01E01 або - 01)',
        'subs.picker.hint': 'Введіть назву аніме латиницею',
        'subs.picker.searching': 'Шукаємо в архіві…',
        'subs.picker.nothing': 'Нічого не знайшли — спробуйте іншу назву',
        'subs.picker.error': 'Архів субтитрів не відповідає',
        'subs.picker.loadingFiles': 'Завантажуємо список серій…',
        'subs.picker.noFiles': 'У цьому тайтлі немає файлів субтитрів',
        'subs.picker.chosen': 'Субтитри вибрані',
        'popup.searching': 'Шукаємо у словнику…',
        'popup.notFound': 'У словнику такого немає — але можна зберегти як є',
        'popup.noResponse': 'Словник не відповідає',
        'popup.save': '+ До колекції',
        'popup.saving': 'Зберігаємо…',
        'popup.saved': '✓ Збережено',
        'popup.savedSnack': 'Слово в колекції — з’явиться у картках',
        'popup.saveError': 'Не вдалося зберегти — увійди в акаунт',
        'popup.loginNeeded': 'Увійди в акаунт, щоб зберігати слова',
        'popup.common': 'уживане слово',
        'popup.retry': 'Повторити',
        'popup.explain': 'Розібрати речення',
        'popup.explaining': 'Готуємо розбір…',
        'popup.explainLimited': 'Сервіс перевантажено — спробуй за хвилину',
        'popup.explainError': 'Не вдалося отримати розбір — перевір з’єднання',
        'explain.translation': 'Переклад',
        'explain.parts': 'По частинах',
        'explain.grammar': 'Граматика',
        'controls.furigana.title': 'Показувати читання над ієрогліфами',
        'controls.romaji.title': 'Показувати транскрипцію латиницею (ромадзі) — якщо ще не читаєш хірагану',
        'controls.season': 'Сезон',
        'controls.special': 'Спешл',
        'controls.settings': 'Налаштування відео',
        'words.explain': 'ШІ-розбір речення',
        'words.explaining': 'Готуємо розбір…',
        'words.explainError': 'Не вдалося отримати розбір — спробуй пізніше',
        'player.syncHint': 'Саби не збігаються з мовленням? Дочекайся початку репліки й натисни «Зараз!»',
        'controls.earlier.title': 'Показувати саби на півсекунди раніше',
        'controls.later.title': 'Показувати саби на півсекунди пізніше',
        'controls.reset.title': 'Прибрати зсув',
        'subs.notFoundLink': 'Завантажити своє відео із сабами',

        'study.title': 'Навчання',
        'study.back': '← Назад',
        'study.showAnswer': 'Показати відповідь',
        'study.again': 'Забув',
        'study.good': 'Пам’ятаю',
        'study.new': 'Нові',
        'study.learning': 'Вчу',
        'study.review': 'Повторити',
        'study.remaining': 'Залишилося',
        'study.doneCount': 'Пройдено',
        'study.restart': 'Почати заново',
        'study.allDone': 'На сьогодні все',
        'study.nothingDue': 'Зараз повторювати нічого — зазирни пізніше',
        'study.noWords': 'У колекції поки немає слів. Додавай їх під час перегляду аніме — кліком по слову в субтитрах.',
        'study.reviewed': 'Карток пройдено:',
        'study.tomorrow': 'Завтра чекає:',
        'study.close': 'Закрити',
        'study.listen': 'Озвучити',

        'starter.offer.title': 'Почни з готової колоди',
        'starter.offer.text': 'Карток поки немає. Додай 15 простих слів із відомих аніме й починай вчитися просто зараз — свої слова збереш пізніше під час перегляду.',
        'starter.add': 'Додати 15 слів',
        'starter.open': 'Колода для початківців',
        'starter.added': 'Додано слів:',
        'starter.addOne': '+ До колекції',
        'starter.addedOne': '✓ У колекції',
        'starter.addAll': 'Додати всю колоду до колекції',
        'starter.fromAnime': 'З аніме:',

        'home.due': 'до повторення',
        'home.new': 'нових',
        'home.today': 'Сьогодні:',
        'home.allClear': 'На сьогодні все повторено ✓',
        'home.streak': '🔥 ',

        'words.title': 'Словник',
        'words.loading': 'Завантаження…',
        'words.empty': 'У колекції поки немає слів. Клікай по словах у субтитрах під час перегляду — вони з’являться тут.',
        'words.openCatalog': 'Відкрити каталог',
        'words.filter': 'Пошук за словом або перекладом…',
        'words.nothingFound': 'Нічого не знайшлося',
        'words.clip': 'Є відеофрагмент',
        'words.edit': 'Змінити',
        'words.cancel': 'Скасувати',
        'words.save': 'Зберегти',
        'words.savedSnack': 'Збережено',
        'words.delete.title': 'Видалити слово',
        'words.word': 'Слово',
        'words.reading': 'Читання',
        'words.meaning': 'Значення',
        'words.sentence': 'Речення',
        'words.sentenceTranslation': 'Переклад речення',
        'words.hint': 'Підказка',
        'words.export': 'Завантажити слова',
        'words.export.title': 'Файл підходить для Anki і як резервна копія',
        'words.import': 'Завантажити з файлу',
        'words.imported': 'Додано слів:',
        'words.importNothing': 'Нових слів у файлі не знайшлося',
        'words.importError': 'Не вдалося прочитати файл',

        'feedback.title': 'Зворотний зв’язок',
        'feedback.text': 'Допоможи зробити вивчення японської ще кращим — поділись думками, ідеями чи проблемами.',
        'feedback.telegram': 'Напиши нам у Telegram:',
        'feedback.thanks': 'Дякуємо, що допомагаєш!',
    },

    en: {
        'hub.study': 'Study',
        'hub.study.sub': 'Daily spaced repetition',
        'hub.custom': 'Free review',
        'hub.custom.sub': 'Go through all your words',
        'hub.beginner': 'For beginners',
        'hub.beginner.sub': 'A ready-made deck: 50 simple words from popular anime',
        'hub.catalog': 'Anime catalog',
        'hub.catalog.sub': 'Watch anime and tap words — study them as cards',
        'hub.catalog.badge': 'vocab',
        'hub.watch': 'Your video',
        'hub.watch.sub': 'Upload a file or a link',
        'nav.home': 'Home',
        'nav.catalog': 'Catalog',
        'nav.watch': 'Your video',
        'nav.dictionary': 'Dictionary',
        'nav.feedback': 'Feedback',
        'nav.site': '← Animei website',
        'nav.logout': 'Log out',
        'nav.login': 'Log in',

        'auth.loginTitle': 'Welcome back',
        'auth.loginSubtitle': 'Sign in to sync your words across devices',
        'auth.registerTitle': 'Create an account',
        'auth.registerSubtitle': 'An account keeps your words saved and synced',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.signIn': 'Sign in',
        'auth.signUp': 'Create account',
        'auth.toRegister': 'No account? Create one',
        'auth.toLogin': 'Already have an account? Sign in',
        'auth.optional': 'Signing in is optional — you can learn without an account',
        'auth.back': '← Back to the app',
        'auth.needFields': 'Enter your email and password',
        'auth.success': "You're signed in",
        'auth.error': 'Something went wrong — check your email and password',

        'catalog.title': 'Catalog',
        'catalog.placeholder': 'Anime title — e.g. Frieren or Naruto',
        'catalog.hint': 'Type a title — and watch with Japanese subtitles in seconds',
        'catalog.searching': 'Searching…',
        'catalog.empty': 'Nothing found — try a different spelling',
        'catalog.error': 'Search error — is the server running?',
        'catalog.popular': 'Popular',
        'catalog.hint': 'Open any anime and tap the words in the subtitles — they go straight into your dictionary and study cards.',
        'kind.tv': 'TV', 'kind.movie': 'Movie', 'kind.ova': 'OVA', 'kind.ona': 'ONA', 'kind.special': 'Special',
        'catalog.ep': 'ep.',

        'player.loading': 'Loading…',
        'player.videoLoading': 'Loading video…',
        'player.noTitle': 'No title passed — go back to the catalog',
        'player.noPlayers': 'No players found for this title',
        'player.notFound': 'Title not found in the video database',
        'player.episodesError': 'Failed to load episodes',
        'player.streamError': 'Failed to get video for this episode',
        'player.videoError': 'Video error: ',
        'player.noHls': 'Your browser does not support HLS',
        'player.movie': 'Movie',
        'player.jpAudio': 'JP audio',
        'player.episode': 'ep.',
        'controls.translation': 'Audio track',
        'controls.episode': 'Episode',
        'controls.offset': 'Subs offset',
        'controls.mode': 'Mode',
        'controls.now': 'Now!',
        'controls.now.title': 'Assume the current line should be playing right now',
        'controls.autopause': '⏸ Auto-pause',
        'controls.autopause.title': 'Pause after every line (S)',
        'controls.ru.title': 'Show translation in the subtitle list',
        'hotkeys.space': 'pause',
        'hotkeys.a': 'replay line',
        'hotkeys.s': 'auto-pause',
        'hotkeys.d': 'next line',
        'hotkeys.f': 'fullscreen',
        'hotkeys.click': 'click a word',
        'hotkeys.dict': 'dictionary',
        'ui.play.title': 'Play/pause (Space)',
        'ui.mute.title': 'Sound (M)',
        'ui.speed.title': 'Playback speed',
        'ui.fs.title': 'Fullscreen (F)',
        'transcript.title': 'Subtitles',
        'subs.searching': 'Looking for Japanese subtitles…',
        'subs.notFound': 'No Japanese subs for this title in the archive 😔 You can still watch without them',
        'subs.error': 'Failed to load subtitles',
        'subs.synced': 'Subs synced to the current moment',
        'subs.wrong': 'Wrong ones?',
        'subs.wrong.title': 'Subtitles from a different episode? Pick a file manually',
        'subs.backToCurrent': 'To current',
        'subs.backToCurrent.title': 'Jump back to the current line',
        'subs.pickManually': 'Pick subtitles manually',
        'subs.picker.title': 'Pick subtitles manually',
        'subs.picker.search': 'Anime title in Latin letters',
        'subs.picker.filterFiles': 'Filter files (e.g. S01E01 or - 01)',
        'subs.picker.hint': 'Type an anime title in Latin letters',
        'subs.picker.searching': 'Searching the archive…',
        'subs.picker.nothing': 'Nothing found — try another title',
        'subs.picker.error': 'The subtitle archive is not responding',
        'subs.picker.loadingFiles': 'Loading the episode list…',
        'subs.picker.noFiles': 'No subtitle files in this title',
        'subs.picker.chosen': 'Subtitles selected',
        'popup.searching': 'Looking it up…',
        'popup.notFound': 'Not in the dictionary — you can still save it as is',
        'popup.noResponse': 'Dictionary is not responding',
        'popup.save': '+ Add to collection',
        'popup.saving': 'Saving…',
        'popup.saved': '✓ Saved',
        'popup.savedSnack': 'Word added — it will show up in your flashcards',
        'popup.saveError': 'Could not save — log in to your account',
        'popup.loginNeeded': 'Log in to save words',
        'popup.common': 'common',
        'popup.retry': 'Retry',
        'popup.explain': 'Explain this sentence',
        'popup.explaining': 'Preparing the breakdown…',
        'popup.explainLimited': 'The service is overloaded — try again in a minute',
        'popup.explainError': 'Could not get the breakdown — check your connection',
        'explain.translation': 'Translation',
        'explain.parts': 'Piece by piece',
        'explain.grammar': 'Grammar',
        'controls.furigana.title': 'Show readings above kanji',
        'controls.romaji.title': 'Show a Latin (romaji) transcription — if you can’t read hiragana yet',
        'controls.season': 'Season',
        'controls.special': 'Special',
        'controls.settings': 'Video settings',
        'words.explain': 'AI sentence breakdown',
        'words.explaining': 'Analysing…',
        'words.explainError': 'Couldn’t get the breakdown — try again later',
        'player.syncHint': 'Subs out of sync? Wait for a line to start and press “Now!”',
        'controls.earlier.title': 'Show subs half a second earlier',
        'controls.later.title': 'Show subs half a second later',
        'controls.reset.title': 'Reset the offset',
        'subs.notFoundLink': 'Upload your own video with subs',

        'study.title': 'Study',
        'study.back': '← Back',
        'study.showAnswer': 'Show answer',
        'study.again': 'Forgot',
        'study.good': 'Got it',
        'study.new': 'New',
        'study.learning': 'Learning',
        'study.review': 'Review',
        'study.remaining': 'Remaining',
        'study.doneCount': 'Done',
        'study.restart': 'Restart session',
        'study.allDone': 'All done for today',
        'study.nothingDue': 'Nothing to review right now — come back later',
        'study.noWords': 'Your collection is empty. Add words while watching anime — click a word in the subtitles.',
        'study.reviewed': 'Cards reviewed:',
        'study.tomorrow': 'Due tomorrow:',
        'study.close': 'Close',
        'study.listen': 'Listen',

        'starter.offer.title': 'Start with a ready-made deck',
        'starter.offer.text': "No cards yet. Add 15 simple words from popular anime and start learning right away — you'll collect your own words later while watching.",
        'starter.add': 'Add 15 words',
        'starter.open': 'Beginner deck',
        'starter.added': 'Words added:',
        'starter.addOne': '+ Add to collection',
        'starter.addedOne': '✓ In your collection',
        'starter.addAll': 'Add the whole deck to your collection',
        'starter.fromAnime': 'From the anime:',

        'home.due': 'to review',
        'home.new': 'new',
        'home.today': 'Today:',
        'home.allClear': 'All reviews done for today ✓',
        'home.streak': '🔥 ',

        'words.title': 'Dictionary',
        'words.loading': 'Loading…',
        'words.empty': 'Your collection is empty. Click words in the subtitles while watching — they will show up here.',
        'words.openCatalog': 'Open the catalog',
        'words.filter': 'Search by word or meaning…',
        'words.nothingFound': 'Nothing found',
        'words.clip': 'Has a video clip',
        'words.edit': 'Edit',
        'words.cancel': 'Cancel',
        'words.save': 'Save',
        'words.savedSnack': 'Saved',
        'words.delete.title': 'Delete word',
        'words.word': 'Word',
        'words.reading': 'Reading',
        'words.meaning': 'Meaning',
        'words.sentence': 'Sentence',
        'words.sentenceTranslation': 'Sentence translation',
        'words.hint': 'Hint',
        'words.export': 'Download words',
        'words.export.title': 'The file works for Anki and as a backup',
        'words.import': 'Load from file',
        'words.imported': 'Words added:',
        'words.importNothing': 'No new words found in the file',
        'words.importError': 'Could not read the file',

        'feedback.title': 'Feedback',
        'feedback.text': 'Help us make learning Japanese even better — share your thoughts, ideas or problems.',
        'feedback.telegram': 'Message us on Telegram:',
        'feedback.thanks': 'Thank you for helping!',
    },
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
