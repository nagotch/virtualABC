// コンテスト実体（contests + contest_problems）の生成ロジック。
// 手動作成(routes/contests.ts)と定期生成(scheduler.ts)で共有する。

import db from './db';
import type { GeneratedProblem } from './atcoder';
import { notifyContestCreated } from './notify';

export const randomId = (): string => {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
};

const insertContest = db.prepare(
  'INSERT INTO contests (id, title, mode, created_by, start_at, duration_minutes, recurring_id, rated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
const insertProblem = db.prepare(
  `INSERT INTO contest_problems
     (contest_id, idx, problem_id, atcoder_contest, problem_index, title, difficulty, color, url, points)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

export type NewContest = {
  title: string;
  mode: string;                  // 'random' | 'color' | 'manual'
  problems: GeneratedProblem[];
  startAtIso: string;            // ISO8601 (UTC)
  durationMinutes: number;
  createdBy: string;             // traq_id
  recurringId?: string | null;   // 定期生成のときは設定ID
  rated?: boolean;               // レート変動の有無（既定false）
};

// コンテストと問題セットを保存し、traQへ通知する（通知はベストエフォート）。生成IDを返す。
export const createContest = (n: NewContest): string => {
  const id = randomId();
  const tx = db.transaction(() => {
    insertContest.run(id, n.title, n.mode, n.createdBy, n.startAtIso, n.durationMinutes, n.recurringId ?? null, n.rated ? 1 : 0);
    n.problems.forEach((p, i) => {
      insertProblem.run(
        id, i, p.id, p.contest_id, p.problem_index, p.title, p.difficulty, p.color, p.url,
        (i + 1) * 100, // 配点: A=100, B=200, ...
      );
    });
  });
  tx();

  void notifyContestCreated({
    id,
    title: n.title,
    startAt: n.startAtIso,
    durationMinutes: n.durationMinutes,
    problemCount: n.problems.length,
    createdBy: n.createdBy,
  });

  return id;
};
