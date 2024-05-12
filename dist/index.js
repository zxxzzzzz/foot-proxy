"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
const server_1 = require("./server");
const cookie_1 = require("./cookie");
const pipe = async (event, context, callback, funcList) => {
    const request = JSON.parse(event.toString());
    const parsedResponse = {
        statusCode: 400,
        'set-cookie': {},
        headers: {},
        isBase64Encoded: false,
        body: '',
    };
    let cookie = cookie_1.Cookie.parseCookie(request.headers['cookie']);
    if (cookie.__data) {
        Object.assign(cookie, JSON.parse(cookie.__data));
        delete cookie.__data;
    }
    const parsedRequest = {
        rawPath: request.rawPath,
        method: request.requestContext.http.method,
        isBase64Encoded: request.isBase64Encoded,
        body: request.body,
        cookie,
        headers: request.headers,
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
    if (!parsedResponse['set-cookie'] || !Object.keys(parsedResponse['set-cookie']).length) {
        callback(null, {
            statusCode: parsedResponse.statusCode,
            headers: { ...parsedResponse.headers },
            body: parsedResponse.body,
            isBase64Encoded: parsedResponse.isBase64Encoded,
        });
        return;
    }
    const setCookieStr = cookie_1.Cookie.stringifyToSetCookie('data', JSON.stringify(parsedResponse['set-cookie']));
    callback(null, {
        statusCode: parsedResponse.statusCode,
        headers: { ...parsedResponse.headers, 'set-cookie': setCookieStr },
        body: parsedResponse.body,
        isBase64Encoded: parsedResponse.isBase64Encoded,
    });
};
const data = (_event, content, callback) => {
    pipe(_event, content, callback, [server_1.handleStatic, server_1.handleLogin, server_1.handleLogout, server_1.handleOtherApi]);
};
exports.data = data;
