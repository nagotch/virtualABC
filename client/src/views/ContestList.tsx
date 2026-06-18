import { useEffect, useState } from 'react';
import { api, fmtDateTime, type ContestSummary } from '../api';

export default function ContestList() {
  const [contests, setContests] = useState<ContestSummary[] | null>(null);

  useEffect(() => {
    api.listContests().then(setContests).catch(() => setContests([]));
  }, []);

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
        <ul className="contest-list">
          {contests.map((c) => (
            <li key={c.id}>
              <a href={`#/contests/${c.id}`}>
                <span className="contest-title">{c.title}</span>
                <span className="contest-meta">
                  🗓 {fmtDateTime(c.start_at)} ・ {c.duration_minutes ?? '?'}分
                </span>
                <span className="contest-meta">
                  {c.problem_count}問 ・ @{c.created_by} ・ {c.mode === 'random' ? 'ランダム' : '色指定'}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
