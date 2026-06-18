import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import db from '../db';

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

type HistoryEntry = { IsRated: boolean; NewRating: number };

// 指定AtCoder IDの現在のレーティングを取得（最後のRated参加結果）
// exists: AtCoderにそのユーザーが存在するか
// rating: 現在のレート（Rated参加歴がなければ null）
const fetchRating = async (
  atcoderId: string,
): Promise<{ exists: boolean; rating: number | null }> => {
  const res = await fetch(
    `https://atcoder.jp/users/${encodeURIComponent(atcoderId)}/history/json`,
  );
  if (res.status === 404) return { exists: false, rating: null };
  if (!res.ok) throw new Error(`AtCoder history fetch failed: ${res.status}`);
  const history = await res.json() as HistoryEntry[];
  const rated = history.filter((h) => h.IsRated);
  if (rated.length === 0) return { exists: true, rating: null };
  return { exists: true, rating: rated[rated.length - 1].NewRating };
};

// GET /api/users/rating → ログイン中ユーザーの現在のAtCoderレーティング
app.get('/rating', async (c) => {
  const traqId = getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const row = db.query<{ atcoder_id: string }, [string]>(
    'SELECT atcoder_id FROM users WHERE traq_id = ?',
  ).get(traqId);
  if (!row?.atcoder_id) return c.json({ error: 'atcoder id not registered' }, 404);

  try {
    const { exists, rating } = await fetchRating(row.atcoder_id);
    return c.json({ atcoderId: row.atcoder_id, exists, rating });
  } catch (e) {
    console.error('[users] failed to fetch rating:', e);
    return c.json({ error: 'failed to fetch rating' }, 502);
  }
});

export default app;
