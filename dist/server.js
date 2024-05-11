"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStatic = exports.handleOtherApi = exports.handleLogout = exports.handleLogin = void 0;
const ali_oss_1 = __importDefault(require("ali-oss"));
const url_1 = require("url");
const cookie_1 = __importDefault(require("cookie"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const client = new ali_oss_1.default({
    region: 'oss-cn-hangzhou',
    accessKeyId: 'LTAI5tNpSy9xc' + 'TEcAK7M7Uxu',
    accessKeySecret: 'xJw1QUVCmOs' + 'DT5ZHqJgMssUZTtalqo',
    bucket: 'footballc',
    internal: true,
});
const DOMAIN = 'http://175.27.166.226';
const handleLogin = async (request, response) => {
    const fullUrl = DOMAIN + request.rawPath;
    if (!fullUrl.endsWith('/api/users/login'))
        return true;
    let ossRes = void 0;
    try {
        ossRes = await client.get('sync.json');
    }
    catch (error) { }
    const syncData = JSON.parse(ossRes?.content || '{}');
    const loginData = JSON.parse(request.body || '{}');
    const loginResponse = syncData?.loginResponse;
    const accountList = (syncData?.accountList || []);
    const loginRes = await (0, node_fetch_1.default)(fullUrl, {
        headers: {
            accept: 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
            'content-type': 'application/json;charset=UTF-8',
            'proxy-connection': 'keep-alive',
            cookie: request.headers['cookie'],
            Referer: 'http://175.27.166.226/',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
        body: request.body,
        method: 'POST',
    });
    response.headers['Content-Type'] = 'application/json; charset=utf-8';
    if (loginRes.status === 200) {
        const text = await loginRes.text();
        const cookieToSet = loginRes.headers.get('set-cookie');
        response.statusCode = 200;
        response.headers['set-cookie'] = [
            cookieToSet || '',
            cookie_1.default.serialize('account', loginData.account, { path: '/', maxAge: 60 * 60 * 24, httpOnly: true }),
        ].join(',');
        response.body = text;
        const date = loginRes.headers.get('Date') || new Date().toUTCString();
        try {
            const putData = { ...syncData, loginResponse: { headers: { 'Set-Cookie': cookieToSet, Date: date }, body: text } };
            await client.put('sync.json', Buffer.from(JSON.stringify(putData)));
        }
        catch (error) {
            console.log('put error', error);
        }
        return false;
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
    if (new Date().valueOf() - (accountItem?.timestamp || 0) <= 1000 * 60 * 5) {
        response.statusCode = 400;
        response.body = '{"success":false,"error":"该内部账号正在被使用"}';
        return false;
    }
    if (!loginResponse) {
        response.statusCode = 400;
        response.body = '{"success":false,"error":"外部账号未登录,所以内部账号无法使用"}';
        return false;
    }
    const token = `${new Date().valueOf()}`;
    response.statusCode = 200;
    response.headers['set-cookie'] = [
        ...(loginResponse?.headers?.['Set-Cookie'] || []),
        cookie_1.default.serialize('account', loginData.account, { path: '/', maxAge: 60 * 60 * 24, httpOnly: true }),
        cookie_1.default.serialize('token', token, { path: '/', maxAge: 60 * 60 * 24, httpOnly: true }),
    ].join(',');
    response.headers['Date'] = loginResponse.headers['Date'];
    response.body = loginResponse.body || '';
    try {
        const putData = {
            ...syncData,
            accountList: accountList.map((item) => {
                if (item.account === loginData.account) {
                    return {
                        ...item,
                        token,
                    };
                }
                return item;
            }),
        };
        await client.put('sync.json', Buffer.from(JSON.stringify(putData)));
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
    let ossRes = void 0;
    try {
        ossRes = await client.get('sync.json');
    }
    catch (error) { }
    const syncData = JSON.parse(ossRes?.content || '{}');
    const accountList = (syncData?.accountList || []);
    const cookie = cookie_1.default.parse(req.headers['cookie']);
    const account = cookie?.account;
    if (accountList.some((item) => item.account === account)) {
        response.statusCode = 200;
        response.headers['content-type'] = 'application/json;charset=UTF-8';
        response.headers['set-cookie'] = [
            cookie_1.default.serialize('session_id', '', { path: '/', httpOnly: true }),
            cookie_1.default.serialize('account', '', { path: '/', httpOnly: true }),
        ];
        response.body = '{"success":true,"error":"登出成功"}';
        try {
            const putData = {
                ...syncData,
                accountList: accountList.map((item) => {
                    if (item.account === account) {
                        return {
                            ...item,
                            token: '',
                        };
                    }
                    return item;
                }),
            };
            await client.put('sync.json', Buffer.from(JSON.stringify(putData)));
        }
        catch (error) {
            console.log('put error', error);
        }
        return false;
    }
    const method = req.requestContext.http.method.toLowerCase();
    const res = await (0, node_fetch_1.default)(fullUrl, {
        method,
        body: req.body,
        headers: {
            cookie: req.headers['cookie'],
            accept: 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'content-type': 'application/json;charset=UTF-8',
            Referer: 'http://175.27.166.226/',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
    });
    const text = await res.text();
    response.statusCode = res.status;
    response.headers['content-type'] = 'application/json;charset=UTF-8';
    response.headers['set-cookie'] = res.headers.get('set-cookie') || '';
    response.body = text;
    return false;
};
exports.handleLogout = handleLogout;
const handleOtherApi = async (req, response) => {
    const fullUrl = DOMAIN + req.rawPath;
    let ossRes = void 0;
    try {
        ossRes = await client.get('sync.json');
    }
    catch (error) { }
    const syncData = JSON.parse(ossRes?.content || '{}');
    const accountList = (syncData?.accountList || []);
    const cookie = cookie_1.default.parse(req.headers['cookie']);
    const account = cookie?.account;
    const token = cookie?.token;
    const method = req.requestContext.http.method.toLowerCase();
    const res = await (0, node_fetch_1.default)(fullUrl, {
        method,
        body: method === 'post' ? req.body : void 0,
        headers: {
            cookie: req.headers['cookie'],
            accept: 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'content-type': 'application/json;charset=UTF-8',
            Referer: 'http://175.27.166.226/',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
    });
    const text = await res.text();
    const accountItem = accountList.find((item) => item.account === account);
    response.headers['content-type'] = 'application/json;charset=UTF-8';
    response.headers['set-cookie'] = res.headers.get('set-cookie') || '';
    if (accountItem && accountItem.token !== token) {
        response.statusCode = 405;
        response.body = '';
        return false;
    }
    response.statusCode = res.status;
    response.body = text;
    return false;
};
exports.handleOtherApi = handleOtherApi;
const handleStatic = async (req, response) => {
    const fullUrl = DOMAIN + req.rawPath;
    const parsedUrl = new url_1.URL('', fullUrl);
    if (req.requestContext.http.method.toLowerCase() !== 'get') {
        return true;
    }
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '') {
        const res = await (0, node_fetch_1.default)(fullUrl);
        const data = await res.text();
        response.statusCode = 200;
        response.headers['Content-Type'] = 'text/html;charset=UTF-8';
        response.body = data;
        return false;
    }
    const extList = [
        ['.js', 'text/javascript;charset=UTF-8'],
        ['.css', 'text/css;charset=UTF-8'],
        ['.mp3', 'audio/mpeg;'],
        ['.jpg', 'image/jpeg;'],
        ['.png', 'image/png;'],
        ['.ico', 'image/x-icon'],
    ];
    const matchedItem = extList.find((item) => fullUrl.endsWith(item[0]));
    if (!matchedItem) {
        return true;
    }
    response.statusCode = 301;
    response.headers = req.headers;
    response.headers['Location'] = fullUrl;
    return false;
};
exports.handleStatic = handleStatic;
