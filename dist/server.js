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
const getOssData = async () => {
    let ossRes = void 0;
    try {
        ossRes = await client.get(OSS_FILE_NAME);
    }
    catch (error) {
        return {
            accountList: [],
            loginResponse: {
                headers: { 'Set-Cookie': [], Date: '' },
                body: '',
            },
        };
    }
    const syncData = JSON.parse(ossRes?.content || '{}');
    return syncData;
};
const setOssData = async (data) => {
    const ossData = await getOssData();
    const accountList = data.accountList || ossData.accountList;
    const headers = data.loginResponse?.headers || ossData.loginResponse.headers;
    const body = data.loginResponse?.body || ossData.loginResponse.body;
    try {
        const putData = { accountList, loginResponse: { headers, body } };
        await client.put(OSS_FILE_NAME, Buffer.from(JSON.stringify(putData)));
    }
    catch (error) {
        console.log('put error', error);
    }
};
const toFetch = async (request) => {
    const fullUrl = DOMAIN + request.rawPath;
    const ossData = await getOssData();
    const cookieData = request.cookie;
    const session_id = cookieData.session_id || '';
    const isLogin = fullUrl.endsWith('/api/users/login');
    let account = '';
    if (cookieData.account) {
        account = cookieData.account;
    }
    if (isLogin) {
        const loginData = JSON.parse(request.body || '{}');
        account = loginData.account;
    }
    const res = await fetch(fullUrl, {
        headers: {
            ...request.headers,
            cookie: `session_id=${session_id}`,
        },
        body: ['get', 'head'].includes(request.method) ? null : request.body,
        method: request.method,
    });
    const isPublicAccount = !ossData.accountList.some((ac) => ac.account === account) && account;
    if (!isPublicAccount)
        return res;
    const cookieToSet = res.headers.getSetCookie();
    if (!cookieToSet?.length)
        return res;
    if (isLogin) {
        const body = await res.text();
        await setOssData({
            loginResponse: {
                headers: { 'Set-Cookie': cookieToSet, Date: res.headers.get('Date') || '' },
                body,
            },
        });
        res.text = () => {
            return Promise.resolve(body);
        };
        return res;
    }
    await setOssData({
        loginResponse: {
            headers: { 'Set-Cookie': cookieToSet, Date: res.headers.get('Date') || '' },
        },
    });
    return res;
};
const DOMAIN = 'http://175.27.166.226';
const OSS_FILE_NAME = 'sync.json';
const handleLogin = async (request, response) => {
    const fullUrl = DOMAIN + request.rawPath;
    if (!fullUrl.endsWith('/api/users/login'))
        return true;
    const syncData = await getOssData();
    const loginData = JSON.parse(request.body || '{}');
    const loginResponse = syncData?.loginResponse;
    const accountList = syncData?.accountList || [];
    const loginRes = await toFetch(request);
    response.headers['Content-Type'] = 'application/json; charset=utf-8';
    if (loginRes.status === 200) {
        const text = await loginRes.text();
        const cookieToSet = loginRes.headers.getSetCookie();
        response.statusCode = 200;
        response['set-cookie'] = {
            ...cookie_1.Cookie.parseSetCookie(cookieToSet),
            account: loginData.account,
        };
        response.body = text;
    }
    if (!accountList?.length) {
        response.statusCode = 400;
        response.body = '{"success":false,"error":"未配置内部账号"}';
        return false;
    }
    const accountItem = accountList.find((item) => item.account === loginData.account);
    if (!accountItem) {
        response.statusCode = 400;
        response.body = '{"success":false,"error":"该内部账号不存在"}';
        return false;
    }
    if (accountItem.password !== loginData.password) {
        response.statusCode = 400;
        response.body = '{"success":false,"error":"该内部账号密码不正确"}';
        return false;
    }
    if (!loginResponse) {
        response.statusCode = 400;
        response.body = '{"success":false,"error":"外部账号未登录,所以内部账号无法使用"}';
        return false;
    }
    const token = `${new Date().valueOf()}`;
    response.statusCode = 200;
    response['set-cookie'] = {
        ...cookie_1.Cookie.parseSetCookie(loginResponse?.headers?.['Set-Cookie']),
        account: loginData.account,
        token,
    };
    response.headers['Date'] = loginResponse.headers['Date'];
    response.body = loginResponse.body || '';
    try {
        setOssData({
            accountList: accountList.map((item) => {
                if (item.account === loginData.account) {
                    return {
                        ...item,
                        token,
                    };
                }
                return item;
            }),
        });
    }
    catch (error) {
        console.log('put error', error);
    }
    return false;
};
exports.handleLogin = handleLogin;
const handleLogout = async (req, response) => {
    const fullUrl = DOMAIN + req.rawPath;
    if (!fullUrl.endsWith('/api/users/logout'))
        return true;
    const syncData = await getOssData();
    const accountList = syncData?.accountList || [];
    const cookieData = req.cookie;
    const account = cookieData?.account;
    if (accountList.some((item) => item.account === account)) {
        response.statusCode = 200;
        response.headers['content-type'] = 'application/json;charset=UTF-8';
        response['set-cookie'] = {
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
    const res = await toFetch(req);
    const text = await res.text();
    response.statusCode = res.status;
    response.headers['content-type'] = 'application/json;charset=UTF-8';
    response['set-cookie'] = {
        account: req.cookie.account || '',
        ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
    };
    response.body = text;
    return false;
};
exports.handleLogout = handleLogout;
const handleOtherApi = async (req, response) => {
    let ossRes = void 0;
    try {
        ossRes = await client.get(OSS_FILE_NAME);
    }
    catch (error) { }
    const syncData = await getOssData();
    const ossAccountList = syncData?.accountList || [];
    const cookieData = req.cookie;
    const cookieAccount = cookieData?.account;
    const cookieToken = cookieData?.token;
    const res = await toFetch(req);
    const text = await res.text();
    const accountItem = ossAccountList.find((item) => item.account === cookieAccount);
    response.headers['content-type'] = 'application/json;charset=UTF-8';
    response['set-cookie'] = {
        ...cookie_1.Cookie.parseSetCookie(res.headers.getSetCookie()),
        account: req.cookie.account || '',
        token: req.cookie.token || '',
    };
    if (accountItem && accountItem.token !== cookieToken && accountItem.token) {
        response.statusCode = 400;
        response.body = '';
        return false;
    }
    response.statusCode = res.status === 405 ? 400 : res.status;
    if (response.statusCode !== 200) {
        response.body = JSON.stringify({ ...JSON.parse(text), cookie: req.cookie, header: req.headers });
        return false;
    }
    response.body = text;
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
        const res = await toFetch(req);
        const data = await res.text();
        response.statusCode = 200;
        response.headers['Content-Type'] = 'text/html;charset=UTF-8';
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
        const res = await toFetch(req);
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
    return true;
};
exports.handleStatic = handleStatic;
