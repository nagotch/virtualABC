import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { dbGet, dbRun } from '../db';
import { getUserPerfHistory, getUserContestHistory } from './contests';
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

  // REPLACE は行を消して作り直すため allow_mention が初期化されてしまう。
  // UPSERTで atcoder_id だけ更新し、メンション設定は保持する。
  await dbRun(
    `INSERT INTO users (traq_id, atcoder_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE atcoder_id = VALUES(atcoder_id)`,
    [traqId, atcoderId],
  );

  return c.json({ ok: true, traqId, atcoderId });
});

// POST /api/users/mention  { allow: boolean }
// リマインド通知での @メンション許可フラグを更新する（要AtCoder ID登録）。
app.post('/mention', async (c) => {
  const traqId = await getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  let allow = false;
  try { allow = (await c.req.json<{ allow: boolean }>()).allow === true; } catch { /* 既定false */ }

  // users行が無い（AtCoder ID未登録）場合は設定できない。
  const exists = await dbGet<{ traq_id: string }>(
    'SELECT traq_id FROM users WHERE traq_id = ?', [traqId],
  );
  if (!exists) return c.json({ error: 'AtCoder IDの登録が必要です' }, 400);

  await dbRun(
    'UPDATE users SET allow_mention = ? WHERE traq_id = ?',
    [allow ? 1 : 0, traqId],
  );
  return c.json({ ok: true, allow });
});

// GET /api/users/rating → ログイン中ユーザーの nagotch_virtual 独自レーティング
// 参加して終了したコンテストの perf 履歴から算出する（AtCoderの実レートは使わない）。
//
// rating(確定): AtCoder Problems API 由来(source='api')の提出のみで算出。不正不可。
// predictedRating(予測): ユーザースクリプト報告も含めて算出。AtCoder反映前の暫定値。
app.get('/rating', async (c) => {
  const traqId = await getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const officialPerfs  = await getUserPerfHistory(traqId, 'official');  // 最新が先頭
  const predictedPerfs = await getUserPerfHistory(traqId, 'predicted');
  return c.json({
    rating:            computeRating(officialPerfs),
    contests:          officialPerfs.length,
    predictedRating:   computeRating(predictedPerfs),
    predictedContests: predictedPerfs.length,
  });
});

// GET /api/users/contest-history → プロフィールのグラフ・成績表用データ（確定: api由来のみ）。
// 参加した終了済みコンテストを新しい順に、順位・perf・累積レート・差分で返す。
app.get('/contest-history', async (c) => {
  const traqId = await getTraqId(getCookie(c, 'session'));
  if (!traqId) return c.json({ error: 'unauthorized' }, 401);

  const history = await getUserContestHistory(traqId, 'official');
  return c.json({ history });
});

export default app;
