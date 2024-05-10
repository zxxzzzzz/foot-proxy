"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
const server_1 = require("./server");
const pipe = async (event, context, callback, funcList) => {
    const request = JSON.parse(event.toString());
    if (request.headers['Content-Type'] === 'application/json') {
        request.body = JSON.parse(request.body);
    }
    const response = {
        statusCode: 405,
        headers: {},
        isBase64Encoded: false,
        body: '',
    };
    try {
        for (const func of funcList) {
            const isContinue = await func(request, response);
            if (!isContinue)
                break;
        }
    }
    catch (error) {
        callback(null, { statusCode: 405, body: error.message });
    }
    callback(null, response);
};
const data = (_event, content, callback) => {
    pipe(_event, content, callback, [server_1.handleStatic, server_1.handleLogin, server_1.handleLogout, server_1.handleOtherApi]);
};
exports.data = data;
