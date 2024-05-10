const {
  getCacheData,
  getSetting,
  setSetting,
  getBasketballCacheData,
  getBasketballData,
} = require('./dist/getFootBall');
const fs = require('fs');
const path = require('path');
const { createHmac } = require('crypto');

const pipe = async (event, context, callback, funcList = []) => {
  const request = JSON.parse(event.toString());
  if (request.headers['Content-Type'] === 'application/json') {
    request.body = JSON.parse(request.body);
  }
  const response = {};
  try {
    for (const func of funcList) {
      await func(request, response);
    }
  } catch (error) {
    callback(null, { statusCode: 500, body: error.message });
  }
  callback(null, response);
};
const useCache = (request, response) => {
  const hash = createHmac('sha256', '123@');
  const requestEtag = request?.headers?.['If-None-Match'] || '';
  const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
  const hashText = hash.update(body, 'utf-8').digest('hex');
  response.headers = {
    ...(response.headers || {}),
    'Cache-Control': 'no-cache',
    ETag: hashText,
  };
  if (requestEtag && hashText === requestEtag) {
    response.statusCode = 304;
    response.body = '';
  }
};

const useStatic = (request, response) => {
  const rawPath = request.rawPath || request?.requestContext?.http?.path || '';
  let responseBody = '';
  let contentType = 'text/html;charset=UTF-8';
  if (!rawPath || rawPath === '/') {
    responseBody = fs.readFileSync(path.resolve(__dirname, './public/index.html'), { encoding: 'utf-8' });
  } else {
    responseBody = fs.readFileSync(path.resolve(__dirname, './public' + rawPath), { encoding: 'utf-8' });
  }
  if (rawPath.endsWith('.js')) {
    contentType = 'application/x-javascript';
  }
  if (rawPath.endsWith('.css')) {
    contentType = 'text/css';
  }
  response.statusCode = 200;
  response.body = responseBody;
  response.headers = {
    ...(response.headers || {}),
    'Content-Type': contentType,
    'Cache-Control': 'no-cache',
  };
};

exports.static = (_event, content, callback) => pipe(_event, content, callback, [useStatic, useCache]);

const useData = async (request, response) => {
  const password = request?.queryParameters?.p || '';
  const token = request?.queryParameters?.token || '';
  const responseData = await getCacheData({ password, token });
  response.statusCode = 200;
  response.body = responseData;
  response.headers = {
    ...(response.headers || {}),
    'Content-Type': 'application/json',
  };
};

const useBasketballData = async (request, response) => {
  const password = request?.queryParameters?.p || '';
  const token = request?.queryParameters?.token || '';
  const responseData = await getBasketballCacheData({ password, token });
  response.statusCode = 200;
  response.body = responseData;
  response.headers = {
    ...(response.headers || {}),
    'Content-Type': 'application/json',
  };
};

exports.data = (_event, content, callback) => pipe(_event, content, callback, [useData, useCache]);

exports.basketballData = (_event, content, callback) => pipe(_event, content, callback, [useBasketballData, useCache]);


exports.setting = (_event, content, callback) =>
  pipe(_event, content, callback, [
    async (request, response) => {
      response.statusCode = 200;
      response.headers = {
        ...(response.headers || {}),
        'Content-Type': 'application/json',
      };
      if ((request?.requestContext?.http?.method || '').toLowerCase() === 'get') {
        const res = await getSetting();
        response.body = res;
      } else {
        const res = await setSetting(request.body);
        response.body = res;
      }
    },
  ]);
exports.getRequest = (_event, content, callback) =>
  pipe(_event, content, callback, [
    async (request, response) => {
      response.statusCode = 200;
      response.headers = {
        ...(response.headers || {}),
        'Content-Type': 'application/json',
      };
      response.body = request;
    },
  ]);
