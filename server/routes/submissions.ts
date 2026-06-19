import { Hono } from 'hono';
import { dbAll, dbRun } from '../db';
import { invalidateStandingsForAtcoder } from './contests';

const app = new Hono();

// AtCoderの最終ジャッジ結果のみ受け付ける（未知の値は弾く）。
const FINAL_VERDICTS = new Set(['AC', 'WA', 'RE', 'TLE', 'MLE', 'CE', 'OLE', 'IE', 'WR']);

type ReportBody = {
  atcoderId: string;
  submissionId: number;
  problemId: string;
  result: string;
  epochSecond: number;
};

// 報告された問題が「現在開催中のコンテスト」に含まれ、提出時刻がその開催時間内かを検証する。
// 開催中でない問題・時間外の報告は保存しない（予測データの汚染・水増しを防ぐ）。
const isWithinActiveContest = async (problemId: string, epochSecond: number): Promise<boolean> => {
  const rows = await dbAll<{ start_at: string | null; duration_minutes: number | null }>(
    `SELECT c.start_at, c.duration_minutes
       FROM contests c JOIN contest_problems p ON p.contest_id = c.id
      WHERE p.problem_id = ?`,
    [problemId],
  );
  const now = Date.now();
  return rows.some((r) => {
    if (!r.start_at) return false;
    const start = new Date(r.start_at).getTime();
    const end = start + (r.duration_minutes ?? 0) * 60_000;
    const startUnix = Math.floor(start / 1000);
    const endUnix = Math.floor(end / 1000);
    return now >= start && now < end && epochSecond >= startUnix && epochSecond <= endUnix;
  });
};

// POST /api/submissions → ユーザースクリプトからの提出報告
// ユーザースクリプトは AtCoder のログイン中ハンドルをページから読み取り、
// atcoderId として送る（トークン不要）。
//
// ⚠️ この経路は誰でも任意の結果を送れるため信頼できない（不正可能）。
// よって source='script' として保存し、あくまで「予測順位/予測レート」にのみ使う。
// 確定順位・確定レートは AtCoder Problems API 由来(source='api')のみで算出する。
app.post('/', async (c) => {
  let body: ReportBody;
  try {
    body = await c.req.json<ReportBody>();
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }

  const atcoderId = (body.atcoderId ?? '').trim();
  const submissionId = Math.floor(Number(body.submissionId));
  const epochSecond = Math.floor(Number(body.epochSecond));
  if (!atcoderId || !Number.isFinite(submissionId) || !body.problemId || !body.result || !Number.isFinite(epochSecond)) {
    return c.json({ error: 'invalid fields' }, 400);
  }

  // 既知の最終ジャッジ結果以外は拒否する。
  if (!FINAL_VERDICTS.has(body.result)) {
    return c.json({ error: 'invalid result' }, 400);
  }

  // 開催中コンテストの対象問題・開催時間内の報告のみ受け付ける（不正・水増し対策）。
  if (!(await isWithinActiveContest(body.problemId, epochSecond))) {
    return c.json({ error: 'not an active contest problem or out of window' }, 400);
  }

  // source='script' で保存。ただし既に AtCoder Problems 由来(source='api')の
  // 確定データがある提出は決して上書きしない（信頼データを汚染させない）。
  await dbRun(
    `INSERT INTO reported_submissions
       (submission_id, atcoder_id, problem_id, result, epoch_second, source)
     VALUES (?, ?, ?, ?, ?, 'script')
     ON DUPLICATE KEY UPDATE
       atcoder_id   = IF(source = 'api', atcoder_id, VALUES(atcoder_id)),
       problem_id   = IF(source = 'api', problem_id, VALUES(problem_id)),
       result       = IF(source = 'api', result, VALUES(result)),
       epoch_second = IF(source = 'api', epoch_second, VALUES(epoch_second))`,
    [submissionId, atcoderId, body.problemId, body.result, epochSecond],
  );

  // このAtCoder IDが関係する順位表キャッシュを無効化
  await invalidateStandingsForAtcoder(atcoderId);

  return c.json({ ok: true });
});

export default app;
