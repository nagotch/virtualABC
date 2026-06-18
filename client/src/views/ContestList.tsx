import { useEffect, useState } from 'react';
import {
  api,
  contestStatus,
  fmtDateTime,
  modeLabel,
  type ContestStatus,
  type ContestSummary,
} from '../api';

const SECTIONS: { status: ContestStatus; label: string; emoji: string }[] = [
  { status: 'ongoing',  label: '開催中',   emoji: '🔴' },
  { status: 'upcoming', label: '開催予定', emoji: '🗓' },
  { status: 'finished', label: '終了済み', emoji: '✅' },
];

const ContestItem = ({ c }: { c: ContestSummary }) => (
  <li>
    <a href={`#/contests/${c.id}`}>
      <span className="contest-title">
        {c.title}
        {c.rated === 1 && <span className="rated-badge">Rated</span>}
      </span>
      <span className="contest-meta">
        🗓 {fmtDateTime(c.start_at)} ・ {c.duration_minutes ?? '?'}分
      </span>
      <span className="contest-meta">
        {c.problem_count}問 ・ @{c.created_by} ・ {modeLabel(c.mode)}
      </span>
    </a>
  </li>
);

export default function ContestList() {
  const [contests, setContests] = useState<ContestSummary[] | null>(null);

  useEffect(() => {
    api.listContests().then(setContests).catch(() => setContests([]));
  }, []);

  // 状態ごとに分類
  const grouped: Record<ContestStatus, ContestSummary[]> = {
    ongoing: [], upcoming: [], finished: [],
  };
  if (contests) {
    for (const c of contests) {
      grouped[contestStatus(c.start_at, c.duration_minutes)].push(c);
    }
    // 開催予定は近い順、その他は新しい順
    grouped.upcoming.sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''));
    grouped.ongoing.sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''));
    grouped.finished.sort((a, b) => (b.start_at ?? '').localeCompare(a.start_at ?? ''));
  }

  return (
    <div className="card card-wide">
      <div className="card-head">
        <h1>コンテスト一覧</h1>
        <a className="btn btn-primary btn-inline" href="#/contests/new">新規作成</a>
      </div>

      {contests === null ? (
        <p className="msg">読み込み中...</p>
      ) : contests.length === 0 ? (
        <p className="empty">まだコンテストがありません。「新規作成」から作りましょう。</p>
      ) : (
        SECTIONS.map(({ status, label, emoji }) => (
          <section key={status} className="contest-section">
            <h2 className="section-title">
              {emoji} {label} <span className="section-count">{grouped[status].length}</span>
            </h2>
            {grouped[status].length === 0 ? (
              <p className="section-empty">なし</p>
            ) : (
              <ul className="contest-list">
                {grouped[status].map((c) => <ContestItem key={c.id} c={c} />)}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
