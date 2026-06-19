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

  await dbRun(
    `REPLACE INTO reported_submissions
       (submission_id, atcoder_id, problem_id, result, epoch_second)
     VALUES (?, ?, ?, ?, ?)`,
    [submissionId, atcoderId, body.problemId, body.result, epochSecond],
  );

  // このAtCoder IDが関係する順位表キャッシュを無効化
  await invalidateStandingsForAtcoder(atcoderId);

  return c.json({ ok: true });
});

export default app;
