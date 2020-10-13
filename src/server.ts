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
  const { id, url, headers } = req.body;

  const proxySession = session.fromPartition(id);

  const response: any = await request({ proxySession, opts: { url, headers }});

  const cookies = response.headers['set-cookie'];

  if (!cookies?.length) {
    return res.status(400).json({ success: false });
  }

  return res.status(200).json({ success: true, cookies });
});

app.post(
  '/sensor',
  async (req: any, res: any) => {
    const { id, url, headers, body } = req.body;

    const proxySession = session.fromPartition(id);

    const response: any = await request({ proxySession, opts: { url, method: 'POST', headers, body }});

    const resCookie = response.headers['set-cookie'];

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
