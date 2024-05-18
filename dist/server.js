"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStatic = exports.handleOtherApi = exports.handleLogout = exports.handleLogin = void 0;
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
const DOMAIN = 'http://175.27.166.226';
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
const setOssData = async (data) => {
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
const updateOssResponseList = async (res, account) => {
    if (res.status !== 200)
        return;
    const ossData = await getOssData();
    const headers = {};
    res.headers.forEach((v, k) => {
        headers[k] = v;
    });
    const body = await res.text();
    res.text = () => Promise.resolve(body);
    const response = {
        body,
        headers,
        url: res.url,
        account,
        timestamp: new Date().valueOf(),
    };
    const responseList = uniqBy([...ossData.responseList, response].reverse(), (item) => item.account + ' ' + item.url);
    return setOssData({
        responseList,
    });
};
const updateOssGlobalCookie = async (res) => {
    if (res.status !== 200)
        return;
    const ossData = await getOssData();
    const session_id = cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie() || [])?.session_id;
    return setOssData({
        globalCookie: {
            ...ossData.globalCookie,
            session_id,
        },
    });
};
const updateOssAccount = async (account, token) => {
    const ossData = await getOssData();
    const accountList = ossData.accountList || [];
    setOssData({
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
const toFetch = async (request, op) => {
    const isForce = op?.isForce ?? false;
    const isCache = op?.isCache ?? true;
    const withCertification = op?.withCertification ?? true;
    const fullUrl = DOMAIN + request.rawPath;
    const cookieData = request.cookie;
    const ossData = await getOssData();
    const isLogin = fullUrl.endsWith('/api/users/login');
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
            await updateOssResponseList(res, loginData.account);
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
        const token = `${new Date().valueOf()}`;
        const matchedCacheResponse = ossData.responseList.find((res) => res.url === fullUrl);
        await updateOssAccount(accountItem.account, token);
        return new Response(matchedCacheResponse.body, {
            status: 200,
            statusText: 'ok',
            headers: {
                ...matchedCacheResponse.headers,
                'use-cache': '1',
                'account-token': token,
                'set-cookie': cookie_1.Cookie.stringifyToSetCookie('session_id', ossData.globalCookie.session_id),
            },
        });
    }
    const matchedCacheResponse = ossData.responseList.find((res) => res.url === fullUrl);
    const isResponseExpired = new Date().valueOf() - (matchedCacheResponse?.timestamp || 0) > 10;
    const isValidAccount = ossData.accountList.some((ac) => ac.account === cookieData.account);
    if (!isValidAccount && withCertification) {
        return new Response('{"success":false,"error":"该内部账号不存在"}', {
            status: 400,
            headers: {
                'content-type': 'application/json',
            },
        });
    }
    if (isResponseExpired || isForce) {
        const res = await fetch(fullUrl, {
            headers: {
                ...request.headers,
                cookie: withCertification ? `session_id=${request.cookie.session_id}` : '',
            },
            body: ['get', 'head'].includes(request.method) ? null : request.body,
            method: request.method,
        });
        if (isCache) {
            await updateOssResponseList(res, cookieData.account || '');
        }
        return res;
    }
    return new Response(matchedCacheResponse.body, {
        status: 200,
        statusText: 'ok',
        headers: {
            ...matchedCacheResponse.headers,
            'use-cache': '1',
        },
    });
};
const handleLogin = async (request, response) => {
    const fullUrl = DOMAIN + request.rawPath;
    if (!fullUrl.endsWith('/api/users/login'))
        return true;
    const loginData = JSON.parse(request.body || '{}');
    const res = await toFetch(request);
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
    const fullUrl = DOMAIN + request.rawPath;
    if (!fullUrl.endsWith('/api/users/logout'))
        return true;
    const syncData = await getOssData();
    const accountList = syncData?.accountList || [];
    const cookieData = request.cookie;
    const account = cookieData?.account;
    if (accountList.some((item) => item.account === account)) {
        response.statusCode = 200;
        response.headers['content-type'] = 'application/json;charset=UTF-8';
        response.setCookie = {
            session_id: '',
            account: '',
            token: '',
        };
        response.body = '{"success":true,"error":"登出成功"}';
        await setOssData({
            accountList: accountList.map((item) => {
                if (item.account === account) {
                    return {
                        ...item,
                        token: '',
                    };
                }
                return item;
            }),
        });
        return false;
    }
    const res = await toFetch(request, { isForce: true });
    const text = await res.text();
    response.statusCode = res.status;
    response.headers['content-type'] = 'application/json;charset=UTF-8';
    response.setCookie = {
        account: request.cookie.account || '',
        ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
    };
    response.body = text;
    return false;
};
exports.handleLogout = handleLogout;
const handleOtherApi = async (request, response) => {
    const res = await toFetch(request);
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
const handleStatic = async (req, response) => {
    const fullUrl = DOMAIN + req.rawPath;
    const parsedUrl = new url_1.URL('', fullUrl);
    if (req.method !== 'get') {
        return true;
    }
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '') {
        const res = await toFetch(req, { isCache: false, withCertification: false });
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
        if (['.js', '.css'].includes(matchedItem.ext)) {
            const res = await toFetch(req, { isCache: false });
            response.statusCode = res.status;
            response.headers = {
                'content-type': matchedItem.type,
            };
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
