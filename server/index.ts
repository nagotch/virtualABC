import { Hono } from 'hono';
import { cors } from 'hono/cors';
import './db';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';

const app = new Hono();

app.use('*', cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

app.route('/api/auth',  authRoutes);
app.route('/api/users', usersRoutes);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on http://localhost:${port}`);

export default { port, fetch: app.fetch };
