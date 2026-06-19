// コンテスト開始前のリマインドをtraQへ送る。
// 開始の REMIND_LEAD_MS 前〜開始までの間に1回だけ通知し、contests.reminder_sent で
// 二重送信を防ぐ。参加者は users.allow_mention に応じて @メンション or 名前のみで表示する。

import { dbAll, dbRun } from './db';
import { postNotification } from './notify';

const REMIND_LEAD_MS = 30 * 60 * 1000;     // 開始30分前にリマインド
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

// 日時をJST表記に
const fmtJst = (iso: string): string =>
  new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short',
  });

type Contest = { id: string; title: string; start_at: string | null; duration_minutes: number | null };
type Participant = { traq_id: string; allow_mention: number };

export const buildReminderMarkdown = (c: Contest, startMs: number, parts: Participant[]): string => {
  const minutesLeft = Math.max(0, Math.round((startMs - Date.now()) / 60_000));
  const lines: string[] = [
    `## :alarm_clock: まもなく開始: ${c.title}`,
    '',
    `- :calendar: 開始: **${fmtJst(c.start_at as string)}**（あと約${minutesLeft}分）`,
    `- :hourglass: 実施時間: **${c.duration_minutes ?? 0}分**`,
  ];

  if (parts.length === 0) {
    lines.push('', 'まだ参加者がいません。ぜひ参加してね！');
  } else {
    // allow_mention=1 は @メンション（通知が飛ぶ）、それ以外は名前のみ（通知なし）。
    const names = parts.map((p) => (p.allow_mention === 1 ? `@${p.traq_id}` : p.traq_id));
    lines.push('', `:busts_in_silhouette: 参加者(${parts.length}): ${names.join('  ')}`);
  }

  lines.push('', `:link: ${APP_URL}/#/contests/${c.id}`);
  return lines.join('\n');
};

let running = false;

// 開始前リマインドの送信対象を点検して通知する。
export const remindUpcomingContestsOnce = async (): Promise<void> => {
  if (running) return; // 多重起動防止
  running = true;
  try {
    const now = Date.now();
    const contests = await dbAll<Contest>(
      'SELECT id, title, start_at, duration_minutes FROM contests WHERE reminder_sent = 0',
    );

    for (const c of contests) {
      if (!c.start_at) continue;
      const start = new Date(c.start_at).getTime();
      // 窓: [開始-LEAD, 開始)。開始済みは送信機会を逃したものとして送らず既読化する。
      if (now >= start) {
        await dbRun('UPDATE contests SET reminder_sent = 1 WHERE id = ?', [c.id]);
        continue;
      }
      if (now < start - REMIND_LEAD_MS) continue; // まだリマインド時刻でない

      const parts = await dbAll<Participant>(
        `SELECT p.traq_id, COALESCE(u.allow_mention, 0) AS allow_mention
           FROM participants p LEFT JOIN users u ON u.traq_id = p.traq_id
          WHERE p.contest_id = ?`,
        [c.id],
      );

      const ok = await postNotification(buildReminderMarkdown(c, start, parts));
      if (ok) {
        await dbRun('UPDATE contests SET reminder_sent = 1 WHERE id = ?', [c.id]);
        console.log(`[reminder] sent reminder for contest ${c.id}`);
      }
      // 投稿失敗(ok=false)時はフラグを立てず、次回の点検で再試行する。
    }
  } catch (e) {
    console.error('[reminder] error:', e);
  } finally {
    running = false;
  }
};
