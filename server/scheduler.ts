// 定期コンテストのスケジューラ。
// recurring_contests の各設定について、開始の前日（24h前）になったら
// その回のコンテスト実体を自動生成する。生成済みは recurring_id + start_at で
// 重複しないよう冪等にする。時刻はすべて JST 基準で扱う。

import db from './db';
import { generateByColor, generateRandom, type ColorKey } from './atcoder';
import { createContest } from './contests-core';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;   // 5分ごとに点検
const FIRST_DELAY_MS = 20 * 1000;          // 起動20秒後に初回
const LEAD_MS = 24 * 60 * 60 * 1000;       // 開始の24h前（＝前日）に生成
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;  // JST = UTC+9（DSTなし）

type Rule = {
  id: string;
  title: string;
  freq: 'daily' | 'weekly';
  weekday: number | null;
  hour: number;
  minute: number;
  duration_minutes: number;
  mode: 'random' | 'color';
  count: number | null;
  color_spec: string | null;
  rated: number;
  created_by: string;
};

// 次に生成すべき回の開始時刻(UTC ms)を列挙する。
// LEADが24hなので、今日・明日・明後日(JST)を見れば窓内の回を漏れなく拾える。
const occurrencesWithin = (rule: Rule, now: number): number[] => {
  const nowJst = new Date(now + JST_OFFSET_MS);
  const y = nowJst.getUTCFullYear();
  const mo = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();

  const result: number[] = [];
  for (let off = 0; off <= 2; off++) {
    // JSTの該当日 hour:minute を UTC ms に変換（Date.UTCが日付繰り上げを処理）
    const startUtc = Date.UTC(y, mo, d + off, rule.hour, rule.minute) - JST_OFFSET_MS;
    const dow = new Date(startUtc + JST_OFFSET_MS).getUTCDay();
    if (rule.freq === 'weekly' && dow !== rule.weekday) continue;
    if (startUtc >= now && startUtc <= now + LEAD_MS) result.push(startUtc);
  }
  return result;
};

// JSTの月/日表記（タイトル付与用）
const fmtJstDate = (utcMs: number): string => {
  const d = new Date(utcMs + JST_OFFSET_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

const existsStmt = db.query<{ id: string }, [string, string]>(
  'SELECT id FROM contests WHERE recurring_id = ? AND start_at = ?',
);

let running = false;

export const scheduleTick = async (): Promise<void> => {
  if (running) return; // 多重起動防止
  running = true;
  try {
    const now = Date.now();
    const rules = db.query<Rule, []>(
      `SELECT id, title, freq, weekday, hour, minute, duration_minutes, mode, count, color_spec, rated, created_by
       FROM recurring_contests WHERE enabled = 1`,
    ).all();

    for (const rule of rules) {
      for (const startUtc of occurrencesWithin(rule, now)) {
        const startIso = new Date(startUtc).toISOString();
        if (existsStmt.get(rule.id, startIso)) continue; // 生成済み

        try {
          const problems = rule.mode === 'random'
            ? await generateRandom(Math.min(Math.max(rule.count ?? 6, 1), 12))
            : await generateByColor(JSON.parse(rule.color_spec ?? '{}') as Partial<Record<ColorKey, number>>);
          if (problems.length === 0) {
            console.warn(`[scheduler] no problems generated for recurring ${rule.id}; skip`);
            continue;
          }
          const title = `${rule.title}（${fmtJstDate(startUtc)}）`.slice(0, 100);
          createContest({
            title,
            mode: rule.mode,
            problems,
            startAtIso: startIso,
            durationMinutes: rule.duration_minutes,
            createdBy: rule.created_by,
            recurringId: rule.id,
            rated: rule.rated === 1,
          });
          console.log(`[scheduler] created contest for recurring ${rule.id} starting ${startIso}`);
        } catch (e) {
          console.error(`[scheduler] failed to create contest for recurring ${rule.id}:`, e);
        }
      }
    }
  } catch (e) {
    console.error('[scheduler] tick error:', e);
  } finally {
    running = false;
  }
};

export const startScheduler = (): void => {
  const loop = async () => {
    await scheduleTick();
    setTimeout(loop, CHECK_INTERVAL_MS); // 完了後に次回を予約
  };
  setTimeout(loop, FIRST_DELAY_MS);
  console.log('[scheduler] recurring-contest scheduler started');
};
