import { Request, Response } from './type';
import { handleLogin, handleLogout, handleOtherApi, handleStatic } from './server';

const pipe = async (event, context, callback, funcList: ((req: Request, res: Response) => Promise<boolean>)[]) => {
  const request = JSON.parse(event.toString());
  if (request.headers['Content-Type'] === 'application/json') {
    request.body = JSON.parse(request.body);
  }
  const response: Response = {
    statusCode: 405,
    headers: {},
    isBase64Encoded: false,
    body: '',
  };
  try {
    for (const func of funcList) {
      await func(request, response);
    }
  } catch (error) {
    callback(null, { statusCode: 405, body: error.message });
  }
  callback(null, response);
};

export const data = (_event, content, callback) => {
  pipe(_event, content, callback, [handleStatic, handleLogin, handleLogout, handleOtherApi]);
};
