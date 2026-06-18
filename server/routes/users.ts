import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import db from '../db';
import { getUserPerfHistory } from './contests';
import { computeRating } from '../rating';

const app = new Hono();

// セッションからtraqIdを取得するヘルパー
const getTraqId = (sessionId: string | undefined): string | null => {
  if (!sessionId) return null;
  const row = db.query<{ traq_id: string }, [string]>(
    'SELECT traq_id FROM sessions WHERE id = ?',
  ).get(sessionId);
  return row?.traq_id ?? null;
};

// POST /api/users/register  { atcoderId: string }
app.post('/register', async (c) => {
  const traqId = getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const { atcoderId } = await c.req.json<{ atcoderId: string }>();
  if (!atcoderId) return c.json({ error: 'atcoderId is required' }, 400);

  db.run(
    'INSERT OR REPLACE INTO users (traq_id, atcoder_id) VALUES (?, ?)',
    [traqId, atcoderId],
  );

  return c.json({ ok: true, traqId, atcoderId });
});

// GET /api/users/rating → ログイン中ユーザーの virtualABC 独自レーティング
// 参加して終了したコンテストの perf 履歴から算出する（AtCoderの実レートは使わない）。
app.get('/rating', (c) => {
  const traqId = getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const perfs = getUserPerfHistory(traqId); // 最新が先頭
  const rating = computeRating(perfs);
  return c.json({ rating, contests: perfs.length });
});

export default app;
