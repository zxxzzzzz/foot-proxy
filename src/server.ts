import OSS from 'ali-oss';
import { URL } from 'url';
import { ParsedRequest, ParsedResponse, Request, Response } from './type';
import { Cookie } from './cookie';

const client = new OSS({
  // yourRegion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
  region: 'oss-cn-hangzhou',
  // 阿里云账号AccessKey拥有所有API的访问权限，风险很高。强烈建议您创建并使用RAM用户进行API访问或日常运维，请登录RAM控制台创建RAM用户。
  accessKeyId: 'LTAI5tNpSy9xc' + 'TEcAK7M7Uxu',
  accessKeySecret: 'xJw1QUVCmOs' + 'DT5ZHqJgMssUZTtalqo',
  bucket: 'footballc',
  internal: true,
});

const getOssData = async () => {
  let ossRes: any = void 0;
  try {
    ossRes = await client.get(OSS_FILE_NAME);
  } catch (error) {
    return {
      accountList: [],
      loginResponse: {
        headers: { 'Set-Cookie': [], Date: '' },
        body: '',
      },
    };
  }
  const syncData = JSON.parse(ossRes?.content || '{}');
  return syncData as {
    accountList: { account: string; password: string; token: string }[];
    loginResponse: {
      headers: { 'Set-Cookie': string[]; Date: string };
      body: string;
    };
  };
};
const setOssData = async (data: {
  accountList?: { account: string; password: string; token: string }[];
  loginResponse?: {
    headers?: { 'Set-Cookie': string[]; Date: string };
    body?: string;
  };
}) => {
  const ossData = await getOssData();
  const accountList = data.accountList || ossData.accountList;
  const headers = data.loginResponse?.headers || ossData.loginResponse.headers;
  const body = data.loginResponse?.body || ossData.loginResponse.body;
  try {
    const putData = { accountList, loginResponse: { headers, body } };
    await client.put(OSS_FILE_NAME, Buffer.from(JSON.stringify(putData)));
  } catch (error) {
    console.log('put error', error);
  }
};

const toFetch = async (request: ParsedRequest) => {
  const fullUrl = DOMAIN + request.rawPath;
  const ossData = await getOssData();
  const cookieData = request.Cookie;
  const session_id = cookieData.session_id || '';
  const isLogin = fullUrl.endsWith('/api/users/login');
  let account = '';
  if (cookieData.account) {
    account = cookieData.account;
  }
  if (isLogin) {
    const loginData = JSON.parse(request.body || '{}') as { account: string; password: string };
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
  if (!isPublicAccount) return res;
  const cookieToSet = res.headers.getSetCookie();
  if (!cookieToSet?.length) return res;
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

export const handleLogin = async (request: ParsedRequest, response: ParsedResponse) => {
  const fullUrl = DOMAIN + request.rawPath;
  if (!fullUrl.endsWith('/api/users/login')) return true;
  const syncData = await getOssData();
  const loginData = JSON.parse(request.body || '{}') as { account: string; password: string };
  const loginResponse = syncData?.loginResponse;
  const accountList = syncData?.accountList || [];
  const loginRes = await toFetch(request);
  response.headers['Content-Type'] = 'application/json; charset=utf-8';
  if (loginRes.status === 200) {
    const text = await loginRes.text();
    const cookieToSet = loginRes.headers.getSetCookie();
    response.statusCode = 200;
    response['Set-Cookie'] = {
      ...Cookie.parseSetCookie(cookieToSet),
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
  response['Set-Cookie'] = {
    ...Cookie.parseSetCookie(loginResponse?.headers?.['Set-Cookie']),
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
  } catch (error) {
    console.log('put error', error);
  }
  return false;
};
// http://175.27.166.226/api/users/logout
export const handleLogout = async (req: ParsedRequest, response: ParsedResponse) => {
  const fullUrl = DOMAIN + req.rawPath;
  if (!fullUrl.endsWith('/api/users/logout')) return true;
  const syncData = await getOssData();
  const accountList = syncData?.accountList || [];
  const cookieData = req.Cookie;
  const account = cookieData?.account;
  if (accountList.some((item) => item.account === account)) {
    response.statusCode = 200;
    response.headers['content-type'] = 'application/json;charset=UTF-8';
    response['Set-Cookie'] = {
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
  // 外部账号登出
  const res = await toFetch(req);
  const text = await res.text();
  response.statusCode = res.status;
  response.headers['content-type'] = 'application/json;charset=UTF-8';
  response['Set-Cookie'] = {
    account: req.Cookie.account || '',
    ...Cookie.parseSetCookie(res.headers.getSetCookie()),
  };
  response.body = text;
  return false;
};

// 其他请求全部透传
export const handleOtherApi = async (req: ParsedRequest, response: ParsedResponse) => {
  let ossRes: any = void 0;
  try {
    ossRes = await client.get(OSS_FILE_NAME);
  } catch (error) {}
  const syncData = await getOssData();
  const ossAccountList = syncData?.accountList || [];
  const cookieData = req.Cookie;
  const cookieAccount = cookieData?.account;
  const cookieToken = cookieData?.token;

  const res = await toFetch(req);
  const text = await res.text();
  const accountItem = ossAccountList.find((item) => item.account === cookieAccount);

  response.headers['content-type'] = 'application/json;charset=UTF-8';
  response['Set-Cookie'] = {
    ...Cookie.parseSetCookie(res.headers.getSetCookie()),
    account: req.Cookie.account || '',
    token: req.Cookie.token || '',
  };
  if (accountItem && accountItem.token !== cookieToken && accountItem.token) {
    response.statusCode = 400;
    response.body = '';
    return false;
  }
  response.statusCode = res.status === 405 ? 400 : res.status;
  if (response.statusCode !== 200) {
    response.body = JSON.stringify({ ...JSON.parse(text), cookie: req.Cookie, header: req.headers });
    return false;
  }
  response.body = text;
  return false;
};

export const handleStatic = async (req: ParsedRequest, response: ParsedResponse) => {
  const fullUrl = DOMAIN + req.rawPath;
  const parsedUrl = new URL('', fullUrl);
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
    if (['.js', '.woff', '.ttf', '.css'].includes(matchedItem.ext)) {
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
    response.statusCode = 301;
    response.headers['Location'] = fullUrl;
    return false;
  }
  return true;
};
