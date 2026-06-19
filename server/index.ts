import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { initDb } from './db';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import contestsRoutes from './routes/contests';
import submissionsRoutes from './routes/submissions';
import recurringRoutes from './routes/recurring';
import { startPoller } from './poller';
import { startScheduler } from './scheduler';

const app = new Hono();

// フロントのオリジン。本番は Path Overlay で同一オリジンになるためCORSは実質不要だが、
// 開発時(:5173→:3000)のクロスオリジンと、別ホスト配置時のために許可元を環境変数で持つ。
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

app.use('*', cors({
  origin: APP_URL,
  credentials: true,
}));

app.route('/api/auth',        authRoutes);
app.route('/api/users',       usersRoutes);
app.route('/api/contests',    contestsRoutes);
app.route('/api/submissions', submissionsRoutes);
app.route('/api/recurring',   recurringRoutes);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

const port = Number(process.env.PORT ?? 3000);

// スキーマ初期化を待ってからポーリング/スケジューラを開始する。
// （MariaDB はネットワーク越しの非同期接続なので起動時に一度だけ用意する）
await initDb();
console.log(`Server running on http://localhost:${port}`);

// AtCoder Problems の定期ポーリング開始（スクリプト未導入でも反映されるように）
startPoller();

// 定期コンテストのスケジューラ開始（開始前日に各回を自動生成）
startScheduler();

export default { port, fetch: app.fetch };
