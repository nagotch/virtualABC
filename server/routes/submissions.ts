import { Hono } from 'hono';
import { dbRun } from '../db';
import { invalidateStandingsForAtcoder } from './contests';

const app = new Hono();

type ReportBody = {
  atcoderId: string;
  submissionId: number;
  problemId: string;
  result: string;
  epochSecond: number;
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
