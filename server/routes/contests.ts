import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { dbAll, dbGet, dbRun, dbTx } from '../db';
import {
  COLORS,
  generateByColor,
  generateManual,
  generateRandom,
  type ColorKey,
  type GeneratedProblem,
} from '../atcoder';
import { createContest } from '../contests-core';
import { isAdmin } from '../admin';
import { computeRating } from '../rating';

const app = new Hono();

const getTraqId = async (sessionId: string | undefined): Promise<string | null> => {
  if (!sessionId) return null;
  const row = await dbGet<{ traq_id: string }>(
    'SELECT traq_id FROM sessions WHERE id = ?', [sessionId],
  );
  return row?.traq_id ?? null;
};

const VALID_COLORS = new Set(COLORS.map((c) => c.key));

// 開催状態の判定
const timingOf = (
  startAt: string | null,
  durationMinutes: number | null,
  now: number = Date.now(),
): { ongoing: boolean; upcoming: boolean; finished: boolean } => {
  const startMs = startAt ? new Date(startAt).getTime() : null;
  const endMs = startMs !== null ? startMs + (durationMinutes ?? 0) * 60_000 : null;
  return {
    upcoming: startMs !== null && now < startMs,
    ongoing: startMs !== null && endMs !== null && now >= startMs && now < endMs,
    finished: startMs === null || (endMs !== null && now >= endMs),
  };
};

type CreateBody = {
  title?: string;
  mode: 'random' | 'color' | 'manual';
  count?: number;                              // random用
  colorSpec?: Partial<Record<ColorKey, number>>; // color用
  urls?: string[];                             // manual用（問題URLのリスト）
  startAt?: string;                            // ISO8601 開始日時
  durationMinutes?: number;                    // 実施時間（分）
  rated?: boolean;                             // レート変動（adminのみ有効）
};

// POST /api/contests → コンテスト作成（問題セット生成）
app.post('/', async (c) => {
  const traqId = await getTraqId(getCookie(c, 'session'));
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

  const title = (body.title?.trim() || `nagotch_virtual ${new Date().toLocaleDateString('ja-JP')}`).slice(0, 100);

  // レート変動はadminのみ。非adminの指定は無視してfalse扱い。
  const rated = body.rated === true && isAdmin(traqId);

  const id = await createContest({
    title,
    mode: body.mode,
    problems,
    startAtIso,
    durationMinutes: duration,
    createdBy: traqId,
    rated,
  });

  return c.json({ id, title, mode: body.mode, startAt: startAtIso, durationMinutes: duration, rated, problems });
});

// GET /api/contests → 一覧（新しい順）
app.get('/', async (c) => {
  const rows = await dbAll<
    { id: string; title: string; mode: string; created_by: string; created_at: string; start_at: string | null; duration_minutes: number | null; rated: number; problem_count: number }
  >(`
    SELECT c.id, c.title, c.mode, c.created_by, c.created_at,
           c.start_at, c.duration_minutes, c.rated,
           COUNT(p.idx) AS problem_count
    FROM contests c
    LEFT JOIN contest_problems p ON p.contest_id = c.id
    GROUP BY c.id
    ORDER BY c.start_at DESC
  `);
  return c.json({ contests: rows });
});

// GET /api/contests/active-problems → 開催中コンテストに含まれる問題ID一覧
// （ユーザースクリプトの報告ボタン表示判定用）。:id より前に置くこと。
app.get('/active-problems', async (c) => {
  const now = Date.now();
  const rows = await dbAll<
    { start_at: string | null; duration_minutes: number | null; problem_id: string }
  >(`
    SELECT c.start_at, c.duration_minutes, p.problem_id
    FROM contests c JOIN contest_problems p ON p.contest_id = c.id
  `);

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
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const contest = await dbGet<
    { id: string; title: string; mode: string; created_by: string; created_at: string; start_at: string | null; duration_minutes: number | null; rated: number }
  >('SELECT id, title, mode, created_by, created_at, start_at, duration_minutes, rated FROM contests WHERE id = ?', [id]);
  if (!contest) return c.json({ error: 'not found' }, 404);

  const participants = await dbAll<{ traq_id: string; atcoder_id: string; rated: number }>(
    'SELECT traq_id, atcoder_id, rated FROM participants WHERE contest_id = ?', [id],
  );

  // 問題一覧は「参加済み かつ 開催時間中」のときだけ返す（APIからの先読み防止）
  const traqId = await getTraqId(getCookie(c, 'session'));
  const joined = !!traqId && participants.some((p) => p.traq_id === traqId);
  const now = Date.now();
  const start = contest.start_at ? new Date(contest.start_at).getTime() : null;
  const end = start !== null ? start + (contest.duration_minutes ?? 0) * 60_000 : null;
  const ongoing = start !== null && end !== null && now >= start && now < end;
  const canViewProblems = joined && ongoing;

  const problems = canViewProblems
    ? await dbAll<
        { idx: number; problem_id: string; atcoder_contest: string; problem_index: string; title: string; difficulty: number | null; color: string | null; url: string; points: number }
      >(`
        SELECT idx, problem_id, atcoder_contest, problem_index, title, difficulty, color, url, points
        FROM contest_problems WHERE contest_id = ? ORDER BY idx
      `, [id])
    : [];

  return c.json({ contest, problems, participants, canViewProblems });
});

// POST /api/contests/:id/join → 参加（AtCoder ID登録済みが必要）
// body: { rated?: boolean } … Rated参加 / Unrated(オープン)参加 を選べる（本家と同様）。
// レート対象になるのは「Ratedコンテスト かつ Rated参加」のときのみ。
app.post('/:id/join', async (c) => {
  const traqId = await getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const contest = await dbGet<{ id: string; start_at: string | null; duration_minutes: number | null; rated: number }>(
    'SELECT id, start_at, duration_minutes, rated FROM contests WHERE id = ?', [id],
  );
  if (!contest) return c.json({ error: 'not found' }, 404);

  const user = await dbGet<{ atcoder_id: string }>(
    'SELECT atcoder_id FROM users WHERE traq_id = ?', [traqId],
  );
  if (!user?.atcoder_id) return c.json({ error: 'atcoder id not registered' }, 400);

  let body: { rated?: boolean } = {};
  try { body = await c.req.json<{ rated?: boolean }>(); } catch { /* 本文なしは既定値で扱う */ }

  const { ongoing } = timingOf(contest.start_at, contest.duration_minutes);
  const existing = await dbGet<{ rated: number }>(
    'SELECT rated FROM participants WHERE contest_id = ? AND traq_id = ?', [id, traqId],
  );
  // コンテスト中は参加内容（Rated/Unrated）の変更を認めない
  if (existing && ongoing) {
    return c.json({ error: 'コンテスト中は参加内容を変更できません' }, 409);
  }

  // Rated参加できるのはRatedコンテストのときのみ。オープン参加(false)は常にUnrated。
  const rated = contest.rated === 1 && body.rated !== false ? 1 : 0;

  await dbRun(
    'REPLACE INTO participants (contest_id, traq_id, atcoder_id, rated) VALUES (?, ?, ?, ?)',
    [id, traqId, user.atcoder_id, rated],
  );
  clearStandings(id);
  return c.json({ ok: true, rated: rated === 1 });
});

// POST /api/contests/:id/leave → 参加取り消し（コンテスト中は不可）
app.post('/:id/leave', async (c) => {
  const traqId = await getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const contest = await dbGet<{ start_at: string | null; duration_minutes: number | null }>(
    'SELECT start_at, duration_minutes FROM contests WHERE id = ?', [id],
  );
  if (!contest) return c.json({ error: 'not found' }, 404);

  const { ongoing } = timingOf(contest.start_at, contest.duration_minutes);
  if (ongoing) return c.json({ error: 'コンテスト中は参加を取り消せません' }, 409);

  await dbRun('DELETE FROM participants WHERE contest_id = ? AND traq_id = ?', [id, traqId]);
  clearStandings(id);
  return c.json({ ok: true });
});

// GET /api/contests/:id/standings → 順位表
// 開催中: AtCoder Problems は未クロールのため、スクリプト報告を含む「予測順位」を返す。
// 終了後: AtCoder Problems API 由来(source='api')のみの「確定順位」を返す。
//         ただし終了直後でAPIが未取り込みの間は予測にフォールバックする。
app.get('/:id/standings', async (c) => {
  const id = c.req.param('id');
  const contest = await dbGet<{ start_at: string | null; duration_minutes: number | null }>(
    'SELECT start_at, duration_minutes FROM contests WHERE id = ?', [id],
  );
  if (!contest) return c.json({ error: 'not found' }, 404);

  const { ongoing } = timingOf(contest.start_at, contest.duration_minutes);
  let mode: StandingsMode = ongoing ? 'predicted' : 'official';
  if (mode === 'official') {
    const startUnix = contest.start_at ? Math.floor(new Date(contest.start_at).getTime() / 1000) : 0;
    const endUnix = startUnix + (contest.duration_minutes ?? 0) * 60;
    if (!(await hasApiSubmissions(id, startUnix, endUnix))) mode = 'predicted';
  }

  const standings = await computeStandings(id, mode);
  if (!standings) return c.json({ error: 'not found' }, 404);
  return c.json(standings);
});

// DELETE /api/contests/:id → 作成者のみ削除可能
app.delete('/:id', async (c) => {
  const traqId = await getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const row = await dbGet<{ created_by: string }>(
    'SELECT created_by FROM contests WHERE id = ?', [id],
  );
  if (!row) return c.json({ error: 'not found' }, 404);
  if (row.created_by !== traqId) return c.json({ error: 'forbidden' }, 403);

  await dbTx(async (conn) => {
    await conn.query('DELETE FROM contest_problems WHERE contest_id = ?', [id]);
    await conn.query('DELETE FROM participants WHERE contest_id = ?', [id]);
    await conn.query('DELETE FROM contests WHERE id = ?', [id]);
  });

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
  rated: boolean;           // Rated参加か（Unrated/オープン参加はfalse）
  perf: number | null;      // 推定パフォーマンス
  score: number;
  penaltySeconds: number;
  problems: Record<string, ProblemResult>;
};
export type Standings = {
  contest: { id: string; title: string; start_at: string | null; duration_minutes: number | null };
  problems: { problem_id: string; problem_index: string; points: number; difficulty: number | null }[];
  rows: StandingRow[];
  predicted: boolean;       // true=予測(スクリプト報告含む) / false=確定(AtCoder Problems由来のみ)
};

type ReportedSub = { submission_id: number; problem_id: string; result: string; epoch_second: number };

// 順位表の集計対象データソース:
// - 'official'  : AtCoder Problems API 由来(source='api')のみ。確定・不正不可。
// - 'predicted' : スクリプト報告(source='script')も含む。開催中のリアルタイム表示用＝予測。
type StandingsMode = 'official' | 'predicted';

// 報告された提出はDBから即時に読めるのでキャッシュは不要だが、
// 提出報告時にキャッシュを無効化するための仕組みは維持する。
// キーは `${contestId}:${mode}`（official/predictedで別キャッシュ）。
const standingsCache = new Map<string, { at: number; data: Standings }>();
const STANDINGS_TTL = 5 * 1000;

// 指定コンテストの順位表キャッシュ（official/predicted両方）を破棄
const clearStandings = (contestId: string): void => {
  standingsCache.delete(`${contestId}:official`);
  standingsCache.delete(`${contestId}:predicted`);
};

// あるAtCoder IDが参加するコンテストの順位表キャッシュを無効化
export const invalidateStandingsForAtcoder = async (atcoderId: string): Promise<void> => {
  const contestIds = await dbAll<{ contest_id: string }>(
    'SELECT contest_id FROM participants WHERE atcoder_id = ?', [atcoderId],
  );
  for (const { contest_id } of contestIds) clearStandings(contest_id);
};

export const computeStandings = async (
  contestId: string,
  mode: StandingsMode,
): Promise<Standings | null> => {
  const cacheKey = `${contestId}:${mode}`;
  const cached = standingsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < STANDINGS_TTL) return cached.data;

  const contest = await dbGet<
    { id: string; title: string; start_at: string | null; duration_minutes: number | null }
  >('SELECT id, title, start_at, duration_minutes FROM contests WHERE id = ?', [contestId]);
  if (!contest) return null;

  const problems = await dbAll<
    { problem_id: string; problem_index: string; points: number; difficulty: number | null }
  >(
    'SELECT problem_id, problem_index, points, difficulty FROM contest_problems WHERE contest_id = ? ORDER BY idx', [contestId],
  );

  const participants = await dbAll<{ traq_id: string; atcoder_id: string; rated: number }>(
    'SELECT traq_id, atcoder_id, rated FROM participants WHERE contest_id = ?', [contestId],
  );

  const startUnix = contest.start_at ? Math.floor(new Date(contest.start_at).getTime() / 1000) : 0;
  const endUnix = startUnix + (contest.duration_minutes ?? 0) * 60;
  const problemIds = new Set(problems.map((p) => p.problem_id));
  const pointsOf = new Map(problems.map((p) => [p.problem_id, p.points]));

  // official モードは AtCoder Problems 由来(source='api')のみを参照し、
  // スクリプト報告(予測・不正可能)を除外する。
  const sourceClause = mode === 'official' ? "AND source = 'api'" : '';

  const rows: StandingRow[] = [];
  for (const part of participants) {
    // 同一秒の提出が複数あっても順序が定まるよう、時刻→提出IDの昇順で取得。
    // 各問題で先頭から最初のACを採用する＝一番早い提出を参照する。
    const subs = (await dbAll<ReportedSub>(
      `SELECT submission_id, problem_id, result, epoch_second FROM reported_submissions
       WHERE atcoder_id = ? AND epoch_second BETWEEN ? AND ? ${sourceClause}
       ORDER BY epoch_second ASC, submission_id ASC`,
      [part.atcoder_id, startUnix, endUnix],
    )).filter((s) => problemIds.has(s.problem_id));

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
      rated: part.rated === 1,
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

  const data: Standings = { contest, problems, rows, predicted: mode === 'predicted' };
  standingsCache.set(cacheKey, { at: Date.now(), data });
  return data;
};

// 指定コンテストに AtCoder Problems 由来(source='api')の提出が取り込まれているか。
// 終了直後でAPIがまだクロールしていない場合は false（→予測表示にフォールバック）。
const hasApiSubmissions = async (
  contestId: string,
  startUnix: number,
  endUnix: number,
): Promise<boolean> => {
  const row = await dbGet<{ n: number }>(
    `SELECT COUNT(*) AS n FROM reported_submissions r
       JOIN participants p ON p.atcoder_id = r.atcoder_id AND p.contest_id = ?
      WHERE r.source = 'api' AND r.epoch_second BETWEEN ? AND ?`,
    [contestId, startUnix, endUnix],
  );
  return (row?.n ?? 0) > 0;
};

// 指定ユーザーが参加して「終了済み」コンテストの perf 履歴を返す（最新が先頭）。
// 0完(perfがnull)のコンテストは perf=0 として扱う。レーティング算出に使う。
// mode='official' は AtCoder Problems 由来(source='api')のみで集計＝確定レート用。
// mode='predicted' はスクリプト報告も含む＝予測レート用。
export const getUserPerfHistory = async (
  traqId: string,
  mode: StandingsMode,
): Promise<number[]> => {
  const now = Date.now();
  const contests = await dbAll<
    { id: string; start_at: string | null; duration_minutes: number | null }
  >(`
    SELECT c.id, c.start_at, c.duration_minutes
    FROM contests c JOIN participants p ON p.contest_id = c.id
    WHERE p.traq_id = ? AND c.rated = 1 AND p.rated = 1
    ORDER BY c.start_at DESC
  `, [traqId]);

  const perfs: number[] = [];
  for (const c of contests) {
    if (!c.start_at) continue;
    const end = new Date(c.start_at).getTime() + (c.duration_minutes ?? 0) * 60_000;
    if (now < end) continue; // 終了していないコンテストはレートに含めない
    const st = await computeStandings(c.id, mode);
    const row = st?.rows.find((r) => r.traqId === traqId);
    if (!row) continue;
    perfs.push(row.perf ?? 0);
  }
  return perfs;
};

// 全ユーザーのレートランキング1行。
export type RankingRow = {
  rank: number;
  traqId: string;
  atcoderId: string;
  rating: number;     // 確定レート（Rated参加なしは0）
  contests: number;   // レート算出に使った確定コンテスト数
};

// 登録済み全ユーザーの確定レートを降順に並べたランキングを返す。
// レートは official(source='api') のperf履歴から算出。Rated参加なしは0扱い。
export const getRanking = async (): Promise<RankingRow[]> => {
  const users = await dbAll<{ traq_id: string; atcoder_id: string }>(
    'SELECT traq_id, atcoder_id FROM users',
  );

  const rows: RankingRow[] = [];
  for (const u of users) {
    const perfs = await getUserPerfHistory(u.traq_id, 'official');
    rows.push({
      rank: 0,
      traqId: u.traq_id,
      atcoderId: u.atcoder_id,
      rating: computeRating(perfs) ?? 0,
      contests: perfs.length,
    });
  }

  // レート降順。同レートは同順位。
  rows.sort((a, b) => b.rating - a.rating);
  let rank = 0;
  let prev: number | null = null;
  rows.forEach((r, i) => {
    if (prev === null || r.rating !== prev) rank = i + 1;
    r.rank = rank;
    prev = r.rating;
  });
  return rows;
};

// プロフィール用のコンテスト成績1行（グラフ・成績表で共用）。
export type ContestHistoryRow = {
  contestId: string;
  title: string;
  date: string;              // ISO8601（コンテスト開始日時）
  rated: boolean;            // このコンテストでRated参加だったか
  rank: number;              // 順位
  participantCount: number;  // 参加者数
  perf: number;              // パフォーマンス（0完は0）
  newRating: number | null;  // Rated時のみ: このコンテスト後の累積レート
  diff: number | null;       // Rated時のみ: 前回からの変化量
};

// ユーザーが参加した「終了済み」コンテストを新しい順に返す。
// Rated参加のものだけ累積レート(newRating)と差分(diff)を持つ（AtCoder成績表と同様）。
// グラフ側は rated かつ newRating!=null の行を使う。
// mode='official' は AtCoder Problems 由来(source='api')のみ＝確定。
export const getUserContestHistory = async (
  traqId: string,
  mode: StandingsMode,
): Promise<ContestHistoryRow[]> => {
  const now = Date.now();
  const contests = await dbAll<
    {
      id: string; title: string; start_at: string | null; duration_minutes: number | null;
      contest_rated: number; part_rated: number;
    }
  >(`
    SELECT c.id, c.title, c.start_at, c.duration_minutes,
           c.rated AS contest_rated, p.rated AS part_rated
    FROM contests c JOIN participants p ON p.contest_id = c.id
    WHERE p.traq_id = ?
    ORDER BY c.start_at ASC
  `, [traqId]);

  const rows: ContestHistoryRow[] = [];
  const chronoPerfs: number[] = []; // Rated参加のperfのみ（古い→新しい）
  let prevRating = 0;
  for (const c of contests) {
    if (!c.start_at) continue;
    const end = new Date(c.start_at).getTime() + (c.duration_minutes ?? 0) * 60_000;
    if (now < end) continue; // 終了していないコンテストは成績に含めない
    const st = await computeStandings(c.id, mode);
    const row = st?.rows.find((r) => r.traqId === traqId);
    if (!row) continue;

    const ratedParticipation = c.contest_rated === 1 && c.part_rated === 1;
    const perf = row.perf ?? 0;
    let newRating: number | null = null;
    let diff: number | null = null;
    if (ratedParticipation) {
      chronoPerfs.push(perf);
      // computeRating は「最新が先頭」を期待するため逆順に渡す。
      newRating = computeRating([...chronoPerfs].reverse()) ?? 0;
      diff = newRating - prevRating;
      prevRating = newRating;
    }
    rows.push({
      contestId: c.id,
      title: c.title,
      date: c.start_at,
      rated: ratedParticipation,
      rank: row.rank,
      participantCount: st!.rows.length,
      perf,
      newRating,
      diff,
    });
  }
  rows.reverse(); // 新しい順（表の既定表示）
  return rows;
};

export default app;
