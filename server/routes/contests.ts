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
       (contest_id, idx, problem_id, atcoder_contest, problem_index, title, difficulty, color, url, points)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    insertContest.run(id, title, body.mode, traqId, startAtIso, duration);
    problems.forEach((p, i) => {
      insertProblem.run(
        id, i, p.id, p.contest_id, p.problem_index, p.title, p.difficulty, p.color, p.url,
        (i + 1) * 100, // 配点: A=100, B=200, ...
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

// GET /api/contests/active-problems → 開催中コンテストに含まれる問題ID一覧
// （ユーザースクリプトの報告ボタン表示判定用）。:id より前に置くこと。
app.get('/active-problems', (c) => {
  const now = Date.now();
  const rows = db.query<
    { start_at: string | null; duration_minutes: number | null; problem_id: string },
    []
  >(`
    SELECT c.start_at, c.duration_minutes, p.problem_id
    FROM contests c JOIN contest_problems p ON p.contest_id = c.id
  `).all();

  const ids = new Set<string>();
  for (const r of rows) {
    if (!r.start_at) continue;
    const start = new Date(r.start_at).getTime();
    const end = start + (r.duration_minutes ?? 0) * 60_000;
    if (now >= start && now < end) ids.add(r.problem_id);
  }
  return c.json({ problemIds: [...ids] });
});

// GET /api/contests/:id → 詳細（問題セット込み）
app.get('/:id', (c) => {
  const id = c.req.param('id');
  const contest = db.query<
    { id: string; title: string; mode: string; created_by: string; created_at: string; start_at: string | null; duration_minutes: number | null },
    [string]
  >('SELECT id, title, mode, created_by, created_at, start_at, duration_minutes FROM contests WHERE id = ?').get(id);
  if (!contest) return c.json({ error: 'not found' }, 404);

  const participants = db.query<{ traq_id: string; atcoder_id: string }, [string]>(
    'SELECT traq_id, atcoder_id FROM participants WHERE contest_id = ?',
  ).all(id);

  // 問題一覧は「参加済み かつ 開催時間中」のときだけ返す（APIからの先読み防止）
  const traqId = getTraqId(getCookie(c, 'session'));
  const joined = !!traqId && participants.some((p) => p.traq_id === traqId);
  const now = Date.now();
  const start = contest.start_at ? new Date(contest.start_at).getTime() : null;
  const end = start !== null ? start + (contest.duration_minutes ?? 0) * 60_000 : null;
  const ongoing = start !== null && end !== null && now >= start && now < end;
  const canViewProblems = joined && ongoing;

  const problems = canViewProblems
    ? db.query<
        { idx: number; problem_id: string; atcoder_contest: string; problem_index: string; title: string; difficulty: number | null; color: string | null; url: string; points: number },
        [string]
      >(`
        SELECT idx, problem_id, atcoder_contest, problem_index, title, difficulty, color, url, points
        FROM contest_problems WHERE contest_id = ? ORDER BY idx
      `).all(id)
    : [];

  return c.json({ contest, problems, participants, canViewProblems });
});

// POST /api/contests/:id/join → 参加（AtCoder ID登録済みが必要）
app.post('/:id/join', (c) => {
  const traqId = getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const contest = db.query<{ id: string }, [string]>(
    'SELECT id FROM contests WHERE id = ?',
  ).get(id);
  if (!contest) return c.json({ error: 'not found' }, 404);

  const user = db.query<{ atcoder_id: string }, [string]>(
    'SELECT atcoder_id FROM users WHERE traq_id = ?',
  ).get(traqId);
  if (!user?.atcoder_id) return c.json({ error: 'atcoder id not registered' }, 400);

  db.run(
    'INSERT OR REPLACE INTO participants (contest_id, traq_id, atcoder_id) VALUES (?, ?, ?)',
    [id, traqId, user.atcoder_id],
  );
  standingsCache.delete(id);
  return c.json({ ok: true });
});

// POST /api/contests/:id/leave → 参加取り消し
app.post('/:id/leave', (c) => {
  const traqId = getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  db.run('DELETE FROM participants WHERE contest_id = ? AND traq_id = ?', [id, traqId]);
  standingsCache.delete(id);
  return c.json({ ok: true });
});

// GET /api/contests/:id/standings → 順位表（開催時間内の提出で集計）
app.get('/:id/standings', (c) => {
  const id = c.req.param('id');
  const standings = computeStandings(id);
  if (!standings) return c.json({ error: 'not found' }, 404);
  return c.json(standings);
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

// ---- 順位表の集計 ----
// 提出データはユーザースクリプト(reported_submissions)から取得する。
// 各参加者がAtCoderにログイン済みのブラウザで提出すると、スクリプトが結果を
// このサーバーに報告する。AtCoder Problemsのクロール遅延に依存しない。

const PENALTY_PER_WRONG = 5 * 60; // 1誤答あたり5分（秒）

// AtCoder Problemsのモデル: 内部レートxの人が難易度dを解く確率
//   P(solve | x, d) = 1 / (1 + 10^((d - x)/400))
const solveProb = (x: number, d: number): number => 1 / (1 + 10 ** ((d - x) / 400));

// 解いた/解けなかったパターンの尤度を最大化する x を三分探索で推定する。
// items: { d:difficulty, solved } の配列（difficultyが分かる問題のみ）。
// 1問も解いていない/解ける問題が無い場合は null。
const estimatePerformance = (
  items: { d: number; solved: boolean }[],
): number | null => {
  const solvedCount = items.filter((i) => i.solved).length;
  if (items.length === 0 || solvedCount === 0) return null;

  const logLik = (x: number): number => {
    let s = 0;
    for (const it of items) {
      const p = Math.min(Math.max(solveProb(x, it.d), 1e-9), 1 - 1e-9);
      s += it.solved ? Math.log(p) : Math.log(1 - p);
    }
    return s;
  };

  // 尤度は x について凹なので三分探索。探索範囲は問題の難易度レンジ±800に制限
  // （全完時に上限へ張り付くのを防ぎ、現実的な値にする）。
  const ds = items.map((i) => i.d);
  let lo = Math.min(...ds) - 800;
  let hi = Math.max(...ds) + 800;
  for (let i = 0; i < 60; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (logLik(m1) < logLik(m2)) lo = m1; else hi = m2;
  }
  return Math.round((lo + hi) / 2);
};

type ProblemResult = {
  solved: boolean;
  penalties: number;        // AC前の誤答数
  acTimeSeconds: number | null; // 開始からの相対秒
};
type StandingRow = {
  rank: number;
  traqId: string;
  atcoderId: string;
  perf: number | null;      // 推定パフォーマンス
  score: number;
  penaltySeconds: number;
  problems: Record<string, ProblemResult>;
};
type Standings = {
  contest: { id: string; title: string; start_at: string | null; duration_minutes: number | null };
  problems: { problem_id: string; problem_index: string; points: number; difficulty: number | null }[];
  rows: StandingRow[];
};

type ReportedSub = { submission_id: number; problem_id: string; result: string; epoch_second: number };

// 報告された提出はDBから即時に読めるのでキャッシュは不要だが、
// 提出報告時にキャッシュを無効化するための仕組みは維持する。
const standingsCache = new Map<string, { at: number; data: Standings }>();
const STANDINGS_TTL = 5 * 1000;

// あるAtCoder IDが参加するコンテストの順位表キャッシュを無効化
export const invalidateStandingsForAtcoder = (atcoderId: string): void => {
  const contestIds = db.query<{ contest_id: string }, [string]>(
    'SELECT contest_id FROM participants WHERE atcoder_id = ?',
  ).all(atcoderId);
  for (const { contest_id } of contestIds) standingsCache.delete(contest_id);
};

const computeStandings = (contestId: string): Standings | null => {
  const cached = standingsCache.get(contestId);
  if (cached && Date.now() - cached.at < STANDINGS_TTL) return cached.data;

  const contest = db.query<
    { id: string; title: string; start_at: string | null; duration_minutes: number | null },
    [string]
  >('SELECT id, title, start_at, duration_minutes FROM contests WHERE id = ?').get(contestId);
  if (!contest) return null;

  const problems = db.query<
    { problem_id: string; problem_index: string; points: number; difficulty: number | null },
    [string]
  >(
    'SELECT problem_id, problem_index, points, difficulty FROM contest_problems WHERE contest_id = ? ORDER BY idx',
  ).all(contestId);

  const participants = db.query<{ traq_id: string; atcoder_id: string }, [string]>(
    'SELECT traq_id, atcoder_id FROM participants WHERE contest_id = ?',
  ).all(contestId);

  const startUnix = contest.start_at ? Math.floor(new Date(contest.start_at).getTime() / 1000) : 0;
  const endUnix = startUnix + (contest.duration_minutes ?? 0) * 60;
  const problemIds = new Set(problems.map((p) => p.problem_id));
  const pointsOf = new Map(problems.map((p) => [p.problem_id, p.points]));

  // 同一秒の提出が複数あっても順序が定まるよう、時刻→提出IDの昇順で取得。
  // 各問題で先頭から最初のACを採用する＝一番早い提出を参照する。
  const querySubs = db.query<ReportedSub, [string, number, number]>(
    `SELECT submission_id, problem_id, result, epoch_second FROM reported_submissions
     WHERE atcoder_id = ? AND epoch_second BETWEEN ? AND ?
     ORDER BY epoch_second ASC, submission_id ASC`,
  );

  const rows: StandingRow[] = [];
  for (const part of participants) {
    const subs = querySubs.all(part.atcoder_id, startUnix, endUnix)
      .filter((s) => problemIds.has(s.problem_id));

    const byProblem = new Map<string, ReportedSub[]>();
    for (const s of subs) {
      (byProblem.get(s.problem_id) ?? byProblem.set(s.problem_id, []).get(s.problem_id)!).push(s);
    }
    // 念のため各問題の提出も時刻→IDで昇順に整列（一番早いものを先頭に）
    for (const list of byProblem.values()) {
      list.sort((a, b) => (a.epoch_second - b.epoch_second) || (a.submission_id - b.submission_id));
    }

    const pres: Record<string, ProblemResult> = {};
    let score = 0;
    let lastAcRel = 0;
    let totalPenalties = 0;
    for (const pid of problemIds) {
      const list = byProblem.get(pid) ?? [];
      let penalties = 0;
      let acTime: number | null = null;
      for (const s of list) {
        if (s.result === 'AC') { acTime = s.epoch_second - startUnix; break; }
        penalties++;
      }
      const solved = acTime !== null;
      pres[pid] = { solved, penalties, acTimeSeconds: acTime };
      if (solved) {
        score += pointsOf.get(pid) ?? 0;
        lastAcRel = Math.max(lastAcRel, acTime as number);
        totalPenalties += penalties;
      }
    }

    const penaltySeconds = score > 0 ? lastAcRel + PENALTY_PER_WRONG * totalPenalties : 0;

    // パフォーマンス推定: 難易度が分かる問題の解いた/解けなかったパターンから最尤推定。
    const items = problems
      .filter((p) => p.difficulty !== null)
      .map((p) => ({ d: p.difficulty as number, solved: pres[p.problem_id].solved }));
    let perf = estimatePerformance(items);
    // 速さによる小さな補正（±最大50）: 速く解いたほど高く。
    if (perf !== null && score > 0) {
      const durSec = (contest.duration_minutes ?? 0) * 60;
      if (durSec > 0) {
        const usedFrac = Math.min(1, penaltySeconds / durSec);
        perf += Math.round((0.5 - usedFrac) * 100);
      }
    }

    rows.push({
      rank: 0,
      traqId: part.traq_id,
      atcoderId: part.atcoder_id,
      score,
      penaltySeconds,
      perf,
      problems: pres,
    });
  }

  // 得点降順、同点はペナルティ昇順
  rows.sort((a, b) => (b.score - a.score) || (a.penaltySeconds - b.penaltySeconds));
  let rank = 0;
  let prev: { score: number; pen: number } | null = null;
  rows.forEach((r, i) => {
    if (!prev || r.score !== prev.score || r.penaltySeconds !== prev.pen) rank = i + 1;
    r.rank = rank;
    prev = { score: r.score, pen: r.penaltySeconds };
  });

  const data: Standings = { contest, problems, rows };
  standingsCache.set(contestId, { at: Date.now(), data });
  return data;
};

export default app;
