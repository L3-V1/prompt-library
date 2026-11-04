import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

// Decisão 23: escuta apenas em loopback, sem autenticação.
const HOST = '127.0.0.1';
const PORT = 5174;

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

if (process.env['NODE_ENV'] === 'production') {
  app.use('/*', serveStatic({ root: './dist/web' }));
  app.get('*', serveStatic({ path: './dist/web/index.html' }));
}

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  console.log(`servidor em http://${info.address}:${info.port}`);
});
