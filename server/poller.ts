// AtCoder Problems API の定期ポーリング。
// ユーザースクリプトからの報告とは別に、参加者の提出を定期取得して
// reported_submissions に取り込む。これによりスクリプト未導入でも、
// （AtCoder Problemsのクロール後）いずれ順位表・perf・レートに反映される。

import { dbAll, dbRun } from './db';
import { fetchUserSubmissions } from './atcoder';
import { invalidateStandingsForAtcoder } from './routes/contests';

const POLL_INTERVAL_MS = 3 * 60 * 1000;  // 3分ごと
const FIRST_DELAY_MS = 15 * 1000;        // 起動15秒後に初回
const GRACE_MS = 24 * 60 * 60 * 1000;    // 終了後24hまでは取り込み続ける（遅延クロール対策）
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let running = false;

export const pollOnce = async (): Promise<void> => {
  if (running) return; // 多重起動防止
  running = true;
  try {
    const now = Date.now();
    const contests = await dbAll<
      { id: string; start_at: string | null; duration_minutes: number | null }
    >('SELECT id, start_at, duration_minutes FROM contests');

    for (const c of contests) {
      if (!c.start_at) continue;
      const start = new Date(c.start_at).getTime();
      const end = start + (c.duration_minutes ?? 0) * 60_000;
      // 開始前は不要、終了後24h以降も不要（開催中〜終了直後を対象）
      if (now < start || now > end + GRACE_MS) continue;

      const startUnix = Math.floor(start / 1000);
      const endUnix = Math.floor(end / 1000);
      const problemIds = new Set(
        (await dbAll<{ problem_id: string }>(
          'SELECT problem_id FROM contest_problems WHERE contest_id = ?', [c.id],
        )).map((r) => r.problem_id),
      );
      const participants = await dbAll<{ atcoder_id: string }>(
        'SELECT atcoder_id FROM participants WHERE contest_id = ?', [c.id],
      );

      for (const part of participants) {
        let subs: Awaited<ReturnType<typeof fetchUserSubmissions>> = [];
        try {
          subs = await fetchUserSubmissions(part.atcoder_id, startUnix);
        } catch (e) {
          console.error(`[poller] fetch failed for ${part.atcoder_id}:`, e);
          await sleep(1000);
          continue;
        }
        let changed = 0;
        for (const s of subs) {
          if (s.epoch_second > endUnix) continue;
          if (!problemIds.has(s.problem_id)) continue;
          // AtCoder Problems 由来は信頼できる確定データ。
          // REPLACE で source='api' を書き込み、スクリプト報告(予測)を常に上書きする。
          await dbRun(
            `REPLACE INTO reported_submissions
               (submission_id, atcoder_id, problem_id, result, epoch_second, source)
             VALUES (?, ?, ?, ?, ?, 'api')`,
            [s.id, part.atcoder_id, s.problem_id, s.result, s.epoch_second],
          );
          changed++;
        }
        if (changed > 0) await invalidateStandingsForAtcoder(part.atcoder_id);
        await sleep(1000); // レート制限への配慮（参加者ごとに1秒空ける）
      }
    }
  } catch (e) {
    console.error('[poller] poll error:', e);
  } finally {
    running = false;
  }
};

export const startPoller = (): void => {
  const loop = async () => {
    await pollOnce();
    setTimeout(loop, POLL_INTERVAL_MS); // 完了後に次回を予約
  };
  setTimeout(loop, FIRST_DELAY_MS);
  console.log('[poller] AtCoder Problems polling scheduled');
};
