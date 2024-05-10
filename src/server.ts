import OSS from 'ali-oss';
import { URL } from 'url';
import Cookie from 'cookie';
import { Request, Response } from './type';

const client = new OSS({
  // yourRegion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
  region: 'oss-cn-hangzhou',
  // 阿里云账号AccessKey拥有所有API的访问权限，风险很高。强烈建议您创建并使用RAM用户进行API访问或日常运维，请登录RAM控制台创建RAM用户。
  accessKeyId: 'LTAI5tNpSy9xc' + 'TEcAK7M7Uxu',
  accessKeySecret: 'xJw1QUVCmOs' + 'DT5ZHqJgMssUZTtalqo',
  bucket: 'footballc',
  internal: true,
});

const DOMAIN = 'http://175.27.166.226';

export const handleLogin = async (request: Request, response: Response) => {
  const fullUrl = DOMAIN + request.rawPath;
  if (!fullUrl.endsWith('/api/users/login')) return true;
  const body = JSON.parse(request.body);
  let ossRes: any = void 0;
  try {
    ossRes = await client.get('sync.json');
  } catch (error) {}
  const syncData = JSON.parse(ossRes?.content || '{}');
  const loginData = JSON.parse(body || '{}') as { account: string; password: string };
  const loginResponse = syncData?.loginResponse as { headers: { 'Set-Cookie': string[]; Date: string }; body: string };
  const accountList = (syncData?.accountList || []) as { account: string; password: string; timestamp: number }[];
  const loginRes = await fetch(fullUrl, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
      'content-type': 'application/json;charset=UTF-8',
      'proxy-connection': 'keep-alive',
      cookie: request.headers['cookie'],
      Referer: 'http://175.27.166.226/',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    body: body,
    method: 'POST',
  });
  response.headers['Content-Type'] = 'application/json; charset=utf-8';
  if (loginRes.status === 200) {
    const text = await loginRes.text();
    const cookieToSet = loginRes.headers.getSetCookie();
    response.statusCode = 200;
    response.headers['set-cookie'] = [
      ...cookieToSet,
      Cookie.serialize('account', loginData.account, { path: '/', maxAge: 60 * 60 * 24, httpOnly: true }),
    ];
    response.body = text;
    const date = loginRes.headers.get('Date') || new Date().toUTCString();
    try {
      const putData = { ...syncData, loginResponse: { headers: { 'Set-Cookie': cookieToSet, Date: date }, body: text } };
      await client.put('sync.json', Buffer.from(JSON.stringify(putData)));
    } catch (error) {
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
    Cookie.serialize('account', loginData.account, { path: '/', maxAge: 60 * 60 * 24, httpOnly: true }),
    Cookie.serialize('token', token, { path: '/', maxAge: 60 * 60 * 24, httpOnly: true }),
  ];
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
  } catch (error) {
    console.log('put error', error);
  }
  return false;
};
// http://175.27.166.226/api/users/logout
export const handleLogout = async (req: Request, response: Response) => {
  const fullUrl = DOMAIN + req.rawPath;
  if (!fullUrl.endsWith('/api/users/logout')) return true;
  let ossRes: any = void 0;
  try {
    ossRes = await client.get('sync.json');
  } catch (error) {}
  const syncData = JSON.parse(ossRes?.content || '{}');
  const accountList = (syncData?.accountList || []) as { account: string; password: string }[];
  const cookie = Cookie.parse(req.headers['cookie']);
  const account = cookie?.account;
  if (accountList.some((item) => item.account === account)) {
    response.statusCode = 200;
    response.headers['content-type'] = 'application/json;charset=UTF-8';
    response.headers['set-cookie'] = [
      Cookie.serialize('session_id', '', { path: '/', httpOnly: true }),
      Cookie.serialize('account', '', { path: '/', httpOnly: true }),
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
    } catch (error) {
      console.log('put error', error);
    }
    return false;
  }
  // 外部账号登出
  const method = req.requestContext.http.method.toLowerCase();
  const res = await fetch(fullUrl, {
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
  response.headers['set-cookie'] = res.headers.getSetCookie();
  response.body = text;
  return false;
};

// 其他请求全部透传
export const handleOtherApi = async (req: Request, response: Response) => {
  const fullUrl = DOMAIN + req.rawPath;
  let ossRes: any = void 0;
  try {
    ossRes = await client.get('sync.json');
  } catch (error) {}
  const syncData = JSON.parse(ossRes?.content || '{}');
  const accountList = (syncData?.accountList || []) as { account: string; password: string; token: string }[];
  const cookie = Cookie.parse(req.headers['cookie']);
  const account = cookie?.account;
  const token = cookie?.token;

  const method = req.requestContext.http.method.toLowerCase();
  const res = await fetch(fullUrl, {
    method,
    body: method === 'post' ? req.body : null,
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
  response.headers['set-cookie'] = res.headers.getSetCookie();
  if (accountItem && accountItem.token !== token) {
    response.statusCode = 405;
    response.body = '';
    return false;
  }
  response.statusCode = res.status;
  response.body = text;
  return false;
};

export const handleStatic = async (req: Request, response: Response) => {
  const fullUrl = DOMAIN + req.rawPath;
  const parsedUrl = new URL('', fullUrl);
  if (req.requestContext.http.method.toLowerCase() !== 'get') {
    return true;
  }
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '') {
    const res = await fetch(fullUrl);
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
  ];
  const matchedItem = extList.find((item) => fullUrl.endsWith(item[0]));
  if (!matchedItem) {
    return true;
  }
  const res = await fetch(fullUrl);
  response.statusCode = 200;
  response.headers['Content-Type'] = matchedItem[1];
  if (matchedItem[1].startsWith('text')) {
    const body = await res.text();
    response.body = body;
  }
  const arrBuf = await res.arrayBuffer();
  const body = Buffer.from(arrBuf).toString('base64');
  response.body = body;
  return false;
};
