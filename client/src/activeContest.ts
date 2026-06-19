// 現在表示中のコンテストの開催時刻を保持する超軽量ストア。
// ContestDetail が表示中のコンテストをセットし、ClockWidget が購読して
// 「コンテスト中なら残り時間／それ以外は現在時刻」を表示する。

export type ActiveContest = {
  startAt: string | null;        // ISO8601
  durationMinutes: number | null;
};

let active: ActiveContest | null = null;
const listeners = new Set<(v: ActiveContest | null) => void>();

export const setActiveContest = (v: ActiveContest | null): void => {
  active = v;
  for (const l of listeners) l(active);
};

export const getActiveContest = (): ActiveContest | null => active;

export const subscribeActiveContest = (l: (v: ActiveContest | null) => void): (() => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
