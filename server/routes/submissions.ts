import { Hono } from 'hono';
import db from '../db';
import { invalidateStandingsForAtcoder } from './contests';

const app = new Hono();

type ReportBody = {
  submissionId: number;
  problemId: string;
  result: string;
  epochSecond: number;
};

// POST /api/submissions → ユーザースクリプトからの提出報告
// 認証はヘッダ X-VABC-Token（マイページで取得したトークン）。
// 報告者のAtCoder IDはトークンから引くので、なりすまし不可。
app.post('/', async (c) => {
  const token = c.req.header('X-VABC-Token');
  if (!token) return c.json({ error: 'missing token' }, 401);

  const user = db.query<{ traq_id: string; atcoder_id: string }, [string]>(
    'SELECT traq_id, atcoder_id FROM users WHERE api_token = ?',
  ).get(token);
  if (!user?.atcoder_id) return c.json({ error: 'invalid token' }, 401);

  let body: ReportBody;
  try {
    body = await c.req.json<ReportBody>();
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }

  const submissionId = Math.floor(Number(body.submissionId));
  const epochSecond = Math.floor(Number(body.epochSecond));
  if (!Number.isFinite(submissionId) || !body.problemId || !body.result || !Number.isFinite(epochSecond)) {
    return c.json({ error: 'invalid fields' }, 400);
  }

  db.run(
    `INSERT OR REPLACE INTO reported_submissions
       (submission_id, atcoder_id, problem_id, result, epoch_second)
     VALUES (?, ?, ?, ?, ?)`,
    [submissionId, user.atcoder_id, body.problemId, body.result, epochSecond],
  );

  // この人が関係する順位表キャッシュを無効化
  invalidateStandingsForAtcoder(user.atcoder_id);

  return c.json({ ok: true });
});

export default app;
