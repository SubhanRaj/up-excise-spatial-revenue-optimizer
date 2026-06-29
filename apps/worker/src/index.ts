import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HonoEnv } from './types.js';
import { uploadRouter } from './routes/upload.js';
import { districtsRouter } from './routes/districts.js';
import { adminRouter } from './routes/admin.js';
import { webhooksRouter } from './routes/webhooks.js';
import { handleCron } from './routes/cron.js';

const app = new Hono<HonoEnv>();

app.use('*', cors({
  origin: ['https://up-excise-portal.shubhanraj2002.workers.dev', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/api/healthz', (c) => c.text('OK'));
app.route('/api/upload', uploadRouter);
app.route('/api/districts', districtsRouter);
app.route('/api/admin', adminRouter);
app.route('/api/webhooks', webhooksRouter);

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: HonoEnv['Bindings']) => {
    await handleCron(env);
  },
};
