import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import db from '../db';
import {
  COLORS,
  generateByColor,
  generateManual,
  generateRandom,
  type ColorKey,
  type GeneratedProblem,
} from '../atcoder';
import { notifyContestCreated } from '../notify';

const app = new Hono();

const getTraqId = (sessionId: string | undefined): string | null => {
  if (!sessionId) return null;
  const row = db.query<{ traq_id: string }, [string]>(
    'SELECT traq_id FROM sessions WHERE id = ?',
  ).get(sessionId);
  return row?.traq_id ?? null;
};

const randomId = (): string => {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
};

const VALID_COLORS = new Set(COLORS.map((c) => c.key));

type CreateBody = {
  title?: string;
  mode: 'random' | 'color' | 'manual';
  count?: number;                              // random用
  colorSpec?: Partial<Record<ColorKey, number>>; // color用
  urls?: string[];                             // manual用（問題URLのリスト）
  startAt?: string;                            // ISO8601 開始日時
  durationMinutes?: number;                    // 実施時間（分）
};

// POST /api/contests → コンテスト作成（問題セット生成）
app.post('/', async (c) => {
  const traqId = getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  let body: CreateBody;
  try {
    body = await c.req.json<CreateBody>();
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }

  // 開催日時・実施時間のバリデーション
  const startDate = body.startAt ? new Date(body.startAt) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) {
    return c.json({ error: 'invalid startAt' }, 400);
  }
  const duration = Math.floor(Number(body.durationMinutes));
  if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
    return c.json({ error: 'invalid durationMinutes (1-1440)' }, 400);
  }
  const startAtIso = startDate.toISOString();

  let problems: GeneratedProblem[];
  try {
    if (body.mode === 'random') {
      const count = Math.min(Math.max(Number(body.count) || 0, 1), 12);
      problems = await generateRandom(count);
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
      problems = await generateByColor(spec);
    } else if (body.mode === 'manual') {
      const urls = (body.urls ?? []).map((u) => u.trim()).filter(Boolean);
      if (urls.length === 0) return c.json({ error: 'no urls' }, 400);
      if (urls.length > 12) return c.json({ error: 'too many problems (max 12)' }, 400);
      problems = await generateManual(urls);
      if (problems.length !== urls.length) {
        return c.json({ error: 'AtCoderの問題URLとして認識できない行があります' }, 400);
      }
    } else {
      return c.json({ error: 'invalid mode' }, 400);
    }
  } catch (e) {
    console.error('[contests] problem generation failed:', e);
    return c.json({ error: 'failed to generate problems' }, 502);
  }

  if (problems.length === 0) {
    return c.json({ error: 'no problems matched' }, 400);
  }

  const id = randomId();
  const title = (body.title?.trim() || `Virtual ABC ${new Date().toLocaleDateString('ja-JP')}`).slice(0, 100);

  const insertContest = db.prepare(
    'INSERT INTO contests (id, title, mode, created_by, start_at, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertProblem = db.prepare(
    `INSERT INTO contest_problems
       (contest_id, idx, problem_id, atcoder_contest, problem_index, title, difficulty, color, url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    insertContest.run(id, title, body.mode, traqId, startAtIso, duration);
    problems.forEach((p, i) => {
      insertProblem.run(
        id, i, p.id, p.contest_id, p.problem_index, p.title, p.difficulty, p.color, p.url,
      );
    });
  });
  tx();

  // traQへ通知（ベストエフォート）
  void notifyContestCreated({
    id, title,
    startAt: startAtIso,
    durationMinutes: duration,
    problemCount: problems.length,
    createdBy: traqId,
  });

  return c.json({ id, title, mode: body.mode, startAt: startAtIso, durationMinutes: duration, problems });
});

// GET /api/contests → 一覧（新しい順）
app.get('/', (c) => {
  const rows = db.query<
    { id: string; title: string; mode: string; created_by: string; created_at: string; start_at: string | null; duration_minutes: number | null; problem_count: number },
    []
  >(`
    SELECT c.id, c.title, c.mode, c.created_by, c.created_at,
           c.start_at, c.duration_minutes,
           COUNT(p.idx) AS problem_count
    FROM contests c
    LEFT JOIN contest_problems p ON p.contest_id = c.id
    GROUP BY c.id
    ORDER BY c.start_at DESC
  `).all();
  return c.json({ contests: rows });
});

// GET /api/contests/:id → 詳細（問題セット込み）
app.get('/:id', (c) => {
  const id = c.req.param('id');
  const contest = db.query<
    { id: string; title: string; mode: string; created_by: string; created_at: string; start_at: string | null; duration_minutes: number | null },
    [string]
  >('SELECT id, title, mode, created_by, created_at, start_at, duration_minutes FROM contests WHERE id = ?').get(id);
  if (!contest) return c.json({ error: 'not found' }, 404);

  const problems = db.query<
    { idx: number; problem_id: string; atcoder_contest: string; problem_index: string; title: string; difficulty: number | null; color: string | null; url: string },
    [string]
  >(`
    SELECT idx, problem_id, atcoder_contest, problem_index, title, difficulty, color, url
    FROM contest_problems WHERE contest_id = ? ORDER BY idx
  `).all(id);

  return c.json({ contest, problems });
});

// DELETE /api/contests/:id → 作成者のみ削除可能
app.delete('/:id', (c) => {
  const traqId = getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const row = db.query<{ created_by: string }, [string]>(
    'SELECT created_by FROM contests WHERE id = ?',
  ).get(id);
  if (!row) return c.json({ error: 'not found' }, 404);
  if (row.created_by !== traqId) return c.json({ error: 'forbidden' }, 403);

  const tx = db.transaction(() => {
    db.run('DELETE FROM contest_problems WHERE contest_id = ?', [id]);
    db.run('DELETE FROM participants WHERE contest_id = ?', [id]);
    db.run('DELETE FROM contests WHERE id = ?', [id]);
  });
  tx();

  return c.json({ ok: true });
});

export default app;
