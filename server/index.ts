import { Hono } from 'hono';
import { cors } from 'hono/cors';
import './db';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import contestsRoutes from './routes/contests';
import submissionsRoutes from './routes/submissions';
import recurringRoutes from './routes/recurring';
import { startPoller } from './poller';
import { startScheduler } from './scheduler';

const app = new Hono();

app.use('*', cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

app.route('/api/auth',        authRoutes);
app.route('/api/users',       usersRoutes);
app.route('/api/contests',    contestsRoutes);
app.route('/api/submissions', submissionsRoutes);
app.route('/api/recurring',   recurringRoutes);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on http://localhost:${port}`);

// AtCoder Problems の定期ポーリング開始（スクリプト未導入でも反映されるように）
startPoller();

// 定期コンテストのスケジューラ開始（開始前日に各回を自動生成）
startScheduler();

export default { port, fetch: app.fetch };
