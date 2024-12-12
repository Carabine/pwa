const domain = 'https://animei.space'
//const domain = 'http://localhost:3005'
const refreshTokenKey = 'animei:refreshToken'
const accessTokenKey = 'animei:accessToken'

let failedQueue = [];
let isRefreshing = false;

const processQueue = (error) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve();
        }
    });

    failedQueue = [];
};

function createAxiosClient({
       options,
       getCurrentAccessToken,
       getCurrentRefreshToken,
       refreshTokenUrl,
       logout,
       setRefreshedTokens,
   }) {
    const client = axios.create(options);

    client.interceptors.request.use(async (config) => {
        if (config.authorization !== false) {
            const token = await getCurrentAccessToken();
            if (token) {
                config.headers.Authorization = "Bearer " + token;
            }
        }
        return config;
    }, (error) => {
        return Promise.reject(error);
    });

    client.interceptors.response.use((response) => {
        return response;
    }, async (error) => {
        console.log(error)

        if(error.response?.status !== 401 && error.response?.status < 400) {
            showSnackbar(error?.response?.data?.message ?? 'Unexpected Error: An unexpected error occurred. Please refresh the page or contact support', {
                duration: 4000,
                type: 'error'
            });
        }

        const originalRequest = error.config;

        if (!originalRequest) {
            return Promise.reject(error);
        }
        // In "axios": "^1.1.3" there is an issue with headers, and this is the workaround.
        originalRequest.headers = JSON.parse(JSON.stringify(originalRequest.headers || {}));
        const refreshToken = await getCurrentRefreshToken();

        // If error, process all the requests in the queue and logout the user.
        const handleError = (error) => {
            processQueue(error);
            logout();
            return Promise.reject(error);
        };

        // Refresh token conditions
        if (refreshToken && error.response?.status === 401 && error.response.data.message === "TokenExpiredError" && originalRequest?.url !== refreshTokenUrl && originalRequest?._retry !== true) {

            if (isRefreshing) {
                return new Promise(function (resolve, reject) {
                    failedQueue.push({resolve, reject});
                })
                    .then(() => {
                        return client(originalRequest);
                    })
                    .catch((err) => {
                        return Promise.reject(err);
                    });
            }
            isRefreshing = true;
            originalRequest._retry = true;
            return client
                .post(refreshTokenUrl, {
                    refreshToken: refreshToken,
                })
                .then((res) => {
                    const tokens = {
                        accessToken: res.data?.accessToken, refreshToken: res.data?.refreshToken,
                    };
                    setRefreshedTokens(tokens);
                    processQueue(null);

                    return client(originalRequest);
                }, handleError)
                .finally(() => {
                    isRefreshing = false;
                });
        }

        // Refresh token missing or expired => logout user...
        if (error.response?.status === 401 && error.response?.data?.message === "TokenExpiredError") {
            return handleError(error);
        }

        // Any status codes that falls outside the range of 2xx cause this function to trigger
        // Do something with response error
        return Promise.reject(error);
    });

    return client;
}


const REFRESH_TOKEN_URL = `${domain}/api/v1/auth/refreshToken`
const BASE_URL = `${domain}api/v1/`

function storageRemove(key) {
    localStorage.removeItem(key)
}

function storageSet(key, value) {
    console.log(key, value)
    localStorage.setItem(key, value)
}

function storageGet(key) {
    return localStorage.getItem(key)
}

function getCurrentAccessToken() {
    console.log("gf", storageGet(accessTokenKey), accessTokenKey)
    return storageGet(accessTokenKey)
}

function getCurrentRefreshToken() {
    return storageGet(refreshTokenKey)
}

function setRefreshedTokens(tokens){
    storageSet(refreshTokenKey, tokens.refreshToken)
    storageSet(accessTokenKey, tokens.accessToken)
}

async function logout(){
    console.log("LOG")
    storageRemove(refreshTokenKey)
    storageRemove(accessTokenKey)
}

async function requestWithRetry(request, retriesCount, validate = () => true) {
    return new Promise(async (resolve, reject) => {
        let retries = 0

        const retryFunc = async () => {
            retries++

            try {
                const response = await request()
                if(!validate(response.data)) throw new Error("valition failed")
                resolve(response)
            } catch(err){
                console.log(err.code)
                if(retries > retriesCount) {
                    reject(err)
                    return
                }
                console.log("RETRY")
                await sleep(1000)
                retryFunc()
            }
        }
        retryFunc()
    })

}

const client = createAxiosClient({
    options: {
        baseURL: BASE_URL,
        timeout: 300000,
        headers: {
            'Content-Type': 'application/json',
        }
    },
    getCurrentAccessToken,
    getCurrentRefreshToken,
    refreshTokenUrl: REFRESH_TOKEN_URL,
    logout,
    setRefreshedTokens
})

const checkAuth = async () => {
    const accessToken = getCurrentAccessToken()
    console.log("AT", accessToken, window.location.href)
    console.log(localStorage)
    if (accessToken) {
        if(window.location.href.includes('register.html') || window.location.href.includes('login.html')) {
            window.location.href = 'index.html';
        }
    } else {
        if(!window.location.href.includes('register.html') && !window.location.href.includes('login.html')) {
            window.location.href = 'login.html';
        }
    }
}