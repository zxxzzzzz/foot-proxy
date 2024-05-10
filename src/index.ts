import { Request, Response } from './type';
import { handleLogin, handleLogout, handleOtherApi, handleStatic } from './server';

const pipe = async (event, context, callback, funcList: ((req: Request, res: Response) => Promise<boolean>)[]) => {
  const request = JSON.parse(event.toString());
  if (request.headers['Content-Type'] === 'application/json') {
    request.body = JSON.parse(request.body);
  }
  const response: Response = {
    statusCode: 400,
    headers: {},
    isBase64Encoded: false,
    body: '',
  };
  try {
    for (const func of funcList) {
      const isContinue = await func(request, response);
      if (!isContinue) break;
    }
  } catch (error) {
    callback(null, { statusCode: 405, body: error.message });
  }
  callback(null, response);
};

export const data = (_event, content, callback) => {
  pipe(_event, content, callback, [handleStatic, handleLogin, handleLogout, handleOtherApi]);
};
