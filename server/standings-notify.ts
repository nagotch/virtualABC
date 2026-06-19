// コンテスト終了後、確定順位表をtraQへMarkdownで通知する。
// AtCoder Problems のクロール反映を待つため、終了から一定時間後に確定順位で通知し、
// contests.standings_notified フラグで二重送信を防ぐ。

import { dbAll, dbRun } from './db';
import { computeStandings, type Standings } from './routes/contests';
import { postNotification } from './notify';

const NOTIFY_DELAY_MS = 30 * 60 * 1000; // 終了30分後（AtCoder Problems反映待ち）
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

// 秒数を H:MM:SS / M:SS 表記に
const fmtDuration = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

// 確定順位表をMarkdownテーブルに整形する。
export const buildStandingsMarkdown = (s: Standings): string => {
  const letters = s.problems.map((_, i) => String.fromCharCode(65 + i));
  const header = ['順位', '参加者', '得点', ...letters, 'perf'];
  const align = [':--:', ':--', '--:', ...letters.map(() => ':--:'), '--:'];

  const lines: string[] = [
    `## :trophy: コンテスト結果発表: ${s.contest.title}`,
    '',
    '確定順位（AtCoder Problems のデータに基づく集計）',
    '',
    `| ${header.join(' | ')} |`,
    `| ${align.join(' | ')} |`,
  ];

  for (const r of s.rows) {
    const cells: string[] = [
      String(r.rank),
      // :@id: はtraQのスタンプ記法。メンションを飛ばさずアイコンのみ表示される。
      `:@${r.traqId}:${r.rated ? '' : ' (Open)'}`,
      r.score > 0 ? `${r.score} (${fmtDuration(r.penaltySeconds)})` : '0',
    ];
    for (const p of s.problems) {
      const res = r.problems[p.problem_id];
      if (res?.solved) cells.push(`${p.points}${res.penalties > 0 ? ` (${res.penalties})` : ''}`);
      else if (res && res.penalties > 0) cells.push(`(${res.penalties})`);
      else cells.push('');
    }
    cells.push(r.perf === null ? '-' : String(r.perf));
    lines.push(`| ${cells.join(' | ')} |`);
  }

  lines.push('', `:link: ${APP_URL}/#/contests/${s.contest.id}`);
  return lines.join('\n');
};

let running = false;

// 終了済み・未通知・通知タイミングを過ぎたコンテストを通知する。
export const notifyFinishedContestsOnce = async (): Promise<void> => {
  if (running) return; // 多重起動防止
  running = true;
  try {
    const now = Date.now();
    const contests = await dbAll<{ id: string; start_at: string | null; duration_minutes: number | null }>(
      'SELECT id, start_at, duration_minutes FROM contests WHERE standings_notified = 0',
    );

    for (const c of contests) {
      if (!c.start_at) continue;
      const end = new Date(c.start_at).getTime() + (c.duration_minutes ?? 0) * 60_000;
      if (now < end + NOTIFY_DELAY_MS) continue; // まだ通知タイミングでない

      const standings = await computeStandings(c.id, 'official');
      // コンテストが消えている／参加者がいない場合は通知せず、通知済みにして以後スキップ。
      if (!standings || standings.rows.length === 0) {
        await dbRun('UPDATE contests SET standings_notified = 1 WHERE id = ?', [c.id]);
        continue;
      }

      const ok = await postNotification(buildStandingsMarkdown(standings));
      if (ok) {
        await dbRun('UPDATE contests SET standings_notified = 1 WHERE id = ?', [c.id]);
        console.log(`[standings-notify] notified standings for contest ${c.id}`);
      }
      // 投稿失敗(ok=false)時はフラグを立てず、次回の点検で再試行する。
    }
  } catch (e) {
    console.error('[standings-notify] error:', e);
  } finally {
    running = false;
  }
};
