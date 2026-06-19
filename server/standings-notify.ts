// コンテスト終了後、順位表をtraQへMarkdownで2段階に通知する。
//  1) 終了30分後: 暫定順位（api + script 両方 = predicted）。スクリプト報告を含む速報。
//     AtCoder Problems のクロール反映は12〜24時間かかることがあり、30分時点ではapiに
//     ほとんど取り込めていないため、script報告で埋めた「仮」の順位として出す。
//  2) 終了24時間後: 確定順位（apiのみ = official）。AtCoder Problemsの確定データで再集計。
// それぞれ standings_notified / final_notified フラグで二重送信を防ぐ。

import { dbAll, dbRun } from './db';
import { computeStandings, type Standings } from './routes/contests';
import { postNotification } from './notify';

const PROVISIONAL_DELAY_MS = 30 * 60 * 1000;      // 終了30分後（暫定・api+script）
const FINAL_DELAY_MS = 24 * 60 * 60 * 1000;       // 終了24時間後（確定・apiのみ）
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

// 秒数を H:MM:SS / M:SS 表記に
const fmtDuration = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

// 順位表をMarkdownテーブルに整形する。
// final=true なら確定（apiのみ）、false なら暫定（api+script）の見出しにする。
export const buildStandingsMarkdown = (s: Standings, final: boolean): string => {
  const letters = s.problems.map((_, i) => String.fromCharCode(65 + i));
  const header = ['順位', '参加者', '得点', ...letters, 'perf'];
  const align = [':--:', ':--', '--:', ...letters.map(() => ':--:'), '--:'];

  const heading = final
    ? `## :trophy: コンテスト結果発表: ${s.contest.title}`
    : `## :hourglass_flowing_sand: 暫定結果速報: ${s.contest.title}`;
  const caption = final
    ? '確定順位（AtCoder Problems のデータに基づく集計）'
    : '暫定順位（リアルタイム報告を含む速報・確定前）。確定順位は約24時間後に発表します。';

  const lines: string[] = [
    heading,
    '',
    caption,
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

// 終了済みコンテストについて、暫定(30分後)・確定(24時間後)の通知を段階的に送る。
export const notifyFinishedContestsOnce = async (): Promise<void> => {
  if (running) return; // 多重起動防止
  running = true;
  try {
    const now = Date.now();
    const contests = await dbAll<{
      id: string; start_at: string | null; duration_minutes: number | null;
      standings_notified: number; final_notified: number;
    }>(
      `SELECT id, start_at, duration_minutes, standings_notified, final_notified
       FROM contests WHERE standings_notified = 0 OR final_notified = 0`,
    );

    for (const c of contests) {
      if (!c.start_at) continue;
      const end = new Date(c.start_at).getTime() + (c.duration_minutes ?? 0) * 60_000;

      // 1) 暫定通知（終了30分後・api+script）
      if (c.standings_notified === 0 && now >= end + PROVISIONAL_DELAY_MS) {
        const s = await computeStandings(c.id, 'predicted');
        if (!s || s.rows.length === 0) {
          // 参加者・提出がまだ無ければ送らず、暫定は送信済み扱いにして以後スキップ。
          await dbRun('UPDATE contests SET standings_notified = 1 WHERE id = ?', [c.id]);
        } else if (await postNotification(buildStandingsMarkdown(s, false))) {
          await dbRun('UPDATE contests SET standings_notified = 1 WHERE id = ?', [c.id]);
          console.log(`[standings-notify] provisional standings for contest ${c.id}`);
        }
        // 投稿失敗時はフラグを立てず、次回の点検で再試行する。
      }

      // 2) 確定通知（終了24時間後・apiのみ）
      if (c.final_notified === 0 && now >= end + FINAL_DELAY_MS) {
        const s = await computeStandings(c.id, 'official');
        if (!s || s.rows.length === 0) {
          await dbRun('UPDATE contests SET final_notified = 1 WHERE id = ?', [c.id]);
        } else if (await postNotification(buildStandingsMarkdown(s, true))) {
          await dbRun('UPDATE contests SET final_notified = 1 WHERE id = ?', [c.id]);
          console.log(`[standings-notify] final standings for contest ${c.id}`);
        }
      }
    }
  } catch (e) {
    console.error('[standings-notify] error:', e);
  } finally {
    running = false;
  }
};
