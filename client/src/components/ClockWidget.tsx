import { useEffect, useState } from 'react';
import { getActiveContest, subscribeActiveContest, type ActiveContest } from '../activeContest';

const pad = (n: number): string => String(n).padStart(2, '0');

// AtCoder公式に倣い、右下に浮かせる時計。
// コンテスト中（表示中のコンテストが開催時間内）なら残り時間、それ以外は現在時刻(JST)。
export default function ClockWidget() {
  const [now, setNow] = useState(() => Date.now());
  const [active, setActive] = useState<ActiveContest | null>(getActiveContest());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => subscribeActiveContest(setActive), []);

  // コンテスト開催時間内なら残り時間(ms)を求める。
  let remainingMs: number | null = null;
  if (active?.startAt) {
    const start = new Date(active.startAt).getTime();
    const end = start + (active.durationMinutes ?? 0) * 60_000;
    if (now >= start && now < end) remainingMs = end - now;
  }

  let label: string;
  let value: string;
  let warn = false;
  if (remainingMs !== null) {
    const totalSec = Math.ceil(remainingMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    label = '残り時間';
    value = `${pad(h)}:${pad(m)}:${pad(s)}`;
    warn = remainingMs <= 5 * 60_000; // 残り5分で強調
  } else {
    label = '現在時刻';
    value = new Date(now).toLocaleTimeString('ja-JP', {
      timeZone: 'Asia/Tokyo', hour12: false,
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  const cls = `clock-widget${remainingMs !== null ? ' clock-contest' : ''}${warn ? ' clock-warn' : ''}`;
  return (
    <div className={cls} aria-live="off">
      <span className="clock-label">{label}</span>
      <span className="clock-value">{value}</span>
    </div>
  );
}
