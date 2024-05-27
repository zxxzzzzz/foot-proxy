"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStatic = exports.handleGetMatchById = exports.handleDeletePut = exports.handleOtherApi = exports.handleSetting = exports.handleGetMe = exports.handleLogout = exports.handleLogin = void 0;
const ali_oss_1 = __importDefault(require("ali-oss"));
const url_1 = require("url");
const cookie_1 = require("./cookie");
const client = new ali_oss_1.default({
    region: 'oss-cn-hangzhou',
    accessKeyId: 'LTAI5tNpSy9xc' + 'TEcAK7M7Uxu',
    accessKeySecret: 'xJw1QUVCmOs' + 'DT5ZHqJgMssUZTtalqo',
    bucket: 'footballc',
    internal: true,
});
const OSS_FILE_NAME = 'sync-test.json';
function uniqBy(itemList, cb) {
    const idList = [];
    const reItemList = [];
    for (const item of itemList) {
        const id = cb(item);
        if (!idList.includes(id)) {
            reItemList.push({ ...item });
            idList.push(id);
        }
    }
    return reItemList;
}
function groupBy(itemList, cb) {
    return itemList.reduce((re, cur) => {
        const key = cb(cur);
        re[key] = [].concat(re[key] || [], cur);
        return re;
    }, {});
}
const getOssData = async () => {
    let ossRes = void 0;
    try {
        ossRes = await client.get(OSS_FILE_NAME);
    }
    catch (error) {
        return {
            accountList: [],
            globalCookie: {
                session_id: '',
            },
            responseList: [],
        };
    }
    const syncData = JSON.parse(ossRes?.content ||
        `{
          "accountList": [],
          "globalCookie":{"session_id":""},
          "responseList": [],
      }`);
    return syncData;
};
const updateOssData = async (data) => {
    const ossData = await getOssData();
    const accountList = data.accountList || ossData.accountList;
    const responseList = data.responseList || ossData.responseList || [];
    const globalCookie = data.globalCookie || ossData.globalCookie || { session_id: '' };
    try {
        const putData = { accountList, responseList, globalCookie };
        await client.put(OSS_FILE_NAME, Buffer.from(JSON.stringify(putData)));
    }
    catch (error) {
        console.log('put error', error);
    }
};
const updateOssResponseList = async (res, account, maxAge, payload) => {
    if (res.status !== 200)
        return;
    const ossData = await getOssData();
    const headers = {};
    res.headers.forEach((v, k) => {
        headers[k] = v;
    });
    const body = await res.text();
    res.text = () => Promise.resolve(body);
    const parsedUrl = new url_1.URL('', res.url);
    const response = {
        body,
        headers,
        url: parsedUrl.origin + parsedUrl.pathname,
        matchedAccount: account || '*',
        timestamp: new Date().valueOf(),
        maxAge,
        payload,
    };
    const groupedObj = groupBy([...ossData.responseList, response].reverse().filter((item) => item.url), (item) => item.matchedAccount + item.url);
    const responseList = Object.values(groupedObj)
        .map((v) => uniqBy(v.slice(0, 10), item => item.payload))
        .flat();
    return updateOssData({
        responseList,
    });
};
const getOssResponse = async (request, account, payload) => {
    const url = request.url;
    const ossData = await getOssData();
    return ossData.responseList.find((res) => {
        return res.url === url && (res.matchedAccount === '*' || res.matchedAccount === account) && (!payload || payload === res.payload);
    });
};
const updateOssGlobalCookie = async (res) => {
    if (res.status !== 200)
        return;
    const ossData = await getOssData();
    const session_id = cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie() || [])?.session_id;
    return updateOssData({
        globalCookie: {
            ...ossData.globalCookie,
            session_id,
        },
    });
};
const updateOssAccount = async (account, token) => {
    const ossData = await getOssData();
    const accountList = ossData.accountList || [];
    return updateOssData({
        accountList: accountList.map((item) => {
            if (item.account === account) {
                return {
                    ...item,
                    token,
                };
            }
            return item;
        }),
    });
};
const toRecord = (headers) => {
    const _headers = {};
    headers.forEach((v, k) => {
        _headers[k] = v;
    });
    return _headers;
};
const toFetch = async (request, matchAccount, op) => {
    const isForce = op?.isForce ?? false;
    const maxAge = op?.maxAge ?? 10 * 1000;
    const withCertification = op?.withCertification ?? true;
    const fullUrl = request.fullUrl;
    const ossData = await getOssData();
    const isLogin = fullUrl.includes('/api/users/login');
    if (isLogin) {
        const loginData = JSON.parse(request.body || '{}');
        const isMainAccount = !ossData.accountList.some((ac) => ac.account === loginData.account);
        if (isMainAccount) {
            const res = await fetch(fullUrl, {
                headers: {
                    ...request.headers,
                },
                body: ['get', 'head'].includes(request.method) ? null : request.body,
                method: request.method,
            });
            const body = await res.text();
            res.text = () => {
                return Promise.resolve(body);
            };
            await updateOssResponseList(res, '*', maxAge, '');
            await updateOssGlobalCookie(res);
            return res;
        }
        const accountItem = ossData.accountList.find((ac) => ac.account === loginData.account && ac.password === loginData.password);
        if (!accountItem) {
            return new Response('{"success":false,"error":"该内部账号密码不正确"}', {
                status: 400,
                headers: {
                    'content-type': 'application/json',
                },
            });
        }
        const matchedCacheResponse = await getOssResponse(request, matchAccount, '');
        if (!matchedCacheResponse) {
            return new Response('{"success":false,"error":"主账号未登录"}', {
                status: 400,
                statusText: 'error',
                headers: {
                    'content-type': 'application/json',
                },
            });
        }
        const token = `${new Date().valueOf()}`;
        await updateOssAccount(accountItem.account, token);
        return new Response(matchedCacheResponse.body, {
            status: 200,
            statusText: 'ok',
            headers: {
                ...matchedCacheResponse.headers,
                'is-cache': 'true',
                'account-token': token,
                'set-cookie': cookie_1.Cookie.stringifyToSetCookie('session_id', ossData.globalCookie.session_id),
            },
        });
    }
    if (!withCertification) {
        const res = await fetch(fullUrl, {
            headers: {
                ...request.headers,
            },
            body: ['get', 'head'].includes(request.method) ? null : request.body,
            method: request.method,
        });
        return res;
    }
    const matchedCacheResponse = await getOssResponse(request, matchAccount, op?.needMatchPayload ? request.body : '');
    const isResponseExpired = new Date().valueOf() - (matchedCacheResponse?.timestamp || 0) > (matchedCacheResponse?.maxAge || 0);
    const accountItem = ossData.accountList.find((ac) => ac.account === request.cookie.account);
    const isTokenExpired = accountItem && accountItem.token !== request.cookie.token;
    if (accountItem && isTokenExpired) {
        return new Response('{"success":false,"error":"请重新登录"}', {
            status: 400,
            statusText: 'error',
            headers: {
                'content-type': 'application/json',
            },
        });
    }
    if (isResponseExpired || isForce || !accountItem) {
        try {
            const res = await fetch(fullUrl, {
                headers: {
                    ...request.headers,
                    cookie: `session_id=${request.cookie.session_id}`,
                },
                body: ['get', 'head'].includes(request.method) ? null : request.body || null,
                method: request.method,
            });
            const body = await res.text();
            res.text = () => Promise.resolve(body);
            await updateOssResponseList(res, matchAccount || '*', maxAge, request.body);
            return new Response(body, {
                status: res.status,
                statusText: res.statusText,
                headers: {
                    ...toRecord(res.headers),
                    'is-cache': 'false',
                    'is-response-expired': `${isResponseExpired}`,
                    'is-force': `${isForce}`,
                    'full-url': fullUrl,
                },
            });
        }
        catch (error) {
            const _err = error;
            return new Response(`{"success":false,"error":"${_err.message + ' ' + _err.stack}"}`, {
                status: 400,
                statusText: 'fail',
                headers: {
                    'content-type': 'application/json',
                },
            });
        }
    }
    return new Response(matchedCacheResponse.body, {
        status: 200,
        statusText: 'ok',
        headers: {
            ...matchedCacheResponse.headers,
            'is-cache': 'true',
        },
    });
};
const handleLogin = async (request, response) => {
    const fullUrl = request.fullUrl;
    if (!fullUrl.includes('/api/users/login'))
        return true;
    const loginData = JSON.parse(request.body || '{}');
    const res = await toFetch(request, '*');
    response.statusCode = res.status;
    response.headers = toRecord(res.headers);
    response.body = await res.text();
    response.isBase64Encoded = false;
    response.setCookie = {
        ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
        account: loginData.account,
        token: res.headers.get('account-token') || '',
    };
    return false;
};
exports.handleLogin = handleLogin;
const handleLogout = async (request, response) => {
    const fullUrl = request.fullUrl;
    if (!fullUrl.includes('/api/users/logout'))
        return true;
    const syncData = await getOssData();
    const accountList = syncData?.accountList || [];
    const cookieData = request.cookie;
    const account = cookieData?.account;
    const isValidAccount = accountList.some((item) => item.account === account);
    const res = await toFetch(request, '*', { isForce: isValidAccount ? false : true });
    const text = await res.text();
    response.statusCode = res.status;
    response.headers = toRecord(res.headers);
    response.setCookie = {
        account: request.cookie.account || '',
        ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
    };
    response.body = text;
    if (isValidAccount) {
        updateOssAccount(account, '');
    }
    return false;
};
exports.handleLogout = handleLogout;
const handleGetMe = async (request, response) => {
    const fullUrl = request.fullUrl;
    if (!fullUrl.includes('/api/users/getme'))
        return true;
    const res = await toFetch(request, '*');
    response.headers = toRecord(res.headers);
    response.setCookie = {
        ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
        account: request.cookie.account || '',
        token: request.cookie.token || '',
    };
    response.statusCode = res.status;
    response.isBase64Encoded = false;
    response.body = await res.text();
    if (response.statusCode === 405) {
        response.body = '{"success":false,"error":"请重新登录主号"}';
    }
    return false;
};
exports.handleGetMe = handleGetMe;
const handleSetting = async (request, response) => {
    const fullUrl = request.fullUrl;
    const isGetConfig = fullUrl.includes('/api/userConfig/getMyConfig');
    const isUpdateConfig = fullUrl.includes('/api/userConfig/update');
    if (!isGetConfig && !isUpdateConfig)
        return true;
    if (isUpdateConfig) {
        const res = await toFetch(request, '*');
        response.headers = toRecord(res.headers);
        response.setCookie = {
            ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
            account: request.cookie.account || '',
            token: request.cookie.token || '',
        };
        response.statusCode = res.status;
        response.isBase64Encoded = false;
        response.body = await res.text();
        const matchedCacheResponse = await getOssResponse({ ...request, rawPath: '/api/userConfig/getMyConfig' }, request.cookie.account, '');
        if (!matchedCacheResponse)
            return;
        const body = JSON.stringify({ ...JSON.parse(matchedCacheResponse.body), ...JSON.parse(request.body) });
        const res2 = new Response(body, {
            headers: matchedCacheResponse.headers,
        });
        const tempRes = Object.assign({}, res2, { url: fullUrl });
        await updateOssResponseList(tempRes, request.cookie.account, 1000 * 60 * 60 * 24 * 365 * 100, '');
        return false;
    }
    const res = await toFetch(request, request.cookie.account ?? '*', { maxAge: 1000 * 60 * 60 * 24 * 365 * 100 });
    response.headers = toRecord(res.headers);
    response.setCookie = {
        ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
        account: request.cookie.account || '',
        token: request.cookie.token || '',
    };
    response.statusCode = res.status;
    response.isBase64Encoded = false;
    response.body = await res.text();
    return false;
};
exports.handleSetting = handleSetting;
const handleOtherApi = async (request, response) => {
    const res = await toFetch(request, '*', { needMatchPayload: true });
    response.headers = toRecord(res.headers);
    response.setCookie = {
        ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
        account: request.cookie.account || '',
        token: request.cookie.token || '',
    };
    response.statusCode = res.status;
    response.isBase64Encoded = false;
    response.body = await res.text();
    return false;
};
exports.handleOtherApi = handleOtherApi;
const handleDeletePut = async (request, response) => {
    if (!['put', 'delete'].includes(request.method.toLowerCase()))
        return true;
    const res = await toFetch(request, '*', { maxAge: 1 });
    response.headers = toRecord(res.headers);
    response.setCookie = {
        ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
        account: request.cookie.account || '',
        token: request.cookie.token || '',
    };
    response.statusCode = res.status;
    response.isBase64Encoded = false;
    response.body = await res.text();
    return false;
};
exports.handleDeletePut = handleDeletePut;
const handleGetMatchById = async (request, response) => {
    const fullUrl = request.fullUrl;
    if (!fullUrl.includes('/api/matchs/getMatchById'))
        return true;
    const res = await toFetch(request, '*', { maxAge: 1 });
    response.headers = toRecord(res.headers);
    response.setCookie = {
        ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
        account: request.cookie.account || '',
        token: request.cookie.token || '',
    };
    response.statusCode = res.status;
    response.isBase64Encoded = false;
    response.body = await res.text();
    return false;
};
exports.handleGetMatchById = handleGetMatchById;
const handleStatic = async (request, response) => {
    const fullUrl = request.fullUrl;
    const parsedUrl = new url_1.URL('', fullUrl);
    if (request.method !== 'get') {
        return true;
    }
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '') {
        const res = await toFetch(request, '*', { withCertification: false });
        const data = await res.text();
        response.statusCode = res.status;
        response.headers = toRecord(res.headers);
        response.body = data;
        return false;
    }
    const extList = [
        { ext: '.js', type: 'text/javascript;charset=UTF-8', isBase64Encoded: false },
        { ext: '.css', type: 'text/css;charset=UTF-8', isBase64Encoded: false },
        { ext: '.mp3', type: 'audio/mpeg', isBase64Encoded: true },
        { ext: '.jpg', type: 'image/jpeg', isBase64Encoded: true },
        { ext: '.png', type: 'image/png', isBase64Encoded: true },
        { ext: '.ico', type: 'image/x-icon', isBase64Encoded: true },
        { ext: '.woff', type: 'application/font-woff', isBase64Encoded: true },
        { ext: '.ttf', type: 'font/ttf', isBase64Encoded: true },
    ];
    const matchedItem = extList.find((item) => fullUrl.endsWith(item.ext));
    if (matchedItem) {
        if (['.js', '.css', '.woff'].includes(matchedItem.ext)) {
            const res = await toFetch(request, '*', { withCertification: false });
            response.statusCode = res.status;
            response.headers = toRecord(res.headers);
            response.isBase64Encoded = matchedItem.isBase64Encoded;
            if (matchedItem.isBase64Encoded) {
                const b = await res.arrayBuffer();
                response.body = Buffer.from(b).toString('base64');
                return false;
            }
            response.body = await res.text();
            return false;
        }
        response.statusCode = 301;
        response.headers['Location'] = fullUrl;
        return false;
    }
    return true;
};
exports.handleStatic = handleStatic;
