/* eslint-disable no-param-reassign */
import { net, IncomingMessage, session, Session } from 'electron';

const defaults = {
  timeout: 15000,
  method: 'GET'
};

export type Response = {
  statusCode: number;
  headers: {
    [key: string]: any
  },
  body?: string;
  request: {
    uri: {
      href: string;
    }
  }
}

type Options = {
  url: string;
  method?: string;
  headers?: {
    [key: string]: string;
  };
  proxy?: string;
  encoding?:
    | 'utf8'
    | 'ascii'
    | 'utf-8'
    | 'utf16le'
    | 'ucs2'
    | 'ucs-2'
    | 'base64'
    | 'latin1'
    | 'binary'
    | 'hex'
    | undefined
    | null;
  useSessionCookies?: boolean;
  timeout?: number;
  followRedirect?: boolean;
  followAllRedirects?: boolean;
  body?: any;
  form?: any;
  json?: any;
};

type props = {
  proxySession?: Session;
  opts: Options;
}

export const request = ({ proxySession, opts }: props) => {
  const {
    url,
    headers,
    proxy,
    encoding = 'utf8',
    timeout = 15000,
    useSessionCookies = true,
    followRedirect = false,
    followAllRedirects = false,
    body,
    form,
    json
  } = opts;

  return new Promise((resolve, reject) => {
    try {
      const options: any = {
        ...defaults,
        ...opts,
        session: proxySession,
        useSessionCookies,
        redirect: followAllRedirects || followRedirect ? 'follow' : 'manual',
        cache: false
      };

      const request = net.request(options);

      if (headers) {
        Object.entries(headers).map(([key, value]) => {
          if (key) {
            return request.setHeader(key, value);
          }

          return null;
        });
      }

      if (json && typeof json !== 'boolean') {
        request.write(JSON.stringify(json));
      }

      if (body) {
        request.write(body);
      }

      if (form) {
        request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        if (typeof form === 'string') {
          request.write(form);
        } else {
          // assume it's an objectified form
          const body = Object.entries(form)
            .map(
              ([key, value]: [any, any]) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
            )
            .join('&');
          request.write(body);
        }
      }

      request.on('error', err => {
        return reject(err);
      });

      request.on('login', (_, callback) => {
        if (proxy) {
          const [username, password] = proxy
            .split('@')[0]
            .split('http://')[1]
            .split(':');

          callback(username, password);
        }
      });

      let currentUrl: string = url; // no redirect - set as initial URL
      let respBody: any; // empty body (UTF-8) - can be buffer or string in some cases
      let bufferBody: Buffer; // buffered body
      let redirects: boolean = false; // follow redirects?
      let buffers: Buffer[] = []; // list of Buffers
      let bufferLength: number = 0;
      if (followRedirect || followAllRedirects) {
        redirects = true;
      }

      setTimeout(() => {
        try {
          // only if we haven't started receiving a response, time out the request
          if (bufferLength === 0) {
            request.abort();
          }
        } catch (e) {
          // Silently let it fail
        }
        return reject(new Error('net::ERR_TIMED_OUT'));
      }, timeout);

      request.on('response', async (response: IncomingMessage) => {
        response.on('error', (error: Error) => {
          return reject(error);
        });

        response.on('end', () => {
          if (bufferLength) {
            bufferBody = Buffer.concat(buffers, bufferLength);
            if (encoding !== null) {
              respBody = bufferBody.toString(encoding);
            } else {
              respBody = bufferBody;
            }

            buffers = [];
            bufferLength = 0;
          }

          if (json) {
            // Try to parse the body
            try {
              respBody = JSON.parse(respBody);
            } catch (e) {
              // Silently fail, it's not parseable
            }
          }

          if (response.headers?.location) {
            [response.headers.location] = response.headers.location as any;
          }

          return resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: respBody,
            request: {
              uri: {
                href: currentUrl
              }
            }
          });
        });

        response.on('data', chunk => {
          bufferLength += chunk.length;
          buffers.push(chunk);
        });
      });

      request.on('redirect', (statusCode, _, redirectUrl, responseHeaders) => {
        if (redirects !== false) {
          currentUrl = redirectUrl;
          request.followRedirect();
        } else {

          request.abort();
          // patch in respBody to avoid TypeError
          respBody = `<html><body>You are being <a href="${redirectUrl}">redirected</a>.</body></html>`;

          if (responseHeaders.location) {
            [responseHeaders.location] = responseHeaders.location as any;
          }

          return resolve({
            statusCode,
            headers: responseHeaders,
            body: respBody,
            request: {
              uri: {
                href: currentUrl
              }
            }
          });
        }
      });

      request.end();
    } catch (err) {
      return reject(new Error('Unknown error'));
    }
  });
};
