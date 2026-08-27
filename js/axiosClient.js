// Локально ходим на локальный бэкенд, на проде — на тот же хост,
// с которого открыта страница (nginx проксирует /api на бэкенд)
const domain = ['localhost', '127.0.0.1', ''].includes(window.location.hostname)
    ? 'http://localhost:3005'
    : window.location.origin;
const refreshTokenKey = 'animei:refreshToken';
const accessTokenKey = 'animei:accessToken';

let failedQueue = [];
let isRefreshing = false;
let lastSnackbar = { msg: '', at: 0 };

function processQueue(error) {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve();
        }
    });
    failedQueue = [];
}

function createAxiosClient({ options, getCurrentAccessToken, getCurrentRefreshToken, refreshTokenUrl, endSession, setRefreshedTokens }) {
    const client = axios.create(options);

    client.interceptors.request.use(
        async (config) => {
            if (config.authorization !== false) {
                const token = await getCurrentAccessToken();
                if (token) {
                    config.headers.Authorization = 'Bearer ' + token;
                }
            }
            return config;
        },
        (error) => Promise.reject(error)
    );

    client.interceptors.response.use(
        (response) => response,
        async (error) => {
            // Снекбар — для HTTP-ошибок кроме 401 (тот уходит в refresh-логику ниже).
            // Сетевые ошибки без ответа не показываем: офлайн-режим и фоновые
            // опросы иначе спамили бы. Повторы одного сообщения глушим на 5 с.
            // silentErrors: true в конфиге запроса — вообще без снекбара: для
            // фоновых best-effort запросов (прогрев словаря в авто-колоде) и мест
            // со своим UI ошибки (словарный попап с кнопкой «Повторить»).
            const status = error.response?.status;
            if (status && status !== 401 && !error.config?.silentErrors) {
                const msg = error?.response?.data?.message ?? 'An unexpected error occurred';
                const now = Date.now();
                if (msg !== lastSnackbar.msg || now - lastSnackbar.at > 5000) {
                    lastSnackbar = { msg, at: now };
                    showSnackbar(msg, { duration: 4000, type: 'error' });
                }
            }

            const originalRequest = error.config;
            if (!originalRequest) return Promise.reject(error);

            // Про сессию говорит только 401 с TokenExpiredError. Всё остальное
            // (503 от перезапуска бэкенда, 429 лимитера, обрыв сети) к токенам
            // отношения не имеет — молча отдаём ошибку вызывающему коду.
            const expired = error.response?.status === 401
                && error.response?.data?.message === 'TokenExpiredError';
            if (!expired || originalRequest.url === refreshTokenUrl) return Promise.reject(error);

            originalRequest.headers = JSON.parse(JSON.stringify(originalRequest.headers || {}));
            const refreshToken = await getCurrentRefreshToken();
            if (!refreshToken) {
                // Access есть, refresh нет — восстанавливать нечего.
                endSession();
                return Promise.reject(error);
            }

            // Счётчик попыток вместо флага: одна повторная попытка после обмена
            // токенов — норма, но зацикливаться нельзя.
            originalRequest._retry = (originalRequest._retry || 0) + 1;
            if (originalRequest._retry > 2) return Promise.reject(error);

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(() => client(originalRequest))
                  .catch((err) => Promise.reject(err));
            }

            isRefreshing = true;

            // Обмен не удался. Из аккаунта выкидываем ТОЛЬКО если сервер прямо
            // отказал в refresh-токене (401/403). Раньше сюда же попадали
            // сетевые сбои и 5xx на перезапуске бэкенда — и сессия умирала на
            // ровном месте.
            const onRefreshFailed = (err) => {
                // Пока мы ходили за парой, токен в хранилище сменился — значит
                // соседняя страница успела обновиться первой (при переходах в
                // приложении это обычное дело). Наш отказ не про сессию:
                // повторяем исходный запрос уже с новым токеном.
                if (getCurrentRefreshToken() !== refreshToken) {
                    processQueue(null);
                    return client(originalRequest);
                }
                processQueue(err);
                if ([401, 403].includes(err?.response?.status)) endSession();
                return Promise.reject(err);
            };

            return client
                .post(refreshTokenUrl, { refreshToken })
                .then((res) => {
                    // Пустой ответ не должен затирать рабочие токены строкой
                    // "undefined" — тогда следующий заход был бы уже мимо.
                    if (!res.data?.accessToken || !res.data?.refreshToken) {
                        return onRefreshFailed(new Error('Empty refresh response'));
                    }
                    setRefreshedTokens({
                        accessToken: res.data.accessToken,
                        refreshToken: res.data.refreshToken
                    });
                    processQueue(null);
                    return client(originalRequest);
                }, onRefreshFailed)
                .finally(() => { isRefreshing = false; });
        }
    );

    return client;
}

// ========== Storage ==========

function storageGet(key) { return localStorage.getItem(key); }
function storageSet(key, value) { localStorage.setItem(key, value); }
function storageRemove(key) { localStorage.removeItem(key); }

function getCurrentAccessToken() { return storageGet(accessTokenKey); }
function getCurrentRefreshToken() { return storageGet(refreshTokenKey); }

function setRefreshedTokens(tokens) {
    storageSet(refreshTokenKey, tokens.refreshToken);
    storageSet(accessTokenKey, tokens.accessToken);
}

function logout() {
    storageRemove(refreshTokenKey);
    storageRemove(accessTokenKey);
    storageRemove('animei:email');
    storageRemove('animei:isAdmin'); // чтобы у следующего юзера не мигала ссылка «Админка»
}

// Сессия оборвалась не по нажатию «Выйти», а потому что сервер отказал в
// обновлении токенов. Молчаливый выход выглядит как баг («меня опять
// разлогинило») — говорим об этом прямо и подсвечиваем шапку сразу, не дожидаясь
// перезагрузки страницы.
function endSession() {
    if (!getCurrentAccessToken() && !getCurrentRefreshToken()) return;   // уже вышли
    logout();
    if (typeof renderAuthState === 'function') renderAuthState();
    if (typeof showSnackbar === 'function' && typeof t === 'function') {
        showSnackbar(t('auth.sessionExpired'), { duration: 6000, type: 'error' });
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========== Client ==========

const REFRESH_TOKEN_URL = `${domain}/api/v1/auth/refreshToken`;
const BASE_URL = `${domain}/api/v1/`;

const client = createAxiosClient({
    options: {
        baseURL: BASE_URL,
        timeout: 300000,
        headers: { 'Content-Type': 'application/json' }
    },
    getCurrentAccessToken,
    getCurrentRefreshToken,
    refreshTokenUrl: REFRESH_TOKEN_URL,
    endSession,
    setRefreshedTokens
});

// ========== Auth Check ==========

// Вход в аккаунт опциональный: приложение работает и без него.
// Единственное, что делаем, — уводим уже вошедшего пользователя со страницы
// входа на главную. Никого никуда насильно не редиректим.
function checkAuth() {
    const accessToken = getCurrentAccessToken();
    const isInPages = window.location.pathname.includes('/pages/');
    const homeUrl = isInPages ? '../index.html' : './index.html';
    if (accessToken && window.location.href.includes('login.html')) {
        window.location.href = homeUrl;
    }
}

function isLoggedIn() {
    return !!getCurrentAccessToken();
}
