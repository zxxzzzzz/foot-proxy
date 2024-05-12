"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cookie = void 0;
exports.Cookie = {
    stringifyToSetCookie: (key, value) => {
        return `${key}=${value};Path=/;httpOnly`;
    },
    parseSetCookie: (str) => {
        if (!str || !str?.length)
            return {};
        const strList = [].concat(str);
        return strList.reduce((re, cur) => {
            const itemStr = cur.split(';')[0];
            const [k, v] = itemStr.split('=');
            return {
                ...re,
                [k]: v,
            };
        }, {});
    },
    parseCookie: (str) => {
        if (!str)
            return {};
        return str.split(';').reduce((re, cur) => {
            const [k, v] = cur.split('=');
            return { ...re, [k]: v };
        }, {});
    },
};
