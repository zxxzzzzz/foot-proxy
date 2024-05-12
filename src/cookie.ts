export const Cookie = {
  /**转化到set_cookie */
  stringifyToSetCookie: (key: string, value: string) => {
    return `${key}=${value};Path=/;httpOnly`;
  },
  /**转化set-cookie到obj*/
  parseSetCookie: (str: string | string[]) => {
    if (!str || !str?.length) return {};
    const strList: string[] = ([] as string[]).concat(str);
    return strList.reduce<{ [k: string]: string }>((re, cur) => {
      const itemStr = cur.split(';')[0];
      const [k, v] = itemStr.split('=');
      return {
        ...re,
        [k]: v,
      };
    }, {});
  },
  parseCookie: (str: string) => {
    if (!str) return {};
    return str.split(';').reduce((re, cur) => {
      const [k, v] = cur.split('=');
      return { ...re, [k.trim()]: v };
    }, {} as { [k: string]: string });
  },
};