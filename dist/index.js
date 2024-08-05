"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
const server_1 = require("./server");
const cookie_1 = require("./cookie");
const DOMAIN = 'http://175.27.134.229';
const pipe = async (event, context, callback, funcList) => {
    const request = JSON.parse(event.toString());
    const parsedResponse = {
        statusCode: 400,
        setCookie: {},
        headers: {},
        isBase64Encoded: false,
        body: '',
    };
    let cookie = cookie_1.Cookie.parseCookie(request.headers['Cookie']);
    if (cookie.__data) {
        Object.assign(cookie, JSON.parse(cookie.__data || '{}'));
        delete cookie.__data;
    }
    const queryStr = Object.entries(request.queryParameters || {})
        .map(([k, v]) => {
        return `${k}=${v}`;
    })
        .join('&');
    const url = DOMAIN + request.rawPath;
    const parsedRequest = {
        rawPath: request.rawPath,
        method: request.requestContext.http.method.toLowerCase(),
        isBase64Encoded: request.isBase64Encoded,
        body: request.body || '',
        cookie: cookie,
        headers: request.headers,
        queryParameters: request.queryParameters,
        url,
        query: queryStr,
        fullUrl: queryStr ? url + '?' + encodeURI(queryStr) : url,
    };
    try {
        for (const func of funcList) {
            const isContinue = await func(parsedRequest, parsedResponse);
            if (!isContinue)
                break;
        }
    }
    catch (error) {
        callback(null, { statusCode: 400, body: error.stack || '', isBase64Encoded: false, headers: {} });
    }
    const statusCode = parsedResponse.statusCode === 405 ? 400 : parsedResponse.statusCode;
    if (!parsedResponse.setCookie || !Object.keys(parsedResponse.setCookie).length) {
        callback(null, {
            statusCode,
            headers: { ...parsedResponse.headers },
            body: parsedResponse.body,
            isBase64Encoded: parsedResponse.isBase64Encoded,
        });
        return;
    }
    const setCookieStr = cookie_1.Cookie.stringifyToSetCookie('__data', JSON.stringify(parsedResponse.setCookie));
    callback(null, {
        statusCode,
        headers: { ...parsedResponse.headers, 'set-cookie': setCookieStr },
        body: parsedResponse.body,
        isBase64Encoded: parsedResponse.isBase64Encoded,
    });
};
const data = (_event, content, callback) => {
    pipe(_event, content, callback, [server_1.handleStatic, server_1.handleLogin, server_1.handleLogout, server_1.handleGetMe, server_1.handleSetting, server_1.handleDeletePut, server_1.handleOtherApi]);
};
exports.data = data;
