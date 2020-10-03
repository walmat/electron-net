import express from 'express';
import { v4 } from 'uuid';
import { createServer } from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';

import { request, Response } from './request';
import { session } from 'electron';

const app = express();

const server = createServer(app);

app.use(cors());

app.use(
  bodyParser.json({
    limit: '100kb'
  })
);

app.get('/status', (req, res) => {
  res.status(200).json({ success: true });
})

app.post('/initial', async (req, res) => {
  const { url, headers } = req.body;

  const response: any = await request({ proxySession: session.defaultSession, opts: { url, headers }});

  const cookies = response.headers['set-cookie'];

  if (!cookies?.length) {
    return res.status(400).json({ success: false });
  }

  return res.status(200).json({ success: true, cookies });
});

app.post(
  '/sensor',
  async (req: any, res: any) => {
    const { url, site, cookies, headers, body } = req.body;

    const proxySession = session.fromPartition(v4());

    const promises = (cookies || []).map((cookie: string) => {
      const str = cookie.split(';')[0];
      
      if (/abck/i.test(str)) {
        const [, value] = str.split('_abck=');  
        return proxySession.cookies.set({ url: site, name: '_abck', value, secure: true });
      }

      const [name, value] = str.split('=');  
      return proxySession.cookies.set({ url: site, name, value });
    });

    await Promise.all(promises);

    const response: any = await request({ proxySession, opts: { url, method: 'POST', headers, body }});

    const resCookie = response.headers['set-cookie'];

    console.log(resCookie);

    await proxySession.clearStorageData();

    if (!resCookie?.length) {
      return res.status(400).json({ success: false });
    }

    return res.status(200).json({ success: true, cookies: resCookie });
  }
);

const serverOpts = {
  host: '0.0.0.0',
  port: 3030
};

server.listen(serverOpts, () => {
  app.on('shutdown', () => {
    process.exit(0);
  });

  console.info(`Server running on port 3030`);
});
