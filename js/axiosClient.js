const domain = 'https://animei.space';
// const domain = 'http://localhost:3005';
const refreshTokenKey = 'animei:refreshToken';
const accessTokenKey = 'animei:accessToken';

let failedQueue = [];
let isRefreshing = false;

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

function createAxiosClient({ options, getCurrentAccessToken, getCurrentRefreshToken, refreshTokenUrl, logout, setRefreshedTokens }) {
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
            if (error.response?.status !== 401 && error.response?.status < 400) {
                showSnackbar(error?.response?.data?.message ?? 'An unexpected error occurred', {
                    duration: 4000,
                    type: 'error'
                });
            }

            const originalRequest = error.config;
            if (!originalRequest) return Promise.reject(error);

            originalRequest.headers = JSON.parse(JSON.stringify(originalRequest.headers || {}));
            const refreshToken = await getCurrentRefreshToken();

            const handleError = (error) => {
                processQueue(error);
                logout();
                return Promise.reject(error);
            };

            if (
                refreshToken &&
                error.response?.status === 401 &&
                error.response.data.message === 'TokenExpiredError' &&
                originalRequest?.url !== refreshTokenUrl &&
                originalRequest?._retry !== true
            ) {
                if (isRefreshing) {
                    return new Promise((resolve, reject) => {
                        failedQueue.push({ resolve, reject });
                    }).then(() => client(originalRequest))
                      .catch((err) => Promise.reject(err));
                }

                isRefreshing = true;
                originalRequest._retry = true;

                return client
                    .post(refreshTokenUrl, { refreshToken })
                    .then((res) => {
                        setRefreshedTokens({
                            accessToken: res.data?.accessToken,
                            refreshToken: res.data?.refreshToken
                        });
                        processQueue(null);
                        return client(originalRequest);
                    }, handleError)
                    .finally(() => { isRefreshing = false; });
            }

            if (error.response?.status === 401 && error.response?.data?.message === 'TokenExpiredError') {
                return handleError(error);
            }

            return Promise.reject(error);
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
    logout,
    setRefreshedTokens
});

// ========== Auth Check ==========

function checkAuth() {
    const accessToken = getCurrentAccessToken();
    const isInPages = window.location.pathname.includes('/pages/');
    const homeUrl = isInPages ? '../index.html' : './index.html';
    const loginUrl = isInPages ? './login.html' : './pages/login.html';
    if (true) {
        if (window.location.href.includes('login.html')) {
            window.location.href = homeUrl;
        }
    } else {
        if (!window.location.href.includes('login.html')) {
            window.location.href = loginUrl;
        }
    }
}
