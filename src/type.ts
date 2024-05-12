export type Request = {
  version: string;
  rawPath: string;
  body: string;
  isBase64Encoded: boolean;
  headers: {
    [key: string]: string;
  };
  queryParameters: {
    [key: string]: string;
  };
  requestContext: {
    accountId: '123456*********';
    domainName: '<http-trigger-id>.<region-id>.fcapp.run';
    domainPrefix: '<http-trigger-id>';
    http: {
      method: string;
      path: string;
      protocol: 'HTTP/1.1';
      sourceIp: '11.11.11.**';
      userAgent: string;
    };
    requestId: '1-64f6cd87-*************';
    time: '2023-09-05T06:41:11Z';
    timeEpoch: '1693896071895';
  };
};
export type ParsedRequest = {
  rawPath: string;
  body: string;
  isBase64Encoded: boolean;
  Cookie: { [k: string]: string };
  headers: {
    [key: string]: string;
  };
  method: string;
};

export type Response = {
  statusCode: number;
  headers: {
    [key: string]: string;
  };
  isBase64Encoded?: boolean;
  body: string;
};
export type ParsedResponse = {
  statusCode: number;
  'Set-Cookie': { [key: string]: string };
  headers: {
    [key: string]: string;
  };
  isBase64Encoded?: boolean;
  body: string;
};
