import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import db from '../db';
import { COLORS, type ColorKey } from '../atcoder';
import { randomId } from '../contests-core';
import { scheduleTick } from '../scheduler';
import { isAdmin } from '../admin';

const app = new Hono();

const getTraqId = (sessionId: string | undefined): string | null => {
  if (!sessionId) return null;
  const row = db.query<{ traq_id: string }, [string]>(
    'SELECT traq_id FROM sessions WHERE id = ?',
  ).get(sessionId);
  return row?.traq_id ?? null;
};

const VALID_COLORS = new Set(COLORS.map((c) => c.key));

type RecurringRow = {
  id: string;
  title: string;
  freq: string;
  weekday: number | null;
  hour: number;
  minute: number;
  duration_minutes: number;
  mode: string;
  count: number | null;
  color_spec: string | null;
  rated: number;
  enabled: number;
  created_by: string;
  created_at: string;
};

type CreateBody = {
  title?: string;
  freq: 'daily' | 'weekly';
  weekday?: number;                               // weekly用 0=日..6=土
  hour: number;
  minute: number;
  durationMinutes: number;
  mode: 'random' | 'color';
  count?: number;                                 // random用
  colorSpec?: Partial<Record<ColorKey, number>>;  // color用
  rated?: boolean;                                // レート変動（adminのみ有効）
};

// GET /api/recurring → 設定一覧（新しい順）
app.get('/', (c) => {
  const rows = db.query<RecurringRow, []>(
    `SELECT id, title, freq, weekday, hour, minute, duration_minutes, mode, count, color_spec, rated, enabled, created_by, created_at
     FROM recurring_contests ORDER BY created_at DESC`,
  ).all();
  return c.json({ recurring: rows });
});

// POST /api/recurring → 定期コンテスト設定を作成
app.post('/', async (c) => {
  const traqId = getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  let body: CreateBody;
  try {
    body = await c.req.json<CreateBody>();
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }

  if (body.freq !== 'daily' && body.freq !== 'weekly') {
    return c.json({ error: 'invalid freq' }, 400);
  }
  let weekday: number | null = null;
  if (body.freq === 'weekly') {
    weekday = Math.floor(Number(body.weekday));
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return c.json({ error: 'invalid weekday (0-6)' }, 400);
    }
  }
  const hour = Math.floor(Number(body.hour));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return c.json({ error: 'invalid hour (0-23)' }, 400);
  }
  const minute = Math.floor(Number(body.minute));
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return c.json({ error: 'invalid minute (0-59)' }, 400);
  }
  const duration = Math.floor(Number(body.durationMinutes));
  if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
    return c.json({ error: 'invalid durationMinutes (1-1440)' }, 400);
  }

  let count: number | null = null;
  let colorSpecJson: string | null = null;
  if (body.mode === 'random') {
    count = Math.min(Math.max(Number(body.count) || 0, 1), 12);
  } else if (body.mode === 'color') {
    const spec: Partial<Record<ColorKey, number>> = {};
    let total = 0;
    for (const [k, v] of Object.entries(body.colorSpec ?? {})) {
      if (!VALID_COLORS.has(k as ColorKey)) continue;
      const n = Math.max(Number(v) || 0, 0);
      if (n > 0) { spec[k as ColorKey] = n; total += n; }
    }
    if (total === 0) return c.json({ error: 'no colors specified' }, 400);
    if (total > 12) return c.json({ error: 'too many problems (max 12)' }, 400);
    colorSpecJson = JSON.stringify(spec);
  } else {
    return c.json({ error: 'invalid mode' }, 400);
  }

  const id = randomId();
  const title = (body.title?.trim() || '定期バーチャルコンテスト').slice(0, 100);
  // レート変動はadminのみ。非adminの指定は無視してfalse扱い。
  const rated = body.rated === true && isAdmin(traqId);

  db.run(
    `INSERT INTO recurring_contests
       (id, title, freq, weekday, hour, minute, duration_minutes, mode, count, color_spec, rated, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, title, body.freq, weekday, hour, minute, duration, body.mode, count, colorSpecJson, rated ? 1 : 0, traqId],
  );

  // 既に開始24h以内に該当する回があれば即時生成されるよう一度走らせる
  void scheduleTick();

  return c.json({ id });
});

// PATCH /api/recurring/:id → 有効/無効の切り替え（作成者のみ）
app.patch('/:id', async (c) => {
  const traqId = getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const row = db.query<{ created_by: string }, [string]>(
    'SELECT created_by FROM recurring_contests WHERE id = ?',
  ).get(id);
  if (!row) return c.json({ error: 'not found' }, 404);
  if (row.created_by !== traqId) return c.json({ error: 'forbidden' }, 403);

  let body: { enabled?: boolean };
  try {
    body = await c.req.json<{ enabled?: boolean }>();
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }
  if (typeof body.enabled !== 'boolean') return c.json({ error: 'invalid enabled' }, 400);

  db.run('UPDATE recurring_contests SET enabled = ? WHERE id = ?', [body.enabled ? 1 : 0, id]);
  if (body.enabled) void scheduleTick();
  return c.json({ ok: true });
});

// DELETE /api/recurring/:id → 設定削除（作成者のみ）。生成済みコンテストは残す。
app.delete('/:id', (c) => {
  const traqId = getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const row = db.query<{ created_by: string }, [string]>(
    'SELECT created_by FROM recurring_contests WHERE id = ?',
  ).get(id);
  if (!row) return c.json({ error: 'not found' }, 404);
  if (row.created_by !== traqId) return c.json({ error: 'forbidden' }, 403);

  db.run('DELETE FROM recurring_contests WHERE id = ?', [id]);
  return c.json({ ok: true });
});

export default app;
