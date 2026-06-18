import { useEffect, useState } from 'react';
import { api, colorHex, colorLabel, type ContestDetail as Detail } from '../api';

export default function ContestDetail({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.getContest(id).then((d) => {
      if (d) setData(d);
      else setNotFound(true);
    });
  }, [id]);

  if (notFound) {
    return (
      <div className="card">
        <h1>コンテストが見つかりません</h1>
        <a className="btn btn-ghost" href="#/contests">一覧へ戻る</a>
      </div>
    );
  }

  if (!data) return <div className="card"><p className="msg">読み込み中...</p></div>;

  return (
    <div className="card card-wide">
      <div className="card-head">
        <h1>{data.contest.title}</h1>
        <a className="btn btn-ghost btn-inline" href="#/contests">一覧</a>
      </div>
      <p className="hint">
        作成: @{data.contest.created_by} ・ {data.contest.mode === 'random' ? 'ランダム' : '色指定'}
      </p>

      <table className="problem-table">
        <thead>
          <tr>
            <th>#</th>
            <th>問題</th>
            <th>難易度</th>
          </tr>
        </thead>
        <tbody>
          {data.problems.map((p, i) => (
            <tr key={p.problem_id}>
              <td className="pt-idx">{String.fromCharCode(65 + i)}</td>
              <td>
                <a href={p.url} target="_blank" rel="noreferrer" className="pt-link">
                  {p.title}
                </a>
                <span className="pt-src">{p.atcoder_contest} {p.problem_index}</span>
              </td>
              <td>
                {p.difficulty === null ? (
                  <span className="badge unset">不明</span>
                ) : (
                  <span className="diff-badge" style={{ color: colorHex(p.color) }}>
                    <span className="color-dot" style={{ background: colorHex(p.color) }} />
                    {p.difficulty}（{colorLabel(p.color)}）
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
