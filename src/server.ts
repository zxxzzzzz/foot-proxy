import OSS from 'ali-oss';
import { URL } from 'url';
import { ParsedRequest, ParsedResponse } from './type';
import { Cookie } from './cookie';

type OSSData = {
  accountList: { account: string; password: string; token: string }[];
  globalCookie: {
    session_id: string;
  };
  responseList: {
    body: string;
    url: string;
    headers: { [k: string]: string };
    timestamp: number;
    account: string;
  }[];
};

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
const OSS_FILE_NAME = 'sync-test.json';

function uniqBy<T>(itemList: T[], cb: (item: T) => string) {
  const idList: string[] = [];
  const reItemList: T[] = [];
  for (const item of itemList) {
    const id = cb(item);
    if (!idList.includes(id)) {
      reItemList.push({ ...item });
      idList.push(id);
    }
  }
  return reItemList;
}

const getOssData = async (): Promise<OSSData> => {
  let ossRes: any = void 0;
  try {
    ossRes = await client.get(OSS_FILE_NAME);
  } catch (error) {
    return {
      accountList: [],
      globalCookie: {
        session_id: '',
      },
      responseList: [],
    };
  }
  const syncData = JSON.parse(
    ossRes?.content ||
      `{
          "accountList": [],
          "globalCookie":{"session_id":""},
          "responseList": [],
      }`
  );
  return syncData;
};
const updateOssData = async (data: Partial<OSSData>) => {
  const ossData = await getOssData();
  const accountList = data.accountList || ossData.accountList;
  const responseList = data.responseList || ossData.responseList || [];
  const globalCookie = data.globalCookie || ossData.globalCookie || { session_id: '' };
  try {
    const putData: OSSData = { accountList, responseList, globalCookie };
    await client.put(OSS_FILE_NAME, Buffer.from(JSON.stringify(putData)));
  } catch (error) {
    console.log('put error', error);
  }
};
const updateOssResponseList = async (res: Response, account: string) => {
  if (res.status !== 200) return;
  const ossData = await getOssData();
  const headers: { [k: string]: string } = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const body = await res.text();
  res.text = () => Promise.resolve(body);
  const response: OSSData['responseList'][0] = {
    body,
    headers,
    url: res.url,
    account,
    timestamp: new Date().valueOf(),
  };
  const responseList = uniqBy([...ossData.responseList, response].reverse(), (item) => item.account + ' ' + item.url);
  return updateOssData({
    responseList,
  });
};
const getOssResponse = async (request: ParsedRequest, account: string) => {
  const fullUrl = DOMAIN + request.rawPath;
  const ossData = await getOssData();
  return ossData.responseList.find((res) => {
    return res.url === fullUrl && (res.account === '*' || res.account === account);
  });
};

const updateOssGlobalCookie = async (res: Response) => {
  if (res.status !== 200) return;
  const ossData = await getOssData();
  const session_id = Cookie.parseSetCookie(res.headers.getSetCookie() || [])?.session_id;
  return updateOssData({
    globalCookie: {
      ...ossData.globalCookie,
      session_id,
    },
  });
};
const updateOssAccount = async (account: string, token: string) => {
  const ossData = await getOssData();
  const accountList = ossData.accountList || [];
  updateOssData({
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

const toRecord = (headers: Headers) => {
  const _headers: { [k: string]: string } = {};
  headers.forEach((v, k) => {
    _headers[k] = v;
  });
  return _headers;
};

// mock正常返回数据
const toFetch = async (request: ParsedRequest, account: string, op?: { isForce?: boolean; withCertification?: boolean }) => {
  const isForce = op?.isForce ?? false;
  const withCertification = op?.withCertification ?? true;
  const fullUrl = DOMAIN + request.rawPath;
  const ossData = await getOssData();
  const isLogin = fullUrl.endsWith('/api/users/login');
  // 登录请求的处理
  if (isLogin) {
    const loginData = JSON.parse(request.body || '{}') as { account: string; password: string };
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
    // 副号登录
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
    const matchedCacheResponse = await getOssResponse(request, account);
    if (!matchedCacheResponse) {
      return new Response('{"success":false,"error":"主账号未登录"}', {
        status: 400,
        statusText: 'error',
        headers: {
          'content-type': 'application/json',
          'account-token': token,
        },
      });
    }
    await updateOssAccount(accountItem.account, token);
    return new Response(matchedCacheResponse.body, {
      status: 200,
      statusText: 'ok',
      headers: {
        ...matchedCacheResponse.headers,
        'is-cache': 'true',
        'account-token': token,
        'set-cookie': Cookie.stringifyToSetCookie('session_id', ossData.globalCookie.session_id),
      },
    });
  }
  // 其他请求处理
  const matchedCacheResponse = await getOssResponse(request, account);
  const isResponseExpired = new Date().valueOf() - (matchedCacheResponse?.timestamp || 0) > 10 * 1000;
  const isValidAccount = ossData.accountList.some((ac) => ac.account === account);
  // 不用认证的请求，直接透传
  if (!withCertification) {
    const res = await fetch(fullUrl, {
      headers: {
        ...request.headers,
      },
      body: ['get', 'head'].includes(request.method) ? null : request.body,
      method: request.method,
    });
    return res;
  }
  if (isResponseExpired || isForce || !isValidAccount) {
    const res = await fetch(fullUrl, {
      headers: {
        ...request.headers,
        cookie: `session_id=${request.cookie.session_id}`,
      },
      body: ['get', 'head'].includes(request.method) ? null : request.body,
      method: request.method,
    });
    const body = await res.text();
    res.text = () => Promise.resolve(body);
    await updateOssResponseList(res, account || '');
    return new Response(body, {
      headers: {
        ...toRecord(res.headers),
        'is-cache': 'false',
        'is-response-expired': `${isResponseExpired}`,
        'is-force': `${isForce}`,
      },
    });
  }
  return new Response(matchedCacheResponse.body, {
    status: 200,
    statusText: 'ok',
    headers: {
      ...matchedCacheResponse.headers,
      'is-cache': 'true',
    },
  });
};

export const handleLogin = async (request: ParsedRequest, response: ParsedResponse) => {
  const fullUrl = DOMAIN + request.rawPath;
  if (!fullUrl.endsWith('/api/users/login')) return true;
  const loginData = JSON.parse(request.body || '{}') as { account: string; password: string };
  const res = await toFetch(request, '*');
  response.statusCode = res.status;
  response.headers = toRecord(res.headers);
  response.body = await res.text();
  response.isBase64Encoded = false;
  response.setCookie = {
    ...Cookie.parseSetCookie(res.headers.getSetCookie()),
    account: loginData.account,
    token: res.headers.get('account-token') || '',
  };
  return false;
};
// http://175.27.166.226/api/users/logout
export const handleLogout = async (request: ParsedRequest, response: ParsedResponse) => {
  const fullUrl = DOMAIN + request.rawPath;
  if (!fullUrl.endsWith('/api/users/logout')) return true;
  const syncData = await getOssData();
  const accountList = syncData?.accountList || [];
  const cookieData = request.cookie;
  const account = cookieData?.account;
  const isValidAccount = accountList.some((item) => item.account === account);
  // 账号登出
  const res = await toFetch(request, '*', { isForce: isValidAccount ? false : true });
  const text = await res.text();
  response.statusCode = res.status;
  response.headers = toRecord(res.headers);
  response.setCookie = {
    account: request.cookie.account || '',
    ...Cookie.parseSetCookie(res.headers.getSetCookie()),
  };
  response.body = text;
  if (isValidAccount) {
    updateOssAccount(account, '');
  }
  return false;
};

// http://proxy-test.fcv3.1048992591952509.cn-hangzhou.fc.devsapp.net/api/userConfig/getMyConfig
// http://proxy-test.fcv3.1048992591952509.cn-hangzhou.fc.devsapp.net/api/userConfig/update/db61981b-34de-4c19-946f-1824afc9c5b0
export const handleSetting = async (request: ParsedRequest, response: ParsedResponse) => {
  const fullUrl = DOMAIN + request.rawPath;
  const isGetConfig = fullUrl.includes('/api/userConfig/getMyConfig');
  const isUpdateConfig = fullUrl.includes('/api/userConfig/update');
  if (!isGetConfig && !isUpdateConfig) return true;
  if (isUpdateConfig) {
    const res = await toFetch(request, '*');
    response.headers = toRecord(res.headers);
    response.setCookie = {
      ...Cookie.parseSetCookie(res.headers.getSetCookie()),
      account: request.cookie.account || '',
      token: request.cookie.token || '',
    };
    response.statusCode = res.status;
    response.isBase64Encoded = false;
    response.body = await res.text();
    // 更新getMyConfig缓存请求
    const matchedCacheResponse = await getOssResponse({ ...request, rawPath: '/api/userConfig/getMyConfig' }, request.cookie.account);
    if (!matchedCacheResponse) return;
    const body = JSON.stringify({ ...JSON.parse(matchedCacheResponse.body), ...JSON.parse(response.body) });
    const res2 = new Response(body, {
      headers: matchedCacheResponse.headers,
    });
    await updateOssResponseList(res2, request.cookie.account);
    return false;
  }
  // 获取配置
  const res = await toFetch(request, request.cookie.account ?? '*');
  response.headers = toRecord(res.headers);
  response.setCookie = {
    ...Cookie.parseSetCookie(res.headers.getSetCookie()),
    account: request.cookie.account || '',
    token: request.cookie.token || '',
  };
  response.statusCode = res.status;
  response.isBase64Encoded = false;
  response.body = await res.text();
  return false;
};

// 其他请求全部透传
export const handleOtherApi = async (request: ParsedRequest, response: ParsedResponse) => {
  const res = await toFetch(request, '*');
  response.headers = toRecord(res.headers);
  response.setCookie = {
    ...Cookie.parseSetCookie(res.headers.getSetCookie()),
    account: request.cookie.account || '',
    token: request.cookie.token || '',
  };
  response.statusCode = res.status;
  response.isBase64Encoded = false;
  response.body = await res.text();

  return false;
};

export const handleStatic = async (req: ParsedRequest, response: ParsedResponse) => {
  const fullUrl = DOMAIN + req.rawPath;
  const parsedUrl = new URL('', fullUrl);
  if (req.method !== 'get') {
    return true;
  }
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '') {
    const res = await toFetch(req, '*', { withCertification: false });
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
    if (['.js', '.css', '.woff'].includes(matchedItem.ext)) {
      const res = await toFetch(req, '*', { withCertification: false });
      response.statusCode = res.status;
      response.headers = toRecord(res.headers);
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
