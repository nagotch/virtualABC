import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { dbGet, dbRun } from '../db';
import { getUserPerfHistory } from './contests';
import { computeRating } from '../rating';

const app = new Hono();

// セッションからtraqIdを取得するヘルパー
const getTraqId = async (sessionId: string | undefined): Promise<string | null> => {
  if (!sessionId) return null;
  const row = await dbGet<{ traq_id: string }>(
    'SELECT traq_id FROM sessions WHERE id = ?', [sessionId],
  );
  return row?.traq_id ?? null;
};

// POST /api/users/register  { atcoderId: string }
app.post('/register', async (c) => {
  const traqId = await getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const { atcoderId } = await c.req.json<{ atcoderId: string }>();
  if (!atcoderId) return c.json({ error: 'atcoderId is required' }, 400);

  await dbRun(
    'REPLACE INTO users (traq_id, atcoder_id) VALUES (?, ?)',
    [traqId, atcoderId],
  );

  return c.json({ ok: true, traqId, atcoderId });
});

// GET /api/users/rating → ログイン中ユーザーの nagotch_virtual 独自レーティング
// 参加して終了したコンテストの perf 履歴から算出する（AtCoderの実レートは使わない）。
app.get('/rating', async (c) => {
  const traqId = await getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const perfs = await getUserPerfHistory(traqId); // 最新が先頭
  const rating = computeRating(perfs);
  return c.json({ rating, contests: perfs.length });
});

export default app;
