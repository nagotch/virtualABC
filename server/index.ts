import { Hono } from 'hono';
import { cors } from 'hono/cors';
import './db'; // initialize DB on startup

const app = new Hono();

app.use('*', cors({ origin: 'http://localhost:5173' }));

app.get('/api/health', (c) => c.json({ status: 'ok' }));

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on http://localhost:${port}`);

export default { port, fetch: app.fetch };
